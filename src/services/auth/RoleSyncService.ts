/**
 * Atlas OS — RoleSyncService
 *
 * Responsible for reading Clerk roles and keeping Atlas memberships
 * in sync with the authoritative Clerk role assignments.
 *
 * Clerk is the source of truth for role assignments.
 * Atlas maps those roles into its own MemberRole enum and stores them
 * on the membership record in PostgreSQL.
 *
 * Clerk role → Atlas MemberRole mapping:
 *
 *   Clerk key          → Atlas role
 *   ─────────────────────────────────
 *   org:owner          → OWNER
 *   org:admin          → ADMIN
 *   org:executive      → EXECUTIVE
 *   org:manager        → MANAGER
 *   org:employee       → EMPLOYEE
 *   org:member         → MEMBER  (legacy fallback)
 *   org:viewer         → VIEWER
 *   basic_member       → MEMBER  (Clerk default)
 *   guest_member       → VIEWER
 *   (unknown)          → EMPLOYEE (safe default)
 */

import { prisma } from '../../lib/prisma.js';
import { MemberRole, AuthError } from './types.js';

// ─── Role mapping ─────────────────────────────────────────────────────────────

/**
 * Canonical Clerk role key → Atlas MemberRole mapping.
 * Clerk sends role keys like "org:admin" or "basic_member" in webhooks and
 * session tokens. We normalise them here so no other code ever sees Clerk's
 * naming conventions.
 */
const CLERK_ROLE_MAP: Record<string, MemberRole> = {
  // Explicit org-namespaced keys (Clerk v5+)
  'org:owner': 'OWNER',
  'org:admin': 'ADMIN',
  'org:executive': 'EXECUTIVE',
  'org:manager': 'MANAGER',
  'org:employee': 'EMPLOYEE',
  'org:member': 'MEMBER',
  'org:viewer': 'VIEWER',

  // Legacy / Clerk default keys
  owner: 'OWNER',
  admin: 'ADMIN',
  executive: 'EXECUTIVE',
  manager: 'MANAGER',
  employee: 'EMPLOYEE',
  member: 'MEMBER',
  viewer: 'VIEWER',
  basic_member: 'MEMBER',
  guest_member: 'VIEWER',
};

/** Default role when the Clerk key is unrecognised. */
const DEFAULT_ROLE: MemberRole = 'EMPLOYEE';

// ─── RoleSyncService ──────────────────────────────────────────────────────────

export class RoleSyncService {
  /**
   * Map a Clerk role key to the corresponding Atlas MemberRole.
   * Returns DEFAULT_ROLE for unknown keys rather than throwing, so new
   * Clerk roles don't break existing users.
   */
  static toAtlasRole(clerkRole: string): MemberRole {
    if (!clerkRole) return DEFAULT_ROLE;
    const normalized = clerkRole.toLowerCase().trim();
    return CLERK_ROLE_MAP[normalized] ?? DEFAULT_ROLE;
  }

  /**
   * Update the role on an existing membership record.
   * Called when Clerk fires an organizationMembership.updated event,
   * or when an admin changes a member's role via the Clerk dashboard.
   *
   * Scoped by (clerkUserId, clerkOrgId) so there's no risk of updating
   * the wrong tenant's record.
   */
  static async updateMembershipRole(
    clerkUserId: string,
    clerkOrgId: string,
    clerkRole: string,
  ): Promise<void> {
    const [user, org] = await Promise.all([
      prisma.user.findUnique({ where: { externalId: clerkUserId } }),
      prisma.organization.findUnique({ where: { externalId: clerkOrgId } }),
    ]);

    if (!user || !org) {
      // Either side hasn't been synced yet — not an error, will reconcile
      // when the missing entity's webhook arrives.
      console.warn(
        `[RoleSyncService] Skipping role update — ` +
          `user (${clerkUserId}) or org (${clerkOrgId}) not yet in Atlas.`,
      );
      return;
    }

    const atlasRole = RoleSyncService.toAtlasRole(clerkRole);

    await prisma.membership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: org.id,
        },
      },
      create: {
        userId: user.id,
        organizationId: org.id,
        role: atlasRole,
      },
      update: { role: atlasRole },
    });

    console.log(
      `[RoleSyncService] Role synced: ${user.email} → ${atlasRole} in "${org.name}"`,
    );
  }

  /**
   * Sync all memberships for a given Clerk organization.
   * Fetches the live member list from Clerk and reconciles it with Atlas.
   *
   * Useful for:
   *  - Initial import when an org is first connected to Clerk
   *  - Periodic reconciliation jobs (BullMQ, cron)
   *  - Admin-triggered "re-sync" operations
   */
  static async syncAllMemberships(clerkOrgId: string): Promise<void> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new AuthError(
        'CLERK_SECRET_KEY is not set — cannot sync memberships from Clerk.',
        'ROLE_SYNC_FAILED',
      );
    }

    // @ts-ignore — @clerk/backend optional peer dep
    const { createClerkClient } = await import('@clerk/backend');
    const clerk = createClerkClient({ secretKey });

    const org = await prisma.organization.findUnique({
      where: { externalId: clerkOrgId },
    });
    if (!org) {
      throw new AuthError(
        `Organization with Clerk ID "${clerkOrgId}" not found in Atlas.`,
        'ORG_NOT_FOUND',
      );
    }

    // Paginate through all memberships in the Clerk org
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore) {
      const memberships = await clerk.organizations.getOrganizationMembershipList({
        organizationId: clerkOrgId,
        limit,
        offset,
      });

      for (const membership of memberships.data) {
        const clerkUserId = membership.publicUserData?.userId;
        if (!clerkUserId) continue;

        await RoleSyncService.updateMembershipRole(
          clerkUserId,
          clerkOrgId,
          membership.role,
        );
      }

      hasMore = memberships.data.length === limit;
      offset += limit;
    }

    console.log(
      `[RoleSyncService] Full membership sync complete for org "${org.name}" (${clerkOrgId})`,
    );
  }

  /**
   * Return the Atlas role for the current user in a given org by looking
   * up the live membership record in Clerk.
   *
   * Used by AuthService.fromToken() when a fresh role check is needed
   * (e.g. after a role change that hasn't gone through a webhook yet).
   */
  static async getLiveRole(
    clerkUserId: string,
    clerkOrgId: string,
  ): Promise<MemberRole> {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return DEFAULT_ROLE;

    try {
      // @ts-ignore
      const { createClerkClient } = await import('@clerk/backend');
      const clerk = createClerkClient({ secretKey });

      const memberships =
        await clerk.organizations.getOrganizationMembershipList({
          organizationId: clerkOrgId,
        });

      const match = memberships.data.find(
        (m: any) => m.publicUserData?.userId === clerkUserId,
      );

      return match ? RoleSyncService.toAtlasRole(match.role) : DEFAULT_ROLE;
    } catch {
      // Fall back to the stored Atlas role — don't blow up the request
      return DEFAULT_ROLE;
    }
  }
}
