/**
 * Atlas OS — Autonomous Workflows
 *
 * Pre-built multi-executive workflows that run end-to-end without
 * any human trigger mid-flow. Each workflow chains multiple executives,
 * uses the CollaborationService for inter-exec communication, and
 * publishes results back to the EventBus.
 *
 * Workflows:
 *   dealReview        — Zephyr → Aurelia → Lexis → Atlas decision
 *   newLeadFullCycle  — Zephyr qualifies → Aria scores → Aurelia drafts → Atlas decides
 *   weeklyBoardPrep   — Iris briefs Atlas → Atlas briefs everyone → board report
 *   hiringDecision    — Sage → Forge (tech role) → Atlas final call
 *   incidentResponse  — Orion triages → Forge diagnoses → Atlas notifies
 *   expansionAnalysis — Iris → Zephyr → Aurelia → Lexis → Atlas exec session
 */

import { prisma } from '../lib/prisma.js';
import { collaboration } from './CollaborationSession.js';
import { eventBus } from './EventBus.js';
import {
  SalesAI,
  FinanceAI,
  MarketingAI,
  CustomerSuccessAI,
  HRAI,
  OperationsAI,
  LegalAI,
  DeveloperAI,
  IntelligenceAI,
  CEOAssistant,
} from './executives/index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getExec(orgId: string, nameFragment: string) {
  const exec = await prisma.aIExecutive.findFirst({
    where: { organizationId: orgId, name: { contains: nameFragment, mode: 'insensitive' } },
  });
  if (!exec) throw new Error(`Executive "${nameFragment}" not provisioned.`);
  return exec;
}

// ─── AutonomousWorkflows ──────────────────────────────────────────────────────

export class AutonomousWorkflows {
  private orgId: string;

  constructor(organizationId: string) {
    this.orgId = organizationId;
  }

  // ─── Workflow 1: Full Deal Review ──────────────────────────────────────────
  // Zephyr pitches the deal → Aurelia checks margins → Lexis flags contract risk
  // → team session → Atlas files decision
  //
  // Trigger: high-value lead qualified (score >= 80 + value >= $50k)

