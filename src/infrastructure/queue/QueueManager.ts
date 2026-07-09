/**
 * Atlas OS — Queue Manager
 *
 * Single registry for all Atlas BullMQ queues.
 * This is THE only place to get a queue reference throughout Atlas.
 *
 * Rules:
 *  - Never instantiate a Queue directly outside this file.
 *  - Always import { queueManager } and call queueManager.get(QUEUE_NAMES.X).
 *  - Workers receive their queue from WorkerFactory, not QueueManager.
 *
 * AI Executives, workflows, integrations, and webhooks all enqueue work
 * through QueueManager — this is the entry point into the execution engine.
 */

import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { QueueFactory } from './QueueFactory.js';
import { AuditLog } from '../audit/AuditLog.js';
import {
  QUEUE_NAMES,
  type QueueName,
  type AtlasJobPayload,
  type IntegrationJobPayload,
  type SyncJobPayload,
  type WorkflowJobPayload,
  type SalesJobPayload,
  type FinanceJobPayload,
  type MarketingJobPayload,
  type OperationsJobPayload,
  type EmailJobPayload,
  type NotificationJobPayload,
  type MemoryJobPayload,
  type ReportJobPayload,
  type AnalyticsJobPayload,
  type AutomationJobPayload,
  type ExecutiveJobPayload,
} from './types.js';

// ─── EnqueueOptions ────────────────────────────────────────────────────────────

export interface EnqueueOptions {
  /** Priority: 1 (highest) — 2,147,483,647 (lowest). Default: 0 (normal). */
  priority?: number;
  /** Delay before the job is processed, in milliseconds */
  delay?: number;
  /** Override the job ID (useful for deduplication) */
  jobId?: string;
  /** Number of retry attempts (overrides queue default) */
  attempts?: number;
  /** Repeat options for scheduled/repeating jobs */
  repeat?: {
    pattern?: string;   // CRON expression
    every?: number;     // Milliseconds between repeats
    limit?: number;     // Max number of repetitions
  };
}

// ─── QueueManager ─────────────────────────────────────────────────────────────

class AtlasQueueManager {
  private static _instance: AtlasQueueManager | null = null;

  private readonly _queues = new Map<QueueName, Queue>();
  private _initialized = false;

  private constructor() {}

  static getInstance(): AtlasQueueManager {
    if (!AtlasQueueManager._instance) {
      AtlasQueueManager._instance = new AtlasQueueManager();
    }
    return AtlasQueueManager._instance;
  }

  /**
   * Initialize all Atlas queues.
   * Call this once at application startup, before any workers are started.
   */
  initialize(): void {
    if (this._initialized) return;

    for (const name of Object.values(QUEUE_NAMES)) {
      this._queues.set(name, QueueFactory.create(name));
    }

    this._initialized = true;
    console.log(`[QueueManager] Initialized ${this._queues.size} queues.`);
  }

  /**
   * Get a queue by name.
   * Throws if QueueManager has not been initialized.
   */
  get<T = AtlasJobPayload>(name: QueueName): Queue<T> {
    if (!this._initialized) {
      throw new Error(
        `[QueueManager] Not initialized. Call queueManager.initialize() at application startup.`,
      );
    }
    const q = this._queues.get(name);
    if (!q) {
      throw new Error(`[QueueManager] Queue "${name}" not found.`);
    }
    return q as Queue<T>;
  }

  // ─── Typed enqueue helpers ─────────────────────────────────────────────────

  async enqueueIntegration(
    payload: Omit<IntegrationJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.INTEGRATION, {
      ...payload,
      type: 'INTEGRATION',
      correlationId: opts?.jobId ?? uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies IntegrationJobPayload, opts);
  }

  async enqueueSync(
    payload: Omit<SyncJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.SYNC, {
      ...payload,
      type: 'SYNC',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies SyncJobPayload, opts);
  }

  async enqueueWorkflow(
    payload: Omit<WorkflowJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.WORKFLOW, {
      ...payload,
      type: 'WORKFLOW',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies WorkflowJobPayload, opts);
  }

