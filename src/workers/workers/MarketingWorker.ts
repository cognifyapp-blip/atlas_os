/**
 * Atlas OS — Marketing Worker
 *
 * Executes autonomous Marketing AI operations via BullMQ.
 * Dispatches to Aria (MarketingAI) for all marketing actions.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type MarketingJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { MarketingAI } from '../../services/executives/MarketingAI.js';

export class MarketingWorker extends BaseWorker<MarketingJobPayload> {
  constructor() {
    super('MarketingWorker', QUEUE_NAMES.MARKETING);
  }

  protected validate(payload: MarketingJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: MarketingJobPayload,
    _job: Job<MarketingJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, campaignId, content, context } = payload;

    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Aria', mode: 'insensitive' } },
    });
    if (!exec) throw new Error('MarketingAI (Aria) not provisioned for this organization.');

    const aria = new MarketingAI(organizationId, exec.id);

    switch (action) {
      case 'generate_content': {
        const type = (context?.type as string) ?? 'blog';
        const topic = (context?.topic as string) ?? 'industry insights';
        const audience = (context?.audience as string) ?? 'business professionals';
        return aria.generateContent({ type, topic, audience });
      }

      case 'analyze_campaign': {
        if (!campaignId) throw new Error('campaignId required for analyze_campaign');
        return aria.analyzeCampaignPerformance(campaignId);
      }

      case 'generate_report':
        // Use keyword research as a proxy for a general marketing report
        return aria.researchKeywords((context?.topic as string) ?? 'industry trends', 'informational');

      default:
        console.log(`[MarketingWorker] Unknown action "${action}" — acknowledged`);
        return { action, organizationId, status: 'acknowledged' };
    }
  }
}
