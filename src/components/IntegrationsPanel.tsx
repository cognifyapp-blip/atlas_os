/**
 * Atlas OS — Integrations Panel
 *
 * Lets users connect, disconnect, and sync external integrations.
 * OAuth connect redirects to the provider; the callback route
 * (/api/integrations/:provider/callback) handles the code exchange
 * and redirects back to the app with ?integration_connected=<provider>.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import {
  Plug,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ExternalLink,
  Unplug,
  AlertCircle,
  Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IntegrationRecord {
  provider: string;
  displayName: string;
  status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  connectedAt: string | null;
  lastSyncAt: string | null;
  capabilities: string[];
}

// Provider metadata not returned by the API
const PROVIDER_META: Record<string, { description: string; icon: string; color: string }> = {
  hubspot: {
    description: 'Sync contacts, deals, and pipeline activity from HubSpot CRM.',
    icon: '🟠',
    color: 'border-orange-200 bg-orange-50/40',
  },
  quickbooks: {
    description: 'Sync invoices, P&L data, and customers with QuickBooks Online.',
    icon: '🟢',
    color: 'border-green-200 bg-green-50/40',
  },
  google: {
    description: 'Send emails via Gmail and access Google Workspace.',
    icon: '🔵',
    color: 'border-blue-200 bg-blue-50/40',
  },
  slack: {
    description: 'Send notifications and updates to Slack channels.',
    icon: '🟣',
    color: 'border-purple-200 bg-purple-50/40',
  },
  teams: {
    description: 'Send notifications and updates to Microsoft Teams.',
    icon: '🔷',
    color: 'border-sky-200 bg-sky-50/40',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function IntegrationsPanel() {
  const [integrations, setIntegrations] = useState<IntegrationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null); // provider key
  const [syncMessage, setSyncMessage] = useState<Record<string, string>>({});

  const fetchIntegrations = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch('/api/integrations');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setIntegrations(data.integrations ?? []);
    } catch (err: any) {
      setError(err.message ?? 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();

    // Handle redirect back from OAuth callback
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('integration_connected');
    const integrationError = params.get('integration_error');

    if (connected) {
      setSyncMessage((prev) => ({
        ...prev,
        [connected]: `✓ Connected successfully. Initial sync running in background.`,
      }));
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
    }
    if (integrationError) {
      setError(`Integration error: ${integrationError}`);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [fetchIntegrations]);

  // ─── Connect: fetch OAuth URL and redirect ──────────────────────────────────

  const handleConnect = async (provider: string) => {
    setActionInProgress(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/connect`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? `Failed to get authorization URL for ${provider}`);
      }
      const { authorizationUrl } = await res.json();
      // Full page redirect — OAuth provider handles it, callback returns us here
      window.location.href = authorizationUrl;
    } catch (err: any) {
      setSyncMessage((prev) => ({ ...prev, [provider]: `Error: ${err.message}` }));
      setActionInProgress(null);
    }
  };

  // ─── Disconnect ──────────────────────────────────────────────────────────────

  const handleDisconnect = async (provider: string) => {
    if (!confirm(`Disconnect ${provider}? This will stop syncing data from this integration.`)) return;
    setActionInProgress(provider);
    try {
      const res = await fetch(`/api/integrations/${provider}/disconnect`, { method: 'POST' });
      if (!res.ok) throw new Error(`Disconnect failed: ${res.status}`);
      setSyncMessage((prev) => ({ ...prev, [provider]: 'Disconnected.' }));
      await fetchIntegrations();
    } catch (err: any) {
      setSyncMessage((prev) => ({ ...prev, [provider]: `Error: ${err.message}` }));
    } finally {
      setActionInProgress(null);
    }
  };

  // ─── Manual sync ─────────────────────────────────────────────────────────────

  const handleSync = async (provider: string) => {
    setActionInProgress(provider);
    setSyncMessage((prev) => ({ ...prev, [provider]: 'Syncing…' }));
    try {
      const res = await fetch(`/api/integrations/${provider}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'incremental' }),
      });
      if (!res.ok) throw new Error(`Sync failed: ${res.status}`);
      setSyncMessage((prev) => ({ ...prev, [provider]: 'Sync queued. Data will update shortly.' }));
      setTimeout(() => fetchIntegrations(), 3000);
    } catch (err: any) {
      setSyncMessage((prev) => ({ ...prev, [provider]: `Error: ${err.message}` }));
    } finally {
      setActionInProgress(null);
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="flex flex-col items-center space-y-3">
          <Loader2 className="w-6 h-6 animate-spin text-brand-bronze" />
          <p className="text-xs font-mono text-gray-400 uppercase tracking-widest">Loading integrations…</p>
        </div>
      </div>
    );
  }

  const connected = integrations.filter((i) => i.status === 'CONNECTED').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
            <Plug className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-base font-sans font-semibold text-gray-900">Integrations</h1>
            <p className="text-xs text-gray-400">
              Connect external tools so Atlas executives can sync, push, and pull real data.
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-xs font-mono text-gray-400">
            {connected} of {integrations.length} connected
          </span>
          <button
            onClick={fetchIntegrations}
            className="p-2 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors text-gray-400 hover:text-black"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div className="flex items-center space-x-3 p-4 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Integration cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((intg, i) => {
          const meta = PROVIDER_META[intg.provider] ?? { description: '', icon: '🔌', color: 'border-gray-200 bg-gray-50/40' };
          const isConnected = intg.status === 'CONNECTED';
          const busy = actionInProgress === intg.provider;
          const message = syncMessage[intg.provider];

          return (
            <motion.div
              key={intg.provider}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-white border rounded-2xl p-5 shadow-sm space-y-4 ${isConnected ? 'border-gray-100' : 'border-gray-100'}`}
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{meta.icon}</span>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">{intg.displayName}</h3>
                    <p className="text-[11px] text-gray-400 leading-relaxed mt-0.5">{meta.description}</p>
                  </div>
                </div>
                {/* Status badge */}
                <div
                  className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shrink-0 ${
                    isConnected
                      ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                      : 'text-gray-500 bg-gray-50 border-gray-100'
                  }`}
                >
                  {isConnected ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                  <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
                </div>
              </div>

              {/* Metadata row */}
              {isConnected && (
                <div className="grid grid-cols-2 gap-3 text-[10px] font-mono text-gray-400">
                  <div>
                    <span className="uppercase tracking-wider">Connected</span>
                    <p className="text-gray-600 font-medium mt-0.5">
                      {intg.connectedAt ? new Date(intg.connectedAt).toLocaleDateString() : '—'}
                    </p>
                  </div>
                  <div>
                    <span className="uppercase tracking-wider">Last Sync</span>
                    <p className="text-gray-600 font-medium mt-0.5">
                      {intg.lastSyncAt
                        ? new Date(intg.lastSyncAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : 'Not yet synced'}
                    </p>
                  </div>
                </div>
              )}

              {/* Capabilities */}
              <div className="flex flex-wrap gap-1.5">
                {intg.capabilities.map((cap) => (
                  <span
                    key={cap}
                    className="px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] font-mono text-gray-400"
                  >
                    {cap.replace('_', ' ')}
                  </span>
                ))}
              </div>

              {/* Feedback message */}
              {message && (
                <p className={`text-[11px] font-sans ${message.startsWith('Error') ? 'text-red-600' : 'text-emerald-600'}`}>
                  {message}
                </p>
              )}

              {/* Action buttons */}
              <div className="pt-1 border-t border-gray-50 flex items-center justify-end space-x-2">
                {isConnected ? (
                  <>
                    <button
                      onClick={() => handleSync(intg.provider)}
                      disabled={busy}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg text-[10px] font-semibold text-gray-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      <span>Sync Now</span>
                    </button>
                    <button
                      onClick={() => handleDisconnect(intg.provider)}
                      disabled={busy}
                      className="flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg text-[10px] font-semibold text-red-600 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Unplug className="w-3 h-3" />}
                      <span>Disconnect</span>
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleConnect(intg.provider)}
                    disabled={busy}
                    className="flex items-center space-x-1.5 px-4 py-1.5 bg-black hover:bg-black/90 text-white rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <ExternalLink className="w-3 h-3" />}
                    <span>Connect {intg.displayName}</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Help note */}
      <div className="p-4 bg-gray-50 border border-gray-100 rounded-xl text-[11px] text-gray-400 space-y-1">
        <p className="font-semibold text-gray-500">How it works</p>
        <p>Clicking Connect opens the provider's authorization page. After you approve access, you're redirected back to Atlas and a full data sync starts automatically. Your credentials are encrypted and stored — you only need to connect once.</p>
      </div>
    </div>
  );
}
