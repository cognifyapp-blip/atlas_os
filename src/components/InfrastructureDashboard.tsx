/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import {
  Database,
  Activity,
  Users,
  ListChecks,
  AlertTriangle,
  Plug,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Server,
  Timer,
  Zap,
  RotateCcw,
} from 'lucide-react';

// ─── Types ─────────────────────────────────────────────────────────────────────

interface QueueMetric {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
  isPaused: boolean;
}

interface WorkerInfo {
  name: string;
  queue: string;
  running: boolean;
  processed: number;
  failed: number;
}

interface IntegrationStatus {
  provider: string;
  status: 'connected' | 'disconnected' | 'error';
  lastSync?: string;
  error?: string;
}

interface InfrastructureMetrics {
  redis: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    connected: boolean;
    latencyMs?: number;
    host: string;
    port: number;
    error?: string;
  };
  queues: {
    totalWaiting: number;
    totalActive: number;
    totalFailed: number;
    metrics: QueueMetric[];
  };
  workers: {
    total: number;
    running: number;
    stopped: number;
    workers: WorkerInfo[];
  };
  integrations: {
    total: number;
    connected: number;
    providers: IntegrationStatus[];
  };
  checkedAt: string;
}

type AnyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'connected' | 'disconnected' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: AnyStatus): string {
  switch (status) {
    case 'healthy':
    case 'connected':
      return 'text-emerald-600 bg-emerald-50 border-emerald-100';
    case 'degraded':
      return 'text-amber-600 bg-amber-50 border-amber-100';
    case 'unhealthy':
    case 'disconnected':
    case 'error':
      return 'text-red-600 bg-red-50 border-red-100';
    default:
      return 'text-gray-600 bg-gray-50 border-gray-100';
  }
}

function StatusIcon({ status }: { status: AnyStatus }) {
  switch (status) {
    case 'healthy':
    case 'connected':
      return <CheckCircle2 className="w-3 h-3" />;
    case 'degraded':
      return <AlertCircle className="w-3 h-3" />;
    default:
      return <XCircle className="w-3 h-3" />;
  }
}

