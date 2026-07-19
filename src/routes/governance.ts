/**
 * Atlas OS — Governance API Routes
 *
 * Control and inspect the governance policy engine.
 *
 * Base path: /api/v1/governance
 *
 *   GET  /api/v1/governance/status              — Current mode + policy summary
 *   GET  /api/v1/governance/policy              — Full policy table
 *   POST /api/v1/governance/process/:decisionId — Manually trigger governance on a decision
 *   GET  /api/v1/governance/log                 — Recent governance actions
 *   POST /api/v1/governance/atlas/approve/:id   — Atlas manually approves a specific decision
 *   POST /api/v1/governance/atlas/decline/:id   — Atlas manually declines a specific decision
 *   POST /api/v1/governance/atlas/run           — Atlas reviews and acts on ALL pending decisions
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { governancePolicy } from '../services/GovernancePolicy.js';
import { CEOAssistant } from '../services/executives/index.js';
import { resolveOrg, resolveOrgId } from '../lib/resolveOrg.js';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`[Governance Route Error]`, err.message);
      res.status(500).json({ error: 'Request failed.' });
    });
  };
}

// ─── Status ──────────────────────────────────────────────────────────────────

router.get('/status', wrap(async (_req, res) => {
  const mode = governancePolicy.mode;
  const org = await resolveOrg(res);
  const pendingCount = await prisma.decision.count({ where: { status: 'pending', organizationId: org.id } });

  const modeDescriptions: Record<string, string> = {
    supervised: 'All decisions require human CEO approval. Atlas never auto-approves.',
    hybrid: 'Low-risk operational decisions auto-approve. Atlas approves mid-range. High-risk escalates to CEO.',
    autonomous: 'Atlas acts as CEO. Auto-approves within policy thresholds. CEO reviews exceptions only.',
  };

  res.json({
    mode,
    description: modeDescriptions[mode],
    pendingDecisions: pendingCount,
    envVar: 'GOVERNANCE_MODE',
    validModes: ['supervised', 'hybrid', 'autonomous'],
    checkedAt: new Date().toISOString(),
  });
}));

// ─── Full policy table ────────────────────────────────────────────────────────

router.get('/policy', wrap(async (_req, res) => {
  const mode = governancePolicy.mode;
  const types = ['financial', 'strategic', 'operational', 'legal', 'hr', 'general'];

  const policies = types.map((type) => {
    const policy = governancePolicy.getPolicy(type);
    const sample = governancePolicy.evaluate({ type, confidence: 80, value: 25000, title: 'Sample' });
    return {
      type,
      ...policy,
      sampleEvaluation: sample,
    };
  });

  res.json({ mode, policies });
}));

// ─── Process a specific decision ─────────────────────────────────────────────

router.post('/process/:decisionId', wrap(async (req, res) => {
  const { decisionId } = req.params;
  const result = await governancePolicy.processDecision(decisionId);
  res.json({ decisionId, ...result });
}));

// ─── Governance log ───────────────────────────────────────────────────────────

router.get('/log', wrap(async (_req, res) => {
  const org = await resolveOrg(res);
  const log = await prisma.memory.findMany({
    where: { organizationId: org.id, tags: { has: 'governance' } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { executive: { select: { name: true } } },
  });

  res.json({
    entries: log.map((e) => ({
      id: e.id,
      action: e.tags.find((t) => ['auto_approved', 'atlas_approved', 'escalated_to_ceo'].includes(t)) ?? 'unknown',
      text: e.text,
      executive: e.executive?.name,
      createdAt: e.createdAt.toISOString(),
    })),
  });
}));

// ─── Atlas manually approves ──────────────────────────────────────────────────

router.post('/atlas/approve/:id', wrap(async (req, res) => {
  const org = await resolveOrg(res);
  const decision = await prisma.decision.findFirst({ where: { id: req.params.id, organizationId: org.id } });
  if (!decision) return res.status(404).json({ error: 'Decision not found.' });
  if (decision.status !== 'pending') return res.status(400).json({ error: `Decision is already ${decision.status}.` });

  const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas', mode: 'insensitive' } } });
  if (!atlasExec) return res.status(500).json({ error: 'Atlas not provisioned.' });

  const { reason } = req.body;
  const atlas = new CEOAssistant(org.id, atlasExec.id);

  await prisma.decision.update({
    where: { id: req.params.id },
    data: {
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...((decision.metadata as any) ?? {}),
        atlasApproved: true,
        atlasReasoning: reason ?? 'Approved by Atlas (manual governance action).',
        governanceMode: governancePolicy.mode,
      },
    },
  });

  await prisma.aIExecutive.update({ where: { id: atlasExec.id }, data: { decisionsMade: { increment: 1 }, updatedAt: new Date() } });

  await prisma.feedEvent.create({
    data: {
      organizationId: org.id,
      executiveId: atlasExec.id,
      action: 'Decision Approved by Atlas',
      text: `Atlas approved: "${decision.title}". ${reason ?? ''}`,
      status: 'success',
    },
  });

  res.json({ success: true, decisionId: req.params.id, action: 'atlas_approved' });
}));

// ─── Atlas manually declines ──────────────────────────────────────────────────

router.post('/atlas/decline/:id', wrap(async (req, res) => {
  const org = await resolveOrg(res);
  const decision = await prisma.decision.findFirst({ where: { id: req.params.id, organizationId: org.id } });
  if (!decision) return res.status(404).json({ error: 'Decision not found.' });

  const atlasExec = await prisma.aIExecutive.findFirst({ where: { organizationId: org.id, name: { contains: 'Atlas', mode: 'insensitive' } } });
  if (!atlasExec) return res.status(500).json({ error: 'Atlas not provisioned.' });

  const { reason } = req.body;

  await prisma.decision.update({
    where: { id: req.params.id },
    data: { status: 'declined', declinedAt: new Date(), declineReason: reason ?? 'Declined by Atlas.', updatedAt: new Date() },
  });

  await prisma.feedEvent.create({
    data: {
      organizationId: org.id,
      executiveId: atlasExec.id,
      action: 'Decision Declined by Atlas',
      text: `Atlas declined: "${decision.title}". ${reason ?? ''}`,
      status: 'warning',
    },
  });

  res.json({ success: true, decisionId: req.params.id, action: 'atlas_declined' });
}));

// ─── Atlas reviews ALL pending decisions ─────────────────────────────────────

/**
 * POST /api/v1/governance/atlas/run
 *
 * Atlas reviews every pending decision and acts on each one according
 * to governance policy. This is the "Atlas as acting CEO" endpoint.
 *
 * In autonomous mode: clears the entire pending queue.
 * In hybrid mode: approves within authority, escalates the rest.
 * In supervised mode: returns a summary without acting.
 */
router.post('/atlas/run', wrap(async (req, res) => {
  const org = await resolveOrg(res);
  const pendingDecisions = await prisma.decision.findMany({
    where: { organizationId: org.id, status: 'pending' },
    orderBy: { createdAt: 'asc' },
  });

  if (pendingDecisions.length === 0) {
    return res.json({ message: 'No pending decisions. Queue is clear.', processed: 0 });
  }

  const results: Array<{ id: string; title: string; action: string; reason: string }> = [];

  for (const decision of pendingDecisions) {
    const result = await governancePolicy.processDecision(decision.id);
    results.push({ id: decision.id, title: decision.title, ...result });
  }

  const autoApproved = results.filter((r) => r.action === 'auto_approved').length;
  const atlasApproved = results.filter((r) => r.action === 'atlas_approved').length;
  const escalated = results.filter((r) => r.action === 'escalated_to_ceo').length;

  res.json({
    processed: results.length,
    autoApproved,
    atlasApproved,
    escalatedToCeo: escalated,
    governanceMode: governancePolicy.mode,
    results,
  });
}));

export default router;
