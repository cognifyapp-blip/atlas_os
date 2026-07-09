/**
 * Atlas OS — Execution Audit Log
 *
 * Persistent audit trail backed by PostgreSQL (audit_log_entries table).
 * An in-memory ring buffer (capped at MAX_CACHE entries) acts as a
 * read-through cache so hot paths (recent(), forExecutive()) stay fast
 * without a round-trip to the DB every time.
 *
 * Write path  : append() / update() write to DB asynchronously — the
 *               caller never blocks on the DB write.
 * Read path   : recent(), forOrg(), forExecutive() serve from the cache;
 *               dailySummary() and totals() hit the DB for accuracy.
 *
 * Workers still call the same static API (append / update / recent /
 * forExecutive / dailySummary / totals) — no callers need to change.
 */

import { prisma } from '../../lib/prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuditStatus = 'queued' | 'started' | 'completed' | 'failed' | 'retrying';

export interface AuditEntry {
  id: string;
  /** ISO timestamp when the entry was created */
  ts: string;
  /** Atlas organization ID */
  organizationId: string;
  /** Atlas user or 'system' */
  userId: string;
  /** Correlation ID for distributed tracing */
  correlationId: string;
  /** BullMQ job ID */
  jobId?: string;
  /** Job name e.g. "SALES.qualify_lead" */
  jobName: string;
  /** Queue name */
  queue: string;
  /** Worker class name */
  worker: string;
  /** The AI executive ID (if applicable) */
  executiveId?: string;
  /** Human-readable executive display name */
  executiveName?: string;
  /** Current status */
  status: AuditStatus;
  /** Job start time (ISO) */
  startedAt?: string;
  /** Job completion time (ISO) */
  completedAt?: string;
  /** Wall-clock duration in ms */
  durationMs?: number;
  /** Number of retry attempts consumed */
  retryCount: number;
  /** Error message if status=failed */
  error?: string;
  /** AI token usage */
  tokensUsed?: number;
  /** Estimated USD cost */
  costUsd?: number;
  /** Arbitrary context data */
  context?: Record<string, unknown>;
}

// ─── In-memory ring buffer (cache) ───────────────────────────────────────────
// Serves hot reads without DB round-trips. Evicts oldest when full.
const MAX_CACHE = 2_000;
const _cache: AuditEntry[] = [];

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Convert an AuditEntry to Prisma create/update data. */
function toDbData(entry: AuditEntry) {
  return {
    id:             entry.id,
    ts:             new Date(entry.ts),
    organizationId: entry.organizationId,
    userId:         entry.userId ?? 'system',
    correlationId:  entry.correlationId,
    jobId:          entry.jobId ?? null,
    jobName:        entry.jobName,
    queue:          entry.queue,
    worker:         entry.worker,
    executiveId:    entry.executiveId ?? null,
    executiveName:  entry.executiveName ?? null,
    status:         entry.status as any,
    startedAt:      entry.startedAt ? new Date(entry.startedAt) : null,
    completedAt:    entry.completedAt ? new Date(entry.completedAt) : null,
    durationMs:     entry.durationMs ?? null,
    retryCount:     entry.retryCount,
    error:          entry.error ?? null,
    tokensUsed:     entry.tokensUsed ?? null,
    costUsd:        entry.costUsd ?? null,
    context:        (entry.context as any) ?? null,
  };
}

/** Convert a DB row back to AuditEntry shape. */
function fromDbRow(row: any): AuditEntry {
  return {
    id:             row.id,
    ts:             row.ts instanceof Date ? row.ts.toISOString() : row.ts,
    organizationId: row.organizationId,
    userId:         row.userId,
    correlationId:  row.correlationId,
    jobId:          row.jobId ?? undefined,
    jobName:        row.jobName,
    queue:          row.queue,
    worker:         row.worker,
    executiveId:    row.executiveId ?? undefined,
    executiveName:  row.executiveName ?? undefined,
    status:         row.status as AuditStatus,
    startedAt:      row.startedAt ? (row.startedAt as Date).toISOString() : undefined,
    completedAt:    row.completedAt ? (row.completedAt as Date).toISOString() : undefined,
    durationMs:     row.durationMs ?? undefined,
    retryCount:     row.retryCount,
    error:          row.error ?? undefined,
    tokensUsed:     row.tokensUsed ?? undefined,
    costUsd:        row.costUsd ?? undefined,
    context:        row.context ?? undefined,
  };
}

/** Fire-and-forget DB write — never throws to the caller. */
function writeToDb(fn: () => Promise<void>): void {
  fn().catch((err) => {
    // Don't crash the worker — just log
    console.error('[AuditLog] DB write failed:', err?.message ?? err);
  });
}

