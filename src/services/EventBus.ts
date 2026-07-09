/**
 * Atlas OS — Internal Event Bus
 *
 * Cross-executive messaging system. Executives publish events and subscribe
 * to events from other executives — without coupling to specific classes.
 *
 * Pattern: EventEmitter + typed event catalogue.
 *
 * Examples:
 *   - Iris detects anomaly → publishes 'anomaly.detected' → Atlas receives, files decision
 *   - Zephyr closes a deal → publishes 'deal.closed' → Lyra receives, starts onboarding
 *   - Aurelia flags overdue invoice → publishes 'invoice.overdue' → Orion creates task
 */

import { EventEmitter } from 'events';

// ─── Event Catalogue ──────────────────────────────────────────────────────────

export interface AtlasEventMap {
  // Intelligence events
  'anomaly.detected': { organizationId: string; anomaly: { type: string; severity: string; description: string; recommendation: string }; detectedBy: string };
  'intelligence.report.ready': { organizationId: string; period: string; headline: string; executiveId: string };

  // Sales events
  'lead.qualified': { organizationId: string; leadId: string; score: number; estimatedValue: number; executiveId: string };
  'lead.disqualified': { organizationId: string; leadId: string; reason: string; executiveId: string };
  'deal.closed.won': { organizationId: string; leadId: string; value: number; executiveId: string };
  'deal.closed.lost': { organizationId: string; leadId: string; reason?: string; executiveId: string };
  'proposal.sent': { organizationId: string; proposalId: string; leadId: string; value: number; executiveId: string };

  // Finance events
  'invoice.overdue': { organizationId: string; proposalId: string; daysOverdue: number; amount: number; executiveId: string };
  'proposal.drafted': { organizationId: string; proposalId: string; leadId: string; value: number; executiveId: string };
  'budget.flagged': { organizationId: string; category: string; amount: number; reason: string; executiveId: string };

  // Operations events
  'incident.triaged': { organizationId: string; severity: string; title: string; executiveId: string };
  'automation.created': { organizationId: string; workflowId: string; name: string; executiveId: string };

  // HR events
  'employee.onboarded': { organizationId: string; employeeName: string; role: string; executiveId: string };

  // Marketing events
  'campaign.launched': { organizationId: string; campaignName: string; channels: string[]; executiveId: string };
  'lead.mql': { organizationId: string; leadId: string; score: number; executiveId: string };

  // Legal events
  'contract.risk.flagged': { organizationId: string; contractType: string; riskLevel: string; executiveId: string };
  'compliance.issue': { organizationId: string; area: string; severity: string; executiveId: string };

  // Scheduled triggers (from SchedulerService)
  'schedule.daily_briefing': { organizationId: string };
  'schedule.pipeline_review': { organizationId: string };
  'schedule.anomaly_detection': { organizationId: string };
  'schedule.intelligence_report': { organizationId: string; period: 'daily' | 'weekly' | 'monthly' };
  'schedule.financial_health': { organizationId: string };
  'schedule.payment_reminders': { organizationId: string };
  'schedule.operational_report': { organizationId: string };
}

export type AtlasEventName = keyof AtlasEventMap;

// ─── EventBus ────────────────────────────────────────────────────────────────

class AtlasEventBus extends EventEmitter {
  private static _instance: AtlasEventBus | null = null;

  private constructor() {
    super();
    // Allow many subscribers for a busy system
    this.setMaxListeners(100);
  }

  static getInstance(): AtlasEventBus {
    if (!AtlasEventBus._instance) {
      AtlasEventBus._instance = new AtlasEventBus();
    }
    return AtlasEventBus._instance;
  }

  /**
   * Publish a typed event to all subscribers.
   */
  publish<E extends AtlasEventName>(event: E, payload: AtlasEventMap[E]): void {
    console.log(
      JSON.stringify({
        level: 'info',
        component: 'EventBus',
        event,
        organizationId: (payload as any).organizationId,
        ts: new Date().toISOString(),
      }),
    );
    this.emit(event, payload);
  }

  /**
   * Subscribe to a typed event.
   * Returns an unsubscribe function.
   */
  subscribe<E extends AtlasEventName>(
    event: E,
    handler: (payload: AtlasEventMap[E]) => void | Promise<void>,
  ): () => void {
    const wrappedHandler = async (payload: AtlasEventMap[E]) => {
      try {
        await handler(payload);
      } catch (err: any) {
        console.error(
          JSON.stringify({
            level: 'error',
            component: 'EventBus',
            event,
            error: err.message,
            ts: new Date().toISOString(),
          }),
        );
      }
    };
    this.on(event, wrappedHandler);
    return () => this.off(event, wrappedHandler);
  }

  /**
   * Subscribe to an event exactly once.
   */
  subscribeOnce<E extends AtlasEventName>(
    event: E,
    handler: (payload: AtlasEventMap[E]) => void | Promise<void>,
  ): void {
    this.once(event, handler);
  }
}

export const eventBus = AtlasEventBus.getInstance();
