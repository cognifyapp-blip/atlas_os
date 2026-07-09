/**
 * Atlas OS — Mission Goals & Outbound Routes
 *
 * Base path: /api/v1/goals
 *
 *   POST /api/v1/goals                    — CEO sets a new mission goal
 *   GET  /api/v1/goals                    — Get all goals with milestones
 *   GET  /api/v1/goals/:id                — Single goal detail
 *   POST /api/v1/goals/:id/milestones/:mid/complete  — Mark milestone done
 *   DELETE /api/v1/goals/:id              — Cancel a goal
 *
 * Base path: /api/v1/outbound
 *
 *   POST /api/v1/outbound/campaign        — Run a full outbound campaign
 *   POST /api/v1/outbound/prospects       — Just generate prospect list (no leads)
 */

import { Router, type Request, type Response } from 'express';
import { prisma } from '../lib/prisma.js';
import { missionControl } from '../services/MissionControl.js';
import { outboundEngine } from '../services/OutboundEngine.js';

const router = Router();

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`[Goals Route Error]`, err.message);
      res.status(500).json({ error: err.message });
    });
  };
}

async function getOrg() {
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found.');
  return org;
}

// ─── Goals ───────────────────────────────────────────────────────────────────

router.post('/goals', wrap(async (req, res) => {
  const { title, description, targetDate, successCriteria, weeksToTarget } = req.body;
  if (!title) return res.status(400).json({ error: 'title is required' });

  const org = await getOrg();
  const plan = await missionControl.setGoal({
    organizationId: org.id,
    title,
    description,
    targetDate: targetDate ? new Date(targetDate) : undefined,
    successCriteria,
    weeksToTarget: weeksToTarget ?? 6,
  });

  res.json(plan);
}));

router.get('/goals', wrap(async (_req, res) => {
  const org = await getOrg();
  const goals = await missionControl.getActiveGoals(org.id);
  res.json({ goals });
}));

router.get('/goals/:id', wrap(async (req, res) => {
  const org = await getOrg();
  const goal = await prisma.missionGoal.findFirst({
    where: { id: req.params.id, organizationId: org.id },
    include: {
      milestones: {
        include: { owner: { select: { id: true, name: true, role: true } } },
        orderBy: { week: 'asc' },
      },
    },
  });
  if (!goal) return res.status(404).json({ error: 'Goal not found' });
  res.json(goal);
}));

router.post('/goals/:id/milestones/:mid/complete', wrap(async (req, res) => {
  const org = await getOrg();
  const { notes } = req.body;
  await missionControl.completeMilestone(req.params.mid, org.id, notes);
  res.json({ success: true });
}));

router.delete('/goals/:id', wrap(async (req, res) => {
  const org = await getOrg();
  await prisma.missionGoal.updateMany({
    where: { id: req.params.id, organizationId: org.id },
    data: { status: 'cancelled', updatedAt: new Date() },
  });
  res.json({ success: true });
}));

// ─── Outbound ─────────────────────────────────────────────────────────────────

router.post('/outbound/campaign', wrap(async (req, res) => {
  const { campaignName, icp, emailCount, sendEmails, goalId } = req.body;
  if (!campaignName || !icp) return res.status(400).json({ error: 'campaignName and icp are required' });
  if (!icp.industry || !icp.companySize || !icp.jobTitles || !icp.painPoints) {
    return res.status(400).json({ error: 'icp must include: industry, companySize, jobTitles[], painPoints[]' });
  }

  const org = await getOrg();
  const result = await outboundEngine.runCampaign({
    organizationId: org.id,
    campaignName,
    icp,
    emailCount: emailCount ?? 10,
    sendEmails: sendEmails ?? false,
    goalId,
  });

  res.json(result);
}));

router.post('/outbound/prospects', wrap(async (req, res) => {
  const { icp, count } = req.body;
  if (!icp) return res.status(400).json({ error: 'icp is required' });

  const org = await getOrg();
  const prospects = await outboundEngine.generateProspects({
    org: { name: org.name, industry: org.industry ?? '', goals: org.goals ?? '' },
    icp,
    count: count ?? 10,
  });

  res.json({ prospects });
}));

export default router;
