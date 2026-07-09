/**
 * Atlas OS — Customer Success AI (Lyra)
 *
 * Chief Customer Officer. Ensures customers achieve their goals, maximizes retention,
 * identifies expansion opportunities, prevents churn.
 *
 * Persona: "Lyra" — empathetic, proactive, customer-obsessed.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class CustomerSuccessAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Lyra (Customer Success AI)');
  }

  // ─── Customer Health Scoring ────────────────────────────────────────────────

  async calculateCustomerHealth(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'closed_won' },
    });
    if (!lead) throw new Error(`Customer ${leadId} not found or not closed won.`);

    await this.setStatus('ACTIVE', `Calculating health score for ${lead.name} at ${lead.company}`);

    const org = await this.getOrgContext();
    const daysSinceClose = lead.metadata && (lead.metadata as any).closedAt 
      ? Math.floor((Date.now() - new Date((lead.metadata as any).closedAt).getTime()) / (24 * 3600 * 1000))
      : 30;

    const result = await this.generateJSON<{
      healthScore: number;
      status: string;
      signals: {
        positive: string[];
        negative: string[];
      };
      riskLevel: string;
      churnProbability: number;
      recommendations: string[];
      nextActions: string[];
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Calculate a customer health score for:
- Customer: ${lead.name} at ${lead.company}
- Contract value: $${(lead.estimatedValue ?? lead.value).toLocaleString()}
- Days since closed: ${daysSinceClose}
- Source: ${lead.source}

Our industry: ${org?.industry}

Use these signals to estimate health:
- Recent engagement (assume medium if unknown)
- Time since close (newer customers need more attention)
- Contract size (larger deals = higher priority)

Return JSON:
{
  "healthScore": (0-100, where 100 is perfect health),
  "status": "healthy" | "at-risk" | "critical",
  "signals": {
    "positive": ["2-3 positive health indicators"],
    "negative": ["2-3 concerning indicators or risks"]
  },
  "riskLevel": "low" | "medium" | "high",
  "churnProbability": (0-100 percentage),
  "recommendations": ["3-4 specific actions to improve health"],
  "nextActions": ["Immediate next steps for the CS team"]
}
`);

    // Store health score in lead metadata
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        metadata: {
          ...((lead.metadata as any) ?? {}),
          healthScore: result.healthScore,
          healthStatus: result.status,
          lastHealthCheck: new Date().toISOString(),
          churnProbability: result.churnProbability,
        },
        updatedAt: new Date(),
      },
    });

    await this.rememberText(
      `Customer health: ${lead.name} (${lead.company}) — Score: ${result.healthScore}/100, Status: ${result.status}, Churn risk: ${result.churnProbability}%`,
      'insight',
      ['customer-success', 'health-score', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed(
      `Customer Health: ${result.status.charAt(0).toUpperCase() + result.status.slice(1)}`,
      `${lead.name} at ${lead.company}: ${result.healthScore}/100 (${result.churnProbability}% churn risk)`,
      result.status === 'critical' ? 'critical' : result.status === 'at-risk' ? 'warning' : 'success',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Health calculated for ${lead.name}.`);

    return { customer: lead, health: result };
  }

  // ─── Onboarding Plan ────────────────────────────────────────────────────────

  async createOnboardingPlan(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'closed_won' },
    });
    if (!lead) throw new Error(`Customer ${leadId} not found.`);

    await this.setStatus('ACTIVE', `Creating onboarding plan for ${lead.name}`);

    const org = await this.getOrgContext();
    const proposal = await prisma.proposal.findFirst({
      where: { leadId, organizationId: this.organizationId },
      include: { lineItems: true },
    });

    const result = await this.generateJSON<{
      plan: string;
      milestones: Array<{
        name: string;
        daysFromStart: number;
        description: string;
        successCriteria: string;
      }>;
      kickoffAgenda: string[];
      resources: string[];
      riskMitigations: string[];
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Create a comprehensive onboarding plan for:
- Customer: ${lead.name} at ${lead.company}
- Contract value: $${(lead.estimatedValue ?? lead.value).toLocaleString()}
- ${proposal ? `Deliverables: ${proposal.lineItems.map((i) => i.description).join(', ')}` : 'Standard onboarding'}

Our industry: ${org?.industry}

Return JSON:
{
  "plan": "2-3 paragraph executive summary of the onboarding approach",
  "milestones": [
    {
      "name": "Kickoff Call",
      "daysFromStart": 1,
      "description": "Initial alignment meeting",
      "successCriteria": "Stakeholders identified, goals confirmed"
    },
    ... (5-7 milestones over 60-90 days)
  ],
  "kickoffAgenda": ["5-7 agenda items for the kickoff call"],
  "resources": ["Documentation, training materials, support contacts"],
  "riskMitigations": ["3 common onboarding risks and how to avoid them"]
}
`);

    // Create workflow for onboarding
    const workflow = await prisma.workflow.create({
      data: {
        organizationId: this.organizationId,
        name: `Onboard ${lead.company ?? lead.name}`,
        description: result.plan,
        status: 'active',
        triggerEvent: 'customer_closed_won',
        metadata: { leadId, customerId: lead.id },
        updatedAt: new Date(),
        steps: {
          create: result.milestones.map((milestone, index) => ({
            name: milestone.name,
            actionDescription: milestone.description,
            status: index === 0 ? 'in_progress' : 'pending',
            order: index,
            actorExecutiveId: this.executiveId,
            updatedAt: new Date(),
          })),
        },
      },
      include: { steps: true },
    });

    await this.rememberText(
      `Onboarding plan created for ${lead.name} (${lead.company}) — ${result.milestones.length} milestones over ${result.milestones[result.milestones.length - 1].daysFromStart} days.`,
      'workflow',
      ['customer-success', 'onboarding', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed('Onboarding Plan Created', `${result.milestones.length}-milestone plan for ${lead.name} at ${lead.company}`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Onboarding plan ready for ${lead.name}.`);

    return { plan: result, workflow };
  }

  // ─── Expansion Opportunity Detection ────────────────────────────────────────

  async identifyExpansionOpportunities(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'closed_won' },
    });
    if (!lead) throw new Error(`Customer ${leadId} not found.`);

    await this.setStatus('ACTIVE', `Analyzing expansion opportunities for ${lead.name}`);

    const org = await this.getOrgContext();
    const currentValue = lead.estimatedValue ?? lead.value;
    const healthData = (lead.metadata as any)?.healthScore ?? 75;

    const result = await this.generateJSON<{
      opportunities: Array<{
        type: string;
        description: string;
        estimatedValue: number;
        likelihood: number;
        timeframe: string;
        requirements: string[];
      }>;
      upsellReadiness: number;
      recommendedApproach: string;
      talking_points: string[];
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Identify expansion opportunities for:
- Customer: ${lead.name} at ${lead.company}
- Current contract value: $${currentValue.toLocaleString()}
- Health score: ${healthData}/100
- Industry: ${org?.industry}

Types of expansion:
1. Upsell (higher tier, more features)
2. Cross-sell (additional products/services)
3. User expansion (more seats/licenses)
4. Usage expansion (higher volume)

Return JSON:
{
  "opportunities": [
    {
      "type": "upsell" | "cross-sell" | "user_expansion" | "usage_expansion",
      "description": "Specific opportunity description",
      "estimatedValue": (additional ARR in USD),
      "likelihood": (0-100 probability of success),
      "timeframe": "When to approach (e.g., 'Q2 2025', 'After 90 days')",
      "requirements": ["What needs to happen first"]
    },
    ... (2-4 opportunities)
  ],
  "upsellReadiness": (0-100, overall readiness for expansion conversation),
  "recommendedApproach": "Strategy for introducing expansion (timing, messaging, stakeholders)",
  "talking_points": ["3-5 value-focused talking points for expansion discussion"]
}
`);

    await this.rememberText(
      `Expansion opportunities for ${lead.name} (${lead.company}): ${result.opportunities.length} opportunities worth $${result.opportunities.reduce((sum, o) => sum + o.estimatedValue, 0).toLocaleString()}`,
      'insight',
      ['customer-success', 'expansion', 'upsell', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed(
      'Expansion Opportunities Identified',
      `${result.opportunities.length} expansion opportunities for ${lead.name}: $${result.opportunities.reduce((sum, o) => sum + o.estimatedValue, 0).toLocaleString()} potential`,
      'info',
    );

    await this.incrementTaskCount(result.opportunities.reduce((sum, o) => sum + o.estimatedValue, 0) * 0.05);
    await this.setStatus('IDLE', `Expansion analysis complete for ${lead.name}.`);

    return result;
  }

  // ─── Churn Prevention ───────────────────────────────────────────────────────

  async createChurnPreventionPlan(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'closed_won' },
    });
    if (!lead) throw new Error(`Customer ${leadId} not found.`);

    const healthData = (lead.metadata as any)?.healthScore ?? 50;
    const churnRisk = (lead.metadata as any)?.churnProbability ?? 50;

    if (churnRisk < 30) {
      return { message: 'Customer is healthy, no churn prevention needed at this time.' };
    }

    await this.setStatus('ACTIVE', `Creating churn prevention plan for ${lead.name} (${churnRisk}% risk)`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      urgency: string;
      rootCauses: string[];
      interventionPlan: string;
      actions: Array<{
        action: string;
        owner: string;
        deadline: string;
        priority: string;
      }>;
      escalationPath: string[];
      successMetrics: string[];
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Create a churn prevention plan for at-risk customer:
- Customer: ${lead.name} at ${lead.company}
- Contract value: $${(lead.estimatedValue ?? lead.value).toLocaleString()}
- Health score: ${healthData}/100
- Churn risk: ${churnRisk}%

Return JSON:
{
  "urgency": "low" | "medium" | "high" | "critical",
  "rootCauses": ["3-5 likely reasons for churn risk"],
  "interventionPlan": "2-3 paragraph plan to salvage the relationship",
  "actions": [
    {
      "action": "Specific action to take",
      "owner": "Who should do it (CS team, executive, etc.)",
      "deadline": "When (e.g., 'Within 48 hours', 'This week')",
      "priority": "high" | "medium" | "low"
    },
    ... (5-7 actions)
  ],
  "escalationPath": ["When and how to escalate if actions fail"],
  "successMetrics": ["How to measure if intervention worked"]
}
`);

    // Create high-priority tasks
    for (const action of result.actions.filter((a) => a.priority === 'high')) {
      await this.createTask({
        title: `[CHURN RISK] ${action.action}`,
        description: `For ${lead.name} at ${lead.company} — Churn risk: ${churnRisk}%`,
        priority: 'urgent',
        assignedToExecutiveId: this.executiveId,
        leadId: lead.id,
        dueDate: new Date(Date.now() + 48 * 3600 * 1000), // 48 hours
        metadata: { churnPrevention: true, urgency: result.urgency },
      });
    }

    await this.rememberText(
      `Churn prevention plan for ${lead.name} (${lead.company}) — ${churnRisk}% risk. ${result.actions.length} actions identified.`,
      'decision',
      ['customer-success', 'churn-prevention', 'at-risk', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed(
      'Churn Prevention Plan Created',
      `${lead.name} at ${lead.company}: ${result.urgency} urgency, ${result.actions.length} actions, ${result.actions.filter((a) => a.priority === 'high').length} tasks created`,
      result.urgency === 'critical' || result.urgency === 'high' ? 'critical' : 'warning',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Churn prevention plan ready for ${lead.name}.`);

    return result;
  }

  // ─── QBR Agenda Generation ──────────────────────────────────────────────────

  async generateQBRAgenda(leadId: string, quarter: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'closed_won' },
    });
    if (!lead) throw new Error(`Customer ${leadId} not found.`);

    await this.setStatus('ACTIVE', `Generating QBR agenda for ${lead.name}`);

    const org = await this.getOrgContext();
    const healthData = (lead.metadata as any)?.healthScore ?? 75;

    const result = await this.generateJSON<{
      agenda: string[];
      executiveSummary: string;
      metrics: string[];
      wins: string[];
      challenges: string[];
      roadmapItems: string[];
      actionItems: string[];
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Generate a Quarterly Business Review (QBR) agenda for:
- Customer: ${lead.name} at ${lead.company}
- Quarter: ${quarter}
- Contract value: $${(lead.estimatedValue ?? lead.value).toLocaleString()}
- Health score: ${healthData}/100

Return JSON:
{
  "agenda": ["7-10 agenda items for a 60-minute QBR"],
  "executiveSummary": "2-paragraph summary of the quarter for the customer",
  "metrics": ["5-7 key metrics to review (usage, adoption, ROI, etc.)"],
  "wins": ["3-5 wins to celebrate this quarter"],
  "challenges": ["2-3 challenges or obstacles encountered"],
  "roadmapItems": ["3-5 upcoming features or initiatives to preview"],
  "actionItems": ["3-5 action items for the next quarter"]
}
`);

    await this.pushFeed('QBR Agenda Ready', `${quarter} QBR agenda for ${lead.name} at ${lead.company}`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `QBR agenda generated for ${lead.name}.`);

    return { customer: lead, quarter, ...result };
  }

  // ─── NPS Survey Analysis ────────────────────────────────────────────────────

  async analyzeNPS(scores: Array<{ customerId: string; score: number; feedback?: string }>) {
    await this.setStatus('ACTIVE', `Analyzing NPS survey results (${scores.length} responses)`);

    const promoters = scores.filter((s) => s.score >= 9).length;
    const passives = scores.filter((s) => s.score >= 7 && s.score <= 8).length;
    const detractors = scores.filter((s) => s.score <= 6).length;
    const nps = ((promoters - detractors) / scores.length) * 100;

    const org = await this.getOrgContext();
    const feedback = scores.filter((s) => s.feedback).map((s) => `- Score ${s.score}: "${s.feedback}"`).join('\n');

    const result = await this.generateJSON<{
      npsScore: number;
      interpretation: string;
      themes: string[];
      promoterInsights: string[];
      detractorInsights: string[];
      recommendations: string[];
      benchmarkComparison: string;
    }>(`
You are Lyra, Customer Success AI for ${org?.name ?? 'the company'}.

Analyze NPS survey results:
- Total responses: ${scores.length}
- Promoters (9-10): ${promoters}
- Passives (7-8): ${passives}
- Detractors (0-6): ${detractors}
- NPS Score: ${nps.toFixed(1)}

Feedback samples:
${feedback || 'No written feedback provided'}

Return JSON:
{
  "npsScore": ${nps},
  "interpretation": "2-paragraph analysis of what this NPS means",
  "themes": ["3-5 common themes from feedback"],
  "promoterInsights": ["What promoters love"],
  "detractorInsights": ["What detractors are unhappy about"],
  "recommendations": ["5 specific actions to improve NPS"],
  "benchmarkComparison": "How this compares to industry standards (if known)"
}
`);

    await this.rememberText(
      `NPS Analysis: Score ${nps.toFixed(1)} (${promoters} promoters, ${detractors} detractors). Key themes: ${result.themes.join(', ')}`,
      'insight',
      ['customer-success', 'nps', 'survey'],
    );

    await this.pushFeed('NPS Analysis Complete', `NPS: ${nps.toFixed(1)} (${scores.length} responses). ${result.recommendations.length} recommendations.`, nps >= 50 ? 'success' : nps >= 30 ? 'warning' : 'critical');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'NPS analysis complete.');

    return result;
  }
}