  async enqueueSales(
    payload: Omit<SalesJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.SALES, {
      ...payload,
      type: 'SALES',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies SalesJobPayload, opts);
  }

  async enqueueFinance(
    payload: Omit<FinanceJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.FINANCE, {
      ...payload,
      type: 'FINANCE',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies FinanceJobPayload, opts);
  }

  async enqueueMarketing(
    payload: Omit<MarketingJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.MARKETING, {
      ...payload,
      type: 'MARKETING',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies MarketingJobPayload, opts);
  }

  async enqueueOperations(
    payload: Omit<OperationsJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.OPERATIONS, {
      ...payload,
      type: 'OPERATIONS',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies OperationsJobPayload, opts);
  }

  async enqueueEmail(
    payload: Omit<EmailJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.EMAIL, {
      ...payload,
      type: 'EMAIL',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies EmailJobPayload, opts);
  }

  async enqueueNotification(
    payload: Omit<NotificationJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.NOTIFICATION, {
      ...payload,
      type: 'NOTIFICATION',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies NotificationJobPayload, opts);
  }

  async enqueueMemory(
    payload: Omit<MemoryJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.MEMORY, {
      ...payload,
      type: 'MEMORY',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies MemoryJobPayload, opts);
  }

  async enqueueReport(
    payload: Omit<ReportJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.REPORT, {
      ...payload,
      type: 'REPORT',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies ReportJobPayload, opts);
  }

  async enqueueAnalytics(
    payload: Omit<AnalyticsJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.ANALYTICS, {
      ...payload,
      type: 'ANALYTICS',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies AnalyticsJobPayload, opts);
  }

  async enqueueAutomation(
    payload: Omit<AutomationJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.AUTOMATION, {
      ...payload,
      type: 'AUTOMATION',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies AutomationJobPayload, opts);
  }

  async enqueueExecutive(
    payload: Omit<ExecutiveJobPayload, 'type' | 'correlationId' | 'createdAt'>,
    opts?: EnqueueOptions,
  ) {
    return this._enqueue(QUEUE_NAMES.EXECUTIVE, {
      ...payload,
      type: 'EXECUTIVE',
      correlationId: uuidv4(),
      createdAt: new Date().toISOString(),
    } satisfies ExecutiveJobPayload, opts);
  }

  // ─── Shutdown ──────────────────────────────────────────────────────────────

  async shutdown(): Promise<void> {
    console.log('[QueueManager] Shutting down…');
    const tasks = Array.from(this._queues.values()).map((q) => q.close());
    await Promise.allSettled(tasks);
    this._queues.clear();
    this._initialized = false;
    console.log('[QueueManager] All queues closed.');
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _enqueue<T extends AtlasJobPayload>(
    queueName: QueueName,
    payload: T,
    opts?: EnqueueOptions,
  ) {
    const queue = this.get<T>(queueName);
    const jobName = `${payload.type}.${(payload as any).action ?? (payload as any).event ?? 'job'}`;

    const job = await queue.add(jobName, payload, {
      priority: opts?.priority,
      delay: opts?.delay,
      jobId: opts?.jobId,
      attempts: opts?.attempts,
      repeat: opts?.repeat,
    });

    // ── Audit: record the queued state immediately at enqueue time ────────────
    AuditLog.append({
      id: `${payload.correlationId}-queued`,
      ts: new Date().toISOString(),
      organizationId: payload.organizationId,
      userId: payload.userId,
      correlationId: payload.correlationId,
      jobId: job.id,
      jobName,
      queue: queueName,
      worker: '',
      executiveId: (payload as any).executiveId ?? (payload as any).context?.executiveId,
      executiveName: (payload as any).executiveName ?? (payload as any).context?.executiveName,
      status: 'queued',
      retryCount: 0,
    });

    console.log(
      `[QueueManager] Enqueued "${jobName}" → "${queueName}" ` +
        `[org=${payload.organizationId} correlation=${payload.correlationId} jobId=${job.id}]`,
    );

    return job;
  }
}

// ─── Singleton export ──────────────────────────────────────────────────────────

export const queueManager = AtlasQueueManager.getInstance();
