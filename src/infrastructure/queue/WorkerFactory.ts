/**
 * Atlas OS — Worker Factory
 *
 * Creates BullMQ Worker instances with Atlas production defaults.
 * Each worker gets its own Redis connection (BullMQ requirement).
 */

import { Worker, type WorkerOptions, type Processor } from 'bullmq';
import { createRedisConnection } from '../redis/RedisClient.js';
import type { QueueName } from './types.js';

// ─── Atlas Worker Defaults ────────────────────────────────────────────────────

/**
 * Per-queue concurrency settings.
 * Tune based on workload characteristics.
 */
const QUEUE_CONCURRENCY: Partial<Record<QueueName, number>> = {
  integration: 5,
  sync: 3,
  workflow: 5,
  sales: 5,
  finance: 3,
  marketing: 5,
  operations: 3,
  email: 10,
  notification: 10,
  memory: 3,
  report: 2,
  analytics: 5,
  automation: 5,
  executive: 3,
};

// ─── WorkerFactory ────────────────────────────────────────────────────────────

export class WorkerFactory {
  /**
   * Create a BullMQ Worker with Atlas production defaults.
   * Each worker gets an isolated Redis connection.
   */
  static create<T = unknown, R = unknown, N extends string = string>(
    queueName: QueueName,
    processor: Processor<T, R, N>,
    overrides?: Partial<WorkerOptions>,
  ): Worker<T, R, N> {
    const concurrency = QUEUE_CONCURRENCY[queueName] ?? 5;

    const options: WorkerOptions = {
      connection: createRedisConnection(),
      concurrency,
      autorun: false, // Workers start manually via WorkerManager
      removeOnComplete: { age: 60 * 60 * 24 * 7, count: 10000 },
      removeOnFail: { age: 60 * 60 * 24 * 30, count: 50000 },
      ...overrides,
    };

    const worker = new Worker<T, R, N>(queueName, processor, options);
    console.log(
      `[WorkerFactory] Created worker for queue "${queueName}" (concurrency=${concurrency})`,
    );
    return worker;
  }
}
