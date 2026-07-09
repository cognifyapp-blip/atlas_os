/**
 * Atlas OS — Clerk Webhook Handler
 *
 * Register this router in server.ts BEFORE express.json() so we receive
 * the raw body needed for SVIX signature verification.
 *
 * server.ts:
 *   import webhookRouter from './src/routes/webhooks.js'
 *   app.use('/api/webhooks', express.raw({ type: 'application/json' }), webhookRouter)
 *
 * In Clerk Dashboard → Webhooks → add endpoint:
 *   https://your-domain.com/api/webhooks/clerk
 *   Events: user.*, organization.*, organizationMembership.*
 *
 * Authentication flow triggered here:
 *   organization.created → syncOrganization → provisionNewOrganization
 *     (departments + AI Executive Team provisioned automatically)
 */

import { Router } from 'express';
import { ClerkSyncService } from '../services/auth/ClerkSyncService.js';
import { OrganizationService } from '../services/auth/OrganizationService.js';
import type {
  ClerkUserWebhookPayload,
  ClerkOrganizationWebhookPayload,
  ClerkMembershipWebhookPayload,
} from '../services/auth/types.js';

const router = Router();

router.post('/clerk', async (req, res) => {
  try {
    // Verify the SVIX signature — throws AuthError on tampered payloads
    const event = await ClerkSyncService.verifyWebhookSignature(
      req.body as Buffer,
      req.headers as Record<string, string | undefined>,
    );

    const { type, data } = event;

    switch (type) {
      // ── Users ──────────────────────────────────────────────────────────────
      case 'user.created':
      case 'user.updated': {
        const user = await ClerkSyncService.syncUser(data as ClerkUserWebhookPayload);
        console.log(`[Webhook] ${type}: synced user ${user.email}`);
        break;
      }

      case 'user.deleted': {
        const payload = data as { id: string };
        await ClerkSyncService.deleteUser(payload.id);
        console.log(`[Webhook] user.deleted: removed Clerk user ${payload.id}`);
        break;
      }

      // ── Organizations ──────────────────────────────────────────────────────
      case 'organization.created': {
        const org = await ClerkSyncService.syncOrganization(
          data as ClerkOrganizationWebhookPayload,
        );
        console.log(`[Webhook] organization.created: synced org "${org.name}"`);

        // Automatically provision departments + AI Executive Team
        // This is the Atlas "auto-hire" trigger — Atlas OS hires its own team.
        try {
          const provisioning = await OrganizationService.provisionNewOrganization(org.id);
          if (provisioning.isNewOrganization) {
            console.log(
              `[Webhook] Auto-provisioned ${provisioning.departments.length} departments and ` +
                `${provisioning.aiExecutives.length} AI executives for "${org.name}".`,
            );
          }
        } catch (provErr: any) {
          // Log but don't fail the webhook — provisioning can be retried
          console.error(`[Webhook] Provisioning failed for org "${org.name}":`, provErr.message);
        }
        break;
      }

      case 'organization.updated': {
        const org = await ClerkSyncService.syncOrganization(
          data as ClerkOrganizationWebhookPayload,
        );
        console.log(`[Webhook] organization.updated: synced org "${org.name}"`);
        break;
      }

      case 'organization.deleted': {
        const payload = data as { id: string };
        await ClerkSyncService.deleteOrganization(payload.id);
        console.log(`[Webhook] organization.deleted: removed Clerk org ${payload.id}`);
        break;
      }

      // ── Memberships ────────────────────────────────────────────────────────
      case 'organizationMembership.created':
      case 'organizationMembership.updated': {
        const membership = await ClerkSyncService.syncMembership(
          data as ClerkMembershipWebhookPayload,
        );
        console.log(
          `[Webhook] ${type}: synced membership ` +
            `${membership.userId} → ${membership.role} in org ${membership.organizationId}`,
        );
        break;
      }

      case 'organizationMembership.deleted': {
        await ClerkSyncService.deleteMembership(data as ClerkMembershipWebhookPayload);
        console.log(`[Webhook] organizationMembership.deleted`);
        break;
      }

      default:
        // Unhandled event — log and return 200 so Clerk doesn't retry
        console.log(`[Webhook] Unhandled event type: ${type}`);
    }

    // Clerk expects a 200 to confirm receipt
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Webhook] Error processing Clerk event:', err.message);
    // Return 401 for signature failures (don't retry tampered webhooks)
    // Return 400 for sync failures (Clerk will retry delivery)
    const status = err.code === 'UNAUTHENTICATED' ? 401 : 400;
    res.status(status).json({ error: err.message, code: err.code ?? 'WEBHOOK_ERROR' });
  }
});

export default router;
