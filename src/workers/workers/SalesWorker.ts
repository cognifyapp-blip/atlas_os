/**
 * Atlas OS — Sales Worker
 *
 * Executes autonomous Sales AI operations via BullMQ.
 * Dispatches to Zephyr (SalesAI) for all sales actions.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type SalesJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { SalesAI } from '../../services/executives/SalesAI.js';
import { eventBus } from '../../services/EventBus.js';

export class SalesWorker extends BaseWorker<SalesJobPayload> {
  constructor() {
    super('SalesWorker', QUEUE_NAMES.SALES);
  }

  protected validate(payload: SalesJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: SalesJobPayload,
    _job: Job<SalesJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, leadId, correlationId } = payload;

    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Zephyr', mode: 'insensitive' } },
    });
    if (!exec) throw new Error('SalesAI (Zephyr) not provisioned for this organization.');

    const zephyr = new SalesAI(organizationId, exec.id);

    switch (action) {
      case 'qualify_lead': {
        if (!leadId) throw new Error('leadId required for qualify_lead');
        const result = await zephyr.qualifyLead(leadId);
        // Publish event for cross-executive reactions
        if (result.qualification.score >= 70) {
          eventBus.publish('lead.qualified', {
            organizationId,
            leadId,
            score: result.qualification.score,
            estimatedValue: result.qualification.estimatedValue,
            executiveId: exec.id,
          });
        } else if (result.qualification.score < 50) {
          eventBus.publish('lead.disqualified', {
            organizationId,
            leadId,
            reason: result.qualification.reasoning,
            executiveId: exec.id,
          });
        }
        return result;
      }

      case 'analyze_pipeline':
        return zephyr.reviewPipeline();

      case 'follow_up': {
        if (!leadId) throw new Error('leadId required for follow_up');
        return zephyr.draftOutreachEmail(leadId, 'follow_up');
      }

      case 'close_deal': {
        if (!leadId) throw new Error('leadId required for close_deal');
        const outcome = (payload.context?.outcome as 'won' | 'lost') ?? 'won';
        const reason = payload.context?.reason as string | undefined;
        const result = await zephyr.markLeadClosed(leadId, outcome, reason);

        if (outcome === 'won') {
          eventBus.publish('deal.closed.won', {
            organizationId,
            leadId,
            value: result.value,
            executiveId: exec.id,
          });
        } else {
          eventBus.publish('deal.closed.lost', {
            organizationId,
            leadId,
            reason,
            executiveId: exec.id,
          });
        }
        return result;
      }

      default:
        console.log(`[SalesWorker] Unknown action "${action}" — acknowledged without processing`);
        return { action, organizationId, leadId, status: 'acknowledged', correlationId };
    }
  }
}
