/**
 * Atlas OS — ClerkSyncService
 *
 * Keeps the Atlas PostgreSQL database in sync with Clerk's identity data.
 *
 * This is the ONLY place that reads from Clerk and writes the results to
 * PostgreSQL. Everything else in Atlas reads from Prisma.
 *
 * Called from:
 *  - POST /api/webhooks/clerk  (Clerk fires events here)
 *  - On-demand sync during first login flow
 *
 * Clerk webhook events handled:
 *  - user.created / user.updated / user.deleted
 *  - organization.created / organization.updated / organization.deleted
 *  - organizationMembership.created / .updated / .deleted
 *
 * Error handling:
 *  - Transient DB failures are retried up to MAX_RETRIES times
 *  - Clerk API failures throw AuthError so the webhook route can return 400
 *    and Clerk will retry the delivery
 */

import { prisma } from '../../lib/prisma.js';
import {
  ClerkUserWebhookPayload,
  ClerkOrganizationWebhookPayload,
  ClerkMembershipWebhookPayload,
  AtlasUser,
  AtlasOrganization,
  AtlasMembership,
  AuthError,
} from './types.js';
import { RoleSyncService } from './RoleSyncService.js';
import { AuthService } from './AuthService.js';

// ─── Retry helper ─────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      // Don't retry auth/validation errors — only transient DB/network errors
      if (err instanceof AuthError) throw err;
      if (attempt < MAX_RETRIES) {
        console.warn(
          `[ClerkSyncService] ${label} failed (attempt ${attempt}/${MAX_RETRIES}): ${err.message}. Retrying in ${RETRY_DELAY_MS}ms…`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * attempt));
      }
    }
  }
  throw new AuthError(
    `[ClerkSyncService] ${label} failed after ${MAX_RETRIES} attempts: ${(lastErr as any)?.message}`,
    'SYNC_FAILED',
  );
}

// ─── ClerkSyncService ─────────────────────────────────────────────────────────

export class ClerkSyncService {
  /**
   * Upsert a User row from a Clerk webhook payload.
   * Idempotent — safe to call multiple times.
   */
  static async syncUser(payload: ClerkUserWebhookPayload): Promise<AtlasUser> {
    return withRetry(`syncUser(${payload.id})`, async () => {
      const primaryEmail = payload.email_addresses.find(
        (e) => e.id === payload.primary_email_address_id,
      );
      if (!primaryEmail) {
        throw new AuthError(
          `Clerk user "${payload.id}" has no primary email address.`,
          'SYNC_FAILED',
        );
      }

      const fullName =
        [payload.first_name, payload.last_name].filter(Boolean).join(' ') || null;

      const row = await prisma.user.upsert({
        where: { externalId: payload.id },
        create: {
          externalId: payload.id,
          email: primaryEmail.email_address,
          name: fullName,
          avatarUrl: payload.image_url ?? null,
        },
        update: {
          email: primaryEmail.email_address,
          name: fullName,
          avatarUrl: payload.image_url ?? null,
          updatedAt: new Date(),
        },
      });

      console.log(`[ClerkSyncService] User synced: ${row.email} (${row.id})`);
      return AuthService.toAtlasUser(row);
    });
  }

  /**
   * Delete a User row when the Clerk account is deleted.
   * Memberships are cascade-deleted by the FK constraint.
   */
  static async deleteUser(clerkUserId: string): Promise<void> {
    await prisma.user.deleteMany({ where: { externalId: clerkUserId } });
    console.log(`[ClerkSyncService] User deleted: ${clerkUserId}`);
  }

  /**
   * Upsert an Organization row from a Clerk webhook payload.
   * Idempotent — safe to call multiple times.
   *
   * Stores both the internal Atlas ID and the Clerk external ID.
   * Business data (industry, goals, etc.) is never overwritten here —
   * that's managed by OrganizationService.completeOnboarding().
   */
  static async syncOrganization(
    payload: ClerkOrganizationWebhookPayload,
  ): Promise<AtlasOrganization> {
    return withRetry(`syncOrganization(${payload.id})`, async () => {
      const row = await prisma.organization.upsert({
        where: { externalId: payload.id },
        create: {
          externalId: payload.id,
          name: payload.name,
        },
        update: {
          // Only sync identity-layer fields — never overwrite business data
          name: payload.name,
          updatedAt: new Date(),
        },
      });

      console.log(`[ClerkSyncService] Organization synced: "${row.name}" (${row.id})`);
      return AuthService.toAtlasOrganization(row);
    });
  }