  async dealReview(leadId: string): Promise<{
    leadId: string;
    salesView: string;
    financeView: string;
    legalView: string;
    session: Awaited<ReturnType<typeof collaboration.convene>>;
    decisionId: string;
  }> {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: this.orgId } });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    const [zephyrExec, aureliaExec, lexisExec, atlasExec] = await Promise.all([
      getExec(this.orgId, 'Zephyr'),
      getExec(this.orgId, 'Aurelia'),
      getExec(this.orgId, 'Lexis'),
      getExec(this.orgId, 'Atlas'),
    ]);

    const dealContext = {
      leadName: lead.name,
      company: lead.company,
      estimatedValue: lead.estimatedValue ?? lead.value,
      qualificationScore: lead.qualificationScore,
      qualificationReasoning: lead.qualificationReasoning,
    };

    // Zephyr pitches to Aurelia
    const financeCheck = await collaboration.ask({
      from: 'Zephyr (Sales AI)',
      to: 'Aurelia (Finance AI)',
      question: `I have a ${lead.qualificationScore}/100 qualified lead — ${lead.name} at ${lead.company}, estimated at $${(lead.estimatedValue ?? lead.value).toLocaleString()}. Can we support this deal from a financial standpoint? Any margin or payment terms concerns?`,
      context: dealContext,
      organizationId: this.orgId,
    });

    // Zephyr asks Lexis about contract risk
    const legalCheck = await collaboration.ask({
      from: 'Zephyr (Sales AI)',
      to: 'Lexis (Legal AI)',
      question: `Before I close ${lead.name} at ${lead.company} ($${(lead.estimatedValue ?? lead.value).toLocaleString()}), are there any standard contract risk areas I should flag or prepare for?`,
      context: dealContext,
      organizationId: this.orgId,
    });

    // Executive session to reach consensus
    const session = await collaboration.convene({
      convener: 'Atlas (CEO Assistant)',
      topic: `Deal approval: ${lead.name} at ${lead.company} — $${(lead.estimatedValue ?? lead.value).toLocaleString()}`,
      participants: ['Zephyr (Sales AI)', 'Aurelia (Finance AI)', 'Lexis (Legal AI)'],
      context: {
        ...dealContext,
        financeView: financeCheck.answer,
        legalView: legalCheck.answer,
      },
      organizationId: this.orgId,
    });

    // Atlas files the decision
    const atlas = new CEOAssistant(this.orgId, atlasExec.id);
    const decision = await atlas.createDecision({
      title: `Deal Review: ${lead.name} at ${lead.company}`,
      summary: session.consensus,
      description: `Multi-executive deal review session.\n\nFinance view: ${financeCheck.answer}\n\nLegal view: ${legalCheck.answer}`,
      reasoning: session.recommendedActions.join('; '),
      impact: `Deal value: $${(lead.estimatedValue ?? lead.value).toLocaleString()}. ${session.dissents.length > 0 ? 'Dissents: ' + session.dissents.join(', ') : 'No dissents.'}`,
      confidence: lead.qualificationScore ?? 80,
      type: 'financial',
      contributorIds: [zephyrExec.id, aureliaExec.id, lexisExec.id],
      expiresInHours: 72,
      metadata: { leadId, sessionId: session.sessionId, workflow: 'deal_review' },
    });

    await prisma.feedEvent.create({
      data: {
        organizationId: this.orgId,
        executiveId: atlasExec.id,
        action: 'Deal Review Complete',
        text: `${lead.company} deal reviewed by Sales, Finance, and Legal. Consensus: ${session.consensus.substring(0, 100)}`,
        status: 'success',
      },
    });

    return {
      leadId,
      salesView: `Zephyr: ${session.transcript.find(t => t.speaker.includes('Zephyr'))?.message ?? ''}`,
      financeView: financeCheck.answer,
      legalView: legalCheck.answer,
      session,
      decisionId: decision.id,
    };
  }

  // ─── Workflow 2: Full Lead Cycle ───────────────────────────────────────────
  // New lead comes in → Zephyr qualifies → Aria scores MQL + drafts outreach
  // → if qualified: Aurelia drafts proposal → Atlas files decision
  // All in one autonomous chain.

  async fullLeadCycle(leadId: string): Promise<{
    qualification: unknown;
    mqlScore: unknown;
    outreachEmail: unknown;
    proposal: unknown;
    decisionId: string | null;
  }> {
    const [zephyrExec, ariaExec, aureliaExec] = await Promise.all([
      getExec(this.orgId, 'Zephyr'),
      getExec(this.orgId, 'Aria'),
      getExec(this.orgId, 'Aurelia'),
    ]);

    // Step 1: Zephyr qualifies
    const zephyr = new SalesAI(this.orgId, zephyrExec.id);
    const { lead, qualification } = await zephyr.qualifyLead(leadId);

    // Publish event for other listeners
    if (qualification.score >= 70) {
      eventBus.publish('lead.qualified', {
        organizationId: this.orgId,
        leadId,
        score: qualification.score,
        estimatedValue: qualification.estimatedValue,
        executiveId: zephyrExec.id,
      });
    }

    // Step 2: Aria scores as MQL regardless
    const aria = new MarketingAI(this.orgId, ariaExec.id);
    const mqlScore = await aria.scoreMarketingLead(leadId);

    // Step 3: Zephyr drafts outreach
    const outreachEmail = await zephyr.draftOutreachEmail(leadId, 'initial');

    if (qualification.score < 50) {
      // Disqualified — stop here
      return { qualification, mqlScore, outreachEmail, proposal: null, decisionId: null };
    }

    // Step 4: Zephyr asks Aurelia if the deal size makes sense
    const financeInput = await collaboration.ask({
      from: 'Zephyr (Sales AI)',
      to: 'Aurelia (Finance AI)',
      question: `Lead ${lead.name} at ${lead.company} qualified at ${qualification.score}/100 with estimated value $${qualification.estimatedValue.toLocaleString()}. Does this deal size make sense for us right now?`,
      context: { qualificationScore: qualification.score, estimatedValue: qualification.estimatedValue },
      organizationId: this.orgId,
    });

    // Step 5: Aurelia drafts proposal
    const aurelia = new FinanceAI(this.orgId, aureliaExec.id);
    const proposal = await aurelia.draftProposal(leadId, qualification.estimatedValue);

    // Step 6: Zephyr files decision (includes Aurelia's finance note)
    const decision = await zephyr.createSalesDecision(leadId, proposal.id, qualification.estimatedValue);

    // Persist finance note to proposal memory
    await prisma.memory.create({
      data: {
        organizationId: this.orgId,
        executiveId: aureliaExec.id,
        text: `[DEAL REVIEW] ${lead.name} (${lead.company}): ${financeInput.answer}`,
        type: 'insight',
        actor: 'Aurelia (Finance AI)',
        sourceSystem: 'Lead Cycle Workflow',
        tags: ['finance', 'deal-review', 'workflow'],
        updatedAt: new Date(),
      },
    });

    return { qualification, mqlScore, outreachEmail, proposal, decisionId: decision.id };
  }

  // ─── Workflow 3: Weekly Board Prep ─────────────────────────────────────────
  // Iris generates intelligence → briefs each exec with department-specific
  // context → Atlas synthesizes everything into a board report

  async weeklyBoardPrep(): Promise<{
    intelligenceReport: unknown;
    executiveBriefings: Record<string, string>;
    boardReport: unknown;
  }> {
    const [irisExec, atlasExec] = await Promise.all([
      getExec(this.orgId, 'Iris'),
      getExec(this.orgId, 'Atlas'),
    ]);

    // Step 1: Iris generates the weekly intelligence report
    const iris = new IntelligenceAI(this.orgId, irisExec.id);
    const intelligenceReport = await iris.generateIntelligenceReport('weekly');

    // Step 2: Iris briefs each department head with their specific data
    const briefings: Record<string, string> = {};

    const briefingTargets = [
      { exec: 'Zephyr (Sales AI)', type: 'market_intel' as const, focus: 'pipeline trends and revenue forecast' },
      { exec: 'Aurelia (Finance AI)', type: 'market_intel' as const, focus: 'financial KPIs and cash position' },
      { exec: 'Orion (Operations AI)', type: 'risk' as const, focus: 'operational health and workflow gaps' },
    ];

    for (const target of briefingTargets) {
      const { briefing } = await collaboration.briefExecutive({
        from: 'Iris (Intelligence AI)',
        to: target.exec,
        briefingType: target.type,
        data: {
          headline: (intelligenceReport.report as any).headline,
          kpis: (intelligenceReport.report as any).kpis,
          focus: target.focus,
          rawMetrics: intelligenceReport.rawMetrics,
        },
        organizationId: this.orgId,
      });
      briefings[target.exec] = briefing;
    }

    // Step 3: Atlas generates the full board report with all this context
    const atlas = new CEOAssistant(this.orgId, atlasExec.id);
    const boardReport = await atlas.generateBoardReport();

    await prisma.feedEvent.create({
      data: {
        organizationId: this.orgId,
        executiveId: atlasExec.id,
        action: 'Weekly Board Prep Complete',
        text: `Iris briefed all department heads. Board report ready. ${(intelligenceReport.report as any).headline}`,
        status: 'success',
      },
    });

    return { intelligenceReport, executiveBriefings: briefings, boardReport };
  }

  // ─── Workflow 4: Incident Response ────────────────────────────────────────
  // Orion triages → Forge diagnoses technical root cause → Sage assesses
  // people impact → Atlas notifies stakeholders + files decision

  async incidentResponse(params: {
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedSystems: string[];
  }): Promise<{
    triage: unknown;
    technicalDiagnosis: string;
    stakeholderNotification: string;
    decisionId: string | null;
  }> {
    const [orionExec, forgeExec, atlasExec] = await Promise.all([
      getExec(this.orgId, 'Orion'),
      getExec(this.orgId, 'Forge'),
      getExec(this.orgId, 'Atlas'),
    ]);

    // Step 1: Orion triages
    const orion = new OperationsAI(this.orgId, orionExec.id);
    const triage = await orion.triageIncident(params);

    // Step 2: Orion asks Forge for technical diagnosis
    const techDiagnosis = await collaboration.ask({
      from: 'Orion (Operations AI)',
      to: 'Forge (Developer AI)',
      question: `We have a ${params.severity} incident: "${params.title}". Affected systems: ${params.affectedSystems.join(', ')}. What's your technical assessment and recommended fix approach?`,
      context: { ...params, orionTriage: triage },
      organizationId: this.orgId,
    });

    // Step 3: Atlas drafts stakeholder notification
    const stakeholderMsg = await collaboration.ask({
      from: 'Orion (Operations AI)',
      to: 'Atlas (CEO Assistant)',
      question: `I need you to draft a brief stakeholder notification for this ${params.severity} incident: "${params.title}". Keep it factual and reassuring. Forge says: ${techDiagnosis.answer.substring(0, 200)}`,
      context: { ...params, estimatedResolution: (triage as any).estimatedResolutionTime },
      organizationId: this.orgId,
    });

    // Step 4: If critical, Atlas files a decision
    let decisionId: string | null = null;
    if (params.severity === 'critical') {
      const atlas = new CEOAssistant(this.orgId, atlasExec.id);
      const decision = await atlas.createDecision({
        title: `🚨 CRITICAL INCIDENT: ${params.title}`,
        summary: (triage as any).communicationPlan ?? params.description,
        description: `Technical: ${techDiagnosis.answer}\n\nStakeholder message: ${stakeholderMsg.answer}`,
        reasoning: `Orion triaged. Forge confirmed root cause. Affected: ${params.affectedSystems.join(', ')}`,
        impact: `Severity: CRITICAL. Estimated resolution: ${(triage as any).estimatedResolutionTime}`,
        confidence: 95,
        type: 'operational',
        contributorIds: [orionExec.id, forgeExec.id],
        expiresInHours: 4,
        metadata: { incident: true, severity: params.severity, affectedSystems: params.affectedSystems },
      });
      decisionId = decision.id;
    }

    return {
      triage,
      technicalDiagnosis: techDiagnosis.answer,
      stakeholderNotification: stakeholderMsg.answer,
      decisionId,
    };
  }

  // ─── Workflow 5: Expansion Analysis ───────────────────────────────────────
  // Iris surfaces opportunity → full executive session with all relevant
  // departments → Atlas synthesizes and decides

  async expansionAnalysis(params: {
    opportunity: string;
    context: Record<string, unknown>;
  }): Promise<Awaited<ReturnType<typeof collaboration.convene>>> {
    const session = await collaboration.convene({
      convener: 'Atlas (CEO Assistant)',
      topic: params.opportunity,
      participants: [
        'Iris (Intelligence AI)',
        'Zephyr (Sales AI)',
        'Aurelia (Finance AI)',
        'Lexis (Legal AI)',
        'Orion (Operations AI)',
      ],
      context: params.context,
      organizationId: this.orgId,
    });

    // File a strategic decision
    const atlasExec = await getExec(this.orgId, 'Atlas');
    const atlas = new CEOAssistant(this.orgId, atlasExec.id);

    await atlas.createDecision({
      title: `Strategic Decision: ${params.opportunity.substring(0, 80)}`,
      summary: session.consensus,
      reasoning: session.recommendedActions.join('; '),
      impact: session.dissents.length > 0 ? `Dissents noted: ${session.dissents.join(', ')}` : 'No dissents.',
      confidence: 75,
      type: 'strategic',
      expiresInHours: 168, // 1 week
      metadata: { sessionId: session.sessionId, workflow: 'expansion_analysis' },
    });

    return session;
  }

  // ─── Workflow 6: Customer Churn Intervention ──────────────────────────────
  // Lyra detects at-risk customer → asks Zephyr for account history
  // → asks Aria for re-engagement plan → files decision for CEO

  async churnIntervention(leadId: string): Promise<{
    healthScore: unknown;
    salesHistory: string;
    reengagementPlan: string;
    churnPlan: unknown;
  }> {
    const [lyraExec, zephyrExec, ariaExec] = await Promise.all([
      getExec(this.orgId, 'Lyra'),
      getExec(this.orgId, 'Zephyr'),
      getExec(this.orgId, 'Aria'),
    ]);

    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: this.orgId } });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    // Step 1: Lyra assesses customer health
    const lyra = new CustomerSuccessAI(this.orgId, lyraExec.id);
    const healthScore = await lyra.calculateCustomerHealth(leadId);

    // Step 2: Lyra asks Zephyr for sales account perspective
    const salesHistory = await collaboration.ask({
      from: 'Lyra (Customer Success AI)',
      to: 'Zephyr (Sales AI)',
      question: `I'm seeing churn risk signals from ${lead.name} at ${lead.company}. From your sales perspective, what's the account relationship history and what do you know about their satisfaction level?`,
      context: { leadName: lead.name, company: lead.company, leadStatus: lead.status, healthScore },
      organizationId: this.orgId,
    });

    // Step 3: Lyra asks Aria for re-engagement marketing ideas
    const reengagement = await collaboration.ask({
      from: 'Lyra (Customer Success AI)',
      to: 'Aria (Marketing AI)',
      question: `${lead.company} is showing churn risk. What re-engagement content or campaign approach would you recommend to demonstrate value and rebuild the relationship?`,
      context: { company: lead.company, industry: 'client', churnRiskSignals: healthScore },
      organizationId: this.orgId,
    });

    // Step 4: Lyra creates the churn prevention plan
    const churnPlan = await lyra.createChurnPreventionPlan(leadId);

    await prisma.feedEvent.create({
      data: {
        organizationId: this.orgId,
        executiveId: lyraExec.id,
        action: 'Churn Intervention Complete',
        text: `${lead.company}: Sales + Marketing aligned on retention strategy. Churn plan created.`,
        status: 'warning',
      },
    });

    return {
      healthScore,
      salesHistory: salesHistory.answer,
      reengagementPlan: reengagement.answer,
      churnPlan,
    };
  }
}
