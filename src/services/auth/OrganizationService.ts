/**
 * Atlas OS — OrganizationService
 *
 * All organization lifecycle operations live here.
 *
 * Responsibilities:
 *  - Onboarding: save org profile (name, industry, goals, etc.)
 *  - Auto-provisioning: departments + AI Executive Team on org creation
 *  - Department CRUD
 *  - AI Executive management
 *  - Member directory
 *
 * Callers (routes, workers, AI agents) never write to the
 * `organizations`, `departments`, or `ai_executives` tables directly.
 *
 * Transactions are used whenever multiple records are created together
 * to guarantee atomicity. Duplicate prevention uses upsert / createMany
 * with skipDuplicates where supported.
 */

import { prisma } from '../../lib/prisma.js';
import { AuthContext, AtlasOrganization, AuthError, ProvisioningResult } from './types.js';
import { PermissionService } from './PermissionService.js';
import { AuthService } from './AuthService.js';

// ─── Default provisioning data ────────────────────────────────────────────────

/**
 * Every new Atlas organization gets these departments automatically.
 */
const DEFAULT_DEPARTMENTS = [
  {
    name: 'Executive Office',
    description: 'C-suite coordination, strategic oversight, and cross-functional alignment.',
  },
  {
    name: 'Finance',
    description: 'Financial planning, accounting, cash flow management, and reporting.',
  },
  {
    name: 'Sales',
    description: 'Pipeline management, lead qualification, deal structuring, and account growth.',
  },
  {
    name: 'Marketing',
    description: 'Brand strategy, content, digital campaigns, and customer acquisition.',
  },
  {
    name: 'Operations',
    description: 'Process optimization, supply chain, vendor management, and logistics.',
  },
  {
    name: 'Human Resources',
    description: 'Talent acquisition, employee experience, compliance, and culture.',
  },
  {
    name: 'Legal',
    description: 'Contracts, compliance, intellectual property, and regulatory affairs.',
  },
  {
    name: 'Customer Success',
    description: 'Onboarding, retention, support, and customer relationship health.',
  },
  {
    name: 'Technology',
    description: 'Engineering, infrastructure, security, and technical architecture.',
  },
  {
    name: 'Intelligence',
    description: 'Business intelligence, data analytics, market research, and AI strategy.',
  },
] as const;

/**
 * The Atlas AI Executive Team — provisioned automatically for every new org.
 * departmentName is resolved to a real department ID during provisioning.
 */
