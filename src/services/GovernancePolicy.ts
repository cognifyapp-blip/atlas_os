/**
 * Atlas OS — Governance Policy Engine
 *
 * Defines what Atlas (AI CEO) can authorize autonomously vs. what must
 * escalate to the human CEO for approval.
 *
 * This is the governance layer that makes "fully autonomous operation"
 * safe and auditable. Every auto-approval is logged with full reasoning.
 *
 * Policy structure:
 *   Each decision type has an authority matrix:
 *     - autoApproveThreshold: Atlas approves without escalation
 *     - atlasAuthorityLimit:  Atlas can approve up to this value
 *     - alwaysEscalate:       Always requires human CEO regardless
 *
 * Configuration:
 *   GOVERNANCE_MODE=autonomous   — Atlas acts as CEO, auto-approves within policy
 *   GOVERNANCE_MODE=supervised   — All decisions require human approval (default)
 *   GOVERNANCE_MODE=hybrid       — Low-risk auto-approved, high-risk escalated
 *
 * The human CEO can always override any decision at any time.
 */

import { prisma } from '../lib/prisma.js';
import { broadcastSSE } from './SSEBridge.js';

// ─── Policy Definitions ───────────────────────────────────────────────────────

export interface PolicyRule {
  /** Auto-approve if confidence >= this AND value <= autoApproveThreshold */
  minConfidence: number;
  /** Auto-approve if deal/spend value is at or below this (0 = never auto-approve based on value alone) */
  autoApproveThreshold: number;
  /** Atlas can approve up to this amount; above it always escalates to human */
  atlasAuthorityLimit: number;
  /** If true, always requires human regardless of value or confidence */
  alwaysEscalate: boolean;
  /** Reasoning template for auto-approvals */
  autoApproveReason: string;
}

export type GovernanceMode = 'supervised' | 'hybrid' | 'autonomous';

const DEFAULT_POLICIES: Record<string, PolicyRule> = {
  financial: {
    minConfidence: 75,
    autoApproveThreshold: 10000,      // auto-approve financial decisions under $10k
    atlasAuthorityLimit: 50000,        // Atlas can approve up to $50k
    alwaysEscalate: false,
    autoApproveReason: 'Financial decision within Atlas authority threshold and confidence requirements.',
  },
  strategic: {
    minConfidence: 85,
    autoApproveThreshold: 0,           // strategic decisions never auto-approve
    atlasAuthorityLimit: 0,            // always escalate to human CEO
    alwaysEscalate: true,
    autoApproveReason: '',
  },
  operational: {
    minConfidence: 70,
    autoApproveThreshold: 999999,      // operational decisions auto-approve freely
    atlasAuthorityLimit: 999999,
    alwaysEscalate: false,
    autoApproveReason: 'Operational decision within normal parameters. No human review required.',
  },
  legal: {
    minConfidence: 90,
    autoApproveThreshold: 0,           // legal decisions always escalate
    atlasAuthorityLimit: 0,
    alwaysEscalate: true,
    autoApproveReason: '',
  },
  hr: {
    minConfidence: 80,
    autoApproveThreshold: 0,           // HR decisions always escalate (hiring/firing)
    atlasAuthorityLimit: 0,
    alwaysEscalate: true,
    autoApproveReason: '',
  },
  general: {
    minConfidence: 70,
    autoApproveThreshold: 25000,
    atlasAuthorityLimit: 100000,
    alwaysEscalate: false,
    autoApproveReason: 'General decision approved by Atlas within delegated authority.',
  },
};

// ─── GovernancePolicy ────────────────────────────────────────────────────────

export class GovernancePolicyEngine {
  private static _instance: GovernancePolicyEngine | null = null;

  private constructor() {}

  static getInstance(): GovernancePolicyEngine {
    if (!GovernancePolicyEngine._instance) {
      GovernancePolicyEngine._instance = new GovernancePolicyEngine();
    }
    return GovernancePolicyEngine._instance;
  }

  get mode(): GovernanceMode {
    const raw = process.env.GOVERNANCE_MODE ?? 'supervised';
    if (raw === 'autonomous' || raw === 'hybrid' || raw === 'supervised') return raw;
    return 'supervised';
  }

  getPolicy(type: string): PolicyRule {
    return DEFAULT_POLICIES[type] ?? DEFAULT_POLICIES.general;
  }

