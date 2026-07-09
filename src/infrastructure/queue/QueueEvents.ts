/**
 * Atlas OS — Queue Events
 *
 * BullMQ QueueEvents listeners for cross-process job lifecycle observability.
 *
 * Each QueueEvents instance opens a dedicated Redis connection and listens
 * for events emitted by all Workers processing a given queue — even workers
 * running in separate processes.
 *
 * Used by QueueMetrics to track completion, failure, and retry counts
 * without being inside the worker process itself.
 */

import { QueueEvents } from 'bullmq';
import { createRedisConnection } from '../redis/RedisClient.js';
import { QUEUE_NAMES, type QueueName } from './types.js';

// ─── AtlasQueueEvents ─────────────────────────────────────────────────────────

class AtlasQueueEvents {
  private static _instance: AtlasQueueEvents | null = null;

  private readonly _events = new Map<QueueName, QueueEvents>();
  private _initialized = false;

  private constructor() {}

  static getInstance(): AtlasQueueEvents {
    if (!AtlasQueueEvents._instance) {
      AtlasQueueEvents._instance = new AtlasQueueEvents();
    }
    return AtlasQueueEvents._instance;
  }

  /**
   * Initialize QueueEvents listeners for all Atlas queues.
   * Attaches structured logging to completed/failed/stalled events.
   */
  initialize(): void {
    if (this._initialized) return;

    for (const name of Object.values(QUEUE_NAMES)) {
      const events = new QueueEvents(name, {
        connection: createRedisConnection(),
      });

      events.on('completed', ({ jobId }) => {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'job.completed',
            queue: name,
            jobId,
            ts: new Date().toISOString(),
          }),
        );
      });

      events.on('failed', ({ jobId, failedReason }) => {
        console.error(
          JSON.stringify({
            level: 'error',
            event: 'job.failed',
            queue: name,
            jobId,
            reason: failedReason,
            ts: new Date().toISOString(),
          }),
        );
      });

      events.on('stalled', ({ jobId }) => {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'job.stalled',
            queue: name,
            jobId,
            ts: new Date().toISOString(),
          }),
        );
      });

      events.on('delayed', ({ jobId, delay }) => {
        console.log(
          JSON.stringify({
            level: 'info',
            event: 'job.delayed',
            queue: name,
            jobId,
            delay,
            ts: new Date().toISOString(),
          }),
        );
      });

      this._events.set(name, events);
    }

    this._initialized = true;
    console.log(`[QueueEvents] Listening on ${this._events.size} queues.`);
  }

  get(name: QueueName): QueueEvents | undefined {
    return this._events.get(name);
  }

  async shutdown(): Promise<void> {
    const tasks = Array.from(this._events.values()).map((e) => e.close());
    await Promise.allSettled(tasks);
    this._events.clear();
    this._initialized = false;
    console.log('[QueueEvents] All listeners closed.');
  }
}

export const queueEvents = AtlasQueueEvents.getInstance();
