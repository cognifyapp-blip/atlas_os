/**
 * Atlas OS — Queue Metrics
 *
 * Collects and exposes operational metrics for all Atlas queues.
 * Mission Control and the System Health endpoint consume these.
 *
 * Metrics are fetched on-demand from BullMQ — no separate time-series store
 * is needed at this stage. Pluggable into Prometheus/Grafana later.
 */

import { queueManager } from './QueueManager.js';
import { QUEUE_NAMES, type QueueName } from './types.js';

export interface QueueMetricSnapshot {
  queue: QueueName;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isPaused: boolean;
  checkedAt: string;
}

export interface AllQueueMetrics {
  queues: QueueMetricSnapshot[];
  totalWaiting: number;
  totalActive: number;
  totalFailed: number;
  checkedAt: string;
}

export class QueueMetrics {
  /**
   * Get metrics for a single queue.
   */
  static async forQueue(name: QueueName): Promise<QueueMetricSnapshot> {
    const queue = queueManager.get(name);
    const [counts, isPaused] = await Promise.all([
      queue.getJobCounts(
        'waiting',
        'active',
        'completed',
        'failed',
        'delayed',
        'paused',
      ),
      queue.isPaused(),
    ]);

    return {
      queue: name,
      waiting: counts.waiting ?? 0,
      active: counts.active ?? 0,
      completed: counts.completed ?? 0,
      failed: counts.failed ?? 0,
      delayed: counts.delayed ?? 0,
      paused: counts.paused ?? 0,
      isPaused,
      checkedAt: new Date().toISOString(),
    };
  }

  /**
   * Get metrics for all Atlas queues in parallel.
   */
  static async forAll(): Promise<AllQueueMetrics> {
    const snapshots = await Promise.all(
      Object.values(QUEUE_NAMES).map((name) =>
        QueueMetrics.forQueue(name).catch((err) => {
          console.error(`[QueueMetrics] Failed to get metrics for "${name}":`, err.message);
          return null;
        }),
      ),
    );

    const valid = snapshots.filter((s): s is QueueMetricSnapshot => s !== null);
    const checkedAt = new Date().toISOString();

    return {
      queues: valid,
      totalWaiting: valid.reduce((sum, s) => sum + s.waiting, 0),
      totalActive: valid.reduce((sum, s) => sum + s.active, 0),
      totalFailed: valid.reduce((sum, s) => sum + s.failed, 0),
      checkedAt,
    };
  }
}
