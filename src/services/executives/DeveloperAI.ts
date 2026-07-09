/**
 * Atlas OS — Developer AI (Forge)
 *
 * Chief Technology Officer. Generates code, reviews PRs, triages bugs,
 * manages infrastructure, and ensures the product is reliable and secure.
 *
 * Persona: "Forge" — pragmatic, quality-obsessed, builds for scale.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class DeveloperAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Forge (Developer AI)');
  }

  // ─── Generate Code ───────────────────────────────────────────────────────────

  async generateCode(params: {
    description: string;
    language: string;
    framework?: string;
    requirements: string[];
    existingContext?: string;
  }) {
    await this.setStatus('ACTIVE', `Generating code: ${params.description}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      code: string;
      explanation: string;
      fileStructure: string[];
      dependencies: string[];
      tests: string;
      securityConsiderations: string[];
      performanceNotes: string[];
      nextSteps: string[];
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Generate production-quality code:
- Task: ${params.description}
- Language: ${params.language}
- Framework: ${params.framework ?? 'None specified'}
- Requirements:
${params.requirements.map((r) => `  - ${r}`).join('\n')}
${params.existingContext ? `\nExisting code context:\n${params.existingContext.substring(0, 2000)}` : ''}

Write clean, maintainable, production-ready code. Follow best practices for ${params.language}.
Include comments. Handle errors properly. Consider edge cases.

Return JSON:
{
  "code": "Complete, runnable code (properly formatted, with comments)",
  "explanation": "2-3 paragraph technical explanation of the implementation approach",
  "fileStructure": ["Files created/modified and their purposes"],
  "dependencies": ["npm/pip/gem packages or imports required"],
  "tests": "Unit test code for the implementation",
  "securityConsiderations": ["Security aspects addressed in this code"],
  "performanceNotes": ["Performance characteristics and potential optimizations"],
  "nextSteps": ["What to implement next to extend this code"]
}
`);

    await this.rememberText(
      `Code generated: ${params.description} (${params.language}${params.framework ? '/' + params.framework : ''}). ${result.dependencies.length} dependencies.`,
      'document',
      ['developer', 'code-generation', params.language.toLowerCase(), params.framework?.toLowerCase() ?? ''].filter(Boolean),
    );

    await this.pushFeed('Code Generated', `${params.description} (${params.language}) — ${result.fileStructure.length} files`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Code generation complete: ${params.description}`);

    return result;
  }

  // ─── Code Review ─────────────────────────────────────────────────────────────

  async reviewCode(params: {
    code: string;
    language: string;
    context?: string;
    focusAreas?: Array<'security' | 'performance' | 'maintainability' | 'bugs' | 'all'>;
  }) {
    await this.setStatus('ACTIVE', `Reviewing code (${params.language})`);

    const org = await this.getOrgContext();
    const focus = params.focusAreas ?? ['all'];

    const result = await this.generateJSON<{
      overallScore: number;
      verdict: 'approve' | 'request_changes' | 'reject';
      summary: string;
      issues: Array<{
        type: 'bug' | 'security' | 'performance' | 'style' | 'logic';
        severity: 'low' | 'medium' | 'high' | 'critical';
        line?: number;
        description: string;
        suggestion: string;
        codeExample?: string;
      }>;
      strengths: string[];
      securityFindings: string[];
      performanceFindings: string[];
      approvedWithNotes: string[];
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Review this ${params.language} code:
${params.context ? `Context: ${params.context}\n` : ''}
Focus areas: ${focus.join(', ')}

Code to review:
\`\`\`${params.language.toLowerCase()}
${params.code.substring(0, 4000)}
\`\`\`

Provide a thorough code review.

Return JSON:
{
  "overallScore": (0-100, where 100 is perfect code),
  "verdict": "approve" | "request_changes" | "reject",
  "summary": "2-3 paragraph code review summary",
  "issues": [
    {
      "type": "bug" | "security" | "performance" | "style" | "logic",
      "severity": "low" | "medium" | "high" | "critical",
      "line": (optional line number),
      "description": "What the issue is",
      "suggestion": "How to fix it",
      "codeExample": "Corrected code snippet (optional)"
    }
  ],
  "strengths": ["Things the code does well"],
  "securityFindings": ["Security observations"],
  "performanceFindings": ["Performance observations"],
  "approvedWithNotes": ["Minor notes for future improvement (non-blocking)"]
}
`);

    await this.rememberText(
      `Code review (${params.language}): Score ${result.overallScore}/100, verdict: ${result.verdict}. ${result.issues.filter((i) => i.severity === 'critical' || i.severity === 'high').length} critical/high issues.`,
      'insight',
      ['developer', 'code-review', params.language.toLowerCase()],
    );

    await this.pushFeed(
      `Code Review: ${result.verdict.replace('_', ' ')}`,
      `${params.language} code: ${result.overallScore}/100, ${result.issues.length} issues (${result.issues.filter((i) => i.severity === 'critical').length} critical)`,
      result.verdict === 'approve' ? 'success' : result.verdict === 'request_changes' ? 'warning' : 'critical',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Code review complete.');

    return result;
  }

  // ─── Triage Bug ──────────────────────────────────────────────────────────────

  async triageBug(params: {
    title: string;
    description: string;
    errorMessage?: string;
    stackTrace?: string;
    environment: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
  }) {
    await this.setStatus('ACTIVE', `Triaging bug: ${params.title}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      classification: string;
      rootCause: string;
      reproducibility: string;
      fixComplexity: 'trivial' | 'minor' | 'moderate' | 'major' | 'epic';
      estimatedFixTime: string;
      immediateWorkaround: string | null;
      investigationSteps: string[];
      fixApproach: string;
      preventionMeasures: string[];
      affectedComponents: string[];
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Triage this bug:
- Title: ${params.title}
- Severity: ${params.severity.toUpperCase()}
- Environment: ${params.environment}
- Description: ${params.description}
${params.errorMessage ? `- Error: ${params.errorMessage}` : ''}
${params.stackTrace ? `- Stack trace:\n${params.stackTrace.substring(0, 2000)}` : ''}

Return JSON:
{
  "classification": "ui_bug" | "logic_error" | "data_corruption" | "performance" | "security" | "integration" | "config",
  "rootCause": "Most likely root cause based on the evidence",
  "reproducibility": "Always" | "Intermittent" | "Rare" | "Unable to determine",
  "fixComplexity": "trivial" | "minor" | "moderate" | "major" | "epic",
  "estimatedFixTime": "e.g., '2 hours', '1 day', '1 week'",
  "immediateWorkaround": "Temporary workaround if available, or null",
  "investigationSteps": ["5-7 steps to investigate and confirm root cause"],
  "fixApproach": "Technical approach to fix this bug",
  "preventionMeasures": ["How to prevent this class of bug in future"],
  "affectedComponents": ["System components affected by this bug"]
}
`);

    // Create a task for critical/high bugs
    if (params.severity === 'critical' || params.severity === 'high') {
      await this.createTask({
        title: `[${params.severity.toUpperCase()} BUG] ${params.title}`,
        description: `Root cause: ${result.rootCause}. Fix: ${result.fixApproach}`,
        priority: params.severity === 'critical' ? 'urgent' : 'high',
        assignedToExecutiveId: this.executiveId,
        dueDate: new Date(Date.now() + (params.severity === 'critical' ? 4 : 24) * 3600 * 1000),
        metadata: { bug: true, severity: params.severity, fixComplexity: result.fixComplexity },
      });
    }

    await this.rememberText(
      `Bug triaged: "${params.title}" — ${params.severity} severity, ${result.fixComplexity} fix, ${result.estimatedFixTime} ETA. Root cause: ${result.rootCause}`,
      'insight',
      ['developer', 'bug-triage', params.severity, result.classification],
    );

    await this.pushFeed(
      `Bug Triaged: ${params.severity.toUpperCase()}`,
      `${params.title} — ${result.fixComplexity} fix, ETA: ${result.estimatedFixTime}. ${result.immediateWorkaround ? 'Workaround available.' : 'No workaround.'}`,
      params.severity === 'critical' ? 'critical' : params.severity === 'high' ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Bug triaged: ${params.title}`);

    return result;
  }

  // ─── Architecture Review ─────────────────────────────────────────────────────

  async reviewArchitecture(params: {
    description: string;
    currentStack: string[];
    proposedChanges?: string;
    scale?: string;
    constraints?: string[];
  }) {
    await this.setStatus('ACTIVE', 'Conducting architecture review');

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      score: number;
      summary: string;
      strengths: string[];
      concerns: Array<{
        area: string;
        concern: string;
        severity: 'low' | 'medium' | 'high';
        recommendation: string;
      }>;
      scalabilityAssessment: string;
      securityAssessment: string;
      recommendations: string[];
      roadmap: string[];
      estimatedTechDebt: string;
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Review this system architecture:
- System: ${params.description}
- Current stack: ${params.currentStack.join(', ')}
- Proposed changes: ${params.proposedChanges ?? 'None'}
- Expected scale: ${params.scale ?? 'Not specified'}
- Constraints: ${params.constraints?.join(', ') ?? 'None'}

Provide a thorough architecture review.

Return JSON:
{
  "score": (0-100, where 100 is excellent architecture),
  "summary": "2-3 paragraph architecture assessment",
  "strengths": ["4-6 architectural strengths"],
  "concerns": [
    {
      "area": "Scalability" | "Security" | "Reliability" | "Maintainability" | "Cost" | "Performance",
      "concern": "Specific architectural concern",
      "severity": "low" | "medium" | "high",
      "recommendation": "How to address this concern"
    }
  ],
  "scalabilityAssessment": "Can this scale to 10x/100x? What breaks first?",
  "securityAssessment": "Security posture and vulnerabilities",
  "recommendations": ["5-7 prioritized architectural improvements"],
  "roadmap": ["Phased migration/improvement roadmap"],
  "estimatedTechDebt": "Current tech debt estimate in engineering weeks"
}
`);

    await this.rememberText(
      `Architecture review: ${params.description} — Score: ${result.score}/100. ${result.concerns.length} concerns. Tech debt: ${result.estimatedTechDebt}.`,
      'document',
      ['developer', 'architecture', 'review'],
    );

    await this.pushFeed('Architecture Review Complete', `Score: ${result.score}/100. ${result.concerns.filter((c) => c.severity === 'high').length} high-severity concerns. Tech debt: ${result.estimatedTechDebt}`, result.score >= 70 ? 'info' : 'warning');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Architecture review complete.');

    return result;
  }

  // ─── Security Audit ──────────────────────────────────────────────────────────

  async conductSecurityAudit(params: {
    scope: string;
    codeOrConfig?: string;
    knownVulnerabilities?: string[];
  }) {
    await this.setStatus('ACTIVE', `Security audit: ${params.scope}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      riskLevel: 'low' | 'medium' | 'high' | 'critical';
      score: number;
      vulnerabilities: Array<{
        name: string;
        category: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        cvssScore?: number;
        description: string;
        remediation: string;
        effort: 'quick' | 'moderate' | 'significant';
      }>;
      complianceIssues: string[];
      bestPractices: string[];
      prioritizedRemediation: string[];
      securityScore: number;
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Conduct a security audit:
- Scope: ${params.scope}
${params.codeOrConfig ? `- Code/Config:\n${params.codeOrConfig.substring(0, 3000)}` : ''}
${params.knownVulnerabilities ? `- Known issues: ${params.knownVulnerabilities.join(', ')}` : ''}

Company industry: ${org?.industry}

Return JSON:
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "score": (0-100 security score, where 100 is fully secure),
  "vulnerabilities": [
    {
      "name": "Vulnerability name",
      "category": "OWASP category (e.g., 'A01:2021 Broken Access Control')",
      "severity": "low" | "medium" | "high" | "critical",
      "cvssScore": (CVSS base score 0-10, optional),
      "description": "What the vulnerability is and how it can be exploited",
      "remediation": "How to fix it",
      "effort": "quick" | "moderate" | "significant"
    }
  ],
  "complianceIssues": ["Security compliance gaps"],
  "bestPractices": ["Security best practices not yet implemented"],
  "prioritizedRemediation": ["Ordered list of fixes — most critical first"],
  "securityScore": (final security posture score 0-100)
}
`);

    // Create decision if critical vulnerabilities found
    const criticalVulns = result.vulnerabilities.filter((v) => v.severity === 'critical');
    if (criticalVulns.length > 0) {
      await this.createDecision({
        title: `SECURITY: ${criticalVulns.length} Critical Vulnerabilities in ${params.scope}`,
        summary: `Forge has identified ${criticalVulns.length} critical security vulnerabilities. Immediate remediation required.`,
        reasoning: criticalVulns.map((v) => `${v.name}: ${v.description}`).join(' | '),
        impact: `Potential security breach risk. Affects: ${params.scope}`,
        confidence: 95,
        type: 'operational',
        expiresInHours: 24,
      });
    }

    await this.rememberText(
      `Security audit: ${params.scope} — Score: ${result.score}/100, ${result.vulnerabilities.length} vulnerabilities (${criticalVulns.length} critical).`,
      'insight',
      ['developer', 'security-audit', result.riskLevel],
    );

    await this.pushFeed(
      `Security Audit: ${result.riskLevel.toUpperCase()} Risk`,
      `${params.scope}: ${result.score}/100 — ${result.vulnerabilities.length} vulnerabilities, ${criticalVulns.length} critical`,
      result.riskLevel === 'critical' ? 'critical' : result.riskLevel === 'high' ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Security audit complete.');

    return result;
  }

  // ─── Sprint Planning ─────────────────────────────────────────────────────────

  async planSprint(params: {
    teamSize: number;
    sprintDays: number;
    backlog: Array<{ title: string; description?: string; estimate?: string }>;
    velocity?: number;
  }) {
    await this.setStatus('ACTIVE', 'Planning sprint');

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      sprintGoal: string;
      selectedItems: Array<{
        title: string;
        storyPoints: number;
        priority: 'must_have' | 'should_have' | 'nice_to_have';
        assignee?: string;
        notes: string;
      }>;
      totalPoints: number;
      capacity: number;
      risks: string[];
      definition_of_done: string[];
      retrospectiveItems: string[];
    }>(`
You are Forge, Developer AI for ${org?.name ?? 'the company'}.

Plan a development sprint:
- Team size: ${params.teamSize} engineers
- Sprint duration: ${params.sprintDays} days
- Team velocity: ${params.velocity ?? `${params.teamSize * 8} story points (estimated)`}
- Backlog items:
${params.backlog.map((item, i) => `  ${i + 1}. ${item.title}${item.description ? ': ' + item.description : ''}${item.estimate ? ' (~' + item.estimate + ')' : ''}`).join('\n')}

Return JSON:
{
  "sprintGoal": "Clear, concise sprint goal",
  "selectedItems": [
    {
      "title": "Item title",
      "storyPoints": (Fibonacci: 1, 2, 3, 5, 8, 13),
      "priority": "must_have" | "should_have" | "nice_to_have",
      "assignee": "Suggested assignee type (optional)",
      "notes": "Implementation notes or dependencies"
    }
  ],
  "totalPoints": (sum of selected story points),
  "capacity": (team capacity in story points),
  "risks": ["3-5 sprint risks to watch"],
  "definition_of_done": ["Criteria for items to be considered done"],
  "retrospectiveItems": ["Suggested retrospective discussion points"]
}
`);

    await this.rememberText(
      `Sprint planned: ${result.sprintGoal} — ${result.selectedItems.length} items, ${result.totalPoints}/${result.capacity} points, ${params.sprintDays} days`,
      'workflow',
      ['developer', 'sprint-planning'],
    );

    await this.pushFeed('Sprint Planned', `Goal: "${result.sprintGoal}" — ${result.selectedItems.length} items, ${result.totalPoints} points`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Sprint planning complete.');

    return result;
  }
}
