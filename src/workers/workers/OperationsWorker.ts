/**
 * Atlas OS — Operations Worker
 *
 * Executes autonomous Operations AI operations via BullMQ.
 * Dispatches to Orion (OperationsAI) for all operations actions.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type OperationsJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';
import { OperationsAI } from '../../services/executives/OperationsAI.js';

export class OperationsWorker extends BaseWorker<OperationsJobPayload> {
  constructor() {
    super('OperationsWorker', QUEUE_NAMES.OPERATIONS);
  }

  protected validate(payload: OperationsJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: OperationsJobPayload,
    _job: Job<OperationsJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, context } = payload;

    const exec = await prisma.aIExecutive.findFirst({
      where: { organizationId, name: { contains: 'Orion', mode: 'insensitive' } },
    });
    if (!exec) throw new Error('OperationsAI (Orion) not provisioned for this organization.');

    const orion = new OperationsAI(organizationId, exec.id);

    switch (action) {
      case 'analyze_ops':
      case 'run_health_check':
        return orion.generateOperationalReport();

      case 'audit_workflow': {
        const processName = (context?.processName as string) ?? 'General Workflow';
        const steps = (context?.steps as string[]) ?? ['Intake', 'Review', 'Approve', 'Execute'];
        return orion.auditProcess({
          processName,
          currentSteps: steps,
          frequency: (context?.frequency as string) ?? 'Daily',
          timeSpent: (context?.timeSpent as string) ?? 'Unknown',
          painPoints: (context?.painPoints as string[]) ?? [],
        });
      }

      default:
        console.log(`[OperationsWorker] Unknown action "${action}" — acknowledged`);
        return { action, organizationId, status: 'acknowledged' };
    }
  }
}
