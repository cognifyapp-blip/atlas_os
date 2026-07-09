/**
 * Atlas OS — Sync Worker
 *
 * Handles initial and incremental data synchronization from external providers
 * into Atlas PostgreSQL. Delegates to the provider's SyncEngine.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type SyncJobPayload, type JobResult } from '../../infrastructure/queue/types.js';

export class SyncWorker extends BaseWorker<SyncJobPayload> {
  constructor() {
    super('SyncWorker', QUEUE_NAMES.SYNC);
  }

  protected validate(payload: SyncJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.provider) throw new Error('provider is required');
    if (!payload.integrationId) throw new Error('integrationId is required');
    if (!payload.mode) throw new Error('sync mode is required');
  }

  protected async process(
    payload: SyncJobPayload,
    _job: Job<SyncJobPayload, JobResult>,
  ): Promise<unknown> {
    const { provider, integrationId, mode, organizationId, correlationId, entityType } = payload;

    console.log(
      JSON.stringify({
        level: 'info',
        worker: 'SyncWorker',
        provider,
        integrationId,
        mode,
        entityType,
        organizationId,
        correlationId,
        message: `Sync ${mode} for ${provider} / ${entityType ?? 'all'}`,
      }),
    );

    try {
      const { syncEngine } = await import('../../integrations/SyncEngine.js');
      return await syncEngine.run(payload);
    } catch (err: any) {
      console.warn(
        `[SyncWorker] Sync engine not ready for provider "${provider}": ${err.message}`,
      );
      return { skipped: true, reason: err.message };
    }
  }
}
