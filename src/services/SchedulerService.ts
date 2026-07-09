/**
 * Atlas OS — Scheduler Service
 *
 * Autonomous executive scheduling via BullMQ repeating jobs.
 * Executives wake up on timers without any human trigger.
 *
 * Schedule:
 *   07:00 daily  — Atlas: daily briefing
 *   08:00 daily  — Zephyr: pipeline review
 *   09:00 daily  — Iris: anomaly detection
 *   Every 6h     — Iris: anomaly detection (continuous monitoring)
 *   Monday 08:30 — Iris: weekly intelligence report
 *   1st of month — Iris: monthly intelligence report
 *   08:30 daily  — Aurelia: financial health check
 *   10:00 daily  — Aurelia: payment reminder sweep
 *   09:30 Mon    — Orion: operational report
 */

import { prisma } from '../lib/prisma.js';
import { eventBus } from './EventBus.js';

// ─── Schedule Definitions ────────────────────────────────────────────────────

interface ScheduleEntry {
  name: string;
  cronPattern: string;
  description: string;
  handler: (organizationId: string) => Promise<void>;
}

// ─── SchedulerService ────────────────────────────────────────────────────────

class AtlasSchedulerService {
  private static _instance: AtlasSchedulerService | null = null;
  private _timers: NodeJS.Timeout[] = [];
  private _running = false;

  private constructor() {}

  static getInstance(): AtlasSchedulerService {
    if (!AtlasSchedulerService._instance) {
      AtlasSchedulerService._instance = new AtlasSchedulerService();
    }
    return AtlasSchedulerService._instance;
  }

  /**
   * Start the scheduler. Fires events via the EventBus.
   * The EventBus subscribers (wired in ExecutionBridge) handle actual AI calls.
   */
  start(): void {
    if (this._running) return;
    this._running = true;

    console.log('[Scheduler] Starting autonomous executive schedules…');

    // ── Daily briefing — Atlas — 07:00 UTC ──────────────────────────────────
    this._scheduleCron('0 7 * * *', 'atlas.daily_briefing', async (orgId) => {
      eventBus.publish('schedule.daily_briefing', { organizationId: orgId });
    });

    // ── Pipeline review — Zephyr — 08:00 UTC ────────────────────────────────
    this._scheduleCron('0 8 * * *', 'zephyr.pipeline_review', async (orgId) => {
      eventBus.publish('schedule.pipeline_review', { organizationId: orgId });
    });

    // ── Anomaly detection — Iris — every 6 hours ────────────────────────────
    this._scheduleCron('0 */6 * * *', 'iris.anomaly_detection', async (orgId) => {
      eventBus.publish('schedule.anomaly_detection', { organizationId: orgId });
    });

    // ── Financial health — Aurelia — 08:30 UTC daily ────────────────────────
    this._scheduleCron('30 8 * * *', 'aurelia.financial_health', async (orgId) => {
      eventBus.publish('schedule.financial_health', { organizationId: orgId });
    });

    // ── Payment reminder sweep — Aurelia — 10:00 UTC daily ──────────────────
    this._scheduleCron('0 10 * * *', 'aurelia.payment_reminders', async (orgId) => {
      eventBus.publish('schedule.payment_reminders', { organizationId: orgId });
    });

    // ── Weekly intelligence report — Iris — Monday 08:30 UTC ────────────────
    this._scheduleCron('30 8 * * 1', 'iris.weekly_report', async (orgId) => {
      eventBus.publish('schedule.intelligence_report', { organizationId: orgId, period: 'weekly' });
    });

    // ── Monthly intelligence report — Iris — 1st of month 09:00 UTC ─────────
    this._scheduleCron('0 9 1 * *', 'iris.monthly_report', async (orgId) => {
      eventBus.publish('schedule.intelligence_report', { organizationId: orgId, period: 'monthly' });
    });

    // ── Operational report — Orion — Monday 09:30 UTC ────────────────────────
    this._scheduleCron('30 9 * * 1', 'orion.operational_report', async (orgId) => {
      eventBus.publish('schedule.operational_report', { organizationId: orgId });
    });

    // ── Goal progress check — Atlas — Monday 06:30 UTC ────────────────────────
    this._scheduleCron('30 6 * * 1', 'atlas.goal_progress_check', async (orgId) => {
      try {
        const { missionControl } = await import('./MissionControl.js');
        await missionControl.weeklyProgressCheck(orgId);
      } catch (err: any) {
        console.error(`[Scheduler] Goal progress check failed for ${orgId}: ${err.message}`);
      }
    });

    console.log('[Scheduler] All schedules active.');
  }

  stop(): void {
    for (const timer of this._timers) clearTimeout(timer);
    this._timers = [];
    this._running = false;
    console.log('[Scheduler] Stopped.');
  }

  isRunning(): boolean {
    return this._running;
  }