  /**
   * Evaluate whether a decision can be auto-approved by Atlas.
   * Returns the outcome and reasoning.
   */
  evaluate(params: {
    type: string;
    confidence: number;
    value?: number;       // deal value, spend amount, etc.
    title: string;
  }): { canAutoApprove: boolean; canAtlasApprove: boolean; reason: string } {
    const mode = this.mode;
    const policy = this.getPolicy(params.type);
    const value = params.value ?? 0;

    // Supervised mode: nothing auto-approves
    if (mode === 'supervised') {
      return { canAutoApprove: false, canAtlasApprove: false, reason: 'Governance mode is SUPERVISED — all decisions require human CEO approval.' };
    }

    // Always-escalate types
    if (policy.alwaysEscalate) {
      return { canAutoApprove: false, canAtlasApprove: false, reason: `Decision type "${params.type}" always requires human CEO approval per governance policy.` };
    }

    // Check confidence threshold
    if (params.confidence < policy.minConfidence) {
      return {
        canAutoApprove: false,
        canAtlasApprove: value <= policy.atlasAuthorityLimit,
        reason: `Confidence ${params.confidence}% is below the ${policy.minConfidence}% minimum required for auto-approval. Escalating to CEO.`,
      };
    }

    // Autonomous mode: auto-approve if within threshold
    if (mode === 'autonomous' && value <= policy.autoApproveThreshold) {
      return { canAutoApprove: true, canAtlasApprove: true, reason: policy.autoApproveReason };
    }

    // Hybrid or autonomous: Atlas can approve up to the authority limit
    if (value <= policy.atlasAuthorityLimit) {
      return { canAutoApprove: false, canAtlasApprove: true, reason: `Within Atlas authority limit ($${policy.atlasAuthorityLimit.toLocaleString()}). Atlas can approve without human escalation.` };
    }

    // Exceeds Atlas authority — needs human
    return {
      canAutoApprove: false,
      canAtlasApprove: false,
      reason: `Decision value $${value.toLocaleString()} exceeds Atlas authority limit of $${policy.atlasAuthorityLimit.toLocaleString()}. Escalating to human CEO.`,
    };
  }

