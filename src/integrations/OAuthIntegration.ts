/**
 * Atlas OS — OAuthIntegration
 *
 * Base class for OAuth 2.0 integration providers.
 * Extends BaseIntegration with token refresh lifecycle, expiry detection,
 * and connection state management backed by Prisma.
 *
 * OAuth providers (HubSpot, Google, QuickBooks, Slack, Teams) extend this.
 */

import { BaseIntegration } from './BaseIntegration.js';
import type {
  IntegrationConnectionState,
  OAuthTokenData,
  IntegrationHealthReport,
} from './types.js';

export abstract class OAuthIntegration extends BaseIntegration {
  /**
   * True if the token is expired (or will expire within the buffer window).
   */
  protected isTokenExpired(
    token: OAuthTokenData,
    bufferMs = 5 * 60 * 1000, // 5-minute buffer
  ): boolean {
    if (!token.expiresAt) return false;
    return token.expiresAt.getTime() - Date.now() < bufferMs;
  }

  /**
   * Get a valid access token — refreshes automatically if expired.
   * Subclasses call this instead of reading the token directly.
   */
  protected async getValidToken(
    organizationId: string,
    integrationId: string,
  ): Promise<OAuthTokenData> {
    const token = await this.loadToken(organizationId, integrationId);

    if (!token) {
      throw new Error(
        `No token found for integration "${integrationId}" in org "${organizationId}". ` +
          `User must reconnect via OAuth flow.`,
      );
    }

    if (this.isTokenExpired(token)) {
      this.log('info', 'Token expired — refreshing', { organizationId, integrationId });
      return this.refreshToken(organizationId, integrationId);
    }

    return token;
  }

  /**
   * Load the stored token from Prisma.
   * Returns null if no token exists.
   */
  protected async loadToken(
    organizationId: string,
    integrationId: string,
  ): Promise<OAuthTokenData | null> {
    try {
      const { prisma } = await import('../lib/prisma.js');
      const record = await (prisma as any).oAuthToken?.findFirst({
        where: { integrationId, organizationId },
      });

      if (!record) return null;

      return {
        accessToken: record.accessToken,
        refreshToken: record.refreshToken ?? undefined,
        expiresAt: record.expiresAt ?? undefined,
        scopes: record.scopes ?? [],
        tokenType: record.tokenType ?? 'Bearer',
      };
    } catch {
      // OAuthToken table may not exist yet — return null gracefully
      return null;
    }
  }

  /**
   * Persist a token to Prisma (upsert).
   */
  protected async saveToken(
    organizationId: string,
    integrationId: string,
    token: OAuthTokenData,
  ): Promise<void> {
    try {
      const { prisma } = await import('../lib/prisma.js');
      await (prisma as any).oAuthToken?.upsert({
        where: { integrationId_organizationId: { integrationId, organizationId } },
        create: {
          integrationId,
          organizationId,
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? null,
          expiresAt: token.expiresAt ?? null,
          scopes: token.scopes,
          tokenType: token.tokenType ?? 'Bearer',
        },
        update: {
          accessToken: token.accessToken,
          refreshToken: token.refreshToken ?? null,
          expiresAt: token.expiresAt ?? null,
          scopes: token.scopes,
          updatedAt: new Date(),
        },
      });
    } catch {
      // Table may not exist yet — log and continue
      this.log('warn', 'Could not persist OAuth token — run Prisma migration', {
        integrationId,
        organizationId,
      });
    }
  }

  /**
   * Default health check — validates token is present and not expired.
   * Providers can override for a live API ping.
   */
  async healthCheck(
    organizationId: string,
    integrationId: string,
  ): Promise<IntegrationHealthReport> {
    try {
      const token = await this.loadToken(organizationId, integrationId);
      const healthy = token !== null && !this.isTokenExpired(token);

      return {
        provider: this.name,
        integrationId,
        healthy,
        checkedAt: new Date().toISOString(),
        error: healthy ? undefined : 'Token missing or expired',
      };
    } catch (err: any) {
      return {
        provider: this.name,
        integrationId,
        healthy: false,
        checkedAt: new Date().toISOString(),
        error: err.message,
      };
    }
  }

  /**
   * Build a disconnected connection state.
   */
  protected disconnectedState(errorMessage?: string): IntegrationConnectionState {
    return {
      status: 'disconnected',
      errorMessage,
    };
  }

  /**
   * Build a connected connection state.
   */
  protected connectedState(): IntegrationConnectionState {
    return {
      status: 'connected',
      connectedAt: new Date(),
    };
  }
}
