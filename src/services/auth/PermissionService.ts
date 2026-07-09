/**
 * Atlas OS — PermissionService
 *
 * Single source of truth for authorization in Atlas OS.
 *
 * Clerk roles are the source of truth for *who* a user is inside an org.
 * PermissionService maps those roles into *what* that user can do inside Atlas.
 *
 * RULES:
 *  - All authorization checks throughout Atlas must use this service.
 *  - Never hardcode role strings (e.g. "OWNER", "ADMIN") in routes or components.
 *  - Future integrations (HubSpot, QuickBooks, BullMQ workers, AI agents) call
 *    PermissionService.can() without ever depending on Clerk directly.
 *
 * Role hierarchy (least → most privileged):
 *   VIEWER < EMPLOYEE ≈ MEMBER < MANAGER < EXECUTIVE < ADMIN < OWNER
 */

import { MemberRole, PermissionProfile, AuthContext, AuthError } from './types.js';

// ─── Permission matrix ────────────────────────────────────────────────────────

const PERMISSION_PROFILES: Record<MemberRole, PermissionProfile> = {
  OWNER: {
    role: 'OWNER',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canManageOrganization: true,
    canManageIntegrations: true,
    canManageBilling: true,
    canViewBilling: true,
    canManageDepartments: true,
    canViewDepartments: true,
    canManageAIExecutives: true,
    canApproveAIDecisions: true,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: true,
    canViewStrategicReports: true,
    canAccessBoardroom: true,
    canApproveWorkflows: true,
    canCreateWorkflows: true,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: true,
    canViewReports: true,
  },

  ADMIN: {
    role: 'ADMIN',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: true,
    canInviteUsers: true,
    canRemoveUsers: true,
    canManageOrganization: true,
    canManageIntegrations: true,
    canManageBilling: false,
    canViewBilling: true,
    canManageDepartments: true,
    canViewDepartments: true,
    canManageAIExecutives: true,
    canApproveAIDecisions: true,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: true,
    canViewStrategicReports: true,
    canAccessBoardroom: true,
    canApproveWorkflows: true,
    canCreateWorkflows: true,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: true,
    canViewReports: true,
  },

  EXECUTIVE: {
    role: 'EXECUTIVE',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: false,
    canInviteUsers: true,
    canRemoveUsers: false,
    canManageOrganization: false,
    canManageIntegrations: false,
    canManageBilling: false,
    canViewBilling: true,
    canManageDepartments: false,
    canViewDepartments: true,
    canManageAIExecutives: false,
    canApproveAIDecisions: true,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: true,
    canViewStrategicReports: true,
    canAccessBoardroom: true,
    canApproveWorkflows: true,
    canCreateWorkflows: true,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: true,
    canViewReports: true,
  },

  MANAGER: {
    role: 'MANAGER',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: false,
    canInviteUsers: true,
    canRemoveUsers: false,
    canManageOrganization: false,
    canManageIntegrations: false,
    canManageBilling: false,
    canViewBilling: false,
    canManageDepartments: true,
    canViewDepartments: true,
    canManageAIExecutives: false,
    canApproveAIDecisions: false,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: false,
    canViewStrategicReports: true,
    canAccessBoardroom: false,
    canApproveWorkflows: true,
    canCreateWorkflows: true,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: true,
    canViewReports: true,
  },

  EMPLOYEE: {
    role: 'EMPLOYEE',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canManageOrganization: false,
    canManageIntegrations: false,
    canManageBilling: false,
    canViewBilling: false,
    canManageDepartments: false,
    canViewDepartments: true,
    canManageAIExecutives: false,
    canApproveAIDecisions: false,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: false,
    canViewStrategicReports: false,
    canAccessBoardroom: false,
    canApproveWorkflows: false,
    canCreateWorkflows: false,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: false,
    canViewReports: false,
  },

  // MEMBER is kept for backward-compatibility — treated same as EMPLOYEE
  MEMBER: {
    role: 'MEMBER',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canManageOrganization: false,
    canManageIntegrations: false,
    canManageBilling: false,
    canViewBilling: false,
    canManageDepartments: false,
    canViewDepartments: true,
    canManageAIExecutives: false,
    canApproveAIDecisions: false,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: false,
    canViewStrategicReports: false,
    canAccessBoardroom: false,
    canApproveWorkflows: false,
    canCreateWorkflows: false,
    canViewWorkflows: true,
    canWriteMemory: true,
    canReadMemory: true,
    canViewAnalytics: false,
    canViewReports: false,
  },

  VIEWER: {
    role: 'VIEWER',
    canAccessPlatform: true,
    canAccessMissionControl: true,
    canManageUsers: false,
    canInviteUsers: false,
    canRemoveUsers: false,
    canManageOrganization: false,
    canManageIntegrations: false,
    canManageBilling: false,
    canViewBilling: false,
    canManageDepartments: false,
    canViewDepartments: true,
    canManageAIExecutives: false,
    canApproveAIDecisions: false,
    canViewAIExecutives: true,
    canAccessExecutiveDashboards: false,
    canViewStrategicReports: false,
    canAccessBoardroom: false,
    canApproveWorkflows: false,
    canCreateWorkflows: false,
    canViewWorkflows: true,
    canWriteMemory: false,
    canReadMemory: true,
    canViewAnalytics: false,
    canViewReports: false,
  },
};

