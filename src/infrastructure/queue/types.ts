/**
 * Atlas OS — Queue Job Type Definitions
 *
 * Every job that flows through Atlas queues is strongly typed here.
 * Workers receive typed payloads — no any casts in business logic.
 */

// ─── Queue Names ─────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  INTEGRATION: 'integration',
  SYNC: 'sync',
  WORKFLOW: 'workflow',
  SALES: 'sales',
  FINANCE: 'finance',
  MARKETING: 'marketing',
  OPERATIONS: 'operations',
  EMAIL: 'email',
  NOTIFICATION: 'notification',
  MEMORY: 'memory',
  REPORT: 'report',
  ANALYTICS: 'analytics',
  AUTOMATION: 'automation',
  EXECUTIVE: 'executive',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ─── Base Job Envelope ────────────────────────────────────────────────────────

/**
 * Every Atlas job carries this metadata envelope.
 * Allows full traceability across workers, logs, and AI agents.
 */
export interface BaseJobPayload {
  /** Atlas Organization ID (cuid) */
  organizationId: string;
  /** Atlas User ID who triggered the job (cuid). Use 'system' for automated jobs. */
  userId: string;
  /** Unique correlation ID for distributed tracing */
  correlationId: string;
  /** ISO 8601 timestamp when the job was created */
  createdAt: string;
  /** Metadata for debugging / AI context */
  metadata?: Record<string, unknown>;
}

// ─── Integration Jobs ──────────────────────────────────────────────────────────

export type IntegrationProvider = 'hubspot' | 'quickbooks' | 'google' | 'slack' | 'teams' | string;
export type IntegrationEvent = 'connect' | 'disconnect' | 'sync' | 'webhook' | 'push' | 'pull' | 'health_check' | string;

export interface IntegrationJobPayload extends BaseJobPayload {
  type: 'INTEGRATION';
  provider: IntegrationProvider;
  event: IntegrationEvent;
  integrationId?: string;
  webhookData?: Record<string, unknown>;
}

// ─── Sync Jobs ────────────────────────────────────────────────────────────────

export type SyncMode = 'initial' | 'incremental' | 'full';

export interface SyncJobPayload extends BaseJobPayload {
  type: 'SYNC';
  provider: IntegrationProvider;
  integrationId: string;
  mode: SyncMode;
  entityType?: string; // e.g. 'contacts', 'deals', 'invoices'
  cursor?: string;     // Pagination cursor for incremental sync
}

// ─── Workflow Jobs ────────────────────────────────────────────────────────────

export interface WorkflowJobPayload extends BaseJobPayload {
  type: 'WORKFLOW';
  workflowId: string;
  stepIndex: number;
  stepName: string;
  triggerEvent: string;
  context: Record<string, unknown>;
}

// ─── Sales Jobs ───────────────────────────────────────────────────────────────

export type SalesJobAction =
  | 'qualify_lead'
  | 'score_lead'
  | 'draft_proposal'
  | 'send_proposal'
  | 'follow_up'
  | 'close_deal'
  | 'analyze_pipeline';

export interface SalesJobPayload extends BaseJobPayload {
  type: 'SALES';
  action: SalesJobAction;
  leadId?: string;
  proposalId?: string;
  dealId?: string;
  context?: Record<string, unknown>;
}

// ─── Finance Jobs ─────────────────────────────────────────────────────────────

export type FinanceJobAction =
  | 'generate_invoice'
  | 'reconcile_accounts'
  | 'analyze_cashflow'
  | 'generate_report'
  | 'process_payment'
  | 'forecast_revenue';

export interface FinanceJobPayload extends BaseJobPayload {
  type: 'FINANCE';
  action: FinanceJobAction;
  invoiceId?: string;
  periodStart?: string;
  periodEnd?: string;
  context?: Record<string, unknown>;
}

// ─── Marketing Jobs ───────────────────────────────────────────────────────────

export type MarketingJobAction =
  | 'generate_content'
  | 'analyze_campaign'
  | 'schedule_post'
  | 'track_metrics'
  | 'generate_report'
  | 'optimize_seo';

export interface MarketingJobPayload extends BaseJobPayload {
  type: 'MARKETING';
  action: MarketingJobAction;
  campaignId?: string;
  channel?: string;
  content?: string;
  context?: Record<string, unknown>;
}

// ─── Operations Jobs ──────────────────────────────────────────────────────────

