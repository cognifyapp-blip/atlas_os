/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Agent, Decision, MemoryEntry, FeedEvent, Lead, Proposal, Workflow, OrganizationContext } from './types';
import Sidebar from './components/Sidebar';
import LandingPage from './components/LandingPage';
import Onboarding from './components/Onboarding';
import OrganizationPulse from './components/OrganizationPulse';
import StrategySession from './components/StrategySession';
import CommandCenter from './components/CommandCenter';
import Boardroom from './components/Boardroom';
import DepartmentViews from './components/DepartmentViews';
import MemoryConsole from './components/MemoryConsole';
import { LayoutDashboard, Users, Clock, AlertCircle, Play, Check, X, Shield, RefreshCw } from 'lucide-react';

export default function App() {
  // Navigation & Screen Router
  const [screen, setScreen] = useState<'landing' | 'onboarding' | 'main'>('landing');
  const [currentView, setCurrentView] = useState<string>('dashboard');
  const [boardroomActive, setBoardroomActive] = useState<boolean>(false);
  const [commandCenterOpen, setCommandCenterOpen] = useState<boolean>(false);

  // Corporate Entities State
  const [orgContext, setOrgContext] = useState<OrganizationContext>({
    name: '',
    industry: '',
    size: '',
    goals: '',
    challenges: '',
    softwareStack: '',
    initialized: false,
  });

  const [briefing, setBriefing] = useState<any>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [feeds, setFeeds] = useState<FeedEvent[]>([]);

  // Detailed modal view for decisions
  const [activeReviewDecision, setActiveReviewDecision] = useState<Decision | null>(null);

  // 1. Fetch current gateway states
  const fetchState = async () => {
    try {
      const [resContext, resAgents, resDecisions, resLeads, resProposals, resMemories, resWorkflows, resFeeds] = await Promise.all([
        fetch('/api/v1/onboarding/context'),
        fetch('/api/v1/agents'),
        fetch('/api/v1/decisions'),
        fetch('/api/v1/leads'),
        fetch('/api/v1/proposals'),
        fetch('/api/v1/memories'),
        fetch('/api/v1/workflows'),
        fetch('/api/v1/feeds'),
      ]);

      const dataContext = await resContext.json();
      const dataAgents = await resAgents.json();
      const dataDecisions = await resDecisions.json();
      const dataLeads = await resLeads.json();
      const dataProposals = await resProposals.json();
      const dataMemories = await resMemories.json();
      const dataWorkflows = await resWorkflows.json();
      const dataFeeds = await resFeeds.json();

      setOrgContext(dataContext.context);
      setBriefing(dataContext.briefing);
      setAgents(dataAgents.agents);
      setDecisions(dataDecisions.decisions);
      setLeads(dataLeads.leads);
      setProposals(dataProposals.proposals);
      setMemories(dataMemories.memories);
      setWorkflows(dataWorkflows.workflows);
      setFeeds(dataFeeds.feeds);

      if (dataContext.context.initialized) {
        setScreen('main');
      }
    } catch (err) {
      console.error('Error seeding gateway state:', err);
    }
  };

  useEffect(() => {
    fetchState();
  }, []);

  // 2. Real-Time SSE Stream Integration
  useEffect(() => {
    if (screen !== 'main') return;

    const eventSource = new EventSource('/api/v1/stream-events');

    eventSource.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'feed') {
          setFeeds((prev) => [payload.data, ...prev.slice(0, 99)]);
        } else if (payload.type === 'workflow') {
          setWorkflows((prev) => prev.map((w) => (w.id === payload.data.id ? payload.data : w)));
        }
      } catch (err) {
        console.error('SSE decoding error:', err);
      }
    };

    return () => eventSource.close();
  }, [screen]);

  // Keyboard Command Center Event Listener (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandCenterOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // -----------------------------------------------------------------------------
  // Operations Handlers
  // -----------------------------------------------------------------------------
  const handleOnboardingCompleted = (context: OrganizationContext, briefingResult: any) => {
    setOrgContext(context);
    setBriefing(briefingResult);
    setScreen('main');
    fetchState(); // sync state
  };

  const handleTriggerQualify = async (leadId: string) => {
    try {
      const response = await fetch(`/api/v1/leads/${leadId}/qualify`, { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        fetchState(); // Sync fully updated lead, proposal, and decision models
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportCSV = async (csvText: string) => {
    try {
      const response = await fetch('/api/v1/leads/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText }),
      });
      const data = await response.json();
      if (data.created > 0) {
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddManualLead = async (leadData: any) => {
    try {
      const response = await fetch('/api/v1/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(leadData),
      });
      if (response.ok) {
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleApproveDecision = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/decisions/${id}/approve`, { method: 'POST' });
      if (response.ok) {
        setActiveReviewDecision(null);
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeclineDecision = async (id: string) => {
    try {
      const response = await fetch(`/api/v1/decisions/${id}/decline`, { method: 'POST' });
      if (response.ok) {
        setActiveReviewDecision(null);
        fetchState();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddFeedAlert = (agentId: string, action: string, text: string, status: any) => {
    // Local insertion fallback if needed
  };

  const handleAddMemory = async (text: string, type: any, actor: string) => {
    try {
      await fetch('/api/v1/memories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, type, actor, sourceSystem: 'Central Intelligence Office', tags: ['manual'] }),
      });
      fetchState();
    } catch (err) {
      console.error(err);
    }
  };

  const handleCommandCenterAction = (actionKey: string) => {
    if (actionKey === 'report') {
      setCurrentView('boardroom');
      setBoardroomActive(true);
    }
  };

  // -----------------------------------------------------------------------------
  // Render Dashboard Home (Mission Control) View
  // -----------------------------------------------------------------------------
  const renderDashboardView = () => {
    const totalRevenue = leads.filter((l) => l.status === 'proposal_sent').reduce((acc, curr) => acc + curr.value, 0) + 184000;
    const activePipeline = leads.filter((l) => l.status === 'new' || l.status === 'proposal_drafted').reduce((acc, curr) => acc + curr.value, 0);

    return (
      <div className="space-y-6">
        {/* Dynamic Executive Briefing Block */}
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
          <div className="flex items-center space-x-2 text-brand-bronze">
            <Shield className="w-5 h-5 pulsing-glow rounded-md" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Active Executive Briefing</span>
          </div>
          <div className="text-xs text-gray-600 leading-relaxed font-sans space-y-2">
            {briefing?.briefing ? (
              <div className="whitespace-pre-wrap">{briefing.briefing}</div>
            ) : (
              <p>Welcome to Atlas OS. Finance AI has optimized invoice queues, Sales AI has qualified pipeline assets, and Central Memory holds our historical mission briefings. We are standing by for your strategic approvals.</p>
            )}
          </div>
        </div>

        {/* Tactical Opportunity cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm text-center space-y-1">
            <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Estimated ARR Generated</p>
            <p className="text-2xl font-mono font-bold text-gray-900">${totalRevenue.toLocaleString()}</p>
            <p className="text-[10px] text-emerald-600 font-medium">● nominal cash balance</p>
          </div>
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm text-center space-y-1">
            <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Active Pipeline Potential</p>
            <p className="text-2xl font-mono font-bold text-gray-900">${activePipeline.toLocaleString()}</p>
            <p className="text-[10px] text-gray-400 font-sans">Across {leads.filter(l => l.status === 'new').length} inbound prospects</p>
          </div>
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm text-center space-y-1">
            <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">AI Executives Provisioned</p>
            <p className="text-2xl font-mono font-bold text-brand-bronze">{agents.length} Heads</p>
            <p className="text-[10px] text-gray-400 font-sans">{agents.filter(a => a.status === 'Active').length} currently idle</p>
          </div>
        </div>

        {/* Dual Layout: Decisions vs Live System Feed */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Decisions needing approval */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Decisions Requiring Approval</h2>
            {decisions.length === 0 ? (
              <div className="p-8 bg-gray-50/50 border border-gray-100 rounded-2xl text-center text-xs text-gray-400 font-sans">
                No decisions pending review. Standard automated loops operate inside autonomy levels.
              </div>
            ) : (
              <div className="space-y-4">
                {decisions.map((dec) => (
                  <div key={dec.id} className="bg-white border border-gray-100/60 rounded-2xl p-6 shadow-xs hover:shadow-sm transition-all space-y-4">
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <span className="text-[9px] font-mono text-brand-bronze font-bold uppercase tracking-wider">
                          Fit Confidence: {dec.confidence}%
                        </span>
                        <h3 className="text-xs font-bold text-gray-900 mt-1">{dec.title}</h3>
                        <p className="text-xs text-gray-500 mt-1">{dec.summary}</p>
                      </div>
                      <div className="flex items-center space-x-1 flex-shrink-0">
                        <button
                          onClick={() => setActiveReviewDecision(dec)}
                          className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg text-[10px] font-semibold text-gray-600 transition-colors cursor-pointer"
                        >
                          Review Detail
                        </button>
                        <button
                          onClick={() => handleApproveDecision(dec.id)}
                          className="px-3 py-1.5 bg-black hover:bg-black/95 text-white rounded-lg text-[10px] font-semibold transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live system feed */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Live System Feed</h2>
            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm h-[320px] overflow-y-auto space-y-3">
              {feeds.map((evt) => (
                <div key={evt.id} className="text-[11px] leading-snug space-y-1 py-1.5 border-b border-gray-50 last:border-none">
                  <div className="flex justify-between items-center text-[9px] font-mono text-gray-400">
                    <span>{evt.agentName} ({evt.department})</span>
                    <span>{new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="font-semibold text-gray-800">{evt.action}</p>
                  <p className="text-gray-500 font-sans">{evt.text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------------
  // Render AI Workforce Directory View
  // -----------------------------------------------------------------------------
  const renderWorkforceView = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-6 border border-gray-100/60 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-sans font-semibold text-gray-900">AI Executive workforce</h1>
              <p className="text-xs text-gray-400">Manage, review metrics, and inspect tools of your autonomous departmental directors.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {agents.map((agent) => (
            <div key={agent.id} className="bg-white border border-gray-100/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-start space-x-4">
                <img
                  src={agent.avatar}
                  alt={agent.name}
                  referrerPolicy="no-referrer"
                  className="w-12 h-12 rounded-xl object-cover border border-gray-100 shadow-sm"
                />
                <div className="space-y-1 flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className="text-xs font-bold text-gray-900">{agent.name}</h3>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                        agent.status === 'In Process' ? 'bg-amber-50 text-amber-700 animate-pulse' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {agent.status}
                    </span>
                  </div>
                  <p className="text-[10px] font-mono text-brand-bronze font-medium uppercase tracking-wider">{agent.role}</p>
                  <p className="text-xs text-gray-500 leading-relaxed pt-1 font-sans italic">"{agent.bio}"</p>
                </div>
              </div>

              <div className="pt-3 border-t border-gray-50 grid grid-cols-3 gap-3 text-center">
                <div className="space-y-0.5">
                  <p className="text-[8.5px] font-mono text-gray-400 uppercase tracking-wider">Tasks Complete</p>
                  <p className="text-sm font-mono font-bold text-gray-900">{agent.metrics.tasksCompleted}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[8.5px] font-mono text-gray-400 uppercase tracking-wider">Decisions Made</p>
                  <p className="text-sm font-mono font-bold text-gray-900">{agent.metrics.decisionsMade}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[8.5px] font-mono text-gray-400 uppercase tracking-wider">Value Generated</p>
                  <p className="text-sm font-mono font-bold text-brand-bronze">
                    ${agent.metrics.valueGenerated.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (screen === 'landing') return <LandingPage onStart={() => setScreen('onboarding')} />;
  if (screen === 'onboarding') return <Onboarding onCompleted={handleOnboardingCompleted} />;

  return (
    <div className="min-h-screen bg-[#fdf8f8] flex">
      {/* Permanent Docked Navigation Sidebar */}
      <Sidebar
        currentView={currentView}
        onNavigate={(view) => {
          if (view === 'boardroom') {
            setBoardroomActive(true);
          } else {
            setCurrentView(view);
          }
        }}
        pendingDecisionsCount={decisions.length}
        orgName={orgContext.name}
      />

      {/* Main Panel Frame Area */}
      <div className="flex-1 pl-[260px]">
        {/* Main top header bar info */}
        <header className="px-8 py-4 bg-white/40 border-b border-gray-100/50 flex justify-between items-center">
          <div className="flex items-center space-x-3 text-xs text-gray-500 font-medium">
            <span>SECURE GATEWAY PORT: 3000</span>
            <span className="text-gray-300">|</span>
            <span className="font-mono text-[10px] text-brand-bronze uppercase font-bold tracking-widest">{orgContext.name} WORKSPACE</span>
          </div>

          <button
            onClick={() => setCommandCenterOpen(true)}
            className="flex items-center space-x-3 px-3 py-1.5 bg-white border border-gray-100 rounded-lg text-xs font-mono font-bold tracking-tight text-gray-400 hover:text-black hover:border-brand-bronze/10 transition-all cursor-pointer shadow-xs"
          >
            <span>Strategic Directives</span>
            <span className="px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded text-[9px] font-bold text-gray-400">⌘K</span>
          </button>
        </header>

        {/* Framing Content stage */}
        <main className="p-8 max-w-7xl mx-auto">
          {currentView === 'dashboard' && renderDashboardView()}
          {currentView === 'workforce' && renderWorkforceView()}
          {currentView === 'pulse' && <OrganizationPulse agents={agents} />}
          {currentView === 'strategy' && (
            <StrategySession agents={agents} onAddFeedAlert={handleAddFeedAlert} onAddMemory={handleAddMemory} />
          )}
          {(currentView === 'finance' || currentView === 'sales' || currentView === 'marketing') && (
            <DepartmentViews
              activeTab={currentView as any}
              leads={leads}
              proposals={proposals}
              agents={agents}
              workflows={workflows}
              onTriggerQualify={handleTriggerQualify}
              onImportCSV={handleImportCSV}
              onAddManualLead={handleAddManualLead}
            />
          )}
          {currentView === 'memory' && <MemoryConsole memories={memories} />}
        </main>
      </div>

      {/* COMMAND CENTER OVERLAY PANEL */}
      <CommandCenter
        isOpen={commandCenterOpen}
        onClose={() => setCommandCenterOpen(false)}
        onNavigate={(viewId) => {
          if (viewId === 'boardroom') {
            setBoardroomActive(true);
          } else {
            setCurrentView(viewId);
          }
        }}
        onRunAction={handleCommandCenterAction}
      />

      {/* PRESENTATION BOARDROOM OVERLAY */}
      {boardroomActive && (
        <Boardroom
          onExit={() => setBoardroomActive(false)}
          orgName={orgContext.name}
        />
      )}

      {/* DECISION DETAILED REVIEW MODAL OVERLAY */}
      {activeReviewDecision && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setActiveReviewDecision(null)} />
          <div className="bg-white p-8 border border-gray-100 rounded-2xl max-w-lg w-full relative z-10 shadow-2xl space-y-6">
            <div className="border-b border-gray-50 pb-3 flex justify-between items-start">
              <div>
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">
                  DECISION REVIEW BOARD (CONFIDENCE {activeReviewDecision.confidence}%)
                </span>
                <h3 className="text-sm font-bold text-gray-900 mt-1">{activeReviewDecision.title}</h3>
              </div>
              <button
                onClick={() => setActiveReviewDecision(null)}
                className="text-gray-400 hover:text-black text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <div className="space-y-4 text-xs font-sans leading-relaxed text-gray-600">
              <div className="space-y-1">
                <h4 className="font-semibold text-gray-800">Proposal Summary</h4>
                <p>{activeReviewDecision.summary}</p>
              </div>

              <div className="space-y-1">
                <h4 className="font-semibold text-gray-800">Operational Reasoning</h4>
                <p className="italic bg-gray-50 p-3 rounded-lg border border-gray-100/50">"{activeReviewDecision.reasoning}"</p>
              </div>

              <div className="space-y-1">
                <h4 className="font-semibold text-gray-800">Quantitative Business Impact</h4>
                <p className="font-medium text-brand-bronze">{activeReviewDecision.impact}</p>
              </div>

              <div className="space-y-1">
                <h4 className="font-semibold text-gray-800">Collaborating Directors</h4>
                <div className="flex gap-2 pt-1">
                  {activeReviewDecision.contributors.map((id) => {
                    const agent = agents.find((a) => a.id === id);
                    return (
                      <span key={id} className="px-2 py-1 bg-gray-50 border border-gray-100 text-[10px] font-mono font-medium rounded text-gray-500">
                        {agent ? agent.name : id}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-50 flex justify-end space-x-2">
              <button
                onClick={() => handleDeclineDecision(activeReviewDecision.id)}
                className="px-5 py-2.5 bg-red-50 hover:bg-red-100 border border-red-100 text-red-700 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Veto Proposal
              </button>
              <button
                onClick={() => handleApproveDecision(activeReviewDecision.id)}
                className="px-6 py-2.5 bg-black hover:bg-black/95 text-white font-semibold rounded-xl text-xs cursor-pointer shadow-md"
              >
                Approve & Execute
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
