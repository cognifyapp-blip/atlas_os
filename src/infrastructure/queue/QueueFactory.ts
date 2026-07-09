/**
 * Atlas OS — Queue Factory
 *
 * Creates BullMQ Queue instances with Atlas production defaults.
 * Used internally by QueueManager — never instantiate queues directly.
 */

import { Queue, type QueueOptions } from 'bullmq';
import { createRedisConnection } from '../redis/RedisClient.js';
import type { QueueName } from './types.js';

// ─── Production defaults ───────────────────────────────────────────────────────

/**
 * Default job options applied to every queue unless overridden.
 * These represent production-safe values for Atlas operations.
 */
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // 1s, 2s, 4s
  },
  removeOnComplete: {
    age: 60 * 60 * 24 * 7, // Keep completed jobs for 7 days
    count: 10000,
  },
  removeOnFail: {
    age: 60 * 60 * 24 * 30, // Keep failed jobs for 30 days
    count: 50000,
  },
} as const;

/**
 * Per-queue overrides — tune these as workloads are understood.
 */
const QUEUE_OVERRIDES: Partial<Record<QueueName, Partial<typeof DEFAULT_JOB_OPTIONS>>> = {
  email: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  },
  notification: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 1500 },
  },
  sync: {
    attempts: 10,
    backoff: { type: 'exponential', delay: 5000 },
  },
  integration: {
    attempts: 5,
    backoff: { type: 'exponential', delay: 3000 },
  },
};

// ─── QueueFactory ─────────────────────────────────────────────────────────────

export class QueueFactory {
  /**
   * Create a BullMQ Queue with Atlas production defaults.
   * Each queue gets its own Redis connection (BullMQ requirement).
   */
  static create<T = unknown, R = unknown, N extends string = string>(
    name: QueueName,
    overrides?: Partial<QueueOptions>,
  ): Queue<T, R, N> {
    const jobOverrides = QUEUE_OVERRIDES[name] ?? {};
    const defaultJobOptions = { ...DEFAULT_JOB_OPTIONS, ...jobOverrides };

    const options: QueueOptions = {
      connection: createRedisConnection(),
      defaultJobOptions,
      ...overrides,
    };

    const queue = new Queue<T, R, N>(name, options);

    console.log(`[QueueFactory] Created queue: "${name}"`);
    return queue;
  }
}
