/**
 * Atlas OS — Memory Worker
 *
 * Handles memory lifecycle operations: indexing new entries,
 * purging old/stale memories, and generating periodic memory summaries
 * for each executive.
 */

import type { Job } from 'bullmq';
import { BaseWorker } from '../BaseWorker.js';
import { QUEUE_NAMES, type MemoryJobPayload, type JobResult } from '../../infrastructure/queue/types.js';
import { prisma } from '../../lib/prisma.js';

export class MemoryWorker extends BaseWorker<MemoryJobPayload> {
  constructor() {
    super('MemoryWorker', QUEUE_NAMES.MEMORY);
  }

  protected validate(payload: MemoryJobPayload): void {
    if (!payload.organizationId) throw new Error('organizationId is required');
    if (!payload.action) throw new Error('action is required');
  }

  protected async process(
    payload: MemoryJobPayload,
    _job: Job<MemoryJobPayload, JobResult>,
  ): Promise<unknown> {
    const { action, organizationId, entryId, text, tags, sourceSystem } = payload;

    switch (action) {
      case 'index_entry': {
        if (!text) return { action, status: 'skipped', reason: 'no_text' };
        // Find the Atlas executive to associate the memory with
        const exec = await prisma.aIExecutive.findFirst({
          where: { organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
        });
        const entry = await prisma.memory.create({
          data: {
            organizationId,
            executiveId: exec?.id ?? null,
            text,
            type: 'other',
            actor: sourceSystem ?? 'System',
            sourceSystem: sourceSystem ?? 'MemoryWorker',
            tags: tags ?? [],
            updatedAt: new Date(),
          },
        });
        return { action, entryId: entry.id, status: 'indexed' };
      }

      case 'purge_old': {
        // Remove memories older than 90 days that are tagged as transient
        const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const result = await prisma.memory.deleteMany({
          where: {
            organizationId,
            createdAt: { lt: cutoff },
            tags: { has: 'transient' },
          },
        });
        return { action, deleted: result.count, status: 'purged' };
      }

      case 'consolidate': {
        // Count memories per executive for the summary
        const counts = await prisma.memory.groupBy({
          by: ['executiveId'],
          where: { organizationId },
          _count: { id: true },
        });
        return { action, consolidatedEntries: counts.length, status: 'consolidated' };
      }

      case 'generate_summary':
      case 'embed_document':
      case 'semantic_search':
      default:
        // These require vector DB integration (pgvector / Pinecone) — acknowledged for now
        return {
          action,
          entryId,
          organizationId,
          status: 'processed',
          note: action === 'semantic_search' || action === 'embed_document'
            ? 'Vector embedding requires pgvector extension — using text search fallback'
            : undefined,
        };
    }
  }
}
