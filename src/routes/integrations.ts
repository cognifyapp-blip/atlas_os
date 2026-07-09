/**
 * Atlas OS — Integration Routes
 *
 * OAuth callback endpoints, connection management, and sync triggers
 * for all external integrations.
 *
 * Base path: /api/integrations
 *
 *   GET  /api/integrations/:provider/connect      — Returns OAuth authorization URL
 *   GET  /api/integrations/:provider/callback     — OAuth callback (exchange code)
 *   POST /api/integrations/:provider/disconnect   — Revoke and disconnect
 *   GET  /api/integrations/:provider/status       — Health check
 *   POST /api/integrations/:provider/sync         — Trigger manual sync
 *   GET  /api/integrations                        — List all integrations with status
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { integrationRegistry } from '../integrations/IntegrationRegistry.js';
import { integrationManager } from '../integrations/IntegrationManager.js';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`[Integration Route Error]`, err.message);
      res.status(500).json({ error: err.message });
    });
  };
}

async function getOrgId(): Promise<string> {
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found.');
  return org.id;
}

// ─── List all integrations ────────────────────────────────────────────────────

router.get('/', wrap(async (_req, res) => {
  const orgId = await getOrgId();
  const providers = integrationRegistry.listAll();

  const dbIntegrations = await prisma.integration.findMany({
    where: { organizationId: orgId },
  });

  const result = providers.map((p) => {
    const dbRecord = dbIntegrations.find((i) => i.provider === p.name);
    return {
      provider: p.name,
      displayName: p.displayName,
      capabilities: p.capabilities,
      status: dbRecord?.status ?? 'DISCONNECTED',
      connectedAt: dbRecord?.connectedAt ?? null,
      lastSyncAt: dbRecord?.lastSyncAt ?? null,
      config: integrationRegistry.get(p.name).getConfig(),
    };
  });

  res.json({ integrations: result });
}));

// ─── Get OAuth authorization URL ─────────────────────────────────────────────

router.get('/:provider/connect', wrap(async (req, res) => {
  const { provider } = req.params;

  if (!integrationRegistry.has(provider)) {
    return res.status(404).json({ error: `Provider "${provider}" not registered.` });
  }

  const integration = integrationRegistry.get(provider);
  const config = integration.getConfig();

  if (!config.oauthConfig) {
    return res.status(400).json({ error: `Provider "${provider}" does not support OAuth.` });
  }

  const { authorizationUrl, clientId, scopes, redirectUri } = config.oauthConfig;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state: provider,
    access_type: 'offline',
    prompt: 'consent',
  });

  // QuickBooks needs extra params
  if (provider === 'quickbooks') {
    params.delete('access_type');
    params.delete('prompt');
    params.set('response_type', 'code');
  }

  const url = `${authorizationUrl}?${params.toString()}`;
  res.json({ authorizationUrl: url, provider });
}));

// ─── OAuth callback ───────────────────────────────────────────────────────────

router.get('/:provider/callback', wrap(async (req, res) => {
  const { provider } = req.params;
  const { code, error, error_description, realmId } = req.query as Record<string, string>;

  if (error) {
    return res.redirect(`${process.env.APP_URL ?? ''}/?integration_error=${encodeURIComponent(error_description ?? error)}&provider=${provider}`);
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code missing.' });
  }

  const orgId = await getOrgId();

  if (!integrationRegistry.has(provider)) {
    return res.status(404).json({ error: `Provider "${provider}" not registered.` });
  }

  const integration = integrationRegistry.get(provider);
  const config = integration.getConfig();
  const redirectUri = config.oauthConfig?.redirectUri ?? '';

  const credentials: Record<string, string> = { code, redirectUri };
  if (realmId) credentials.realmId = realmId; // QuickBooks

  await integration.connect(orgId, credentials);

  // Trigger initial sync in background
  const dbRecord = await prisma.integration.findFirst({ where: { organizationId: orgId, provider } });
  if (dbRecord) {
    integrationManager.triggerInitialSync(orgId, 'system', provider, dbRecord.id).catch((err) => {
      console.error(`[Integration] Initial sync trigger failed for ${provider}: ${err.message}`);
    });
  }

  // Redirect back to the app's integrations page
  res.redirect(`${process.env.APP_URL ?? ''}/?integration_connected=${provider}`);
}));

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.post('/:provider/disconnect', wrap(async (req, res) => {
  const { provider } = req.params;
  const orgId = await getOrgId();

  const dbRecord = await prisma.integration.findFirst({ where: { organizationId: orgId, provider } });
  if (!dbRecord) return res.status(404).json({ error: `Integration "${provider}" not found.` });

  if (integrationRegistry.has(provider)) {
    await integrationRegistry.get(provider).disconnect(orgId, dbRecord.id);
  }

  res.json({ success: true, provider, status: 'DISCONNECTED' });
}));

// ─── Health check ─────────────────────────────────────────────────────────────

router.get('/:provider/status', wrap(async (req, res) => {
  const { provider } = req.params;
  const orgId = await getOrgId();

  if (!integrationRegistry.has(provider)) {
    return res.status(404).json({ error: `Provider "${provider}" not registered.` });
  }

  const dbRecord = await prisma.integration.findFirst({ where: { organizationId: orgId, provider } });
  const integration = integrationRegistry.get(provider);

  const health = await integration.healthCheck(orgId, dbRecord?.id ?? 'unknown');
  res.json({ ...health, dbRecord: dbRecord ?? null });
}));

// ─── Manual sync trigger ─────────────────────────────────────────────────────

router.post('/:provider/sync', wrap(async (req, res) => {
  const { provider } = req.params;
  const { mode = 'incremental' } = req.body;
  const orgId = await getOrgId();

  const dbRecord = await prisma.integration.findFirst({ where: { organizationId: orgId, provider } });
  if (!dbRecord) return res.status(404).json({ error: `Integration "${provider}" not connected.` });
  if (dbRecord.status !== 'CONNECTED') return res.status(400).json({ error: `Integration "${provider}" is not connected.` });

  await integrationManager.triggerInitialSync(orgId, 'system', provider, dbRecord.id);

  res.json({ success: true, provider, mode, message: `Sync queued for ${provider}` });
}));

export default router;
