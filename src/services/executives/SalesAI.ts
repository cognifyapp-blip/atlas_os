/**
 * Atlas OS — Sales AI (Zephyr)
 *
 * VP of Sales. Qualifies leads, drafts proposals, tracks pipeline,
 * creates deals, manages the full sales funnel autonomously.
 *
 * Persona: "Zephyr" — fast, decisive, always closing.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class SalesAI extends ExecutiveService {
  private financeAIId: string | null = null;

  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Zephyr (Sales AI)');
  }

  private async getFinanceAIId(): Promise<string | null> {
    if (this.financeAIId) return this.financeAIId;
    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId: this.organizationId, name: { contains: 'Finance' } },
    });
    this.financeAIId = exec?.id ?? null;
    return this.financeAIId;
  }

  // ─── Lead Qualification ─────────────────────────────────────────────────────

  async qualifyLead(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    await this.setStatus('ACTIVE', `Qualifying lead: ${lead.name} at ${lead.company}`);
    await this.pushFeed('Lead Qualification Started', `Zephyr evaluating ${lead.name} from ${lead.company ?? 'unknown company'}.`, 'info');

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      score: number;
      reasoning: string;
      estimatedValue: number;
      recommendedAction: string;
      qualificationSummary: string;
      signals: string[];
      risks: string[];
      nextSteps: string[];
    }>(`
You are Zephyr, the autonomous Sales AI for ${org?.name ?? 'the company'}.

Evaluate this inbound lead:
- Name: ${lead.name}
- Company: ${lead.company ?? 'Not provided'}
- Email: ${lead.email}
- Phone: ${lead.phone ?? 'Not provided'}
- Initial value estimate: $${lead.value.toLocaleString()}
- Source: ${lead.source}

Our business context:
- Industry: ${org?.industry ?? 'Unknown'}
- Goals: ${org?.goals ?? 'Unknown'}
- Challenges: ${org?.challenges ?? 'Unknown'}

Provide a thorough qualification assessment. Score from 0-100 (70+ = qualified, 50-69 = nurture, <50 = disqualify).

Return JSON:
{
  "score": (integer 0-100),
  "reasoning": "2-3 sentence explanation of the score based on fit, company, value potential",
  "estimatedValue": (realistic deal value in USD based on their profile),
  "recommendedAction": "Specific next action (e.g., 'Schedule discovery call', 'Send ROI case study', 'Disqualify — not ICP fit')",
  "qualificationSummary": "One sentence executive summary for the pipeline",
  "signals": ["2-3 positive buying signals"],
  "risks": ["1-2 risks or red flags"],
  "nextSteps": ["3 sequenced next steps for this lead"]
}
`);

    const status = result.score >= 70 ? 'qualified' : result.score < 50 ? 'disqualified' : 'new';

    const updatedLead = await prisma.lead.update({
      where: { id: leadId },
      data: {
        status,
        qualificationScore: result.score,
        qualificationReasoning: result.reasoning,
        estimatedValue: result.estimatedValue,
        recommendedAction: result.recommendedAction,
        qualifiedAt: new Date(),
        qualifiedBy: this.executiveName,
        assignedToExecutiveId: this.executiveId,
        updatedAt: new Date(),
      },
    });

    await this.rememberText(
      `Lead qualified: ${lead.name} (${lead.company}) — Score: ${result.score}/100. ${result.reasoning}`,
      'insight',
      ['sales', 'lead-qualification', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed(
      result.score >= 70 ? 'Lead Qualified' : result.score < 50 ? 'Lead Disqualified' : 'Lead Under Review',
      `${lead.name} from ${lead.company ?? 'unknown'} — Score: ${result.score}/100. ${result.recommendedAction}`,
      result.score >= 70 ? 'success' : result.score < 50 ? 'warning' : 'info',
    );

    await this.incrementTaskCount(result.score >= 70 ? result.estimatedValue * 0.1 : 0);
    await this.setStatus('IDLE', `Qualified lead: ${lead.name}`);

    return { lead: updatedLead, qualification: result };
  }

  // ─── Pipeline Review ────────────────────────────────────────────────────────

  async reviewPipeline() {
    await this.setStatus('ACTIVE', 'Reviewing pipeline health');

    const leads = await prisma.lead.findMany({
      where: { organizationId: this.organizationId },
      orderBy: { createdAt: 'desc' },
    });

    const newLeads = leads.filter((l) => l.status === 'new');
    const qualified = leads.filter((l) => l.status === 'qualified');
    const inProposal = leads.filter((l) => l.status === 'proposal_drafted' || l.status === 'proposal_sent');
    const closedWon = leads.filter((l) => l.status === 'closed_won');
    const pipelineValue = [...qualified, ...inProposal].reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);
    const closedRevenue = closedWon.reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);

    const org = await this.getOrgContext();

    const review = await this.generateJSON<{
      summary: string;
      healthScore: number;
      recommendations: string[];
      alertLeads: string[];
      forecastNextMonth: number;
    }>(`
You are Zephyr, Sales AI for ${org?.name ?? 'the company'}.

Pipeline Status:
- New unqualified leads: ${newLeads.length}
- Qualified leads: ${qualified.length}
- In proposal stage: ${inProposal.length}
- Closed won: ${closedWon.length}
- Pipeline value (qualified + proposal): $${pipelineValue.toLocaleString()}
- Total closed revenue: $${closedRevenue.toLocaleString()}

Provide a pipeline health review.

Return JSON:
{
  "summary": "2-3 sentence executive pipeline summary",
  "healthScore": (integer 0-100, where 100 is a perfectly healthy pipeline),
  "recommendations": ["3 specific actions to improve the pipeline"],
  "alertLeads": ["Names or companies of leads that need immediate attention"],
  "forecastNextMonth": (estimated revenue to close next month in USD)
}
`);

    await this.pushFeed(
      'Pipeline Review Complete',
      `${leads.length} total leads. Pipeline value: $${pipelineValue.toLocaleString()}. Health score: ${review.healthScore}/100.`,
      review.healthScore >= 70 ? 'success' : 'warning',
    );

    await this.rememberText(
      `Pipeline Review: ${review.summary} Forecast next month: $${review.forecastNextMonth?.toLocaleString()}.`,
      'insight',
      ['sales', 'pipeline', 'forecast'],
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Pipeline review complete.');

    return {
      metrics: { newLeads: newLeads.length, qualified: qualified.length, inProposal: inProposal.length, closedWon: closedWon.length, pipelineValue, closedRevenue },
      review,
    };
  }

  // ─── Draft Outreach Email ───────────────────────────────────────────────────

  async draftOutreachEmail(leadId: string, type: 'initial' | 'follow_up' | 're_engage' = 'initial') {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: this.organizationId } });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      subject: string;
      body: string;
      callToAction: string;
    }>(`
You are Zephyr, Sales AI for ${org?.name ?? 'the company'}.

Draft a ${type === 'initial' ? 'first-touch outreach' : type === 'follow_up' ? 'follow-up' : 're-engagement'} email to:
- Name: ${lead.name}
- Company: ${lead.company ?? 'their company'}
- Email: ${lead.email}
- Qualification score: ${lead.qualificationScore ?? 'not yet scored'}/100
- Context: ${lead.qualificationReasoning ?? 'New inbound lead'}

Our company: ${org?.name}, ${org?.industry} industry.

Write a concise, professional, personalized email that:
- Feels human (not template-like)
- References their specific situation
- Has a single clear call to action
- Is under 150 words

Return JSON:
{
  "subject": "Email subject line",
  "body": "Full email body (no placeholders)",
  "callToAction": "The specific ask (e.g., '15-minute call this week?')"
}
`);

    await this.pushFeed('Outreach Email Drafted', `${type} email drafted for ${lead.name} at ${lead.company}.`, 'info');
    await this.incrementTaskCount();

    return result;
  }

  // ─── Create Sales Decision ──────────────────────────────────────────────────

  async createSalesDecision(leadId: string, proposalId: string, dealValue: number) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: this.organizationId } });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    const financeAIId = await this.getFinanceAIId();

    const decision = await this.createDecision({
      title: `Approve Deal: ${lead.name} at ${lead.company ?? 'Unknown Company'}`,
      summary: `Zephyr has qualified ${lead.name} (${lead.company}) with score ${lead.qualificationScore}/100. Finance AI has drafted a proposal for $${dealValue.toLocaleString()}.`,
      description: `Full qualification reasoning: ${lead.qualificationReasoning}`,
      reasoning: lead.qualificationReasoning ?? 'Lead shows strong fit with company ICP.',
      impact: `Potential revenue: $${dealValue.toLocaleString()} ARR. Recommended action: ${lead.recommendedAction}`,
      confidence: lead.qualificationScore ?? 75,
      type: 'financial',
      contributorIds: financeAIId ? [financeAIId] : [],
      expiresInHours: 72,
      metadata: { leadId, proposalId, dealValue },
    });

    return decision;
  }

  // ─── Close Lead ─────────────────────────────────────────────────────────────

  async markLeadClosed(leadId: string, outcome: 'won' | 'lost', reason?: string) {
    const lead = await prisma.lead.findFirst({ where: { id: leadId, organizationId: this.organizationId } });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    const finalValue = lead.estimatedValue ?? lead.value;

    await prisma.lead.update({
      where: { id: leadId },
      data: {
        status: outcome === 'won' ? 'closed_won' : 'closed_lost',
        updatedAt: new Date(),
        metadata: { ...((lead.metadata as any) ?? {}), closeReason: reason, closedAt: new Date().toISOString() },
      },
    });

    await this.pushFeed(
      outcome === 'won' ? 'Deal Closed Won 🏆' : 'Deal Closed Lost',
      `${lead.name} at ${lead.company}: ${outcome === 'won' ? `$${finalValue.toLocaleString()} deal closed!` : `Lost. ${reason ?? 'No reason specified.'}`}`,
      outcome === 'won' ? 'success' : 'warning',
    );

    if (outcome === 'won') {
      await this.incrementTaskCount(finalValue);
      await this.rememberText(
        `Closed won: ${lead.name} (${lead.company}) — $${finalValue.toLocaleString()}. ${reason ?? ''}`,
        'insight',
        ['sales', 'closed-won', 'revenue'],
      );
    }

    return { leadId, outcome, value: finalValue };
  }

  // ─── Generate Pipeline Report ────────────────────────────────────────────────

  async generatePipelineReport() {
    const { metrics, review } = await this.reviewPipeline();

    return {
      title: 'Sales Pipeline Report',
      generatedAt: new Date().toISOString(),
      generatedBy: this.executiveName,
      metrics,
      review,
    };
  }
}
