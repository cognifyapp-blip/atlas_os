-- Atlas OS - Operational Models Migration
-- Adds: Lead, Decision, Proposal, Memory, Workflow, FeedEvent, Task

-- ═══════════════════════════════════════════════════════════════════════════
-- LEAD MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "LeadStatus" AS ENUM ('new', 'qualified', 'proposal_drafted', 'proposal_sent', 'closed_won', 'closed_lost', 'disqualified');
CREATE TYPE "LeadSource" AS ENUM ('inbound_webform', 'referral', 'cold_outreach', 'event', 'partner', 'organic', 'paid_ads', 'other');

CREATE TABLE "leads" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "company" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "status" "LeadStatus" NOT NULL DEFAULT 'new',
  "source" "LeadSource" NOT NULL DEFAULT 'inbound_webform',
  "value" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "qualificationScore" INTEGER,
  "qualificationReasoning" TEXT,
  "estimatedValue" DOUBLE PRECISION,
  "recommendedAction" TEXT,
  "assignedToExecutiveId" TEXT,
  "qualifiedAt" TIMESTAMP(3),
  "qualifiedBy" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leads_organizationId_idx" ON "leads"("organizationId");
CREATE INDEX "leads_status_idx" ON "leads"("status");
CREATE INDEX "leads_assignedToExecutiveId_idx" ON "leads"("assignedToExecutiveId");
CREATE INDEX "leads_createdAt_idx" ON "leads"("createdAt" DESC);

ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToExecutiveId_fkey" FOREIGN KEY ("assignedToExecutiveId") REFERENCES "ai_executives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- DECISION MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "DecisionStatus" AS ENUM ('pending', 'approved', 'declined', 'expired');
CREATE TYPE "DecisionType" AS ENUM ('general', 'financial', 'strategic', 'operational', 'legal', 'hr');

CREATE TABLE "decisions" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "description" TEXT,
  "reasoning" TEXT NOT NULL,
  "impact" TEXT,
  "confidence" INTEGER NOT NULL DEFAULT 50,
  "status" "DecisionStatus" NOT NULL DEFAULT 'pending',
  "type" "DecisionType" NOT NULL DEFAULT 'general',
  "createdByExecutiveId" TEXT NOT NULL,
  "approvedByUserId" TEXT,
  "approvedAt" TIMESTAMP(3),
  "declinedByUserId" TEXT,
  "declinedAt" TIMESTAMP(3),
  "declineReason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "decision_contributors" (
  "id" TEXT NOT NULL,
  "decisionId" TEXT NOT NULL,
  "executiveId" TEXT NOT NULL,
  "contribution" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "decision_contributors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "decisions_organizationId_idx" ON "decisions"("organizationId");
CREATE INDEX "decisions_status_idx" ON "decisions"("status");
CREATE INDEX "decisions_createdByExecutiveId_idx" ON "decisions"("createdByExecutiveId");
CREATE INDEX "decisions_createdAt_idx" ON "decisions"("createdAt" DESC);
CREATE UNIQUE INDEX "decision_contributors_decisionId_executiveId_key" ON "decision_contributors"("decisionId", "executiveId");

