# Atlas OS

An autonomous AI business operating system. Ten AI executives run your company — Sales, Finance, Marketing, Customer Success, HR, Operations, Legal, Engineering, Intelligence, and a CEO Assistant — all powered by real LLMs, backed by PostgreSQL, and communicating with each other.

---

## What's Real

Every executive has a complete TypeScript class that calls an actual LLM (OpenRouter / OpenAI / DeepSeek), reads from and writes to a real PostgreSQL database (Neon), persists memory and decisions, broadcasts live updates via SSE, and is exposed as a real HTTP endpoint.

**The executives can:**
- Talk to each other directly (Zephyr asks Aurelia a deal-margin question — Aurelia responds in character)
- Convene multi-executive sessions with AI consensus and dissent tracking
- Delegate tasks to each other with AI acknowledgement and DB task records
- Run full autonomous workflows end-to-end without any human trigger
- Pursue CEO-set goals with Atlas planning weekly milestones for each executive
- Generate outbound prospect lists and draft personalised cold emails
- Operate autonomously under a configurable governance policy (Atlas acts as CEO within defined limits)

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in: DATABASE_URL, OPENROUTER_API_KEY (or OPENAI/DEEPSEEK), and optionally RESEND_API_KEY

# 3. Push schema to Neon
npx prisma db push

# 4. Generate Prisma client
npx prisma generate

# 5. Start the server
npm run dev
# → http://localhost:3000
```

---

## Configuration

### Required
| Variable | Description |
|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `OPENROUTER_API_KEY` | LLM provider key (or `OPENAI_API_KEY` / `DEEPSEEK_API_KEY`) |

### Optional — Email Sending
| Variable | Description |
|---|---|
| `RESEND_API_KEY` | Resend (primary — free tier: 100 emails/day) |
| `SENDGRID_API_KEY` | SendGrid (fallback) |
| `EMAIL_FROM` | Sender address, e.g. `Atlas OS <noreply@yourdomain.com>` |

Without an email key, emails are drafted and saved to Central Memory. They don't send, but everything else works.

### Optional — Notifications
| Variable | Description |
|---|---|
| `SLACK_WEBHOOK_URL` | Slack channel webhook (no OAuth needed) |
| `TEAMS_WEBHOOK_URL` | Teams channel webhook (no OAuth needed) |

### Optional — Governance
| Variable | Options | Default |
|---|---|---|
| `GOVERNANCE_MODE` | `supervised` \| `hybrid` \| `autonomous` | `supervised` |

- **supervised** — all decisions require human CEO approval
- **hybrid** — Atlas approves low-risk decisions; you review high-risk only
- **autonomous** — Atlas acts as CEO within policy thresholds

### Optional — Redis (Background Workers)
| Variable | Description |
|---|---|
| `REDIS_URL` | Redis URL for BullMQ job queues |

Without Redis, the HTTP API and scheduler still work. Workers are disabled.

### Optional — Integrations
```
HUBSPOT_CLIENT_ID / HUBSPOT_CLIENT_SECRET
QUICKBOOKS_CLIENT_ID / QUICKBOOKS_CLIENT_SECRET
GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET
SLACK_CLIENT_ID / SLACK_CLIENT_SECRET
AZURE_CLIENT_ID / AZURE_CLIENT_SECRET / AZURE_TENANT_ID
```

---

## Architecture

```
Browser (React + Vite)
    ↕ SSE (live feed, decisions, governance events)