export type OperationsJobAction =
  | 'run_health_check'
  | 'optimize_process'
  | 'vendor_review'
  | 'generate_sop'
  | 'audit_workflow'
  | 'analyze_ops';

export interface OperationsJobPayload extends BaseJobPayload {
  type: 'OPERATIONS';
  action: OperationsJobAction;
  processId?: string;
  vendorId?: string;
  context?: Record<string, unknown>;
}

// ─── Email Jobs ───────────────────────────────────────────────────────────────

export interface EmailJobPayload extends BaseJobPayload {
  type: 'EMAIL';
  to: string | string[];
  subject: string;
  template?: string;
  body?: string;
  templateData?: Record<string, unknown>;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: string; encoding?: string }>;
}

// ─── Notification Jobs ────────────────────────────────────────────────────────

export type NotificationChannel = 'in_app' | 'email' | 'slack' | 'teams' | 'webhook';
export type NotificationPriority = 'low' | 'normal' | 'high' | 'critical';

export interface NotificationJobPayload extends BaseJobPayload {
  type: 'NOTIFICATION';
  channel: NotificationChannel;
  recipientId: string;
  title: string;
  message: string;
  priority: NotificationPriority;
  actionUrl?: string;
  data?: Record<string, unknown>;
}

// ─── Memory Jobs ──────────────────────────────────────────────────────────────

export type MemoryJobAction =
  | 'index_entry'
  | 'semantic_search'
  | 'consolidate'
  | 'purge_old'
  | 'generate_summary'
  | 'embed_document';

export interface MemoryJobPayload extends BaseJobPayload {
  type: 'MEMORY';
  action: MemoryJobAction;
  entryId?: string;
  text?: string;
  tags?: string[];
  sourceSystem?: string;
  context?: Record<string, unknown>;
}

// ─── Report Jobs ──────────────────────────────────────────────────────────────

export type ReportType =
  | 'executive_summary'
  | 'financial'
  | 'sales_pipeline'
  | 'marketing_performance'
  | 'operations'
  | 'boardroom'
  | 'ai_workforce'
  | 'custom';

export interface ReportJobPayload extends BaseJobPayload {
  type: 'REPORT';
  reportType: ReportType;
  periodStart?: string;
  periodEnd?: string;
  format?: 'json' | 'pdf' | 'markdown';
  recipientIds?: string[];
  context?: Record<string, unknown>;
}

// ─── Analytics Jobs ───────────────────────────────────────────────────────────

export type AnalyticsJobAction =
  | 'track_event'
  | 'compute_metrics'
  | 'aggregate_daily'
  | 'generate_insights'
  | 'detect_anomalies';

export interface AnalyticsJobPayload extends BaseJobPayload {
  type: 'ANALYTICS';
  action: AnalyticsJobAction;
  event?: string;
  properties?: Record<string, unknown>;
  dimension?: string;
  periodStart?: string;
  periodEnd?: string;
}

// ─── Automation Jobs ──────────────────────────────────────────────────────────

export interface AutomationJobPayload extends BaseJobPayload {
  type: 'AUTOMATION';
  automationId: string;
  trigger: string;
  steps: Array<{
    id: string;
    name: string;
    type: string;
    config: Record<string, unknown>;
  }>;
  context: Record<string, unknown>;
}

// ─── Executive AI Jobs ────────────────────────────────────────────────────────

export type ExecutiveJobAction =
  | 'analyze_situation'
  | 'generate_recommendation'
  | 'synthesize_departments'
  | 'draft_strategy'
  | 'review_decisions'
  | 'coordinate_agents';

export interface ExecutiveJobPayload extends BaseJobPayload {
  type: 'EXECUTIVE';
  action: ExecutiveJobAction;
  executiveId: string;
  topic?: string;
  context: Record<string, unknown>;
  participantIds?: string[];
}

// ─── Union type of all job payloads ──────────────────────────────────────────

export type AtlasJobPayload =
  | IntegrationJobPayload
  | SyncJobPayload
  | WorkflowJobPayload
  | SalesJobPayload
  | FinanceJobPayload
  | MarketingJobPayload
  | OperationsJobPayload
  | EmailJobPayload
  | NotificationJobPayload
  | MemoryJobPayload
  | ReportJobPayload
  | AnalyticsJobPayload
  | AutomationJobPayload
  | ExecutiveJobPayload;

// ─── Job result type ─────────────────────────────────────────────────────────

export interface JobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  durationMs: number;
  completedAt: string;
}
