/**
 * Atlas OS — Organization Pulse (Real-Time)
 *
 * All 10 executives shown as nodes. Particles are driven exclusively by real
 * SSE agent_activity events — no random simulation. When Zephyr sends data
 * to Aurelia, a particle travels Zephyr→Aurelia on the canvas in real time.
 *
 * Clicking any node opens a live activity panel for that executive.
 * Agents join/leave dynamically as they become active or idle.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Agent } from '../types';
import { X, Activity, Zap, Clock, CheckCircle2, ArrowRight } from 'lucide-react';

interface OrganizationPulseProps {
  agents: Agent[];
}

// ─── SSE event shape ──────────────────────────────────────────────────────────

interface AgentActivityEvent {
  executiveId: string;
  executiveName: string;
  organizationId: string;
  status: 'IDLE' | 'ACTIVE' | 'BUSY' | 'OFFLINE';
  action: string | null;
  toExecutiveId: string | null;
  toExecutiveName: string | null;
  ts: string;
}

// ─── Canvas types ─────────────────────────────────────────────────────────────

interface NodeLayout {
  id: string;         // executive DB id
  name: string;
  role: string;
  avatar: string;
  x: number;         // 0–1 normalized
  y: number;
  color: string;
  radius: number;
}

interface LiveParticle {
  id: string;
  fromId: string;
  toId: string;
  progress: number;
  speed: number;
  color: string;
  size: number;
  label: string;
}

// ─── Activity log entry ───────────────────────────────────────────────────────

interface ActivityEntry {
  id: string;
  executiveName: string;
  action: string;
  toExecutiveName: string | null;
  status: string;
  ts: string;
}

// ─── Colour palette per executive role ───────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  'CEO':        '#1c1b1b',
  'Finance':    '#b45309',
  'Sales':      '#047857',
  'Marketing':  '#0369a1',
  'Customer':   '#7c3aed',
  'HR':         '#be185d',
  'Operations': '#0f766e',
  'Legal':      '#92400e',
  'Developer':  '#1d4ed8',
  'Intelligence': '#6d28d9',
};

function agentColor(role: string): string {
  for (const [key, color] of Object.entries(ROLE_COLORS)) {
    if (role.toLowerCase().includes(key.toLowerCase())) return color;
  }
  return '#6b7280';
}

// ─── Position 10 nodes in a circle with CEO at center ────────────────────────

function buildLayout(agents: Agent[]): NodeLayout[] {
  if (agents.length === 0) return [];

  const sorted = [...agents].sort((a, b) => a.name.localeCompare(b.name));

  // CEO goes to center
  const ceoIdx = sorted.findIndex((a) =>
    a.name.toLowerCase().includes('atlas') || a.role.toLowerCase().includes('ceo'),
  );
  const ceo = ceoIdx >= 0 ? sorted.splice(ceoIdx, 1)[0] : null;

  const layouts: NodeLayout[] = [];

  // Remaining agents arranged in a circle
  const count = sorted.length;
  sorted.forEach((agent, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    layouts.push({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      avatar: agent.avatar,
      x: 0.5 + 0.38 * Math.cos(angle),
      y: 0.5 + 0.38 * Math.sin(angle),
      color: agentColor(agent.role),
      radius: 28,
    });
  });

  // CEO at center (larger node)
  if (ceo) {
    layouts.push({
      id: ceo.id,
      name: ceo.name,
      role: ceo.role,
      avatar: ceo.avatar,
      x: 0.5,
      y: 0.5,
      color: '#1c1b1b',
      radius: 38,
    });
  }

  return layouts;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function OrganizationPulse({ agents }: OrganizationPulseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animFrameRef = useRef<number>(0);

  // Live state driven by SSE
  const [liveStatus, setLiveStatus] = useState<Record<string, AgentActivityEvent>>({});
  const [particles, setParticles] = useState<LiveParticle[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityEntry[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [connected, setConnected] = useState(false);

  const layout = buildLayout(agents);

  // ── SSE connection ──────────────────────────────────────────────────────────

  useEffect(() => {
    const es = new EventSource('/api/v1/stream-events');

    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type !== 'agent_activity') return;
        const data: AgentActivityEvent = payload.data;

        // Update live status for this executive
        setLiveStatus((prev) => ({ ...prev, [data.executiveId]: data }));

        // Add to activity log (cap at 50)
        const entry: ActivityEntry = {
          id: `${data.executiveId}-${data.ts}`,
          executiveName: data.executiveName,
          action: data.action ?? 'Status update',
          toExecutiveName: data.toExecutiveName,
          status: data.status,
          ts: data.ts,
        };
        setActivityLog((prev) => [entry, ...prev].slice(0, 50));

        // Spawn a real particle if this is a data exchange between two agents
        if (data.toExecutiveId) {
          const newParticle: LiveParticle = {
            id: `p-${Date.now()}-${Math.random()}`,
            fromId: data.executiveId,
            toId: data.toExecutiveId,
            progress: 0,
            speed: 0.006 + Math.random() * 0.004,
            color: agentColor(
              agents.find((a) => a.id === data.executiveId)?.role ?? '',
            ),
            size: 3,
            label: data.action?.substring(0, 30) ?? '',
          };
          setParticles((prev) => [...prev, newParticle]);
        }
      } catch { /* ignore malformed */ }
    };

    return () => es.close();
  }, [agents]);

  // ── Advance particles on each frame ──────────────────────────────────────────

  const particlesRef = useRef(particles);
  useEffect(() => { particlesRef.current = particles; }, [particles]);

  // ── Canvas render loop ────────────────────────────────────────────────────────

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const getPos = (node: NodeLayout) => ({ x: node.x * W, y: node.y * H });

    // 1. Draw faint connection lines between all nodes and CEO
    const ceoNode = layout.find((n) => n.radius === 38);
    layout.forEach((node) => {
      if (!ceoNode || node.id === ceoNode.id) return;
      const p1 = getPos(node);
      const p2 = getPos(ceoNode);
      ctx.strokeStyle = 'rgba(0,0,0,0.05)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });
    ctx.setLineDash([]);

    // 2. Active data-exchange connections — bright line when busy
    const now = Date.now();
    Object.values(liveStatus).forEach((evt) => {
      if (!evt.toExecutiveId) return;
      const fromNode = layout.find((n) => n.id === evt.executiveId);
      const toNode = layout.find((n) => n.id === evt.toExecutiveId);
      if (!fromNode || !toNode) return;
      const age = now - new Date(evt.ts).getTime();
      if (age > 8000) return; // fade after 8s
      const alpha = Math.max(0, 1 - age / 8000);
      const p1 = getPos(fromNode);
      const p2 = getPos(toNode);
      ctx.strokeStyle = fromNode.color + Math.round(alpha * 200).toString(16).padStart(2, '0');
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
    });

    // 3. Draw and advance particles
    const alive: LiveParticle[] = [];
    particlesRef.current.forEach((p) => {
      const fromNode = layout.find((n) => n.id === p.fromId);
      const toNode = layout.find((n) => n.id === p.toId);
      if (!fromNode || !toNode) return;
      const fp = getPos(fromNode);
      const tp = getPos(toNode);
      const cx = fp.x + (tp.x - fp.x) * p.progress;
      const cy = fp.y + (tp.y - fp.y) * p.progress;

      // Glow
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.size * 4);
      grad.addColorStop(0, p.color + 'cc');
      grad.addColorStop(1, p.color + '00');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, p.size * 4, 0, Math.PI * 2);
      ctx.fill();

      // Core dot
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(cx, cy, p.size, 0, Math.PI * 2);
      ctx.fill();

      const next = { ...p, progress: p.progress + p.speed };
      if (next.progress < 1) alive.push(next);
    });

    if (alive.length !== particlesRef.current.length) {
      setParticles(alive);
    } else {
      // mutate in place for speed (avoids re-render noise)
      particlesRef.current.forEach((p, i) => { p.progress = alive[i]?.progress ?? 1; });
    }

    // 4. Draw nodes
    layout.forEach((node) => {
      const pos = getPos(node);
      const live = liveStatus[node.id];
      const isBusy = live?.status === 'BUSY';
      const isActive = live?.status === 'ACTIVE' || isBusy;

      // Pulse ring for active agents
      if (isActive) {
        const pulse = node.radius + 6 + Math.sin(Date.now() / 200) * 3;
        ctx.strokeStyle = node.color + '55';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, pulse, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Node fill
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.08)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, node.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = 'transparent';

      // Coloured ring
      ctx.strokeStyle = isActive ? node.color : node.color + '55';
      ctx.lineWidth = isBusy ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, node.radius, 0, Math.PI * 2);
      ctx.stroke();

      // Status arc sweep (animated when busy)
      if (isBusy) {
        const start = (Date.now() / 800) % (Math.PI * 2);
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, node.radius - 4, start, start + Math.PI * 0.7);
        ctx.stroke();
      }

      // Initials label
      const initials = node.name.split(/[\s(]/)[0].substring(0, 3);
      ctx.fillStyle = isBusy ? node.color : '#374151';
      ctx.font = `bold ${node.radius > 30 ? 11 : 9}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(initials, pos.x, pos.y - 4);

      // Status text
      const statusText = isBusy ? 'BUSY' : isActive ? 'ACTIVE' : 'IDLE';
      ctx.fillStyle = isBusy ? node.color : '#9ca3af';
      ctx.font = `500 7px ui-sans-serif, sans-serif`;
      ctx.fillText(statusText, pos.x, pos.y + 8);
    });

    animFrameRef.current = requestAnimationFrame(render);
  }, [layout, liveStatus]);

  // ── Canvas sizing + render loop ───────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const resize = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };
    resize();
    window.addEventListener('resize', resize);
    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [render]);

  // ── Click handler — hit-test nodes ───────────────────────────────────────────

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Scale mouse coords to canvas resolution
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const mx = (e.clientX - rect.left) * scaleX;
    const my = (e.clientY - rect.top) * scaleY;

    for (const node of layout) {
      const nx = node.x * canvas.width;
      const ny = node.y * canvas.height;
      if (Math.hypot(mx - nx, my - ny) <= node.radius + 8) {
        const agent = agents.find((a) => a.id === node.id);
        if (agent) setSelectedAgent(agent);
        return;
      }
    }
    // Click on empty area — deselect
    setSelectedAgent(null);
  };

  // ── Activity log for a specific agent ────────────────────────────────────────

  const agentLog = selectedAgent
    ? activityLog.filter((e) => e.executiveName.includes(selectedAgent.name.split(' ')[0]))
    : [];

  const liveData = selectedAgent ? liveStatus[selectedAgent.id] : null;

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">LIVE SYSTEM PULSE</span>
          <h1 className="text-xl font-sans font-semibold text-gray-900 mt-0.5">Organization Pulse</h1>
          <p className="text-xs text-gray-400 mt-1">
            Real-time inter-executive data exchange. Particles appear when agents actually communicate.
          </p>
        </div>
        <div className={`flex items-center space-x-2 text-[10px] font-mono px-3 py-1.5 rounded-lg border ${connected ? 'border-emerald-100 bg-emerald-50' : 'border-gray-100 bg-gray-50'}`}>
          <div className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
          <span className={connected ? 'text-emerald-700' : 'text-gray-500'}>
            {connected ? 'SSE LIVE' : 'CONNECTING…'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Canvas */}
        <div
          ref={containerRef}
          className="lg:col-span-3 bg-white border border-gray-100/60 rounded-2xl shadow-sm relative overflow-hidden"
          style={{ height: '500px' }}
        >
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-full cursor-pointer"
          />
          <div className="absolute bottom-4 left-4 bg-white/80 backdrop-blur-sm border border-gray-100 rounded-lg px-3 py-2 text-[10px] text-gray-400 font-mono space-y-0.5">
            <p>● Click any agent node to inspect live activity</p>
            <p>● Particles = real data being exchanged right now</p>
          </div>
          {/* Particle count badge */}
          {particles.length > 0 && (
            <div className="absolute top-4 right-4 flex items-center space-x-1.5 bg-brand-bronze/10 border border-brand-bronze/20 rounded-full px-3 py-1">
              <Zap className="w-3 h-3 text-brand-bronze animate-pulse" />
              <span className="text-[10px] font-mono text-brand-bronze font-bold">
                {particles.length} active exchange{particles.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Activity log */}
          <div>
            <h3 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest mb-2">
              Live Activity Feed
            </h3>
            <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
              {activityLog.length === 0 ? (
                <div className="p-4 text-center text-[10px] text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                  Waiting for agent activity…
                  <br />
                  <span className="text-gray-300">Trigger a workflow or qualify a lead to see live exchanges.</span>
                </div>
              ) : (
                activityLog.map((entry) => (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="px-3 py-2 bg-white border border-gray-100 rounded-lg text-[10px] font-mono hover:border-brand-bronze/20 transition-colors cursor-default"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className={`font-bold ${entry.status === 'BUSY' ? 'text-brand-bronze' : 'text-gray-700'}`}>
                        {entry.executiveName.split(' ')[0]}
                      </span>
                      <span className="text-gray-300 text-[9px]">
                        {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    {entry.toExecutiveName && (
                      <div className="flex items-center space-x-1 text-[9px] text-gray-400 mb-0.5">
                        <ArrowRight className="w-2.5 h-2.5" />
                        <span>{entry.toExecutiveName.split(' ')[0]}</span>
                      </div>
                    )}
                    <p className="text-gray-500 leading-snug truncate">{entry.action}</p>
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Agent detail drawer */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 bg-black/10 backdrop-blur-xs z-50 flex justify-end">
            <div className="absolute inset-0" onClick={() => setSelectedAgent(null)} />
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="relative z-10 w-full max-w-md bg-white h-screen border-l border-gray-100 shadow-2xl flex flex-col"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <img
                    src={selectedAgent.avatar}
                    alt={selectedAgent.name}
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-xl object-cover border border-gray-100"
                  />
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{selectedAgent.name}</h2>
                    <p className="text-[10px] font-mono text-brand-bronze uppercase tracking-wider">{selectedAgent.role}</p>
                  </div>
                </div>
                <button onClick={() => setSelectedAgent(null)} className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-black">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Live status */}
                <div className={`p-4 rounded-xl border space-y-2 ${liveData?.status === 'BUSY' ? 'bg-brand-bronze/5 border-brand-bronze/20' : 'bg-gray-50 border-gray-100'}`}>
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full ${liveData?.status === 'BUSY' ? 'bg-brand-bronze animate-pulse' : liveData?.status === 'ACTIVE' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-600">
                      {liveData?.status ?? selectedAgent.status}
                    </span>
                  </div>
                  {liveData?.action && (
                    <p className="text-xs text-gray-700 leading-relaxed">{liveData.action}</p>
                  )}
                  {liveData?.toExecutiveName && (
                    <div className="flex items-center space-x-1.5 text-[10px] text-brand-bronze font-mono">
                      <ArrowRight className="w-3 h-3" />
                      <span>Exchanging with {liveData.toExecutiveName}</span>
                    </div>
                  )}
                  {!liveData && (
                    <p className="text-[11px] text-gray-400">{selectedAgent.lastAction}</p>
                  )}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Tasks Done', value: selectedAgent.metrics.tasksCompleted },
                    { label: 'Decisions', value: selectedAgent.metrics.decisionsMade },
                    { label: 'Value', value: `$${selectedAgent.metrics.valueGenerated.toLocaleString()}` },
                  ].map((m) => (
                    <div key={m.label} className="p-3 bg-white border border-gray-100 rounded-xl text-center">
                      <p className="text-[8px] font-mono text-gray-400 uppercase tracking-wider">{m.label}</p>
                      <p className="text-sm font-mono font-bold text-gray-900 mt-1">{m.value}</p>
                    </div>
                  ))}
                </div>

                {/* Recent activity for this agent */}
                <div>
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest mb-2">
                    Recent Activity
                  </h4>
                  {agentLog.length === 0 ? (
                    <p className="text-[11px] text-gray-400 bg-gray-50 border border-gray-100 rounded-xl p-4 text-center">
                      No activity recorded yet for this session.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto">
                      {agentLog.map((entry) => (
                        <div key={entry.id} className="px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className={`text-[9px] font-mono font-bold uppercase ${entry.status === 'BUSY' ? 'text-brand-bronze' : 'text-gray-500'}`}>
                              {entry.status}
                            </span>
                            <span className="text-[9px] font-mono text-gray-300">
                              {new Date(entry.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </div>
                          {entry.toExecutiveName && (
                            <div className="flex items-center space-x-1 text-[9px] text-brand-bronze mb-0.5">
                              <ArrowRight className="w-2.5 h-2.5" />
                              <span>{entry.toExecutiveName}</span>
                            </div>
                          )}
                          <p className="text-[11px] text-gray-600 leading-snug">{entry.action}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Goals */}
                <div>
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest mb-2">Active Objectives</h4>
                  <div className="space-y-1.5">
                    {selectedAgent.goals.map((goal, i) => (
                      <div key={i} className="flex items-start space-x-2 text-xs text-gray-600">
                        <CheckCircle2 className="w-3 h-3 text-brand-bronze mt-0.5 shrink-0" />
                        <span>{goal}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
