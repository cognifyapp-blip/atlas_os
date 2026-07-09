/**
 * Atlas OS — Mission Control Service
 *
 * Enables the CEO to set company goals. Atlas then breaks each goal into
 * weekly milestones, assigns them to the right executives, and tracks
 * progress autonomously. Executives report back; Atlas escalates misses.
 *
 * This is what allows the executive team to pursue a specific objective
 * (e.g. "First paying client in 6 weeks") without the CEO directing
 * every step.
 *
 * Flow:
 *   CEO sets goal → Atlas plans milestones → Each exec owns their week(s)
 *   → Scheduler checks progress weekly → Atlas escalates if behind
 *   → Goal marked complete when first client closes
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { eventBus } from './EventBus.js';

// ─── AI client (same pattern as ExecutiveService) ────────────────────────────

function createAIClient(): OpenAI | null {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY)
    return new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', defaultHeaders: { 'HTTP-Referer': 'https://atlas-os.local', 'X-Title': 'Atlas OS' } });
  if (provider === 'openai' && process.env.OPENAI_API_KEY)
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY)
    return new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
  return null;
}

const aiClient = createAIClient();
const AI_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SetGoalParams {
  organizationId: string;
  title: string;
  description?: string;
  targetDate?: Date;
  successCriteria?: string;
  weeksToTarget?: number;
}

export interface GoalPlan {
  goalId: string;
  title: string;
  milestones: Array<{
    week: number;
    title: string;
    description: string;
    owner: string;
    dueDate: Date;
  }>;
  executionStrategy: string;
  criticalPath: string[];
  risks: string[];
}

// ─── MissionControlService ───────────────────────────────────────────────────

class AtlasMissionControlService {
  private static _instance: AtlasMissionControlService | null = null;

  private constructor() {}

  static getInstance(): AtlasMissionControlService {
    if (!AtlasMissionControlService._instance) {
      AtlasMissionControlService._instance = new AtlasMissionControlService();
    }
    return AtlasMissionControlService._instance;
  }

  // ─── Set a new mission goal ────────────────────────────────────────────────

  async setGoal(params: SetGoalParams): Promise<GoalPlan> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const executives = await prisma.aIExecutive.findMany({ where: { organizationId: params.organizationId } });
    const weeks = params.weeksToTarget ?? 6;

    const execList = executives.map((e) => `- ${e.name} (${e.role})`).join('\n');

    // Atlas plans the milestones
    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{
        role: 'user',
        content: `You are Atlas, AI Chief of Staff for ${org?.name ?? 'a startup'} in the ${org?.industry ?? 'technology'} industry.

The CEO has set the following company goal:
Goal: "${params.title}"
Description: ${params.description ?? 'Not specified'}
Success criteria: ${params.successCriteria ?? 'Goal achieved when objective is met'}
Target: ${weeks} weeks from today

Company context:
- Size: ${org?.size ?? 'Small startup'}
- Goals: ${org?.goals ?? 'Growth'}
- Challenges: ${org?.challenges ?? 'Early stage'}

Available AI executives:
${execList}

Break this goal into concrete weekly milestones. Each milestone must be specific, measurable, and owned by the most relevant executive. Milestones must build on each other — Week 1 creates the foundation that Week 2 builds on, etc.

Return JSON:
{
  "executionStrategy": "2-3 paragraph strategy for achieving this goal",
  "criticalPath": ["The 3-5 absolutely critical things that must happen on time"],
  "risks": ["3 key risks that could prevent achieving this goal"],
  "milestones": [
    {
      "week": 1,
      "title": "Concise milestone title",
      "description": "What specifically must be accomplished this week and what success looks like",
      "owner": "Executive name from the list above (first word + role, e.g. 'Aria (Marketing AI)')",
      "measurableOutcome": "The one thing we can check to know this is done"
    },
    ... (${weeks} milestones, one per week)
  ]
}`,
      }],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    let plan: any;
    try {
      plan = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch {
      throw new Error('Atlas failed to generate milestone plan.');
    }

    // Persist goal
    const goal = await prisma.missionGoal.create({
      data: {
        organizationId: params.organizationId,
        title: params.title,
        description: params.description,
        targetDate: params.targetDate ?? new Date(Date.now() + weeks * 7 * 24 * 3600 * 1000),
        status: 'active',
        progress: 0,
        successCriteria: params.successCriteria,
        setByHuman: true,
        metadata: { executionStrategy: plan.executionStrategy, criticalPath: plan.criticalPath, risks: plan.risks, weeksToTarget: weeks },
        updatedAt: new Date(),
      },
    });

    // Persist milestones
    const milestonesCreated = [];
    for (const m of (plan.milestones ?? [])) {
      const ownerExec = executives.find((e) =>
        e.name.toLowerCase().includes(m.owner?.toLowerCase()?.split(' ')[0] ?? ''),
      );

      const dueDate = new Date(Date.now() + m.week * 7 * 24 * 3600 * 1000);

      const milestone = await prisma.goalMilestone.create({
        data: {
          goalId: goal.id,
          organizationId: params.organizationId,
          week: m.week,
          title: m.title,
          description: `${m.description}\n\nMeasurable outcome: ${m.measurableOutcome ?? m.description}`,
          ownerExecutiveId: ownerExec?.id ?? null,
          status: 'pending',
          dueDate,
          metadata: { owner: m.owner, measurableOutcome: m.measurableOutcome },
          updatedAt: new Date(),
        },
      });

      // Create a task for the owning executive
      if (ownerExec) {
        await prisma.task.create({
          data: {
            organizationId: params.organizationId,
            title: `[Week ${m.week} Goal] ${m.title}`,
            description: `Goal: "${params.title}"\n\n${m.description}`,
            priority: m.week <= 2 ? 'urgent' : 'high',
            assignedToExecutiveId: ownerExec.id,
            dueDate,
            metadata: { goalId: goal.id, milestoneId: milestone.id, week: m.week },
            updatedAt: new Date(),
          },
        });
      }

      milestonesCreated.push({ ...milestone, owner: m.owner });
    }

    // Atlas memory
    const atlasExec = executives.find((e) => e.name.toLowerCase().includes('atlas'));
    if (atlasExec) {
      await prisma.memory.create({
        data: {
          organizationId: params.organizationId,
          executiveId: atlasExec.id,
          text: `Mission Goal Set: "${params.title}" — ${weeks}-week plan. ${plan.milestones?.length} milestones created. Critical path: ${plan.criticalPath?.join(', ')}.`,
          type: 'policy',
          actor: 'CEO (Human)',
          sourceSystem: 'Mission Control',
          tags: ['goal', 'mission', 'strategy', 'milestone-plan'],
          updatedAt: new Date(),
        },
      });

      await prisma.feedEvent.create({
        data: {
          organizationId: params.organizationId,
          executiveId: atlasExec.id,
          action: 'Mission Goal Set',
          text: `CEO set goal: "${params.title}". Atlas planned ${milestonesCreated.length} weekly milestones. Executive team mobilized.`,
          status: 'success',
        },
      });
    }

    return {
      goalId: goal.id,
      title: params.title,
      milestones: milestonesCreated.map((m) => ({
        week: m.week,
        title: m.title,
        description: m.description ?? '',
        owner: m.owner,
        dueDate: m.dueDate ?? new Date(),
      })),
      executionStrategy: plan.executionStrategy,
      criticalPath: plan.criticalPath ?? [],
      risks: plan.risks ?? [],
    };
  }

  // ─── Weekly progress check ─────────────────────────────────────────────────
  // Called by scheduler every Monday. Marks overdue milestones, escalates to Atlas.

  async weeklyProgressCheck(organizationId: string): Promise<void> {
    const activeGoals = await prisma.missionGoal.findMany({
      where: { organizationId, status: 'active' },
      include: { milestones: { include: { owner: true } } },
    });

    for (const goal of activeGoals) {
      const now = new Date();

      // Auto-complete milestones whose dueDate has passed and check if their
      // associated tasks are done — if so mark milestone complete
      for (const milestone of goal.milestones) {
        if (milestone.status === 'pending' && milestone.dueDate && milestone.dueDate < now) {
          // Check if any linked task is completed
          const tasks = await prisma.task.findMany({
            where: {
              organizationId,
              metadata: { path: ['milestoneId'], equals: milestone.id },
              status: 'completed',
            },
          });

          if (tasks.length > 0) {
            await prisma.goalMilestone.update({
              where: { id: milestone.id },
              data: { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
            });
          } else {
            await prisma.goalMilestone.update({
              where: { id: milestone.id },
              data: { status: 'missed', updatedAt: new Date() },
            });

            // Escalate missed milestone to Atlas
            const atlasExec = await prisma.aIExecutive.findFirst({
              where: { organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
            });
            if (atlasExec) {
              await prisma.feedEvent.create({
                data: {
                  organizationId,
                  executiveId: atlasExec.id,
                  action: '⚠️ Milestone Missed',
                  text: `Week ${milestone.week}: "${milestone.title}" was not completed by ${milestone.dueDate.toLocaleDateString()}. Goal: "${goal.title}"`,
                  status: 'warning',
                },
              });
            }
          }
        }
      }

      // Recalculate overall goal progress
      const completed = goal.milestones.filter((m) => m.status === 'completed').length;
      const total = goal.milestones.length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

      await prisma.missionGoal.update({
        where: { id: goal.id },
        data: { progress, updatedAt: new Date() },
      });

      // Check if goal is complete
      if (goal.targetDate && goal.targetDate < now && progress < 100) {
        const atlasExec = await prisma.aIExecutive.findFirst({
          where: { organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
        });
        if (atlasExec) {
          await prisma.decision.create({
            data: {
              organizationId,
              createdByExecutiveId: atlasExec.id,
              title: `Goal Status Review: "${goal.title}"`,
              summary: `Goal target date has passed at ${progress}% completion (${completed}/${total} milestones done).`,
              reasoning: `Weekly progress check found goal at ${progress}%. ${total - completed} milestones incomplete.`,
              impact: 'Review goal timeline or adjust strategy.',
              confidence: 80,
              type: 'strategic',
              status: 'pending',
              metadata: { goalId: goal.id, progress, completedMilestones: completed, totalMilestones: total },
              updatedAt: new Date(),
            },
          });
        }
      }
    }
  }

  // ─── Get all active goals with milestone status ────────────────────────────

  async getActiveGoals(organizationId: string) {
    return prisma.missionGoal.findMany({
      where: { organizationId, status: { not: 'cancelled' } },
      include: {
        milestones: {
          include: { owner: { select: { id: true, name: true, role: true } } },
          orderBy: { week: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Mark a milestone complete ────────────────────────────────────────────

  async completeMilestone(milestoneId: string, organizationId: string, notes?: string): Promise<void> {
    const milestone = await prisma.goalMilestone.findFirst({
      where: { id: milestoneId, organizationId },
      include: { goal: true },
    });
    if (!milestone) throw new Error('Milestone not found.');

    await prisma.goalMilestone.update({
      where: { id: milestoneId },
      data: { status: 'completed', completedAt: new Date(), notes: notes ?? null, updatedAt: new Date() },
    });

    // Recalculate goal progress
    const all = await prisma.goalMilestone.findMany({ where: { goalId: milestone.goalId } });
    const done = all.filter((m) => m.status === 'completed').length;
    const progress = Math.round((done / all.length) * 100);

    await prisma.missionGoal.update({
      where: { id: milestone.goalId },
      data: {
        progress,
        status: progress === 100 ? 'completed' : 'active',
        updatedAt: new Date(),
      },
    });

    const atlasExec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
    });
    if (atlasExec) {
      await prisma.feedEvent.create({
        data: {
          organizationId,
          executiveId: atlasExec.id,
          action: progress === 100 ? '🎯 Goal Achieved!' : `✅ Milestone Complete (Week ${milestone.week})`,
          text: `"${milestone.title}" completed. Goal "${milestone.goal.title}" at ${progress}% (${done}/${all.length} milestones).`,
          status: progress === 100 ? 'success' : 'info',
        },
      });
    }
  }
}

export const missionControl = AtlasMissionControlService.getInstance();
