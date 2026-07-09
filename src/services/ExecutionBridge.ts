/**
 * Atlas OS — Execution Bridge
 *
 * Connects three systems that were previously islands:
 *   1. EventBus subscribers → executive AI services (cross-executive messaging)
 *   2. Scheduler events → executive AI services (autonomous execution)
 *   3. BullMQ workers → executive AI services (queue-driven execution)
 *
 * This is the single file that "wires it all together".
 * Import and call `executionBridge.initialize()` once at server startup.
 */

import { prisma } from '../lib/prisma.js';
import { eventBus } from './EventBus.js';
import {
  CEOAssistant,
  SalesAI,
  FinanceAI,
  MarketingAI,
  CustomerSuccessAI,
  OperationsAI,
  IntelligenceAI,
} from './executives/index.js';
import { AutonomousWorkflows } from './AutonomousWorkflows.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveExec(orgId: string, nameFragment: string) {
  const exec = await prisma.aIExecutive.findFirst({
    where: { organizationId: orgId, name: { contains: nameFragment, mode: 'insensitive' } },
  });
  if (!exec) throw new Error(`Executive "${nameFragment}" not found for org ${orgId}`);
  return exec;
}

async function withExec<T>(
  orgId: string,
  nameFragment: string,
  fn: (id: string) => Promise<T>,
): Promise<T | null> {
  try {
    const exec = await resolveExec(orgId, nameFragment);
    return await fn(exec.id);
  } catch (err: any) {
    console.error(`[ExecutionBridge] Error in ${nameFragment} handler: ${err.message}`);
    return null;
  }
}

// ─── ExecutionBridge ─────────────────────────────────────────────────────────

class AtlasExecutionBridge {
  private static _instance: AtlasExecutionBridge | null = null;
  private _initialized = false;

  private constructor() {}

  static getInstance(): AtlasExecutionBridge {
    if (!AtlasExecutionBridge._instance) {
      AtlasExecutionBridge._instance = new AtlasExecutionBridge();
    }
    return AtlasExecutionBridge._instance;
  }

