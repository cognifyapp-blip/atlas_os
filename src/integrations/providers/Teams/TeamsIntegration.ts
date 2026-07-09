/**
 * Atlas OS — Microsoft Teams Integration
 *
 * Real Teams integration via Microsoft Graph API:
 *   - OAuth 2.0 (Azure AD) code exchange + token refresh
 *   - Send channel messages via Microsoft Graph
 *   - Incoming webhook support as fallback
 */

import { OAuthIntegration } from '../../OAuthIntegration.js';
import { prisma } from '../../../lib/prisma.js';
import type {
  IntegrationCapability,
  IntegrationProviderConfig,
  IntegrationConnectionState,
  OAuthTokenData,
  SyncResult,
  IntegrationHealthReport,
  PushDataRequest,
} from '../../types.js';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';

export class TeamsIntegration extends OAuthIntegration {
  readonly name = 'teams';
  readonly displayName = 'Microsoft Teams';
  readonly capabilities: IntegrationCapability[] = [
    'oauth',
    'push',
    'health_check',
  ];

  private get tokenUrl(): string {
    const tenantId = process.env.AZURE_TENANT_ID ?? 'common';
    return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
  }

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  async exchangeOAuthCode(organizationId: string, code: string, redirectUri: string): Promise<OAuthTokenData> {
    const clientId = process.env.AZURE_CLIENT_ID ?? '';
    const clientSecret = process.env.AZURE_CLIENT_SECRET ?? '';
    if (!clientId || !clientSecret) throw new Error('AZURE_CLIENT_ID and AZURE_CLIENT_SECRET are required.');

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: 'authorization_code', scope: 'https://graph.microsoft.com/ChannelMessage.Send offline_access' }).toString(),
    });

    if (!response.ok) throw new Error(`Teams token exchange failed: ${await response.text()}`);

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };
    const token: OAuthTokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: ['https://graph.microsoft.com/ChannelMessage.Send'],
      tokenType: data.token_type ?? 'Bearer',
    };

    await this.saveToken(organizationId, 'teams', token);
    return token;
  }

  async refreshToken(organizationId: string, integrationId: string): Promise<OAuthTokenData> {
    const existing = await this.loadToken(organizationId, integrationId);
    if (!existing?.refreshToken) throw new Error('No refresh token — re-authorize Teams.');

    const response = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: process.env.AZURE_CLIENT_ID ?? '', client_secret: process.env.AZURE_CLIENT_SECRET ?? '', refresh_token: existing.refreshToken, grant_type: 'refresh_token', scope: 'https://graph.microsoft.com/ChannelMessage.Send offline_access' }).toString(),
    });

    if (!response.ok) throw new Error(`Teams token refresh failed: ${response.status}`);

    const data = await response.json() as { access_token: string; refresh_token?: string; expires_in?: number };
    const token: OAuthTokenData = { accessToken: data.access_token, refreshToken: data.refresh_token ?? existing.refreshToken, expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined, scopes: existing.scopes, tokenType: 'Bearer' };

    await this.saveToken(organizationId, integrationId, token);
    return token;
  }

  // ─── Connect ─────────────────────────────────────────────────────────────────

  async connect(organizationId: string, credentials: Record<string, unknown>): Promise<IntegrationConnectionState> {
    const { code, redirectUri } = credentials as { code: string; redirectUri: string };
    await this.exchangeOAuthCode(organizationId, code, redirectUri);

    await prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider: 'teams' } },
      create: { organizationId, provider: 'teams', displayName: 'Microsoft Teams', status: 'CONNECTED', connectedAt: new Date() },
      update: { status: 'CONNECTED', connectedAt: new Date() },
    });

    return this.connectedState();
  }

  async disconnect(organizationId: string, _integrationId: string): Promise<void> {
    await prisma.integration.updateMany({ where: { organizationId, provider: 'teams' }, data: { status: 'DISCONNECTED', disconnectedAt: new Date() } });
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  async healthCheck(organizationId: string, integrationId: string): Promise<IntegrationHealthReport> {
    const start = Date.now();
    try {
      const token = await this.getValidToken(organizationId, 'teams');
      const response = await fetch(`${GRAPH_API}/me`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      return { provider: this.name, integrationId, healthy: response.ok, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: response.ok ? undefined : `Status ${response.status}` };
    } catch (err: any) {
      return { provider: this.name, integrationId, healthy: false, checkedAt: new Date().toISOString(), error: err.message };
    }
  }

  // ─── Push: send Teams channel message ────────────────────────────────────────

  async pushData(organizationId: string, _integrationId: string, request: PushDataRequest): Promise<void> {
    if (request.entityType !== 'message') return;

    const { teamId, channelId, title, message, severity } = request.records[0] as {
      teamId: string;
      channelId: string;
      title: string;
      message: string;
      severity?: string;
    };

    // Try OAuth first
    try {
      const token = await this.getValidToken(organizationId, 'teams');
      const color = { info: 'accent', success: 'good', warning: 'warning', critical: 'attention' }[severity ?? 'info'] ?? 'accent';

      const body = {
        body: {
          contentType: 'html',
          content: `<strong>${title}</strong><br/>${message}`,
        },
      };

      const response = await fetch(`${GRAPH_API}/teams/${teamId}/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) throw new Error(`Teams message failed: ${response.status}`);
      return;
    } catch {
      // Fall back to incoming webhook if configured
    }

    // Incoming webhook fallback
    const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
    if (!webhookUrl) {
      this.log('warn', 'Teams: no token or webhook configured', { organizationId });
      return;
    }

    const card = {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      summary: title,
      themeColor: { info: '0078D4', success: '28a745', warning: 'ffc107', critical: 'dc3545' }[severity ?? 'info'],
      title,
      text: message,
    };

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card),
    });
  }

  async initialSync(organizationId: string, integrationId: string): Promise<SyncResult> {
    return this.buildSyncResult(integrationId, 'initial', Date.now(), { recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, errors: [] });
  }

  getConfig(): IntegrationProviderConfig {
    return {
      name: this.name,
      displayName: this.displayName,
      description: 'Send notifications and reports to Microsoft Teams channels.',
      capabilities: this.capabilities,
      oauthConfig: {
        clientId: process.env.AZURE_CLIENT_ID ?? '',
        clientSecret: process.env.AZURE_CLIENT_SECRET ?? '',
        authorizationUrl: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID ?? 'common'}/oauth2/v2.0/authorize`,
        tokenUrl: this.tokenUrl,
        scopes: ['https://graph.microsoft.com/ChannelMessage.Send', 'offline_access'],
        redirectUri: `${process.env.APP_URL}/api/integrations/teams/callback`,
      },
    };
  }
}
