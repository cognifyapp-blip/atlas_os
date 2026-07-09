/**
 * Atlas OS — Finance Worker
 *
 * Executes autonomous Finance AI operations via BullMQ.
 * Dispatches to Aurelia (FinanceAI) for all financial actions.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type FinanceJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { FinanceAI } from '../../services/executives/FinanceAI.js';
import { eventBus } from '../../services/EventBus.js';

export class FinanceWorker extends BaseWorker<FinanceJobPayload> {
  constructor() {
    super('FinanceWorker', QUEUE_NAMES.FINANCE);
  }

  protected validate(payload: FinanceJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: FinanceJobPayload,
    _job: Job<FinanceJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, invoiceId, context } = payload;

    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Aurelia', mode: 'insensitive' } },
    });
    if (!exec) throw new Error('FinanceAI (Aurelia) not provisioned for this organization.');

    const aurelia = new FinanceAI(organizationId, exec.id);

    switch (action) {
      case 'generate_report':
        return aurelia.generateFinancialHealthReport();

      case 'analyze_cashflow': {
        const months = (context?.months as number) ?? 6;
        return aurelia.forecastCashFlow(months);
      }

      case 'forecast_revenue': {
        const months = (context?.months as number) ?? 6;
        return aurelia.forecastCashFlow(months);
      }

      case 'generate_invoice': {
        if (!invoiceId) throw new Error('invoiceId (proposalId) required for generate_invoice');
        return aurelia.generateInvoice(invoiceId);
      }

      default:
        console.log(`[FinanceWorker] Unknown action "${action}" — acknowledged`);
        return { action, organizationId, status: 'acknowledged' };
    }
  }
}
