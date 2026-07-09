/**
 * Atlas OS — Auth Services barrel export
 *
 * Import from here everywhere in the codebase:
 *
 *   import { AuthService, PermissionService } from '../services/auth/index.js'
 *   import type { AuthContext, PermissionProfile } from '../services/auth/index.js'
 *
 * Design note:
 * Future integrations (HubSpot, QuickBooks, BullMQ, AI Workflow Engine)
 * should only ever import from this barrel — never from individual service
 * files directly. This keeps the abstraction layer clean and makes provider
 * swaps (e.g. replacing Clerk) a single-file change.
 */

export { AuthService } from './AuthService.js';
export { ClerkSyncService } from './ClerkSyncService.js';
export { OrganizationService } from './OrganizationService.js';
export { RoleSyncService } from './RoleSyncService.js';
export { PermissionService } from './PermissionService.js';

export type {
  // Identity
  AtlasUser,
  AtlasOrganization,
  AtlasMembership,
  MemberRole,

  // Session context
  AuthContext,

  // Permissions
  PermissionProfile,

  // Provisioning
  ProvisioningResult,

  // Clerk webhook payload types
  ClerkUserWebhookPayload,
  ClerkOrganizationWebhookPayload,
  ClerkMembershipWebhookPayload,

  // Errors
  AuthErrorCode,
} from './types.js';

export { AuthError } from './types.js';
