/**
 * Atlas OS — Analytics Worker
 *
 * Processes business analytics and routes to Iris (Intelligence AI)
 * for anomaly detection, trend analysis, and insight generation.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type AnalyticsJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { IntelligenceAI } from '../../services/executives/IntelligenceAI.js';

export class AnalyticsWorker extends BaseWorker<AnalyticsJobPayload> {
  constructor() {
    super('AnalyticsWorker', QUEUE_NAMES.ANALYTICS);
  }

  protected validate(payload: AnalyticsJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: AnalyticsJobPayload,
    _job: Job<AnalyticsJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, event, dimension } = payload;

    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Iris', mode: 'insensitive' } },
    });

    if (!exec) {
      console.warn(`[AnalyticsWorker] Iris not provisioned for ${organizationId}`);
      return { action, status: 'skipped', reason: 'iris_not_provisioned' };
    }

    const iris = new IntelligenceAI(organizationId, exec.id);

    switch (action) {
      case 'detect_anomalies':
        return iris.detectAnomalies();

      case 'generate_insights':
        return iris.generateIntelligenceReport('daily');

      case 'aggregate_daily':
        return iris.generateIntelligenceReport('daily');

      case 'compute_metrics': {
        const metric = event ?? dimension ?? 'pipeline';
        return iris.analyzeTrends({ metric, lookbackDays: 7 });
      }

      case 'track_event':
      default:
        // Light-weight event acknowledgement — no AI call needed
        return {
          action,
          event,
          organizationId,
          status: 'processed',
          processedAt: new Date().toISOString(),
        };
    }
  }
}
