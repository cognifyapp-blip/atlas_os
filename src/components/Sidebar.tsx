/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { LayoutDashboard, BrainCircuit, Activity, Users, DollarSign, Target, Megaphone, Library, Presentation, ChevronRight, Sparkles } from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  pendingDecisionsCount: number;
  orgName: string;
}

export default function Sidebar({ currentView, onNavigate, pendingDecisionsCount, orgName }: SidebarProps) {
  const menuItems = [
    { id: 'dashboard', name: 'Mission Control', icon: LayoutDashboard },
    { id: 'strategy', name: 'Strategy Session', icon: BrainCircuit, highlight: true },
    { id: 'pulse', name: 'Organization Pulse', icon: Activity },
    { id: 'workforce', name: 'AI Workforce', icon: Users },
    { id: 'finance', name: 'Finance Ledger', icon: DollarSign },
    { id: 'sales', name: 'Sales Pipeline', icon: Target },
    { id: 'marketing', name: 'Marketing Studio', icon: Megaphone },
    { id: 'memory', name: 'Central Memory', icon: Library },
    { id: 'boardroom', name: 'Boardroom Mode', icon: Presentation },
  ];

  return (
    <aside id="sidebar-navigation" className="w-[260px] bg-white border-r border-gray-100 flex flex-col h-screen fixed left-0 top-0 z-20">
      {/* Brand Header */}
      <div className="p-6 border-b border-gray-50 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center shadow-sm">
            <span className="text-white font-mono font-bold text-sm tracking-wider">A</span>
          </div>
          <div>
            <h1 className="font-sans font-semibold text-sm tracking-tight text-gray-900">Atlas OS</h1>
            <p className="text-[11px] font-mono text-brand-bronze font-medium uppercase tracking-widest truncate max-w-[140px]">
              {orgName || 'Autonomous OS'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-gray-50 text-black font-semibold border-l-2 border-brand-bronze pl-2.5'
                  : 'text-gray-500 hover:bg-gray-50/50 hover:text-black'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${isActive ? 'text-brand-bronze' : 'text-gray-400'}`} />
                <span>{item.name}</span>
              </div>
              
              {/* Accessory Badges */}
              {item.id === 'dashboard' && pendingDecisionsCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-bronze text-[10px] font-bold text-white pulsing-glow">
                  {pendingDecisionsCount}
                </span>
              )}

              {item.highlight && !isActive && (
                <Sparkles className="w-3 h-3 text-brand-bronze animate-pulse" />
              )}
            </button>
          );
        })}
      </nav>

      {/* CEO Status Block */}
      <div className="p-4 border-t border-gray-50 bg-gray-50/40 m-3 rounded-xl">
        <div className="flex items-center space-x-3">
          <div className="w-9 h-9 rounded-full bg-brand-bronze/10 border border-brand-bronze/20 flex items-center justify-center">
            <span className="text-xs font-semibold text-brand-bronze font-mono">CEO</span>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-xs font-medium text-gray-900 truncate">Human Executive</h3>
            <p className="text-[10px] font-mono text-brand-bronze font-medium tracking-wide">STRATEGIC COMMAND</p>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Connected" />
        </div>
        <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400 font-mono">
          <span>PORT: 3000 (SECURE)</span>
          <span className="text-emerald-600">● LIVE GATEWAY</span>
        </div>
      </div>
    </aside>
  );
}
