/**
 * Atlas OS — AuthService
 *
 * Single point of truth for "who is making this request?"
 *
 * Every route, BullMQ worker, AI agent, and third-party sync (HubSpot,
 * QuickBooks, Gmail, etc.) calls AuthService instead of touching Clerk directly.
 *
 * The service resolves a Clerk session token into a fully-hydrated
 * AuthContext — user + organization + membership + permissions — all backed
 * by the Atlas Prisma database.
 *
 * Design goals:
 *  - Provider-agnostic public interface (no Clerk types leak out)
 *  - Fail-fast with typed AuthErrors (routes convert these to HTTP codes)
 *  - AuthContext.permissions is always populated — downstream code never
 *    checks role strings directly
 */

import type { Request } from 'express';
import { prisma } from '../../lib/prisma.js';
import {
  AuthContext,
  AtlasUser,
  AtlasOrganization,
  AtlasMembership,
  MemberRole,
  AuthError,
} from './types.js';
import { PermissionService } from './PermissionService.js';
import { RoleSyncService } from './RoleSyncService.js';

// ─── Clerk SDK — lazy import ──────────────────────────────────────────────────

async function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new AuthError(
      'CLERK_SECRET_KEY is not set. Configure it in .env.local to enable authentication.',
      'UNAUTHENTICATED',
    );
  }
  // @ts-ignore — @clerk/backend is an optional peer dep; installed when Clerk is enabled
  const { createClerkClient } = await import('@clerk/backend');
  return createClerkClient({ secretKey });
}

// ─── AuthService ──────────────────────────────────────────────────────────────

export class AuthService {
  /**
   * Resolve a Bearer token from an incoming Express request into a fully
   * hydrated AuthContext (user + org + membership + permissions).
   *
   * Usage in a route:
   *   const ctx = await AuthService.fromRequest(req);
   *   if (PermissionService.can(ctx, 'canApproveAIDecisions')) { ... }
   */
  static async fromRequest(req: Request): Promise<AuthContext> {
    const token = AuthService.extractBearerToken(req);
    if (!token) {
      throw new AuthError('No Bearer token in Authorization header.', 'UNAUTHENTICATED');
    }
    return AuthService.fromToken(token);
  }

  /**
   * Resolve a raw Clerk session JWT into an AuthContext.
   * Used by BullMQ workers or AI agents that carry a serialized token.
   */
  static async fromToken(sessionToken: string): Promise<AuthContext> {
    // Verify the token and extract Clerk IDs
    let clerkUserId: string;
    let clerkOrgId: string | null;

    try {
      // @ts-ignore
      const { verifyToken } = await import('@clerk/backend');
      const payload = await verifyToken(sessionToken, {
        secretKey: process.env.CLERK_SECRET_KEY!,
      });
      clerkUserId = payload.sub;
      clerkOrgId = (payload as any).org_id ?? null;
    } catch {
      throw new AuthError('Invalid or expired session token.', 'UNAUTHENTICATED');
    }

    // Resolve the Atlas user
    const dbUser = await prisma.user.findFirst({
      where: { externalId: clerkUserId },
    });
    if (!dbUser) {
      throw new AuthError(
        `User with Clerk ID "${clerkUserId}" not found in Atlas. ` +
          'Ensure the Clerk webhook is configured and the user has been synced.',
        'USER_NOT_FOUND',
      );
    }

    // Require an active org context in the session
    if (!clerkOrgId) {
      throw new AuthError(
        'Session has no active organization. ' +
          'The user must switch to an organization context in the frontend.',
        'ORG_NOT_FOUND',
      );
    }

    const dbOrg = await prisma.organization.findFirst({
      where: { externalId: clerkOrgId },
    });
    if (!dbOrg) {
      throw new AuthError(
        `Organization with Clerk ID "${clerkOrgId}" not found in Atlas. ` +
          'Ensure the Clerk webhook is configured and the org has been synced.',
        'ORG_NOT_FOUND',
      );
    }

    // Resolve the membership
    const dbMembership = await prisma.membership.findUnique({
      where: {
        userId_organizationId: {
          userId: dbUser.id,
          organizationId: dbOrg.id,
        },
      },
    });
    if (!dbMembership) {
      throw new AuthError(
        `User "${dbUser.email}" is not a member of organization "${dbOrg.name}".`,
        'UNAUTHORIZED',
      );
    }

    const user = AuthService.toAtlasUser(dbUser);
    const organization = AuthService.toAtlasOrganization(dbOrg);
    const membership = AuthService.toAtlasMembership(dbMembership);
    const permissions = PermissionService.getProfile(membership.role);

    return { user, organization, membership, permissions };
  }

