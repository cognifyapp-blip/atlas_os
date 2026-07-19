/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Agent } from '../types';
import { BrainCircuit, MessageSquare, Send, Sparkles, Check, CheckCircle2, ListFilter, Play, RefreshCw } from 'lucide-react';

interface StrategySessionProps {
  agents: Agent[];
  onAddFeedAlert: (agentId: string, action: string, text: string, status: any) => void;
  onAddMemory: (text: string, type: any, actor: string) => void;
  authFetch: (url: string, options?: RequestInit) => Promise<Response>;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  speakerId?: string;
  speakerName: string;
  avatar: string;
  content: string;
  timestamp: string;
  recommendation?: {
    statement: string;
    actions: string[];
    constraints: string[];
  };
}

export default function StrategySession({ agents, onAddFeedAlert, onAddMemory, authFetch }: StrategySessionProps) {
  const [topic, setTopic] = useState<string>('');
  const [sessionActive, setSessionActive] = useState<boolean>(false);
  // Use real agent IDs from DB — initialized once agents load
  const [selectedAgentIds, setSelectedAgentIds] = useState<string[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>('');
  const [isTyping, setIsTyping] = useState<boolean>(false);
  const [typingAgentName, setTypingAgentName] = useState<string>('');
  const [activeRecommendation, setActiveRecommendation] = useState<any>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initialize selection with first 3 real agent IDs once agents load
  useEffect(() => {
    if (agents.length > 0 && selectedAgentIds.length === 0) {
      setSelectedAgentIds(agents.slice(0, 3).map((a) => a.id));
    }
  }, [agents]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const toggleAgentSelection = (id: string) => {
    if (selectedAgentIds.includes(id)) {
      if (selectedAgentIds.length > 2) {
        setSelectedAgentIds(selectedAgentIds.filter((item) => item !== id));
      }
    } else {
      if (selectedAgentIds.length < 4) {
        setSelectedAgentIds([...selectedAgentIds, id]);
      }
    }
  };

  const startSession = async () => {
    if (!topic.trim()) return;

    setSessionActive(true);
    setMessages([]);
    setActiveRecommendation(null);
    setIsTyping(true);
    setTypingAgentName('CEO Assistant (Atlas)');

    // Initial greeting from CEO Assistant
    setTimeout(async () => {
      const initialGreeting: Message = {
        id: `msg_init_${Date.now()}`,
        role: 'assistant',
        speakerId: 'ceo_assistant',
        speakerName: 'CEO Assistant (Atlas)',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
        content: `I have convened the Strategy Session on your topic: "${topic}". Our selected AI executives have been briefed. Finance AI, Sales AI, and Marketing AI will deliver coordinated operational viewpoints. Please share your strategic requirements.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages([initialGreeting]);
      setIsTyping(false);

      // Trigger first automatic agent response to get the dialogue rolling
      await triggerNextAgentMessage([initialGreeting]);
    }, 1500);
  };

  const triggerNextAgentMessage = async (currentHistory: Message[]) => {
    setIsTyping(true);

    // Pick an agent who hasn't spoken as much, or select dynamically
    const spokenAgentIds = currentHistory.map((m) => m.speakerId).filter(Boolean);
    const remainingIds = selectedAgentIds.filter((id) => !spokenAgentIds.includes(id));
    const nextAgentId = remainingIds.length > 0 ? remainingIds[0] : 'ceo_assistant';
    
    const nextAgent = agents.find((a) => a.id === nextAgentId) || agents[0];
    setTypingAgentName(nextAgent.name);

    try {
      // Map message history to schema
      const threadHistory = currentHistory.map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        speakerName: msg.speakerName,
        content: msg.content,
      }));

      const response = await authFetch('/api/v1/strategy-session', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          selectedAgents: selectedAgentIds,
          threadHistory,
        }),
      });

      const data = await response.json();
      const speakerAgent = agents.find((a) => a.id === data.speakerId) || agents[0];

      const newMsg: Message = {
        id: `msg_${Date.now()}`,
        role: 'assistant',
        speakerId: data.speakerId,
        speakerName: speakerAgent.name,
        avatar: speakerAgent.avatar,
        content: data.messageText,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      if (data.isSynthesis && data.recommendation) {
        newMsg.recommendation = data.recommendation;
        setActiveRecommendation(data.recommendation);
      }

      setMessages((prev) => [...prev, newMsg]);
    } catch (error) {
      console.error(error);
      // Local fallback
      const fallbackMsg: Message = {
        id: `msg_fallback_${Date.now()}`,
        role: 'assistant',
        speakerId: nextAgentId,
        speakerName: nextAgent.name,
        avatar: nextAgent.avatar,
        content: `I have evaluated "${topic}". We should establish a structured timeline, reduce customer friction, and measure standard CAC goals before dedicating major budget.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };
      setMessages((prev) => [...prev, fallbackMsg]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userInput.trim()) return;

    const userMsg: Message = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      speakerName: 'CEO (You)',
      avatar: '',
      content: userInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updated = [...messages, userMsg];
    setMessages(updated);
    setUserInput('');

    await triggerNextAgentMessage(updated);
  };

  const handleApproveRecommendation = () => {
    if (!activeRecommendation) return;

    onAddFeedAlert('ceo_assistant', 'Strategic Recommendation Approved', `Human CEO approved Strategy Plan: "${topic}"`, 'success');
    
    // Save to Memory
    onAddMemory(
      `Approved Strategic Strategy Recommendation on topic "${topic}":\n\nRecommendation Statement: ${activeRecommendation.statement}\n\nActions:\n${activeRecommendation.actions.map((a: string) => `- ${a}`).join('\n')}\n\nConstraints:\n${activeRecommendation.constraints.map((c: string) => `- ${c}`).join('\n')}`,
      'Strategy_Session',
      'CEO Assistant'
    );

    alert('Recommendation Approved and stored safely in Organizational Memory.');
    setSessionActive(false);
    setTopic('');
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">MULTI-AGENT BRAINSTORMING</span>
          <h1 className="text-xl font-sans font-semibold text-gray-900 mt-0.5">Strategy Session</h1>
          <p className="text-xs text-gray-400 mt-1">Convene live strategic sessions with multiple AI agents to synthesize cross-functional business analysis.</p>
        </div>
      </div>

      {!sessionActive ? (
        /* Configuration Panel */
        <div className="bg-white border border-gray-100/60 rounded-2xl p-8 max-w-2xl mx-auto shadow-sm space-y-6">
          <div className="text-center space-y-1">
            <div className="w-12 h-12 rounded-full bg-brand-bronze/10 flex items-center justify-center text-brand-bronze mx-auto mb-2">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <h2 className="text-base font-sans font-semibold text-gray-900">Configure Strategic Focus</h2>
            <p className="text-xs text-gray-400">Select the topic and the AI Executives you would like to consult.</p>
          </div>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-700">Strategic Topic / Inquiry</label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="e.g. Optimize marketingPersonas to improve B2B SaaS acquisition cost by 15%"
                className="w-full px-4 py-3 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-700 flex items-center justify-between">
                <span>Select AI Executives (2 to 4)</span>
                <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">
                  {selectedAgentIds.length} SELECTED
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {agents.map((agent) => {
                  const isSelected = selectedAgentIds.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      onClick={() => toggleAgentSelection(agent.id)}
                      className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                        isSelected
                          ? 'border-brand-bronze bg-brand-bronze/5 shadow-inner'
                          : 'border-gray-100 hover:border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <img
                          src={agent.avatar}
                          alt={agent.name}
                          referrerPolicy="no-referrer"
                          className="w-6 h-6 rounded-full object-cover"
                        />
                        <div className="min-w-0">
                          <h4 className="text-[10.5px] font-semibold text-gray-900 truncate">{agent.name}</h4>
                          <p className="text-[9px] font-mono text-brand-bronze uppercase tracking-wider truncate">
                            {agent.department}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-center">
            <button
              onClick={startSession}
              disabled={!topic.trim()}
              className="inline-flex items-center space-x-2 px-8 py-3.5 bg-black text-white rounded-xl text-xs font-semibold hover:bg-black/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Convene Strategy Session</span>
            </button>
          </div>
        </div>
      ) : (
        /* Conversation View */
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* Chat Pane */}
          <div className="lg:col-span-3 bg-white border border-gray-100/60 rounded-2xl flex flex-col h-[520px] shadow-sm relative overflow-hidden">
            {/* Thread Header */}
            <div className="p-4 border-b border-gray-50 flex items-center justify-between bg-gray-50/20">
              <div className="flex items-center space-x-3">
                <BrainCircuit className="w-4 h-4 text-brand-bronze" />
                <div>
                  <h3 className="text-xs font-semibold text-gray-900 truncate max-w-[400px]">Topic: {topic}</h3>
                  <p className="text-[9px] font-mono text-gray-400">ACTIVE BOARDROOM STRATEGY DISCORD</p>
                </div>
              </div>
              <button
                onClick={() => setSessionActive(false)}
                className="text-[10px] font-mono font-bold uppercase tracking-wider text-gray-400 hover:text-black"
              >
                Close Session
              </button>
            </div>

            {/* Messages Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={msg.id} className={`flex items-start space-x-4 ${isUser ? 'justify-end' : ''}`}>
                    {!isUser && (
                      <img
                        src={msg.avatar}
                        alt={msg.speakerName}
                        referrerPolicy="no-referrer"
                        className="w-8 h-8 rounded-lg object-cover border border-gray-200"
                      />
                    )}
                    <div className={`space-y-1.5 max-w-[80%] ${isUser ? 'text-right' : ''}`}>
                      <div className="flex items-baseline space-x-2 justify-start">
                        <span className="text-xs font-bold text-gray-900">{msg.speakerName}</span>
                        <span className="text-[9px] font-mono text-gray-400">{msg.timestamp}</span>
                      </div>
                      <div
                        className={`p-4 rounded-2xl text-xs leading-relaxed font-sans ${
                          isUser ? 'bg-black text-white rounded-tr-none' : 'bg-gray-50 text-gray-700 rounded-tl-none border border-gray-100/50'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.content}</p>

                        {/* Recommendation sub-card if compiled */}
                        {msg.recommendation && (
                          <div className="mt-4 p-4 bg-white border border-brand-bronze/10 rounded-xl space-y-3 shadow-xs text-left">
                            <h4 className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest flex items-center space-x-1.5">
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Executive Recommendation Statement</span>
                            </h4>
                            <p className="text-xs font-semibold text-gray-900">{msg.recommendation.statement}</p>
                            
                            <div className="space-y-2">
                              <p className="text-[9px] font-mono font-bold text-gray-400 uppercase">ACTION ITEMS</p>
                              <div className="space-y-1.5">
                                {msg.recommendation.actions.map((act, i) => (
                                  <p key={i} className="text-xs text-gray-600 flex items-start space-x-1.5">
                                    <span className="text-emerald-500 font-bold mt-0.5">✔</span>
                                    <span>{act}</span>
                                  </p>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <p className="text-[9px] font-mono font-bold text-gray-400 uppercase">CEILING CONSTRAINTS</p>
                              <div className="space-y-1.5">
                                {msg.recommendation.constraints.map((cons, i) => (
                                  <p key={i} className="text-xs text-gray-500 flex items-start space-x-1.5">
                                    <span className="text-brand-bronze font-bold">•</span>
                                    <span>{cons}</span>
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Typing Indicators */}
              {isTyping && (
                <div className="flex items-center space-x-3 text-[11px] text-gray-400 font-mono pl-12">
                  <RefreshCw className="w-3 h-3 animate-spin text-brand-bronze" />
                  <span>{typingAgentName} formulating operational briefing...</span>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Footer */}
            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-50 flex items-center space-x-3 bg-white">
              <input
                type="text"
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder="Ask specific department questions, or click to compile strategic brief..."
                className="flex-1 px-4 py-3 text-xs bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none focus:ring-1 focus:ring-black"
              />
              <button
                type="submit"
                disabled={!userInput.trim()}
                className="p-3 bg-black text-white hover:bg-black/95 rounded-xl disabled:opacity-30 cursor-pointer flex items-center justify-center"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>

          {/* Strategic Synthesis Dashboard Card Panel */}
          <div className="space-y-4">
            <h2 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Executive Office Synthesis</h2>
            
            {activeRecommendation ? (
              <div className="p-5 bg-white border border-brand-bronze/10 rounded-2xl shadow-sm space-y-4">
                <div className="flex items-center space-x-2 text-brand-bronze">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-widest">PROPOSAL IS MATURE</span>
                </div>
                <div className="space-y-1">
                  <h3 className="text-xs font-bold text-gray-900">Synthesis Ready</h3>
                  <p className="text-[10.5px] text-gray-500 leading-relaxed font-sans">
                    The strategic analysis is synthesized. Review terms and click below to file the approved project structure to memory.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    onClick={handleApproveRecommendation}
                    className="w-full py-2.5 bg-black text-white rounded-xl text-xs font-semibold hover:bg-black/90 transition-all cursor-pointer text-center"
                  >
                    Approve and Deploy Plan
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-5 bg-gray-50/50 border border-gray-100 rounded-2xl text-center space-y-3">
                <BrainCircuit className="w-8 h-8 text-gray-300 mx-auto" />
                <div className="space-y-1">
                  <h4 className="text-xs font-semibold text-gray-600">Gathering Intelligence</h4>
                  <p className="text-[10.5px] text-gray-400 font-sans">
                    Continue conversational directives. Once multiple viewpoints have been compiled, Atlas Assistant will synthesize the final strategic briefing.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
