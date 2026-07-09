/**
 * Atlas OS — Redis Configuration
 *
 * Typed configuration for Redis connections used throughout Atlas.
 * All Redis settings are centralized here — no magic strings elsewhere.
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db: number;
  tls: boolean;
  /** Maximum number of connection retries before giving up */
  maxRetriesPerRequest: number | null;
  /** Enable read-from-replica for scaling */
  enableReadyCheck: boolean;
  /** Lazy connection — don't connect until first command */
  lazyConnect: boolean;
  /** Keep-alive in milliseconds */
  keepAlive: number;
  /** Connection name shown in Redis CLIENT LIST */
  connectionName: string;
  /** Retry strategy timing */
  retry: {
    maxAttempts: number;
    minDelayMs: number;
    maxDelayMs: number;
    factor: number;
  };
}

function parseRedisUrl(url: string): Partial<RedisConfig> {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname,
      port: parseInt(parsed.port || '6379', 10),
      password: parsed.password || undefined,
      username: parsed.username || undefined,
      tls: parsed.protocol === 'rediss:',
    };
  } catch {
    return {};
  }
}

/**
 * Build the Redis config from environment variables.
 * Priority: REDIS_URL > individual REDIS_HOST / REDIS_PORT / REDIS_PASSWORD vars.
 */
export function getRedisConfig(): RedisConfig {
  const fromUrl = process.env.REDIS_URL ? parseRedisUrl(process.env.REDIS_URL) : {};

  return {
    host: fromUrl.host ?? process.env.REDIS_HOST ?? '127.0.0.1',
    port: fromUrl.port ?? parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: fromUrl.password ?? process.env.REDIS_PASSWORD ?? undefined,
    username: fromUrl.username ?? process.env.REDIS_USERNAME ?? undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
    tls: fromUrl.tls ?? process.env.REDIS_TLS === 'true',
    maxRetriesPerRequest: null, // Required by BullMQ — never retry commands
    enableReadyCheck: false,    // Required by BullMQ
    lazyConnect: true,
    keepAlive: 30000,
    connectionName: 'atlas-os',
    retry: {
      maxAttempts: parseInt(process.env.REDIS_MAX_RETRY_ATTEMPTS ?? '20', 10),
      minDelayMs: 250,
      maxDelayMs: 30000,
      factor: 2,
    },
  };
}
