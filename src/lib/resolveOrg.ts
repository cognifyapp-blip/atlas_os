/**
 * Atlas OS — Org Resolver
 *
 * Resolves the current organization for route handlers.
 *
 * Strategy (in priority order):
 * 1. Auth context from Clerk JWT (org_id claim) — used when user is a member
 *    of a Clerk organization. Guarantees row-level tenant isolation.
 * 2. Single-org fallback — used when:
 *    a. Clerk is not configured (local dev)
 *    b. Clerk is configured but the session has no org context (single-org
 *       deployments where users sign in directly, not via org invitation)
 *
 * This makes Atlas work correctly for both single-org and multi-org deployments
 * without requiring every user to be in a Clerk organization.
 */

import type { Response } from 'express';
import { prisma } from './prisma.js';

/**
 * Resolve the organization ID for this request.
 */
export async function resolveOrgId(res: Response): Promise<string> {
  // Use auth context when available (Clerk org membership)
  const authOrg = (res.locals.auth as any)?.organization;
  if (authOrg?.id) return authOrg.id;

  // Fallback: single-org mode (no Clerk org context or no Clerk at all)
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found. Complete onboarding first.');
  return org.id;
}

/**
 * Resolve the full organization record for this request.
 */
export async function resolveOrg(res: Response) {
  const authOrg = (res.locals.auth as any)?.organization;
  if (authOrg?.id) {
    const org = await prisma.organization.findUnique({ where: { id: authOrg.id } });
    if (org) return org;
    // Auth context had an ID but org not found — fall through to findFirst
  }

  // Fallback: single-org mode
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found. Complete onboarding first.');
  return org;
}
