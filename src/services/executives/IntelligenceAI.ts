/**
 * Atlas OS — Intelligence AI (Iris)
 *
 * Chief Data Officer. Aggregates data from all departments, identifies trends,
 * detects anomalies, builds forecasts, and delivers strategic insights.
 *
 * Persona: "Iris" — sees everything, pattern-finder, data-to-wisdom translator.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class IntelligenceAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Iris (Intelligence AI)');
  }

  // ─── Company Intelligence Report ─────────────────────────────────────────────

  async generateIntelligenceReport(period: 'daily' | 'weekly' | 'monthly' = 'weekly') {
    await this.setStatus('ACTIVE', `Generating ${period} intelligence report`);

    const org = await this.getOrgContext();

    // Gather all operational data
    const [leads, decisions, proposals, memories, feedEvents, executives] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.decision.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.proposal.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 20 }),
      prisma.memory.count({ where: { organizationId: this.organizationId } }),
      prisma.feedEvent.count({ where: { organizationId: this.organizationId } }),
      prisma.aIExecutive.findMany({ where: { organizationId: this.organizationId } }),
    ]);

    // Compute metrics
    const pipelineValue = leads.filter((l) => ['qualified', 'proposal_drafted', 'proposal_sent'].includes(l.status))
      .reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);
    const closedRevenue = leads.filter((l) => l.status === 'closed_won')
      .reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);
    const totalExecutiveValue = executives.reduce((sum, e) => sum + e.valueGenerated, 0);

    const result = await this.generateJSON<{
      headline: string;
      executiveSummary: string;
      kpis: Array<{ metric: string; value: string; trend: 'up' | 'down' | 'stable'; insight: string }>;
      departmentInsights: Array<{ department: string; headline: string; status: 'green' | 'yellow' | 'red' }>;
      opportunities: string[];
      risks: string[];
      recommendations: string[];
      forecastNextPeriod: string;
    }>(`
You are Iris, Intelligence AI for ${org?.name ?? 'the company'}.

Generate a ${period} company intelligence report.

Operational data:
- Total leads: ${leads.length} (${leads.filter((l) => l.status === 'new').length} new, ${leads.filter((l) => l.status === 'qualified').length} qualified, ${leads.filter((l) => l.status === 'closed_won').length} closed won)
- Pipeline value: $${pipelineValue.toLocaleString()}
- Closed revenue: $${closedRevenue.toLocaleString()}
- Proposals: ${proposals.length} (${proposals.filter((p) => p.status === 'accepted').length} accepted, ${proposals.filter((p) => p.status === 'sent').length} sent)
- Decisions: ${decisions.length} (${decisions.filter((d) => d.status === 'pending').length} pending, ${decisions.filter((d) => d.status === 'approved').length} approved)
- Memory entries: ${memories}
- Activity events: ${feedEvents}
- Total AI executive value: $${totalExecutiveValue.toLocaleString()}
- Executive performance: ${executives.map((e) => `${e.name}: ${e.tasksCompleted} tasks`).join(', ')}

Company: ${org?.name}, ${org?.industry} industry, ${org?.size} size.

Return JSON:
{
  "headline": "One punchy headline summarizing the most important insight this ${period}",
  "executiveSummary": "3-4 paragraph intelligence report — what happened, what it means, what to watch",
  "kpis": [
    {
      "metric": "KPI name",
      "value": "Current value",
      "trend": "up" | "down" | "stable",
      "insight": "Why this matters"
    },
    ... (6-8 KPIs)
  ],
  "departmentInsights": [
    {
      "department": "Department name",
      "headline": "One-sentence status",
      "status": "green" | "yellow" | "red"
    },
    ... (for each department with data)
  ],
  "opportunities": ["3-5 data-driven opportunities to pursue"],
  "risks": ["3-5 risks indicated by the data"],
  "recommendations": ["5 prioritized recommendations for next ${period}"],
  "forecastNextPeriod": "1-2 sentence forecast for next ${period}"
}
`);

    await this.rememberText(
      `${period.charAt(0).toUpperCase() + period.slice(1)} Intelligence Report: ${result.headline}`,
      'insight',
      ['intelligence', 'report', period, 'kpi'],
    );

    await this.pushFeed(
      `${period.charAt(0).toUpperCase() + period.slice(1)} Intelligence Report`,
      result.headline,
      'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `${period} intelligence report complete.`);

    return {
      period,
      generatedAt: new Date().toISOString(),
      rawMetrics: { leads: leads.length, pipelineValue, closedRevenue, proposals: proposals.length, decisions: decisions.length },
      report: result,
    };
  }

  // ─── Trend Analysis ──────────────────────────────────────────────────────────

  async analyzeTrends(params: {
    metric: string;
    lookbackDays?: number;
  }) {
    await this.setStatus('ACTIVE', `Analyzing trends: ${params.metric}`);

    const org = await this.getOrgContext();
    const lookback = params.lookbackDays ?? 30;
    const since = new Date(Date.now() - lookback * 24 * 3600 * 1000);

    // Pull relevant data based on the metric
    let contextData = '';

    if (params.metric.toLowerCase().includes('lead') || params.metric.toLowerCase().includes('sales') || params.metric.toLowerCase().includes('pipeline')) {
      const leads = await prisma.lead.findMany({
        where: { organizationId: this.organizationId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        select: { status: true, value: true, estimatedValue: true, createdAt: true, qualificationScore: true },
      });
      contextData = `Leads (${lookback} days): ${leads.length} total. By status: ${
        Object.entries(leads.reduce((acc, l) => ({ ...acc, [l.status]: (acc[l.status as keyof typeof acc] || 0) + 1 }), {} as Record<string, number>))
          .map(([k, v]) => `${k}: ${v}`).join(', ')
      }. Avg score: ${leads.filter((l) => l.qualificationScore).reduce((sum, l) => sum + (l.qualificationScore ?? 0), 0) / (leads.filter((l) => l.qualificationScore).length || 1)}.`;
    } else if (params.metric.toLowerCase().includes('decision')) {
      const decisions = await prisma.decision.findMany({
        where: { organizationId: this.organizationId, createdAt: { gte: since } },
        select: { status: true, confidence: true, type: true, createdAt: true },
      });
      contextData = `Decisions (${lookback} days): ${decisions.length} total. ${decisions.filter((d) => d.status === 'approved').length} approved, ${decisions.filter((d) => d.status === 'declined').length} declined, ${decisions.filter((d) => d.status === 'pending').length} pending.`;
    } else {
      const feedEvents = await prisma.feedEvent.findMany({
        where: { organizationId: this.organizationId, createdAt: { gte: since } },
        orderBy: { createdAt: 'asc' },
        include: { executive: { select: { name: true } } },
      });
      contextData = `Activity (${lookback} days): ${feedEvents.length} events. By executive: ${
        Object.entries(feedEvents.reduce((acc, e) => ({ ...acc, [e.executive.name]: (acc[e.executive.name as keyof typeof acc] || 0) + 1 }), {} as Record<string, number>))
          .map(([k, v]) => `${k}: ${v} events`).join(', ')
      }.`;
    }

    const result = await this.generateJSON<{
      metric: string;
      period: string;
      trend: 'improving' | 'declining' | 'stable' | 'volatile';
      trendStrength: 'weak' | 'moderate' | 'strong';
      summary: string;
      dataPoints: Array<{ label: string; value: string; change?: string }>;
      anomalies: string[];
      drivers: string[];
      forecast: string;
      actionRecommendations: string[];
    }>(`
You are Iris, Intelligence AI for ${org?.name ?? 'the company'}.

Analyze this trend over the last ${lookback} days:
Metric: ${params.metric}

Data context:
${contextData}

Industry: ${org?.industry}

Return JSON:
{
  "metric": "${params.metric}",
  "period": "Last ${lookback} days",
  "trend": "improving" | "declining" | "stable" | "volatile",
  "trendStrength": "weak" | "moderate" | "strong",
  "summary": "2-3 paragraph analysis of what the data shows and what's driving it",
  "dataPoints": [
    {"label": "Week 1", "value": "X", "change": "+10%"}
    ... (weekly or meaningful breakdowns)
  ],
  "anomalies": ["Unusual patterns or outliers in the data"],
  "drivers": ["What's causing this trend"],
  "forecast": "Where this metric is headed in the next ${lookback} days",
  "actionRecommendations": ["3-5 data-driven recommendations"]
}
`);

    await this.rememberText(
      `Trend analysis (${params.metric}, ${lookback}d): ${result.trend} (${result.trendStrength}). ${result.summary.substring(0, 200)}`,
      'insight',
      ['intelligence', 'trend-analysis', params.metric.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Trend Analysis Complete', `${params.metric}: ${result.trend} trend (${result.trendStrength}) over ${lookback} days`, result.trend === 'declining' ? 'warning' : 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Trend analysis complete for ${params.metric}.`);

    return result;
  }

  // ─── Anomaly Detection ───────────────────────────────────────────────────────

  async detectAnomalies() {
    await this.setStatus('ACTIVE', 'Running anomaly detection across all data');

    const org = await this.getOrgContext();

    // Gather cross-system data
    const [leads, decisions, proposals, recentFeed] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.decision.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.proposal.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.feedEvent.findMany({ where: { organizationId: this.organizationId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);

    const avgLeadValue = leads.filter((l) => l.value > 0).reduce((sum, l) => sum + l.value, 0) / (leads.filter((l) => l.value > 0).length || 1);
    const pendingDecisions = decisions.filter((d) => d.status === 'pending').length;
    const expiredDecisions = decisions.filter((d) => d.expiresAt && d.expiresAt < new Date() && d.status === 'pending').length;

    const result = await this.generateJSON<{
      anomaliesFound: number;
      anomalies: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        description: string;
        evidence: string;
        recommendation: string;
      }>;
      systemHealthSummary: string;
      dataQualityScore: number;
    }>(`
You are Iris, Intelligence AI for ${org?.name ?? 'the company'}.

Detect anomalies in business operations:

Current data snapshot:
- Leads: ${leads.length} total, avg value $${avgLeadValue.toFixed(0)}, ${leads.filter((l) => l.status === 'new').length} unprocessed
- Pending decisions: ${pendingDecisions} (${expiredDecisions} expired without action)
- Proposals: ${proposals.filter((p) => p.status === 'draft').length} stuck in draft, ${proposals.filter((p) => p.status === 'sent').length} awaiting response
- Declined proposals: ${proposals.filter((p) => p.status === 'declined').length}
- Recent activity events: ${recentFeed.length}

Industry baseline: ${org?.industry}

Look for: stalled deals, unusually high/low values, patterns suggesting fraud or errors, inactive processes, data inconsistencies.

Return JSON:
{
  "anomaliesFound": (total count),
  "anomalies": [
    {
      "type": "Stalled Pipeline" | "Unusual Value" | "Inactivity" | "Data Inconsistency" | "Process Gap" | "Risk Signal",
      "severity": "low" | "medium" | "high" | "critical",
      "description": "Clear description of the anomaly",
      "evidence": "Specific data points that indicate this anomaly",
      "recommendation": "What to do about it"
    }
  ],
  "systemHealthSummary": "2-3 sentence overall health assessment",
  "dataQualityScore": (0-100, how clean and complete is the data?)
}
`);

    // Create decisions for critical anomalies
    for (const anomaly of result.anomalies.filter((a) => a.severity === 'critical')) {
      await this.createDecision({
        title: `ANOMALY DETECTED: ${anomaly.type}`,
        summary: anomaly.description,
        reasoning: anomaly.evidence,
        impact: anomaly.recommendation,
        confidence: 90,
        type: 'operational',
        expiresInHours: 24,
      });
    }

    await this.rememberText(
      `Anomaly detection: ${result.anomaliesFound} anomalies found (${result.anomalies.filter((a) => a.severity === 'critical').length} critical). Data quality: ${result.dataQualityScore}/100.`,
      'insight',
      ['intelligence', 'anomaly-detection', 'health'],
    );

    await this.pushFeed(
      result.anomaliesFound > 0 ? `${result.anomaliesFound} Anomalies Detected` : 'Anomaly Scan Clean',
      result.anomaliesFound > 0
        ? `${result.anomalies.filter((a) => a.severity === 'critical').length} critical, ${result.anomalies.filter((a) => a.severity === 'high').length} high severity`
        : 'No anomalies found in operational data',
      result.anomalies.some((a) => a.severity === 'critical') ? 'critical' : result.anomaliesFound > 0 ? 'warning' : 'success',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Anomaly detection complete.');

    return result;
  }

  // ─── Revenue Forecast ────────────────────────────────────────────────────────

  async forecastRevenue(months = 3) {
    await this.setStatus('ACTIVE', `Forecasting revenue for next ${months} months`);

    const org = await this.getOrgContext();

    const [allLeads, closedLeads] = await Promise.all([
      prisma.lead.findMany({ where: { organizationId: this.organizationId } }),
      prisma.lead.findMany({ where: { organizationId: this.organizationId, status: 'closed_won' } }),
    ]);

    const pipelineLeads = allLeads.filter((l) => ['qualified', 'proposal_drafted', 'proposal_sent'].includes(l.status));
    const pipelineValue = pipelineLeads.reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);
    const closedRevenue = closedLeads.reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);
    const avgScore = pipelineLeads.filter((l) => l.qualificationScore).reduce((sum, l) => sum + (l.qualificationScore ?? 0), 0) / (pipelineLeads.filter((l) => l.qualificationScore).length || 1);

    const result = await this.generateJSON<{
      forecastSummary: string;
      scenarios: {
        conservative: { revenue: number; assumptions: string[] };
        base: { revenue: number; assumptions: string[] };
        optimistic: { revenue: number; assumptions: string[] };
      };
      monthlyForecast: Array<{ month: string; revenue: number; confidence: number }>;
      keyDrivers: string[];
      risks: string[];
      methodology: string;
    }>(`
You are Iris, Intelligence AI for ${org?.name ?? 'the company'}.

Forecast revenue for the next ${months} months.

Historical data:
- Total closed deals: ${closedLeads.length}
- Total closed revenue: $${closedRevenue.toLocaleString()}
- Average deal size: $${(closedRevenue / (closedLeads.length || 1)).toFixed(0)}
- Active pipeline: ${pipelineLeads.length} deals worth $${pipelineValue.toLocaleString()}
- Average pipeline score: ${avgScore.toFixed(0)}/100

Industry: ${org?.industry}

Return JSON:
{
  "forecastSummary": "2-3 paragraph revenue forecast narrative",
  "scenarios": {
    "conservative": {
      "revenue": (pessimistic ${months}-month total in USD),
      "assumptions": ["What must be true for this scenario"]
    },
    "base": {
      "revenue": (most likely ${months}-month total),
      "assumptions": ["Base case assumptions"]
    },
    "optimistic": {
      "revenue": (best case ${months}-month total),
      "assumptions": ["Upside conditions"]
    }
  },
  "monthlyForecast": [
    {"month": "Month name", "revenue": (amount), "confidence": (0-100)}
    ... (${months} months)
  ],
  "keyDrivers": ["What will determine if we hit the base case"],
  "risks": ["What could cause us to miss forecast"],
  "methodology": "How this forecast was calculated"
}
`);

    await this.rememberText(
      `Revenue forecast (${months} months): Base case $${result.scenarios.base.revenue.toLocaleString()}, Conservative $${result.scenarios.conservative.revenue.toLocaleString()}, Optimistic $${result.scenarios.optimistic.revenue.toLocaleString()}`,
      'document',
      ['intelligence', 'revenue-forecast', 'financial'],
    );

    await this.pushFeed(
      'Revenue Forecast Generated',
      `${months}-month base case: $${result.scenarios.base.revenue.toLocaleString()} | Range: $${result.scenarios.conservative.revenue.toLocaleString()} – $${result.scenarios.optimistic.revenue.toLocaleString()}`,
      'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Revenue forecast complete.');

    return result;
  }

  // ─── Competitive Analysis ────────────────────────────────────────────────────

  async analyzeCompetitivePosition(params: {
    competitors?: string[];
    focusArea?: string;
  }) {
    await this.setStatus('ACTIVE', 'Analysing competitive position');

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      summary: string;
      positioning: string;
      competitors: Array<{
        name: string;
        strengths: string[];
        weaknesses: string[];
        threatLevel: 'low' | 'medium' | 'high';
        differentiators: string[];
      }>;
      ourStrengths: string[];
      ourWeaknesses: string[];
      opportunities: string[];
      threats: string[];
      strategicRecommendations: string[];
    }>(`
You are Iris, Intelligence AI for ${org?.name ?? 'the company'}.

Analyze the competitive landscape:
- Our company: ${org?.name}, ${org?.industry} industry, ${org?.size}
- Known competitors: ${params.competitors?.join(', ') ?? 'Identify likely competitors based on industry'}
- Focus area: ${params.focusArea ?? 'Overall market position'}

Our goals: ${org?.goals ?? 'Growth and market expansion'}

Return a comprehensive competitive analysis in JSON:
{
  "summary": "2-3 paragraph competitive landscape summary",
  "positioning": "How we are positioned relative to competitors",
  "competitors": [
    {
      "name": "Competitor name",
      "strengths": ["3-5 strengths"],
      "weaknesses": ["2-3 weaknesses or vulnerabilities"],
      "threatLevel": "low" | "medium" | "high",
      "differentiators": ["How they differentiate from us"]
    },
    ... (3-5 competitors)
  ],
  "ourStrengths": ["Our key competitive advantages"],
  "ourWeaknesses": ["Areas where we're vulnerable"],
  "opportunities": ["Market opportunities we should pursue"],
  "threats": ["Competitive threats to watch"],
  "strategicRecommendations": ["5 strategic moves to strengthen position"]
}
`);

    await this.rememberText(
      `Competitive analysis: ${org?.name} in ${org?.industry}. ${result.competitors.length} competitors analyzed. ${result.opportunities.length} opportunities identified.`,
      'insight',
      ['intelligence', 'competitive-analysis', org?.industry?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );

    await this.pushFeed('Competitive Analysis Complete', `${result.competitors.length} competitors analyzed. ${result.opportunities.length} opportunities identified.`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Competitive analysis complete.');

    return result;
  }
}
