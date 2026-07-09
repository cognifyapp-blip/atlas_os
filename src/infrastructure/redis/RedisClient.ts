/**
 * Atlas OS — Redis Client
 *
 * Singleton Redis client used by BullMQ, caching, and pub/sub throughout Atlas.
 *
 * Architecture:
 *  - Single shared client for general-purpose operations
 *  - Separate subscriber client for pub/sub (Redis requirement)
 *  - Connection factory for BullMQ (each Queue/Worker needs its own connection)
 *  - All clients share the same configuration
 *
 * BullMQ note: BullMQ requires maxRetriesPerRequest=null and
 * enableReadyCheck=false — both set in RedisConfig.
 */

import Redis, { type RedisOptions } from 'ioredis';
import { getRedisConfig, type RedisConfig } from './RedisConfig.js';

// ─── Retry Strategy ────────────────────────────────────────────────────────────

function buildRetryStrategy(cfg: RedisConfig) {
  return (times: number): number | null => {
    if (times >= cfg.retry.maxAttempts) {
      console.error(
        `[RedisClient] Max reconnect attempts (${cfg.retry.maxAttempts}) reached. Giving up.`,
      );
      return null; // Stop retrying
    }
    const delay = Math.min(
      cfg.retry.minDelayMs * Math.pow(cfg.retry.factor, times - 1),
      cfg.retry.maxDelayMs,
    );
    console.warn(`[RedisClient] Reconnecting (attempt ${times})… next retry in ${delay}ms`);
    return delay;
  };
}

// ─── Connection builder ────────────────────────────────────────────────────────

function buildOptions(cfg: RedisConfig): RedisOptions {
  return {
    host: cfg.host,
    port: cfg.port,
    password: cfg.password,
    username: cfg.username,
    db: cfg.db,
    tls: cfg.tls ? {} : undefined,
    maxRetriesPerRequest: cfg.maxRetriesPerRequest,
    enableReadyCheck: cfg.enableReadyCheck,
    lazyConnect: cfg.lazyConnect,
    keepAlive: cfg.keepAlive,
    connectionName: cfg.connectionName,
    retryStrategy: buildRetryStrategy(cfg),
  };
}

// ─── AtlasRedisClient ──────────────────────────────────────────────────────────

class AtlasRedisClient {
  private static _instance: AtlasRedisClient | null = null;

  private _client: Redis | null = null;
  private _subscriber: Redis | null = null;
  private readonly _config: RedisConfig;

  private constructor() {
    this._config = getRedisConfig();
  }

  static getInstance(): AtlasRedisClient {
    if (!AtlasRedisClient._instance) {
      AtlasRedisClient._instance = new AtlasRedisClient();
    }
    return AtlasRedisClient._instance;
  }

  /**
   * Get or create the shared general-purpose Redis client.
   * This is NOT suitable for BullMQ — use createConnection() instead.
   */
  getClient(): Redis {
    if (!this._client) {
      this._client = new Redis(buildOptions(this._config));
      this._attachEvents(this._client, 'client');
    }
    return this._client;
  }

  /**
   * Get or create the shared subscriber client.
   * Subscriber clients cannot run other commands — dedicated client required.
   */
  getSubscriber(): Redis {
    if (!this._subscriber) {
      this._subscriber = new Redis(buildOptions(this._config));
      this._attachEvents(this._subscriber, 'subscriber');
    }
    return this._subscriber;
  }

  /**
   * Create a fresh, independent connection for BullMQ.
   * BullMQ mandates that each Queue and Worker gets its own connection.
   * Callers are responsible for closing these when done.
   */
  createConnection(): Redis {
    const opts = buildOptions(this._config);
    const conn = new Redis(opts);
    this._attachEvents(conn, 'bullmq-connection');
    return conn;
  }

  /**
   * Gracefully close all managed connections.
   * Call this on process shutdown (SIGTERM/SIGINT).
   */
  async disconnect(): Promise<void> {
    const tasks: Promise<void>[] = [];

    if (this._client) {
      tasks.push(
        this._client.quit().then(() => {
          console.log('[RedisClient] General client disconnected.');
          this._client = null;
        }),
      );
    }

    if (this._subscriber) {
      tasks.push(
        this._subscriber.quit().then(() => {
          console.log('[RedisClient] Subscriber client disconnected.');
          this._subscriber = null;
        }),
      );
    }

    await Promise.allSettled(tasks);
  }

  /**
   * Ping Redis to verify connectivity.
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.getClient().ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  getConfig(): RedisConfig {
    return { ...this._config };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _attachEvents(client: Redis, label: string): void {
    client.on('connect', () =>
      console.log(`[RedisClient:${label}] Connected to ${this._config.host}:${this._config.port}`),
    );
    client.on('ready', () =>
      console.log(`[RedisClient:${label}] Ready.`),
    );
    client.on('error', (err) =>
      console.error(`[RedisClient:${label}] Error:`, err.message),
    );
    client.on('close', () =>
      console.warn(`[RedisClient:${label}] Connection closed.`),
    );
    client.on('reconnecting', (delay: number) =>
      console.warn(`[RedisClient:${label}] Reconnecting in ${delay}ms…`),
    );
    client.on('end', () =>
      console.log(`[RedisClient:${label}] Connection ended.`),
    );
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────

/** Singleton access to the Atlas Redis client manager */
export const redisClient = AtlasRedisClient.getInstance();

/** Convenience: shared general-purpose Redis instance */
export const redis = () => redisClient.getClient();

/** Convenience: create a BullMQ-compatible connection */
export const createRedisConnection = () => redisClient.createConnection();
