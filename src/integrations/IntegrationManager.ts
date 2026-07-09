/**
 * Atlas OS — Integration Manager
 *
 * Top-level orchestrator for all integration operations.
 *
 * This is the primary entry point for integration-related actions:
 *  - Routes webhook events to the correct provider
 *  - Enqueues sync jobs when webhooks require data reconciliation
 *  - Manages connect/disconnect flows
 *  - Exposes health status for all registered integrations
 *
 * Architecture:
 *   HTTP Route → queueManager.enqueueIntegration()
 *     → IntegrationWorker → IntegrationManager.handleEvent()
 *       → IntegrationRegistry.get(provider) → Provider.receiveWebhook() / connect() / etc.
 *         → queueManager.enqueueSync() → SyncWorker → SyncEngine → PostgreSQL
 */

import { integrationRegistry } from './IntegrationRegistry.js';
import { queueManager } from '../infrastructure/queue/QueueManager.js';
import type { IntegrationEventContext, IntegrationHealthReport } from './types.js';
import type { IntegrationJobPayload } from '../infrastructure/queue/types.js';
import { v4 as uuidv4 } from 'uuid';

// ─── IntegrationManager ────────────────────────────────────────────────────────

class AtlasIntegrationManager {
  private static _instance: AtlasIntegrationManager | null = null;

  private constructor() {}

  static getInstance(): AtlasIntegrationManager {
    if (!AtlasIntegrationManager._instance) {
      AtlasIntegrationManager._instance = new AtlasIntegrationManager();
    }
    return AtlasIntegrationManager._instance;
  }

  /**
   * Route an integration event to the correct provider handler.
   * Called by IntegrationWorker.
   */
  async handleEvent(payload: IntegrationJobPayload): Promise<unknown> {
    const { provider, event, organizationId, integrationId, webhookData, correlationId, userId } = payload;

    if (!integrationRegistry.has(provider)) {
      throw new Error(
        `[IntegrationManager] No provider registered for "${provider}". ` +
          `Available: ${integrationRegistry.listNames().join(', ') || 'none'}`,
      );
    }

    const integration = integrationRegistry.get(provider);

    switch (event) {
      case 'webhook': {
        await integration.receiveWebhook({
          provider,
          integrationId,
          organizationId,
          eventType: (webhookData as any)?.type ?? 'unknown',
          rawPayload: webhookData ?? {},
          receivedAt: new Date().toISOString(),
        });

        // Webhooks typically trigger an incremental sync
        if (integrationId) {
          await queueManager.enqueueSync({
            organizationId,
            userId,
            provider,
            integrationId,
            mode: 'incremental',
          });
        }
        return { handled: true, event };
      }

      case 'sync': {
        if (!integrationId) throw new Error('integrationId required for sync event');
        await queueManager.enqueueSync({
          organizationId,
          userId,
          provider,
          integrationId,
          mode: 'incremental',
        });
        return { queued: true, event: 'sync' };
      }

      case 'health_check': {
        if (!integrationId) throw new Error('integrationId required for health_check');
        return integration.healthCheck(organizationId, integrationId);
      }

      case 'disconnect': {
        if (!integrationId) throw new Error('integrationId required for disconnect');
        await integration.disconnect(organizationId, integrationId);
        return { disconnected: true };
      }

      default:
        throw new Error(`[IntegrationManager] Unknown event "${event}" for provider "${provider}"`);
    }
  }

  /**
   * Trigger an initial full sync for a newly connected integration.
   * Call this after a successful OAuth connect.
   */
  async triggerInitialSync(
    organizationId: string,
    userId: string,
    provider: string,
    integrationId: string,
  ): Promise<void> {
    await queueManager.enqueueSync({
      organizationId,
      userId,
      provider,
      integrationId,
      mode: 'initial',
    });

    console.log(
      JSON.stringify({
        level: 'info',
        component: 'IntegrationManager',
        message: `Initial sync queued for ${provider}`,
        organizationId,
        integrationId,
      }),
    );
  }

  /**
   * Get health status for all connected integrations in an organization.
   */
  async getHealthForOrg(
    organizationId: string,
  ): Promise<IntegrationHealthReport[]> {
    const providers = integrationRegistry.listAll();
    const results: IntegrationHealthReport[] = [];

    for (const { name } of providers) {
      try {
        const integration = integrationRegistry.get(name);
        // Health check without an integrationId is a generic connectivity test
        const report = await integration.healthCheck(organizationId, 'generic');
        results.push(report);
      } catch (err: any) {
        results.push({
          provider: name,
          healthy: false,
          checkedAt: new Date().toISOString(),
          error: err.message,
        });
      }
    }

    return results;
  }

  /**
   * List all registered providers with their capabilities.
   */
  listProviders() {
    return integrationRegistry.listAll();
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const integrationManager = AtlasIntegrationManager.getInstance();