ALTER TABLE "decisions" ADD CONSTRAINT "decisions_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_createdByExecutiveId_fkey" FOREIGN KEY ("createdByExecutiveId") REFERENCES "ai_executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_approvedByUserId_fkey" FOREIGN KEY ("approvedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_declinedByUserId_fkey" FOREIGN KEY ("declinedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "decision_contributors" ADD CONSTRAINT "decision_contributors_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "decision_contributors" ADD CONSTRAINT "decision_contributors_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "ai_executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- PROPOSAL MANAGEMENT
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "ProposalStatus" AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');

CREATE TABLE "proposals" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "decisionId" TEXT,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "totalValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "status" "ProposalStatus" NOT NULL DEFAULT 'draft',
  "createdByExecutiveId" TEXT NOT NULL,
  "sentAt" TIMESTAMP(3),
  "viewedAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "declinedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "proposal_line_items" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "price" DOUBLE PRECISION NOT NULL,
  "total" DOUBLE PRECISION NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "proposal_line_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "proposals_organizationId_idx" ON "proposals"("organizationId");
CREATE INDEX "proposals_leadId_idx" ON "proposals"("leadId");
CREATE INDEX "proposals_status_idx" ON "proposals"("status");
CREATE INDEX "proposals_createdByExecutiveId_idx" ON "proposals"("createdByExecutiveId");
CREATE INDEX "proposal_line_items_proposalId_idx" ON "proposal_line_items"("proposalId");

ALTER TABLE "proposals" ADD CONSTRAINT "proposals_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_createdByExecutiveId_fkey" FOREIGN KEY ("createdByExecutiveId") REFERENCES "ai_executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "proposal_line_items" ADD CONSTRAINT "proposal_line_items_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- MEMORY SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "MemoryType" AS ENUM ('document', 'conversation', 'decision', 'insight', 'policy', 'workflow', 'other');

CREATE TABLE "memories" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "type" "MemoryType" NOT NULL DEFAULT 'other',
  "sourceSystem" TEXT,
  "actor" TEXT,
  "executiveId" TEXT,
  "tags" TEXT[],
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "memories_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "memories_organizationId_idx" ON "memories"("organizationId");
CREATE INDEX "memories_type_idx" ON "memories"("type");
CREATE INDEX "memories_executiveId_idx" ON "memories"("executiveId");
CREATE INDEX "memories_createdAt_idx" ON "memories"("createdAt" DESC);
CREATE INDEX "memories_tags_idx" ON "memories" USING GIN ("tags");

ALTER TABLE "memories" ADD CONSTRAINT "memories_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memories" ADD CONSTRAINT "memories_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "ai_executives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- WORKFLOW SYSTEM
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "WorkflowStatus" AS ENUM ('paused', 'active', 'completed', 'failed', 'cancelled');
CREATE TYPE "WorkflowStepStatus" AS ENUM ('pending', 'in_progress', 'completed', 'failed', 'skipped');

CREATE TABLE "workflows" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "WorkflowStatus" NOT NULL DEFAULT 'paused',
  "currentStepIndex" INTEGER NOT NULL DEFAULT 0,
  "triggerEvent" TEXT,
  "metadata" JSONB,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "workflow_steps" (
  "id" TEXT NOT NULL,
  "workflowId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "actionDescription" TEXT,
  "status" "WorkflowStepStatus" NOT NULL DEFAULT 'pending',
  "order" INTEGER NOT NULL,
  "actorExecutiveId" TEXT,
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  "error" TEXT,
  "output" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workflows_organizationId_idx" ON "workflows"("organizationId");
CREATE INDEX "workflows_status_idx" ON "workflows"("status");
CREATE INDEX "workflow_steps_workflowId_idx" ON "workflow_steps"("workflowId");
CREATE INDEX "workflow_steps_status_idx" ON "workflow_steps"("status");

ALTER TABLE "workflows" ADD CONSTRAINT "workflows_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_actorExecutiveId_fkey" FOREIGN KEY ("actorExecutiveId") REFERENCES "ai_executives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- FEED EVENTS (Real-time activity stream)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "FeedEventStatus" AS ENUM ('info', 'success', 'warning', 'critical');

CREATE TABLE "feed_events" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "executiveId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "status" "FeedEventStatus" NOT NULL DEFAULT 'info',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "feed_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "feed_events_organizationId_idx" ON "feed_events"("organizationId");
CREATE INDEX "feed_events_executiveId_idx" ON "feed_events"("executiveId");
CREATE INDEX "feed_events_createdAt_idx" ON "feed_events"("createdAt" DESC);

ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "feed_events" ADD CONSTRAINT "feed_events_executiveId_fkey" FOREIGN KEY ("executiveId") REFERENCES "ai_executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- TASK MANAGEMENT (For executives to track work)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'blocked', 'completed', 'cancelled');
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

CREATE TABLE "tasks" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'todo',
  "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
  "assignedToExecutiveId" TEXT NOT NULL,
  "createdByExecutiveId" TEXT,
  "leadId" TEXT,
  "proposalId" TEXT,
  "decisionId" TEXT,
  "workflowId" TEXT,
  "dueDate" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");
CREATE INDEX "tasks_status_idx" ON "tasks"("status");
CREATE INDEX "tasks_assignedToExecutiveId_idx" ON "tasks"("assignedToExecutiveId");
CREATE INDEX "tasks_dueDate_idx" ON "tasks"("dueDate");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignedToExecutiveId_fkey" FOREIGN KEY ("assignedToExecutiveId") REFERENCES "ai_executives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdByExecutiveId_fkey" FOREIGN KEY ("createdByExecutiveId") REFERENCES "ai_executives"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "proposals"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_decisionId_fkey" FOREIGN KEY ("decisionId") REFERENCES "decisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;
