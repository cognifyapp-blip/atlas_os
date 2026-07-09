/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lead, Proposal, Agent, Workflow } from '../types';
import { Target, DollarSign, Megaphone, Plus, Upload, Play, CheckCircle2, AlertCircle, RefreshCw, Send, ChevronRight } from 'lucide-react';

interface DepartmentViewsProps {
  activeTab: 'finance' | 'sales' | 'marketing' | 'workforce';
  leads: Lead[];
  proposals: Proposal[];
  agents: Agent[];
  workflows: Workflow[];
  onTriggerQualify: (leadId: string) => void;
  onImportCSV: (csvText: string) => void;
  onAddManualLead: (lead: any) => void;
}

export default function DepartmentViews({
  activeTab,
  leads,
  proposals,
  agents,
  workflows,
  onTriggerQualify,
  onImportCSV,
  onAddManualLead,
}: DepartmentViewsProps) {
  // Sales Tab State
  const [showManualLeadModal, setShowManualLeadModal] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [showCsvImporter, setShowCsvImporter] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({
    name: '',
    company: '',
    email: '',
    phone: '',
    value: '',
    source: 'Manual Entry',
  });

  const handleManualLeadSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLeadForm.name || !newLeadForm.company) return;
    onAddManualLead({
      ...newLeadForm,
      value: Number(newLeadForm.value) || 0,
    });
    setNewLeadForm({ name: '', company: '', email: '', phone: '', value: '', source: 'Manual Entry' });
    setShowManualLeadModal(false);
  };

  const handleCsvSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvText.trim()) return;
    onImportCSV(csvText);
    setCsvText('');
    setShowCsvImporter(false);
  };

  // -----------------------------------------------------------------------------
  // 1. SALES COMMAND CENTER VIEW
  // -----------------------------------------------------------------------------
  const renderSalesView = () => {
    // Find the most recently active lead-conversion workflow (any active/running one)
    const activeWorkflow = workflows.find((w) =>
      (w.status === 'running' || w.status === 'active') &&
      w.steps && w.steps.length > 0
    );

    return (
      <div className="space-y-6">
        {/* Sales Hero header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 border border-gray-100/60 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-sans font-semibold text-gray-900">Sales Pipeline Command</h1>
              <p className="text-xs text-gray-400">Zephyr manages customer profiles, score parameters, and qualifications autonomously.</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowCsvImporter(!showCsvImporter)}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-white text-gray-700 rounded-xl text-xs font-semibold border border-gray-100 hover:bg-gray-50/50 cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import CSV</span>
            </button>
            <button
              onClick={() => setShowManualLeadModal(true)}
              className="inline-flex items-center space-x-1.5 px-4 py-2.5 bg-black text-white rounded-xl text-xs font-semibold hover:bg-black/95 cursor-pointer tactile-button-inset"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Lead</span>
            </button>
          </div>
        </div>

        {/* CSV Importer Drawer */}
        {showCsvImporter && (
          <div className="p-6 bg-white border border-gray-100 rounded-2xl shadow-inner space-y-4">
            <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">CSV Lead Importer</h3>
            <p className="text-[11px] text-gray-400">Paste your raw leads lists. Accepted format: Name, Company, Email, Phone, Target Budget (one per line).</p>
            <form onSubmit={handleCsvSubmit} className="space-y-4">
              <textarea
                rows={4}
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
                placeholder="Thabo Ndlovu, Silo Technologies, thabo@silotech.co.za, +27821112223, 28000&#10;Zola Mthethwa, Nexus Core, zola@nexus.co, +27834445556, 18500"
                className="w-full p-4 text-xs font-mono bg-gray-50 border border-gray-100 rounded-xl focus:bg-white focus:outline-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCsvImporter(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-black text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Process CSV Rows
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Lead Qualification Workflow Pulse indicator */}
        {activeWorkflow && (activeWorkflow.status === 'running' || activeWorkflow.status === 'active') && (
          <div className="p-5 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <RefreshCw className="w-4 h-4 text-brand-bronze animate-spin" />
                <span className="text-xs font-bold text-gray-900">Active Workflow: {activeWorkflow.name}</span>
              </div>
              <span className="text-[9px] font-mono text-brand-bronze font-bold uppercase tracking-wider">
                STEP {activeWorkflow.currentStepIndex + 1} OF 4
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {activeWorkflow.steps.map((step, idx) => {
                const isCurrent = idx === activeWorkflow.currentStepIndex;
                const isDone = step.status === 'completed';
                const isActive = step.status === 'in_progress' || step.status === 'running';
                return (
                  <div key={idx} className="space-y-1">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        isActive || isCurrent ? 'bg-brand-bronze pulsing-glow' : isDone ? 'bg-emerald-600' : 'bg-gray-100'
                      }`}
                    />
                    <p className="text-[9px] font-semibold text-gray-600 leading-tight">{step.name}</p>
                    <p className="text-[8px] text-gray-400 font-sans leading-none">{step.actionDescription}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inbound Leads Table/Grid */}
        <div className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
            <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">Inbound Leads Matrix</span>
            <span className="text-[10px] text-gray-400 font-mono">{leads.length} LEADS REGISTERED</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-50 text-[10px] font-mono text-gray-400 uppercase tracking-wider bg-gray-50/10">
                  <th className="p-4 pl-6">Prospect Name</th>
                  <th className="p-4">Company</th>
                  <th className="p-4">Budget Value</th>
                  <th className="p-4">Qualification Fit</th>
                  <th className="p-4">Operational Status</th>
                  <th className="p-4 pr-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-gray-50/40 transition-colors">
                    <td className="p-4 pl-6 font-semibold text-gray-900">
                      <div>
                        {lead.name}
                        <p className="text-[10px] text-gray-400 font-normal font-sans">{lead.email || 'No email contact'}</p>
                      </div>
                    </td>
                    <td className="p-4 text-gray-600 font-sans font-medium">{lead.company}</td>
                    <td className="p-4 font-mono font-semibold text-gray-900">${lead.value.toLocaleString()}</td>
                    <td className="p-4">
                      {lead.score ? (
                        <div className="flex items-center space-x-2">
                          <span
                            className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-bold ${
                              lead.score >= 80 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {lead.score}/100
                          </span>
                          <span className="text-[10px] text-gray-400 truncate max-w-[150px] font-sans" title={lead.reasoning}>
                            {lead.reasoning}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400 font-sans italic">Awaiting AI qualification...</span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        className={`px-2 py-0.5 rounded-md text-[9px] font-mono font-bold uppercase ${
                          lead.status === 'proposal_sent'
                            ? 'bg-emerald-50 text-emerald-700'
                            : lead.status === 'qualifying'
                            ? 'bg-amber-50 text-amber-700 animate-pulse'
                            : lead.status === 'proposal_drafted'
                            ? 'bg-blue-50 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {lead.status}
                      </span>
                    </td>
                    <td className="p-4 pr-6 text-right">
                      {lead.status === 'new' && (
                        <button
                          onClick={() => onTriggerQualify(lead.id)}
                          className="inline-flex items-center space-x-1 px-3 py-1.5 bg-black text-white rounded-lg text-[10px] font-semibold hover:bg-black/90 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>Trigger AI Qualification</span>
                        </button>
                      )}
                      {lead.status === 'proposal_sent' && (
                        <span className="text-[10px] font-mono text-emerald-600 font-semibold flex items-center justify-end space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Proposal Dispatched</span>
                        </span>
                      )}
                      {lead.status === 'qualifying' && (
                        <span className="text-[10px] font-mono text-amber-600 font-medium animate-pulse">Running loops...</span>
                      )}
                      {lead.status === 'proposal_drafted' && (
                        <span className="text-[10px] font-mono text-blue-600 font-semibold">Awaiting CEO Approval</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Manual Lead Modal */}
        {showManualLeadModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/10 backdrop-blur-xs">
            <div className="absolute inset-0" onClick={() => setShowManualLeadModal(false)} />
            <div className="bg-white p-6 border border-gray-100 rounded-2xl max-w-md w-full relative z-10 shadow-2xl space-y-4">
              <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Register Prospect Lead</h3>
              <form onSubmit={handleManualLeadSubmit} className="space-y-3 text-xs">
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Prospect Name</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.name}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, name: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none"
                    placeholder="Thabo Ndlovu"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Company Name</label>
                  <input
                    type="text"
                    required
                    value={newLeadForm.company}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, company: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none"
                    placeholder="Silo Technologies"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Email Contact</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none"
                    placeholder="thabo@silotech.co.za"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-semibold text-gray-700">Target Deal Value ($)</label>
                  <input
                    type="number"
                    value={newLeadForm.value}
                    onChange={(e) => setNewLeadForm({ ...newLeadForm, value: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg focus:outline-none"
                    placeholder="25000"
                  />
                </div>
                <div className="pt-3 flex justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowManualLeadModal(false)}
                    className="px-4 py-2 text-gray-400 font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-black text-white font-semibold rounded-lg cursor-pointer"
                  >
                    Register Lead
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  };

  // -----------------------------------------------------------------------------
  // 2. FINANCE DEPARTMENT VIEW
  // -----------------------------------------------------------------------------
  const renderFinanceView = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-6 border border-gray-100/60 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
              <DollarSign className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-sans font-semibold text-gray-900">Finance Ledger & Invoices</h1>
              <p className="text-xs text-gray-400">Aurelia tracks commercial proposals, matches line items to product catalogs, and protects runway.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Active Ledger List */}
          <div className="lg:col-span-2 bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-50 flex justify-between items-center bg-gray-50/20">
              <span className="text-[10px] font-mono text-brand-bronze font-bold uppercase tracking-widest">Active Proposals Ledger</span>
              <span className="text-[10px] text-gray-400 font-mono">{proposals.length} TRANSACTIONS</span>
            </div>

            {proposals.length === 0 ? (
              <div className="p-12 text-center space-y-2 text-xs text-gray-400 font-sans">
                <DollarSign className="w-8 h-8 text-gray-200 mx-auto" />
                <p>No active proposals draft compiled. Go to Sales and trigger lead qualification to let Finance AI assemble a briefing agreement.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {proposals.map((prop) => (
                  <div key={prop.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50/20">
                    <div className="space-y-1">
                      <h4 className="text-xs font-bold text-gray-900">{prop.companyName}</h4>
                      <p className="text-[10px] text-gray-400 font-mono">CLIENT: {prop.customerName}</p>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {prop.items.map((item, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-gray-50 border border-gray-100 text-[8.5px] font-mono rounded text-gray-500">
                            {item.description} (x{item.quantity})
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="text-right space-y-1 flex-shrink-0">
                      <p className="text-sm font-mono font-bold text-gray-900">${prop.total.toLocaleString()}</p>
                      <span
                        className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${
                          prop.status === 'sent'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-blue-50 text-blue-700 animate-pulse'
                        }`}
                      >
                        {prop.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Product Catalog Standard Pricing */}
          <div className="p-5 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Product Catalog List</h3>
            <p className="text-[11px] text-gray-400 leading-relaxed">
              Standard corporate licensing options evaluated by Aurelia when compiling invoices.
            </p>
            <div className="space-y-3">
              <div className="p-3 bg-gray-50 rounded-xl flex justify-between items-center text-xs">
                <div>
                  <h4 className="font-semibold text-gray-900">Atlas Platform SaaS License</h4>
                  <p className="text-[10px] text-gray-400 font-mono">ANNUAL SEAT RECURRING</p>
                </div>
                <span className="font-mono font-bold text-brand-bronze">$12,000</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl flex justify-between items-center text-xs">
                <div>
                  <h4 className="font-semibold text-gray-900">Professional Setup & Models Integration</h4>
                  <p className="text-[10px] text-gray-400 font-mono">ONETIME PROVISION FEE</p>
                </div>
                <span className="font-mono font-bold text-brand-bronze">$8,500</span>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl flex justify-between items-center text-xs">
                <div>
                  <h4 className="font-semibold text-gray-900">Advisory Strategy Token Consultation</h4>
                  <p className="text-[10px] text-gray-400 font-mono">10 SESSIONS PACKAGE</p>
                </div>
                <span className="font-mono font-bold text-brand-bronze">$5,000</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // -----------------------------------------------------------------------------
  // 3. MARKETING STUDIO VIEW
  // -----------------------------------------------------------------------------
  const renderMarketingView = () => {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between bg-white p-6 border border-gray-100/60 rounded-2xl shadow-sm">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-brand-bronze/10 text-brand-bronze rounded-xl">
              <Megaphone className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-base font-sans font-semibold text-gray-900">Marketing & Brand Studio</h1>
              <p className="text-xs text-gray-400">Aria crafts content templates, monitors target search keywords, and tracks Persona conversions.</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Ad Persona Target brief */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Active Brand Persona Target</h3>
            <p className="text-xs text-gray-600 leading-relaxed font-sans">
              CMO Assistant Aria targets high-growth directors experiencing administrative overhead. Our active campaign profiles B2B SaaS solutions and consolidates multi-tenant operations.
            </p>
            <div className="p-4 bg-gray-50 rounded-xl space-y-2 text-xs">
              <p className="font-mono text-[10px] text-brand-bronze font-bold">SAMPLE CAMPAIGN PITCH COPY</p>
              <p className="text-gray-700 italic leading-relaxed">
                "Stop spending your weekend compiling manual accounting ledgers. Secure a strategic AI chief of staff to orchestrate your operational workflows autonomously. Meet Atlas OS."
              </p>
            </div>
          </div>

          {/* Ad Click Performance Logs */}
          <div className="bg-white border border-gray-100 rounded-2xl p-6 space-y-4 shadow-sm">
            <h3 className="text-xs font-semibold text-brand-bronze font-mono uppercase tracking-wider">Ad Performance Analytics</h3>
            <p className="text-xs text-gray-400">Autonomously tracked campaign indicators since launching target Personas.</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Impressions</p>
                <p className="text-sm font-mono font-bold text-gray-900 mt-1">42,180</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Click-Thru Ratio</p>
                <p className="text-sm font-mono font-bold text-gray-900 mt-1">4.82%</p>
              </div>
              <div className="p-3 bg-gray-50 rounded-xl text-center">
                <p className="text-[9px] font-mono text-gray-400 uppercase tracking-wider">Cost-Per-Acquisition</p>
                <p className="text-sm font-mono font-bold text-brand-bronze mt-1">$47.10</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      {activeTab === 'sales' && renderSalesView()}
      {activeTab === 'finance' && renderFinanceView()}
      {activeTab === 'marketing' && renderMarketingView()}
    </div>
  );
}
