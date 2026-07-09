/**
 * Atlas OS — Integrations barrel export
 */

export { integrationManager } from './IntegrationManager.js';
export { integrationRegistry } from './IntegrationRegistry.js';
export { syncEngine } from './SyncEngine.js';
export { BaseIntegration } from './BaseIntegration.js';
export { OAuthIntegration } from './OAuthIntegration.js';

export type {
  IntegrationProviderName,
  IntegrationCapability,
  IntegrationProviderConfig,
  IntegrationConnectionState,
  OAuthTokenData,
  ConnectionStatus,
  SyncResult,
  IntegrationWebhookEvent,
  PushDataRequest,
  PullDataRequest,
  PullDataResult,
  IntegrationHealthReport,
  IntegrationEventContext,
} from './types.js';

// Provider exports
export { HubSpotIntegration } from './providers/HubSpot/index.js';
export { QuickBooksIntegration } from './providers/QuickBooks/index.js';
export { GoogleIntegration } from './providers/Google/index.js';
export { SlackIntegration } from './providers/Slack/index.js';
export { TeamsIntegration } from './providers/Teams/index.js';
