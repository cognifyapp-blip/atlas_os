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

// Routes under /api/v1 that are reachable without a valid session
const PUBLIC_PATHS = new Set([
  '/api/v1/auth/me',
  '/api/v1/auth/sync',
  '/api/v1/onboarding',
  '/api/v1/onboarding/context',
  '/api/v1/stream-events',
]);

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // Always pass public paths through
  if (PUBLIC_PATHS.has(req.path)) {
    return next();
  }

  // If Clerk is not configured, warn and pass through (dev / pre-auth mode)
  if (!process.env.CLERK_SECRET_KEY) {
    if (process.env.NODE_ENV === 'production') {
      res.status(503).json({
        error: 'Authentication is not configured. Set CLERK_SECRET_KEY in your environment.',
      });
      return;
    }
    // Dev mode — pass through but don't attach auth context
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
