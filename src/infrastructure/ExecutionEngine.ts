/**
 * Atlas OS — Execution Engine Bootstrap
 *
 * Single call to boot the entire Atlas background infrastructure:
 *  1. Initialize QueueManager (creates all BullMQ queues)
 *  2. Register all integration providers
 *  3. Start all workers
 *  4. Initialize QueueEvents listeners
 *  5. Register graceful shutdown hooks
 *
 * Usage in server.ts:
 *   import { executionEngine } from './src/infrastructure/ExecutionEngine.js'
 *   await executionEngine.start()
 *
 * The engine runs independently of HTTP — even if the HTTP server crashes,
 * workers continue processing queued jobs.
 */

import { queueManager } from './queue/QueueManager.js';
import { queueEvents } from './queue/QueueEvents.js';
import { workerManager } from '../workers/WorkerManager.js';
import { integrationRegistry } from '../integrations/IntegrationRegistry.js';

// Import all provider stubs for auto-registration
import { HubSpotIntegration } from '../integrations/providers/HubSpot/index.js';
import { QuickBooksIntegration } from '../integrations/providers/QuickBooks/index.js';
import { GoogleIntegration } from '../integrations/providers/Google/index.js';
import { SlackIntegration } from '../integrations/providers/Slack/index.js';
import { TeamsIntegration } from '../integrations/providers/Teams/index.js';

class AtlasExecutionEngine {
  private static _instance: AtlasExecutionEngine | null = null;
  private _running = false;

  private constructor() {}

  static getInstance(): AtlasExecutionEngine {
    if (!AtlasExecutionEngine._instance) {
      AtlasExecutionEngine._instance = new AtlasExecutionEngine();
    }
    return AtlasExecutionEngine._instance;
  }

  /**
   * Start the full Atlas Execution Engine.
   * Safe to call multiple times — idempotent.
   */
  async start(): Promise<void> {
    if (this._running) {
      console.log('[ExecutionEngine] Already running.');
      return;
    }

    console.log('[ExecutionEngine] Starting Atlas Execution Engine…');

    try {
      // Step 1: Initialize all BullMQ queues
      queueManager.initialize();

      // Step 2: Register all integration providers
      this._registerProviders();

      // Step 3: Start QueueEvents listeners (cross-process observability)
      queueEvents.initialize();

      // Step 4: Start all workers
      workerManager.start();

      // Step 5: Register graceful shutdown
      this._registerShutdownHooks();

      this._running = true;
      console.log('[ExecutionEngine] Atlas Execution Engine is running.');
    } catch (err: any) {
      console.error('[ExecutionEngine] Failed to start:', err.message);
      throw err;
    }
  }

  /**
   * Gracefully stop all workers and close all queue connections.
   */
  async stop(): Promise<void> {
    if (!this._running) return;

    console.log('[ExecutionEngine] Graceful shutdown initiated…');

    await workerManager.stop();
    await queueEvents.shutdown();
    await queueManager.shutdown();

    this._running = false;
    console.log('[ExecutionEngine] Shutdown complete.');
  }

  isRunning(): boolean {
    return this._running;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private _registerProviders(): void {
    const providers = [
      new HubSpotIntegration(),
      new QuickBooksIntegration(),
      new GoogleIntegration(),
      new SlackIntegration(),
      new TeamsIntegration(),
    ];

    for (const provider of providers) {
      integrationRegistry.register(provider);
    }

    console.log(
      `[ExecutionEngine] Registered ${providers.length} integration providers: ` +
        providers.map((p) => p.name).join(', '),
    );
  }

  private _registerShutdownHooks(): void {
    const shutdown = async (signal: string) => {
      console.log(`[ExecutionEngine] Received ${signal} — shutting down…`);
      await this.stop();
      process.exit(0);
    };

    // Only register once
    if (!process.listenerCount('SIGTERM')) {
      process.on('SIGTERM', () => shutdown('SIGTERM'));
    }
    if (!process.listenerCount('SIGINT')) {
      process.on('SIGINT', () => shutdown('SIGINT'));
    }

    process.on('unhandledRejection', (reason) => {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'unhandledRejection',
          reason: String(reason),
          ts: new Date().toISOString(),
        }),
      );
      // Don't crash the process — workers must stay alive
    });

    process.on('uncaughtException', (err) => {
      console.error(
        JSON.stringify({
          level: 'error',
          event: 'uncaughtException',
          error: err.message,
          stack: err.stack,
          ts: new Date().toISOString(),
        }),
      );
      // Don't crash on non-fatal errors
    });
  }
}

export const executionEngine = AtlasExecutionEngine.getInstance();
