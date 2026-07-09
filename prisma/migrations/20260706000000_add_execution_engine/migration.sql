-- Atlas OS — Execution Engine: Integration & OAuth Models
-- Adds production-ready models for the Integration Framework.
-- Existing tables (users, organizations, memberships, departments, ai_executives) are untouched.

-- ─────────────────────────────────────────────
-- INTEGRATION LAYER
-- ─────────────────────────────────────────────

CREATE TYPE "IntegrationStatus" AS ENUM (
  'CONNECTED',
  'DISCONNECTED',
  'ERROR',
  'PENDING',
  'EXPIRED'
);

CREATE TYPE "SyncMode" AS ENUM (
  'INITIAL',
  'INCREMENTAL',
  'FULL'
);

-- Top-level integration record: one row per org+provider connection
CREATE TABLE "integrations" (
  "id"             TEXT NOT NULL,
  "provider"       TEXT NOT NULL,
  "displayName"    TEXT NOT NULL,
  "status"         "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
  "connectedAt"    TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "lastSyncAt"     TIMESTAMP(3),
  "errorMessage"   TEXT,
  "metadata"       JSONB,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  "organizationId" TEXT NOT NULL,

  CONSTRAINT "integrations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "integrations_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "integrations_organizationId_provider_key"
  ON "integrations"("organizationId", "provider");

CREATE INDEX "integrations_organizationId_idx" ON "integrations"("organizationId");
CREATE INDEX "integrations_provider_idx" ON "integrations"("provider");

-- OAuth tokens — one per integration (upserted on connect/refresh)
CREATE TABLE "oauth_tokens" (
  "id"             TEXT NOT NULL,
  "accessToken"    TEXT NOT NULL,
  "refreshToken"   TEXT,
  "expiresAt"      TIMESTAMP(3),
  "scopes"         TEXT[],
  "tokenType"      TEXT NOT NULL DEFAULT 'Bearer',
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,

  "integrationId"  TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,

  CONSTRAINT "oauth_tokens_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "oauth_tokens_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "oauth_tokens_integrationId_organizationId_key"
  ON "oauth_tokens"("integrationId", "organizationId");

-- Sync history — append-only log of every sync run
CREATE TABLE "sync_history" (
  "id"               TEXT NOT NULL,
  "provider"         TEXT NOT NULL,
  "mode"             "SyncMode" NOT NULL,
  "entityType"       TEXT,
  "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
  "recordsCreated"   INTEGER NOT NULL DEFAULT 0,
  "recordsUpdated"   INTEGER NOT NULL DEFAULT 0,
  "recordsSkipped"   INTEGER NOT NULL DEFAULT 0,
  "errors"           TEXT[],
  "nextCursor"       TEXT,
  "durationMs"       INTEGER NOT NULL DEFAULT 0,
  "completedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "integrationId"    TEXT NOT NULL,
  "organizationId"   TEXT NOT NULL,

  CONSTRAINT "sync_history_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sync_history_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE
);

CREATE INDEX "sync_history_integrationId_idx" ON "sync_history"("integrationId");
CREATE INDEX "sync_history_organizationId_idx" ON "sync_history"("organizationId");
CREATE INDEX "sync_history_completedAt_idx" ON "sync_history"("completedAt" DESC);

-- Webhook events — raw inbound events from providers, before processing
CREATE TABLE "webhook_events" (
  "id"             TEXT NOT NULL,
  "provider"       TEXT NOT NULL,
  "eventType"      TEXT NOT NULL,
  "rawPayload"     JSONB NOT NULL,
  "processed"      BOOLEAN NOT NULL DEFAULT false,
  "processedAt"    TIMESTAMP(3),
  "correlationId"  TEXT,
  "error"          TEXT,
  "receivedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  "integrationId"  TEXT,
  "organizationId" TEXT NOT NULL,

  CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "webhook_events_integrationId_fkey"
    FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL
);

CREATE INDEX "webhook_events_organizationId_idx" ON "webhook_events"("organizationId");
CREATE INDEX "webhook_events_provider_idx" ON "webhook_events"("provider");
CREATE INDEX "webhook_events_processed_idx" ON "webhook_events"("processed");
CREATE INDEX "webhook_events_receivedAt_idx" ON "webhook_events"("receivedAt" DESC);
