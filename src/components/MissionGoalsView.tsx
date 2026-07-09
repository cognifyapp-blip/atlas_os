/**
 * Atlas OS — Mission Goals View
 *
 * CEO sets a company goal. Atlas breaks it into weekly milestones.
 * Each milestone is owned by an executive and tracked to completion.
 * Includes outbound campaign launcher for zero-to-client runs.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Target, Plus, CheckCircle, Clock, AlertTriangle, XCircle, Rocket, RefreshCw, ChevronDown, ChevronUp, Zap, Mail } from 'lucide-react';
// ─── Types ────────────────────────────────────────────────────────────────────

interface Milestone {
  id: string;
  week: number;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'completed' | 'missed' | 'blocked';
  dueDate: string | null;
  completedAt: string | null;
  owner: { id: string; name: string; role: string } | null;
}

interface Goal {
  id: string;
  title: string;
  description: string | null;
  targetDate: string | null;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  progress: number;
  successCriteria: string | null;
  milestones: Milestone[];
  createdAt: string;
}

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending:     { label: 'Pending',     color: 'text-gray-500 bg-gray-50 border-gray-100',      icon: <Clock className="w-3 h-3" /> },
  in_progress: { label: 'In Progress', color: 'text-blue-700 bg-blue-50 border-blue-100',      icon: <RefreshCw className="w-3 h-3 animate-spin" /> },
  completed:   { label: 'Done',        color: 'text-emerald-700 bg-emerald-50 border-emerald-100', icon: <CheckCircle className="w-3 h-3" /> },
  missed:      { label: 'Missed',      color: 'text-red-700 bg-red-50 border-red-100',          icon: <XCircle className="w-3 h-3" /> },
  blocked:     { label: 'Blocked',     color: 'text-amber-700 bg-amber-50 border-amber-100',    icon: <AlertTriangle className="w-3 h-3" /> },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function MissionGoalsView() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedGoal, setExpandedGoal] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'goals' | 'outbound'>('goals');

  // New goal form
  const [showNewGoal, setShowNewGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDescription, setGoalDescription] = useState('');
  const [goalWeeks, setGoalWeeks] = useState(6);
  const [goalCriteria, setGoalCriteria] = useState('');
  const [goalLoading, setGoalLoading] = useState(false);
  const [goalPlan, setGoalPlan] = useState<any>(null);

  // Outbound campaign form
  const [campaignName, setCampaignName] = useState('');
  const [icpIndustry, setIcpIndustry] = useState('');
  const [icpSize, setIcpSize] = useState('11-50 employees');
  const [icpTitles, setIcpTitles] = useState('CEO, Founder, COO, VP Operations');
  const [icpPainPoints, setIcpPainPoints] = useState('manual processes, scaling operations, hiring overhead');
  const [emailCount, setEmailCount] = useState(10);
  const [sendEmails, setSendEmails] = useState(false);
  const [outboundLoading, setOutboundLoading] = useState(false);
  const [outboundResult, setOutboundResult] = useState<any>(null);

  // First client campaign state
  const [fcLoading, setFcLoading] = useState(false);
  const [fcResult, setFcResult] = useState<any>(null);

  const fetchGoals = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/goals');
      const data = await res.json();
      setGoals(data.goals ?? []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchGoals(); }, []);

  const handleSetGoal = async () => {
    if (!goalTitle.trim()) return;
    setGoalLoading(true);
    setGoalPlan(null);
    try {
      const res = await fetch('/api/v1/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: goalTitle,
          description: goalDescription || undefined,
          weeksToTarget: goalWeeks,
          successCriteria: goalCriteria || undefined,
        }),
      });
      const data = await res.json();
      setGoalPlan(data);
      fetchGoals();
      setGoalTitle(''); setGoalDescription(''); setGoalCriteria('');
    } catch (e) { console.error(e); }
    finally { setGoalLoading(false); }
  };

  const handleCompleteMilestone = async (goalId: string, milestoneId: string) => {
    try {
      await fetch(`/api/v1/goals/${goalId}/milestones/${milestoneId}/complete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      fetchGoals();
    } catch (e) { console.error(e); }
  };

  const handleOutbound = async () => {
    if (!campaignName.trim() || !icpIndustry.trim()) return;
    setOutboundLoading(true);
    setOutboundResult(null);
    try {
      const res = await fetch('/api/v1/outbound/campaign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignName,
          icp: {
            industry: icpIndustry,
            companySize: icpSize,
            jobTitles: icpTitles.split(',').map((s) => s.trim()),
            painPoints: icpPainPoints.split(',').map((s) => s.trim()),
          },
          emailCount,
          sendEmails,
        }),
      });
      const data = await res.json();
      setOutboundResult(data);
      fetchGoals();
    } catch (e) { console.error(e); }
    finally { setOutboundLoading(false); }
  };

  const handleFirstClient = async () => {
    setFcLoading(true);
    setFcResult(null);
    try {
      const res = await fetch('/api/v1/collaboration/workflow/first_client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeksToTarget: 6, prospectsPerWeek: 10, sendEmails: false }),
      });
      const data = await res.json();
      setFcResult(data);
      fetchGoals();
    } catch (e) { console.error(e); }
    finally { setFcLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl"><Target className="w-5 h-5" /></div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Mission Goals</h1>
              <p className="text-xs text-gray-400">Set a company objective. Atlas plans weekly milestones. The team executes autonomously.</p>
            </div>
          </div>
          <button onClick={fetchGoals} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex space-x-1 mt-4 bg-gray-50 rounded-xl p-1">
          {[{ id: 'goals', label: 'Goals & Milestones', icon: <Target className="w-3.5 h-3.5" /> }, { id: 'outbound', label: 'Outbound Campaign', icon: <Rocket className="w-3.5 h-3.5" /> }].map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {tab.icon}<span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Goals tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'goals' && (
        <div className="space-y-4">
          {/* ── First Client Campaign — one-click ──────────────────────────── */}
          <div className="bg-gradient-to-br from-black to-gray-900 border border-gray-800 rounded-2xl p-6 text-white space-y-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="text-lg">🚀</span>
                  <h2 className="text-sm font-bold">First Client Campaign</h2>
                </div>
                <p className="text-xs text-gray-400 max-w-sm">
                  One click. Atlas sets a 6-week goal, Iris defines your ICP, Aria builds outreach,
                  Zephyr qualifies 10 prospects, Aurelia drafts proposals, Lexis pre-drafts an NDA.
                  The whole team mobilises.
                </p>
              </div>
              {fcResult && (
                <span className="flex items-center space-x-1 px-2 py-1 bg-emerald-500/20 border border-emerald-500/30 rounded-lg text-[10px] font-mono text-emerald-400 flex-shrink-0">
                  <CheckCircle className="w-3 h-3" />
                  <span>Active</span>
                </span>
              )}
            </div>

            <button
              onClick={handleFirstClient}
              disabled={fcLoading}
              className="flex items-center space-x-2 px-5 py-2.5 bg-brand-bronze text-white rounded-xl text-xs font-bold hover:bg-brand-bronze/90 disabled:opacity-50 transition-colors"
            >
              {fcLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
              <span>{fcLoading ? 'Mobilising executive team… (this takes 30-60s)' : 'Launch Full First Client Campaign'}</span>
            </button>

            <AnimatePresence>
              {fcResult && (
                <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="pt-2 border-t border-white/10 space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Prospects', value: fcResult.prospectCount },
                      { label: 'Qualified', value: fcResult.leadsQualified },
                      { label: 'Emails Drafted', value: fcResult.outreachDrafted },
                      { label: 'Proposals', value: fcResult.proposalsDrafted },
                    ].map((s) => (
                      <div key={s.label} className="bg-white/5 rounded-lg p-2 text-center">
                        <p className="text-base font-mono font-bold text-brand-bronze">{s.value}</p>
                        <p className="text-[9px] font-mono text-gray-400 uppercase">{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-gray-300 leading-relaxed">{fcResult.atlasWeek1Briefing?.substring(0, 250)}…</p>
                  {fcResult.nextActions?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[9px] font-mono text-gray-500 uppercase tracking-wider">Next Actions</p>
                      {fcResult.nextActions.slice(0, 3).map((a: string, i: number) => (
                        <p key={i} className="text-[11px] text-gray-300">• {a}</p>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <button onClick={() => setShowNewGoal((p) => !p)} className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center space-x-2 text-xs font-semibold text-gray-900">
                <Plus className="w-4 h-4 text-brand-bronze" />
                <span>Set New Mission Goal</span>
              </div>
              {showNewGoal ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>

            <AnimatePresence>
              {showNewGoal && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-6 pb-6 space-y-4 border-t border-gray-50">
                    <div className="pt-4 space-y-1.5">
                      <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Goal Title</label>
                      <input type="text" value={goalTitle} onChange={(e) => setGoalTitle(e.target.value)} placeholder='e.g. "First paying client within 6 weeks"' className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Weeks to target</label>
                        <input type="number" min={1} max={52} value={goalWeeks} onChange={(e) => setGoalWeeks(Number(e.target.value))} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Success criteria</label>
                        <input type="text" value={goalCriteria} onChange={(e) => setGoalCriteria(e.target.value)} placeholder="e.g. First invoice paid" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Description (optional)</label>
                      <textarea value={goalDescription} onChange={(e) => setGoalDescription(e.target.value)} rows={2} placeholder="Any additional context for Atlas and the team…" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30 resize-none" />
                    </div>
                    <button onClick={handleSetGoal} disabled={goalLoading || !goalTitle.trim()} className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-black/90 transition-colors">
                      {goalLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                      <span>{goalLoading ? 'Atlas is planning milestones…' : 'Set Goal & Generate Milestones'}</span>
                    </button>

                    {goalPlan && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-2">
                        <p className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider">Goal Created — {goalPlan.milestones?.length} Milestones Planned</p>
                        <p className="text-xs text-gray-700">{goalPlan.executionStrategy?.substring(0, 200)}…</p>
                      </motion.div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Goals list */}
          {goals.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-xs text-gray-400">
              No active goals. Set one above to mobilise the executive team.
            </div>
          ) : (
            goals.map((goal) => (
              <div key={goal.id} className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
                <button onClick={() => setExpandedGoal(expandedGoal === goal.id ? null : goal.id)} className="w-full px-6 py-5 hover:bg-gray-50/50 transition-colors text-left">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${goal.status === 'completed' ? 'text-emerald-700 bg-emerald-50 border-emerald-100' : goal.status === 'active' ? 'text-blue-700 bg-blue-50 border-blue-100' : 'text-gray-500 bg-gray-50 border-gray-100'}`}>
                          {goal.status.toUpperCase()}
                        </span>
                        {goal.targetDate && <span className="text-[10px] font-mono text-gray-400">Due {new Date(goal.targetDate).toLocaleDateString()}</span>}
                      </div>
                      <h3 className="text-sm font-semibold text-gray-900">{goal.title}</h3>
                      {goal.successCriteria && <p className="text-[11px] text-gray-500">Success: {goal.successCriteria}</p>}
                    </div>
                    <div className="flex items-center space-x-3 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-lg font-mono font-bold text-brand-bronze">{goal.progress}%</p>
                        <p className="text-[9px] font-mono text-gray-400">{goal.milestones.filter((m) => m.status === 'completed').length}/{goal.milestones.length} done</p>
                      </div>
                      {expandedGoal === goal.id ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-4 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div className="h-full bg-brand-bronze rounded-full" initial={{ width: 0 }} animate={{ width: `${goal.progress}%` }} transition={{ duration: 0.5 }} />
                  </div>
                </button>

                <AnimatePresence>
                  {expandedGoal === goal.id && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-gray-50">
                      <div className="px-6 py-4 space-y-3">
                        <h4 className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Weekly Milestones</h4>
                        {goal.milestones.map((m) => {
                          const sc = STATUS_CONFIG[m.status] ?? STATUS_CONFIG.pending;
                          return (
                            <div key={m.id} className="flex items-start space-x-3 py-3 border-b border-gray-50 last:border-none">
                              <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[10px] font-mono font-bold text-brand-bronze">
                                {m.week}
                              </div>
                              <div className="flex-1 min-w-0 space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-semibold text-gray-900 truncate">{m.title}</p>
                                  <span className={`flex items-center space-x-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold flex-shrink-0 ${sc.color}`}>
                                    {sc.icon}<span>{sc.label}</span>
                                  </span>
                                </div>
                                {m.description && <p className="text-[11px] text-gray-500 line-clamp-2">{m.description.split('\n')[0]}</p>}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-2">
                                    {m.owner && <span className="text-[10px] font-mono text-brand-bronze">{m.owner.name}</span>}
                                    {m.dueDate && <span className="text-[10px] text-gray-400">Due {new Date(m.dueDate).toLocaleDateString()}</span>}
                                  </div>
                                  {m.status === 'pending' || m.status === 'in_progress' ? (
                                    <button onClick={() => handleCompleteMilestone(goal.id, m.id)} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors">
                                      Mark done
                                    </button>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))
          )}
        </div>
      )}

      {/* ── Outbound tab ───────────────────────────────────────────────────────── */}
      {activeTab === 'outbound' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <div>
            <h2 className="text-xs font-semibold text-gray-900">Outbound Campaign</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">Iris + Aria generate prospects from your ICP. Zephyr qualifies and drafts personalised outreach. Set <code className="bg-gray-100 px-1 rounded">RESEND_API_KEY</code> to send real emails.</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Campaign Name</label>
              <input type="text" value={campaignName} onChange={(e) => setCampaignName(e.target.value)} placeholder='e.g. "Week 1 Outbound — SaaS Founders"' className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Target Industry</label>
              <input type="text" value={icpIndustry} onChange={(e) => setIcpIndustry(e.target.value)} placeholder="e.g. SaaS, Professional Services" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Company Size</label>
              <input type="text" value={icpSize} onChange={(e) => setIcpSize(e.target.value)} placeholder="e.g. 11-50 employees" className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Target Job Titles (comma-separated)</label>
              <input type="text" value={icpTitles} onChange={(e) => setIcpTitles(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="space-y-1.5 col-span-2">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Pain Points we solve (comma-separated)</label>
              <input type="text" value={icpPainPoints} onChange={(e) => setIcpPainPoints(e.target.value)} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Prospects to generate</label>
              <input type="number" min={1} max={50} value={emailCount} onChange={(e) => setEmailCount(Number(e.target.value))} className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30" />
            </div>
            <div className="flex items-end pb-0.5">
              <label className="flex items-center space-x-2 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={sendEmails} onChange={(e) => setSendEmails(e.target.checked)} className="rounded" />
                <span>Send emails now (requires RESEND_API_KEY)</span>
              </label>
            </div>
          </div>

          <button onClick={handleOutbound} disabled={outboundLoading || !campaignName.trim() || !icpIndustry.trim()} className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-black/90 transition-colors">
            {outboundLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Rocket className="w-3.5 h-3.5" />}
            <span>{outboundLoading ? `Generating ${emailCount} prospects + outreach…` : 'Launch Outbound Campaign'}</span>
          </button>

          <AnimatePresence>
            {outboundResult && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Prospects', value: outboundResult.prospectsGenerated },
                    { label: 'Leads Created', value: outboundResult.leadsCreated },
                    { label: 'Emails Drafted', value: outboundResult.emailsDrafted },
                    { label: 'Emails Sent', value: outboundResult.emailsSent },
                  ].map((s) => (
                    <div key={s.label} className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center space-y-0.5">
                      <p className="text-lg font-mono font-bold text-brand-bronze">{s.value}</p>
                      <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">{s.label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                  <p className="text-xs text-gray-700">{outboundResult.summary}</p>
                  {outboundResult.emailsSent === 0 && outboundResult.emailsDrafted > 0 && (
                    <p className="text-[11px] text-amber-700 mt-2">Email drafts saved to Central Memory. Set RESEND_API_KEY to send automatically.</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
