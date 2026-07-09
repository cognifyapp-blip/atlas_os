/**
 * Atlas OS — Workflow Worker
 *
 * Advances BullMQ workflow jobs: marks the current step complete,
 * updates the workflow record in Postgres, and enqueues the next step.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type WorkflowJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';

export class WorkflowWorker extends BaseWorker<WorkflowJobPayload> {
  constructor() {
    super('WorkflowWorker', QUEUE_NAMES.WORKFLOW);
  }

  protected validate(payload: WorkflowJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.workflowId) throw new Error('workflowId is required');
    if (payload.stepIndex === undefined || payload.stepIndex < 0)
      throw new Error('stepIndex must be a non-negative integer');
    if (!payload.stepName) throw new Error('stepName is required');
  }

  protected async process(
    payload: WorkflowJobPayload,
    _job: Job<WorkflowJobPayload, JobResult>,
  ): Promise<unknown> {
    const { workflowId, stepIndex, stepName, organizationId } = payload;

    // Load the workflow
    const workflow = await prisma.workflow.findFirst({
      where: { id: workflowId, organizationId },
      include: { steps: { orderBy: { order: 'asc' } } },
    });

    if (!workflow) {
      console.warn(`[WorkflowWorker] Workflow ${workflowId} not found — skipping.`);
      return { workflowId, stepIndex, status: 'skipped', reason: 'workflow_not_found' };
    }

    // Mark current step complete
    const currentStep = workflow.steps[stepIndex];
    if (currentStep) {
      await prisma.workflowStep.update({
        where: { id: currentStep.id },
        data: { status: 'completed', completedAt: new Date(), updatedAt: new Date() },
      });
    }

    const nextIndex = stepIndex + 1;
    const isLastStep = nextIndex >= workflow.steps.length;

    // Advance workflow state
    await prisma.workflow.update({
      where: { id: workflowId },
      data: {
        currentStepIndex: nextIndex,
        status: isLastStep ? 'completed' : 'active',
        completedAt: isLastStep ? new Date() : null,
        updatedAt: new Date(),
      },
    });

    // Start next step
    if (!isLastStep) {
      const nextStep = workflow.steps[nextIndex];
      if (nextStep) {
        await prisma.workflowStep.update({
          where: { id: nextStep.id },
          data: { status: 'in_progress', startedAt: new Date(), updatedAt: new Date() },
        });
      }
    }

    return {
      workflowId,
      stepIndex,
      stepName,
      nextStep: isLastStep ? null : workflow.steps[nextIndex]?.name,
      status: isLastStep ? 'workflow_complete' : 'step_complete',
    };
  }
}