  initialize(): void {
    if (this._initialized) return;
    this._initialized = true;

    console.log('[ExecutionBridge] Wiring event bus handlers…');

    // ── Scheduled Events ────────────────────────────────────────────────────

    // Atlas: daily briefing
    eventBus.subscribe('schedule.daily_briefing', async ({ organizationId }) => {
      await withExec(organizationId, 'Atlas', async (id) => {
        const atlas = new CEOAssistant(organizationId, id);
        await atlas.generateDailyBriefing();
      });
    });

    // Zephyr: pipeline review
    eventBus.subscribe('schedule.pipeline_review', async ({ organizationId }) => {
      await withExec(organizationId, 'Zephyr', async (id) => {
        const zephyr = new SalesAI(organizationId, id);
        await zephyr.reviewPipeline();
      });
    });

    // Iris: anomaly detection
    eventBus.subscribe('schedule.anomaly_detection', async ({ organizationId }) => {
      await withExec(organizationId, 'Iris', async (id) => {
        const iris = new IntelligenceAI(organizationId, id);
        const result = await iris.detectAnomalies();

        // Critical anomalies → notify Atlas via EventBus
        for (const anomaly of (result.anomalies ?? []).filter((a: any) => a.severity === 'critical')) {
          eventBus.publish('anomaly.detected', {
            organizationId,
            anomaly,
            detectedBy: id,
          });
        }
      });
    });

    // Iris: intelligence reports
    eventBus.subscribe('schedule.intelligence_report', async ({ organizationId, period }) => {
      await withExec(organizationId, 'Iris', async (id) => {
        const iris = new IntelligenceAI(organizationId, id);
        const result = await iris.generateIntelligenceReport(period);
        eventBus.publish('intelligence.report.ready', {
          organizationId,
          period,
          headline: result.report.headline,
          executiveId: id,
        });
      });
    });

    // Aurelia: financial health
    eventBus.subscribe('schedule.financial_health', async ({ organizationId }) => {
      await withExec(organizationId, 'Aurelia', async (id) => {
        const aurelia = new FinanceAI(organizationId, id);
        await aurelia.generateFinancialHealthReport();
      });
    });

    // Aurelia: payment reminders sweep — find overdue proposals
    eventBus.subscribe('schedule.payment_reminders', async ({ organizationId }) => {
      await withExec(organizationId, 'Aurelia', async (id) => {
        const aurelia = new FinanceAI(organizationId, id);
        const now = new Date();

        const overdueProposals = await prisma.proposal.findMany({
          where: {
            organizationId,
            status: 'sent',
            expiresAt: { lt: now },
          },
        });

        for (const proposal of overdueProposals) {
          const daysOverdue = Math.floor(
            (now.getTime() - (proposal.expiresAt?.getTime() ?? now.getTime())) /
              (1000 * 60 * 60 * 24),
          );
          await aurelia.draftPaymentReminder(proposal.id, daysOverdue);

          // Also fire an event for downstream processing
          eventBus.publish('invoice.overdue', {
            organizationId,
            proposalId: proposal.id,
            daysOverdue,
            amount: proposal.totalValue,
            executiveId: id,
          });
        }
      });
    });

    // Orion: operational report
    eventBus.subscribe('schedule.operational_report', async ({ organizationId }) => {
      await withExec(organizationId, 'Orion', async (id) => {
        const orion = new OperationsAI(organizationId, id);
        await orion.generateOperationalReport();
      });
    });

    // ── Cross-Executive Events ──────────────────────────────────────────────

    // Iris detects anomaly → Atlas files a decision
    eventBus.subscribe('anomaly.detected', async ({ organizationId, anomaly, detectedBy }) => {
      await withExec(organizationId, 'Atlas', async (id) => {
        const atlas = new CEOAssistant(organizationId, id);
        await atlas.createDecision({
          title: `🚨 ANOMALY: ${anomaly.type}`,
          summary: anomaly.description,
          description: anomaly.description,
          reasoning: `Iris (Intelligence AI) detected this anomaly in the operational data.`,
          impact: anomaly.recommendation,
          confidence: 85,
          type: 'operational',
          contributorIds: [detectedBy],
          expiresInHours: 24,
        });
      });
    });

    // Deal closed won → Lyra starts onboarding
    eventBus.subscribe('deal.closed.won', async ({ organizationId, leadId }) => {
      await withExec(organizationId, 'Lyra', async (id) => {
        const lyra = new CustomerSuccessAI(organizationId, id);
        await lyra.createOnboardingPlan(leadId);
      });

      // Auto-complete any "first client" milestones in active goals
      try {
        const { missionControl } = await import('./MissionControl.js');
        const goals = await missionControl.getActiveGoals(organizationId);
        for (const goal of goals) {
          const firstClientMilestone = goal.milestones.find((m) =>
            (m.title.toLowerCase().includes('client') ||
             m.title.toLowerCase().includes('customer') ||
             m.title.toLowerCase().includes('revenue') ||
             m.title.toLowerCase().includes('deal') ||
             m.title.toLowerCase().includes('close')) &&
            m.status !== 'completed',
          );
          if (firstClientMilestone) {
            await missionControl.completeMilestone(
              firstClientMilestone.id,
              organizationId,
              `Auto-completed: Deal closed won for lead ${leadId}.`,
            );
          }
        }
      } catch (err: any) {
        console.error(`[ExecutionBridge] Goal milestone auto-complete failed: ${err.message}`);
      }
    });

    // Lead qualified → Aria scores it as MQL
    eventBus.subscribe('lead.qualified', async ({ organizationId, leadId }) => {
      await withExec(organizationId, 'Aria', async (id) => {
        const aria = new MarketingAI(organizationId, id);
        await aria.scoreMarketingLead(leadId);
      });
    });

    // Intelligence report ready → Atlas generates daily briefing to include it
    eventBus.subscribe('intelligence.report.ready', async ({ organizationId, period, headline }) => {
      if (period === 'weekly') {
        // Weekly reports trigger a board summary from Atlas
        await withExec(organizationId, 'Atlas', async (id) => {
          const atlas = new CEOAssistant(organizationId, id);
          await atlas.generateBoardReport();
        });
      }
    });

    // ── Autonomous Multi-Executive Workflows ─────────────────────────────────

    // High-value qualified lead (score >= 80, value >= $50k) → full deal review
    eventBus.subscribe('lead.qualified', async ({ organizationId, leadId, score, estimatedValue }) => {
      if (score >= 80 && estimatedValue >= 50000) {
        try {
          const workflows = new AutonomousWorkflows(organizationId);
          await workflows.dealReview(leadId);
        } catch (err: any) {
          console.error(`[ExecutionBridge] Deal review workflow failed: ${err.message}`);
        }
      }
    });

    // Weekly board prep triggers full board prep workflow
    eventBus.subscribe('schedule.intelligence_report', async ({ organizationId, period }) => {
      if (period === 'weekly') {
        try {
          const workflows = new AutonomousWorkflows(organizationId);
          await workflows.weeklyBoardPrep();
        } catch (err: any) {
          console.error(`[ExecutionBridge] Weekly board prep workflow failed: ${err.message}`);
        }
      }
    });

    console.log('[ExecutionBridge] All handlers registered.');
  }

  isInitialized(): boolean {
    return this._initialized;
  }
}

export const executionBridge = AtlasExecutionBridge.getInstance();
