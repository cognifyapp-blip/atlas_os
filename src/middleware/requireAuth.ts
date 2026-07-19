/**
 * Atlas OS — requireAuth middleware
 *
 * Verifies the Clerk Bearer token on every protected route and attaches the
 * resolved AuthContext to `res.locals.auth`.
 *
 * Public routes that don't need a token:
 *   - POST /api/v1/auth/sync       (Clerk frontend calls this on first load)
 *   - GET  /api/v1/auth/me         (used to probe login state)
 *   - POST /api/v1/onboarding      (first-boot setup — org doesn't exist yet)
 *   - GET  /api/v1/onboarding/context
 *   - GET  /api/v1/stream-events   (SSE — token verified at connection time by Clerk frontend)
 *
 * All other /api/v1/* routes require a valid Clerk Bearer token.
 * If CLERK_SECRET_KEY is not set (local dev without Clerk), the middleware
 * passes through with a warning — but logs clearly that auth is disabled.
 */

import type { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth/AuthService.js';
import { AuthError, type AuthContext } from '../services/auth/types.js';

// Augment Express locals so downstream code is type-safe
declare global {
  namespace Express {
    interface Locals {
      auth?: AuthContext;
    }
  }
}

// Only routes that genuinely cannot require a token.
// Everything else — leads, decisions, proposals, memories, feeds — requires auth.
const PUBLIC_PATHS = new Set([
  '/auth/me',
  '/auth/sync',
  '/onboarding',
  '/onboarding/context',
  '/stream-events',
  '/health',
]);

// Prefixes where all sub-paths are public (e.g. /auth/*)
const PUBLIC_PREFIXES = ['/onboarding', '/auth'];

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const normalizedPath = req.path.replace(/\/$/, '') || '/';

  if (PUBLIC_PATHS.has(normalizedPath)) return next();
  if (PUBLIC_PREFIXES.some((p) => normalizedPath.startsWith(p))) return next();

  // If Clerk is not configured (local dev / no CLERK_SECRET_KEY), pass through
  // with a clear warning so developers know auth is disabled.
  if (!process.env.CLERK_SECRET_KEY) {
    if (!globalThis._authWarnedOnce) {
      console.warn(
        '[requireAuth] WARNING: CLERK_SECRET_KEY not set. Auth is DISABLED. ' +
        'Set CLERK_SECRET_KEY in production or all routes are publicly accessible.',
      );
      (globalThis as any)._authWarnedOnce = true;
    }
    return next();
  }

  try {
    const ctx = await AuthService.fromRequest(req);
    res.locals.auth = ctx;
    return next();
  } catch (err) {
    if (err instanceof AuthError) {
      // If the error is specifically that there's no org in the token,
      // still pass through — resolveOrgId will use the single-org fallback.
      // This handles users who sign in directly without a Clerk organization.
      if (err.code === 'ORG_NOT_FOUND') {
        return next();
      }
      const status =
        err.code === 'UNAUTHORIZED' ? 403
        : err.code === 'UNAUTHENTICATED' ? 401
        : 401;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}