Express Server (server.ts)
    ├── /api/v1/executives/*      → 10 AI executive classes (direct LLM calls)
    ├── /api/v1/collaboration/*   → Inter-executive messaging + autonomous workflows
    ├── /api/v1/governance/*      → Atlas as acting CEO, policy engine
    ├── /api/v1/goals/*           → Mission goals + outbound campaigns
    ├── /api/integrations/*       → OAuth callbacks + sync triggers
    └── /api/v1/scheduler/*       → Manual schedule triggers
AI Executive Services (src/services/executives/)
    └── ExecutiveService (base: LLM, DB, SSE, Decisions, Memory, Tasks)
        ├── CEOAssistant (Atlas)
        ├── FinanceAI (Aurelia)
        ├── SalesAI (Zephyr)
        ├── MarketingAI (Aria)
        ├── CustomerSuccessAI (Lyra)
        ├── HRAI (Sage)
        ├── OperationsAI (Orion)
        ├── LegalAI (Lexis)
        ├── DeveloperAI (Forge)
        └── IntelligenceAI (Iris)
Collaboration Layer (src/services/)
    ├── CollaborationSession    → ask(), convene(), delegate(), briefExecutive()
    ├── AutonomousWorkflows     → dealReview, fullLeadCycle, weeklyBoardPrep, etc.
    ├── FirstClientWorkflow     → Full zero-to-client pipeline
    ├── MissionControl          → CEO goal → Atlas milestone planning
    ├── OutboundEngine          → ICP → prospect generation → qualify → email
    ├── GovernancePolicy        → Decision routing (auto / Atlas / human CEO)
    ├── EventBus                → Typed cross-executive event system
    ├── ExecutionBridge         → Wires EventBus → executive services
    ├── SchedulerService        → Cron-aligned autonomous executive schedules
    └── EmailService            → Resend → SendGrid → console fallback
BullMQ Workers (src/workers/workers/) — require Redis
    ├── ExecutiveWorker, SalesWorker, FinanceWorker, MarketingWorker
    ├── OperationsWorker, WorkflowWorker, ReportWorker, AnalyticsWorker
    ├── EmailWorker, NotificationWorker, MemoryWorker, IntegrationWorker
    └── SyncWorker
External Integrations (src/integrations/providers/)
    ├── HubSpot    — OAuth + contact/deal sync → Atlas Lead records
    ├── QuickBooks — OAuth + P&L pull, invoice push
    ├── Google     — OAuth + Gmail send
    ├── Slack      — OAuth + channel messages / incoming webhook
    └── Teams      — Graph API / incoming webhook
Database — Neon PostgreSQL (Prisma)
    └── Organizations, AIExecutives, Leads, Proposals, Decisions, Tasks,
        Workflows, Memories, FeedEvents, Integrations, MissionGoals, GoalMilestones
```

---

## Autonomous Workflows

Trigger via `POST /api/v1/collaboration/workflow/:name`

| Workflow | Executives | What it does |
|---|---|---|
| `first_client` | All 10 | Sets 6-week goal, defines ICP, builds outreach, qualifies 10 prospects, drafts proposals, pre-drafts NDA, produces Week 1 briefing |
| `deal_review` | Zephyr + Aurelia + Lexis + Atlas | Finance and Legal review before CEO decision |
| `full_lead_cycle` | Zephyr + Aria + Aurelia | Qualify → MQL score → outreach → proposal → decision |
| `weekly_board_prep` | Iris → all dept heads → Atlas | Intelligence report → dept briefings → board report |
| `incident_response` | Orion + Forge + Atlas | Triage → technical diagnosis → stakeholder notification |
| `expansion_analysis` | Iris + Zephyr + Aurelia + Lexis + Orion + Atlas | Full exec session → strategic decision |
| `churn_intervention` | Lyra + Zephyr + Aria | Health score → account history → re-engagement plan |

---

## Scheduler (autonomous, no trigger needed)

| Time | Executive | Action |
|---|---|---|
| 06:30 UTC Mon | Atlas | Goal progress check + escalate misses |
| 07:00 UTC daily | Atlas | Daily briefing |
| 08:00 UTC daily | Zephyr | Pipeline review |
| 08:30 UTC daily | Aurelia | Financial health check |
| 08:30 UTC Mon | Iris | Weekly intelligence report → board prep workflow |
| 09:00 UTC 1st/month | Iris | Monthly intelligence report |
| 09:30 UTC Mon | Orion | Operational report |
| 10:00 UTC daily | Aurelia | Payment reminder sweep |
| Every 6h | Iris | Anomaly detection |

---

## Integration OAuth Flow

```
GET /api/integrations/:provider/connect   → Returns OAuth authorization URL
↓ User authorizes in browser
GET /api/integrations/:provider/callback  → Code exchange, token stored, initial sync queued
```

Providers: `hubspot`, `quickbooks`, `google`, `slack`, `teams`

---

## Mission Goals

```
POST /api/v1/goals
{
  "title": "First paying client within 6 weeks",
  "weeksToTarget": 6,
  "successCriteria": "First invoice paid"
}
```

Atlas plans weekly milestones, assigns each to the relevant executive, creates tasks in their queue, and tracks progress automatically every Monday. When a deal closes won, the relevant milestone auto-completes.

---

## First Client Campaign (one button)

From the Mission Goals view, click **Launch Full First Client Campaign**. This runs:

1. Atlas sets a 6-week mission goal with weekly milestones
2. Iris + Atlas define your ICP from your company profile
3. Aria builds a 3-email cold outreach sequence
4. Lexis pre-drafts a mutual NDA
5. Outbound engine generates 10 prospects matching your ICP
6. Zephyr qualifies every prospect — high-score leads go to full deal review
7. Aurelia drafts proposals for qualified leads
8. Atlas produces a Week 1 briefing with critical path advice from Iris

Set `RESEND_API_KEY` to send the outreach emails. Without it, drafts are saved to Central Memory.

---

## Running Tests

```bash
npx tsc --noEmit    # Type check (no test runner configured by default)
```

---

## Deployment

```bash
npm run build       # Vite SPA + ESBuild server bundle
npm start           # Runs dist/server.cjs
```

Set `NODE_ENV=production` and configure `DATABASE_URL`, `OPENROUTER_API_KEY`, and optionally `REDIS_URL` in your deployment environment.
