/**
 * Atlas OS — First Client Workflow
 *
 * The complete autonomous pipeline for taking a new business
 * with zero customers to its first paying client.
 *
 * This is what runs when the CEO sets a goal like:
 * "Get our first client within 6 weeks"
 *
 * What it does in a single call:
 *
 * 1. Sets the mission goal → Atlas plans 6 weekly milestones
 * 2. Iris + Aria define the ICP from the company profile
 * 3. Aria builds a content + email campaign
 * 4. Outbound engine generates N prospects and drafts outreach
 * 5. Zephyr auto-qualifies every prospect
 * 6. For qualified leads: Aurelia drafts proposals → decisions filed
 * 7. Lexis pre-drafts an NDA ready to send
 * 8. Atlas synthesises everything into a Week 1 briefing
 *
 * Governance applies throughout — decisions route through the policy engine.
 * In supervised mode: CEO approves deals. In autonomous mode: Atlas handles it.
 */

import { prisma } from '../lib/prisma.js';
import { missionControl } from './MissionControl.js';
import { outboundEngine } from './OutboundEngine.js';
import { collaboration } from './CollaborationSession.js';
import { AutonomousWorkflows } from './AutonomousWorkflows.js';
import {
  CEOAssistant,
  MarketingAI,
  LegalAI,
  IntelligenceAI,
} from './executives/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FirstClientParams {
  organizationId: string;
  goalTitle?: string;
  weeksToTarget?: number;
  prospectsPerWeek?: number;
  sendEmails?: boolean;
}

export interface FirstClientResult {
  goalId: string;
  milestones: number;
  icpDefined: string;
  prospectCount: number;
  leadsQualified: number;
  proposalsDrafted: number;
  outreachDrafted: number;
  outreachSent: number;
  legalReady: boolean;
  atlasWeek1Briefing: string;
  nextActions: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getExec(orgId: string, nameFragment: string) {
  const exec = await prisma.aIExecutive.findFirst({
    where: { organizationId: orgId, name: { contains: nameFragment, mode: 'insensitive' } },
  });
  if (!exec) throw new Error(`Executive "${nameFragment}" not provisioned.`);
  return exec;
}

// ─── FirstClientWorkflow ──────────────────────────────────────────────────────

export class FirstClientWorkflow {