  /**
   * Delete an Organization row when the Clerk org is deleted.
   * Cascade deletes memberships, departments, and AI executives via FK.
   */
  static async deleteOrganization(clerkOrgId: string): Promise<void> {
    await prisma.organization.deleteMany({ where: { externalId: clerkOrgId } });
    console.log(`[ClerkSyncService] Organization deleted: ${clerkOrgId}`);
  }

  /**
   * Upsert a Membership row from a Clerk webhook payload.
   * Resolves both sides of the relationship from their Clerk IDs first.
   *
   * Role is mapped through RoleSyncService so the mapping is consistent
   * whether the call comes from a webhook or a direct API call.
   */
  static async syncMembership(
    payload: ClerkMembershipWebhookPayload,
  ): Promise<AtlasMembership> {
    return withRetry(
      `syncMembership(user=${payload.public_user_data.user_id}, org=${payload.organization.id})`,
      async () => {
        const clerkUserId = payload.public_user_data.user_id;
        const clerkOrgId = payload.organization.id;

        const [user, org] = await Promise.all([
          prisma.user.findUnique({ where: { externalId: clerkUserId } }),
          prisma.organization.findUnique({ where: { externalId: clerkOrgId } }),
        ]);

        if (!user) {
          throw new AuthError(
            `Cannot sync membership: user with Clerk ID "${clerkUserId}" not in Atlas yet. ` +
              'Ensure user.created webhook was processed first.',
            'SYNC_FAILED',
          );
        }
        if (!org) {
          throw new AuthError(
            `Cannot sync membership: org with Clerk ID "${clerkOrgId}" not in Atlas yet. ` +
              'Ensure organization.created webhook was processed first.',
            'SYNC_FAILED',
          );
        }

        const atlasRole = RoleSyncService.toAtlasRole(payload.role);

        const row = await prisma.membership.upsert({
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
          `[ClerkSyncService] Membership synced: ${user.email} → ${atlasRole} in "${org.name}"`,
        );

        return {
          id: row.id,
          userId: row.userId,
          organizationId: row.organizationId,
          role: row.role as any,
          joinedAt: row.joinedAt,
        };
      },
    );
  }

  /**
   * Remove a Membership when a Clerk org member is removed.
   */
  static async deleteMembership(
    payload: ClerkMembershipWebhookPayload,
  ): Promise<void> {
    const clerkUserId = payload.public_user_data.user_id;
    const clerkOrgId = payload.organization.id;

    const [user, org] = await Promise.all([
      prisma.user.findUnique({ where: { externalId: clerkUserId } }),
      prisma.organization.findUnique({ where: { externalId: clerkOrgId } }),
    ]);

    // Already deleted via cascade — nothing to do
    if (!user || !org) return;

    await prisma.membership.deleteMany({
      where: { userId: user.id, organizationId: org.id },
    });

    console.log(
      `[ClerkSyncService] Membership removed: ${user.email} from "${org.name}"`,
    );
  }

  /**
   * Verify a Clerk webhook signature and return the parsed event.
   * Call this at the top of the webhook route before doing anything else.
   *
   * Requires the `svix` package (bundled with @clerk/backend).
   */
  static async verifyWebhookSignature(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ type: string; data: unknown }> {
    const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new AuthError(
        'CLERK_WEBHOOK_SECRET is not set. Configure it in .env.local.',
        'UNAUTHENTICATED',
      );
    }

    // @ts-ignore — svix is a peer dep of @clerk/backend
    const { Webhook } = await import('svix');
    const wh = new Webhook(webhookSecret);

    try {
      const event = wh.verify(rawBody, {
        'svix-id': headers['svix-id'] as string,
        'svix-timestamp': headers['svix-timestamp'] as string,
        'svix-signature': headers['svix-signature'] as string,
      }) as { type: string; data: unknown };
      return event;
    } catch {
      throw new AuthError('Webhook signature verification failed.', 'UNAUTHENTICATED');
    }
  }
}
