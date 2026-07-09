/**
 * Atlas OS — Integration Registry
 *
 * Self-updating registry of all available integration providers.
 *
 * Atlas never hardcodes provider names anywhere in the codebase.
 * Providers register themselves; IntegrationManager routes through the registry.
 *
 * Adding a new provider = create a class extending BaseIntegration,
 * then call registry.register(new MyProvider()) at startup.
 */

import type { BaseIntegration } from './BaseIntegration.js';
import type { IntegrationProviderName, IntegrationCapability } from './types.js';

// ─── Registry Entry ───────────────────────────────────────────────────────────

export interface RegistryEntry {
  provider: BaseIntegration;
  registeredAt: Date;
}

// ─── IntegrationRegistry ──────────────────────────────────────────────────────

class AtlasIntegrationRegistry {
  private static _instance: AtlasIntegrationRegistry | null = null;

  private readonly _registry = new Map<IntegrationProviderName, RegistryEntry>();

  private constructor() {}

  static getInstance(): AtlasIntegrationRegistry {
    if (!AtlasIntegrationRegistry._instance) {
      AtlasIntegrationRegistry._instance = new AtlasIntegrationRegistry();
    }
    return AtlasIntegrationRegistry._instance;
  }

  /**
   * Register a provider.
   * Throws if a provider with the same name is already registered.
   */
  register(provider: BaseIntegration): void {
    if (this._registry.has(provider.name)) {
      console.warn(
        `[IntegrationRegistry] Provider "${provider.name}" is already registered. Overwriting.`,
      );
    }
    this._registry.set(provider.name, {
      provider,
      registeredAt: new Date(),
    });
    console.log(`[IntegrationRegistry] Registered provider: "${provider.name}"`);
  }

  /**
   * Get a provider by name.
   * Throws if the provider is not registered.
   */
  get(name: IntegrationProviderName): BaseIntegration {
    const entry = this._registry.get(name);
    if (!entry) {
      throw new Error(
        `[IntegrationRegistry] Provider "${name}" is not registered. ` +
          `Available providers: ${this.listNames().join(', ') || 'none'}`,
      );
    }
    return entry.provider;
  }

  /**
   * Check if a provider is registered.
   */
  has(name: IntegrationProviderName): boolean {
    return this._registry.has(name);
  }

  /**
   * List all registered provider names.
   */
  listNames(): IntegrationProviderName[] {
    return Array.from(this._registry.keys());
  }

  /**
   * List all registered providers with their metadata.
   */
  listAll(): Array<{
    name: string;
    displayName: string;
    capabilities: IntegrationCapability[];
    registeredAt: Date;
  }> {
    return Array.from(this._registry.values()).map((entry) => ({
      name: entry.provider.name,
      displayName: entry.provider.displayName,
      capabilities: entry.provider.capabilities,
      registeredAt: entry.registeredAt,
    }));
  }

  /**
   * Find all providers that support a specific capability.
   */
  withCapability(capability: IntegrationCapability): BaseIntegration[] {
    return Array.from(this._registry.values())
      .filter((entry) => entry.provider.capabilities.includes(capability))
      .map((entry) => entry.provider);
  }

  /**
   * Deregister a provider (for testing / hot-reload scenarios).
   */
  deregister(name: IntegrationProviderName): void {
    this._registry.delete(name);
    console.log(`[IntegrationRegistry] Deregistered provider: "${name}"`);
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const integrationRegistry = AtlasIntegrationRegistry.getInstance();