const DEFAULT_AI_EXECUTIVES = [
  {
    name: 'CEO Assistant (Atlas)',
    role: 'Strategic Chief of Staff',
    departmentName: 'Executive Office',
    bio: 'Atlas orchestrates all department heads, synthesizes cross-functional business analysis, and presents high-level operational signals to human leadership. The connective tissue of the entire executive team.',
    goals: [
      'Synthesize multi-department data into clear executive briefings',
      'Present actionable recommendations and strategic options',
      'Maintain executive alignment and resolve cross-functional conflicts',
    ],
    tools: ['Generate Day Zero Briefing', 'Run Strategy Session', 'Generate Board Report', 'Process Commands', 'Draft Daily Briefing'],
  },
  {
    name: 'Finance AI (Aurelia)',
    role: 'Chief Financial Officer',
    departmentName: 'Finance',
    bio: 'Aurelia specializes in financial models, cash flow management, automated billing, expense analysis, and bottom-line margin optimization. Precise, measured, always protecting the runway.',
    goals: [
      'Protect company runway and cash position',
      'Automate invoice creation and payment recovery',
      'Forecast capital allocation efficiency and flag risks',
    ],
    tools: ['Draft Proposal', 'Generate Invoice', 'Forecast Cash Flow', 'Financial Health Report', 'Budget Analysis', 'Payment Reminders'],
  },
  {
    name: 'Sales AI (Zephyr)',
    role: 'Vice President of Sales',
    departmentName: 'Sales',
    bio: 'Zephyr is an autonomous pipeline machine — fast, decisive, always closing. Qualifies inbound leads, scores accounts, drafts outreach, creates proposals, and structures high-probability deals.',
    goals: [
      'Qualify 100% of incoming leads within 1 hour',
      'Optimize deal-stage conversion rates across the funnel',
      'Provide actionable account intelligence and close deals',
    ],
    tools: ['Qualify Lead', 'Review Pipeline', 'Draft Outreach Email', 'Create Sales Decision', 'Close Lead', 'Pipeline Report'],
  },
  {
    name: 'Marketing AI (Aria)',
    role: 'Chief Marketing Officer',
    departmentName: 'Marketing',
    bio: 'Aria is creative, data-driven, and the guardian of the brand. Plans campaigns, creates content, scores leads, and delivers qualified prospects directly to Zephyr.',
    goals: [
      'Improve customer acquisition cost (CAC) by 15% quarterly',
      'Maintain a unified brand voice across all channels',
      'Generate qualified MQLs and hand them to Sales in real time',
    ],
    tools: ['Plan Campaign', 'Generate Content', 'Score Marketing Lead', 'Analyze Campaign Performance', 'SEO Keyword Research', 'Create Email Campaign'],
  },
  {
    name: 'HR AI (Sage)',
    role: 'Chief People Officer',
    departmentName: 'Human Resources',
    bio: 'Sage is wise, fair, and people-first. Manages the full talent lifecycle from job posting to performance reviews, protecting both the employee experience and company culture.',
    goals: [
      'Reduce time-to-hire by 30% through intelligent screening',
      'Maintain 90%+ employee satisfaction and retention',
      'Ensure HR compliance and document all people decisions',
    ],
    tools: ['Create Job Description', 'Screen Candidate', 'Create Onboarding Checklist', 'Conduct Performance Review', 'Analyze Compensation'],
  },
  {
    name: 'Operations AI (Orion)',
    role: 'Chief Operating Officer',
    departmentName: 'Operations',
    bio: 'Orion is systematic, efficient, the engine of the company. Audits processes, creates automations, manages vendors, and triages incidents. If the company is a machine, Orion keeps it running.',
    goals: [
      'Reduce operational overhead by 20% through process automation',
      'Optimize vendor relationships and contract terms',
      'Achieve and maintain 99.9% operational uptime',
    ],
    tools: ['Audit Process', 'Create Automation Workflow', 'Analyze Vendor', 'Triage Incident', 'Generate Operational Report'],
  },
  {
    name: 'Legal AI (Lexis)',
    role: 'General Counsel',
    departmentName: 'Legal',
    bio: "Lexis is methodical, risk-averse, and the company's legal guardian. Reviews and drafts contracts, monitors compliance, flags legal exposure, and ensures the company is always protected.",
    goals: [
      'Review all contracts within 24 hours of submission',
      'Maintain 100% regulatory compliance across all jurisdictions',
      'Reduce legal exposure and protect intellectual property',
    ],
    tools: ['Draft Contract', 'Review Contract', 'Compliance Check', 'Risk Assessment', 'Draft NDA'],
  },
  {
    name: 'Customer Success AI (Lyra)',
    role: 'Chief Customer Officer',
    departmentName: 'Customer Success',
    bio: 'Lyra is empathetic, proactive, and customer-obsessed. Monitors health scores, identifies churn before it happens, uncovers expansion opportunities, and ensures every customer achieves their goals.',
    goals: [
      'Achieve 95%+ customer retention rate through proactive health monitoring',
      'Reduce time-to-value for new customers with automated onboarding',
      'Identify and action expansion opportunities within the existing customer base',
    ],
    tools: ['Calculate Customer Health', 'Create Onboarding Plan', 'Identify Expansion Opportunities', 'Create Churn Prevention Plan', 'Generate QBR Agenda', 'Analyze NPS'],
  },
  {
    name: 'Developer AI (Forge)',
    role: 'Chief Technology Officer',
    departmentName: 'Technology',
    bio: 'Forge is pragmatic, quality-obsessed, and builds for scale. Generates code, reviews PRs, triages bugs, manages infrastructure, and ensures the product is always reliable and secure.',
    goals: [
      'Maintain code quality standards and reduce technical debt',
      'Achieve 99.9% system uptime and reduce MTTR to under 30 minutes',
      'Identify and remediate security vulnerabilities proactively',
    ],
    tools: ['Generate Code', 'Review Code', 'Triage Bug', 'Infrastructure Analysis', 'Security Audit', 'Architecture Review'],
  },
  {
    name: 'Intelligence AI (Iris)',
    role: 'Chief Data Officer',
    departmentName: 'Intelligence',
    bio: 'Iris sees patterns no one else sees. Aggregates data from every department, identifies trends, detects anomalies, builds forecasts, and delivers the insights that drive every strategic decision.',
    goals: [
      'Deliver actionable intelligence reports to every executive daily',
      'Surface anomalies and trends before they become problems',
      'Build forecasting models that improve accuracy each quarter',
    ],
    tools: ['Generate Intelligence Report', 'Analyze Trends', 'Detect Anomalies', 'Build Forecast', 'Data Quality Audit', 'Competitive Analysis'],
  },
] as const;

