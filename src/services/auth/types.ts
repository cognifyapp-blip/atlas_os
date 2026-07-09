/**
 * Atlas OS — Auth Service Types
 *
 * All auth-related types live here so the rest of the codebase depends only
 * on these shapes, never on Clerk's SDK types directly.
 *
 * Swapping auth providers means updating service implementations — not
 * hunting through every route, worker, and AI agent.
 */

// ─── Roles ───────────────────────────────────────────────────────────────────

/**
 * Canonical Atlas role set — mirrors the six roles configured in Clerk.
 * MEMBER is kept for backward-compat with existing DB rows; new code
 * should use EMPLOYEE instead.
 */
export type MemberRole =
  | 'OWNER'
  | 'ADMIN'
  | 'EXECUTIVE'
  | 'MANAGER'
  | 'EMPLOYEE'
  | 'MEMBER'
  | 'VIEWER';

// ─── Permission Profiles ─────────────────────────────────────────────────────

/**
 * Granular permissions that Atlas maps from Clerk roles.
 * All authorization checks go through PermissionService — never check
 * role strings directly in routes or components.
 */
export interface PermissionProfile {
  role: MemberRole;

  // Platform access
  canAccessPlatform: boolean;
  canAccessMissionControl: boolean;

  // User management
  canManageUsers: boolean;
  canInviteUsers: boolean;
  canRemoveUsers: boolean;

  // Organization management
  canManageOrganization: boolean;
  canManageIntegrations: boolean;
  canManageBilling: boolean;
  canViewBilling: boolean;

  // Department management
  canManageDepartments: boolean;
  canViewDepartments: boolean;

  // AI executives
  canManageAIExecutives: boolean;
  canApproveAIDecisions: boolean;
  canViewAIExecutives: boolean;

  // Strategic / executive features
  canAccessExecutiveDashboards: boolean;
  canViewStrategicReports: boolean;
  canAccessBoardroom: boolean;

  // Workflow & operations
  canApproveWorkflows: boolean;
  canCreateWorkflows: boolean;
  canViewWorkflows: boolean;

  // Memory / knowledge base
  canWriteMemory: boolean;
  canReadMemory: boolean;

  // Analytics
  canViewAnalytics: boolean;
  canViewReports: boolean;
}

// ─── Core identity types ─────────────────────────────────────────────────────

export interface AtlasUser {
  /** Atlas DB primary key (cuid) */
  id: string;
  /** Provider-issued external ID (e.g. Clerk user_xxx) */
  externalId: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AtlasOrganization {
  /** Atlas DB primary key (cuid) */
  id: string;
  /** Provider-issued external ID (e.g. Clerk org_xxx) */
  externalId: string | null;
  name: string;
  industry: string | null;
  size: string | null;
  goals: string | null;
  challenges: string | null;
  softwareStack: string | null;
  initialized: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AtlasMembership {
  id: string;
  userId: string;
  organizationId: string;
  role: MemberRole;
  joinedAt: Date;
}

// ─── Session / request context ────────────────────────────────────────────────

/**
 * Resolved auth context attached to every authenticated request.
 * Consumers (routes, workers, AI agents) read from this — they never
 * call Clerk directly.
 */
export interface AuthContext {
  user: AtlasUser;
  organization: AtlasOrganization;
  membership: AtlasMembership;
  /** Resolved permission profile for the current role — use this for authz checks */
  permissions: PermissionProfile;
}

// ─── Clerk webhook payload shapes ────────────────────────────────────────────
// Only the fields Atlas actually uses — intentionally narrow.

export interface ClerkUserWebhookPayload {
  id: string;
  email_addresses: Array<{ email_address: string; id: string }>;
  primary_email_address_id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  created_at: number;
  updated_at: number;
}

export interface ClerkOrganizationWebhookPayload {
  id: string;
  name: string;
  slug?: string | null;
  image_url?: string | null;
  logo_url?: string | null;
  public_metadata?: Record<string, unknown>;
  created_at: number;
  updated_at: number;
}

export interface ClerkMembershipWebhookPayload {
  id: string;
  organization: {
    id: string;
    name: string;
  };
  public_user_data: {
    user_id: string;
    first_name?: string | null;
    last_name?: string | null;
    image_url?: string | null;
    identifier?: string;
  };
  role: string;
  created_at: number;
  updated_at?: number;
}

// ─── Provisioning ─────────────────────────────────────────────────────────────

export interface ProvisioningResult {
  organization: AtlasOrganization;
  departments: Array<{ id: string; name: string }>;
  aiExecutives: Array<{ id: string; name: string; role: string }>;
  isNewOrganization: boolean;
}

// ─── Service errors ───────────────────────────────────────────────────────────

export type AuthErrorCode =
  | 'UNAUTHENTICATED'
  | 'UNAUTHORIZED'
  | 'USER_NOT_FOUND'
  | 'ORG_NOT_FOUND'
  | 'SYNC_FAILED'
  | 'PROVISIONING_FAILED'
  | 'ROLE_SYNC_FAILED';

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
