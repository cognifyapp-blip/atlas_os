/**
 * Atlas OS — Report Worker
 *
 * Generates and dispatches executive reports via the AI executive services.
 * Routes each report type to the correct executive.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type ReportJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { CEOAssistant } from '../../services/executives/CEOAssistant.js';
import { FinanceAI } from '../../services/executives/FinanceAI.js';
import { SalesAI } from '../../services/executives/SalesAI.js';
import { IntelligenceAI } from '../../services/executives/IntelligenceAI.js';
import { OperationsAI } from '../../services/executives/OperationsAI.js';

export class ReportWorker extends BaseWorker<ReportJobPayload> {
  constructor() {
    super('ReportWorker', QUEUE_NAMES.REPORT);
  }

  protected validate(payload: ReportJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.reportType) throw new Error('reportType is required');
  }

  protected async process(
    payload: ReportJobPayload,
    _job: Job<ReportJobPayload, JobResult>,
  ): Promise<unknown> {
    const { reportType, organizationId } = payload;

    const getExec = async (name: string) => {
      const exec = await prisma.aIExecutive.findFirst({
        where: { organizationId, name: { contains: name, mode: 'insensitive' } },
      });
      if (!exec) throw new Error(`${name} not provisioned.`);
      return exec;
    };

    switch (reportType) {
      case 'boardroom':
      case 'executive_summary': {
        const exec = await getExec('Atlas');
        const atlas = new CEOAssistant(organizationId, exec.id);
        return atlas.generateBoardReport();
      }

      case 'financial': {
        const exec = await getExec('Aurelia');
        const aurelia = new FinanceAI(organizationId, exec.id);
        return aurelia.generateFinancialHealthReport();
      }

      case 'sales_pipeline': {
        const exec = await getExec('Zephyr');
        const zephyr = new SalesAI(organizationId, exec.id);
        return zephyr.generatePipelineReport();
      }

      case 'operations': {
        const exec = await getExec('Orion');
        const orion = new OperationsAI(organizationId, exec.id);
        return orion.generateOperationalReport();
      }

      case 'ai_workforce':
      case 'custom': {
        const exec = await getExec('Iris');
        const iris = new IntelligenceAI(organizationId, exec.id);
        return iris.generateIntelligenceReport('weekly');
      }

      default:
        console.log(`[ReportWorker] Unknown report type "${reportType}" — acknowledged`);
        return { reportType, organizationId, status: 'acknowledged', generatedAt: new Date().toISOString() };
    }
  }
}