  /**
   * Look up the Atlas user by internal Atlas ID.
   * Useful for server-side operations that already know the DB id.
   */
  static async getUserById(atlasUserId: string): Promise<AtlasUser> {
    const user = await prisma.user.findUnique({ where: { id: atlasUserId } });
    if (!user) {
      throw new AuthError(`User "${atlasUserId}" not found.`, 'USER_NOT_FOUND');
    }
    return AuthService.toAtlasUser(user);
  }

  /**
   * Look up the Atlas organization by its internal Atlas ID.
   */
  static async getOrganizationById(atlasOrgId: string): Promise<AtlasOrganization> {
    const org = await prisma.organization.findUnique({ where: { id: atlasOrgId } });
    if (!org) {
      throw new AuthError(`Organization "${atlasOrgId}" not found.`, 'ORG_NOT_FOUND');
    }
    return AuthService.toAtlasOrganization(org);
  }

  /**
   * Build an AuthContext directly from Atlas IDs (no Clerk token needed).
   * Used by internal services and workers that already have trusted IDs.
   */
  static async buildContext(
    atlasUserId: string,
    atlasOrgId: string,
  ): Promise<AuthContext> {
    const [dbUser, dbOrg, dbMembership] = await Promise.all([
      prisma.user.findUnique({ where: { id: atlasUserId } }),
      prisma.organization.findUnique({ where: { id: atlasOrgId } }),
      prisma.membership.findUnique({
        where: {
          userId_organizationId: { userId: atlasUserId, organizationId: atlasOrgId },
        },
      }),
    ]);

    if (!dbUser) throw new AuthError(`User "${atlasUserId}" not found.`, 'USER_NOT_FOUND');
    if (!dbOrg) throw new AuthError(`Organization "${atlasOrgId}" not found.`, 'ORG_NOT_FOUND');
    if (!dbMembership) {
      throw new AuthError(
        `User "${dbUser.email}" is not a member of org "${dbOrg.name}".`,
        'UNAUTHORIZED',
      );
    }

    const user = AuthService.toAtlasUser(dbUser);
    const organization = AuthService.toAtlasOrganization(dbOrg);
    const membership = AuthService.toAtlasMembership(dbMembership);
    const permissions = PermissionService.getProfile(membership.role);

    return { user, organization, membership, permissions };
  }

  /**
   * Determine where to send the user after a successful login.
   *  - First-time login (org not initialized) → /onboarding
   *  - Returning user → /mission-control
   */
  static getPostLoginRedirect(ctx: AuthContext): string {
    return ctx.organization.initialized ? '/mission-control' : '/onboarding';
  }

  /**
   * Assert that the user has at minimum the required role in their org.
   * Delegates to PermissionService for the single authoritative check.
   *
   * @deprecated Prefer PermissionService.assert(ctx, permission) for
   * capability-based checks. Use this for explicit role-level requirements.
   */
  static assertMinimumRole(ctx: AuthContext, required: MemberRole): void {
    PermissionService.assertMinimumRole(ctx, required);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private static extractBearerToken(req: Request): string | null {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7).trim() || null;
  }

  static toAtlasUser(row: any): AtlasUser {
    return {
      id: row.id,
      externalId: row.externalId ?? '',
      email: row.email,
      name: row.name,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  static toAtlasOrganization(row: any): AtlasOrganization {
    return {
      id: row.id,
      externalId: row.externalId,
      name: row.name,
      industry: row.industry,
      size: row.size,
      goals: row.goals,
      challenges: row.challenges,
      softwareStack: row.softwareStack,
      initialized: row.initialized,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  static toAtlasMembership(row: any): AtlasMembership {
    return {
      id: row.id,
      userId: row.userId,
      organizationId: row.organizationId,
      role: row.role as MemberRole,
      joinedAt: row.joinedAt,
    };
  }
}
