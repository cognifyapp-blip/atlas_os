-- Atlas OS: Mission Goals & Milestones
-- Enables CEO to set company objectives; Atlas breaks them into weekly milestones,
-- each executive tracks progress against assigned milestones.

CREATE TABLE IF NOT EXISTS "mission_goals" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "organizationId"  TEXT NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "targetDate"      TIMESTAMP,
  "status"          TEXT NOT NULL DEFAULT 'active',
  "progress"        INTEGER NOT NULL DEFAULT 0,
  "successCriteria" TEXT,
  "setByHuman"      BOOLEAN NOT NULL DEFAULT true,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "goal_milestones" (
  "id"              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  "goalId"          TEXT NOT NULL,
  "organizationId"  TEXT NOT NULL,
  "week"            INTEGER NOT NULL,
  "title"           TEXT NOT NULL,
  "description"     TEXT,
  "ownerExecutiveId" TEXT,
  "status"          TEXT NOT NULL DEFAULT 'pending',
  "dueDate"         TIMESTAMP,
  "completedAt"     TIMESTAMP,
  "notes"           TEXT,
  "metadata"        JSONB,
  "createdAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"       TIMESTAMP NOT NULL DEFAULT NOW(),
  FOREIGN KEY ("goalId") REFERENCES "mission_goals"("id") ON DELETE CASCADE,
  FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE,
  FOREIGN KEY ("ownerExecutiveId") REFERENCES "ai_executives"("id") ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "mission_goals_org_idx" ON "mission_goals"("organizationId");
CREATE INDEX IF NOT EXISTS "mission_goals_status_idx" ON "mission_goals"("status");
CREATE INDEX IF NOT EXISTS "goal_milestones_goal_idx" ON "goal_milestones"("goalId");
CREATE INDEX IF NOT EXISTS "goal_milestones_owner_idx" ON "goal_milestones"("ownerExecutiveId");
