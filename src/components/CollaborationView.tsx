/**
 * Atlas OS — Collaboration View
 *
 * UI for the inter-executive collaboration system.
 * Shows real-time session history, lets you trigger direct exec-to-exec
 * questions, multi-exec sessions, and autonomous workflows.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  MessageSquare,
  Users,
  Zap,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Play,
  Send,
  GitMerge,
  Brain,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CollabSession {
  id: string;
  type: 'ask' | 'convene' | 'brief';
  executive: string | null;
  text: string;
  tags: string[];
  createdAt: string;
}

interface WorkflowResult {
  [key: string]: unknown;
}

// ─── Executive options ────────────────────────────────────────────────────────

const EXECUTIVES = [
  'Atlas (CEO Assistant)',
  'Aurelia (Finance AI)',
  'Zephyr (Sales AI)',
  'Aria (Marketing AI)',
  'Lyra (Customer Success AI)',
  'Sage (HR AI)',
  'Orion (Operations AI)',
  'Lexis (Legal AI)',
  'Forge (Developer AI)',
  'Iris (Intelligence AI)',
];

const WORKFLOWS = [
  { id: 'first_client', label: '🚀 First Client Campaign', description: 'Full zero-to-client: ICP → outbound → qualify → propose → legal ready (6-week plan)', params: [] },
  { id: 'weekly_board_prep', label: 'Weekly Board Prep', description: 'Iris briefs all execs → Atlas writes board report', params: [] },
  { id: 'expansion_analysis', label: 'Expansion Analysis', description: 'Full exec session on a strategic opportunity', params: ['opportunity'] },
  { id: 'incident_response', label: 'Incident Response', description: 'Orion + Forge + Atlas handle an incident end-to-end', params: ['title', 'description', 'severity', 'affectedSystems'] },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CollaborationView() {
  const [sessions, setSessions] = useState<CollabSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'ask' | 'convene' | 'workflow'>('sessions');

  // Ask form
  const [askFrom, setAskFrom] = useState(EXECUTIVES[2]); // Zephyr
  const [askTo, setAskTo] = useState(EXECUTIVES[1]);     // Aurelia
  const [askQuestion, setAskQuestion] = useState('');
  const [askResult, setAskResult] = useState<{ answer: string } | null>(null);
  const [askLoading, setAskLoading] = useState(false);

  // Convene form
  const [convener, setConvener] = useState(EXECUTIVES[0]); // Atlas
  const [topic, setTopic] = useState('');
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>([EXECUTIVES[1], EXECUTIVES[2], EXECUTIVES[9]]);
  const [conveneResult, setConveneResult] = useState<{ consensus: string; recommendedActions: string[]; dissents: string[]; transcript: Array<{ speaker: string; message: string }> } | null>(null);
  const [conveneLoading, setConveneLoading] = useState(false);
  const [expandedTranscript, setExpandedTranscript] = useState(false);

  // Workflow form
  const [selectedWorkflow, setSelectedWorkflow] = useState(WORKFLOWS[0]);
  const [workflowParams, setWorkflowParams] = useState<Record<string, string>>({});
  const [workflowResult, setWorkflowResult] = useState<WorkflowResult | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/collaboration/sessions');
      const data = await res.json();
      setSessions(data.sessions ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSessions(); }, []);

  // ── Ask handler ──────────────────────────────────────────────────────────────

  const handleAsk = async () => {
    if (!askQuestion.trim()) return;
    setAskLoading(true);
    setAskResult(null);
    try {
      const res = await fetch('/api/v1/collaboration/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: askFrom, to: askTo, question: askQuestion }),
      });
      const data = await res.json();
      setAskResult(data);
      fetchSessions();
    } catch (e) {
      console.error(e);
    } finally {
      setAskLoading(false);
    }
  };

  // ── Convene handler ──────────────────────────────────────────────────────────

  const handleConvene = async () => {
    if (!topic.trim() || selectedParticipants.length < 2) return;
    setConveneLoading(true);
    setConveneResult(null);
    try {
      const res = await fetch('/api/v1/collaboration/convene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ convener, topic, participants: selectedParticipants }),
      });
      const data = await res.json();
      setConveneResult(data);
      fetchSessions();
    } catch (e) {
      console.error(e);
    } finally {
      setConveneLoading(false);
    }
  };

  const toggleParticipant = (exec: string) => {
    if (exec === convener) return;
    setSelectedParticipants((prev) =>
      prev.includes(exec) ? prev.filter((p) => p !== exec) : [...prev, exec],
    );
  };

  // ── Workflow handler ─────────────────────────────────────────────────────────

  const handleWorkflow = async () => {
    setWorkflowLoading(true);
    setWorkflowResult(null);
    try {
      const body: Record<string, unknown> = { ...workflowParams };
      if (selectedWorkflow.id === 'incident_response' && workflowParams.affectedSystems) {
        body.affectedSystems = workflowParams.affectedSystems.split(',').map((s) => s.trim());
      }
      const res = await fetch(`/api/v1/collaboration/workflow/${selectedWorkflow.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setWorkflowResult(data);
      fetchSessions();
    } catch (e) {
      console.error(e);
    } finally {
      setWorkflowLoading(false);
    }
  };

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const typeIcon = (type: string) => {
    if (type === 'convene') return <Users className="w-3 h-3" />;
    if (type === 'brief') return <Brain className="w-3 h-3" />;
    return <MessageSquare className="w-3 h-3" />;
  };

  const typeLabel = (type: string) => {
    if (type === 'convene') return 'Session';
    if (type === 'brief') return 'Briefing';
    return 'Message';
  };

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
              <GitMerge className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-gray-900">Executive Collaboration</h1>
              <p className="text-xs text-gray-400">Executives talking to each other, forming consensus, running autonomous workflows.</p>
            </div>
          </div>
          <button onClick={fetchSessions} className="p-2 hover:bg-gray-50 rounded-lg text-gray-400 hover:text-gray-700 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex space-x-1 mt-4 bg-gray-50 rounded-xl p-1">
          {[
            { id: 'sessions', label: 'Session History', icon: <MessageSquare className="w-3.5 h-3.5" /> },
            { id: 'ask', label: 'Direct Message', icon: <Send className="w-3.5 h-3.5" /> },
            { id: 'convene', label: 'Convene Session', icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'workflow', label: 'Run Workflow', icon: <Zap className="w-3.5 h-3.5" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 flex items-center justify-center space-x-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                activeTab === tab.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Session History ───────────────────────────────────────────────────── */}
      {activeTab === 'sessions' && (
        <div className="space-y-3">
          {sessions.length === 0 ? (
            <div className="bg-white border border-gray-100 rounded-2xl p-10 text-center text-xs text-gray-400">
              No collaboration sessions yet. Use Direct Message or Convene Session to start one.
            </div>
          ) : (
            sessions.map((session) => (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <span className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                      session.type === 'convene' ? 'bg-purple-50 text-purple-700' :
                      session.type === 'brief' ? 'bg-blue-50 text-blue-700' :
                      'bg-gray-50 text-gray-600'
                    }`}>
                      {typeIcon(session.type)}
                      <span>{typeLabel(session.type)}</span>
                    </span>
                    {session.executive && (
                      <span className="text-[10px] font-mono text-brand-bronze">{session.executive}</span>
                    )}
                  </div>
                  <span className="text-[10px] font-mono text-gray-400 flex-shrink-0">
                    {new Date(session.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="mt-2 text-xs text-gray-600 leading-relaxed">{session.text}</p>
              </motion.div>
            ))
          )}
        </div>
      )}

      {/* ── Direct Message ────────────────────────────────────────────────────── */}
      {activeTab === 'ask' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-xs font-semibold text-gray-900">Ask one executive a question on behalf of another</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">From</label>
              <select
                value={askFrom}
                onChange={(e) => setAskFrom(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30"
              >
                {EXECUTIVES.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">To</label>
              <select
                value={askTo}
                onChange={(e) => setAskTo(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30"
              >
                {EXECUTIVES.filter((e) => e !== askFrom).map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Question</label>
            <textarea
              value={askQuestion}
              onChange={(e) => setAskQuestion(e.target.value)}
              placeholder={`e.g. "If I discount this $55k deal 15%, can we still hit Q3 target?"`}
              rows={3}
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30 resize-none"
            />
          </div>

          <button
            onClick={handleAsk}
            disabled={askLoading || !askQuestion.trim()}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-black/90 transition-colors"
          >
            {askLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            <span>{askLoading ? 'Waiting for response…' : 'Send Message'}</span>
          </button>

          {askResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-wider">{askTo} responded:</p>
              <p className="text-xs text-gray-700 leading-relaxed">{askResult.answer}</p>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Convene Session ───────────────────────────────────────────────────── */}
      {activeTab === 'convene' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-xs font-semibold text-gray-900">Convene a multi-executive session and reach consensus</h2>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Convener (chairs the session)</label>
              <select
                value={convener}
                onChange={(e) => setConvener(e.target.value)}
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30"
              >
                {EXECUTIVES.map((e) => <option key={e}>{e}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Topic</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Should we enter the EU market in Q4?"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Participants (select at least 2)</label>
            <div className="grid grid-cols-2 gap-2">
              {EXECUTIVES.filter((e) => e !== convener).map((exec) => (
                <button
                  key={exec}
                  onClick={() => toggleParticipant(exec)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all text-left ${
                    selectedParticipants.includes(exec)
                      ? 'bg-brand-bronze/5 border-brand-bronze/30 text-gray-900'
                      : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedParticipants.includes(exec) ? 'bg-brand-bronze' : 'bg-gray-300'}`} />
                  <span className="truncate">{exec}</span>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleConvene}
            disabled={conveneLoading || !topic.trim() || selectedParticipants.length < 2}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-black/90 transition-colors"
          >
            {conveneLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
            <span>{conveneLoading ? `Running session (${selectedParticipants.length} executives)…` : 'Convene Session'}</span>
          </button>

          <AnimatePresence>
            {conveneResult && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 space-y-1">
                  <p className="text-[10px] font-mono text-emerald-700 font-bold uppercase tracking-wider">Consensus</p>
                  <p className="text-xs text-gray-800 leading-relaxed">{conveneResult.consensus}</p>
                </div>

                {conveneResult.recommendedActions.length > 0 && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
                    <p className="text-[10px] font-mono text-gray-500 font-bold uppercase tracking-wider">Recommended Actions</p>
                    <ul className="space-y-1.5">
                      {conveneResult.recommendedActions.map((action, i) => (
                        <li key={i} className="flex items-start space-x-2 text-xs text-gray-700">
                          <span className="font-mono text-brand-bronze flex-shrink-0">{i + 1}.</span>
                          <span>{action}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {conveneResult.dissents.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 space-y-2">
                    <p className="text-[10px] font-mono text-amber-700 font-bold uppercase tracking-wider">Dissents / Concerns</p>
                    <ul className="space-y-1">
                      {conveneResult.dissents.map((d, i) => (
                        <li key={i} className="text-xs text-gray-700">• {d}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border border-gray-100 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedTranscript((p) => !p)}
                    className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                  >
                    <span>Full Transcript ({conveneResult.transcript.length} messages)</span>
                    {expandedTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>
                  {expandedTranscript && (
                    <div className="divide-y divide-gray-50">
                      {conveneResult.transcript.map((t, i) => (
                        <div key={i} className="px-4 py-3 space-y-1">
                          <p className="text-[10px] font-mono text-brand-bronze font-bold">{t.speaker}</p>
                          <p className="text-xs text-gray-700 leading-relaxed">{t.message}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Autonomous Workflows ──────────────────────────────────────────────── */}
      {activeTab === 'workflow' && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-5">
          <h2 className="text-xs font-semibold text-gray-900">Trigger a full autonomous multi-executive workflow</h2>

          <div className="grid grid-cols-1 gap-2">
            {WORKFLOWS.map((wf) => (
              <button
                key={wf.id}
                onClick={() => { setSelectedWorkflow(wf); setWorkflowParams({}); setWorkflowResult(null); }}
                className={`flex items-start space-x-3 px-4 py-3 rounded-xl border text-left transition-all ${
                  selectedWorkflow.id === wf.id ? 'bg-brand-bronze/5 border-brand-bronze/30' : 'bg-gray-50 border-gray-100 hover:bg-gray-100'
                }`}
              >
                <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${selectedWorkflow.id === wf.id ? 'bg-brand-bronze' : 'bg-gray-300'}`} />
                <div>
                  <p className="text-xs font-semibold text-gray-900">{wf.label}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">{wf.description}</p>
                </div>
              </button>
            ))}
          </div>

          {selectedWorkflow.params.length > 0 && (
            <div className="space-y-3">
              {selectedWorkflow.params.map((param) => (
                <div key={param} className="space-y-1.5">
                  <label className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">{param}</label>
                  <input
                    type="text"
                    value={workflowParams[param] ?? ''}
                    onChange={(e) => setWorkflowParams((p) => ({ ...p, [param]: e.target.value }))}
                    placeholder={param === 'affectedSystems' ? 'api-server, database (comma-separated)' : `Enter ${param}…`}
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-1 focus:ring-brand-bronze/30"
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={handleWorkflow}
            disabled={workflowLoading || (selectedWorkflow.params.length > 0 && selectedWorkflow.params.some((p) => !workflowParams[p]))}
            className="flex items-center space-x-2 px-4 py-2 bg-black text-white rounded-lg text-xs font-semibold disabled:opacity-40 hover:bg-black/90 transition-colors"
          >
            {workflowLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            <span>{workflowLoading ? 'Running autonomous workflow…' : `Run: ${selectedWorkflow.label}`}</span>
          </button>

          {workflowResult && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-wider">Workflow Complete</p>
              <pre className="text-[10px] text-gray-600 overflow-auto max-h-64 leading-relaxed whitespace-pre-wrap">
                {JSON.stringify(workflowResult, null, 2)}
              </pre>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
