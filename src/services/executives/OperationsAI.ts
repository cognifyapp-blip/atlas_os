/**
 * Atlas OS — Operations AI (Orion)
 *
 * Chief Operating Officer. Optimizes internal processes, manages IT infrastructure,
 * automates workflows, and ensures operational efficiency.
 *
 * Persona: "Orion" — systematic, efficient, the engine of the company.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class OperationsAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Orion (Operations AI)');
  }

  // ─── Process Audit ──────────────────────────────────────────────────────────

  async auditProcess(params: {
    processName: string;
    currentSteps: string[];
    frequency: string;
    timeSpent: string;
    painPoints: string[];
  }) {
    await this.setStatus('ACTIVE', `Auditing process: ${params.processName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      efficiencyScore: number;
      automationPotential: number;
      bottlenecks: string[];
      optimizedProcess: string[];
      automationOpportunities: string[];
      estimatedTimeSavings: string;
      estimatedCostSavings: string;
      implementationPlan: string[];
      priority: string;
    }>(`
You are Orion, Operations AI for ${org?.name ?? 'the company'}.

Audit this business process:
- Process: ${params.processName}
- Current steps: ${params.currentSteps.join(' → ')}
- Frequency: ${params.frequency}
- Time spent: ${params.timeSpent}
- Pain points: ${params.painPoints.join(', ')}

Return JSON:
{
  "efficiencyScore": (0-100, where 100 is fully optimized),
  "automationPotential": (0-100, where 100 is fully automatable),
  "bottlenecks": ["2-4 identified bottlenecks in the process"],
  "optimizedProcess": ["Optimized step-by-step flow"],
  "automationOpportunities": ["Specific automation tools/approaches for each automatable step"],
  "estimatedTimeSavings": "e.g., '4 hours per week' or '60% reduction in time'",
  "estimatedCostSavings": "e.g., '$2,000/month in labor costs'",
  "implementationPlan": ["4-6 steps to implement the optimized process"],
  "priority": "low" | "medium" | "high" | "critical"
}
`);

    await this.rememberText(
      `Process audit: ${params.processName} — Efficiency: ${result.efficiencyScore}/100, Automation potential: ${result.automationPotential}%. ${result.estimatedTimeSavings} time savings.`,
      'insight',
      ['operations', 'process-audit', params.processName.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed(
      'Process Audit Complete',
      `${params.processName}: ${result.efficiencyScore}/100 efficiency, ${result.automationPotential}% automatable. ${result.estimatedTimeSavings} savings identified.`,
      result.efficiencyScore < 50 ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Process audit complete for ${params.processName}.`);

    return result;
  }

  // ─── Create Automation Workflow ─────────────────────────────────────────────

  async createAutomationWorkflow(params: {
    name: string;
    trigger: string;
    steps: Array<{ action: string; tool: string; assignee?: string }>;
    department: string;
  }) {
    await this.setStatus('ACTIVE', `Building automation: ${params.name}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      workflowName: string;
      description: string;
      configurationSteps: string[];
      toolsNeeded: string[];
      estimatedSetupTime: string;
      testingProtocol: string[];
      rollbackPlan: string;
    }>(`
You are Orion, Operations AI for ${org?.name ?? 'the company'}.

Design an automation workflow:
- Name: ${params.name}
- Trigger: ${params.trigger}
- Steps: ${params.steps.map((s) => `${s.action} via ${s.tool}`).join(' → ')}
- Department: ${params.department}

Return JSON:
{
  "workflowName": "${params.name}",
  "description": "Clear description of what this workflow automates",
  "configurationSteps": ["Step-by-step setup instructions"],
  "toolsNeeded": ["Tools/integrations required to build this automation"],
  "estimatedSetupTime": "e.g., '2-3 hours to configure'",
  "testingProtocol": ["How to test the automation before going live"],
  "rollbackPlan": "How to disable/rollback if something goes wrong"
}
`);

    // Create workflow in database
    const workflow = await prisma.workflow.create({
      data: {
        organizationId: this.organizationId,
        name: params.name,
        description: result.description,
        status: 'paused',
        triggerEvent: params.trigger,
        metadata: { department: params.department, toolsNeeded: result.toolsNeeded },
        updatedAt: new Date(),
        steps: {
          create: params.steps.map((step, index) => ({
            name: step.action,
            actionDescription: `Via ${step.tool}`,
            status: 'pending',
            order: index,
            actorExecutiveId: this.executiveId,
            updatedAt: new Date(),
          })),
        },
      },
      include: { steps: true },
    });

    await this.rememberText(
      `Automation created: ${params.name} — ${params.steps.length} steps, ${params.department} department. Tools: ${result.toolsNeeded.join(', ')}`,
      'workflow',
      ['operations', 'automation', params.department.toLowerCase()],
    );

    await this.pushFeed('Automation Workflow Created', `${params.name} — ${params.steps.length} steps, setup time: ${result.estimatedSetupTime}`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Automation "${params.name}" ready.`);

    return { plan: result, workflow };
  }

  // ─── Vendor Analysis ────────────────────────────────────────────────────────

  async analyzeVendor(params: {
    vendorName: string;
    serviceType: string;
    currentCost: number;
    contractEndDate?: string;
    issues: string[];
    alternatives?: string[];
  }) {
    await this.setStatus('ACTIVE', `Analyzing vendor: ${params.vendorName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      vendorScore: number;
      recommendation: string;
      riskAssessment: string;
      negotiationLeverage: string[];
      alternatives: string[];
      costOptimization: string;
      contractRecommendations: string[];
      actionPlan: string[];
    }>(`
You are Orion, Operations AI for ${org?.name ?? 'the company'}.

Analyze vendor relationship:
- Vendor: ${params.vendorName}
- Service: ${params.serviceType}
- Current cost: $${params.currentCost.toLocaleString()}/month
- Contract ends: ${params.contractEndDate ?? 'Unknown'}
- Issues: ${params.issues.join(', ')}
- Known alternatives: ${params.alternatives?.join(', ') ?? 'None provided'}

Return JSON:
{
  "vendorScore": (0-100, where 100 is excellent vendor),
  "recommendation": "renew" | "renegotiate" | "replace",
  "riskAssessment": "Risk of staying with vendor vs. switching",
  "negotiationLeverage": ["3-5 leverage points for contract renewal"],
  "alternatives": ["3-5 alternative vendors to evaluate"],
  "costOptimization": "How to reduce current vendor cost by 10-30%",
  "contractRecommendations": ["Key terms to negotiate in next contract"],
  "actionPlan": ["5-step action plan based on recommendation"]
}
`);

    await this.rememberText(
      `Vendor analysis: ${params.vendorName} (${params.serviceType}) — Score: ${result.vendorScore}/100, Recommendation: ${result.recommendation}`,
      'insight',
      ['operations', 'vendor', params.vendorName.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed(
      `Vendor Analysis: ${result.recommendation.charAt(0).toUpperCase() + result.recommendation.slice(1)}`,
      `${params.vendorName}: ${result.vendorScore}/100 — Recommend to ${result.recommendation}`,
      result.recommendation === 'replace' ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Vendor analysis for ${params.vendorName} complete.`);

    return result;
  }

  // ─── Incident Triage ────────────────────────────────────────────────────────

  async triageIncident(params: {
    title: string;
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedSystems: string[];
    reportedBy?: string;
  }) {
    await this.setStatus('BUSY', `[INCIDENT] ${params.severity.toUpperCase()}: ${params.title}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      classification: string;
      immediateActions: string[];
      rootCauseHypotheses: string[];
      communicationPlan: string;
      escalationRequired: boolean;
      escalationPath: string;
      estimatedResolutionTime: string;
      postMortemItems: string[];
    }>(`
You are Orion, Operations AI for ${org?.name ?? 'the company'}.

Triage this incident:
- Title: ${params.title}
- Severity: ${params.severity.toUpperCase()}
- Description: ${params.description}
- Affected systems: ${params.affectedSystems.join(', ')}
${params.reportedBy ? `- Reported by: ${params.reportedBy}` : ''}

Return JSON:
{
  "classification": "infrastructure" | "security" | "data" | "availability" | "performance" | "process",
  "immediateActions": ["5-7 immediate steps to take right now (first 15 minutes)"],
  "rootCauseHypotheses": ["3-5 likely root causes to investigate"],
  "communicationPlan": "Who to notify, what to say, when",
  "escalationRequired": ${params.severity === 'critical' || params.severity === 'high'},
  "escalationPath": "Who to escalate to and when",
  "estimatedResolutionTime": "Estimated time to resolve",
  "postMortemItems": ["3-5 items to review in post-mortem to prevent recurrence"]
}
`);

    await this.createTask({
      title: `[${params.severity.toUpperCase()} INCIDENT] ${params.title}`,
      description: params.description,
      priority: params.severity === 'critical' ? 'urgent' : params.severity === 'high' ? 'high' : 'medium',
      assignedToExecutiveId: this.executiveId,
      dueDate: new Date(Date.now() + (params.severity === 'critical' ? 1 : 4) * 3600 * 1000),
      metadata: { incident: true, severity: params.severity, affectedSystems: params.affectedSystems },
    });

    await this.pushFeed(
      `Incident Triaged: ${params.severity.toUpperCase()}`,
      `${params.title} — ${result.immediateActions.length} immediate actions. ETA: ${result.estimatedResolutionTime}`,
      params.severity === 'critical' ? 'critical' : params.severity === 'high' ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus(params.severity === 'critical' ? 'BUSY' : 'ACTIVE', `Managing incident: ${params.title}`);

    return result;
  }

  // ─── Operational Report ─────────────────────────────────────────────────────

  async generateOperationalReport() {
    await this.setStatus('ACTIVE', 'Generating operational report');

    const org = await this.getOrgContext();

    const [workflowCount, activeWorkflows, tasks, completedTasks] = await Promise.all([
      prisma.workflow.count({ where: { organizationId: this.organizationId } }),
      prisma.workflow.count({ where: { organizationId: this.organizationId, status: 'active' } }),
      prisma.task.count({ where: { organizationId: this.organizationId } }),
      prisma.task.count({ where: { organizationId: this.organizationId, status: 'completed' } }),
    ]);

    const report = await this.generateJSON<{
      summary: string;
      operationalHealth: number;
      highlights: string[];
      issues: string[];
      automationMetrics: string;
      recommendations: string[];
    }>(`
You are Orion, Operations AI for ${org?.name ?? 'the company'}.

Generate an operational status report:
- Total workflows: ${workflowCount}
- Active workflows: ${activeWorkflows}
- Total tasks: ${tasks}
- Completed tasks: ${completedTasks}
- Task completion rate: ${tasks > 0 ? ((completedTasks / tasks) * 100).toFixed(1) : 0}%

Return JSON:
{
  "summary": "2-paragraph operational summary",
  "operationalHealth": (0-100),
  "highlights": ["3-5 operational wins this period"],
  "issues": ["2-3 operational issues to address"],
  "automationMetrics": "Summary of automation coverage and impact",
  "recommendations": ["5 operational improvements to implement"]
}
`);

    await this.pushFeed('Operational Report Generated', `Health: ${report.operationalHealth}/100. ${activeWorkflows} active workflows, ${completedTasks}/${tasks} tasks complete.`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Operational report generated.');

    return { report, metrics: { workflowCount, activeWorkflows, tasks, completedTasks } };
  }
}
