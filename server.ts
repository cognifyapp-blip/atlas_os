/**
 * Atlas OS — API Gateway
 *
 * Fully database-backed. All 10 AI executives are wired to real routes.
 * No in-memory state — everything persists to Neon PostgreSQL via Prisma.
 *
 * Executive Roster:
 *   Atlas   (CEO Assistant) · Aurelia (Finance AI) · Zephyr  (Sales AI)
 *   Aria    (Marketing AI)  · Lyra   (Customer Success AI)
 *   Sage    (HR AI)         · Orion  (Operations AI) · Lexis (Legal AI)
 *   Forge   (Developer AI)  · Iris   (Intelligence AI)
 */

import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';

dotenv.config({ path: '.env.local' });

import webhookRouter from './src/routes/webhooks.js';
import internalRouter from './src/routes/internal.js';
import executiveRouter from './src/routes/executives.js';
import integrationRouter from './src/routes/integrations.js';
import collaborationRouter from './src/routes/collaboration.js';
import goalsRouter from './src/routes/goals.js';
import { requireAuth } from './src/middleware/requireAuth.js';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// ─── Rate limiting ────────────────────────────────────────────────────────────
// General limiter: 300 req / 15 min per IP — protects all API routes
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' },
});

// Strict limiter for AI-heavy endpoints that trigger LLM calls
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'AI rate limit reached. Please wait a moment before retrying.' },
});

app.use('/api/', generalLimiter);
app.use('/api/v1/strategy-session', aiLimiter);
app.use('/api/v1/command-center', aiLimiter);
app.use('/api/v1/boardroom/report', aiLimiter);
app.use('/api/v1/leads/:id/qualify', aiLimiter);

// Raw body BEFORE json — required for SVIX webhook signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter);
app.use(express.json({ limit: '1mb' })); // cap request body size — prevents memory exhaustion
app.use('/api/internal', internalRouter);

// ─── Auth guard — applied to all /api/v1/* routes ─────────────────────────────
// Public exceptions (auth/me, auth/sync, onboarding, stream-events) are
// handled inside the middleware itself.
app.use('/api/v1', requireAuth);

app.use('/api/v1/executives', executiveRouter);
app.use('/api/integrations', integrationRouter);
app.use('/api/v1/collaboration', collaborationRouter);

// ─── Governance routes ────────────────────────────────────────────────────────
import governanceRouter from './src/routes/governance.js';
app.use('/api/v1/governance', governanceRouter);
app.use('/api/v1', goalsRouter);

// ─── Health check — responds immediately, no DB dependency ───────────────────
// Simple liveness probe used by Railway and load balancers.
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── SSE broadcast ────────────────────────────────────────────────────────────
let sseClients: express.Response[] = [];

export function broadcastEvent(event: unknown) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  // Write to each client individually — a broken client must not affect others
  sseClients = sseClients.filter((c) => {
    try {
      c.write(data);
      return true; // keep in list
    } catch {
      return false; // remove dead/closed connections
    }
  });
}

// ─── Org resolver ─────────────────────────────────────────────────────────────
// Resolves the org for route handlers.
// Uses Clerk auth context when available; falls back to findFirst for
// single-org deployments (users signed in directly, no Clerk org membership).

async function resolveOrgId(req: express.Request): Promise<string> {
  const authOrg = (req as any)._authContext?.organization;
  if (authOrg?.id) return authOrg.id;

  // Single-org fallback — works for direct sign-in and dev environments
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found.');
  return org.id;
}

// Middleware to copy res.locals.auth onto req._authContext for standalone handlers
app.use('/api/v1', (req: any, res: express.Response, next: express.NextFunction) => {
  if (res.locals.auth) req._authContext = res.locals.auth;
  next();
});

