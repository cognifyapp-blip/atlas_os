/**
 * Atlas OS — Worker Manager
 *
 * Orchestrates the lifecycle of all Atlas background workers.
 *
 * Responsibilities:
 *  - Register all workers
 *  - Start / stop all workers together
 *  - Expose aggregated metrics for monitoring
 *  - Graceful shutdown on SIGTERM / SIGINT
 *
 * Usage in server.ts:
 *   workerManager.start();   // Boot all workers
 *   workerManager.stop();    // Graceful shutdown
 */

import type { BaseWorker } from './BaseWorker.js';
import type { WorkerMetrics } from './BaseWorker.js';

// Import all concrete workers
import { IntegrationWorker } from './workers/IntegrationWorker.js';
import { SyncWorker } from './workers/SyncWorker.js';
import { SalesWorker } from './workers/SalesWorker.js';
import { FinanceWorker } from './workers/FinanceWorker.js';
import { MarketingWorker } from './workers/MarketingWorker.js';
import { OperationsWorker } from './workers/OperationsWorker.js';
import { ExecutiveWorker } from './workers/ExecutiveWorker.js';
import { WorkflowWorker } from './workers/WorkflowWorker.js';
import { NotificationWorker } from './workers/NotificationWorker.js';
import { EmailWorker } from './workers/EmailWorker.js';
import { MemoryWorker } from './workers/MemoryWorker.js';
import { ReportWorker } from './workers/ReportWorker.js';
import { AnalyticsWorker } from './workers/AnalyticsWorker.js';

// ─── WorkerManager ─────────────────────────────────────────────────────────────

class AtlasWorkerManager {
  private static _instance: AtlasWorkerManager | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly _workers: BaseWorker<any, any>[] = [];
  private _running = false;

  private constructor() {
    // Register all workers in order of operational priority
    this._workers = [
      new ExecutiveWorker(),
      new WorkflowWorker(),
      new IntegrationWorker(),
      new SyncWorker(),
      new SalesWorker(),
      new FinanceWorker(),
      new MarketingWorker(),
      new OperationsWorker(),
      new EmailWorker(),
      new NotificationWorker(),
      new MemoryWorker(),
      new ReportWorker(),
      new AnalyticsWorker(),
    ];
  }

  static getInstance(): AtlasWorkerManager {
    if (!AtlasWorkerManager._instance) {
      AtlasWorkerManager._instance = new AtlasWorkerManager();
    }
    return AtlasWorkerManager._instance;
  }

  /**
   * Start all registered workers.
   * Idempotent — calling start() when already running is a no-op.
   */
  start(): void {
    if (this._running) {
      console.warn('[WorkerManager] Already running.');
      return;
    }

    console.log(`[WorkerManager] Starting ${this._workers.length} workers…`);

    for (const worker of this._workers) {
      try {
        worker.start();
      } catch (err: any) {
        console.error(`[WorkerManager] Failed to start worker: ${err.message}`);
      }
    }

    this._running = true;
    console.log('[WorkerManager] All workers started.');
  }

  /**
   * Gracefully stop all workers.
   * Waits for currently-active jobs to complete before closing.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    console.log('[WorkerManager] Graceful shutdown…');

    await Promise.allSettled(this._workers.map((w) => w.stop()));

    this._running = false;
    console.log('[WorkerManager] All workers stopped.');
  }

  /**
   * Return metrics for all registered workers.
   */
  getMetrics(): WorkerMetrics[] {
    return this._workers.map((w) => w.getMetrics());
  }

  /**
   * Return a summary of worker health.
   */
  getHealthSummary(): {
    totalWorkers: number;
    runningWorkers: number;
    stoppedWorkers: number;
    workers: Array<{ name: string; queue: string; running: boolean; processed: number; failed: number }>;
  } {
    const metrics = this.getMetrics();
    return {
      totalWorkers: metrics.length,
      runningWorkers: metrics.filter((m) => m.running).length,
      stoppedWorkers: metrics.filter((m) => !m.running).length,
      workers: metrics.map((m) => ({
        name: m.workerName,
        queue: m.queue,
        running: m.running,
        processed: m.processed,
        failed: m.failed,
      })),
    };
  }

  isRunning(): boolean {
    return this._running;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const workerManager = AtlasWorkerManager.getInstance();
