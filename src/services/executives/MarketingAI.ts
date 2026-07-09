/**
 * Atlas OS — Marketing AI (Aria)
 *
 * Chief Marketing Officer. Plans campaigns, creates content, manages ads,
 * tracks attribution, generates demand, and delivers qualified leads.
 *
 * Persona: "Aria" — creative, data-driven, brand guardian.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class MarketingAI extends ExecutiveService {
  private salesAIId: string | null = null;

  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Aria (Marketing AI)');
  }

  private async getSalesAIId(): Promise<string | null> {
    if (this.salesAIId) return this.salesAIId;
    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId: this.organizationId, name: { contains: 'Sales' } },
    });
    this.salesAIId = exec?.id ?? null;
    return this.salesAIId;
  }

  // ─── Campaign Planning ──────────────────────────────────────────────────────

  async planCampaign(params: {
    goal: string;
    targetAudience: string;
    budget: number;
    duration: string;
    channels?: string[];
  }) {
    await this.setStatus('ACTIVE', `Planning campaign: ${params.goal}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      campaignName: string;
      strategy: string;
      channels: Array<{
        name: string;
        budget: number;
        tactics: string[];
        expectedReach: number;
        expectedLeads: number;
      }>;
      timeline: Array<{
        phase: string;
        startDay: number;
        endDay: number;
        deliverables: string[];
      }>;
      kpis: string[];
      risks: string[];
      successCriteria: string[];
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Plan a marketing campaign with these parameters:
- Goal: ${params.goal}
- Target audience: ${params.targetAudience}
- Budget: $${params.budget.toLocaleString()}
- Duration: ${params.duration}
- Preferred channels: ${params.channels?.join(', ') ?? 'All applicable'}

Our company: ${org?.name}, ${org?.industry} industry.
Our goals: ${org?.goals ?? 'Growth and brand awareness'}

Return JSON:
{
  "campaignName": "Creative, memorable campaign name",
  "strategy": "2-3 paragraph campaign strategy overview",
  "channels": [
    {
      "name": "Google Ads" | "LinkedIn" | "Facebook" | "Content Marketing" | "Email" | "SEO",
      "budget": (portion of total budget),
      "tactics": ["Specific tactics for this channel"],
      "expectedReach": (estimated impressions/views),
      "expectedLeads": (estimated MQLs)
    },
    ... (3-5 channels)
  ],
  "timeline": [
    {
      "phase": "Planning" | "Launch" | "Optimization" | "Reporting",
      "startDay": 1,
      "endDay": 7,
      "deliverables": ["What gets done in this phase"]
    },
    ... (4-6 phases)
  ],
  "kpis": ["5-7 key performance indicators to track"],
  "risks": ["3 potential risks and mitigation strategies"],
  "successCriteria": ["What does success look like?"]
}
`);

    // Create workflow for campaign execution
    const workflow = await prisma.workflow.create({
      data: {
        organizationId: this.organizationId,
        name: `Campaign: ${result.campaignName}`,
        description: result.strategy,
        status: 'active',
        triggerEvent: 'campaign_planned',
        metadata: { budget: params.budget, goal: params.goal, targetAudience: params.targetAudience },
        updatedAt: new Date(),
        steps: {
          create: result.timeline.map((phase, index) => ({
            name: phase.phase,
            actionDescription: phase.deliverables.join(', '),
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
      `Campaign planned: "${result.campaignName}" — $${params.budget.toLocaleString()} budget, ${result.channels.length} channels, ${result.timeline.length} phases`,
      'workflow',
      ['marketing', 'campaign', params.goal.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Campaign Planned', `"${result.campaignName}" — $${params.budget.toLocaleString()} budget across ${result.channels.length} channels`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Campaign "${result.campaignName}" ready to launch.`);

    return { plan: result, workflow };
  }

  // ─── Content Generation ─────────────────────────────────────────────────────

  async generateContent(params: {
    type: 'blog' | 'social' | 'email' | 'landing_page' | 'ad_copy';
    topic: string;
    audience: string;
    tone?: string;
    wordCount?: number;
  }) {
    await this.setStatus('ACTIVE', `Generating ${params.type} content: ${params.topic}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      content: string;
      headline: string;
      subheadline?: string;
      callToAction: string;
      seoKeywords?: string[];
      socialShareText?: string;
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Generate ${params.type} content with these parameters:
- Topic: ${params.topic}
- Target audience: ${params.audience}
- Tone: ${params.tone ?? 'Professional, engaging'}
- ${params.wordCount ? `Word count: ${params.wordCount}` : ''}

Our company: ${org?.name}, ${org?.industry} industry.
Brand voice: ${params.tone ?? 'Professional, approachable, value-focused'}

Requirements:
${params.type === 'blog' ? '- Full blog post in Markdown\n- SEO-optimized\n- Include section headers\n- Actionable insights' : ''}
${params.type === 'social' ? '- Platform-specific best practices\n- Engaging hook\n- Include hashtags\n- Character limits respected' : ''}
${params.type === 'email' ? '- Subject line\n- Preview text\n- Clear CTA\n- Personalization hooks' : ''}
${params.type === 'landing_page' ? '- Hero section\n- Value props\n- Social proof\n- Strong CTA' : ''}
${params.type === 'ad_copy' ? '- Multiple headline variations\n- Compelling offer\n- Urgency/scarcity if appropriate' : ''}

Return JSON:
{
  "content": "Full content (Markdown for blog/landing page, plain text for social/email/ads)",
  "headline": "Primary headline",
  ${params.type !== 'social' && params.type !== 'ad_copy' ? '"subheadline": "Supporting subheadline",' : ''}
  "callToAction": "Clear, specific CTA",
  ${params.type === 'blog' || params.type === 'landing_page' ? '"seoKeywords": ["5-7 SEO keywords"],' : ''}
  ${params.type === 'blog' || params.type === 'landing_page' ? '"socialShareText": "Pre-written social share copy"' : ''}
}
`);

    await this.rememberText(
      `${params.type} content generated: "${result.headline}" — Topic: ${params.topic}`,
      'document',
      ['marketing', 'content', params.type, params.topic.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Content Generated', `${params.type}: "${result.headline}"`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `${params.type} content ready.`);

    return result;
  }

  // ─── Lead Scoring (Pre-Sales) ───────────────────────────────────────────────

  async scoreMarketingLead(leadId: string) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId, status: 'new' },
    });
    if (!lead) throw new Error(`Lead ${leadId} not found or already processed.`);

    await this.setStatus('ACTIVE', `Scoring marketing lead: ${lead.name}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      mqlScore: number;
      qualification: string;
      readyForSales: boolean;
      engagementLevel: string;
      buyingIntent: string;
      recommendedNurture: string[];
      salesHandoffReason: string;
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Score this marketing lead for sales-readiness:
- Name: ${lead.name}
- Company: ${lead.company ?? 'Not provided'}
- Email: ${lead.email}
- Source: ${lead.source}
- Initial value: $${lead.value.toLocaleString()}

Our ICP: ${org?.industry} companies, ${org?.size} size, ${org?.goals ?? 'growth-focused'}

Return JSON:
{
  "mqlScore": (0-100, where 70+ = MQL, ready for sales),
  "qualification": "cold" | "warm" | "hot" | "mql",
  "readyForSales": (boolean),
  "engagementLevel": "low" | "medium" | "high",
  "buyingIntent": "awareness" | "consideration" | "decision",
  "recommendedNurture": ["If not ready for sales, what nurture campaigns to add them to"],
  "salesHandoffReason": "If ready for sales, why now is the right time"
}
`);

    // Hand off to Sales if MQL
    if (result.readyForSales) {
      const salesAIId = await this.getSalesAIId();
      if (salesAIId) {
        await prisma.lead.update({
          where: { id: leadId },
          data: {
            assignedToExecutiveId: salesAIId,
            metadata: {
              ...((lead.metadata as any) ?? {}),
              mqlScore: result.mqlScore,
              mqlDate: new Date().toISOString(),
              handoffReason: result.salesHandoffReason,
            },
            updatedAt: new Date(),
          },
        });

        await this.createTask({
          title: `Qualify MQL: ${lead.name} at ${lead.company}`,
          description: `Marketing scored ${result.mqlScore}/100. ${result.salesHandoffReason}`,
          priority: 'high',
          assignedToExecutiveId: salesAIId,
          leadId: lead.id,
          dueDate: new Date(Date.now() + 24 * 3600 * 1000), // 24 hours
        });
      }
    }

    await this.rememberText(
      `Lead scored: ${lead.name} (${lead.company}) — MQL Score: ${result.mqlScore}/100, ${result.qualification}. ${result.readyForSales ? 'Handed to Sales' : 'Nurture recommended'}`,
      'insight',
      ['marketing', 'lead-scoring', result.qualification],
    );

    await this.pushFeed(
      result.readyForSales ? 'MQL → Sales Handoff' : 'Lead Scored',
      `${lead.name}: ${result.mqlScore}/100 (${result.qualification}). ${result.readyForSales ? 'Sent to Sales AI' : 'Added to nurture'}`,
      result.readyForSales ? 'success' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Lead scored: ${lead.name}.`);

    return { lead, scoring: result };
  }

  // ─── Campaign Performance Analysis ──────────────────────────────────────────

  async analyzeCampaignPerformance(workflowId: string) {
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId: this.organizationId },
      include: { steps: true },
    });
    if (!workflow) throw new Error(`Workflow ${workflowId} not found.`);

    await this.setStatus('ACTIVE', `Analyzing campaign: ${workflow.name}`);

    const org = await this.getOrgContext();
    const budget = (workflow.metadata as any)?.budget ?? 0;
    const goal = (workflow.metadata as any)?.goal ?? 'Unknown';

    // Fetch leads generated during campaign period
    const leads = await prisma.lead.count({
      where: {
        organizationId: this.organizationId,
        createdAt: { gte: workflow.startedAt ?? workflow.createdAt },
      },
    });

    const result = await this.generateJSON<{
      summary: string;
      metrics: {
        impressions: number;
        clicks: number;
        leads: number;
        mqls: number;
        conversions: number;
        costPerLead: number;
        roi: number;
      };
      channelPerformance: Array<{
        channel: string;
        performance: string;
        recommendation: string;
      }>;
      optimization: string[];
      nextSteps: string[];
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Analyze campaign performance:
- Campaign: ${workflow.name}
- Budget: $${budget.toLocaleString()}
- Goal: ${goal}
- Leads generated: ${leads}
- Duration: ${workflow.startedAt ? Math.floor((Date.now() - workflow.startedAt.getTime()) / (24 * 3600 * 1000)) : 'Not started'} days

Provide realistic estimates based on typical ${org?.industry} campaign performance.

Return JSON:
{
  "summary": "2-3 paragraph campaign performance summary",
  "metrics": {
    "impressions": (estimated impressions),
    "clicks": (estimated clicks),
    "leads": ${leads},
    "mqls": (estimated MQLs),
    "conversions": (estimated closed deals),
    "costPerLead": (budget / leads, or estimate if leads = 0),
    "roi": (percentage ROI, can be negative)
  },
  "channelPerformance": [
    {
      "channel": "Google Ads" | "LinkedIn" | etc,
      "performance": "overperforming" | "meeting expectations" | "underperforming",
      "recommendation": "What to do with this channel"
    },
    ... (3-5 channels)
  ],
  "optimization": ["5 specific optimizations to improve performance"],
  "nextSteps": ["3 immediate next steps"]
}
`);

    await this.rememberText(
      `Campaign analysis: ${workflow.name} — ${leads} leads at $${result.metrics.costPerLead?.toFixed(2)} CPL. ROI: ${result.metrics.roi}%`,
      'insight',
      ['marketing', 'campaign-analysis', 'performance'],
    );

    await this.pushFeed('Campaign Analysis Complete', `${workflow.name}: ${leads} leads, ${result.metrics.roi}% ROI`, result.metrics.roi >= 0 ? 'success' : 'warning');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Campaign analysis complete for ${workflow.name}.`);

    return { campaign: workflow, analysis: result };
  }

  // ─── SEO Keyword Research ───────────────────────────────────────────────────

  async researchKeywords(topic: string, intent: 'informational' | 'commercial' | 'transactional' = 'informational') {
    await this.setStatus('ACTIVE', `Researching SEO keywords for: ${topic}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      primaryKeyword: string;
      secondaryKeywords: string[];
      longTailKeywords: string[];
      searchVolume: string;
      difficulty: string;
      contentIdeas: string[];
      competitorAnalysis: string;
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Research SEO keywords for:
- Topic: ${topic}
- Search intent: ${intent}
- Industry: ${org?.industry}

Return JSON:
{
  "primaryKeyword": "Main target keyword",
  "secondaryKeywords": ["5-7 related keywords to target"],
  "longTailKeywords": ["5-7 long-tail variations (3-5 words)"],
  "searchVolume": "low" | "medium" | "high",
  "difficulty": "easy" | "medium" | "hard",
  "contentIdeas": ["5 content piece ideas to target these keywords"],
  "competitorAnalysis": "1-2 sentence analysis of competitive landscape"
}
`);

    await this.pushFeed('SEO Keywords Researched', `${topic}: ${result.secondaryKeywords.length + result.longTailKeywords.length} keywords identified (${result.difficulty} difficulty)`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Keyword research complete for ${topic}.`);

    return result;
  }

  // ─── Email Campaign ─────────────────────────────────────────────────────────

  async createEmailCampaign(params: {
    name: string;
    audience: string;
    goal: string;
    emailCount: number;
    daysBetween: number;
  }) {
    await this.setStatus('ACTIVE', `Creating email campaign: ${params.name}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      campaignName: string;
      strategy: string;
      emails: Array<{
        sequence: number;
        subject: string;
        previewText: string;
        body: string;
        cta: string;
        sendDay: number;
      }>;
      segmentation: string;
      expectedOpenRate: number;
      expectedClickRate: number;
    }>(`
You are Aria, Marketing AI for ${org?.name ?? 'the company'}.

Create an email nurture campaign:
- Name: ${params.name}
- Audience: ${params.audience}
- Goal: ${params.goal}
- Number of emails: ${params.emailCount}
- Days between emails: ${params.daysBetween}

Our company: ${org?.name}, ${org?.industry} industry.

Return JSON:
{
  "campaignName": "${params.name}",
  "strategy": "2-3 paragraph email campaign strategy",
  "emails": [
    {
      "sequence": 1,
      "subject": "Email subject line",
      "previewText": "Preview text shown in inbox",
      "body": "Full email body (personalized, conversational, HTML or plain text)",
      "cta": "Clear call to action",
      "sendDay": 0
    },
    ... (${params.emailCount} emails total, ${params.daysBetween} days apart)
  ],
  "segmentation": "How to segment the audience for best results",
  "expectedOpenRate": (percentage 0-100),
  "expectedClickRate": (percentage 0-100)
}
`);

    await this.rememberText(
      `Email campaign created: ${params.name} — ${params.emailCount} emails over ${params.emailCount * params.daysBetween} days`,
      'workflow',
      ['marketing', 'email-campaign', params.name.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Email Campaign Created', `"${params.name}" — ${params.emailCount}-email sequence ready to deploy`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Email campaign "${params.name}" ready.`);

    return result;
  }
}
