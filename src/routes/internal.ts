/**
 * Atlas OS — Internal API Routes
 *
 * Health checks, monitoring, and system status endpoints.
 * These are not user-facing — they power Mission Control dashboards
 * and future alerting systems.
 *
 * Routes:
 *   GET /api/internal/health          — Full system health report
 *   GET /api/internal/health/redis    — Redis health
 *   GET /api/internal/queues          — Queue metrics snapshot
 *   GET /api/internal/workers         — Worker status
 *   GET /api/internal/integrations    — Registered integration providers
 *
 * Note: In production, these should be protected by internal network policy
 * or an API key. The requireAuth middleware can be added when Mission Control
 * is wired up as an authenticated user.
 */

import { Router } from 'express';
import { SystemHealth } from '../infrastructure/health/SystemHealth.js';
import { RedisHealth } from '../infrastructure/redis/RedisHealth.js';
import { QueueMetrics } from '../infrastructure/queue/QueueMetrics.js';
import { workerManager } from '../workers/WorkerManager.js';
import { integrationRegistry } from '../integrations/IntegrationRegistry.js';
import { AuditLog } from '../infrastructure/audit/AuditLog.js';

const router = Router();

// ─── Full system health ──────────────────────────────────────────────────────

router.get('/health', async (_req, res) => {
  try {
    const report = await SystemHealth.check();
    const statusCode = report.status === 'healthy' ? 200 : report.status === 'degraded' ? 200 : 503;
    res.status(statusCode).json(report);
  } catch (err: any) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// ─── Redis health ─────────────────────────────────────────────────────────────

router.get('/health/redis', async (_req, res) => {
  try {
    const report = await RedisHealth.check();
    const statusCode = report.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json(report);
  } catch (err: any) {
    res.status(500).json({ status: 'unhealthy', error: err.message });
  }
});

// ─── Queue metrics ────────────────────────────────────────────────────────────

router.get('/queues', async (_req, res) => {
  try {
    const metrics = await QueueMetrics.forAll();
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/queues/:name', async (req, res) => {
  try {
    const { QUEUE_NAMES } = await import('../infrastructure/queue/types.js');
    const name = req.params.name as any;
    if (!Object.values(QUEUE_NAMES).includes(name)) {
      return res.status(404).json({ error: `Queue "${name}" not found.` });
    }
    const metrics = await QueueMetrics.forQueue(name);
    res.json(metrics);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Worker status ────────────────────────────────────────────────────────────

router.get('/workers', (_req, res) => {
  try {
    const summary = workerManager.getHealthSummary();
    res.json(summary);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/workers/metrics', (_req, res) => {
  try {
    const metrics = workerManager.getMetrics();
    res.json({ workers: metrics, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Integration providers ────────────────────────────────────────────────────

router.get('/integrations', (_req, res) => {
  try {
    const providers = integrationRegistry.listAll();
    res.json({ providers, count: providers.length, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Execution Audit ──────────────────────────────────────────────────────────

// ─── Aggregated infrastructure metrics (Mission Control dashboard) ───────────

/**
 * GET /api/internal/metrics
 * Returns a unified infrastructure snapshot: Redis, queues, workers, integrations.
 * Consumed by the InfrastructureDashboard component every 5 seconds.
 */
router.get('/metrics', async (_req, res) => {
  try {
    const [redisReport, queueMetrics, workerSummary] = await Promise.allSettled([
      RedisHealth.check(),
      QueueMetrics.forAll(),
      Promise.resolve(workerManager.getHealthSummary()),
    ]);

    const registeredProviders = integrationRegistry.listAll();

    const redis = redisReport.status === 'fulfilled'
      ? {
          status: redisReport.value.status,
          connected: redisReport.value.connected,
          latencyMs: redisReport.value.latencyMs,
          host: redisReport.value.host,
          port: redisReport.value.port,
          error: redisReport.value.error,
        }
      : {
          status: 'unhealthy' as const,
          connected: false,
          host: 'unknown',
          port: 0,
          error: (redisReport.reason as Error)?.message ?? 'Redis health check failed',
        };

    const queues = queueMetrics.status === 'fulfilled'
      ? {
          totalWaiting: queueMetrics.value.totalWaiting,
          totalActive: queueMetrics.value.totalActive,
          totalFailed: queueMetrics.value.totalFailed,
          metrics: queueMetrics.value.queues,
        }
      : { totalWaiting: 0, totalActive: 0, totalFailed: 0, metrics: [] };

    const workers = workerSummary.status === 'fulfilled'
      ? {
          total: workerSummary.value.totalWorkers,
          running: workerSummary.value.runningWorkers,
          stopped: workerSummary.value.stoppedWorkers,
          workers: workerSummary.value.workers,
        }
      : { total: 0, running: 0, stopped: 0, workers: [] };

    // Map registered providers to their connection status.
    // Providers exist in the registry but have no live DB connection yet,
    // so they are reported as 'disconnected' until an org connects them.
    const integrationProviders = registeredProviders.map((p) => ({
      provider: p.displayName,
      status: 'disconnected' as const,
    }));

    res.json({
      metrics: {
        redis,
        queues,
        workers,
        integrations: {
          total: registeredProviders.length,
          connected: 0,
          providers: integrationProviders,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/internal/audit — recent 100 audit entries */
router.get('/audit', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string ?? '100', 10), 500);
    // Serve from cache; fall back to DB on cold start
    const cached = AuditLog.recent(limit);
    const entries = cached.length > 0 ? cached : await AuditLog.recentFromDb(limit);
    res.json({ entries, total: entries.length, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/internal/audit/summary — daily per-executive summary */
router.get('/audit/summary', async (req, res) => {
  try {
    const orgId = (req.query.orgId as string) ?? 'default';
    const [summary, totals] = await Promise.all([
      AuditLog.dailySummary(orgId),
      AuditLog.totals(),
    ]);
    res.json({ summary, totals, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /api/internal/audit/executive/:id — per-executive audit trail */
router.get('/audit/executive/:id', (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string ?? '50', 10), 200);
    const entries = AuditLog.forExecutive(req.params.id, limit);
    res.json({ entries, total: entries.length, checkedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