// ─── Input shapes ──────────────────────────────────────────────────────────────

export interface OnboardingInput {
  name: string;
  industry?: string;
  size?: string;
  goals?: string;
  challenges?: string;
  softwareStack?: string;
}

export interface DepartmentInput {
  name: string;
  description?: string;
}

export interface AIExecutiveInput {
  name: string;
  role: string;
  bio?: string;
  avatarUrl?: string;
  goals?: string[];
  tools?: string[];
  departmentId?: string;
}

// ─── OrganizationService ──────────────────────────────────────────────────────

export class OrganizationService {
  /**
   * Complete onboarding for an organization.
   * Updates the profile fields and flips `initialized` to true.
   * Requires ADMIN or above.
   */
  static async completeOnboarding(
    ctx: AuthContext,
    input: OnboardingInput,
  ): Promise<AtlasOrganization> {
    PermissionService.assert(ctx, 'canManageOrganization');

    if (!input.name?.trim()) {
      throw new Error('Organization name is required.');
    }

    const row = await prisma.organization.update({
      where: { id: ctx.organization.id },
      data: {
        name: input.name.trim(),
        industry: input.industry?.trim() ?? null,
        size: input.size?.trim() ?? null,
        goals: input.goals?.trim() ?? null,
        challenges: input.challenges?.trim() ?? null,
        softwareStack: input.softwareStack?.trim() ?? null,
        initialized: true,
      },
    });

    return AuthService.toAtlasOrganization(row);
  }

  /**
   * Return the full org profile for the caller's organization.
   * Any authenticated member can call this.
   */
  static async getProfile(ctx: AuthContext): Promise<AtlasOrganization> {
    const row = await prisma.organization.findUnique({
      where: { id: ctx.organization.id },
    });
    if (!row) {
      throw new AuthError(
        `Organization "${ctx.organization.id}" not found.`,
        'ORG_NOT_FOUND',
      );
    }
    return AuthService.toAtlasOrganization(row);
  }

  // ─── Auto-provisioning ────────────────────────────────────────────────────

