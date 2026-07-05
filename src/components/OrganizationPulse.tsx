/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Agent } from '../types';
import { Building, Sparkles, TrendingUp, Cpu, RefreshCw, X } from 'lucide-react';

interface OrganizationPulseProps {
  agents: Agent[];
}

interface Node {
  id: string;
  name: string;
  agentId: string;
  x: number;
  y: number;
  radius: number;
  color: string;
}

interface Particle {
  fromNode: string;
  toNode: string;
  progress: number; // 0 to 1
  speed: number;
  size: number;
  color: string;
}

export default function OrganizationPulse({ agents }: OrganizationPulseProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);

  const nodes: Node[] = [
    { id: 'exec', name: 'Executive Office', agentId: 'ceo_assistant', x: 0.5, y: 0.5, radius: 45, color: '#1c1b1b' },
    { id: 'finance', name: 'Finance Ledger', agentId: 'finance_ai', x: 0.2, y: 0.3, radius: 36, color: '#9a4614' },
    { id: 'sales', name: 'Sales Pipeline', agentId: 'sales_ai', x: 0.8, y: 0.3, radius: 36, color: '#047857' },
    { id: 'marketing', name: 'Marketing Studio', agentId: 'marketing_ai', x: 0.5, y: 0.8, radius: 36, color: '#0369a1' },
  ];

  const connections = [
    { from: 'exec', to: 'finance' },
    { from: 'exec', to: 'sales' },
    { from: 'exec', to: 'marketing' },
    { from: 'sales', to: 'finance' },
    { from: 'marketing', to: 'sales' },
  ];

  const particlesRef = useRef<Particle[]>([]);

  // Periodically inject particles between active nodes to simulate life
  useEffect(() => {
    const interval = setInterval(() => {
      // Find active connections
      connections.forEach((conn) => {
        const fromAgent = agents.find((a) => a.id === nodes.find((n) => n.id === conn.from)?.agentId);
        const toAgent = agents.find((a) => a.id === nodes.find((n) => n.id === conn.to)?.agentId);

        // If either is running or in process, seed more particles
        const isActive = (fromAgent?.status === 'In Process') || (toAgent?.status === 'In Process') || Math.random() > 0.4;
        
        if (isActive) {
          particlesRef.current.push({
            fromNode: conn.from,
            toNode: conn.to,
            progress: 0,
            speed: 0.005 + Math.random() * 0.008,
            size: 2 + Math.random() * 3,
            color: nodes.find((n) => n.id === conn.from)?.color || '#9a4614',
          });
        }
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [agents]);

  // Main canvas rendering loops
  useEffect(() => {
    let animationFrameId: number;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const container = containerRef.current;
      if (!container) return;
      canvas.width = container.clientWidth;
      canvas.height = 420; // fixed target height
    };

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      // Helper to convert normalized nodes positions to actual pixels
      const getPixelPos = (node: Node) => ({
        x: node.x * w,
        y: node.y * h,
      });

      // 1. Draw Connection Lines
      ctx.lineWidth = 1.5;
      connections.forEach((conn) => {
        const fromNode = nodes.find((n) => n.id === conn.from)!;
        const toNode = nodes.find((n) => n.id === conn.to)!;
        const p1 = getPixelPos(fromNode);
        const p2 = getPixelPos(toNode);

        ctx.strokeStyle = 'rgba(28, 27, 27, 0.08)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      });
      ctx.setLineDash([]); // Reset line dash

      // 2. Update and Draw Particles
      particlesRef.current.forEach((part, index) => {
        const fromNode = nodes.find((n) => n.id === part.fromNode)!;
        const toNode = nodes.find((n) => n.id === part.toNode)!;
        const p1 = getPixelPos(fromNode);
        const p2 = getPixelPos(toNode);

        // Linear interpolation
        const currentX = p1.x + (p2.x - p1.x) * part.progress;
        const currentY = p1.y + (p2.y - p1.y) * part.progress;

        // Draw particle
        ctx.fillStyle = part.color;
        ctx.beginPath();
        ctx.arc(currentX, currentY, part.size, 0, Math.PI * 2);
        ctx.fill();

        // Add glow aura
        ctx.fillStyle = part.color + '22';
        ctx.beginPath();
        ctx.arc(currentX, currentY, part.size * 2.5, 0, Math.PI * 2);
        ctx.fill();

        // Advance progress
        part.progress += part.speed;
      });

      // Filter out completed particles
      particlesRef.current = particlesRef.current.filter((p) => p.progress < 1);

      // 3. Draw Nodes
      nodes.forEach((node) => {
        const pos = getPixelPos(node);
        const agent = agents.find((a) => a.id === node.agentId);

        // Active animated aura rings if the agent is "In Process"
        if (agent?.status === 'In Process') {
          const auraRadius = node.radius + 8 + Math.sin(Date.now() / 150) * 4;
          ctx.strokeStyle = node.color + '33';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, auraRadius, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Draw outer white fill
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(0,0,0,0.04)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, node.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowColor = 'transparent'; // Reset shadow

        // Draw solid thin border
        ctx.strokeStyle = 'rgba(0,0,0,0.06)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw inner status indicator arc
        ctx.strokeStyle = node.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        const startAngle = (Date.now() / 1000) % (Math.PI * 2);
        ctx.arc(pos.x, pos.y, node.radius - 4, startAngle, startAngle + Math.PI * 0.8);
        ctx.stroke();

        // Draw center icon labels or agent acronyms
        ctx.fillStyle = '#1c1b1b';
        ctx.font = 'bold 11px font-mono, ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const nameAcronym = node.name.split(' ').map((w) => w[0]).join('');
        ctx.fillText(nameAcronym, pos.x, pos.y - 3);

        ctx.fillStyle = '#64748b';
        ctx.font = '500 8px font-sans';
        ctx.fillText(agent?.status || 'Active', pos.x, pos.y + 10);
      });

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [agents]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const w = canvas.width;
    const h = canvas.height;

    // Detect click collision with any node
    let clickedNode: Node | null = null;
    nodes.forEach((node) => {
      const nodeX = node.x * w;
      const nodeY = node.y * h;
      const dist = Math.hypot(clickX - nodeX, clickY - nodeY);
      if (dist <= node.radius) {
        clickedNode = node;
      }
    });

    if (clickedNode) {
      const agent = agents.find((a) => a.id === clickedNode!.agentId);
      if (agent) {
        setSelectedAgent(agent);
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">VISUAL SYSTEM PULSE</span>
          <h1 className="text-xl font-sans font-semibold text-gray-900 mt-0.5">Organization Pulse</h1>
          <p className="text-xs text-gray-400 mt-1">Real-time inter-agent messaging channels and active department operations.</p>
        </div>
        <div className="flex items-center space-x-2 text-[10px] font-mono bg-white px-3 py-1.5 rounded-lg border border-gray-100">
          <div className="w-2.5 h-2.5 rounded-full bg-brand-bronze/10 flex items-center justify-center border border-brand-bronze/30 animate-pulse">
            <div className="w-1.5 h-1.5 rounded-full bg-brand-bronze" />
          </div>
          <span className="text-gray-600">60 FPS WEBGL BACKUP ENGINES</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Visual Pulse Stage */}
        <div ref={containerRef} className="lg:col-span-3 bg-white border border-gray-100/60 rounded-2xl p-4 flex flex-col justify-center relative shadow-sm min-h-[440px]">
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            className="w-full h-[420px] cursor-pointer"
            title="Click nodes to view real-time department indicators"
          />

          {/* Floating Instructions Banner */}
          <div className="absolute bottom-4 left-4 bg-gray-50/80 backdrop-blur-sm border border-gray-100 rounded-lg px-3 py-2 text-[10px] text-gray-500 font-mono flex items-center space-x-2">
            <span className="text-brand-bronze">💡</span>
            <span>Interactive: Click department nodes to explore operational briefs.</span>
          </div>
        </div>

        {/* Quick Departmenal Indicator Cards */}
        <div className="space-y-4">
          <h2 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Department Monitors</h2>
          {nodes.map((node) => {
            const agent = agents.find((a) => a.id === node.agentId);
            return (
              <button
                key={node.id}
                onClick={() => setSelectedAgent(agent || null)}
                className="w-full p-4 bg-white rounded-xl border border-gray-100/60 flex items-start space-x-3 text-left hover:border-brand-bronze/20 hover:shadow-sm transition-all cursor-pointer"
              >
                <div
                  className="w-2.5 h-2.5 rounded-full mt-1.5 flex-shrink-0"
                  style={{ backgroundColor: node.color }}
                />
                <div className="space-y-1">
                  <h3 className="text-xs font-semibold text-gray-900">{node.name}</h3>
                  <p className="text-[10px] text-gray-400 font-mono uppercase tracking-wider">{agent?.role}</p>
                  <div className="flex items-center space-x-1.5 pt-1">
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded-md ${
                        agent?.status === 'In Process'
                          ? 'bg-amber-50 text-amber-700 font-bold animate-pulse'
                          : agent?.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {agent?.status || 'Active'}
                    </span>
                    <span className="text-[9px] text-gray-400 font-mono font-medium max-w-[120px] truncate">
                      {agent?.lastAction}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Node Details Drawer Side Panel */}
      <AnimatePresence>
        {selectedAgent && (
          <div className="fixed inset-0 bg-black/10 backdrop-blur-xs z-50 flex justify-end">
            {/* Backdrop click to close */}
            <div className="absolute inset-0" onClick={() => setSelectedAgent(null)} />

            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="w-full max-w-md bg-white h-screen border-l border-gray-100 shadow-2xl relative z-10 flex flex-col justify-between"
            >
              {/* Header */}
              <div className="p-6 border-b border-gray-50 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Building className="w-5 h-5 text-brand-bronze" />
                  <div>
                    <h2 className="text-sm font-sans font-semibold text-gray-900">Department Executive Panel</h2>
                    <p className="text-[10px] font-mono text-brand-bronze font-medium uppercase tracking-wider">
                      {selectedAgent.department}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedAgent(null)}
                  className="p-1.5 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-black transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Main Profile Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Agent Hero */}
                <div className="flex items-center space-x-4">
                  <img
                    src={selectedAgent.avatar}
                    alt={selectedAgent.name}
                    referrerPolicy="no-referrer"
                    className="w-16 h-16 rounded-xl object-cover border border-gray-100 shadow-sm"
                  />
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">{selectedAgent.name}</h3>
                    <p className="text-xs text-brand-bronze font-mono uppercase tracking-wider">{selectedAgent.role}</p>
                    <span
                      className={`inline-flex items-center space-x-1 text-[9px] font-mono px-2 py-0.5 rounded-md mt-1.5 ${
                        selectedAgent.status === 'In Process'
                          ? 'bg-amber-50 text-amber-700 animate-pulse font-bold'
                          : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      <span>●</span>
                      <span>{selectedAgent.status}</span>
                    </span>
                  </div>
                </div>

                {/* Agent Bio Statement */}
                <div className="p-4 bg-gray-50/50 rounded-xl border border-gray-100 space-y-1">
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">Biography</h4>
                  <p className="text-xs text-gray-600 leading-relaxed font-sans">{selectedAgent.bio}</p>
                </div>

                {/* Active Goals */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">Active Objectives</h4>
                  <div className="space-y-2">
                    {selectedAgent.goals.map((goal, idx) => (
                      <div key={idx} className="flex items-start space-x-2 text-xs text-gray-700 font-sans">
                        <span className="text-brand-bronze font-bold mt-0.5">▪</span>
                        <span>{goal}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Available Tools */}
                <div className="space-y-2">
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest font-sans">Available System Tools</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedAgent.tools.map((tool, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-gray-50 border border-gray-100 text-[10px] font-mono font-medium rounded-md text-gray-600">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Monthly Metrics Performance */}
                <div className="space-y-3">
                  <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">Monthly Productivity Indicators</h4>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-white border border-gray-100 rounded-xl text-center">
                      <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Completed Tasks</p>
                      <p className="text-lg font-mono font-bold text-gray-900 mt-1">{selectedAgent.metrics.tasksCompleted}</p>
                    </div>
                    <div className="p-3 bg-white border border-gray-100 rounded-xl text-center">
                      <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Decisions Filed</p>
                      <p className="text-lg font-mono font-bold text-gray-900 mt-1">{selectedAgent.metrics.decisionsMade}</p>
                    </div>
                    <div className="p-3 bg-white border border-gray-100 rounded-xl text-center">
                      <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Value Generated</p>
                      <p className="text-sm font-mono font-bold text-brand-bronze mt-1.5">
                        ${selectedAgent.metrics.valueGenerated.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Status footer */}
              <div className="p-4 border-t border-gray-50 bg-gray-50/40 text-[9px] font-mono text-gray-400 flex justify-between">
                <span>ACTIVE WORKFORCE REGISTER</span>
                <span className="text-emerald-600 font-bold">SECURE PIPELINE</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
