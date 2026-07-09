/**
 * Atlas OS — CEO Assistant (Atlas)
 *
 * Chief of Staff. Orchestrates the executive team, synthesizes cross-functional
 * insights, generates strategic briefings, and routes CEO directives.
 *
 * Persona: "Atlas" — the AI Chief of Staff who holds the whole company together.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class CEOAssistant extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Atlas (CEO Assistant)');
  }

  // ─── Day Zero Briefing ──────────────────────────────────────────────────────

  async generateDayZeroBriefing(org: {
    name: string; industry: string | null; size: string | null;
    goals: string | null; challenges: string | null; softwareStack: string | null;
  }) {
    await this.setStatus('ACTIVE', 'Generating Day Zero briefing');

    const result = await this.generateJSON<{ briefing: string; insights: string[] }>(`
You are Atlas, the AI Chief of Staff for ${org.name}.

The company has just been configured in Atlas OS with this profile:
- Industry: ${org.industry ?? 'Not specified'}
- Company Size: ${org.size ?? 'Not specified'}
- Strategic Goals: ${org.goals ?? 'Not specified'}
- Operational Challenges: ${org.challenges ?? 'Not specified'}
- Current Software Stack: ${org.softwareStack ?? 'Not specified'}

Generate a "Day Zero" executive briefing for the Mission Control dashboard.

Return JSON with:
{
  "briefing": "A 2-3 paragraph Markdown executive summary. Be specific to their industry and goals. Reference their challenges. Make it feel like a real chief of staff wrote it for their first day.",
  "insights": ["3 specific, tactical, high-value operational insights tailored to this company"]
}
`);

    await this.rememberText(
      `Day Zero Briefing for ${org.name}: ${result.briefing}`,
      'document',
      ['briefing', 'onboarding', 'strategy'],
    );

    await this.pushFeed('Day Zero Briefing Generated', `Executive briefing prepared for ${org.name}. ${result.insights.length} tactical insights ready.`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Day Zero briefing completed.');

    return result;
  }

  // ─── Strategy Session ───────────────────────────────────────────────────────

  async runStrategySession(topic: string, previousMessages: Array<{ speaker: string; text: string }> = []) {
    await this.setStatus('ACTIVE', `Running strategy session: ${topic}`);

    const org = await this.getOrgContext();
    const executives = await this.getAllExecutives();
    const recentMemories = await this.recallMemories(['strategy', 'decision'], 5);

    const context = previousMessages.map((m) => `${m.speaker}: ${m.text}`).join('\n');
    const memContext = recentMemories.map((m) => `- ${m.text.substring(0, 200)}`).join('\n');
    const execList = executives.map((e) => `- ${e.name} (${e.role})`).join('\n');

    const result = await this.generateJSON<{
      speakerId: string;
      speakerName: string;
      messageText: string;
      isSynthesis: boolean;
      recommendation: {
        statement: string;
        actions: string[];
        constraints: string[];
        metrics: string[];
        timeframe: string;
      };
    }>(`
You are Atlas, the AI Chief of Staff for ${org?.name ?? 'the company'} in Atlas OS.

Company context:
- Industry: ${org?.industry ?? 'Unknown'}
- Goals: ${org?.goals ?? 'Not specified'}
- Challenges: ${org?.challenges ?? 'Not specified'}

Your executive team:
${execList}

Recent strategic memory:
${memContext || 'No prior strategic sessions.'}

${context ? `Previous discussion:\n${context}\n` : ''}

Current strategic topic: "${topic}"

As Atlas, analyze this topic and provide the CEO with an authoritative strategic recommendation.

Return JSON:
{
  "speakerId": "ceo_assistant",
  "speakerName": "Atlas (CEO Assistant)",
  "messageText": "Your strategic analysis as Atlas — 2-3 substantive paragraphs referencing the company context",
  "isSynthesis": true,
  "recommendation": {
    "statement": "One clear recommended course of action",
    "actions": ["3-5 concrete, sequenced action steps with owners"],
    "constraints": ["2-3 real constraints to consider (budget, time, team capacity)"],
    "metrics": ["2-3 KPIs to track success"],
    "timeframe": "Realistic timeframe (e.g., '6-8 weeks for Phase 1')"
  }
}
`);

    await this.rememberText(
      `Strategy Session on "${topic}": ${result.recommendation.statement}`,
      'conversation',
      ['strategy', 'session', topic.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Strategy session on "${topic}" completed.`);

    return result;
  }

  // ─── Command Center ─────────────────────────────────────────────────────────

  async processCommand(command: string) {
    await this.setStatus('ACTIVE', `Processing command: ${command}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      text: string;
      navigationTarget: string | null;
      action: string | null;
      executiveToNotify: string | null;
    }>(`
You are Atlas, the AI Chief of Staff for ${org?.name ?? 'the company'}.

A command has been submitted to the Command Center: "${command}"

Available navigation views: dashboard, workforce, pulse, strategy, finance, sales, marketing, memory, boardroom

Interpret this command and respond helpfully. If it maps to a navigation action, specify the target.

Return JSON:
{
  "text": "Clear, helpful response to the command (1-2 sentences)",
  "navigationTarget": "one of: dashboard, workforce, pulse, strategy, finance, sales, marketing, memory, boardroom — or null",
  "action": "describe the action to take, or null",
  "executiveToNotify": "executive name if this should be delegated, or null"
}
`);

    await this.setStatus('IDLE', `Command processed: ${command}`);
    return result;
  }

  // ─── Board Report ───────────────────────────────────────────────────────────

  async generateBoardReport() {
    await this.setStatus('ACTIVE', 'Generating board presentation report');

    const org = await this.getOrgContext();
    const executives = await this.getAllExecutives();

    // Fetch operational metrics
    const [leadCount, decisionCount, proposalCount, memoryCount, workflowCount] = await Promise.all([
      prisma.lead.count({ where: { organizationId: this.organizationId } }),
      prisma.decision.count({ where: { organizationId: this.organizationId } }),
      prisma.proposal.count({ where: { organizationId: this.organizationId } }),
      prisma.memory.count({ where: { organizationId: this.organizationId } }),
      prisma.workflow.count({ where: { organizationId: this.organizationId } }),
    ]);

    const closedWonLeads = await prisma.lead.findMany({
      where: { organizationId: this.organizationId, status: 'closed_won' },
    });
    const totalRevenue = closedWonLeads.reduce((sum, l) => sum + (l.estimatedValue ?? l.value), 0);

    const executiveMetrics = executives
      .map((e) => `- **${e.name}** (${e.role}): ${e.tasksCompleted} tasks, ${e.decisionsMade} decisions, $${e.valueGenerated.toLocaleString()} value`)
      .join('\n');

    const result = await this.generateJSON<{ markdownReport: string }>(`
You are Atlas, AI Chief of Staff for ${org?.name ?? 'the company'}.

Compile a comprehensive board presentation report.

Current metrics:
- Total leads: ${leadCount}
- Closed/won deals: ${closedWonLeads.length} (total value: $${totalRevenue.toLocaleString()})
- Active decisions pending: ${decisionCount}
- Proposals created: ${proposalCount}
- Memory entries: ${memoryCount}
- Workflows: ${workflowCount}

AI Executive Performance:
${executiveMetrics}

Company context:
- Name: ${org?.name}
- Industry: ${org?.industry}
- Goals: ${org?.goals}

Generate a professional Markdown board report with sections:
1. Executive Summary
2. Financial Performance
3. AI Executive Workforce Performance
4. Pipeline & Revenue
5. Key Decisions & Actions
6. Strategic Priorities for Next Quarter

Return JSON:
{
  "markdownReport": "Full Markdown report content here"
}
`);

    await this.pushFeed('Board Report Generated', `Comprehensive board presentation compiled for ${org?.name}.`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Board report generated.');

    return result;
  }

  // ─── Executive Briefing (Automated Daily) ──────────────────────────────────

  async generateDailyBriefing() {
    await this.setStatus('ACTIVE', 'Generating daily executive briefing');

    const org = await this.getOrgContext();

    const [pendingDecisions, newLeads, recentFeed] = await Promise.all([
      prisma.decision.count({ where: { organizationId: this.organizationId, status: 'pending' } }),
      prisma.lead.count({ where: { organizationId: this.organizationId, status: 'new' } }),
      prisma.feedEvent.findMany({
        where: { organizationId: this.organizationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { executive: true },
      }),
    ]);

    const feedSummary = recentFeed
      .map((f) => `- ${f.executive.name}: ${f.action} — ${f.text}`)
      .join('\n');

    const result = await this.generateJSON<{
      briefing: string;
      topPriorities: string[];
      alertCount: number;
    }>(`
You are Atlas, AI Chief of Staff for ${org?.name}.

Daily briefing request. Current status:
- Pending decisions requiring CEO approval: ${pendingDecisions}
- New unqualified leads: ${newLeads}
- Recent activity:
${feedSummary || 'No recent activity.'}

Company context:
- Industry: ${org?.industry}
- Goals: ${org?.goals}

Generate a concise daily executive briefing.

Return JSON:
{
  "briefing": "2-paragraph Markdown briefing summarizing the day's priorities and status",
  "topPriorities": ["Top 3 things the CEO should focus on today"],
  "alertCount": ${pendingDecisions + newLeads}
}
`);

    await this.rememberText(
      `Daily Briefing (${new Date().toLocaleDateString()}): ${result.briefing.substring(0, 300)}`,
      'document',
      ['briefing', 'daily'],
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Daily briefing completed.');

    return result;
  }
}
