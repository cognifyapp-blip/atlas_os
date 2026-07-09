/**
 * Atlas OS — Integration Framework Types
 *
 * Provider-agnostic type definitions for the entire integration layer.
 * Every provider, regardless of vendor, conforms to these interfaces.
 */

// ─── Provider Identity ────────────────────────────────────────────────────────

export type IntegrationProviderName = string;

export type IntegrationCapability =
  | 'oauth'
  | 'webhook'
  | 'initial_sync'
  | 'incremental_sync'
  | 'push'
  | 'pull'
  | 'health_check';

// ─── OAuth Token ──────────────────────────────────────────────────────────────

export interface OAuthTokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
  scopes: string[];
  tokenType?: string;
}

// ─── Connection Status ────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'pending'
  | 'expired';

export interface IntegrationConnectionState {
  status: ConnectionStatus;
  connectedAt?: Date;
  lastSyncAt?: Date;
  lastHealthCheckAt?: Date;
  errorMessage?: string;
}

// ─── Sync Result ──────────────────────────────────────────────────────────────

export interface SyncResult {
  provider: IntegrationProviderName;
  integrationId: string;
  entityType?: string;
  mode: 'initial' | 'incremental' | 'full';
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  nextCursor?: string;
  completedAt: string;
  durationMs: number;
}

// ─── Webhook Event ────────────────────────────────────────────────────────────

export interface IntegrationWebhookEvent {
  provider: IntegrationProviderName;
  integrationId?: string;
  organizationId: string;
  eventType: string;
  rawPayload: unknown;
  receivedAt: string;
}

// ─── Push/Pull ────────────────────────────────────────────────────────────────

export interface PushDataRequest {
  entityType: string;
  records: unknown[];
  organizationId: string;
}

export interface PullDataRequest {
  entityType: string;
  filters?: Record<string, unknown>;
  limit?: number;
  cursor?: string;
  organizationId: string;
}

export interface PullDataResult<T = unknown> {
  records: T[];
  nextCursor?: string;
  totalCount?: number;
}

// ─── Health Check ─────────────────────────────────────────────────────────────

export interface IntegrationHealthReport {
  provider: IntegrationProviderName;
  integrationId?: string;
  healthy: boolean;
  latencyMs?: number;
  checkedAt: string;
  error?: string;
}

// ─── Provider Config ─────────────────────────────────────────────────────────

export interface IntegrationProviderConfig {
  name: IntegrationProviderName;
  displayName: string;
  description: string;
  capabilities: IntegrationCapability[];
  oauthConfig?: {
    clientId: string;
    clientSecret: string;
    authorizationUrl: string;
    tokenUrl: string;
    scopes: string[];
    redirectUri: string;
  };
  webhookConfig?: {
    secret?: string;
    events: string[];
  };
}

// ─── Integration Event (for IntegrationManager routing) ──────────────────────

export interface IntegrationEventContext {
  provider: IntegrationProviderName;
  event: string;
  organizationId: string;
  userId: string;
  correlationId: string;
  integrationId?: string;
  webhookData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
