/**
 * Atlas OS — System Health Service
 *
 * Aggregates health status across all Atlas infrastructure components:
 *  - Redis
 *  - BullMQ Queues
 *  - Workers
 *  - Integration Framework
 *
 * Consumed by:
 *  - GET /api/internal/health (full system health report)
 *  - Mission Control dashboard (real-time system status)
 *  - Alerting system (future)
 */

import { RedisHealth } from '../redis/RedisHealth.js';
import { QueueMetrics } from '../queue/QueueMetrics.js';
import { workerManager } from '../../workers/WorkerManager.js';
import { integrationRegistry } from '../../integrations/IntegrationRegistry.js';

export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  details?: Record<string, unknown>;
  checkedAt: string;
  error?: string;
}

export interface SystemHealthReport {
  status: HealthStatus;
  components: ComponentHealth[];
  checkedAt: string;
}

export class SystemHealth {
  /**
   * Run a full system health check across all components.
   */
  static async check(): Promise<SystemHealthReport> {
    const checkedAt = new Date().toISOString();

    const [redisHealth, queueMetrics, workerSummary] = await Promise.allSettled([
      RedisHealth.check(),
      QueueMetrics.forAll(),
      Promise.resolve(workerManager.getHealthSummary()),
    ]);

    const components: ComponentHealth[] = [];

    // Redis
    if (redisHealth.status === 'fulfilled') {
      const r = redisHealth.value;
      components.push({
        name: 'redis',
        status: r.status,
        checkedAt: r.checkedAt,
        details: {
          host: r.host,
          port: r.port,
          latencyMs: r.latencyMs,
          connected: r.connected,
        },
        error: r.error,
      });
    } else {
      components.push({
        name: 'redis',
        status: 'unhealthy',
        checkedAt,
        error: redisHealth.reason?.message ?? 'Redis health check failed',
      });
    }

    // BullMQ Queues
    if (queueMetrics.status === 'fulfilled') {
      const m = queueMetrics.value;
      const hasFailures = m.totalFailed > 0;
      components.push({
        name: 'bullmq',
        status: hasFailures ? 'degraded' : 'healthy',
        checkedAt: m.checkedAt,
        details: {
          totalWaiting: m.totalWaiting,
          totalActive: m.totalActive,
          totalFailed: m.totalFailed,
          queueCount: m.queues.length,
        },
      });
    } else {
      components.push({
        name: 'bullmq',
        status: 'unhealthy',
        checkedAt,
        error: queueMetrics.reason?.message ?? 'Queue metrics failed',
      });
    }

    // Workers
    if (workerSummary.status === 'fulfilled') {
      const w = workerSummary.value;
      const allRunning = w.runningWorkers === w.totalWorkers;
      components.push({
        name: 'workers',
        status: allRunning ? 'healthy' : w.runningWorkers > 0 ? 'degraded' : 'unhealthy',
        checkedAt,
        details: {
          total: w.totalWorkers,
          running: w.runningWorkers,
          stopped: w.stoppedWorkers,
        },
      });
    } else {
      components.push({
        name: 'workers',
        status: 'unhealthy',
        checkedAt,
        error: workerSummary.reason?.message ?? 'Worker health check failed',
      });
    }

    // Integration Framework
    const providerCount = integrationRegistry.listNames().length;
    components.push({
      name: 'integrations',
      status: 'healthy',
      checkedAt,
      details: {
        registeredProviders: providerCount,
        providers: integrationRegistry.listNames(),
      },
    });

    // Overall status: worst of all components
    const statuses = components.map((c) => c.status);
    const overall: HealthStatus = statuses.includes('unhealthy')
      ? 'unhealthy'
      : statuses.includes('degraded')
      ? 'degraded'
      : 'healthy';

    return { status: overall, components, checkedAt };
  }
}
