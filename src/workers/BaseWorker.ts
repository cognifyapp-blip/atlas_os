/**
 * Atlas OS — BaseWorker
 *
 * Abstract base class for all Atlas background workers.
 * Handles the full job lifecycle:
 *
 *   Receive Job → Validate → Execute → Log → Update Metrics → Complete/Retry/Fail
 *
 * Every worker extends this and implements `process()`.
 * No duplicated lifecycle code across workers.
 */

import { Worker, type Job, type Processor } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { WorkerFactory } from '../infrastructure/queue/WorkerFactory.js';
import type { QueueName, AtlasJobPayload, JobResult } from '../infrastructure/queue/types.js';
import { AuditLog } from '../infrastructure/audit/AuditLog.js';

// ─── Worker Metrics ────────────────────────────────────────────────────────────

export interface WorkerMetrics {
  workerName: string;
  queue: QueueName;
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  totalDurationMs: number;
  averageDurationMs: number;
  lastJobAt: string | null;
  lastError: string | null;
  running: boolean;
}

// ─── Structured Log Entry ─────────────────────────────────────────────────────

interface WorkerLogEntry {
  level: 'info' | 'warn' | 'error';
  worker: string;
  queue: QueueName;
  jobId: string | undefined;
  jobName: string;
  organizationId: string;
  userId: string;
  correlationId: string;
  durationMs?: number;
  success?: boolean;
  retryCount?: number;
  error?: string;
  ts: string;
}

// ─── BaseWorker ───────────────────────────────────────────────────────────────

export abstract class BaseWorker<
  TPayload extends AtlasJobPayload = AtlasJobPayload,
  TResult = unknown,
