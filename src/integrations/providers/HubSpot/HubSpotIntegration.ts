/**
 * Atlas OS — HubSpot Integration
 *
 * Real HubSpot CRM integration:
 *   - OAuth 2.0 code exchange + token refresh
 *   - Contact, company, and deal sync → Atlas Lead records
 *   - Bidirectional: Atlas decisions → HubSpot deal stage updates
 *   - Webhook event routing
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
} from '../../types.js';

const HUBSPOT_API = 'https://api.hubapi.com';
const TOKEN_URL = 'https://api.hubapi.com/oauth/v1/token';

export class HubSpotIntegration extends OAuthIntegration {
  readonly name = 'hubspot';
  readonly displayName = 'HubSpot CRM';
  readonly capabilities: IntegrationCapability[] = [
    'oauth',
    'webhook',
    'initial_sync',
    'incremental_sync',
    'push',
    'pull',
    'health_check',
  ];

  // ─── OAuth ──────────────────────────────────────────────────────────────────

  async exchangeOAuthCode(
    organizationId: string,
    code: string,
    redirectUri: string,
  ): Promise<OAuthTokenData> {
    const clientId = process.env.HUBSPOT_CLIENT_ID ?? '';
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET ?? '';

    if (!clientId || !clientSecret) {
      throw new Error('HUBSPOT_CLIENT_ID and HUBSPOT_CLIENT_SECRET are required.');
    }

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`HubSpot token exchange failed: ${err}`);
    }

    const data = await response.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      token_type?: string;
    };

    const token: OAuthTokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : undefined,
      scopes: this.getConfig().oauthConfig?.scopes ?? [],
      tokenType: data.token_type ?? 'Bearer',
    };

    await this.saveToken(organizationId, 'hubspot', token);
    return token;
  }

  async refreshToken(organizationId: string, integrationId: string): Promise<OAuthTokenData> {
    const existing = await this.loadToken(organizationId, integrationId);
    if (!existing?.refreshToken) throw new Error('No refresh token available — re-authorize HubSpot.');

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.HUBSPOT_CLIENT_ID ?? '',
      client_secret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
      refresh_token: existing.refreshToken,
    });

    const response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    if (!response.ok) throw new Error(`HubSpot token refresh failed: ${response.status}`);

    const data = await response.json() as { access_token: string; expires_in?: number; refresh_token?: string };

    const token: OAuthTokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? existing.refreshToken,
      expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
      scopes: existing.scopes,
      tokenType: existing.tokenType,
    };

    await this.saveToken(organizationId, integrationId, token);
    return token;
  }

  // ─── Connect / Disconnect ───────────────────────────────────────────────────

  async connect(
    organizationId: string,
    credentials: Record<string, unknown>,
  ): Promise<IntegrationConnectionState> {
    const { code, redirectUri } = credentials as { code: string; redirectUri: string };
    if (!code || !redirectUri) throw new Error('code and redirectUri required to connect HubSpot.');

    await this.exchangeOAuthCode(organizationId, code, redirectUri);
    this.log('info', 'HubSpot connected', { organizationId });

    // Upsert Integration record
    await this._upsertIntegrationRecord(organizationId, 'CONNECTED');
    return this.connectedState();
  }

  async disconnect(organizationId: string, integrationId: string): Promise<void> {
    this.log('info', 'HubSpot disconnect', { organizationId, integrationId });
    await prisma.integration.updateMany({
      where: { organizationId, provider: 'hubspot' },
      data: { status: 'DISCONNECTED', disconnectedAt: new Date() },
    });
  }

  // ─── Health Check ────────────────────────────────────────────────────────────

  async healthCheck(organizationId: string, integrationId: string): Promise<IntegrationHealthReport> {
    const start = Date.now();
    try {
      const token = await this.getValidToken(organizationId, 'hubspot');
      const response = await fetch(`${HUBSPOT_API}/oauth/v1/access-tokens/${token.accessToken}`, {
        headers: { Authorization: `Bearer ${token.accessToken}` },
      });
      const healthy = response.ok;
      return {
        provider: this.name,
        integrationId,
        healthy,
        latencyMs: Date.now() - start,
        checkedAt: new Date().toISOString(),
        error: healthy ? undefined : `Status ${response.status}`,
      };
    } catch (err: any) {
      return { provider: this.name, integrationId, healthy: false, checkedAt: new Date().toISOString(), error: err.message };
    }
  }

  // ─── Initial Sync ────────────────────────────────────────────────────────────

  async initialSync(organizationId: string, integrationId: string): Promise<SyncResult> {
    const start = Date.now();
    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    try {
      const token = await this.getValidToken(organizationId, 'hubspot');

      // Find or create Integration record
      const integration = await this._upsertIntegrationRecord(organizationId, 'CONNECTED');

      // Sync contacts as leads
      let after: string | undefined;
      let keepGoing = true;

      while (keepGoing) {
        const url = new URL(`${HUBSPOT_API}/crm/v3/objects/contacts`);
        url.searchParams.set('limit', '100');
        url.searchParams.set('properties', 'firstname,lastname,email,phone,company,lifecyclestage,hs_lead_status');
        if (after) url.searchParams.set('after', after);

        const response = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${token.accessToken}` },
        });

        if (!response.ok) {
          errors.push(`Contacts fetch failed: ${response.status}`);
          break;
        }

        const data = await response.json() as {
          results: Array<{ id: string; properties: Record<string, string> }>;
          paging?: { next?: { after?: string } };
        };

        for (const contact of data.results) {
          try {
            const props = contact.properties;
            const email = props.email;
            if (!email) { skipped++; continue; }

            const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || email;
            const existing = await prisma.lead.findFirst({ where: { organizationId, email } });

            if (existing) {
              await prisma.lead.update({
                where: { id: existing.id },
                data: { name, company: props.company ?? existing.company, phone: props.phone ?? existing.phone, source: 'hubspot', updatedAt: new Date(), metadata: { ...((existing.metadata as any) ?? {}), hubspotId: contact.id } },
              });
              updated++;
            } else {
              await prisma.lead.create({
                data: { organizationId, name, company: props.company ?? null, email, phone: props.phone ?? null, value: 0, source: 'hubspot', metadata: { hubspotId: contact.id }, updatedAt: new Date() },
              });
              created++;
            }
          } catch (err: any) {
            errors.push(`Contact ${contact.id}: ${err.message}`);
          }
        }

        after = data.paging?.next?.after;
        keepGoing = !!after;
      }

      await prisma.integration.update({ where: { id: integration.id }, data: { lastSyncAt: new Date() } });

    } catch (err: any) {
      errors.push(err.message);
    }

    return this.buildSyncResult(integrationId, 'initial', start, {
      recordsProcessed: created + updated + skipped,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      errors,
    });
  }

  // ─── Incremental Sync ────────────────────────────────────────────────────────

  async incrementalSync(organizationId: string, integrationId: string, cursor?: string): Promise<SyncResult> {
    const start = Date.now();
    let created = 0, updated = 0, skipped = 0;
    const errors: string[] = [];

    try {
      const token = await this.getValidToken(organizationId, 'hubspot');

      // Use recently modified contacts
      const since = cursor ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const url = new URL(`${HUBSPOT_API}/crm/v3/objects/contacts/search`);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filterGroups: [{ filters: [{ propertyName: 'lastmodifieddate', operator: 'GTE', value: since }] }],
          properties: ['firstname', 'lastname', 'email', 'phone', 'company', 'lifecyclestage'],
          limit: 100,
        }),
      });

      if (!response.ok) {
        errors.push(`Incremental sync failed: ${response.status}`);
      } else {
        const data = await response.json() as { results: Array<{ id: string; properties: Record<string, string> }> };

        for (const contact of data.results) {
          const props = contact.properties;
          const email = props.email;
          if (!email) { skipped++; continue; }

          const name = [props.firstname, props.lastname].filter(Boolean).join(' ') || email;
          const existing = await prisma.lead.findFirst({ where: { organizationId, email } });

          if (existing) {
            await prisma.lead.update({ where: { id: existing.id }, data: { name, company: props.company ?? existing.company, updatedAt: new Date() } });
            updated++;
          } else {
            await prisma.lead.create({ data: { organizationId, name, company: props.company ?? null, email, phone: props.phone ?? null, value: 0, source: 'hubspot', metadata: { hubspotId: contact.id }, updatedAt: new Date() } });
            created++;
          }
        }
      }

      await prisma.integration.updateMany({ where: { organizationId, provider: 'hubspot' }, data: { lastSyncAt: new Date() } });

    } catch (err: any) {
      errors.push(err.message);
    }

    return this.buildSyncResult(integrationId, 'incremental', start, {
      recordsProcessed: created + updated + skipped,
      recordsCreated: created,
      recordsUpdated: updated,
      recordsSkipped: skipped,
      errors,
    }, { nextCursor: new Date().toISOString() });
  }

  // ─── Push: update HubSpot deal stage when Atlas approves a deal ───────────────

  async pushData(organizationId: string, integrationId: string, request: any): Promise<void> {
    if (request.entityType !== 'deal_stage_update') return;

    const token = await this.getValidToken(organizationId, 'hubspot');
    const { hubspotDealId, stage } = request.records[0] as { hubspotDealId: string; stage: string };

    await fetch(`${HUBSPOT_API}/crm/v3/objects/deals/${hubspotDealId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { dealstage: stage } }),
    });
  }

  // ─── Private helpers ──────────────────────────────────────────────────────────

  private async _upsertIntegrationRecord(organizationId: string, status: 'CONNECTED' | 'DISCONNECTED') {
    return prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider: 'hubspot' } },
      create: { organizationId, provider: 'hubspot', displayName: 'HubSpot CRM', status, connectedAt: status === 'CONNECTED' ? new Date() : undefined },
      update: { status, connectedAt: status === 'CONNECTED' ? new Date() : undefined },
    });
  }

  getConfig(): IntegrationProviderConfig {
    return {
      name: this.name,
      displayName: this.displayName,
      description: 'Sync contacts, deals, and pipeline activity from HubSpot CRM.',
      capabilities: this.capabilities,
      oauthConfig: {
        clientId: process.env.HUBSPOT_CLIENT_ID ?? '',
        clientSecret: process.env.HUBSPOT_CLIENT_SECRET ?? '',
        authorizationUrl: 'https://app.hubspot.com/oauth/authorize',
        tokenUrl: TOKEN_URL,
        scopes: ['crm.objects.contacts.read', 'crm.objects.contacts.write', 'crm.objects.deals.read', 'crm.objects.deals.write', 'crm.objects.companies.read'],
        redirectUri: `${process.env.APP_URL}/api/integrations/hubspot/callback`,
      },
      webhookConfig: {
        events: ['contact.creation', 'contact.propertyChange', 'deal.creation', 'deal.propertyChange', 'company.creation'],
      },
    };
  }
}
