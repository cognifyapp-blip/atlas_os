/**
 * Atlas OS — Executive Worker
 *
 * Processes CEO Assistant and cross-department AI executive tasks.
 * Routes actions to the correct executive service.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type ExecutiveJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { CEOAssistant } from '../../services/executives/CEOAssistant.js';
import { IntelligenceAI } from '../../services/executives/IntelligenceAI.js';

export class ExecutiveWorker extends BaseWorker<ExecutiveJobPayload> {
  constructor() {
    super('ExecutiveWorker', QUEUE_NAMES.EXECUTIVE);
  }

  protected validate(payload: ExecutiveJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
    if (!payload.executiveId) throw new Error('executiveId is required');
  }

  protected async process(
    payload: ExecutiveJobPayload,
    _job: Job<ExecutiveJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, executiveId, topic, organizationId } = payload;

    // Determine which executive to use based on the executiveId
    const exec = await prisma.aIExecutive.findUnique({ where: { id: executiveId } });
    if (!exec) throw new Error(`Executive ${executiveId} not found`);

    const name = exec.name.toLowerCase();

    // CEO / Atlas actions
    if (name.includes('atlas') || name.includes('ceo')) {
      const atlas = new CEOAssistant(organizationId, executiveId);

      switch (action) {
        case 'analyze_situation':
        case 'draft_strategy':
        case 'generate_recommendation':
          if (topic) return atlas.runStrategySession(topic, []);
          return atlas.generateDailyBriefing();

        case 'review_decisions':
          return atlas.generateBoardReport();

        default:
          return atlas.generateDailyBriefing();
      }
    }

    // Intelligence / Iris actions
    if (name.includes('iris') || name.includes('intelligence')) {
      const iris = new IntelligenceAI(organizationId, executiveId);

      switch (action) {
        case 'analyze_situation':
        case 'generate_recommendation':
          return iris.generateIntelligenceReport('daily');

        case 'synthesize_departments':
          return iris.generateIntelligenceReport('weekly');

        default:
          return iris.detectAnomalies();
      }
    }

    // Generic fallback
    console.log(`[ExecutiveWorker] No specific handler for ${exec.name}/${action} — acknowledged`);
    return { action, executiveId, topic, organizationId, status: 'acknowledged' };
  }
}