> {
  protected readonly workerName: string;
  protected readonly queueName: QueueName;

  private _worker: Worker<TPayload, JobResult<TResult>> | null = null;

  private _metrics: WorkerMetrics;

  constructor(workerName: string, queueName: QueueName) {
    this.workerName = workerName;
    this.queueName = queueName;

    this._metrics = {
      workerName,
      queue: queueName,
      processed: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      totalDurationMs: 0,
      averageDurationMs: 0,
      lastJobAt: null,
      lastError: null,
      running: false,
    };
  }

  /**
   * Start the worker — registers processor and attaches lifecycle hooks.
   */
  start(): void {
    if (this._worker) {
      console.warn(`[${this.workerName}] Already running.`);
      return;
    }

    const processor: Processor<TPayload, JobResult<TResult>> = async (job) => {
      return this._runJob(job);
    };

    this._worker = WorkerFactory.create<TPayload, JobResult<TResult>>(
      this.queueName,
      processor,
    );

    // Attach worker-level event hooks
    this._worker.on('active', (job) => {
      this._log('info', job, 'Job started');
    });

    this._worker.on('completed', (job, result) => {
      if (result?.success) {
        this._metrics.succeeded++;
      }
    });

    this._worker.on('failed', (job, err) => {
      this._metrics.failed++;
      this._metrics.lastError = err?.message ?? 'Unknown error';
      if (job) {
        this._log('error', job, 'Job failed permanently', { error: err?.message });
      }
    });

    this._worker.on('error', (err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          worker: this.workerName,
          event: 'worker.error',
          error: err.message,
          ts: new Date().toISOString(),
        }),
      );
    });

    this._worker.run(); // Start processing
    this._metrics.running = true;

    console.log(`[${this.workerName}] Started on queue "${this.queueName}".`);
  }

  /**
   * Gracefully stop the worker.
   * Waits for the current job (if any) to finish before closing.
   */
  async stop(): Promise<void> {
    if (!this._worker) return;

    console.log(`[${this.workerName}] Stopping…`);
    await this._worker.close();
    this._worker = null;
    this._metrics.running = false;

    console.log(`[${this.workerName}] Stopped.`);
  }

  /**
   * Return a snapshot of this worker's metrics.
   */
  getMetrics(): WorkerMetrics {
    return { ...this._metrics };
  }

  isRunning(): boolean {
    return this._metrics.running;
  }

  // ─── Abstract interface ────────────────────────────────────────────────────

  /**
   * Validate the job payload before processing.
   * Throw an Error to reject the job immediately (no retry).
   */
  protected abstract validate(payload: TPayload): void;

  /**
   * Execute the job.
   * Return the result data; throw to trigger a retry.
   */
  protected abstract process(
    payload: TPayload,
    job: Job<TPayload, JobResult<TResult>>,
  ): Promise<TResult>;

  // ─── Lifecycle ────────────────────────────────────────────────────────────

  private async _runJob(
    job: Job<TPayload, JobResult<TResult>>,
  ): Promise<JobResult<TResult>> {
    const start = Date.now();
    const payload = job.data;

    this._metrics.processed++;
    this._metrics.lastJobAt = new Date().toISOString();

    if (job.attemptsMade > 0) {
      this._metrics.retried++;
    }

    // ── Audit: transition queued → started ──────────────────────────────────
    const auditId = payload.correlationId;
    // If a 'queued' entry exists (written at enqueue time), promote it to 'started'.
    // If not (e.g. job was enqueued before this version), append a fresh entry.
    const existing = AuditLog.recent(1000).find(
      (e) => e.correlationId === auditId && e.status === 'queued',
    );
    if (existing) {
      AuditLog.update(auditId, {
        status: 'started',
        worker: this.workerName,
        startedAt: new Date().toISOString(),
        retryCount: job.attemptsMade,
      });
    } else {
      AuditLog.append({
        id: uuidv4(),
        ts: new Date().toISOString(),
        organizationId: payload.organizationId,
        userId: payload.userId,
        correlationId: auditId,
        jobId: job.id,
        jobName: job.name,
        queue: this.queueName,
        worker: this.workerName,
        executiveId: (payload as any).executiveId ?? (payload as any).context?.executiveId,
        executiveName: (payload as any).executiveName ?? (payload as any).context?.executiveName,
        status: 'started',
        startedAt: new Date().toISOString(),
        retryCount: job.attemptsMade,
      });
    }

    try {
      // Step 1: Validate
      this.validate(payload);

      // Step 2: Execute
      const data = await this.process(payload, job);
      const durationMs = Date.now() - start;

      // Step 3: Update metrics
      this._metrics.totalDurationMs += durationMs;
      this._metrics.averageDurationMs =
        this._metrics.totalDurationMs / this._metrics.processed;

      // Step 4: Log success
      this._log('info', job, 'Job completed', { durationMs, success: true });

      // ── Audit: record completion ───────────────────────────────────────────
      const resultData = data as any;
      AuditLog.update(auditId, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        durationMs,
        tokensUsed: resultData?.tokensUsed,
        costUsd: resultData?.costUsd,
      });

      return {
        success: true,
        data,
        durationMs,
        completedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      const durationMs = Date.now() - start;
      this._metrics.totalDurationMs += durationMs;
      this._metrics.averageDurationMs =
        this._metrics.totalDurationMs / this._metrics.processed;

      // Log the failure — the worker itself doesn't crash
      this._log('error', job, 'Job execution error', {
        durationMs,
        success: false,
        error: err.message,
        retryCount: job.attemptsMade,
      });

      // ── Audit: record failure ─────────────────────────────────────────────
      AuditLog.update(auditId, {
        status: 'failed',
        completedAt: new Date().toISOString(),
        durationMs,
        error: err.message,
        retryCount: job.attemptsMade,
      });

      // Re-throw so BullMQ handles retry/fail logic
      throw err;
    }
  }

  private _log(
    level: WorkerLogEntry['level'],
    job: Job<TPayload>,
    message: string,
    extra: Partial<WorkerLogEntry> = {},
  ): void {
    const entry: WorkerLogEntry = {
      level,
      worker: this.workerName,
      queue: this.queueName,
      jobId: job.id,
      jobName: job.name,
      organizationId: job.data?.organizationId ?? 'unknown',
      userId: job.data?.userId ?? 'unknown',
      correlationId: job.data?.correlationId ?? 'unknown',
      ts: new Date().toISOString(),
      ...extra,
    };

    const output = JSON.stringify({ message, ...entry });
    if (level === 'error') {
      console.error(output);
    } else if (level === 'warn') {
      console.warn(output);
    } else {
      console.log(output);
    }
  }
}
