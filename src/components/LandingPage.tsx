/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion } from 'motion/react';
import { Sparkles, ArrowRight, ShieldCheck, Cpu, ArrowUpRight, Zap, Users, Play } from 'lucide-react';

interface LandingPageProps {
  onStart: () => void;
}

export default function LandingPage({ onStart }: LandingPageProps) {
  const departments = [
    { name: 'Finance', desc: 'Ledger management, cash flow tracking, invoice automation.', icon: 'DollarSign' },
    { name: 'Sales', desc: 'Lead qualification, automated commercial pitches, account briefing.', icon: 'Target' },
    { name: 'Marketing', desc: 'Aria persona targeting, keyword tracking, copy generation.', icon: 'Megaphone' },
    { name: 'Executive Office', desc: 'CEO synthesis briefings, multi-agent strategy session coordinator.', icon: 'LayoutDashboard' },
  ];

  return (
    <div className="bg-[#fdf8f8] text-[#1c1b1b] font-sans overflow-x-hidden min-h-screen selection:bg-brand-bronze/10">
      {/* Top Header/Bar */}
      <nav className="max-w-7xl mx-auto px-6 py-6 flex justify-between items-center border-b border-gray-100/50">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-lg bg-black flex items-center justify-center">
            <span className="text-white font-mono font-bold text-sm tracking-widest">A</span>
          </div>
          <span className="font-sans font-bold text-sm tracking-tight">ATLAS OS</span>
        </div>
        <button
          onClick={onStart}
          className="px-5 py-2 rounded-xl text-xs font-semibold bg-black text-white hover:bg-black/95 transition-all tactile-button-inset cursor-pointer"
        >
          Initialize Atlas
        </button>
      </nav>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-6 py-20 text-center space-y-8">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center space-x-2 px-3 py-1.5 rounded-full bg-brand-bronze/5 border border-brand-bronze/10 text-brand-bronze text-xs font-mono font-medium"
        >
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span>AUTONOMOUS OPERATING SYSTEM FOR ENTERPRISE</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="text-4xl md:text-6xl font-sans font-bold tracking-tight text-gray-900 max-w-3xl mx-auto leading-none"
        >
          Your Business Has Software.<br />Now It Needs An <span className="text-brand-bronze">Operating System.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-sm md:text-base text-gray-500 max-w-xl mx-auto leading-relaxed"
        >
          Atlas is the world's first Autonomous Business Operating System. It doesn't just help you organize your company. It runs it alongside you.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4"
        >
          <button
            onClick={onStart}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-3 px-8 py-4 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/90 transition-all shadow-md group cursor-pointer"
          >
            <span>Experience Atlas OS</span>
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
          <button
            onClick={onStart}
            className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-8 py-4 bg-white text-gray-700 rounded-xl text-sm font-medium border border-gray-100 hover:bg-gray-50/50 transition-all shadow-sm cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-brand-bronze fill-brand-bronze" />
            <span>Watch 3 Minute Demo</span>
          </button>
        </motion.div>
      </section>

      {/* Infographic Section - Disconnected vs Cohesive */}
      <section className="bg-white border-y border-gray-100/60 py-20 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-6">
            <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">THE FRAGMENTATION PROBLEM</span>
            <h2 className="text-3xl font-sans font-semibold tracking-tight text-gray-900">
              Your business shouldn't need fifteen disconnected applications to function.
            </h2>
            <p className="text-xs text-gray-500 leading-relaxed font-sans">
              Traditional SaaS forces human executives to larp as the data bridge between silos. Atlas OS consolidates this complexity into a single, unified cognitive layers. AI executives monitor and execute tasks across CRM, invoicing, payroll, and workflows autonomously, while you focus on vision.
            </p>
            <div className="space-y-3 pt-2">
              <div className="flex items-center space-x-3 text-xs font-sans text-gray-700 font-medium">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero administrative data-silo friction</span>
              </div>
              <div className="flex items-center space-x-3 text-xs font-sans text-gray-700 font-medium">
                <Cpu className="w-4 h-4 text-brand-bronze" />
                <span>Seamless cross-department AI workflows</span>
              </div>
            </div>
          </div>

          {/* Graphical Representation */}
          <div className="p-6 bg-[#fdf8f8] rounded-2xl border border-gray-100/50 flex flex-col justify-center items-center space-y-6 relative overflow-hidden min-h-[300px]">
            <div className="absolute inset-0 bg-radial-gradient from-brand-bronze/5 to-transparent pointer-events-none opacity-40" />
            
            {/* Pulsing Central Hub */}
            <div className="relative w-24 h-24 rounded-full bg-white flex items-center justify-center shadow-lg border border-gray-50 z-10 pulsing-glow">
              <span className="font-mono text-xs font-black text-brand-bronze tracking-wider uppercase animate-pulse">Central OS</span>
            </div>

            {/* Satellite department items */}
            <div className="flex flex-wrap justify-center gap-3 z-10">
              <span className="px-3 py-1.5 rounded-xl bg-white border border-gray-100 text-[10px] font-mono font-medium shadow-sm">DollarSign Ledger</span>
              <span className="px-3 py-1.5 rounded-xl bg-white border border-gray-100 text-[10px] font-mono font-medium shadow-sm">Target pipeline</span>
              <span className="px-3 py-1.5 rounded-xl bg-white border border-gray-100 text-[10px] font-mono font-medium shadow-sm">Megaphone marketing</span>
              <span className="px-3 py-1.5 rounded-xl bg-white border border-gray-100 text-[10px] font-mono font-medium shadow-sm">Users payroll</span>
            </div>
          </div>
        </div>
      </section>

      {/* Weekend Narrative Timeline */}
      <section className="max-w-4xl mx-auto px-6 py-20 space-y-12">
        <div className="text-center space-y-2">
          <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">A WEEKEND WITH ATLAS</span>
          <h2 className="text-2xl md:text-3xl font-sans font-semibold tracking-tight text-gray-900">
            How Atlas manages your business while you are offline.
          </h2>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100/60 p-8 space-y-6 shadow-sm">
          <div className="border-l-2 border-brand-bronze/30 pl-6 space-y-8">
            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-brand-bronze border-4 border-white shadow-sm" />
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-brand-bronze font-bold">FRIDAY 18:00</p>
                <h3 className="text-xs font-semibold text-gray-900">Executive Closes Strategic Dashboard</h3>
                <p className="text-xs text-gray-500 font-sans">Human CEO leaves office. AI Workforce boots independent worker loops.</p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-brand-bronze/50 border-4 border-white shadow-sm" />
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-brand-bronze font-bold">SATURDAY 11:45</p>
                <h3 className="text-xs font-semibold text-gray-900">Sales AI Qualifies Inbound Pipeline</h3>
                <p className="text-xs text-gray-500 font-sans">Zephyr receives 8 inbound CSV lead catalog, scores customer fit with Gemini, and filters 3 top-tier candidates.</p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-brand-bronze/50 border-4 border-white shadow-sm" />
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-brand-bronze font-bold">SUNDAY 14:00</p>
                <h3 className="text-xs font-semibold text-gray-900">Finance AI Drafts Agreements & Bills</h3>
                <p className="text-xs text-gray-500 font-sans">Aurelia structures billing terms, matches invoices to product catalogs, and prepares three proposals for CEO signoff.</p>
              </div>
            </div>

            <div className="relative">
              <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-brand-bronze border-4 border-white shadow-sm" />
              <div className="space-y-1">
                <p className="text-[10px] font-mono text-brand-bronze font-bold">MONDAY 08:00</p>
                <h3 className="text-xs font-semibold text-gray-900">Mission Control Day Zero Ready</h3>
                <p className="text-xs text-gray-500 font-sans">Human CEO logs in. Three pending qualified decisions await simple one-click approvals to deliver contracts.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Stats Banner */}
      <section className="bg-black text-white py-16 px-6 text-center">
        <div className="max-w-4xl mx-auto space-y-6">
          <h2 className="text-3xl font-sans font-bold tracking-tight">Meet the workforce that never sleeps.</h2>
          <p className="text-xs text-gray-400 max-w-lg mx-auto leading-relaxed">
            Atlas OS automates repetitive corporate processes so your team can focus entirely on high-yield strategy. Over 1,200 companies operate digital workspaces today.
          </p>
          <div className="pt-4">
            <button
              onClick={onStart}
              className="inline-flex items-center space-x-2 px-8 py-3.5 bg-white text-black rounded-xl text-xs font-semibold hover:bg-gray-100 transition-all cursor-pointer"
            >
              <span>Build Your Autonomous OS</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