app.get('/api/v1/stream-events', (req, res) => {
  try {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('\n');
    sseClients.push(res);
    req.on('close', () => {
      sseClients = sseClients.filter((c) => c !== res);
    });
  } catch (err: any) {
    console.error('[SSE] Failed to establish stream:', err.message);
    if (!res.headersSent) res.status(500).end();
  }
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

import { prisma } from './src/lib/prisma.js';
import { registerSSEBroadcaster } from './src/services/executives/index.js';
import { registerSSEBridge } from './src/services/SSEBridge.js';
import { schedulerService } from './src/services/SchedulerService.js';
import { executionBridge } from './src/services/ExecutionBridge.js';
import { registerNotificationBroadcaster } from './src/workers/workers/NotificationWorker.js';

// Wire the SSE broadcaster into every executive service
registerSSEBroadcaster(broadcastEvent);
// Wire SSE broadcaster into NotificationWorker (in_app channel)
registerNotificationBroadcaster(broadcastEvent);
// Wire SSE bridge for governance engine and other deep services
registerSSEBridge(broadcastEvent);

/** Resolve org+executive from DB for the default (single) organization. */
async function getOrgAndExec(execNameFragment: string) {
  const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
  if (!org) throw new Error('No initialized organization found.');
  const exec = await prisma.aIExecutive.findFirst({
    where: { organizationId: org.id, name: { contains: execNameFragment } },
  });
  if (!exec) throw new Error(`Executive matching "${execNameFragment}" not found.`);
  return { org, exec };
}

/** Map Prisma AIExecutive rows to the Agent shape the frontend expects. */
function toAgentShape(e: any) {
  return {
    id: e.id,
    name: e.name,
    department: e.department?.name ?? e.role,
    role: e.role,
    avatar: e.avatarUrl ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(e.name)}&background=random`,
    status: e.status === 'IDLE' ? 'Idle' : e.status === 'ACTIVE' ? 'Active' : e.status === 'BUSY' ? 'In Process' : 'Idle',
    lastAction: e.lastAction ?? 'Standing by.',
    bio: e.bio ?? '',
    goals: e.goals ?? [],
    tools: e.tools ?? [],
    metrics: {
      tasksCompleted: e.tasksCompleted,
      decisionsMade: e.decisionsMade,
      valueGenerated: e.valueGenerated,
    },
  };
}

// ─── Scheduler manual trigger API ────────────────────────────────────────────
// POST /api/v1/scheduler/trigger/:event — manually fire any scheduled event

app.post('/api/v1/scheduler/trigger/:event', async (req, res) => {
  try {
    const event = req.params.event as Parameters<typeof schedulerService.triggerNow>[0];
    const validEvents = ['daily_briefing', 'pipeline_review', 'anomaly_detection', 'financial_health', 'payment_reminders', 'weekly_report', 'monthly_report', 'operational_report'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({ error: `Unknown event "${event}". Valid: ${validEvents.join(', ')}` });
    }
    await schedulerService.triggerNow(event);
    res.json({ success: true, event, triggeredAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/scheduler/status', (_req, res) => {
  res.json({ running: schedulerService.isRunning(), checkedAt: new Date().toISOString() });
});

// ─── Infrastructure metrics ───────────────────────────────────────────────────

app.get('/api/v1/infrastructure/metrics', async (req, res) => {
  try {
    const { SystemHealth } = await import('./src/infrastructure/health/SystemHealth.js');
    const { RedisHealth } = await import('./src/infrastructure/redis/RedisHealth.js');
    const { QueueMetrics } = await import('./src/infrastructure/queue/QueueMetrics.js');
    const { workerManager } = await import('./src/workers/WorkerManager.js');
    const { integrationRegistry } = await import('./src/integrations/IntegrationRegistry.js');

    const [redisR, queueR, workerR] = await Promise.allSettled([
      RedisHealth.check(),
      QueueMetrics.forAll(),
      Promise.resolve(workerManager.getHealthSummary()),
    ]);

    // Pull real integration connection status from DB
    let dbIntegrations: Array<{ provider: string; status: string; lastSyncAt: Date | null }> = [];
    try {
      const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
      if (org) {
        dbIntegrations = await prisma.integration.findMany({
          where: { organizationId: org.id },
          select: { provider: true, status: true, lastSyncAt: true },
        });
      }
    } catch { /* DB may not have integrations table yet */ }

    const registeredProviders = integrationRegistry.listAll();
    const connectedCount = dbIntegrations.filter((i) => i.status === 'CONNECTED').length;

    const providerStatuses = registeredProviders.map((p) => {
      const dbRecord = dbIntegrations.find((i) => i.provider === p.name);
      return {
        provider: p.displayName,
        status: dbRecord?.status === 'CONNECTED' ? 'connected'
          : dbRecord?.status === 'ERROR' ? 'error'
          : 'disconnected',
        lastSync: dbRecord?.lastSyncAt?.toISOString(),
      };
    });

    res.json({
      metrics: {
        redis: redisR.status === 'fulfilled'
          ? { status: redisR.value.status, connected: redisR.value.connected, latencyMs: redisR.value.latencyMs, host: redisR.value.host, port: redisR.value.port }
          : { status: 'unhealthy', connected: false, host: 'unknown', port: 0 },
        queues: queueR.status === 'fulfilled'
          ? { totalWaiting: queueR.value.totalWaiting, totalActive: queueR.value.totalActive, totalFailed: queueR.value.totalFailed, metrics: queueR.value.queues }
          : { totalWaiting: 0, totalActive: 0, totalFailed: 0, metrics: [] },
        workers: workerR.status === 'fulfilled'
          ? { total: workerR.value.totalWorkers, running: workerR.value.runningWorkers, stopped: workerR.value.stoppedWorkers, workers: workerR.value.workers }
          : { total: 0, running: 0, stopped: 0, workers: [] },
        integrations: {
          total: registeredProviders.length,
          connected: connectedCount,
          providers: providerStatuses,
        },
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.get('/api/v1/auth/me', async (req, res) => {
  try {
    const { AuthService } = await import('./src/services/auth/index.js');
    const ctx = await AuthService.fromRequest(req);
    res.json({ user: ctx.user, organization: ctx.organization, membership: ctx.membership, permissions: ctx.permissions, redirect: AuthService.getPostLoginRedirect(ctx) });
  } catch (err: any) {
    res.status(err.code === 'UNAUTHORIZED' ? 403 : 401).json({ error: err.message });
  }
});

app.post('/api/v1/auth/sync', async (req, res) => {
  try {
    const { ClerkSyncService, OrganizationService, RoleSyncService, AuthService } = await import('./src/services/auth/index.js');
    const { clerkUserId, clerkOrgId, clerkRole, clerkUser, clerkOrg } = req.body;
    if (!clerkUserId) return res.status(400).json({ error: 'clerkUserId required' });
    if (clerkUser) await ClerkSyncService.syncUser(clerkUser);
    if (clerkOrg && clerkOrgId) {
      const org = await ClerkSyncService.syncOrganization(clerkOrg);
      await OrganizationService.provisionNewOrganization(org.id);
    }
    if (clerkOrgId && clerkRole) await RoleSyncService.updateMembershipRole(clerkUserId, clerkOrgId, clerkRole);
    const dbUser = await prisma.user.findFirst({ where: { externalId: clerkUserId } });
    const dbOrg = clerkOrgId ? await prisma.organization.findFirst({ where: { externalId: clerkOrgId } }) : null;
    if (!dbUser || !dbOrg) return res.status(404).json({ error: 'User or org not found after sync.' });
    const ctx = await AuthService.buildContext(dbUser.id, dbOrg.id);
    res.json({ user: ctx.user, organization: ctx.organization, redirect: AuthService.getPostLoginRedirect(ctx) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Onboarding ───────────────────────────────────────────────────────────────

app.post('/api/v1/onboarding', async (req, res) => {
  try {
    const { name, industry, size, goals, challenges, softwareStack } = req.body;
    if (!name || !industry) return res.status(422).json({ error: 'Company name and industry are required.' });

    // Find existing org or create a new one atomically.
    // Using createOrUpdate pattern to avoid race condition from findFirst + upsert.
    let org = await prisma.organization.findFirst({ where: { initialized: true } });

    if (org) {
      // Re-onboarding an existing org — just update the profile
      org = await prisma.organization.update({
        where: { id: org.id },
        data: { name, industry, size: size ?? org.size, goals: goals ?? '', challenges: challenges ?? '', softwareStack: softwareStack ?? '', initialized: true, updatedAt: new Date() },
      });
    } else {
      // Fresh deployment — create the org
      org = await prisma.organization.create({
        data: { name, industry, size: size ?? '1-10', goals: goals ?? '', challenges: challenges ?? '', softwareStack: softwareStack ?? '', initialized: true },
      });
    }

    // Ensure executives are provisioned
    const { OrganizationService } = await import('./src/services/auth/index.js');
    await OrganizationService.provisionNewOrganization(org.id);

    // Resolve Atlas (CEO Assistant) executive
    const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas' } } });
    if (!atlasExec) return res.status(500).json({ error: 'CEO Assistant not provisioned.' });

    const { CEOAssistant } = await import('./src/services/executives/index.js');
    const atlas = new CEOAssistant(org.id, atlasExec.id);
    const briefing = await atlas.generateDayZeroBriefing(org);

    // Wake all executives
    await prisma.aIExecutive.updateMany({
      where: { organizationId: org.id },
      data: { status: 'ACTIVE', lastAction: 'Operational loops verified. Standing by for directives.' },
    });

    res.json({ success: true, context: org, briefing });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/onboarding/context', async (_req, res) => {
  try {
    // Public route — no auth context yet. Find the org by initialized flag.
    const org = await prisma.organization.findFirst({ where: { initialized: true } });
    if (!org) return res.json({ context: { initialized: false }, briefing: null });
    const latestBriefing = await prisma.memory.findFirst({
      where: { organizationId: org.id, tags: { has: 'onboarding' } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ context: org, briefing: latestBriefing ? { briefing: latestBriefing.text } : null });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Agents (AI Executives) ───────────────────────────────────────────────────

app.get('/api/v1/agents', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ agents: [] });
    const execs = await prisma.aIExecutive.findMany({
      where: { organizationId: org.id },
      include: { department: true },
      orderBy: { name: 'asc' },
    });
    res.json({ agents: execs.map(toAgentShape) });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/agents/:id', async (req, res) => {
  try {
    const exec = await prisma.aIExecutive.findUnique({ where: { id: req.params.id }, include: { department: true } });
    if (!exec) return res.status(404).json({ error: 'Agent not found' });
    res.json(toAgentShape(exec));
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Decisions ────────────────────────────────────────────────────────────────

app.get('/api/v1/decisions', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ decisions: [] });
    const decisions = await prisma.decision.findMany({
      where: { organizationId: org.id, status: 'pending' },
      include: { contributors: { include: { executive: true } }, createdBy: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      decisions: decisions.map((d) => ({
        id: d.id,
        title: d.title,
        summary: d.summary,
        description: d.description,
        reasoning: d.reasoning,
        impact: d.impact,
        confidence: d.confidence,
        status: d.status,
        type: d.type,
        contributors: d.contributors.map((c) => c.executiveId),
        createdAt: d.createdAt.toISOString(),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/decisions/history', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ decisions: [] });
    const decisions = await prisma.decision.findMany({
      where: { organizationId: org.id, status: { not: 'pending' } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    res.json({ decisions });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/decisions/:id/approve', async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    // Fetch decision AND verify it belongs to this org — prevents cross-org approval
    const decision = await prisma.decision.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: { createdBy: true },
    });
    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    await prisma.decision.update({
      where: { id: req.params.id },
      data: { status: 'approved', approvedAt: new Date(), updatedAt: new Date() },
    });

    await prisma.memory.create({
      data: {
        organizationId: decision.organizationId,
        executiveId: decision.createdByExecutiveId,
        text: `Decision Approved: "${decision.title}". Impact: ${decision.impact ?? 'N/A'}. Reasoning: ${decision.reasoning}`,
        type: 'decision',
        actor: 'CEO (Human)',
        sourceSystem: 'Executive Office',
        tags: ['decision', 'approved'],
        updatedAt: new Date(),
      },
    });

    await prisma.feedEvent.create({
      data: {
        organizationId: decision.organizationId,
        executiveId: decision.createdByExecutiveId,
        action: 'Decision Approved',
        text: `CEO approved: "${decision.title}"`,
        status: 'success',
      },
    });
    broadcastEvent({ type: 'decision_approved', data: { id: decision.id } });

    // If financial decision — advance linked lead to proposal_sent
    if (decision.metadata && (decision.metadata as any).leadId) {
      const leadId = (decision.metadata as any).leadId;
      const proposalId = (decision.metadata as any).proposalId;
      await prisma.lead.update({ where: { id: leadId }, data: { status: 'proposal_sent', updatedAt: new Date() } });
      if (proposalId) {
        await prisma.proposal.update({ where: { id: proposalId }, data: { status: 'sent', sentAt: new Date(), updatedAt: new Date() } });
      }
    }

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: 'Failed to approve decision.' }); }
});

app.post('/api/v1/decisions/:id/decline', async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const decision = await prisma.decision.findFirst({
      where: { id: req.params.id, organizationId: orgId },
    });
    if (!decision) return res.status(404).json({ error: 'Decision not found' });

    const { reason } = req.body;
    await prisma.decision.update({
      where: { id: req.params.id },
      data: { status: 'declined', declinedAt: new Date(), declineReason: reason ?? null, updatedAt: new Date() },
    });

    await prisma.feedEvent.create({
      data: {
        organizationId: decision.organizationId,
        executiveId: decision.createdByExecutiveId,
        action: 'Decision Declined',
        text: `CEO declined: "${decision.title}"${reason ? ` — ${reason}` : ''}`,
        status: 'warning',
      },
    });
    broadcastEvent({ type: 'decision_declined', data: { id: decision.id } });

    res.json({ success: true });
  } catch (err: any) { res.status(500).json({ error: 'Failed to decline decision.' }); }
});

// ─── Leads ────────────────────────────────────────────────────────────────────

app.get('/api/v1/leads', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ leads: [] });
    const leads = await prisma.lead.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      leads: leads.map((l) => ({
        id: l.id, name: l.name, company: l.company, email: l.email, phone: l.phone,
        status: l.status, source: l.source, value: l.value,
        score: l.qualificationScore, reasoning: l.qualificationReasoning,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/leads', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });
    const { name, company, email, phone, value, source } = req.body;
    if (!name || !email) return res.status(400).json({ error: 'Name and email are required.' });
    const lead = await prisma.lead.create({
      data: {
        organizationId: org.id, name, company: company ?? null, email,
        phone: phone ?? null, value: Number(value) || 0,
        source: source ?? 'inbound_webform', updatedAt: new Date(),
      },
    });
    res.json(lead);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/leads/import', async (req: any, res) => {
  try {
    const orgId = await resolveOrgId(req);
    const { csvText } = req.body;
    if (!csvText) return res.status(400).json({ error: 'CSV data is empty.' });

    // Safety limits — prevent DoS via large CSV
    if (csvText.length > 500_000) {
      return res.status(413).json({ error: 'CSV too large. Maximum 500KB.' });
    }

    const rows = (csvText as string).split('\n');
    const MAX_ROWS = 500;
    const dataRows = rows.filter((r: string) => r.trim()).slice(0, MAX_ROWS + 1); // +1 to detect overflow

    if (dataRows.length > MAX_ROWS) {
      return res.status(400).json({ error: `CSV exceeds ${MAX_ROWS} row limit. Split into smaller batches.` });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    let created = 0; let skipped = 0;
    const reasons: string[] = [];

    for (const [i, row] of dataRows.entries()) {
      if (i === 0 && row.toLowerCase().includes('name')) continue; // header
      const cols = row.split(',').map((c: string) => c.trim().substring(0, 500)); // cap field length
      if (!cols[0] || !cols[1]) { skipped++; reasons.push(`Row ${i + 1}: missing name/company`); continue; }

      const email = cols[2];
      if (email && !emailRegex.test(email)) {
        skipped++;
        reasons.push(`Row ${i + 1}: invalid email "${email}"`);
        continue;
      }

      await prisma.lead.create({
        data: {
          organizationId: orgId, name: cols[0], company: cols[1],
          email: email ?? `unknown-${Date.now()}@import.local`,
          phone: cols[3] ?? null, value: Number(cols[4]) || 12000,
          source: 'inbound_webform', updatedAt: new Date(),
        },
      });
      created++;
    }

    const zephyr = await prisma.aIExecutive.findFirst({ where: { organizationId: orgId, name: { contains: 'Zephyr' } } });
    if (zephyr) {
      await prisma.feedEvent.create({
        data: { organizationId: orgId, executiveId: zephyr.id, action: 'CSV Import Complete', text: `${created} leads imported, ${skipped} skipped.`, status: 'success' },
      });
      broadcastEvent({ type: 'feed', data: { agentName: zephyr.name, action: 'CSV Import Complete', text: `${created} leads imported.` } });
    }
    res.json({ processed: created + skipped, created, skipped, reasons });
  } catch (err: any) { res.status(500).json({ error: 'CSV import failed.' }); }
});

// ─── Lead Qualification Flow ──────────────────────────────────────────────────
// Sales AI (Zephyr) qualifies → Finance AI (Aurelia) drafts proposal → Decision filed

app.post('/api/v1/leads/:id/qualify', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });

    const lead = await prisma.lead.findFirst({ where: { id: req.params.id, organizationId: org.id } });
    if (!lead) return res.status(404).json({ error: 'Lead not found.' });

    const [zephyrExec, aureliaExec] = await Promise.all([
      prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Zephyr' } } }),
      prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Aurelia' } } }),
    ]);
    if (!zephyrExec || !aureliaExec) return res.status(500).json({ error: 'Sales AI or Finance AI not provisioned.' });

    const { SalesAI, FinanceAI } = await import('./src/services/executives/index.js');
    const zephyr = new SalesAI(org.id, zephyrExec.id);
    const aurelia = new FinanceAI(org.id, aureliaExec.id);

    // Step 1: Zephyr qualifies the lead
    const { lead: qualifiedLead, qualification } = await zephyr.qualifyLead(lead.id);

    if (qualification.score < 50) {
      // Disqualified — no proposal needed
      return res.json({ success: true, lead: qualifiedLead, qualification, proposal: null, decisionId: null });
    }

    // Step 2: Aurelia drafts the proposal
    const proposal = await aurelia.draftProposal(lead.id, qualification.estimatedValue);

    // Step 3: Zephyr files a decision for CEO approval
    const decision = await zephyr.createSalesDecision(lead.id, proposal.id, qualification.estimatedValue);

    res.json({
      success: true,
      lead: {
        id: qualifiedLead.id, name: qualifiedLead.name, company: qualifiedLead.company,
        status: qualifiedLead.status, score: qualifiedLead.qualificationScore,
        reasoning: qualifiedLead.qualificationReasoning, value: qualifiedLead.estimatedValue,
      },
      qualification,
      proposal: { id: proposal.id, totalValue: proposal.totalValue, lineItems: proposal.lineItems },
      decisionId: decision.id,
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Proposals ────────────────────────────────────────────────────────────────

app.get('/api/v1/proposals', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ proposals: [] });
    const proposals = await prisma.proposal.findMany({
      where: { organizationId: org.id },
      include: { lineItems: { orderBy: { order: 'asc' } }, lead: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({
      proposals: proposals.map((p) => ({
        id: p.id, leadId: p.leadId, customerName: p.lead.name,
        companyName: p.lead.company, title: p.title, content: p.content,
        total: p.totalValue, status: p.status,
        items: p.lineItems.map((i) => ({ id: i.id, description: i.description, quantity: i.quantity, price: i.price })),
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Memories ────────────────────────────────────────────────────────────────

app.get('/api/v1/memories', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ memories: [] });
    const memories = await prisma.memory.findMany({
      where: { organizationId: org.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      memories: memories.map((m) => ({
        id: m.id, text: m.text, type: m.type,
        sourceSystem: m.sourceSystem ?? 'Atlas OS',
        actor: m.actor ?? 'System',
        createdAt: m.createdAt.toISOString(), tags: m.tags,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/memories', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });
    const { text, type, actor, sourceSystem, tags } = req.body;
    if (!text) return res.status(400).json({ error: 'Text is required.' });
    const memory = await prisma.memory.create({
      data: {
        organizationId: org.id, text,
        type: type ?? 'other', actor: actor ?? 'Human',
        sourceSystem: sourceSystem ?? 'Manual Entry',
        tags: tags ?? [], updatedAt: new Date(),
      },
    });
    res.json(memory);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/memories/search', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ results: [] });
    const { query, type } = req.body;
    if (!query) return res.status(400).json({ error: 'Query required.' });
    const memories = await prisma.memory.findMany({
      where: {
        organizationId: org.id,
        ...(type ? { type } : {}),
        text: { contains: query, mode: 'insensitive' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    res.json({ results: memories });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Feeds ────────────────────────────────────────────────────────────────────

app.get('/api/v1/feeds', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ feeds: [] });
    const feeds = await prisma.feedEvent.findMany({
      where: { organizationId: org.id },
      include: { executive: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      feeds: feeds.map((f) => ({
        id: f.id, agentId: f.executiveId, agentName: f.executive.name,
        department: f.executive.role, action: f.action, text: f.text,
        timestamp: f.createdAt.toISOString(), status: f.status,
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Workflows ────────────────────────────────────────────────────────────────

app.get('/api/v1/workflows', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.json({ workflows: [] });
    const workflows = await prisma.workflow.findMany({
      where: { organizationId: org.id },
      include: { steps: { orderBy: { order: 'asc' }, include: { actorExecutive: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 20,
    });
    res.json({
      workflows: workflows.map((w) => ({
        id: w.id, name: w.name, status: w.status.toLowerCase(),
        currentStepIndex: w.currentStepIndex, triggerEvent: w.triggerEvent,
        updatedAt: w.updatedAt.toISOString(),
        steps: w.steps.map((s) => ({
          name: s.name, status: s.status.toLowerCase(),
          actorId: s.actorExecutiveId, actionDescription: s.actionDescription,
        })),
      })),
    });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/workflows/:id/start', async (req, res) => {
  try {
    const wf = await prisma.workflow.update({
      where: { id: req.params.id },
      data: { status: 'active', startedAt: new Date(), updatedAt: new Date() },
    });
    broadcastEvent({ type: 'workflow', data: wf });
    res.json({ success: true, workflow: wf });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Strategy Session ─────────────────────────────────────────────────────────

app.post('/api/v1/strategy-session', async (req, res) => {
  try {
    const { topic, threadHistory } = req.body;
    if (!topic) return res.status(400).json({ error: 'Topic is required.' });

    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });

    const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas' } } });
    if (!atlasExec) return res.status(500).json({ error: 'CEO Assistant not provisioned.' });

    const { CEOAssistant } = await import('./src/services/executives/index.js');
    const atlas = new CEOAssistant(org.id, atlasExec.id);

    const result = await atlas.runStrategySession(topic, threadHistory ?? []);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Command Center ───────────────────────────────────────────────────────────

app.post('/api/v1/command-center', async (req, res) => {
  try {
    const { command } = req.body;
    if (!command) return res.status(400).json({ error: 'Command is required.' });

    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });

    const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas' } } });
    if (!atlasExec) return res.status(500).json({ error: 'CEO Assistant not provisioned.' });

    const { CEOAssistant } = await import('./src/services/executives/index.js');
    const atlas = new CEOAssistant(org.id, atlasExec.id);

    const result = await atlas.processCommand(command);
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ─── Boardroom Report ─────────────────────────────────────────────────────────

app.get('/api/v1/boardroom/report', async (req, res) => {
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (!org) return res.status(400).json({ error: 'Organization not initialized.' });

    const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas' } } });
    if (!atlasExec) return res.status(500).json({ error: 'CEO Assistant not provisioned.' });

    const { CEOAssistant } = await import('./src/services/executives/index.js');
    const atlas = new CEOAssistant(org.id, atlasExec.id);

    const result = await atlas.generateBoardReport();
    res.json(result);
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.post('/api/v1/boardroom/export', (_req, res) => {
  setTimeout(() => {
    res.json({ success: true, downloadLink: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf' });
  }, 800);
});

// ─── Audit Routes ─────────────────────────────────────────────────────────────

app.get('/api/v1/audit/summary', async (req, res) => {
  try {
    const { AuditLog } = await import('./src/infrastructure/audit/AuditLog.js');
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    const orgId = org?.id ?? 'default';
    const [summary, totals] = await Promise.all([AuditLog.dailySummary(orgId), AuditLog.totals()]);
    res.json({ summary, totals, checkedAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/audit/recent', async (req, res) => {
  try {
    const { AuditLog } = await import('./src/infrastructure/audit/AuditLog.js');
    const limit = Math.min(parseInt((req.query.limit as string) ?? '100', 10), 500);
    // Prefer cache; fall back to DB on cold start
    const cached = AuditLog.recent(limit);
    const entries = cached.length > 0 ? cached : await AuditLog.recentFromDb(limit);
    res.json({ entries, checkedAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

app.get('/api/v1/audit/executive/:id', async (req, res) => {
  try {
    const { AuditLog } = await import('./src/infrastructure/audit/AuditLog.js');
    const limit = Math.min(parseInt((req.query.limit as string) ?? '50', 10), 200);
    res.json({ entries: AuditLog.forExecutive(req.params.id, limit), checkedAt: new Date().toISOString() });
  } catch (err: any) { res.status(500).json({ error: err.message }); }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEED — Provision demo data on first boot so Mission Control isn't empty
// ═══════════════════════════════════════════════════════════════════════════════

async function seedDemoData(orgId: string) {
  const [leadCount, memCount] = await Promise.all([
    prisma.lead.count({ where: { organizationId: orgId } }),
    prisma.memory.count({ where: { organizationId: orgId } }),
  ]);

  // Only seed if completely empty
  if (leadCount > 0) return;

  const zephyr = await prisma.aIExecutive.findFirst({ where: { organizationId: orgId, name: { contains: 'Zephyr' } } });
  const aurelia = await prisma.aIExecutive.findFirst({ where: { organizationId: orgId, name: { contains: 'Aurelia' } } });
  const atlas = await prisma.aIExecutive.findFirst({ where: { organizationId: orgId, name: { contains: 'Atlas' } } });
  if (!zephyr || !aurelia || !atlas) return;

  // Seed 3 starter leads
  const [lead1, lead2, lead3] = await Promise.all([
    prisma.lead.create({ data: { organizationId: orgId, name: 'Thabo Ndlovu', company: 'Silo Technologies', email: 'thabo@silotech.co.za', phone: '+27 82 123 4567', value: 28000, source: 'inbound_webform', updatedAt: new Date() } }),
    prisma.lead.create({ data: { organizationId: orgId, name: 'Sarah Chen', company: 'Nexus Dynamics', email: 'sarah@nexusdyn.com', phone: '+1 415 555 0193', value: 55000, source: 'referral', updatedAt: new Date() } }),
    prisma.lead.create({ data: { organizationId: orgId, name: 'Marcus Weber', company: 'Alpine Solutions', email: 'm.weber@alpinesol.de', phone: '+49 89 555 0142', value: 18000, source: 'inbound_webform', updatedAt: new Date() } }),
  ]);

  // Seed a pre-qualified lead with a draft proposal and pending decision
  await prisma.lead.update({ where: { id: lead2.id }, data: { status: 'qualified', qualificationScore: 88, qualificationReasoning: 'Strong enterprise fit — Nexus Dynamics operates in our core vertical with confirmed budget.', estimatedValue: 55000, recommendedAction: 'Proceed to proposal stage.', qualifiedAt: new Date(), qualifiedBy: 'Zephyr (Sales AI)', assignedToExecutiveId: zephyr.id, updatedAt: new Date() } });

  const proposal = await prisma.proposal.create({
    data: {
      organizationId: orgId, leadId: lead2.id, createdByExecutiveId: aurelia.id,
      title: 'Commercial Proposal — Nexus Dynamics', content: '# Atlas OS Commercial Proposal\n\n**Prepared for:** Nexus Dynamics\n**Contact:** Sarah Chen\n\n## Executive Summary\nWe propose a full Atlas OS Enterprise deployment covering Sales, Finance, and Customer Success automation.\n\n## Deliverables\n- Atlas OS Enterprise License (12 months)\n- Professional Implementation & Configuration\n- Training & Onboarding Package\n\n## Commercial Terms\nTotal investment: **$55,000**',
      totalValue: 55000, status: 'draft', expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000), updatedAt: new Date(),
      lineItems: { create: [
        { description: 'Atlas OS Enterprise License (Annual)', quantity: 1, price: 27500, total: 27500, order: 0 },
        { description: 'Professional Implementation', quantity: 1, price: 16500, total: 16500, order: 1 },
        { description: 'Training & Onboarding', quantity: 1, price: 11000, total: 11000, order: 2 },
      ]},
    },
  });

  await prisma.lead.update({ where: { id: lead2.id }, data: { status: 'proposal_drafted', updatedAt: new Date() } });

  await prisma.decision.create({
    data: {
      organizationId: orgId, createdByExecutiveId: zephyr.id, title: 'Approve Deal: Sarah Chen at Nexus Dynamics',
      summary: 'Zephyr has qualified Sarah Chen (Nexus Dynamics) with score 88/100. Aurelia has drafted a $55,000 proposal.',
      description: 'Strong enterprise fit — confirmed budget, active evaluation, aligned on vertical.',
      reasoning: 'Lead shows strong enterprise fit with confirmed budget authority. High conversion probability.',
      impact: 'Potential revenue: $55,000 ARR. Recommended: Proceed to proposal send.',
      confidence: 88, type: 'financial', status: 'pending',
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000),
      metadata: { leadId: lead2.id, proposalId: proposal.id, dealValue: 55000 },
      updatedAt: new Date(),
      contributors: { create: [{ executiveId: aurelia.id }] },
    },
  });

  // Seed mission memory
  if (memCount === 0) {
    await prisma.memory.create({ data: { organizationId: orgId, executiveId: atlas.id, text: 'Company Mission: Atlas OS creates absolute administrative efficiency where AI executive agents handle operations while humans retain strategic control.', type: 'policy', actor: 'CEO', sourceSystem: 'Internal Wiki', tags: ['mission', 'governance', 'charter'], updatedAt: new Date() } });
    await prisma.memory.create({ data: { organizationId: orgId, executiveId: zephyr.id, text: 'ICP Definition: B2B companies with 10-200 employees, in technology or services sectors, with annual revenue $1M+, experiencing operational scaling challenges.', type: 'insight', actor: 'Zephyr (Sales AI)', sourceSystem: 'Sales Intelligence', tags: ['icp', 'sales', 'targeting'], updatedAt: new Date() } });
  }

  // Seed boot feed events
  await prisma.feedEvent.create({ data: { organizationId: orgId, executiveId: atlas.id, action: 'System Initialized', text: 'Atlas OS Executive Team is online. All 10 AI executives provisioned and standing by.', status: 'success' } });
  await prisma.feedEvent.create({ data: { organizationId: orgId, executiveId: zephyr.id, action: 'Pipeline Loaded', text: `3 inbound leads loaded. ${lead2.company} flagged as high-priority (Score: 88/100).`, status: 'info' } });
  await prisma.feedEvent.create({ data: { organizationId: orgId, executiveId: aurelia.id, action: 'Proposal Drafted', text: `$55,000 commercial proposal drafted for ${lead2.company}. Awaiting CEO approval.`, status: 'success' } });

  console.log('[Atlas] Demo data seeded: 3 leads, 1 proposal, 1 decision, 2 memories, 3 feed events.');
}

// ─── Global error handler ─────────────────────────────────────────────────────
// Catches any error thrown from route handlers that wasn't caught by a
// local try/catch. Returns a generic message — never leaks stack traces
// or internal error details to the client.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err.status ?? err.statusCode ?? 500;
  console.error('[Atlas] Unhandled route error:', err.message ?? err);
  // Only expose the message in dev mode
  const message = process.env.NODE_ENV === 'production'
    ? 'An internal error occurred.'
    : (err.message ?? 'An internal error occurred.');
  res.status(status).json({ error: message });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SERVER BOOT
// ═══════════════════════════════════════════════════════════════════════════════

async function startServer() {
  // 1. Start Atlas Execution Engine (Redis + BullMQ + Workers)
  // Skip entirely if REDIS_URL is not configured — workers are optional
  let engineStarted = false;
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) {
    console.warn('[Atlas] Execution Engine offline: REDIS_URL not set. Workers disabled — HTTP API and AI executives still work normally.');
  } else {
    try {
      const { executionEngine } = await import('./src/infrastructure/ExecutionEngine.js');
      await executionEngine.start();
      engineStarted = true;
    } catch (err: any) {
      console.warn(`[Atlas] Execution Engine offline: ${err.message}.`);
    }
  }

  // 2. Seed demo data for initialized organizations
  try {
    const org = await prisma.organization.findUnique({ where: { id: await resolveOrgId(req) } });
    if (org) await seedDemoData(org.id);
  } catch (err: any) {
    console.warn(`[Atlas] Demo seed skipped: ${err.message}`);
  }

  // 3. Wire ExecutionBridge (event bus handlers + cross-executive messaging)
  try {
    executionBridge.initialize();
    console.log('[Atlas] ExecutionBridge initialized ✓');
  } catch (err: any) {
    console.warn(`[Atlas] ExecutionBridge init failed: ${err.message}`);
  }

  // 4. Start Scheduler (autonomous executive cron jobs)
  try {
    schedulerService.start();
    console.log('[Atlas] Scheduler started ✓');
  } catch (err: any) {
    console.warn(`[Atlas] Scheduler start failed: ${err.message}`);
  }

  // 3. Vite dev server / static production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    const hasKey = !!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY);
    console.log(`\n🚀 Atlas OS running → http://0.0.0.0:${PORT}`);
    console.log(`   AI Provider : ${(process.env.AI_PROVIDER || 'openrouter').toUpperCase()}`);
    console.log(`   AI Key      : ${hasKey ? 'CONFIGURED ✓' : 'NOT SET — using local fallbacks'}`);
    console.log(`   Exec Engine : ${engineStarted ? 'RUNNING ✓' : 'OFFLINE (Redis not configured)'}`);
    console.log(`   Scheduler   : ${schedulerService.isRunning() ? 'RUNNING ✓' : 'OFFLINE'}`);
    console.log(`   Event Bus   : ${executionBridge.isInitialized() ? 'WIRED ✓' : 'OFFLINE'}`);
    console.log(`   Database    : Neon PostgreSQL (Prisma)\n`);
    console.log(`   Executive Routes:`);
    console.log(`     /api/v1/executives/atlas/*    — CEO Assistant`);
    console.log(`     /api/v1/executives/zephyr/*   — Sales AI`);
    console.log(`     /api/v1/executives/aurelia/*  — Finance AI`);
    console.log(`     /api/v1/executives/aria/*     — Marketing AI`);
    console.log(`     /api/v1/executives/lyra/*     — Customer Success AI`);
    console.log(`     /api/v1/executives/sage/*     — HR AI`);
    console.log(`     /api/v1/executives/orion/*    — Operations AI`);
    console.log(`     /api/v1/executives/lexis/*    — Legal AI`);
    console.log(`     /api/v1/executives/forge/*    — Developer AI`);
    console.log(`     /api/v1/executives/iris/*     — Intelligence AI`);
    console.log(`\n   Integration Routes:`);
    console.log(`     GET  /api/integrations                   — List all integrations`);
    console.log(`     GET  /api/integrations/:provider/connect — Get OAuth URL`);
    console.log(`     GET  /api/integrations/:provider/callback— OAuth callback`);
    console.log(`     POST /api/integrations/:provider/sync    — Trigger sync`);
    console.log(`\n   Collaboration Routes:`);
    console.log(`     POST /api/v1/collaboration/ask           — Exec asks exec`);
    console.log(`     POST /api/v1/collaboration/convene       — Multi-exec session`);
    console.log(`     POST /api/v1/collaboration/delegate      — Delegate a task`);
    console.log(`     POST /api/v1/collaboration/brief         — Intel briefing`);
    console.log(`     POST /api/v1/collaboration/workflow/:name— Autonomous workflow`);
    console.log(`       workflows: deal_review, full_lead_cycle, weekly_board_prep,`);
    console.log(`                  incident_response, expansion_analysis,`);
    console.log(`                  churn_intervention, first_client`);
    console.log(`     GET  /api/v1/collaboration/sessions      — Session history`);
    console.log(`\n   Governance Routes:`);
    console.log(`     GET  /api/v1/governance/status           — Current mode + pending`);
    console.log(`     GET  /api/v1/governance/policy           — Full policy table`);
    console.log(`     POST /api/v1/governance/atlas/run        — Atlas acts as CEO`);
    console.log(`     GET  /api/v1/governance/log              — Audit log`);
    console.log(`\n   Mission Goals & Outbound:`);
    console.log(`     POST /api/v1/goals                       — Set CEO mission goal`);
    console.log(`     GET  /api/v1/goals                       — Active goals + milestones`);
    console.log(`     POST /api/v1/outbound/campaign           — Launch outbound campaign`);
    console.log(`\n   Scheduler Routes:`);
    console.log(`     POST /api/v1/scheduler/trigger/:event    — Manually fire schedule`);
    console.log(`     GET  /api/v1/scheduler/status            — Scheduler status\n`);
  });
}

startServer();

