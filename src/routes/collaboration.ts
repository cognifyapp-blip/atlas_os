/**
 * Atlas OS — Collaboration API Routes
 *
 * Exposes inter-executive communication and autonomous workflows as HTTP endpoints.
 *
 * Base path: /api/v1/collaboration
 *
 *   POST /api/v1/collaboration/ask           — One exec asks another a question
 *   POST /api/v1/collaboration/convene       — Multi-exec discussion with consensus
 *   POST /api/v1/collaboration/delegate      — One exec delegates a task to another
 *   POST /api/v1/collaboration/brief         — Iris briefs another exec with intel
 *   POST /api/v1/collaboration/workflow/:name — Trigger a full autonomous workflow
 *   GET  /api/v1/collaboration/sessions      — List recent collaboration sessions
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { collaboration } from '../services/CollaborationSession.js';
import { AutonomousWorkflows } from '../services/AutonomousWorkflows.js';
import { resolveOrgId } from '../lib/resolveOrg.js';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`[Collaboration Route Error]`, err.message);
      res.status(500).json({ error: 'Request failed.' });
    });
  };
}

// ─── Ask ─────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/ask
 * Body: { from, to, question, context? }
 *
 * One executive asks another a direct question. Returns the answer.
 * Both executives must match executive names (e.g. "Zephyr (Sales AI)").
 */
router.post('/ask', wrap(async (req, res) => {
  const { from, to, question, context } = req.body;
  if (!from || !to || !question) {
    return res.status(400).json({ error: 'from, to, and question are required.' });
  }
  const orgId = await resolveOrgId(res);
  const result = await collaboration.ask({ from, to, question, context, organizationId: orgId });
  res.json(result);
}));

// ─── Convene ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/convene
 * Body: { convener, topic, participants: string[], context? }
 *
 * Convenes a multi-executive discussion. Each participant speaks in turn,
 * then the convener synthesizes consensus and recommended actions.
 */
router.post('/convene', wrap(async (req, res) => {
  const { convener, topic, participants, context } = req.body;
  if (!convener || !topic || !participants || !Array.isArray(participants) || participants.length < 2) {
    return res.status(400).json({ error: 'convener, topic, and participants (array, min 2) are required.' });
  }
  const orgId = await resolveOrgId(res);
  const result = await collaboration.convene({ convener, topic, participants, context, organizationId: orgId });
  res.json(result);
}));

// ─── Delegate ─────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/delegate
 * Body: { from, to, task, priority, context?, dueInHours? }
 *
 * One executive formally delegates a task to another.
 * Creates a DB task record + gets AI acknowledgement from the recipient.
 */
router.post('/delegate', wrap(async (req, res) => {
  const { from, to, task, priority, context, dueInHours } = req.body;
  if (!from || !to || !task || !priority) {
    return res.status(400).json({ error: 'from, to, task, and priority are required.' });
  }
  const orgId = await resolveOrgId(res);
  const result = await collaboration.delegate({ from, to, task, priority, context, dueInHours, organizationId: orgId });
  res.json(result);
}));

// ─── Brief ────────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/brief
 * Body: { from, to, briefingType, data }
 *
 * One executive (typically Iris) briefs another with targeted intelligence.
 * Returns the crafted briefing + the recipient's recommended action.
 */
router.post('/brief', wrap(async (req, res) => {
  const { from, to, briefingType, data } = req.body;
  if (!from || !to || !briefingType || !data) {
    return res.status(400).json({ error: 'from, to, briefingType, and data are required.' });
  }
  const orgId = await resolveOrgId(res);
  const result = await collaboration.briefExecutive({ from, to, briefingType, data, organizationId: orgId });
  res.json(result);
}));

// ─── Autonomous Workflows ─────────────────────────────────────────────────────

/**
 * POST /api/v1/collaboration/workflow/:name
 *
 * Trigger a full autonomous multi-executive workflow.
 *
 * Workflows:
 *   deal_review          — Body: { leadId }
 *   full_lead_cycle      — Body: { leadId }
 *   weekly_board_prep    — Body: {} (no params needed)
 *   incident_response    — Body: { title, description, severity, affectedSystems }
 *   expansion_analysis   — Body: { opportunity, context? }
 *   churn_intervention   — Body: { leadId }
 */
router.post('/workflow/:name', wrap(async (req, res) => {
  const { name } = req.params;
  const orgId = await resolveOrgId(res);
  const workflows = new AutonomousWorkflows(orgId);

  switch (name) {
    case 'deal_review': {
      const { leadId } = req.body;
      if (!leadId) return res.status(400).json({ error: 'leadId required for deal_review' });
      const result = await workflows.dealReview(leadId);
      return res.json(result);
    }

    case 'full_lead_cycle': {
      const { leadId } = req.body;
      if (!leadId) return res.status(400).json({ error: 'leadId required for full_lead_cycle' });
      const result = await workflows.fullLeadCycle(leadId);
      return res.json(result);
    }

    case 'weekly_board_prep': {
      const result = await workflows.weeklyBoardPrep();
      return res.json(result);
    }

    case 'incident_response': {
      const { title, description, severity, affectedSystems } = req.body;
      if (!title || !description || !severity || !affectedSystems) {
        return res.status(400).json({ error: 'title, description, severity, affectedSystems required' });
      }
      const result = await workflows.incidentResponse({ title, description, severity, affectedSystems });
      return res.json(result);
    }

    case 'expansion_analysis': {
      const { opportunity, context } = req.body;
      if (!opportunity) return res.status(400).json({ error: 'opportunity required for expansion_analysis' });
      const result = await workflows.expansionAnalysis({ opportunity, context: context ?? {} });
      return res.json(result);
    }

    case 'churn_intervention': {
      const { leadId } = req.body;
      if (!leadId) return res.status(400).json({ error: 'leadId required for churn_intervention' });
      const result = await workflows.churnIntervention(leadId);
      return res.json(result);
    }

    case 'first_client': {
      // Zero-to-client autonomous campaign
      const { goalTitle, weeksToTarget, prospectsPerWeek, sendEmails } = req.body;
      const { FirstClientWorkflow } = await import('../services/FirstClientWorkflow.js');
      const result = await FirstClientWorkflow.run({
        organizationId: orgId,
        goalTitle,
        weeksToTarget,
        prospectsPerWeek,
        sendEmails,
      });
      return res.json(result);
    }

    default:
      return res.status(404).json({
        error: `Unknown workflow "${name}".`,
        available: ['deal_review', 'full_lead_cycle', 'weekly_board_prep', 'incident_response', 'expansion_analysis', 'churn_intervention', 'first_client'],
      });
  }
}));

// ─── Session History ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/collaboration/sessions
 *
 * Returns recent inter-executive collaboration events from the memory store.
 */
router.get('/sessions', wrap(async (_req, res) => {
  const orgId = await resolveOrgId(res);
  const sessions = await prisma.memory.findMany({
    where: {
      organizationId: orgId,
      OR: [
        { tags: { has: 'collaboration' } },
        { tags: { has: 'exec-session' } },
        { tags: { has: 'inter-exec' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
    include: { executive: { select: { name: true, role: true } } },
  });

  res.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      type: s.tags.includes('exec-session') ? 'convene' : s.tags.includes('briefing') ? 'brief' : 'ask',
      executive: s.executive?.name,
      text: s.text.substring(0, 300),
      tags: s.tags,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}));

export default router;
