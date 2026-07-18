/**
 * Atlas OS — Executive Service
 *
 * Shared foundation for all AI executives.
 * Provides: AI generation, memory, decisions, feed events, task management.
 * Every executive extends this to get common capabilities.
 */

import { prisma } from '../../lib/prisma.js';
import OpenAI from 'openai';
import { Prisma } from '@prisma/client';

// ─── AI Client ────────────────────────────────────────────────────────────────

// ─── AI Client ────────────────────────────────────────────────────────────────

function createAIClient(): OpenAI | null {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
    return new OpenAI({
      apiKey: process.env.OPENROUTER_API_KEY,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: { 'HTTP-Referer': 'https://atlas-os.local', 'X-Title': 'Atlas OS' },
    });
  }
  if (provider === 'openai' && process.env.OPENAI_API_KEY) {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
    return new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
  }
  return null;
}

const aiClient = createAIClient();
const AI_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

// ─── SSE Broadcast (shared module-level) ─────────────────────────────────────
// ExecutiveService will broadcast through the registered broadcaster function
let sseBroadcaster: ((event: any) => void) | null = null;

export function registerSSEBroadcaster(fn: (event: any) => void) {
  sseBroadcaster = fn;
}

// ─── Executive Service ────────────────────────────────────────────────────────

export class ExecutiveService {
  protected organizationId: string;
  protected executiveId: string;
  protected executiveName: string;

  constructor(organizationId: string, executiveId: string, executiveName: string) {
    this.organizationId = organizationId;
    this.executiveId = executiveId;
    this.executiveName = executiveName;
  }

  // ─── AI Generation ──────────────────────────────────────────────────────────

