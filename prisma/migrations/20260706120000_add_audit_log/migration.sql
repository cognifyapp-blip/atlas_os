-- Atlas OS: Persistent execution audit log
-- Replaces the previous in-memory AuditLog store.

CREATE TYPE "AuditStatus" AS ENUM ('queued', 'started', 'completed', 'failed', 'retrying');

CREATE TABLE "audit_log_entries" (
    "id"             TEXT NOT NULL,
    "ts"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "userId"         TEXT NOT NULL DEFAULT 'system',
    "correlationId"  TEXT NOT NULL,
    "jobId"          TEXT,
    "jobName"        TEXT NOT NULL,
    "queue"          TEXT NOT NULL,
    "worker"         TEXT NOT NULL,
    "executiveId"    TEXT,
    "executiveName"  TEXT,
    "status"         "AuditStatus" NOT NULL DEFAULT 'queued',
    "startedAt"      TIMESTAMP(3),
    "completedAt"    TIMESTAMP(3),
    "durationMs"     INTEGER,
    "retryCount"     INTEGER NOT NULL DEFAULT 0,
    "error"          TEXT,
    "tokensUsed"     INTEGER,
    "costUsd"        DOUBLE PRECISION,
    "context"        JSONB,

    CONSTRAINT "audit_log_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_log_entries_organizationId_idx" ON "audit_log_entries"("organizationId");
CREATE INDEX "audit_log_entries_correlationId_idx"  ON "audit_log_entries"("correlationId");
CREATE INDEX "audit_log_entries_executiveId_idx"    ON "audit_log_entries"("executiveId");
CREATE INDEX "audit_log_entries_status_idx"         ON "audit_log_entries"("status");
CREATE INDEX "audit_log_entries_ts_idx"             ON "audit_log_entries"("ts" DESC);