  /**
   * Manually trigger a scheduled event for all initialized orgs.
   * Useful for testing or manual one-off runs.
   */
  async triggerNow(event: 'daily_briefing' | 'pipeline_review' | 'anomaly_detection' | 'financial_health' | 'payment_reminders' | 'weekly_report' | 'monthly_report' | 'operational_report'): Promise<void> {
    const orgs = await prisma.organization.findMany({ where: { initialized: true } });

    for (const org of orgs) {
      switch (event) {
        case 'daily_briefing': eventBus.publish('schedule.daily_briefing', { organizationId: org.id }); break;
        case 'pipeline_review': eventBus.publish('schedule.pipeline_review', { organizationId: org.id }); break;
        case 'anomaly_detection': eventBus.publish('schedule.anomaly_detection', { organizationId: org.id }); break;
        case 'financial_health': eventBus.publish('schedule.financial_health', { organizationId: org.id }); break;
        case 'payment_reminders': eventBus.publish('schedule.payment_reminders', { organizationId: org.id }); break;
        case 'weekly_report': eventBus.publish('schedule.intelligence_report', { organizationId: org.id, period: 'weekly' }); break;
        case 'monthly_report': eventBus.publish('schedule.intelligence_report', { organizationId: org.id, period: 'monthly' }); break;
        case 'operational_report': eventBus.publish('schedule.operational_report', { organizationId: org.id }); break;
      }
    }
  }
  // ─── Cron-like scheduling using setInterval ────────────────────────────────

  private _scheduleCron(
    pattern: string,
    name: string,
    handler: (orgId: string) => Promise<void>,
  ): void {
    const intervalMs = this._cronToInterval(pattern);

    // Calculate delay until next fire based on pattern
    const delayMs = this._getInitialDelay(pattern);

    const fire = async () => {
      try {
        const orgs = await prisma.organization.findMany({ where: { initialized: true } });
        for (const org of orgs) {
          await handler(org.id);
        }
      } catch (err: any) {
        console.error(`[Scheduler] Error in ${name}: ${err.message}`);
      }
    };

    // Initial delay, then repeat
    const initialTimer = setTimeout(() => {
      fire();
      const interval = setInterval(fire, intervalMs);
      this._timers.push(interval as unknown as NodeJS.Timeout);
    }, delayMs);

    this._timers.push(initialTimer);

    console.log(
      `[Scheduler] Registered "${name}" (pattern: ${pattern}, interval: ${Math.round(intervalMs / 60000)}min, first fire in: ${Math.round(delayMs / 60000)}min)`,
    );
  }

  /**
   * Approximate cron pattern → interval ms.
   * Handles the patterns we actually use.
   */
  private _cronToInterval(pattern: string): number {
    // "0 */6 * * *" → every 6 hours
    if (pattern.includes('*/')) {
      const match = pattern.match(/\*\/(\d+)/);
      if (match) {
        const n = parseInt(match[1]);
        // If it's in the hours position (second field in "0 */6 * * *")
        if (pattern.startsWith('0 */')) return n * 60 * 60 * 1000;
        // If it's in minutes position
        return n * 60 * 1000;
      }
    }

    // Daily patterns "0 7 * * *" → 24h
    if (pattern.match(/^\d+ \d+ \* \* \*$/)) return 24 * 60 * 60 * 1000;
    // Weekly patterns "30 8 * * 1" → 7 days
    if (pattern.match(/^\d+ \d+ \* \* \d+$/)) return 7 * 24 * 60 * 60 * 1000;
    // Monthly patterns "0 9 1 * *" → 30 days
    if (pattern.match(/^\d+ \d+ \d+ \* \*$/)) return 30 * 24 * 60 * 60 * 1000;

    return 24 * 60 * 60 * 1000; // default 24h
  }

  /**
   * Calculate delay in ms until the next scheduled fire time.
   * Keeps clock-aligned firing (e.g., 07:00 UTC tomorrow).
   */
  private _getInitialDelay(pattern: string): number {
    const now = new Date();
    const fields = pattern.split(' ');
    // For patterns with specific hours (field index 1), align to next occurrence
    const hourField = fields[1];
    const minuteField = fields[0];
    const dayOfWeekField = fields[4];

    if (!hourField.includes('*') && !minuteField.includes('*')) {
      const targetHour = parseInt(hourField);
      const targetMin = parseInt(minuteField);
      const next = new Date(now);
      next.setUTCHours(targetHour, targetMin, 0, 0);

      // If target is in the past today, schedule for tomorrow
      if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

      // For weekly patterns, advance to the right day of week
      if (dayOfWeekField !== '*') {
        const targetDow = parseInt(dayOfWeekField);
        while (next.getUTCDay() !== targetDow) {
          next.setUTCDate(next.getUTCDate() + 1);
        }
      }

      return Math.max(next.getTime() - now.getTime(), 5000);
    }

    // For interval patterns like "0 */6 * * *", fire after first interval
    return this._cronToInterval(pattern);
  }
}

export const schedulerService = AtlasSchedulerService.getInstance();