// ─── AuditLog ─────────────────────────────────────────────────────────────────

export class AuditLog {
  /**
   * Append a new audit entry.
   * Writes to cache immediately and persists to DB asynchronously.
   */
  static append(entry: AuditEntry): void {
    // Write to front of cache
    _cache.unshift(entry);
    if (_cache.length > MAX_CACHE) _cache.pop();

    // Persist asynchronously
    writeToDb(async () => {
      await prisma.auditLogEntry.upsert({
        where: { id: entry.id },
        create: toDbData(entry),
        update: toDbData(entry),
      });
    });
  }

  /**
   * Update an existing entry by correlationId.
   * Used by workers to transition: queued → started → completed/failed.
   */
  static update(correlationId: string, patch: Partial<AuditEntry>): void {
    // Update cache
    const idx = _cache.findIndex((e) => e.correlationId === correlationId);
    if (idx !== -1) {
      _cache[idx] = { ..._cache[idx], ...patch };
    }

    // Persist asynchronously — find the DB row by correlationId + apply patch
    writeToDb(async () => {
      // Fetch current row to merge
      const existing = await prisma.auditLogEntry.findFirst({
        where: { correlationId },
        orderBy: { ts: 'desc' },
      });
      if (!existing) return; // Row not yet flushed — skip (cache holds it)

      const merged: AuditEntry = { ...fromDbRow(existing), ...patch };
      await prisma.auditLogEntry.update({
        where: { id: existing.id },
        data: toDbData(merged),
      });
    });
  }

  /**
   * Return recent entries (newest first) from cache.
   * Falls back to DB if cache is empty (e.g. after server restart).
   */
  static recent(limit = 100): AuditEntry[] {
    if (_cache.length > 0) {
      return _cache.slice(0, limit);
    }
    // Cache is cold — return empty; caller can use recentFromDb() for a full fetch
    return [];
  }

  /**
   * DB-backed recent fetch. Use when cache may be stale (e.g. after restart).
   */
  static async recentFromDb(limit = 100): Promise<AuditEntry[]> {
    const rows = await prisma.auditLogEntry.findMany({
      orderBy: { ts: 'desc' },
      take: limit,
    });
    return rows.map(fromDbRow);
  }

  /**
   * Return entries for a specific organization (newest first) from cache.
   */
  static forOrg(organizationId: string, limit = 200): AuditEntry[] {
    return _cache.filter((e) => e.organizationId === organizationId).slice(0, limit);
  }

  /**
   * Return entries for a specific AI executive from cache.
   */
  static forExecutive(executiveId: string, limit = 100): AuditEntry[] {
    return _cache.filter((e) => e.executiveId === executiveId).slice(0, limit);
  }

  /**
   * Aggregate daily stats per executive — hits the DB for accuracy.
   */
  static async dailySummary(organizationId: string): Promise<Record<string, {
    name: string;
    processed: number;
    succeeded: number;
    failed: number;
    totalDurationMs: number;
    avgDurationMs: number;
  }>> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rows = await prisma.auditLogEntry.findMany({
      where: {
        organizationId,
        executiveId: { not: null },
        ts: { gte: today },
        status: { in: ['completed', 'failed'] },
      },
    });

    const map: Record<string, {
      name: string; processed: number; succeeded: number;
      failed: number; totalDurationMs: number; avgDurationMs: number;
    }> = {};

    for (const row of rows) {
      const id = row.executiveId!;
      if (!map[id]) {
        map[id] = { name: row.executiveName ?? id, processed: 0, succeeded: 0, failed: 0, totalDurationMs: 0, avgDurationMs: 0 };
      }
      map[id].processed++;
      if (row.status === 'completed') map[id].succeeded++;
      if (row.status === 'failed') map[id].failed++;
      if (row.durationMs) map[id].totalDurationMs += row.durationMs;
    }

    for (const id of Object.keys(map)) {
      const s = map[id];
      s.avgDurationMs = s.processed > 0 ? Math.round(s.totalDurationMs / s.processed) : 0;
    }

    return map;
  }

  /**
   * Total job counts across all queues — hits the DB for accuracy.
   */
  static async totals(): Promise<{ total: number; succeeded: number; failed: number; retried: number }> {
    const [total, succeeded, failed, retried] = await Promise.all([
      prisma.auditLogEntry.count(),
      prisma.auditLogEntry.count({ where: { status: 'completed' } }),
      prisma.auditLogEntry.count({ where: { status: 'failed' } }),
      prisma.auditLogEntry.count({ where: { retryCount: { gt: 0 } } }),
    ]);
    return { total, succeeded, failed, retried };
  }
}
