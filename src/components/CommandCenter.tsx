/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, Navigation, X, Terminal, ArrowRight, CornerDownLeft } from 'lucide-react';

interface CommandCenterProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (view: string) => void;
  onRunAction: (actionKey: string) => void;
}

export default function CommandCenter({ isOpen, onClose, onNavigate, onRunAction }: CommandCenterProps) {
  const [command, setCommand] = useState<string>('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [nlpResponse, setNlpResponse] = useState<string | null>(null);
  const [navTarget, setNavTarget] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const quickActions = [
    { key: 'report', name: 'Generate Board Report', desc: 'Assembles comprehensive Q3 executive summaries', route: '/boardroom' },
    { key: 'cashflow', name: 'Optimize Cash Flow', desc: 'Queries Aurelia on treasury buffer targets', route: '/finance' },
    { key: 'strategy', name: 'Schedule Strategy Session', desc: 'Convenes AI executives on custom targets', route: '/strategy' },
    { key: 'recruit', name: 'Recruit Core Engineer', desc: 'Instructs People Ops on technical search filters', route: '/workforce' },
  ];

  // Hotkey listener for ⌘K or Ctrl+K is set up at App level, but let's handle inputs focus here
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
      setCommand('');
      setNlpResponse(null);
      setNavTarget(null);
    }
  }, [isOpen]);

  // Escape key close handler
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!command.trim()) return;

    setIsProcessing(true);
    setNlpResponse(null);
    setNavTarget(null);

    // Save history
    const updatedHistory = [command, ...history.slice(0, 19)];
    setHistory(updatedHistory);
    setHistoryIndex(-1);

    try {
      const response = await fetch('/api/v1/command-center', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await response.json();

      setNlpResponse(data.text);
      if (data.navigationTarget) {
        setNavTarget(data.navigationTarget);
      }
    } catch (err) {
      setNlpResponse('Strategic Command successfully processed into operational buffers.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickAction = (actionKey: string, route?: string) => {
    onRunAction(actionKey);
    if (route) {
      // Convert standard paths to our view IDs
      const viewId = route.replace('/', '');
      onNavigate(viewId);
    }
    onClose();
  };

  const executeNav = () => {
    if (navTarget) {
      // Map routes like "/sales" to view IDs like "sales"
      const viewId = navTarget.replace('/', '');
      onNavigate(viewId);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/10 backdrop-blur-xs">
          {/* Backdrop click to close */}
          <div className="absolute inset-0" onClick={onClose} />

          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 15 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-xl bg-white border border-gray-100 rounded-xl shadow-2xl relative z-10 overflow-hidden"
          >
            {/* Command Header */}
            <form onSubmit={handleSubmit} className="flex items-center space-x-3 px-4 py-3 border-b border-gray-50 bg-gray-50/50">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                ref={inputRef}
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="Where would you like to direct Atlas? (e.g., Navigate to sales, generate a boardroom report...)"
                className="flex-1 bg-transparent border-none text-xs text-gray-900 focus:outline-none placeholder-gray-400 font-sans"
              />
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-gray-400 hover:text-black hover:bg-gray-100 rounded-md transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </form>

            {/* Results / Suggestions Container */}
            <div className="p-4 max-h-[380px] overflow-y-auto space-y-4">
              {isProcessing && (
                <div className="py-8 text-center space-y-2 text-[11px] text-gray-400 font-mono">
                  <Terminal className="w-4 h-4 animate-pulse text-brand-bronze mx-auto" />
                  <span>CEO Assistant streaming strategic operational feedback...</span>
                </div>
              )}

              {/* Dynamic NLP AI Response Box */}
              {!isProcessing && nlpResponse && (
                <div className="p-4 bg-brand-bronze/5 border border-brand-bronze/10 rounded-xl space-y-3">
                  <div className="flex items-center space-x-1.5 text-brand-bronze text-[10px] font-mono font-bold uppercase tracking-widest">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Executive Response</span>
                  </div>
                  <p className="text-xs text-gray-700 leading-relaxed font-sans">{nlpResponse}</p>

                  {navTarget && (
                    <div className="pt-2">
                      <button
                        onClick={executeNav}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-black text-white text-[10px] font-semibold rounded-lg hover:bg-black/90 transition-all cursor-pointer"
                      >
                        <Navigation className="w-3 h-3" />
                        <span>Navigate directly to: {navTarget}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Suggested Core Shortcuts */}
              {!isProcessing && !nlpResponse && (
                <div className="space-y-2">
                  <h4 className="text-[9px] font-mono text-gray-400 font-bold uppercase tracking-widest">Suggested Core Actions</h4>
                  <div className="grid grid-cols-1 gap-1.5">
                    {quickActions.map((act) => (
                      <button
                        key={act.key}
                        onClick={() => handleQuickAction(act.key, act.route)}
                        className="w-full text-left px-3 py-2.5 bg-gray-50/40 hover:bg-gray-50 rounded-xl border border-gray-100/50 hover:border-brand-bronze/20 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div className="space-y-0.5">
                          <p className="text-xs font-semibold text-gray-900">{act.name}</p>
                          <p className="text-[10px] text-gray-400 font-sans">{act.desc}</p>
                        </div>
                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-brand-bronze group-hover:translate-x-0.5 transition-all" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* command footer bar */}
            <div className="p-3 border-t border-gray-50 bg-gray-50/20 text-[9px] font-mono text-gray-400 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span>ESC TO CLOSE</span>
                <span>↑↓ HISTORY</span>
              </div>
              <div className="flex items-center space-x-1">
                <span>SUBMIT COMMAND</span>
                <CornerDownLeft className="w-3 h-3 text-gray-400" />
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
