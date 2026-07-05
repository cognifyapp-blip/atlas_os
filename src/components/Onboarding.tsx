/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Sparkles, Building, Briefcase, FileText, CheckCircle2, User } from 'lucide-react';
import { OrganizationContext } from '../types';

interface OnboardingProps {
  onCompleted: (context: OrganizationContext, briefing: any) => void;
}

export default function Onboarding({ onCompleted }: OnboardingProps) {
  const [step, setStep] = useState<number>(1);
  const [form, setForm] = useState({
    name: '',
    industry: '',
    size: '1-10',
    goals: '',
    challenges: '',
    softwareStack: '',
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [buildMessages, setBuildMessages] = useState<string[]>([]);
  const [currentBuildMsgIndex, setCurrentBuildMsgIndex] = useState<number>(0);
  const [loadingBriefing, setLoadingBriefing] = useState<boolean>(false);
  const [briefingResult, setBriefingResult] = useState<any>(null);

  // Hardcoded premium executive portraits
  const executives = [
    {
      id: 'ceo_assistant',
      name: 'CEO Assistant (Atlas)',
      role: 'Strategic Chief of Staff',
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
      message: `Greetings. I am Atlas. I am here to orchestrate your operational workforce, synthesize complex reports, and ensure you retain absolute veto and strategic steering authority without administrative friction.`,
    },
    {
      id: 'finance_ai',
      name: 'Finance AI (Aurelia)',
      role: 'Financial Analyst & Treasurer',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
      message: `Hello Executive. I am Aurelia. I have successfully initialized financial monitors for the ${form.industry || 'General Services'} sector. I stand ready to manage cash flows, audit invoices, and optimize bottom-line runway.`,
    },
    {
      id: 'sales_ai',
      name: 'Sales AI (Zephyr)',
      role: 'Lead Generation & Pipeline Strategist',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
      message: `I am Zephyr. Ready to pipeline accounts, qualify inbound leads, and build automated deal pipelines so that our sales velocity operates 24/7.`,
    },
    {
      id: 'marketing_ai',
      name: 'Marketing AI (Aria)',
      role: 'CMO Assistant & Content Specialist',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
      message: `Greetings. I am Aria. I track brand Personas, monitor click-through data, and write strategic messaging targets. Ready to amplify our digital footprint.`,
    },
  ];

  const buildSequence = [
    'Building your secure digital headquarters...',
    'Establishing deep row-level tenant boundaries...',
    'Provisioning AI Executive work loops...',
    'Connecting Central Memory vector search structures...',
    'Analyzing current market trends in the ' + (form.industry || 'specified') + ' vertical...',
    'Compiling Day Zero Briefing for the CEO...',
  ];

  const validateForm = () => {
    const errors: string[] = [];
    if (!form.name.trim()) errors.push('Company Name is required.');
    if (!form.industry.trim()) errors.push('Industry vertical is required.');
    if (!form.goals.trim()) errors.push('Strategic goals are required.');
    setValidationErrors(errors);
    return errors.length === 0;
  };

  const handleNextFromStep2 = () => {
    if (validateForm()) {
      setStep(3);
    }
  };

  const startBuildSequence = async () => {
    setStep(4);
    setLoadingBriefing(true);

    // Call API to save context and generate Day Zero briefing
    try {
      const response = await fetch('/api/v1/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await response.json();
      setBriefingResult(data.briefing);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingBriefing(false);
    }
  };

  useEffect(() => {
    if (step === 4) {
      setCurrentBuildMsgIndex(0);
      const interval = setInterval(() => {
        setCurrentBuildMsgIndex((prev) => {
          if (prev < buildSequence.length - 1) {
            return prev + 1;
          } else {
            clearInterval(interval);
            setTimeout(() => {
              setStep(5);
            }, 1500);
            return prev;
          }
        });
      }, 1800);

      return () => clearInterval(interval);
    }
  }, [step]);

  return (
    <div className="min-h-screen bg-[#fdf8f8] flex flex-col justify-between p-6 md:p-12 relative overflow-hidden">
      {/* Absolute Ambient Background */}
      <div className="absolute inset-0 bg-radial-gradient from-brand-bronze/5 to-transparent pointer-events-none opacity-40" />

      {/* Header */}
      <header className="flex items-center space-x-3 z-10">
        <div className="w-10 h-10 rounded-xl bg-black flex items-center justify-center shadow-md">
          <span className="text-white font-mono font-bold text-lg tracking-widest">A</span>
        </div>
        <div>
          <h1 className="font-sans font-bold text-sm tracking-tight text-gray-900">ATLAS</h1>
          <p className="text-[10px] font-mono text-brand-bronze tracking-wider uppercase font-medium">Autonomous Operating System</p>
        </div>
      </header>

      {/* Main Content Card Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto flex items-center justify-center py-12 z-10">
        <AnimatePresence mode="wait">
          {/* STEP 1: WELCOME */}
          {step === 1 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="text-center space-y-8 max-w-2xl"
            >
              <div className="inline-flex p-3 rounded-full bg-brand-bronze/10 text-brand-bronze mb-2">
                <Sparkles className="w-6 h-6" />
              </div>
              <div className="space-y-4">
                <h2 className="text-4xl md:text-5xl font-sans font-semibold tracking-tight leading-none text-gray-900">
                  Welcome.<br />Let's build your organization.
                </h2>
                <p className="text-sm md:text-base text-gray-500 leading-relaxed max-w-md mx-auto">
                  Atlas is a multi-tenant business operating system where autonomous AI executives lead your core departments while you retain strategic authority.
                </p>
              </div>
              <div>
                <button
                  onClick={() => setStep(2)}
                  className="inline-flex items-center space-x-3 px-8 py-4 bg-black text-white rounded-xl text-sm font-medium hover:bg-black/90 transition-all shadow-md active:scale-[0.98] group"
                >
                  <span>Begin Organization Setup</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 2: CONTEXT FORM */}
          {step === 2 && (
            <motion.div
              key="context"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-2xl bg-white rounded-2xl border border-gray-100 p-8 shadow-xl space-y-6"
            >
              <div className="border-b border-gray-50 pb-4">
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">STEP 02 OF 05</span>
                <h2 className="text-2xl font-sans font-semibold tracking-tight text-gray-900 mt-1">Configure Business Context</h2>
                <p className="text-xs text-gray-400 mt-1">Provide background information. Our autonomous workforce utilizes this context to tailor operations.</p>
              </div>

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-lg space-y-1">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 font-medium">● {err}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
                    <Building className="w-3.5 h-3.5 text-gray-400" />
                    <span>Company / Organization Name</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="e.g. Silo Solutions"
                    className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
                    <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                    <span>Industry / Vertical</span>
                  </label>
                  <input
                    type="text"
                    value={form.industry}
                    onChange={(e) => setForm({ ...form, industry: e.target.value })}
                    placeholder="e.g. B2B Cloud Technology"
                    className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-700 flex items-center space-x-1">
                    <FileText className="w-3.5 h-3.5 text-gray-400" />
                    <span>Core Strategic Goals</span>
                  </label>
                  <textarea
                    rows={2}
                    value={form.goals}
                    onChange={(e) => setForm({ ...form, goals: e.target.value })}
                    placeholder="What are your strategic goals? (e.g., expand regional market, automate lead qualification, protect cash flows)"
                    className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold text-gray-700">Primary Operational Bottlenecks</label>
                  <textarea
                    rows={2}
                    value={form.challenges}
                    onChange={(e) => setForm({ ...form, challenges: e.target.value })}
                    placeholder="e.g. Invoices delayed, lead response latency, slow document generation..."
                    className="w-full px-4 py-3 text-sm bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleNextFromStep2}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-xl text-xs font-medium hover:bg-black/90 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <span>Meet Your Executive Team</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 3: MEET YOUR AI EXECUTIVES */}
          {step === 3 && (
            <motion.div
              key="team"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full max-w-3xl bg-white rounded-2xl border border-gray-100 p-8 shadow-xl space-y-6"
            >
              <div className="border-b border-gray-50 pb-4">
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">STEP 03 OF 05</span>
                <h2 className="text-2xl font-sans font-semibold tracking-tight text-gray-900 mt-1">Meet Your Executive Workforce</h2>
                <p className="text-xs text-gray-400 mt-1">These AI executive agents autonomously run your departments. They cooperate with each other and await your strategic directives.</p>
              </div>

              {/* Profiles layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {executives.map((exec, index) => (
                  <motion.div
                    key={exec.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: index * 0.15 }}
                    className="p-4 bg-gray-50/50 rounded-xl border border-gray-100 flex items-start space-x-4"
                  >
                    <img
                      src={exec.avatar}
                      alt={exec.name}
                      referrerPolicy="no-referrer"
                      className="w-12 h-12 rounded-xl object-cover border border-gray-200 shadow-inner flex-shrink-0"
                    />
                    <div className="space-y-1">
                      <h3 className="text-xs font-semibold text-gray-900">{exec.name}</h3>
                      <p className="text-[10px] font-mono text-brand-bronze font-medium uppercase tracking-wider">{exec.role}</p>
                      <p className="text-[11px] text-gray-500 leading-relaxed italic mt-1 font-sans">
                        "{exec.message}"
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="pt-4 flex justify-between items-center">
                <button
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-black transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={startBuildSequence}
                  className="inline-flex items-center space-x-2 px-6 py-3 bg-black text-white rounded-xl text-xs font-medium hover:bg-black/90 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <span>Initialize Digital Headquarters</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP 4: PROGRESS SEQUENCE */}
          {step === 4 && (
            <motion.div
              key="build"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-8 max-w-md w-full"
            >
              {/* Spinning / pulsing loading ring */}
              <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                <div className="absolute inset-0 rounded-full border-4 border-gray-100" />
                <div className="absolute inset-0 rounded-full border-4 border-t-brand-bronze animate-spin" />
                <Sparkles className="w-6 h-6 text-brand-bronze animate-pulse" />
              </div>

              <div className="space-y-2">
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">PROVISIONING WORKSPACE</span>
                <AnimatePresence mode="wait">
                  <motion.p
                    key={currentBuildMsgIndex}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                    className="text-sm font-sans font-medium text-gray-700 min-h-[40px]"
                  >
                    {buildSequence[currentBuildMsgIndex]}
                  </motion.p>
                </AnimatePresence>
              </div>

              <div className="w-full bg-gray-100 rounded-full h-1">
                <div
                  className="bg-brand-bronze h-1 rounded-full transition-all duration-300"
                  style={{ width: `${((currentBuildMsgIndex + 1) / buildSequence.length) * 100}%` }}
                />
              </div>
            </motion.div>
          )}

          {/* STEP 5: DAY ZERO BRIEFING READY */}
          {step === 5 && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="w-full max-w-3xl bg-white rounded-2xl border border-gray-100 p-8 shadow-xl space-y-6"
            >
              <div className="border-b border-gray-50 pb-4 text-center">
                <div className="inline-flex p-3 rounded-full bg-emerald-50 text-emerald-600 mb-2">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-sans font-semibold tracking-tight text-gray-900 leading-none">Your headquarters is initialized</h2>
                <p className="text-xs text-gray-400 mt-1">Autonomous systems have completed training on "{form.name}". Here is your Day Zero intelligence briefing.</p>
              </div>

              {/* Day Zero summary panels */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 p-5 bg-gray-50/50 rounded-xl border border-gray-100 space-y-3">
                  <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Executive Summary</h3>
                  <div className="text-xs text-gray-600 leading-relaxed font-sans prose prose-sm space-y-2">
                    {briefingResult?.briefing ? (
                      <div className="whitespace-pre-wrap">{briefingResult.briefing}</div>
                    ) : (
                      <p>Workspace setup successfully finalized. Models Aurelia and Zephyr initialized in steady active loop pools. Strategic targets mapped and waiting billing details.</p>
                    )}
                  </div>
                </div>

                <div className="p-5 bg-brand-bronze/5 rounded-xl border border-brand-bronze/10 space-y-4">
                  <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Tactical Opportunities</h3>
                  <div className="space-y-3">
                    {briefingResult?.insights && briefingResult.insights.length > 0 ? (
                      briefingResult.insights.map((ins: string, idx: number) => (
                        <div key={idx} className="flex items-start space-x-2">
                          <span className="text-xs text-brand-bronze font-bold font-mono mt-0.5">{idx + 1}.</span>
                          <p className="text-xs text-gray-700 leading-snug font-sans font-medium">{ins}</p>
                        </div>
                      ))
                    ) : (
                      <>
                        <div className="flex items-start space-x-2">
                          <span className="text-xs text-brand-bronze font-bold font-mono">1.</span>
                          <p className="text-xs text-gray-700 font-sans">Audit historical CRM parameters to configure model-fit conversion benchmarks.</p>
                        </div>
                        <div className="flex items-start space-x-2">
                          <span className="text-xs text-brand-bronze font-bold font-mono">2.</span>
                          <p className="text-xs text-gray-700 font-sans">Deploy automated lead qualifiers via sales hooks to minimize manual latency.</p>
                        </div>
                        <div className="flex items-start space-x-2">
                          <span className="text-xs text-brand-bronze font-bold font-mono">3.</span>
                          <p className="text-xs text-gray-700 font-sans">Align marketing Personas between Aria and Zephyr autonomously.</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex justify-center">
                <button
                  onClick={() => onCompleted(form, briefingResult)}
                  className="inline-flex items-center space-x-2 px-8 py-3.5 bg-black text-white rounded-xl text-xs font-semibold hover:bg-black/90 transition-all shadow-md active:scale-[0.98] cursor-pointer"
                >
                  <span>Enter Mission Control</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="text-center text-[10px] text-gray-400 font-mono z-10">
        ATLAS OPERATING SYSTEM // ENTERPRISE MULTI-TENANT BOUNDARY // SECURE LAYER
      </footer>
    </div>
  );
}
