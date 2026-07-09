/**
 * Atlas OS — Redis Infrastructure barrel export
 */

export { redisClient, redis, createRedisConnection } from './RedisClient.js';
export { RedisHealth } from './RedisHealth.js';
export { getRedisConfig } from './RedisConfig.js';
export type { RedisConfig } from './RedisConfig.js';
export type { RedisHealthReport, RedisHealthStatus } from './RedisHealth.js';
