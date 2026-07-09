/**
 * Atlas OS — Collaboration Session
 *
 * Enables real multi-executive conversations. One executive can ask another
 * a direct question and get a typed AI response back — not a hardcoded stub.
 *
 * This is the layer that makes executives actually talk to each other.
 *
 * Usage:
 *   const reply = await collaboration.ask({
 *     from: 'Zephyr (Sales AI)',
 *     to: 'Aurelia (Finance AI)',
 *     question: 'If I discount this $55k deal 15%, can we still hit Q3 target?',
 *     context: { dealId, currentPipeline, q3Target },
 *   });
 *
 *   const session = await collaboration.convene({
 *     convener: 'Atlas (CEO Assistant)',
 *     topic: 'Should we enter the EU market in Q4?',
 *     participants: ['Aurelia (Finance AI)', 'Lexis (Legal AI)', 'Zephyr (Sales AI)'],
 *     context: { budget, currentRevenue },
 *   });
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { eventBus } from './EventBus.js';

// ─── AI Client (reuse env config) ────────────────────────────────────────────

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

// ─── Executive Personas ───────────────────────────────────────────────────────

const EXEC_PERSONAS: Record<string, string> = {
  atlas: `You are Atlas, the AI Chief of Staff. You have broad strategic perspective, synthesize input from all departments, and always consider the company's overall health and direction.`,
  aurelia: `You are Aurelia, the Finance AI. You are precise, data-driven, and always thinking about cash flow, margins, and financial sustainability. You speak in numbers and financial impact.`,
  zephyr: `You are Zephyr, the Sales AI. You are aggressive, pipeline-focused, and always thinking about closing deals and revenue. You push for action and urgency.`,
  aria: `You are Aria, the Marketing AI. You think in terms of brand, audience, engagement, and demand generation. You connect market opportunities to revenue potential.`,
  lyra: `You are Lyra, the Customer Success AI. You are empathetic, retention-focused, and always thinking about customer health, churn risk, and expansion revenue.`,
  sage: `You are Sage, the HR AI. You think about people, culture, org capacity, and talent risk. You weigh the human cost of decisions.`,
  orion: `You are Orion, the Operations AI. You are systematic and efficiency-focused. You think in processes, bottlenecks, and operational risk.`,
  lexis: `You are Lexis, the Legal AI. You are methodical, risk-averse, and always thinking about compliance, contract terms, and legal exposure. You flag risk others miss.`,
  forge: `You are Forge, the Developer AI. You think in systems, technical debt, scalability, and build vs. buy tradeoffs. You translate business needs into technical realities.`,
  iris: `You are Iris, the Intelligence AI. You are data-obsessed and pattern-focused. You connect dots across departments and surface insights others miss.`,
};

function resolvePersona(name: string): string {
  const key = name.toLowerCase().split(/[\s(]/)[0];
  return EXEC_PERSONAS[key] ?? `You are ${name}, an AI executive at this company.`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AskParams {
  from: string;           // e.g. 'Zephyr (Sales AI)'
  to: string;             // e.g. 'Aurelia (Finance AI)'
  question: string;
  context?: Record<string, unknown>;
  organizationId: string;
  persist?: boolean;      // default true — save to memory
}

export interface AskResult {
  from: string;
  to: string;
  question: string;
  answer: string;
  timestamp: string;
}

export interface ConveneParams {
  convener: string;       // Who called the meeting
  topic: string;
  participants: string[]; // Executive names
  context?: Record<string, unknown>;
  organizationId: string;
  persist?: boolean;
}

export interface ConveneResult {
  topic: string;
  convener: string;
  participants: string[];
  transcript: Array<{ speaker: string; message: string }>;
  consensus: string;
  recommendedActions: string[];
  dissents: string[];
  sessionId: string;
  timestamp: string;
}

export interface DelegateParams {
  from: string;           // Delegating executive
  to: string;             // Receiving executive
  task: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  context?: Record<string, unknown>;
  organizationId: string;
  dueInHours?: number;
}

export interface DelegateResult {
  taskId: string;
  from: string;
  to: string;
  task: string;
  acknowledgement: string;
  estimatedCompletion: string;
}

// ─── CollaborationService ─────────────────────────────────────────────────────

class AtlasCollaborationService {
  private static _instance: AtlasCollaborationService | null = null;

  private constructor() {}

  static getInstance(): AtlasCollaborationService {
    if (!AtlasCollaborationService._instance) {
      AtlasCollaborationService._instance = new AtlasCollaborationService();
    }
    return AtlasCollaborationService._instance;
  }

  // ─── Ask: one executive asks another a direct question ──────────────────────

  async ask(params: AskParams): Promise<AskResult> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const persona = resolvePersona(params.to);
    const contextStr = params.context
      ? `\n\nRelevant context:\n${JSON.stringify(params.context, null, 2)}`
      : '';

    const prompt = `${persona}

You are operating inside Atlas OS, an autonomous business OS for ${org?.name ?? 'a company'} in the ${org?.industry ?? 'technology'} industry.

${params.from} is asking you the following:

"${params.question}"${contextStr}

Respond as ${params.to} would — in character, concise, and directly actionable. 
Your response will be used to inform a business decision. Be specific, not generic.
Keep your response under 200 words.`;

    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
    });

    const answer = completion.choices[0]?.message?.content ?? 'No response generated.';
    const timestamp = new Date().toISOString();

    // Persist as memory if requested (default: yes)
    if (params.persist !== false) {
      const execRecord = await prisma.aIExecutive.findFirst({
        where: { organizationId: params.organizationId, name: { contains: params.to.split(' ')[0], mode: 'insensitive' } },
      });

      if (execRecord) {
        await prisma.memory.create({
          data: {
            organizationId: params.organizationId,
            executiveId: execRecord.id,
            text: `[INTER-EXEC] ${params.from} asked ${params.to}: "${params.question}"\n\n${params.to} responded: "${answer}"`,
            type: 'conversation',
            actor: params.to,
            sourceSystem: 'Executive Collaboration',
            tags: ['collaboration', 'inter-exec', params.from.toLowerCase().split(' ')[0], params.to.toLowerCase().split(' ')[0]],
            updatedAt: new Date(),
          },
        });

        // Push feed event from the responding executive
        await prisma.feedEvent.create({
          data: {
            organizationId: params.organizationId,
            executiveId: execRecord.id,
            action: `Message from ${params.from}`,
            text: `${params.to} replied to ${params.from}: "${answer.substring(0, 120)}${answer.length > 120 ? '...' : ''}"`,
            status: 'info',
          },
        });
      }
    }

    return { from: params.from, to: params.to, question: params.question, answer, timestamp };
  }

  // ─── Convene: multi-executive discussion with consensus ─────────────────────

  async convene(params: ConveneParams): Promise<ConveneResult> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const sessionId = `session_${Date.now()}`;
    const transcript: Array<{ speaker: string; message: string }> = [];
    const contextStr = params.context
      ? `\n\nData/Context:\n${JSON.stringify(params.context, null, 2)}`
      : '';

    // Each participant speaks in turn
    for (const participant of params.participants) {
      const persona = resolvePersona(participant);
      const priorExchanges = transcript.map((t) => `${t.speaker}: ${t.message}`).join('\n\n');

      const prompt = `${persona}

You are in an executive session at ${org?.name ?? 'the company'} (${org?.industry ?? 'technology'} industry), convened by ${params.convener}.

Topic: "${params.topic}"${contextStr}

${priorExchanges ? `\nPrior discussion:\n${priorExchanges}\n` : ''}
Now give your perspective on this topic as ${participant}. Be direct, specific, and stay in character.
Consider what others have said. Agree or respectfully challenge them if your domain expertise demands it.
Keep your statement under 150 words.`;

      const completion = await aiClient.chat.completions.create({
        model: AI_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.75,
      });

      const message = completion.choices[0]?.message?.content ?? 'No response.';
      transcript.push({ speaker: participant, message });
    }

    // Convener synthesizes and forms consensus
    const persona = resolvePersona(params.convener);
    const fullTranscript = transcript.map((t) => `${t.speaker}: ${t.message}`).join('\n\n');

    const synthesisCompletion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: `${persona}

You convened this executive session at ${org?.name ?? 'the company'} on the topic: "${params.topic}"

The full discussion:
${fullTranscript}

Now synthesize the discussion. Identify consensus, note any significant dissents, and produce clear recommended actions.

Respond in JSON:
{
  "consensus": "2-3 sentence statement of what the team agreed on",
  "recommendedActions": ["3-5 concrete, specific next actions with owners"],
  "dissents": ["Any significant disagreements or concerns raised — or empty array if none"]
}`,
        },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    let synthesis: { consensus: string; recommendedActions: string[]; dissents: string[] };
    try {
      synthesis = JSON.parse(synthesisCompletion.choices[0]?.message?.content ?? '{}');
    } catch {
      synthesis = { consensus: 'Session completed — see transcript for details.', recommendedActions: [], dissents: [] };
    }

    const result: ConveneResult = {
      topic: params.topic,
      convener: params.convener,
      participants: params.participants,
      transcript,
      consensus: synthesis.consensus,
      recommendedActions: synthesis.recommendedActions,
      dissents: synthesis.dissents,
      sessionId,
      timestamp: new Date().toISOString(),
    };

    // Persist the whole session as memory
    if (params.persist !== false) {
      const convenerRecord = await prisma.aIExecutive.findFirst({
        where: { organizationId: params.organizationId, name: { contains: params.convener.split(' ')[0], mode: 'insensitive' } },
      });

      if (convenerRecord) {
        await prisma.memory.create({
          data: {
            organizationId: params.organizationId,
            executiveId: convenerRecord.id,
            text: `[EXEC SESSION: ${sessionId}] Topic: "${params.topic}"\nParticipants: ${params.participants.join(', ')}\n\nConsensus: ${synthesis.consensus}\n\nActions: ${synthesis.recommendedActions.join('; ')}`,
            type: 'conversation',
            actor: params.convener,
            sourceSystem: 'Executive Collaboration',
            tags: ['collaboration', 'exec-session', 'consensus', ...params.participants.map((p) => p.toLowerCase().split(' ')[0])],
            updatedAt: new Date(),
          },
        });

        await prisma.feedEvent.create({
          data: {
            organizationId: params.organizationId,
            executiveId: convenerRecord.id,
            action: 'Executive Session Complete',
            text: `"${params.topic}" — ${params.participants.length} executives. Consensus: ${synthesis.consensus.substring(0, 100)}`,
            status: 'info',
          },
        });
      }
    }

    return result;
  }

  // ─── Delegate: one executive formally assigns a task to another ──────────────

  async delegate(params: DelegateParams): Promise<DelegateResult> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const persona = resolvePersona(params.to);
    const contextStr = params.context
      ? `\n\nContext provided:\n${JSON.stringify(params.context, null, 2)}`
      : '';

    // Get the receiving executive's acknowledgement
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: `${persona}

You are operating at ${org?.name ?? 'the company'}. ${params.from} has just delegated the following task to you:

Task: "${params.task}"
Priority: ${params.priority.toUpperCase()}
Due: ${params.dueInHours ? `within ${params.dueInHours} hours` : 'ASAP'}${contextStr}

Acknowledge this task as ${params.to}. Confirm you understand what's needed, note any dependencies or blockers you anticipate, and give a realistic completion estimate.
Keep your acknowledgement under 100 words.`,
        },
      ],
      temperature: 0.6,
    });

    const acknowledgement = completion.choices[0]?.message?.content ?? 'Task acknowledged.';
    const dueDate = params.dueInHours
      ? new Date(Date.now() + params.dueInHours * 60 * 60 * 1000)
      : new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Find the receiving executive DB record
    const toExecRecord = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: params.to.split(' ')[0], mode: 'insensitive' } },
    });
    const fromExecRecord = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: params.from.split(' ')[0], mode: 'insensitive' } },
    });

    if (!toExecRecord) throw new Error(`Executive "${params.to}" not found.`);

    // Create a real task in the DB
    const task = await prisma.task.create({
      data: {
        organizationId: params.organizationId,
        title: params.task,
        description: `Delegated by ${params.from}.\n\nAcknowledgement: ${acknowledgement}`,
        priority: params.priority,
        assignedToExecutiveId: toExecRecord.id,
        createdByExecutiveId: fromExecRecord?.id ?? toExecRecord.id,
        dueDate,
        metadata: { delegatedBy: params.from, context: params.context } as any,
        updatedAt: new Date(),
      },
    });

    // Feed event on the receiving executive
    await prisma.feedEvent.create({
      data: {
        organizationId: params.organizationId,
        executiveId: toExecRecord.id,
        action: `Task Delegated by ${params.from}`,
        text: `${params.to} received: "${params.task}" (${params.priority} priority)`,
        status: params.priority === 'urgent' ? 'warning' : 'info',
      },
    });

    return {
      taskId: task.id,
      from: params.from,
      to: params.to,
      task: params.task,
      acknowledgement,
      estimatedCompletion: dueDate.toISOString(),
    };
  }

  // ─── Briefing: Iris feeds intel to another executive ─────────────────────────

  async briefExecutive(params: {
    from: string;
    to: string;
    briefingType: 'market_intel' | 'anomaly' | 'opportunity' | 'risk' | 'customer_insight';
    data: Record<string, unknown>;
    organizationId: string;
  }): Promise<{ briefing: string; recommendedAction: string }> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const senderPersona = resolvePersona(params.from);
    const receiverPersona = resolvePersona(params.to);

    // The sender (e.g. Iris) crafts the briefing
    const briefingCompletion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: `${senderPersona}

You are briefing ${params.to} at ${org?.name ?? 'the company'} with a ${params.briefingType.replace('_', ' ')} briefing.

Data:
${JSON.stringify(params.data, null, 2)}

Craft a concise, actionable briefing targeted specifically at ${params.to}'s domain and concerns.
Include the key finding and why it matters to them specifically. Under 150 words.`,
        },
      ],
      temperature: 0.65,
    });

    const briefing = briefingCompletion.choices[0]?.message?.content ?? '';

    // The receiver responds with their recommended action
    const actionCompletion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [
        {
          role: 'user',
          content: `${receiverPersona}

${params.from} just briefed you with the following:

"${briefing}"

What is your immediate recommended action in response? Be specific and stay in character. Under 80 words.`,
        },
      ],
      temperature: 0.7,
    });

    const recommendedAction = actionCompletion.choices[0]?.message?.content ?? '';

    // Persist
    const toExecRecord = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: params.to.split(' ')[0], mode: 'insensitive' } },
    });

    if (toExecRecord) {
      await prisma.memory.create({
        data: {
          organizationId: params.organizationId,
          executiveId: toExecRecord.id,
          text: `[BRIEFING from ${params.from}] Type: ${params.briefingType}\n\n${briefing}\n\nAction: ${recommendedAction}`,
          type: 'insight',
          actor: params.from,
          sourceSystem: 'Executive Collaboration',
          tags: ['collaboration', 'briefing', params.briefingType, params.from.toLowerCase().split(' ')[0]],
          updatedAt: new Date(),
        },
      });

      await prisma.feedEvent.create({
        data: {
          organizationId: params.organizationId,
          executiveId: toExecRecord.id,
          action: `Intel from ${params.from}`,
          text: briefing.substring(0, 150),
          status: params.briefingType === 'risk' || params.briefingType === 'anomaly' ? 'warning' : 'info',
        },
      });
    }

    return { briefing, recommendedAction };
  }
}

export const collaboration = AtlasCollaborationService.getInstance();
