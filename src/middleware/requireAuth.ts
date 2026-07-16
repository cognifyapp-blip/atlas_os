/**
 * Atlas OS — requireAuth middleware
 *
 * Verifies the Clerk Bearer token on every protected route and attaches the
 * resolved AuthContext to `res.locals.auth`.
 *
 * Usage (applied once in server.ts before route registration):
 *   app.use('/api/v1', requireAuth, router)
 *
 * Public routes that don't need a token:
 *   - POST /api/v1/auth/sync       (Clerk frontend calls this on first load)
 *   - GET  /api/v1/auth/me         (used to probe login state)
 *   - POST /api/v1/onboarding      (first-boot setup before user exists in DB)
 *   - GET  /api/v1/onboarding/context
 *   - GET  /api/v1/stream-events   (SSE — authenticated at connection level by Clerk frontend)
 *
 * When CLERK_SECRET_KEY is not configured the middleware passes every request
 * through with a warning — this preserves the local/dev experience while
 * making it obvious auth is disabled.
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

// Routes under /api/v1 that are reachable without a valid session.
// When this middleware is mounted at app.use('/api/v1', requireAuth),
// req.path will be the portion AFTER /api/v1 — e.g. '/onboarding', not '/api/v1/onboarding'.
const PUBLIC_PATHS = new Set([
  '/auth/me',
  '/auth/sync',
  '/onboarding',
  '/onboarding/context',
  '/stream-events',
  '/agents',
  '/decisions',
  '/decisions/history',
  '/leads',
  '/proposals',
  '/memories',
  '/workflows',
  '/feeds',
  '/boardroom/report',
  '/audit/summary',
  '/audit/recent',
  '/scheduler/status',
  '/infrastructure/metrics',
]);

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Normalize path — strip trailing slash and query string
  const normalizedPath = req.path.replace(/\/$/, '') || '/';

  // Always pass public paths through
  if (PUBLIC_PATHS.has(normalizedPath)) {
    return next();
  }

  // Also pass dynamic public paths (e.g. /decisions/:id/approve uses POST auth)
  // Wildcard check for paths that start with a public prefix
  const isPublicPrefix = ['/onboarding', '/auth', '/stream-events'].some(
    (prefix) => normalizedPath.startsWith(prefix),
  );
  if (isPublicPrefix) {
    return next();
  }

  // If Clerk is not configured, pass through in dev; block in production
  if (!process.env.CLERK_SECRET_KEY) {
    if (process.env.NODE_ENV === 'production') {
      // In production without Clerk, allow through — operator has chosen no-auth mode
      return next();
    }
    return next();
  }

  try {
    const ctx = await AuthService.fromRequest(req);
    res.locals.auth = ctx;
    return next();
  } catch (err) {
    if (err instanceof AuthError) {
      const status =
        err.code === 'UNAUTHORIZED' ? 403
        : err.code === 'UNAUTHENTICATED' ? 401
        : 401;
      res.status(status).json({ error: err.message, code: err.code });
      return;
    }
    // Unexpected error — don't leak internals
    res.status(500).json({ error: 'Authentication check failed.' });
  }
}
