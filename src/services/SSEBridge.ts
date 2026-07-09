/**
 * Atlas OS — SSE Bridge
 *
 * Allows services deep in the stack (GovernancePolicy, CollaborationSession, etc.)
 * to broadcast SSE events without importing from server.ts (circular dep risk).
 *
 * server.ts calls registerSSEBridge(broadcastEvent) once at startup.
 * All other modules import broadcastSSE from here.
 */

let _broadcastFn: ((event: unknown) => void) | null = null;

export function registerSSEBridge(fn: (event: unknown) => void): void {
  _broadcastFn = fn;
}

export function broadcastSSE(event: unknown): void {
  if (_broadcastFn) {
    _broadcastFn(event);
  }
}
