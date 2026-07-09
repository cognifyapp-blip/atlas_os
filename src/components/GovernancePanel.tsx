/**
 * Atlas OS — Governance Panel
 *
 * Shows the current governance mode, pending decision queue,
 * and lets the user run Atlas as acting CEO to process decisions autonomously.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Zap, RefreshCw, ChevronRight, CheckCircle, AlertTriangle, XCircle, Play } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface GovernanceStatus {
  mode: 'supervised' | 'hybrid' | 'autonomous';
  description: string;
  pendingDecisions: number;
  envVar: string;
  validModes: string[];
}

interface GovernanceResult {
  id: string;
  title: string;
  action: 'auto_approved' | 'atlas_approved' | 'escalated_to_ceo';
  reason: string;
}

interface RunResult {
  processed: number;
  autoApproved: number;
  atlasApproved: number;
  escalatedToCeo: number;
  governanceMode: string;
  results: GovernanceResult[];
}

interface LogEntry {
  id: string;
  action: string;
  text: string;
  executive: string | null;
  createdAt: string;
}

// ─── Mode config ──────────────────────────────────────────────────────────────

const MODE_CONFIG = {
  supervised: {
    label: 'Supervised',
    color: 'text-blue-700 bg-blue-50 border-blue-100',
    dot: 'bg-blue-500',
    description: 'All decisions require human CEO approval. Atlas never acts unilaterally.',
    icon: <Shield className="w-4 h-4" />,
  },
  hybrid: {
    label: 'Hybrid',
    color: 'text-amber-700 bg-amber-50 border-amber-100',
    dot: 'bg-amber-500',
    description: 'Atlas approves low-risk decisions autonomously. High-risk escalates to you.',
    icon: <Zap className="w-4 h-4" />,
  },
  autonomous: {
    label: 'Autonomous',
    color: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    dot: 'bg-emerald-500 animate-pulse',
    description: 'Atlas acts as CEO within governance thresholds. You review exceptions only.',
    icon: <CheckCircle className="w-4 h-4" />,
  },
};

const ACTION_CONFIG = {
  auto_approved: { label: 'Auto-approved', color: 'text-emerald-700 bg-emerald-50', icon: <CheckCircle className="w-3 h-3" /> },
  atlas_approved: { label: 'Atlas approved', color: 'text-brand-bronze bg-brand-bronze/10', icon: <Zap className="w-3 h-3" /> },
  escalated_to_ceo: { label: 'Escalated', color: 'text-amber-700 bg-amber-50', icon: <AlertTriangle className="w-3 h-3" /> },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function GovernancePanel() {
  const [status, setStatus] = useState<GovernanceStatus | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);

  const fetchStatus = async () => {
    setLoading(true);
    try {
      const [statusRes, logRes] = await Promise.all([
        fetch('/api/v1/governance/status'),
        fetch('/api/v1/governance/log'),
      ]);
      const statusData = await statusRes.json();
      const logData = await logRes.json();
      setStatus(statusData);
      setLog(logData.entries ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStatus(); }, []);

  const handleRunAtlas = async () => {
    setRunLoading(true);
    setRunResult(null);
    try {
      const res = await fetch('/api/v1/governance/atlas/run', { method: 'POST' });
      const data = await res.json();
      setRunResult(data);
      fetchStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setRunLoading(false);
    }
  };

  const modeConfig = status ? MODE_CONFIG[status.mode] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Governance Policy</h1>
              <p className="text-xs text-gray-400">Control how much authority Atlas has to act without the human CEO.</p>
            </div>
          </div>
          <button onClick={fetchStatus} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Mode indicator */}
      {status && modeConfig && (
        <div className={`border rounded-2xl p-6 space-y-4 ${modeConfig.color}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-2.5 h-2.5 rounded-full ${modeConfig.dot}`} />
              <div className="flex items-center space-x-2">
                {modeConfig.icon}
                <span className="text-sm font-bold">{modeConfig.label} Mode</span>
              </div>
            </div>
            <span className="text-[10px] font-mono opacity-60">{status.envVar}={status.mode.toUpperCase()}</span>
          </div>
          <p className="text-xs leading-relaxed opacity-80">{modeConfig.description}</p>

          <div className="grid grid-cols-3 gap-3">
            {status.validModes.map((m) => (
              <div key={m} className={`px-3 py-2 rounded-lg text-center text-[10px] font-mono font-bold uppercase ${m === status.mode ? 'bg-white/60 ring-1 ring-current' : 'opacity-30'}`}>
                {m}
              </div>
            ))}
          </div>

          {status.mode !== 'supervised' && (
            <div className="bg-white/40 rounded-lg px-3 py-2 text-[10px] font-mono">
              To change mode: set <span className="font-bold">GOVERNANCE_MODE</span> in your <span className="font-bold">.env.local</span> file
            </div>
          )}
        </div>
      )}

      {/* Pending decisions + Atlas run button */}
      {status && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xs font-semibold text-gray-900">Decision Queue</h2>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {status.pendingDecisions > 0
                  ? `${status.pendingDecisions} decision${status.pendingDecisions > 1 ? 's' : ''} pending review`
                  : 'Queue is clear — no pending decisions'}
              </p>
            </div>
            {status.pendingDecisions > 0 && (
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-brand-bronze text-white text-[11px] font-bold">
                {status.pendingDecisions}
              </span>
            )}
          </div>

          {status.mode !== 'supervised' && status.pendingDecisions > 0 && (
            <button
              onClick={handleRunAtlas}
              disabled={runLoading}
              className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-black text-white rounded-xl text-xs font-semibold hover:bg-black/90 disabled:opacity-40 transition-colors"
            >
              {runLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
              <span>{runLoading ? `Atlas reviewing ${status.pendingDecisions} decisions…` : 'Run Atlas as Acting CEO'}</span>
            </button>
          )}

          {status.mode === 'supervised' && (
            <div className="flex items-center space-x-2 text-[11px] text-blue-600 bg-blue-50 rounded-lg px-3 py-2">
              <Shield className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Supervised mode — switch to hybrid or autonomous to enable Atlas auto-approval.</span>
            </div>
          )}

          {/* Run result */}
          <AnimatePresence>
            {runResult && (
              <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Auto-approved', value: runResult.autoApproved, color: 'text-emerald-700' },
                    { label: 'Atlas approved', value: runResult.atlasApproved, color: 'text-brand-bronze' },
                    { label: 'Escalated', value: runResult.escalatedToCeo, color: 'text-amber-700' },
                  ].map((stat) => (
                    <div key={stat.label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center space-y-0.5">
                      <p className={`text-lg font-mono font-bold ${stat.color}`}>{stat.value}</p>
                      <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">{stat.label}</p>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {runResult.results.map((r) => {
                    const ac = ACTION_CONFIG[r.action];
                    return (
                      <div key={r.id} className="flex items-start space-x-3 py-2 border-b border-gray-50 last:border-none">
                        <span className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold flex-shrink-0 ${ac.color}`}>
                          {ac.icon}
                          <span>{ac.label}</span>
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{r.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{r.reason}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Governance log */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
        <h2 className="text-xs font-semibold text-gray-900">Governance Audit Log</h2>
        {log.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No governance actions yet.</p>
        ) : (
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {log.map((entry) => {
              const ac = ACTION_CONFIG[entry.action as keyof typeof ACTION_CONFIG];
              return (
                <div key={entry.id} className="flex items-start space-x-3 py-2 border-b border-gray-50 last:border-none">
                  {ac ? (
                    <span className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold flex-shrink-0 ${ac.color}`}>
                      {ac.icon}
                      <span>{ac.label}</span>
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono text-gray-400 flex-shrink-0 py-0.5">{entry.action}</span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-gray-600 line-clamp-2">{entry.text.replace('[GOVERNANCE] ', '')}</p>
                    <p className="text-[9px] font-mono text-gray-300 mt-0.5">
                      {entry.executive && `${entry.executive} · `}
                      {new Date(entry.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