  /**
   * Run the full zero-to-client autonomous campaign.
   */
  static async run(params: FirstClientParams): Promise<FirstClientResult> {
    const {
      organizationId,
      goalTitle = 'First paying client',
      weeksToTarget = 6,
      prospectsPerWeek = 10,
      sendEmails = false,
    } = params;

    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    if (!org) throw new Error('Organization not found.');

    const [atlasExec, irisExec, ariaExec, lexisExec] = await Promise.all([
      getExec(organizationId, 'Atlas'),
      getExec(organizationId, 'Iris'),
      getExec(organizationId, 'Aria'),
      getExec(organizationId, 'Lexis'),
    ]);

    // ── Step 1: Set the mission goal ─────────────────────────────────────────
    const goalPlan = await missionControl.setGoal({
      organizationId,
      title: goalTitle,
      description: `Autonomous campaign to acquire ${org.name}'s first paying client. All executives mobilised.`,
      weeksToTarget,
      successCriteria: 'First invoice paid by a real client',
    });

    await prisma.feedEvent.create({
      data: {
        organizationId,
        executiveId: atlasExec.id,
        action: '🎯 Mission Launched',
        text: `"${goalTitle}" — ${weeksToTarget}-week plan active. ${goalPlan.milestones.length} milestones across all departments.`,
        status: 'success',
      },
    });

    // ── Step 2: Iris defines the ICP ──────────────────────────────────────────
    const iris = new IntelligenceAI(organizationId, irisExec.id);
    const icpAnalysis = await collaboration.ask({
      from: 'Atlas (CEO Assistant)',
      to: 'Iris (Intelligence AI)',
      question: `We need to acquire our first client. Based on our company profile — ${org.name}, ${org.industry} industry, size ${org.size}, goals: ${org.goals} — define our ideal customer profile (ICP) in one sentence. Be specific: industry, company size, job title, and the one pain point we solve best.`,
      context: { orgName: org.name, industry: org.industry, size: org.size, goals: org.goals, challenges: org.challenges },
      organizationId,
    });

    // ── Step 3: Aria builds the content arsenal ───────────────────────────────
    const aria = new MarketingAI(organizationId, ariaExec.id);

    const [coldEmailCampaign, valuePropositionContent] = await Promise.all([
      aria.createEmailCampaign({
        name: `${org.name} — First Client Outreach`,
        audience: icpAnalysis.answer,
        goal: 'Book a discovery call and close first deal',
        emailCount: 3,
        daysBetween: 4,
      }),
      aria.generateContent({
        type: 'email',
        topic: `Why ${org.name} is perfect for ${org.industry} companies`,
        audience: icpAnalysis.answer,
        tone: 'confident, concise, solution-focused',
      }),
    ]);

    // ── Step 4: Lexis pre-drafts an NDA ──────────────────────────────────────
    const lexis = new LegalAI(organizationId, lexisExec.id);
    const ndaDraft = await lexis.draftNDA({
      partyName: 'Prospective Client',
      partyType: 'company',
      purpose: 'Initial business discussions and evaluation',
      duration: '2 years',
      mutual: true,
    });
    const legalReady = !!ndaDraft;

    // ── Step 5: Run outbound campaign ─────────────────────────────────────────
    // Parse ICP from Iris's answer
    const icpText = icpAnalysis.answer;
    const icp = {
      industry: org.industry ?? 'B2B Technology',
      companySize: org.size === '1-10' ? '1-10 employees' : org.size === '11-50' ? '11-50 employees' : '50-200 employees',
      jobTitles: ['CEO', 'Founder', 'COO', 'VP Operations', 'Head of Growth'],
      painPoints: (org.challenges ?? '').split(',').map((s: string) => s.trim()).filter(Boolean).slice(0, 3),
      budgetRange: 'Mid-market ($10k-$100k)',
    };

    if (icp.painPoints.length === 0) {
      icp.painPoints = ['operational inefficiency', 'scaling challenges', 'manual processes'];
    }

    const outboundResult = await outboundEngine.runCampaign({
      organizationId,
      campaignName: `${goalTitle} — Week 1 Outbound`,
      icp,
      emailCount: prospectsPerWeek,
      sendEmails,
      goalId: goalPlan.goalId,
    });

    // ── Step 6: Atlas synthesis — Week 1 briefing ─────────────────────────────
    const atlas = new CEOAssistant(organizationId, atlasExec.id);
    const briefing = await atlas.generateDailyBriefing();

    // ── Step 7: Atlas asks Iris for the critical path ─────────────────────────
    const criticalPathAdvice = await collaboration.ask({
      from: 'Atlas (CEO Assistant)',
      to: 'Iris (Intelligence AI)',
      question: `We just launched our first-client campaign. We have ${outboundResult.leadsCreated} prospects in the pipeline. What are the 3 most critical things we must get right in Week 1 to close our first deal by Week ${weeksToTarget}?`,
      context: {
        prospectsCreated: outboundResult.leadsCreated,
        emailsDrafted: outboundResult.emailsDrafted,
        emailsSent: outboundResult.emailsSent,
        weeksToTarget,
        icpDefined: icpAnalysis.answer,
      },
      organizationId,
    });

    // ── Final feed summary ─────────────────────────────────────────────────────
    const proposalCount = await prisma.proposal.count({
      where: { organizationId, createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) } },
    });

    await prisma.feedEvent.create({
      data: {
        organizationId,
        executiveId: atlasExec.id,
        action: '🚀 First Client Campaign Active',
        text: `${outboundResult.leadsCreated} prospects in pipeline. ${outboundResult.emailsDrafted} emails ${sendEmails ? 'sent' : 'drafted'}. ${proposalCount} proposals ready. Legal NDA pre-drafted. Week 1 underway.`,
        status: 'success',
      },
    });

    return {
      goalId: goalPlan.goalId,
      milestones: goalPlan.milestones.length,
      icpDefined: icpAnalysis.answer,
      prospectCount: outboundResult.prospectsGenerated,
      leadsQualified: outboundResult.leadsCreated,
      proposalsDrafted: proposalCount,
      outreachDrafted: outboundResult.emailsDrafted,
      outreachSent: outboundResult.emailsSent,
      legalReady,
      atlasWeek1Briefing: briefing.briefing,
      nextActions: [
        ...(briefing.topPriorities ?? []),
        criticalPathAdvice.answer.split('\n').slice(0, 3),
      ].flat().slice(0, 5),
    };
  }
}
