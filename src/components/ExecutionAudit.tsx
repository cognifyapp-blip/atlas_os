/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ScrollText,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  DollarSign,
  RefreshCw,
  Timer,
  TrendingUp,
  AlertTriangle,
  BarChart2,
  Cpu,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type AuditStatus = 'queued' | 'started' | 'completed' | 'failed' | 'retrying';

interface AuditEntry {
  id: string;
  ts: string;
  organizationId: string;
  userId: string;
  correlationId: string;
  jobId?: string;
  jobName: string;
  queue: string;
  worker: string;
  executiveId?: string;
  executiveName?: string;
  status: AuditStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  retryCount: number;
  error?: string;
  tokensUsed?: number;
  costUsd?: number;
  context?: Record<string, unknown>;
}

interface ExecutiveSummary {
  name: string;
  processed: number;
  succeeded: number;
  failed: number;
  totalDurationMs: number;
  avgDurationMs: number;
}

interface AuditTotals {
  total: number;
  succeeded: number;
  failed: number;
  retried: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms?: number): string {
  if (!ms) return '—';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtCost(usd?: number): string {
  if (!usd) return '—';
  return usd < 0.01 ? `<$0.01` : `$${usd.toFixed(4)}`;
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

const STATUS_STYLES: Record<AuditStatus, { dot: string; badge: string; label: string }> = {
  queued:    { dot: 'bg-gray-400',    badge: 'text-gray-600 bg-gray-50 border-gray-200',       label: 'Queued' },
  started:   { dot: 'bg-blue-500 animate-pulse', badge: 'text-blue-600 bg-blue-50 border-blue-200', label: 'Running' },
  completed: { dot: 'bg-emerald-500', badge: 'text-emerald-700 bg-emerald-50 border-emerald-200', label: 'Done' },
  failed:    { dot: 'bg-red-500',     badge: 'text-red-700 bg-red-50 border-red-200',           label: 'Failed' },
  retrying:  { dot: 'bg-amber-500 animate-pulse', badge: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Retrying' },
};

function StatusPill({ status }: { status: AuditStatus }) {
  const s = STATUS_STYLES[status] ?? STATUS_STYLES.queued;
  return (
    <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border ${s.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      <span>{s.label}</span>
    </span>
  );
}

/** Compact timeline row for a single audit entry */
function AuditRow({ entry }: { entry: AuditEntry }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-3 py-2 rounded-lg hover:bg-gray-50/60 transition-all text-[10px] font-mono group"
    >
      {/* Job name + status */}
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center space-x-2">
          <StatusPill status={entry.status} />
          <span className="text-gray-700 font-semibold truncate">{entry.jobName}</span>
        </div>
        <div className="flex items-center space-x-2 text-[9px] text-gray-400">
          <span className="uppercase">{entry.queue}</span>
          {entry.retryCount > 0 && (
            <span className="text-amber-600">↺ {entry.retryCount} retries</span>
          )}
          {entry.error && (
            <span className="text-red-500 truncate max-w-[200px]">{entry.error}</span>
          )}
        </div>
      </div>

      {/* Tokens */}
      <div className="text-right text-gray-500">
        {entry.tokensUsed ? (
          <span className="flex items-center space-x-1 text-violet-600">
            <Cpu className="w-2.5 h-2.5" />
            <span>{entry.tokensUsed.toLocaleString()}</span>
          </span>
        ) : <span className="text-gray-300">—</span>}
      </div>

      {/* Cost */}
      <div className="text-right text-gray-500">
        {entry.costUsd ? (
          <span className="flex items-center space-x-1 text-emerald-600">
            <DollarSign className="w-2.5 h-2.5" />
            <span>{fmtCost(entry.costUsd)}</span>
          </span>
        ) : <span className="text-gray-300">—</span>}
      </div>

      {/* Duration */}
      <div className="text-right">
        <span className={entry.durationMs ? 'text-gray-600' : 'text-gray-300'}>
          {fmtDuration(entry.durationMs)}
        </span>
      </div>

      {/* Timestamp */}
      <div className="text-right text-gray-400 text-[9px] shrink-0">
        {fmtTime(entry.completedAt ?? entry.startedAt ?? entry.ts)}
      </div>
    </motion.div>
  );
}

/** Expandable per-executive card */
function ExecutiveCard({
  executiveId,
  summary,
  entries,
}: {
  executiveId: string;
  summary: ExecutiveSummary;
  entries: AuditEntry[];
}) {
  const [expanded, setExpanded] = useState(false);

  const successRate = summary.processed > 0
    ? Math.round((summary.succeeded / summary.processed) * 100)
    : 100;

  return (
    <div className="bg-white border border-gray-100/60 rounded-xl overflow-hidden hover:border-brand-bronze/20 transition-all">
      {/* Card header — always visible */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full px-4 py-3 flex items-center justify-between gap-4 hover:bg-gray-50/40 transition-all cursor-pointer"
      >
        <div className="flex items-center space-x-3 min-w-0">
          {/* Success rate ring indicator */}
          <div className="shrink-0 relative w-8 h-8">
            <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90">
              <circle cx="16" cy="16" r="12" fill="none" stroke="#f3f4f6" strokeWidth="4" />
              <circle
                cx="16" cy="16" r="12"
                fill="none"
                stroke={successRate === 100 ? '#10b981' : successRate >= 80 ? '#f59e0b' : '#ef4444'}
                strokeWidth="4"
                strokeDasharray={`${(successRate / 100) * 75.4} 75.4`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-[7px] font-bold text-gray-600 rotate-0">
              {successRate}%
            </span>
          </div>

          <div className="min-w-0">
            <p className="text-xs font-bold text-gray-900 text-left">{summary.name}</p>
            <p className="text-[9px] text-gray-400 font-mono text-left">
              {summary.processed} jobs today · avg {fmtDuration(summary.avgDurationMs)}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 shrink-0">
          {/* Mini stat pills */}
          <div className="hidden sm:flex items-center space-x-2 text-[9px] font-mono">
            <span className="flex items-center space-x-1 text-emerald-600">
              <CheckCircle2 className="w-2.5 h-2.5" />
              <span>{summary.succeeded}</span>
            </span>
            {summary.failed > 0 && (
              <span className="flex items-center space-x-1 text-red-500">
                <XCircle className="w-2.5 h-2.5" />
                <span>{summary.failed}</span>
              </span>
            )}
          </div>
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
            : <ChevronRight className="w-3.5 h-3.5 text-gray-400" />}
        </div>
      </button>

      {/* Expanded history */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-gray-50 px-2 py-2">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-1 text-[8px] font-mono text-gray-400 uppercase tracking-wider">
                <span>Job</span>
                <span className="text-right">Tokens</span>
                <span className="text-right">Cost</span>
                <span className="text-right">Duration</span>
                <span className="text-right">Time</span>
              </div>

              <div className="space-y-0.5 max-h-60 overflow-y-auto">
                {entries.length > 0 ? (
                  entries.slice(0, 30).map((e) => <AuditRow key={e.id} entry={e} />)
                ) : (
                  <div className="py-6 text-center">
                    <p className="text-[11px] text-gray-400 font-sans">No job history yet today</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExecutionAudit({ authFetch }: { authFetch?: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [summary, setSummary] = useState<Record<string, ExecutiveSummary>>({});
  const [totals, setTotals] = useState<AuditTotals>({ total: 0, succeeded: 0, failed: 0, retried: 0 });
  const [recentEntries, setRecentEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [activeTab, setActiveTab] = useState<'executives' | 'timeline'>('executives');

  const doFetch = authFetch ?? fetch;

  const fetchData = useCallback(async () => {
    try {
      setFetchError(null);
      const [summaryRes, recentRes] = await Promise.all([
        doFetch('/api/v1/audit/summary'),
        doFetch('/api/v1/audit/recent?limit=100'),
      ]);
      if (!summaryRes.ok) throw new Error(`Audit summary: HTTP ${summaryRes.status}`);
      if (!recentRes.ok) throw new Error(`Audit recent: HTTP ${recentRes.status}`);

      const summaryData = await summaryRes.json();
      const recentData = await recentRes.json();

      setSummary(summaryData.summary ?? {});
      setTotals(summaryData.totals ?? { total: 0, succeeded: 0, failed: 0, retried: 0 });
      setRecentEntries(recentData.entries ?? []);
      setLastRefresh(new Date());
    } catch (err: any) {
      setFetchError(err.message ?? 'Failed to load audit data');
    } finally {
      setLoading(false);
    }
  }, [doFetch]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchData, 8000);
    return () => clearInterval(id);
  }, [autoRefresh, fetchData]);

  // Group recent entries by executiveId for the per-card drill-down
  const entriesByExecutive = recentEntries.reduce<Record<string, AuditEntry[]>>((acc, e) => {
    const key = e.executiveId ?? '__system__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(e);
    return acc;
  }, {});

  // Build Mission Control sentences from daily summary
  const summaryLines = Object.entries(summary).map(([, s]) => {
    const verb = s.processed === 1 ? 'processed' : 'processed';
    const topQueue = recentEntries
      .filter((e) => e.executiveName === s.name && e.status === 'completed')
      .reduce<Record<string, number>>((acc, e) => {
        const q = e.queue;
        acc[q] = (acc[q] ?? 0) + 1;
        return acc;
      }, {});
    const topQueueName = Object.entries(topQueue).sort((a, b) => b[1] - a[1])[0]?.[0];
    return `${s.name} ${verb} ${s.processed} job${s.processed !== 1 ? 's' : ''} today${topQueueName ? ` via ${topQueueName}` : ''}.`;
  });

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-bronze mx-auto" />
          <p className="text-[11px] text-gray-400 font-mono">Loading execution audit…</p>
        </div>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-900">Execution Audit Unavailable</p>
            <p className="text-[11px] text-red-500 mt-0.5">{fetchError}</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg text-[11px] font-semibold text-red-700 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  const hasData = totals.total > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden"
    >
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-gray-50 bg-gray-50/40 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-brand-bronze">
          <ScrollText className="w-4 h-4" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
            Execution Audit Trail
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-[9px] text-gray-400 font-mono flex items-center space-x-1.5">
            <Timer className="w-3 h-3" />
            <span>{lastRefresh.toLocaleTimeString()}</span>
          </span>
          <button
            onClick={() => setAutoRefresh((v) => !v)}
            className={`px-2 py-0.5 rounded text-[9px] font-mono font-semibold border transition-all ${
              autoRefresh
                ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                : 'bg-gray-50 text-gray-500 border-gray-100'
            }`}
          >
            {autoRefresh ? '● AUTO' : 'MANUAL'}
          </button>
          <button
            onClick={fetchData}
            title="Refresh now"
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer group"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-bronze group-hover:rotate-180 transition-all duration-300" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-5">
        {/* ── Global Totals ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total Jobs', value: totals.total, icon: <BarChart2 className="w-4 h-4" />, color: 'text-gray-900' },
            { label: 'Succeeded', value: totals.succeeded, icon: <CheckCircle2 className="w-4 h-4" />, color: 'text-emerald-600' },
            { label: 'Failed', value: totals.failed, icon: <XCircle className="w-4 h-4" />, color: totals.failed > 0 ? 'text-red-600' : 'text-gray-400' },
            { label: 'Retried', value: totals.retried, icon: <RefreshCw className="w-4 h-4" />, color: totals.retried > 0 ? 'text-amber-600' : 'text-gray-400' },
          ].map(({ label, value, icon, color }) => (
            <div key={label} className="p-3 bg-gray-50/50 border border-gray-100/60 rounded-xl flex items-center space-x-3">
              <div className={`${color} opacity-60`}>{icon}</div>
              <div>
                <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">{label}</p>
                <p className={`text-base font-mono font-bold ${color}`}>{value.toLocaleString()}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── Mission Control Sentences ────────────────────────────────────── */}
        {summaryLines.length > 0 && (
          <div className="p-4 bg-brand-bronze/5 border border-brand-bronze/10 rounded-xl space-y-2">
            <div className="flex items-center space-x-2 text-brand-bronze">
              <TrendingUp className="w-3.5 h-3.5" />
              <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Today's Executive Activity</span>
            </div>
            <div className="space-y-1">
              {summaryLines.map((line, i) => (
                <p key={i} className="text-xs text-gray-700 font-sans leading-relaxed">
                  <span className="text-brand-bronze font-semibold">›</span> {line}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab switcher ─────────────────────────────────────────────────── */}
        <div className="flex space-x-1 bg-gray-50/50 p-0.5 rounded-lg w-fit">
          {(['executives', 'timeline'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-mono font-semibold uppercase tracking-wide transition-all cursor-pointer ${
                activeTab === tab
                  ? 'bg-white text-gray-900 shadow-sm border border-gray-100'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab === 'executives' ? 'By Executive' : 'Live Timeline'}
            </button>
          ))}
        </div>

        {/* ── Tab: By Executive ────────────────────────────────────────────── */}
        {activeTab === 'executives' && (
          <div className="space-y-2">
            {Object.keys(summary).length > 0 ? (
              Object.entries(summary).map(([execId, s]) => (
                <ExecutiveCard
                  key={execId}
                  executiveId={execId}
                  summary={s}
                  entries={entriesByExecutive[execId] ?? []}
                />
              ))
            ) : (
              <div className="py-10 text-center bg-gray-50/30 border border-gray-100/60 rounded-xl space-y-3">
                <Cpu className="w-6 h-6 text-gray-300 mx-auto" />
                <div>
                  <p className="text-xs font-semibold text-gray-500">No execution history yet</p>
                  <p className="text-[11px] text-gray-400 mt-1 font-sans">
                    Audit entries appear here as AI executives process jobs through the queue system.
                  </p>
                </div>
              </div>
            )}

            {/* System-level jobs without an executive */}
            {entriesByExecutive['__system__']?.length > 0 && (
              <ExecutiveCard
                executiveId="__system__"
                summary={{
                  name: 'System / Background',
                  processed: entriesByExecutive['__system__'].length,
                  succeeded: entriesByExecutive['__system__'].filter(e => e.status === 'completed').length,
                  failed: entriesByExecutive['__system__'].filter(e => e.status === 'failed').length,
                  totalDurationMs: entriesByExecutive['__system__'].reduce((s, e) => s + (e.durationMs ?? 0), 0),
                  avgDurationMs: Math.round(
                    entriesByExecutive['__system__'].reduce((s, e) => s + (e.durationMs ?? 0), 0) /
                    (entriesByExecutive['__system__'].length || 1)
                  ),
                }}
                entries={entriesByExecutive['__system__']}
              />
            )}
          </div>
        )}

        {/* ── Tab: Live Timeline ───────────────────────────────────────────── */}
        {activeTab === 'timeline' && (
          <div className="space-y-1">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-3 py-1.5 text-[8px] font-mono text-gray-400 uppercase tracking-wider border-b border-gray-50">
              <span>Job · Executive · Queue</span>
              <span className="text-right">Tokens</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Duration</span>
              <span className="text-right">Time</span>
            </div>

            <div className="max-h-[400px] overflow-y-auto space-y-0 divide-y divide-gray-50/60">
              {recentEntries.length > 0 ? (
                recentEntries.slice(0, 50).map((entry) => (
                  <div key={entry.id} className="group">
                    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 items-center px-3 py-2 hover:bg-gray-50/60 transition-all text-[10px] font-mono">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center space-x-2">
                          <StatusPill status={entry.status} />
                          <span className="text-gray-700 font-semibold truncate">{entry.jobName}</span>
                        </div>
                        <div className="flex items-center space-x-2 text-[9px] text-gray-400">
                          {entry.executiveName && (
                            <span className="text-brand-bronze font-semibold">{entry.executiveName}</span>
                          )}
                          <span className="uppercase">{entry.queue}</span>
                          {entry.retryCount > 0 && (
                            <span className="text-amber-600">↺ {entry.retryCount}</span>
                          )}
                          {entry.error && (
                            <span className="text-red-500 truncate max-w-[180px]" title={entry.error}>
                              {entry.error}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right">
                        {entry.tokensUsed ? (
                          <span className="flex items-center space-x-1 text-violet-600">
                            <Cpu className="w-2.5 h-2.5" />
                            <span>{entry.tokensUsed.toLocaleString()}</span>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </div>

                      <div className="text-right">
                        {entry.costUsd ? (
                          <span className="flex items-center space-x-1 text-emerald-600">
                            <DollarSign className="w-2.5 h-2.5" />
                            <span>{fmtCost(entry.costUsd)}</span>
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </div>

                      <div className="text-right text-gray-600">
                        {fmtDuration(entry.durationMs)}
                      </div>

                      <div className="text-right text-gray-400 text-[9px] shrink-0">
                        {fmtTime(entry.completedAt ?? entry.startedAt ?? entry.ts)}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-10 text-center">
                  <p className="text-xs text-gray-400 font-sans">No jobs processed yet</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
