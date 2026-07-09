/**
 * Atlas OS — Frontend Types
 *
 * These types match exactly what the API returns from the database-backed
 * server. Field names align with the Prisma models mapped through server.ts.
 */

// ─── Agent (AI Executive) ─────────────────────────────────────────────────────

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
    valueGenerated: number;
  };
}

// ─── Memory ───────────────────────────────────────────────────────────────────

// DB stores lowercase; keep the union permissive with a string fallback
export type MemoryType =
  | 'document' | 'conversation' | 'decision' | 'insight' | 'policy' | 'workflow' | 'other'
  // Legacy uppercase values (still accepted by MemoryConsole)
  | 'Meeting_Transcript' | 'Decision_Record' | 'Email_Thread' | 'Document'
  | 'Chat_Message' | 'Customer_Interaction' | 'Workflow_Event' | 'Strategy_Session';

export interface MemoryEntry {
  id: string;
  text: string;
  type: MemoryType;
  sourceSystem: string;
  actor: string;
  createdAt: string;
  tags: string[];
  relevanceScore?: number;
}

// ─── Decision ─────────────────────────────────────────────────────────────────

export interface Decision {
  id: string;
  title: string;
  summary: string;
  description: string;
  reasoning: string;
  impact: string;
  confidence: number; // 0-100
  status: 'pending' | 'approved' | 'declined' | 'expired';
  // contributors is an array of executive IDs (DB returns string[])
  contributors: string[];
  type: string;
  createdAt: string;
}

// ─── Feed Event ───────────────────────────────────────────────────────────────

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

// ─── Lead ─────────────────────────────────────────────────────────────────────

export interface Lead {
  id: string;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  status: 'new' | 'qualifying' | 'qualified' | 'unqualified' | 'proposal_drafted' | 'proposal_sent' | 'closed_won' | 'closed_lost' | 'disqualified' | 'lost';
  source: string;
  value: number;
  // Qualification fields — present after Zephyr runs
  score?: number | null;
  reasoning?: string | null;
  createdAt: string;
}

// ─── Proposal ─────────────────────────────────────────────────────────────────

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
  companyName: string | null;
  items: InvoiceItem[];
  total: number;
  status: 'draft' | 'approved' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired' | 'paid';
  createdAt: string;
  content: string;
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export interface WorkflowStep {
  name: string;
  status: 'pending' | 'running' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  actorId?: string | null;
  actionDescription: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  status: 'running' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled';
  steps: WorkflowStep[];
  currentStepIndex: number;
  triggerEvent: string | null;
  updatedAt: string;
}

// ─── Organization Context ─────────────────────────────────────────────────────

export interface OrganizationContext {
  id?: string;
  name: string;
  industry: string | null;
  size: string | null;
  goals: string | null;
  challenges: string | null;
  softwareStack: string | null;
  initialized: boolean;
}