function StatusBadge({ status }: { status: AnyStatus }) {
  return (
    <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border ${statusColor(status)}`}>
      <StatusIcon status={status} />
      <span>{status}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function InfrastructureDashboard({ authFetch }: { authFetch?: (url: string, options?: RequestInit) => Promise<Response> }) {
  const [metrics, setMetrics] = useState<InfrastructureMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const doFetch = authFetch ?? fetch;

  const fetchMetrics = async () => {
    try {
      setFetchError(null);
      const res = await doFetch('/api/v1/infrastructure/metrics');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMetrics(data.metrics);
      setLastRefresh(new Date());
    } catch (err: any) {
      setFetchError(err.message ?? 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMetrics(); }, []);

  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(fetchMetrics, 5000);
    return () => clearInterval(id);
  }, [autoRefresh]);

  // ─── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-5 h-5 animate-spin text-brand-bronze mx-auto" />
          <p className="text-[11px] text-gray-400 font-mono">Polling infrastructure…</p>
        </div>
      </div>
    );
  }

  // ─── Error state ────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <div className="bg-white border border-red-100 rounded-2xl p-5 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <XCircle className="w-5 h-5 text-red-500 shrink-0" />
          <div>
            <p className="text-xs font-semibold text-red-900">Infrastructure Monitoring Unavailable</p>
            <p className="text-[11px] text-red-500 mt-0.5">{fetchError}</p>
          </div>
        </div>
        <button
          onClick={fetchMetrics}
          className="px-3 py-1.5 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg text-[11px] font-semibold text-red-700 transition-colors cursor-pointer"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!metrics) return null;

  const activeQueueRows = metrics.queues.metrics.filter(
    (q) => q.waiting > 0 || q.active > 0 || q.failed > 0 || q.delayed > 0,
  );

  const totalRetries = metrics.queues.metrics.reduce((sum, q) => sum + q.delayed, 0);

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
          <Server className="w-4 h-4" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest">
            Infrastructure Health Monitor
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
            onClick={fetchMetrics}
            title="Refresh now"
            className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer group"
          >
            <RefreshCw className="w-3.5 h-3.5 text-gray-400 group-hover:text-brand-bronze group-hover:rotate-180 transition-all duration-300" />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* ── Top stat cards ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {/* Redis */}
          <div className="lg:col-span-2 p-4 bg-gray-50/50 border border-gray-100/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <Database className="w-4 h-4 text-brand-bronze" />
              <StatusBadge status={metrics.redis.status} />
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Redis Connection</p>
              <p className="text-base font-mono font-bold text-gray-900 mt-0.5">
                {metrics.redis.connected ? 'Connected' : 'Disconnected'}
              </p>
              <p className="text-[10px] text-gray-400 mt-1 font-mono">
                {metrics.redis.host}:{metrics.redis.port}
                {metrics.redis.latencyMs !== undefined && (
                  <span className="ml-2 text-emerald-600">{metrics.redis.latencyMs}ms</span>
                )}
              </p>
            </div>
          </div>

          {/* Active Workers */}
          <div className="p-4 bg-gray-50/50 border border-gray-100/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <Zap className="w-4 h-4 text-brand-bronze" />
              <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border ${
                metrics.workers.running === metrics.workers.total
                  ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                  : 'text-amber-600 bg-amber-50 border-amber-100'
              }`}>
                {metrics.workers.running === metrics.workers.total
                  ? <CheckCircle2 className="w-3 h-3" />
                  : <AlertCircle className="w-3 h-3" />}
                <span>{metrics.workers.running}/{metrics.workers.total}</span>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Active Workers</p>
              <p className="text-base font-mono font-bold text-gray-900 mt-0.5">{metrics.workers.running}</p>
              {metrics.workers.stopped > 0 && (
                <p className="text-[10px] text-amber-600 mt-1">{metrics.workers.stopped} stopped</p>
              )}
            </div>
          </div>

          {/* Queue Lengths */}
          <div className="p-4 bg-gray-50/50 border border-gray-100/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <Activity className="w-4 h-4 text-brand-bronze" />
              <div className="flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border text-blue-600 bg-blue-50 border-blue-100">
                <Activity className="w-3 h-3" />
                <span>{metrics.queues.totalWaiting + metrics.queues.totalActive}</span>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Queue Lengths</p>
              <p className="text-base font-mono font-bold text-gray-900 mt-0.5">{metrics.queues.totalActive} active</p>
              <p className="text-[10px] text-gray-400 mt-1">{metrics.queues.totalWaiting} waiting</p>
            </div>
          </div>

          {/* Failed Jobs */}
          <div className="p-4 bg-gray-50/50 border border-gray-100/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <AlertTriangle className="w-4 h-4 text-brand-bronze" />
              <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border ${
                metrics.queues.totalFailed > 0
                  ? 'text-red-600 bg-red-50 border-red-100'
                  : 'text-emerald-600 bg-emerald-50 border-emerald-100'
              }`}>
                {metrics.queues.totalFailed > 0 ? <XCircle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                <span>{metrics.queues.totalFailed}</span>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Failed Jobs</p>
              <p className={`text-base font-mono font-bold mt-0.5 ${metrics.queues.totalFailed > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {metrics.queues.totalFailed === 0 ? 'All Clear' : metrics.queues.totalFailed}
              </p>
            </div>
          </div>

          {/* Retry Count */}
          <div className="p-4 bg-gray-50/50 border border-gray-100/60 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <RotateCcw className="w-4 h-4 text-brand-bronze" />
              <div className={`flex items-center space-x-1 px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border ${
                totalRetries > 0
                  ? 'text-amber-600 bg-amber-50 border-amber-100'
                  : 'text-gray-500 bg-gray-50 border-gray-100'
              }`}>
                <RotateCcw className="w-3 h-3" />
                <span>{totalRetries}</span>
              </div>
            </div>
            <div>
              <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Retry Count</p>
              <p className={`text-base font-mono font-bold mt-0.5 ${totalRetries > 0 ? 'text-amber-600' : 'text-gray-900'}`}>
                {totalRetries === 0 ? 'None' : totalRetries}
              </p>
              <p className="text-[10px] text-gray-400 mt-1">delayed jobs</p>
            </div>
          </div>
        </div>

        {/* ── Queue Details ────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h4 className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest flex items-center space-x-2">
            <ListChecks className="w-3.5 h-3.5" />
            <span>Queue Status — {metrics.queues.metrics.length} queues registered</span>
          </h4>

          {activeQueueRows.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-56 overflow-y-auto pr-1">
              {activeQueueRows.map((q) => (
                <div
                  key={q.queue}
                  className="p-3 bg-white border border-gray-100/60 rounded-xl space-y-2 hover:border-brand-bronze/20 transition-all"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-mono font-semibold text-gray-800 uppercase tracking-wide">
                      {q.queue}
                    </span>
                    {q.isPaused && (
                      <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[8px] font-bold uppercase rounded border border-amber-100">
                        Paused
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {[
                      { label: 'Wait', value: q.waiting, color: 'text-gray-700' },
                      { label: 'Active', value: q.active, color: 'text-blue-600' },
                      { label: 'Done', value: q.completed, color: 'text-emerald-600' },
                      { label: 'Failed', value: q.failed, color: q.failed > 0 ? 'text-red-600' : 'text-gray-300' },
                      { label: 'Delayed', value: q.delayed, color: q.delayed > 0 ? 'text-amber-600' : 'text-gray-300' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <p className="text-[7px] text-gray-400 font-mono uppercase">{label}</p>
                        <p className={`text-xs font-mono font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-5 text-center bg-gray-50/30 border border-gray-100/60 rounded-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
              <p className="text-xs text-gray-400 font-sans">All queues idle — no pending jobs</p>
            </div>
          )}
        </div>

        {/* ── Workers + Integrations ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Worker Pool */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest flex items-center space-x-2">
              <Users className="w-3.5 h-3.5" />
              <span>Worker Pool ({metrics.workers.total} registered)</span>
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {metrics.workers.workers.map((w) => (
                <div
                  key={w.name}
                  className="px-3 py-2 bg-white border border-gray-100/60 rounded-lg flex items-center justify-between hover:border-brand-bronze/20 transition-all"
                >
                  <div className="flex items-center space-x-2.5">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${w.running ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                    <div>
                      <p className="text-[10px] font-mono font-semibold text-gray-800">{w.name}</p>
                      <p className="text-[9px] text-gray-400 font-mono">{w.queue}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3 text-[9px] font-mono shrink-0">
                    <span className="text-emerald-600">{w.processed} done</span>
                    {w.failed > 0 && <span className="text-red-600">{w.failed} failed</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Integration Status */}
          <div className="space-y-3">
            <h4 className="text-[10px] font-mono text-gray-400 font-bold uppercase tracking-widest flex items-center space-x-2">
              <Plug className="w-3.5 h-3.5" />
              <span>Integration Status ({metrics.integrations.total} providers)</span>
            </h4>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {metrics.integrations.providers.length > 0 ? (
                metrics.integrations.providers.map((intg) => (
                  <div
                    key={intg.provider}
                    className="px-3 py-2 bg-white border border-gray-100/60 rounded-lg flex items-center justify-between hover:border-brand-bronze/20 transition-all"
                  >
                    <div>
                      <p className="text-[10px] font-mono font-semibold text-gray-800">{intg.provider}</p>
                      {intg.lastSync && (
                        <p className="text-[9px] text-gray-400 font-mono">
                          Last sync: {new Date(intg.lastSync).toLocaleTimeString()}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={intg.status} />
                  </div>
                ))
              ) : (
                <div className="p-5 text-center bg-amber-50/30 border border-amber-100/60 rounded-xl space-y-1.5">
                  <Plug className="w-5 h-5 text-amber-500 mx-auto" />
                  <p className="text-xs font-semibold text-amber-700">No Active Integrations</p>
                  <p className="text-[10px] text-amber-600 font-sans">Connect providers to sync external data</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
