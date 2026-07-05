/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Agent {
  id: string;
  name: string;
  department: string;
  role: string;
  avatar: string;
  status: 'Active' | 'In Process' | 'Idle' | 'Waiting';
  lastAction: string;
  bio: string;
  goals: string[];
  tools: string[];
  metrics: {
    tasksCompleted: number;
    decisionsMade: number;
    valueGenerated: number; // in USD or ZAR
  };
}

export type MemoryType =
  | 'Meeting_Transcript'
  | 'Decision_Record'
  | 'Email_Thread'
  | 'Document'
  | 'Chat_Message'
  | 'Customer_Interaction'
  | 'Workflow_Event'
  | 'Strategy_Session';

export interface MemoryEntry {
  id: string;
  text: string;
  type: MemoryType;
  sourceSystem: string;
  actor: string;
  createdAt: string;
  tags: string[];
  relevanceScore?: number; // for semantic search
}

export interface Decision {
  id: string;
  title: string;
  summary: string;
  description: string;
  reasoning: string;
  impact: string; // e.g. "Generates $42,000 ARR, improves margins by 4%"
  confidence: number; // 0 - 100
  status: 'pending' | 'approved' | 'declined';
  contributors: string[]; // agent IDs
  type: 'lead_qualification' | 'proposal_approval' | 'payroll' | 'general';
  createdAt: string;
  payload?: any; // internal data (like lead ID, invoice details, etc.)
}

export interface FeedEvent {
  id: string;
  agentId: string;
  agentName: string;
  department: string;
  action: string;
  text: string;
  timestamp: string;
  status: 'success' | 'warning' | 'info' | 'critical';
}

export interface Lead {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  status: 'new' | 'qualifying' | 'qualified' | 'unqualified' | 'proposal_drafted' | 'proposal_sent' | 'lost';
  source: string;
  value: number;
  score?: number; // 0 - 100
  reasoning?: string;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  price: number;
}

export interface Proposal {
  id: string;
  leadId: string;
  customerName: string;
  companyName: string;
  items: InvoiceItem[];
  total: number;
  status: 'draft' | 'approved' | 'sent' | 'paid';
  createdAt: string;
  content: string; // Markdown or detailed text description of proposal
}

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  actorId?: string; // agent ID or "CEO"
  actionDescription: string;
}

export interface Workflow {
  id: string;
  name: string;
  status: 'running' | 'paused' | 'completed' | 'failed';
  steps: WorkflowStep[];
  currentStepIndex: number;
  triggerEvent: string;
  updatedAt: string;
}

export interface OrganizationContext {
  name: string;
  industry: string;
  size: string;
  goals: string;
  challenges: string;
  softwareStack: string;
  initialized: boolean;
}