  async generateJSON<T = any>(prompt: string, temperature = 0.7): Promise<T> {
    if (!aiClient) {
      throw new Error('No AI provider configured. Set OPENROUTER_API_KEY or OPENAI_API_KEY in .env.local');
    }
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: 'You are an AI executive assistant in Atlas OS, an autonomous business operating system. Always respond with valid JSON only. No markdown code blocks, no extra text — just the raw JSON object.',
        },
        { role: 'user', content: prompt },
      ],
      temperature,
      response_format: { type: 'json_object' },
    });
    const raw = completion.choices[0]?.message?.content ?? '{}';
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(cleaned) as T;
    }
  }

  async generateText(prompt: string, temperature = 0.7): Promise<string> {
    if (!aiClient) {
      throw new Error('No AI provider configured.');
    }
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'system',
          content: `You are ${this.executiveName} in Atlas OS, an autonomous business operating system. Provide clear, professional, actionable responses.`,
        },
        { role: 'user', content: prompt },
      ],
      temperature,
    });
    return completion.choices[0]?.message?.content ?? '';
  }

  // ─── Memory ────────────────────────────────────────────────────────────────

  async rememberText(
    text: string,
    type: 'document' | 'conversation' | 'decision' | 'insight' | 'policy' | 'workflow' | 'other' = 'other',
    tags: string[] = [],
  ) {
    return prisma.memory.create({
      data: {
        organizationId: this.organizationId,
        executiveId: this.executiveId,
        text,
        type,
        actor: this.executiveName,
        sourceSystem: this.executiveName,
        tags,
        updatedAt: new Date(),
      },
    });
  }

  async recallMemories(tags?: string[], limit = 10) {
    return prisma.memory.findMany({
      where: {
        organizationId: this.organizationId,
        ...(tags?.length ? { tags: { hasSome: tags } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // ─── Feed Events ───────────────────────────────────────────────────────────

  async pushFeed(
    action: string,
    text: string,
    status: 'info' | 'success' | 'warning' | 'critical' = 'info',
    metadata?: Record<string, unknown>,
  ) {
    const event = await prisma.feedEvent.create({
      data: {
        organizationId: this.organizationId,
        executiveId: this.executiveId,
        action,
        text,
        status,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });

    // Broadcast via SSE
    if (sseBroadcaster) {
      sseBroadcaster({
        type: 'feed',
        data: {
          id: event.id,
          agentId: this.executiveId,
          agentName: this.executiveName,
          department: this.executiveName,
          action,
          text,
          timestamp: event.createdAt.toISOString(),
          status,
        },
      });
    }

    return event;
  }

  // ─── Decisions ─────────────────────────────────────────────────────────────

  async createDecision(params: {
    title: string;
    summary: string;
    description?: string;
    reasoning: string;
    impact?: string;
    confidence: number;
    type?: 'general' | 'financial' | 'strategic' | 'operational' | 'legal' | 'hr';
    contributorIds?: string[];
    expiresInHours?: number;
    metadata?: Record<string, unknown>;
  }) {
    const expiresAt = params.expiresInHours
      ? new Date(Date.now() + params.expiresInHours * 3600 * 1000)
      : undefined;

    const decision = await prisma.decision.create({
      data: {
        organizationId: this.organizationId,
        createdByExecutiveId: this.executiveId,
        title: params.title,
        summary: params.summary,
        description: params.description,
        reasoning: params.reasoning,
        impact: params.impact,
        confidence: params.confidence,
        type: params.type ?? 'general',
        expiresAt,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        updatedAt: new Date(),
        contributors: params.contributorIds?.length
          ? {
              create: params.contributorIds.map((id) => ({
                executiveId: id,
              })),
            }
          : undefined,
      },
      include: { contributors: { include: { executive: true } } },
    });

    // Bump decision counter
    await prisma.aIExecutive.update({
      where: { id: this.executiveId },
      data: { decisionsMade: { increment: 1 }, updatedAt: new Date() },
    });

    // Broadcast decision to SSE
    if (sseBroadcaster) {
      sseBroadcaster({ type: 'decision', data: decision });
    }

    // ── Governance Engine ────────────────────────────────────────────────────
    // Process decision through governance policy asynchronously.
    // Does not block the creating executive — governance runs in background.
    setImmediate(async () => {
      try {
        const { governancePolicy } = await import('../GovernancePolicy.js');
        await governancePolicy.processDecision(decision.id);
      } catch (err: any) {
        console.error(`[ExecutiveService] Governance processing failed for decision ${decision.id}: ${err.message}`);
      }
    });

    return decision;
  }

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  async createTask(params: {
    title: string;
    description?: string;
    priority?: 'low' | 'medium' | 'high' | 'urgent';
    assignedToExecutiveId?: string;
    leadId?: string;
    proposalId?: string;
    decisionId?: string;
    workflowId?: string;
    dueDate?: Date;
    metadata?: Record<string, unknown>;
  }) {
    return prisma.task.create({
      data: {
        organizationId: this.organizationId,
        createdByExecutiveId: this.executiveId,
        assignedToExecutiveId: params.assignedToExecutiveId ?? this.executiveId,
        title: params.title,
        description: params.description,
        priority: params.priority ?? 'medium',
        leadId: params.leadId,
        proposalId: params.proposalId,
        decisionId: params.decisionId,
        workflowId: params.workflowId,
        dueDate: params.dueDate,
        metadata: (params.metadata ?? {}) as Prisma.InputJsonValue,
        updatedAt: new Date(),
      },
    });
  }

  // ─── Executive Status ──────────────────────────────────────────────────────

  async setStatus(status: 'IDLE' | 'ACTIVE' | 'BUSY' | 'OFFLINE', lastAction?: string) {
    const result = await prisma.aIExecutive.update({
      where: { id: this.executiveId },
      data: { status, lastAction, updatedAt: new Date() },
    });

    // Broadcast real-time agent activity to the pulse canvas
    if (sseBroadcaster) {
      sseBroadcaster({
        type: 'agent_activity',
        data: {
          executiveId: this.executiveId,
          executiveName: this.executiveName,
          organizationId: this.organizationId,
          status,
          action: lastAction ?? null,
          toExecutiveId: null,
          toExecutiveName: null,
          ts: new Date().toISOString(),
        },
      });
    }

    return result;
  }

  // ─── Data Exchange — broadcast a real inter-executive data transfer ─────────
  // Call this when one executive explicitly sends data/requests to another.
  // Drives the real particle animations in OrganizationPulse.

  broadcastDataExchange(toExecutiveId: string, toExecutiveName: string, action: string) {
    if (sseBroadcaster) {
      sseBroadcaster({
        type: 'agent_activity',
        data: {
          executiveId: this.executiveId,
          executiveName: this.executiveName,
          organizationId: this.organizationId,
          status: 'BUSY',
          action,
          toExecutiveId,
          toExecutiveName,
          ts: new Date().toISOString(),
        },
      });
    }
  }

  async incrementTaskCount(valueGenerated = 0) {
    return prisma.aIExecutive.update({
      where: { id: this.executiveId },
      data: {
        tasksCompleted: { increment: 1 },
        valueGenerated: { increment: valueGenerated },
        updatedAt: new Date(),
      },
    });
  }

  // ─── Org Context ───────────────────────────────────────────────────────────

  async getOrgContext() {
    return prisma.organization.findUnique({
      where: { id: this.organizationId },
    });
  }

  async getExecutive(id?: string) {
    return prisma.aIExecutive.findFirst({
      where: {
        id: id ?? this.executiveId,
        organizationId: this.organizationId,
      },
    });
  }

  async getAllExecutives() {
    return prisma.aIExecutive.findMany({
      where: { organizationId: this.organizationId },
      include: { department: true },
    });
  }
}
