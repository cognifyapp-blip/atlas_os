/**
 * Atlas OS — Redis Health Service
 *
 * Provides structured health check data for Redis.
 * Consumed by the Atlas System Health dashboard and the /api/internal/health endpoint.
 */

import { redisClient } from './RedisClient.js';

export type RedisHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface RedisHealthReport {
  status: RedisHealthStatus;
  connected: boolean;
  latencyMs: number | null;
  host: string;
  port: number;
  checkedAt: string;
  error?: string;
}

export class RedisHealth {
  /**
   * Run a full Redis health check.
   * Returns latency measured via PING round-trip.
   */
  static async check(): Promise<RedisHealthReport> {
    const cfg = redisClient.getConfig();
    const base = {
      host: cfg.host,
      port: cfg.port,
      checkedAt: new Date().toISOString(),
    };

    try {
      const start = Date.now();
      const alive = await redisClient.ping();
      const latencyMs = Date.now() - start;

      if (!alive) {
        return {
          ...base,
          status: 'unhealthy',
          connected: false,
          latencyMs: null,
          error: 'PING did not return PONG',
        };
      }

      const status: RedisHealthStatus =
        latencyMs < 50 ? 'healthy' : latencyMs < 500 ? 'degraded' : 'unhealthy';

      return {
        ...base,
        status,
        connected: true,
        latencyMs,
      };
    } catch (err: any) {
      return {
        ...base,
        status: 'unhealthy',
        connected: false,
        latencyMs: null,
        error: err.message,
      };
    }
  }
}
