/**
 * Atlas OS — BaseIntegration
 *
 * Abstract base class for all Atlas integration providers.
 *
 * Every provider (HubSpot, QuickBooks, Google, Slack, Teams, etc.)
 * extends this class and implements the required methods.
 *
 * Provides:
 *  - Common lifecycle methods (connect, disconnect, health check)
 *  - Default no-op implementations for optional capabilities
 *  - Structured logging with provider context
 *  - Error handling and retry hooks
 *
 * Providers are replaceable — Atlas code never depends on concrete classes.
 */

import type {
  IntegrationProviderName,
  IntegrationCapability,
  IntegrationProviderConfig,
  IntegrationConnectionState,
  OAuthTokenData,
  SyncResult,
  IntegrationWebhookEvent,
  PushDataRequest,
  PullDataRequest,
  PullDataResult,
  IntegrationHealthReport,
} from './types.js';

export abstract class BaseIntegration {
  abstract readonly name: IntegrationProviderName;
  abstract readonly displayName: string;
  abstract readonly capabilities: IntegrationCapability[];

  // ─── Required methods ──────────────────────────────────────────────────────

  /**
   * Establish a connection (exchange OAuth code for tokens, validate API key, etc.)
   */
  abstract connect(
    organizationId: string,
    credentials: Record<string, unknown>,
  ): Promise<IntegrationConnectionState>;

  /**
   * Disconnect and clean up tokens/webhooks.
   */
  abstract disconnect(
    organizationId: string,
    integrationId: string,
  ): Promise<void>;

  /**
   * Health check — verify the connection is still alive.
   */
  abstract healthCheck(
    organizationId: string,
    integrationId: string,
  ): Promise<IntegrationHealthReport>;

  // ─── Optional methods (default no-ops) ────────────────────────────────────

  /**
   * OAuth: exchange authorization code for tokens.
   */
  async exchangeOAuthCode(
    _organizationId: string,
    _code: string,
    _redirectUri: string,
  ): Promise<OAuthTokenData> {
    this._notSupported('exchangeOAuthCode');
  }

  /**
   * OAuth: refresh an expired access token.
   */
  async refreshToken(
    _organizationId: string,
    _integrationId: string,
  ): Promise<OAuthTokenData> {
    this._notSupported('refreshToken');
  }

  /**
   * Validate that stored credentials are still valid.
   */
  async validateConnection(
    _organizationId: string,
    _integrationId: string,
  ): Promise<boolean> {
    return false;
  }

  /**
   * Run a full initial sync of all data.
   */
  async initialSync(
    _organizationId: string,
    _integrationId: string,
  ): Promise<SyncResult> {
    this._notSupported('initialSync');
  }

  /**
   * Run an incremental sync (only changes since last sync).
   */
  async incrementalSync(
    _organizationId: string,
    _integrationId: string,
    _cursor?: string,
  ): Promise<SyncResult> {
    this._notSupported('incrementalSync');
  }

  /**
   * Process an incoming webhook event from the provider.
   */
  async receiveWebhook(
    event: IntegrationWebhookEvent,
  ): Promise<void> {
    this.log('info', `Received webhook: ${event.eventType}`, {
      organizationId: event.organizationId,
    });
  }

  /**
   * Push data to the external provider.
   */
  async pushData(
    _organizationId: string,
    _integrationId: string,
    _request: PushDataRequest,
  ): Promise<void> {
    this._notSupported('pushData');
  }

  /**
   * Pull data from the external provider.
   */
  async pullData<T = unknown>(
    _organizationId: string,
    _integrationId: string,
    _request: PullDataRequest,
  ): Promise<PullDataResult<T>> {
    this._notSupported('pullData');
  }

  /**
   * Return the provider's configuration (for registration).
   */
  abstract getConfig(): IntegrationProviderConfig;

  // ─── Protected helpers ────────────────────────────────────────────────────

  protected log(
    level: 'info' | 'warn' | 'error',
    message: string,
    context: Record<string, unknown> = {},
  ): void {
    const entry = JSON.stringify({
      level,
      provider: this.name,
      message,
      ts: new Date().toISOString(),
      ...context,
    });
    if (level === 'error') console.error(entry);
    else if (level === 'warn') console.warn(entry);
    else console.log(entry);
  }

  protected buildSyncResult(
    integrationId: string,
    mode: SyncResult['mode'],
    start: number,
    counts: Pick<SyncResult, 'recordsProcessed' | 'recordsCreated' | 'recordsUpdated' | 'recordsSkipped' | 'errors'>,
    options: { entityType?: string; nextCursor?: string } = {},
  ): SyncResult {
    return {
      provider: this.name,
      integrationId,
      mode,
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - start,
      ...counts,
      ...options,
    };
  }

  private _notSupported(method: string): never {
    throw new Error(
      `Integration provider "${this.name}" does not support "${method}". ` +
        `Add "${method}" capability to enable it.`,
    );
  }
}
