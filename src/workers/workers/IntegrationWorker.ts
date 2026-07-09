/**
 * Atlas OS — Integration Worker
 *
 * Processes integration lifecycle events: connect, disconnect, webhook, health check.
 * Routes to the IntegrationManager for actual provider execution.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type IntegrationJobPayload, type JobResult } from '../../infrastructure/queue/types.js';

export class IntegrationWorker extends BaseWorker<IntegrationJobPayload> {
  constructor() {
    super('IntegrationWorker', QUEUE_NAMES.INTEGRATION);
  }

  protected validate(payload: IntegrationJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.provider) throw new Error('provider is required');
    if (!payload.event) throw new Error('event is required');
  }

  protected async process(
    payload: IntegrationJobPayload,
    _job: Job<IntegrationJobPayload, JobResult>,
  ): Promise<unknown> {
    const { provider, event, organizationId, correlationId } = payload;

    console.log(
      JSON.stringify({
        level: 'info',
        worker: 'IntegrationWorker',
        provider,
        event,
        organizationId,
        correlationId,
        message: `Processing integration event: ${provider}.${event}`,
      }),
    );

    // IntegrationManager handles the actual execution.
    // Lazy import to avoid circular dependencies at startup.
    try {
      const { integrationManager } = await import('../../integrations/IntegrationManager.js');
      return await integrationManager.handleEvent(payload);
    } catch (err: any) {
      // Integration module may not have a provider registered yet — graceful no-op
      console.warn(
        `[IntegrationWorker] No handler for provider "${provider}" event "${event}": ${err.message}`,
      );
      return { skipped: true, reason: err.message };
    }
  }
}
