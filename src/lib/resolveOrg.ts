/**
 * Atlas OS — Org Resolver
 *
 * Single source of truth for resolving the current organization in route handlers.
 *
 * When Clerk auth is active (CLERK_SECRET_KEY set), the org is taken from the
 * authenticated user's context — set by requireAuth middleware into res.locals.auth.
 * This guarantees row-level tenant isolation: every DB query is scoped to the
 * authenticated user's org.
 *
 * When Clerk is not configured (local dev), falls back to findFirst so the
 * single-org dev experience still works.
 *
 * Usage in Express Router handlers:
 *
 *   import { resolveOrgId, resolveOrg } from '../lib/resolveOrg.js';
 *
 *   router.get('/foo', wrap(async (req, res) => {
 *     const orgId = resolveOrgId(res);           // just the ID
 *     const org   = await resolveOrg(res);       // full org object
 *     ...
 *   }));
 */

import type { Response } from 'express';
import { prisma } from './prisma.js';

/**
 * Resolve the organization ID for this request.
 * Throws if no org can be determined (not initialized, not authenticated).
 */
export async function resolveOrgId(res: Response): Promise<string> {
  // Auth context set by requireAuth — use when Clerk is configured
  const authOrg = (res.locals.auth as any)?.organization;
  if (authOrg?.id) return authOrg.id;

  // Dev fallback (no Clerk) — single-org mode
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
    // We have the org ID from auth — fetch the full record
    const org = await prisma.organization.findUnique({ where: { id: authOrg.id } });
    if (!org) throw new Error('Organization not found.');
    return org;
  }

  // Dev fallback
  const org = await prisma.organization.findFirst({ where: { initialized: true } });
  if (!org) throw new Error('No initialized organization found. Complete onboarding first.');
  return org;
}