  /**
   * Provision a brand-new Atlas organization with:
   *   1. Default department set
   *   2. Atlas AI Executive Team (one per department)
   *
   * This is idempotent — calling it on an already-initialized org is a no-op.
   * Uses a Prisma transaction to guarantee atomicity.
   *
   * Called automatically from the webhook handler when a new org is detected.
   */
  static async provisionNewOrganization(
    atlasOrgId: string,
  ): Promise<ProvisioningResult> {
    // Check if already initialized to prevent duplicate provisioning
    const existing = await prisma.organization.findUnique({
      where: { id: atlasOrgId },
      include: {
        departments: { select: { id: true, name: true } },
        aiExecutives: { select: { id: true, name: true, role: true } },
      },
    });

    if (!existing) {
      throw new AuthError(
        `Organization "${atlasOrgId}" not found in Atlas.`,
        'PROVISIONING_FAILED',
      );
    }

    const isNewOrganization = existing.departments.length === 0;

    if (!isNewOrganization) {
      console.log(
        `[OrganizationService] Organization "${existing.name}" already provisioned — skipping.`,
      );
      return {
        organization: AuthService.toAtlasOrganization(existing),
        departments: existing.departments,
        aiExecutives: existing.aiExecutives,
        isNewOrganization: false,
      };
    }

    console.log(`[OrganizationService] Provisioning new organization: "${existing.name}"`);

    // Run everything in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create all departments — createMany with skipDuplicates is safe on retry
      await tx.department.createMany({
        data: DEFAULT_DEPARTMENTS.map((dept) => ({
          name: dept.name,
          description: dept.description,
          organizationId: atlasOrgId,
        })),
        skipDuplicates: true,
      });

      // Fetch created departments for ID lookup by name
      const departments = await tx.department.findMany({
        where: { organizationId: atlasOrgId },
        select: { id: true, name: true },
      });

      const deptMap = new Map(departments.map((d) => [d.name, d.id]));

      // 2. Create all AI executives — link each to their home department
      await tx.aIExecutive.createMany({
        data: DEFAULT_AI_EXECUTIVES.map((exec) => ({
          name: exec.name,
          role: exec.role,
          bio: exec.bio,
          goals: [...exec.goals],
          tools: [...exec.tools],
          organizationId: atlasOrgId,
          departmentId: deptMap.get(exec.departmentName) ?? null,
          status: 'IDLE',
        })),
        skipDuplicates: true,
      });

      const aiExecutives = await tx.aIExecutive.findMany({
        where: { organizationId: atlasOrgId },
        select: { id: true, name: true, role: true },
      });

      return { departments, aiExecutives };
    });

    console.log(
      `[OrganizationService] Provisioned ${result.departments.length} departments and ` +
        `${result.aiExecutives.length} AI executives for "${existing.name}".`,
    );

    return {
      organization: AuthService.toAtlasOrganization(existing),
      departments: result.departments,
      aiExecutives: result.aiExecutives,
      isNewOrganization: true,
    };
  }

  // ─── Departments ──────────────────────────────────────────────────────────

  /**
   * Create a department within the caller's organization.
   * Requires MANAGER or above.
   */
  static async createDepartment(ctx: AuthContext, input: DepartmentInput) {
    PermissionService.assert(ctx, 'canManageDepartments');

    return prisma.department.create({
      data: {
        name: input.name.trim(),
        description: input.description?.trim() ?? null,
        organizationId: ctx.organization.id,
      },
    });
  }

  /**
   * List all departments in the caller's organization.
   */
  static async listDepartments(ctx: AuthContext) {
    return prisma.department.findMany({
      where: { organizationId: ctx.organization.id },
      orderBy: { name: 'asc' },
    });
  }

  // ─── AI Executives ────────────────────────────────────────────────────────

  /**
   * Register an AI executive in the caller's organization.
   * Requires ADMIN or above.
   */
  static async createAIExecutive(ctx: AuthContext, input: AIExecutiveInput) {
    PermissionService.assert(ctx, 'canManageAIExecutives');

    return prisma.aIExecutive.create({
      data: {
        name: input.name.trim(),
        role: input.role.trim(),
        bio: input.bio?.trim() ?? null,
        avatarUrl: input.avatarUrl ?? null,
        goals: input.goals ?? [],
        tools: input.tools ?? [],
        organizationId: ctx.organization.id,
        departmentId: input.departmentId ?? null,
      },
    });
  }

  /**
   * List all AI executives in the caller's organization.
   * Includes the department name if assigned.
   */
  static async listAIExecutives(ctx: AuthContext) {
    return prisma.aIExecutive.findMany({
      where: { organizationId: ctx.organization.id },
      include: { department: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Update runtime stats for an AI executive.
   * Scoped to the caller's org to prevent cross-tenant writes.
   */
  static async updateAIExecutiveStats(
    ctx: AuthContext,
    executiveId: string,
    stats: {
      status?: 'IDLE' | 'ACTIVE' | 'BUSY' | 'OFFLINE';
      lastAction?: string;
      tasksCompleted?: number;
      decisionsMade?: number;
      valueGenerated?: number;
    },
  ) {
    const existing = await prisma.aIExecutive.findFirst({
      where: { id: executiveId, organizationId: ctx.organization.id },
    });
    if (!existing) {
      throw new Error(
        `AI Executive "${executiveId}" not found in org "${ctx.organization.id}".`,
      );
    }

    return prisma.aIExecutive.update({
      where: { id: executiveId },
      data: {
        ...(stats.status !== undefined && { status: stats.status }),
        ...(stats.lastAction !== undefined && { lastAction: stats.lastAction }),
        ...(stats.tasksCompleted !== undefined && { tasksCompleted: stats.tasksCompleted }),
        ...(stats.decisionsMade !== undefined && { decisionsMade: stats.decisionsMade }),
        ...(stats.valueGenerated !== undefined && { valueGenerated: stats.valueGenerated }),
      },
    });
  }

  // ─── Members ──────────────────────────────────────────────────────────────

  /**
   * List all members of the caller's organization with their user profiles.
   */
  static async listMembers(ctx: AuthContext) {
    return prisma.membership.findMany({
      where: { organizationId: ctx.organization.id },
      include: {
        user: {
          select: { id: true, email: true, name: true, avatarUrl: true },
        },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }
}