// ─── Role hierarchy (for minimum-role checks) ─────────────────────────────────
// Higher number = more privileged.

const ROLE_HIERARCHY: Record<MemberRole, number> = {
  VIEWER: 0,
  EMPLOYEE: 1,
  MEMBER: 1, // same level as EMPLOYEE
  MANAGER: 2,
  EXECUTIVE: 3,
  ADMIN: 4,
  OWNER: 5,
};

// ─── PermissionService ────────────────────────────────────────────────────────

export class PermissionService {
  /**
   * Return the full PermissionProfile for a given Atlas role.
   * This is what gets attached to AuthContext.permissions on every request.
   */
  static getProfile(role: MemberRole): PermissionProfile {
    return PERMISSION_PROFILES[role] ?? PERMISSION_PROFILES.VIEWER;
  }

  /**
   * Check a specific permission for the current auth context.
   *
   * Usage:
   *   if (!PermissionService.can(ctx, 'canApproveAIDecisions')) {
   *     throw new AuthError('...', 'UNAUTHORIZED');
   *   }
   */
  static can(
    ctx: AuthContext,
    permission: keyof Omit<PermissionProfile, 'role'>,
  ): boolean {
    return ctx.permissions[permission] === true;
  }

  /**
   * Assert a specific permission — throws AuthError if denied.
   * Use this inside service methods that require a specific capability.
   *
   * Usage:
   *   PermissionService.assert(ctx, 'canManageDepartments');
   */
  static assert(
    ctx: AuthContext,
    permission: keyof Omit<PermissionProfile, 'role'>,
  ): void {
    if (!PermissionService.can(ctx, permission)) {
      throw new AuthError(
        `Permission denied: "${permission}" is not allowed for role "${ctx.membership.role}".`,
        'UNAUTHORIZED',
      );
    }
  }

  /**
   * Assert that the caller's role is at least as privileged as the required role.
   *
   * Usage:
   *   PermissionService.assertMinimumRole(ctx, 'MANAGER');
   */
  static assertMinimumRole(ctx: AuthContext, required: MemberRole): void {
    const userLevel = ROLE_HIERARCHY[ctx.membership.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[required] ?? 0;

    if (userLevel < requiredLevel) {
      throw new AuthError(
        `This action requires the "${required}" role or above. ` +
          `"${ctx.user.email}" has role "${ctx.membership.role}".`,
        'UNAUTHORIZED',
      );
    }
  }

  /**
   * Check if the caller has at least the required role level (non-throwing).
   */
  static hasMinimumRole(ctx: AuthContext, required: MemberRole): boolean {
    const userLevel = ROLE_HIERARCHY[ctx.membership.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[required] ?? 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Return a plain object with all permissions for the role — useful for
   * serializing to the frontend so the UI can conditionally render controls
   * without calling the backend for every auth check.
   */
  static serialize(role: MemberRole): PermissionProfile {
    return { ...PERMISSION_PROFILES[role] ?? PERMISSION_PROFILES.VIEWER };
  }

  /**
   * Check whether the role is a platform administrator (ADMIN or OWNER).
   * Useful for system-level operations.
   */
  static isPlatformAdmin(role: MemberRole): boolean {
    return role === 'ADMIN' || role === 'OWNER';
  }
}