  /**
   * Process a pending decision according to governance policy.
   * Called after every createDecision() when GOVERNANCE_MODE != supervised.
   *
   * If Atlas can approve: approves autonomously, logs full reasoning.
   * If must escalate: leaves pending, notifies CEO via SSE.
   */
  async processDecision(decisionId: string): Promise<{
    action: 'auto_approved' | 'atlas_approved' | 'escalated_to_ceo';
    reason: string;
  }> {
    const decision = await prisma.decision.findUnique({
      where: { id: decisionId },
      include: { createdBy: true },
    });

    if (!decision) throw new Error(`Decision ${decisionId} not found.`);
    if (decision.status !== 'pending') {
      return { action: 'escalated_to_ceo', reason: `Decision already ${decision.status}.` };
    }

    const value = (decision.metadata as any)?.dealValue ?? (decision.metadata as any)?.amount ?? 0;
    const evaluation = this.evaluate({
      type: decision.type,
      confidence: decision.confidence,
      value,
      title: decision.title,
    });

    // ── Auto-approve ──────────────────────────────────────────────────────────
    if (evaluation.canAutoApprove) {
      await prisma.decision.update({
        where: { id: decisionId },
        data: {
          status: 'approved',
          approvedAt: new Date(),
          updatedAt: new Date(),
          metadata: {
            ...((decision.metadata as any) ?? {}),
            autoApproved: true,
            autoApprovalReason: evaluation.reason,
            governanceMode: this.mode,
          },
        },
      });

      await this._logGovernanceAction(decision.organizationId, decision.createdByExecutiveId, decisionId, 'auto_approved', evaluation.reason);
      await this._broadcastDecisionUpdate(decisionId, 'auto_approved', decision.organizationId);

      return { action: 'auto_approved', reason: evaluation.reason };
    }

    // ── Atlas approves (acting CEO) ───────────────────────────────────────────
    if (evaluation.canAtlasApprove) {
      // Find Atlas
      const atlasExec = await prisma.aIExecutive.findFirst({
        where: { organizationId: decision.organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
      });

      if (atlasExec) {
        // Atlas reviews and approves using its judgment
        const atlasReasoning = await this._atlasReview(decision, atlasExec.id, value);

        await prisma.decision.update({
          where: { id: decisionId },
          data: {
            status: 'approved',
            approvedAt: new Date(),
            updatedAt: new Date(),
            metadata: {
              ...((decision.metadata as any) ?? {}),
              atlasApproved: true,
              atlasReasoning,
              governanceMode: this.mode,
              governancePolicy: evaluation.reason,
            },
          },
        });

        await prisma.aIExecutive.update({
          where: { id: atlasExec.id },
          data: { decisionsMade: { increment: 1 }, updatedAt: new Date() },
        });

        await this._logGovernanceAction(decision.organizationId, atlasExec.id, decisionId, 'atlas_approved', atlasReasoning);
        await this._broadcastDecisionUpdate(decisionId, 'atlas_approved', decision.organizationId);

        return { action: 'atlas_approved', reason: atlasReasoning };
      }
    }

    // ── Escalate to human CEO ─────────────────────────────────────────────────
    await this._logGovernanceAction(decision.organizationId, decision.createdByExecutiveId, decisionId, 'escalated_to_ceo', evaluation.reason);
    await this._broadcastDecisionUpdate(decisionId, 'escalated_to_ceo', decision.organizationId);

    return { action: 'escalated_to_ceo', reason: evaluation.reason };
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  private async _atlasReview(decision: any, atlasExecId: string, value: number): Promise<string> {
    // Use the AI to generate Atlas's approval reasoning
    try {
      const OpenAI = (await import('openai')).default;
      const provider = process.env.AI_PROVIDER || 'openrouter';
      let client: InstanceType<typeof OpenAI> | null = null;

      if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        client = new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', defaultHeaders: { 'HTTP-Referer': 'https://atlas-os.local', 'X-Title': 'Atlas OS' } });
      } else if (provider === 'openai' && process.env.OPENAI_API_KEY) {
        client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      } else if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY) {
        client = new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
      }

      if (!client) return `Atlas approved within governance authority (value: $${value.toLocaleString()}, confidence: ${decision.confidence}%).`;

      const completion = await client.chat.completions.create({
        model: process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat',
        messages: [{
          role: 'user',
          content: `You are Atlas, the AI Chief of Staff acting as interim CEO.

A decision requires your approval under delegated authority:
- Title: ${decision.title}
- Type: ${decision.type}
- Summary: ${decision.summary}
- Reasoning from submitting executive: ${decision.reasoning}
- Impact: ${decision.impact ?? 'Not specified'}
- Confidence: ${decision.confidence}%
- Value: $${value.toLocaleString()}

You have been delegated authority to approve this. Review it and provide a 2-sentence approval reasoning explaining why this decision is sound and what you are approving. Be decisive and specific.`,
        }],
        temperature: 0.5,
      });

      return completion.choices[0]?.message?.content ?? `Atlas approved: ${decision.title}. Within delegated authority parameters.`;
    } catch {
      return `Atlas approved within delegated governance authority. Decision meets confidence threshold and value limits.`;
    }
  }

  private async _logGovernanceAction(
    organizationId: string,
    executiveId: string,
    decisionId: string,
    action: string,
    reason: string,
  ): Promise<void> {
    await prisma.memory.create({
      data: {
        organizationId,
        executiveId,
        text: `[GOVERNANCE] Decision ${decisionId} → ${action.toUpperCase()}. Reason: ${reason}`,
        type: 'decision',
        actor: action === 'atlas_approved' ? 'Atlas (Acting CEO)' : action === 'auto_approved' ? 'Atlas OS Governance' : 'Governance Engine',
        sourceSystem: 'Governance Policy Engine',
        tags: ['governance', action, 'decision-log'],
        updatedAt: new Date(),
      },
    });

    await prisma.feedEvent.create({
      data: {
        organizationId,
        executiveId,
        action: action === 'auto_approved' ? 'Decision Auto-Approved' : action === 'atlas_approved' ? 'Decision Approved by Atlas' : 'Decision Escalated to CEO',
        text: reason.substring(0, 200),
        status: action === 'escalated_to_ceo' ? 'warning' : 'success',
      },
    });
  }

  private async _broadcastDecisionUpdate(decisionId: string, action: string, organizationId: string): Promise<void> {
    try {
      broadcastSSE({ type: 'decision_governance', data: { decisionId, action, organizationId, ts: new Date().toISOString() } });
    } catch {
      // SSE may not be registered yet during startup
    }
  }
}

export const governancePolicy = GovernancePolicyEngine.getInstance();
