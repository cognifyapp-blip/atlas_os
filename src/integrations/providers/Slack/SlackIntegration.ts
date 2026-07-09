/**
 * Atlas OS — Slack Integration
 *
 * Real Slack integration:
 *   - OAuth 2.0 (Slack) code exchange
 *   - Send messages to channels via Slack Web API
 *   - Incoming webhook support for notifications
 *   - Used by Orion (incident alerts), Sage (HR notices), Atlas (board updates)
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

const SLACK_TOKEN_URL = 'https://slack.com/api/oauth.v2.access';
const SLACK_API = 'https://slack.com/api';

export class SlackIntegration extends OAuthIntegration {
  readonly name = 'slack';
  readonly displayName = 'Slack';
  readonly capabilities: IntegrationCapability[] = [
    'oauth',
    'push',
    'health_check',
  ];

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  async exchangeOAuthCode(organizationId: string, code: string, redirectUri: string): Promise<OAuthTokenData> {
    const clientId = process.env.SLACK_CLIENT_ID ?? '';
    const clientSecret = process.env.SLACK_CLIENT_SECRET ?? '';
    if (!clientId || !clientSecret) throw new Error('SLACK_CLIENT_ID and SLACK_CLIENT_SECRET are required.');

    const response = await fetch(SLACK_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri }).toString(),
    });

    const data = await response.json() as { ok: boolean; access_token?: string; bot_user_id?: string; team?: { id: string; name: string }; error?: string };

    if (!data.ok || !data.access_token) throw new Error(`Slack OAuth failed: ${data.error}`);

    const token: OAuthTokenData = {
      accessToken: data.access_token,
      scopes: ['chat:write', 'channels:read', 'users:read'],
      tokenType: 'Bearer',
    };

    await this.saveToken(organizationId, 'slack', token);

    // Store team info
    await prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider: 'slack' } },
      create: { organizationId, provider: 'slack', displayName: 'Slack', status: 'CONNECTED', connectedAt: new Date(), metadata: { teamId: data.team?.id, teamName: data.team?.name, botUserId: data.bot_user_id } },
      update: { status: 'CONNECTED', connectedAt: new Date(), metadata: { teamId: data.team?.id, teamName: data.team?.name, botUserId: data.bot_user_id } },
    });

    return token;
  }

  // Slack tokens don't expire — no refresh needed
  async refreshToken(organizationId: string, integrationId: string): Promise<OAuthTokenData> {
    const token = await this.loadToken(organizationId, integrationId);
    if (!token) throw new Error('No Slack token found — reconnect.');
    return token;
  }

  // ─── Connect ─────────────────────────────────────────────────────────────────

  async connect(organizationId: string, credentials: Record<string, unknown>): Promise<IntegrationConnectionState> {
    const { code, redirectUri } = credentials as { code: string; redirectUri: string };
    await this.exchangeOAuthCode(organizationId, code, redirectUri);
    return this.connectedState();
  }

  async disconnect(organizationId: string, _integrationId: string): Promise<void> {
    await prisma.integration.updateMany({ where: { organizationId, provider: 'slack' }, data: { status: 'DISCONNECTED', disconnectedAt: new Date() } });
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  async healthCheck(organizationId: string, integrationId: string): Promise<IntegrationHealthReport> {
    const start = Date.now();
    try {
      const token = await this.getValidToken(organizationId, 'slack');
      const response = await fetch(`${SLACK_API}/auth.test`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const data = await response.json() as { ok: boolean; error?: string };
      return { provider: this.name, integrationId, healthy: data.ok, latencyMs: Date.now() - start, checkedAt: new Date().toISOString(), error: data.ok ? undefined : data.error };
    } catch (err: any) {
      return { provider: this.name, integrationId, healthy: false, checkedAt: new Date().toISOString(), error: err.message };
    }
  }

  // ─── Push: send Slack message ────────────────────────────────────────────────

  async pushData(organizationId: string, _integrationId: string, request: PushDataRequest): Promise<void> {
    if (request.entityType !== 'message') return;

    const token = await this.getValidToken(organizationId, 'slack');
    const { channel, text, blocks } = request.records[0] as { channel: string; text: string; blocks?: unknown[] };

    const response = await fetch(`${SLACK_API}/chat.postMessage`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel, text, blocks }),
    });

    const data = await response.json() as { ok: boolean; error?: string };
    if (!data.ok) throw new Error(`Slack message failed: ${data.error}`);
  }

  /**
   * Convenience: post a notification message to a Slack channel.
   */
  async postMessage(organizationId: string, params: {
    channel: string;
    title: string;
    message: string;
    severity?: 'info' | 'warning' | 'critical' | 'success';
    actionUrl?: string;
  }): Promise<void> {
    const color = {
      info: '#0078D4',
      success: '#28a745',
      warning: '#ffc107',
      critical: '#dc3545',
    }[params.severity ?? 'info'];

    const emoji = { info: 'ℹ️', success: '✅', warning: '⚠️', critical: '🚨' }[params.severity ?? 'info'];

    await this.pushData(organizationId, 'slack', {
      entityType: 'message',
      organizationId,
      records: [{
        channel: params.channel,
        text: `${emoji} *${params.title}*: ${params.message}`,
        blocks: [
          { type: 'section', text: { type: 'mrkdwn', text: `${emoji} *${params.title}*\n${params.message}` } },
          ...(params.actionUrl ? [{ type: 'actions', elements: [{ type: 'button', text: { type: 'plain_text', text: 'View in Atlas OS' }, url: params.actionUrl }] }] : []),
        ],
      }],
    });
  }

  async initialSync(organizationId: string, integrationId: string): Promise<SyncResult> {
    return this.buildSyncResult(integrationId, 'initial', Date.now(), { recordsProcessed: 0, recordsCreated: 0, recordsUpdated: 0, recordsSkipped: 0, errors: [] });
  }

  getConfig(): IntegrationProviderConfig {
    return {
      name: this.name,
      displayName: this.displayName,
      description: 'Send notifications, alerts, and reports to Slack channels.',
      capabilities: this.capabilities,
      oauthConfig: {
        clientId: process.env.SLACK_CLIENT_ID ?? '',
        clientSecret: process.env.SLACK_CLIENT_SECRET ?? '',
        authorizationUrl: 'https://slack.com/oauth/v2/authorize',
        tokenUrl: SLACK_TOKEN_URL,
        scopes: ['chat:write', 'channels:read', 'channels:join', 'users:read'],
        redirectUri: `${process.env.APP_URL}/api/integrations/slack/callback`,
      },
    };
  }
}
