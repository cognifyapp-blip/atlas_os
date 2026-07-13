/**
 * Prisma client singleton — Prisma 7 driver adapter mode.
 *
 * Prisma 7 removed the embedded query engine binary. Connections now go
 * through a driver adapter. We use @prisma/adapter-pg with the standard
 * `pg` pool — no Prisma Accelerate required.
 *
 * The pool is shared across the process lifetime. In development, the
 * globalThis guard prevents HMR from creating duplicate pools.
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'Add it to your Railway Variables (or .env.local for local dev).',
  );
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
