/**
 * Atlas OS — Sync Engine
 *
 * Orchestrates data synchronization between external providers and Atlas.
 * Routes sync jobs to the correct provider via the Integration Registry.
 *
 * The Sync Engine is called by SyncWorker — it never runs directly inside
 * an HTTP request.
 */

import { integrationRegistry } from './IntegrationRegistry.js';
import type { SyncJobPayload } from '../infrastructure/queue/types.js';
import type { SyncResult } from './types.js';

class AtlasSyncEngine {
  private static _instance: AtlasSyncEngine | null = null;

  private constructor() {}

  static getInstance(): AtlasSyncEngine {
    if (!AtlasSyncEngine._instance) {
      AtlasSyncEngine._instance = new AtlasSyncEngine();
    }
    return AtlasSyncEngine._instance;
  }

  /**
   * Run a sync job dispatched by the SyncWorker.
   * Routes to the correct provider and sync mode.
   */
  async run(job: SyncJobPayload): Promise<SyncResult> {
    const { provider, integrationId, mode, organizationId, correlationId, entityType, cursor } = job;

    console.log(
      JSON.stringify({
        level: 'info',
        component: 'SyncEngine',
        provider,
        integrationId,
        mode,
        entityType,
        organizationId,
        correlationId,
        message: `Starting ${mode} sync for ${provider}`,
      }),
    );

    const integration = integrationRegistry.get(provider);
    const start = Date.now();

    switch (mode) {
      case 'initial':
        return integration.initialSync(organizationId, integrationId);

      case 'incremental':
        return integration.incrementalSync(organizationId, integrationId, cursor);

      case 'full':
        // Full re-sync: delegate to initialSync but log separately
        console.log(
          JSON.stringify({
            level: 'info',
            component: 'SyncEngine',
            message: `Full re-sync triggered for ${provider}`,
            organizationId,
          }),
        );
        return integration.initialSync(organizationId, integrationId);

      default:
        throw new Error(`Unknown sync mode: "${mode}"`);
    }
  }
}

export const syncEngine = AtlasSyncEngine.getInstance();
