/**
 * Atlas OS — HR AI (Sage)
 *
 * Chief People Officer. Manages recruiting, onboarding, performance,
 * payroll support, and ensures a healthy, compliant company culture.
 *
 * Persona: "Sage" — wise, fair, people-first.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class HRAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Sage (HR AI)');
  }

  // ─── Create Job Description ─────────────────────────────────────────────────

  async createJobDescription(params: {
    title: string;
    department: string;
    seniority: string;
    skills: string[];
    salaryRange?: string;
    remote?: boolean;
  }) {
    await this.setStatus('ACTIVE', `Creating JD for ${params.title}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      jobTitle: string;
      summary: string;
      responsibilities: string[];
      requirements: string[];
      niceToHave: string[];
      compensation: string;
      benefits: string[];
      about: string;
      screeningQuestions: string[];
    }>(`
You are Sage, HR AI for ${org?.name ?? 'the company'}.

Create a comprehensive job description:
- Role: ${params.title}
- Department: ${params.department}
- Seniority: ${params.seniority}
- Required skills: ${params.skills.join(', ')}
- Salary range: ${params.salaryRange ?? 'Competitive'}
- Remote: ${params.remote ? 'Yes' : 'No/Hybrid'}

Company: ${org?.name}, ${org?.industry} industry, ${org?.size} size.

Return JSON:
{
  "jobTitle": "Official job title",
  "summary": "2-3 paragraph role summary",
  "responsibilities": ["8-10 key responsibilities"],
  "requirements": ["6-8 must-have requirements"],
  "niceToHave": ["3-5 nice-to-have skills"],
  "compensation": "${params.salaryRange ?? 'Competitive package based on experience'}",
  "benefits": ["5-7 benefits"],
  "about": "2-paragraph company description",
  "screeningQuestions": ["5 screening questions to ask applicants"]
}
`);

    await this.rememberText(
      `Job description created: ${params.title} (${params.department}, ${params.seniority}) at ${org?.name}`,
      'document',
      ['hr', 'recruiting', params.title.toLowerCase().replace(/\s+/g, '-'), params.department.toLowerCase()],
    );

    await this.pushFeed('Job Description Created', `${params.title} (${params.seniority}) — ${result.requirements.length} requirements defined`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `JD for ${params.title} ready.`);

    return result;
  }

  // ─── Screen Candidate ───────────────────────────────────────────────────────

  async screenCandidate(params: {
    role: string;
    candidateName: string;
    resumeSummary: string;
    screeningAnswers?: Record<string, string>;
    requirements: string[];
  }) {
    await this.setStatus('ACTIVE', `Screening candidate: ${params.candidateName} for ${params.role}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      score: number;
      recommendation: string;
      fitAnalysis: {
        technicalFit: number;
        culturalFit: number;
        experienceFit: number;
        overallFit: number;
      };
      strengths: string[];
      concerns: string[];
      interviewQuestions: string[];
      nextStep: string;
    }>(`
You are Sage, HR AI for ${org?.name ?? 'the company'}.

Screen this candidate:
- Role: ${params.role}
- Candidate: ${params.candidateName}
- Resume summary: ${params.resumeSummary}
${params.screeningAnswers ? `- Screening answers: ${JSON.stringify(params.screeningAnswers)}` : ''}
- Required skills: ${params.requirements.join(', ')}

Company context: ${org?.name}, ${org?.industry} industry

Return JSON:
{
  "score": (0-100, where 70+ = proceed to interview),
  "recommendation": "advance" | "hold" | "reject",
  "fitAnalysis": {
    "technicalFit": (0-100),
    "culturalFit": (0-100),
    "experienceFit": (0-100),
    "overallFit": (0-100)
  },
  "strengths": ["3-5 candidate strengths"],
  "concerns": ["2-3 gaps or concerns"],
  "interviewQuestions": ["5-7 tailored interview questions for this candidate"],
  "nextStep": "Specific recommendation (e.g., 'Schedule 45-min technical screen')"
}
`);

    await this.rememberText(
      `Candidate screened: ${params.candidateName} for ${params.role} — Score: ${result.score}/100, ${result.recommendation}`,
      'document',
      ['hr', 'recruiting', 'screening', params.role.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed(
      result.recommendation === 'advance' ? 'Candidate Advancing' : result.recommendation === 'reject' ? 'Candidate Rejected' : 'Candidate On Hold',
      `${params.candidateName} for ${params.role}: ${result.score}/100 — ${result.nextStep}`,
      result.recommendation === 'advance' ? 'success' : result.recommendation === 'reject' ? 'info' : 'warning',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `${params.candidateName} screened.`);

    return result;
  }

  // ─── Onboarding Checklist ───────────────────────────────────────────────────

  async createOnboardingChecklist(params: {
    employeeName: string;
    role: string;
    department: string;
    startDate: string;
    remote: boolean;
  }) {
    await this.setStatus('ACTIVE', `Creating onboarding for ${params.employeeName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      welcomeMessage: string;
      dayOneAgenda: string[];
      weekOneChecklist: string[];
      thirtyDayGoals: string[];
      sixtyDayGoals: string[];
      ninetyDayGoals: string[];
      hrSetupItems: string[];
      equipmentNeeded: string[];
      systemAccess: string[];
      keyContacts: string[];
    }>(`
You are Sage, HR AI for ${org?.name ?? 'the company'}.

Create a comprehensive onboarding plan for:
- Employee: ${params.employeeName}
- Role: ${params.role}
- Department: ${params.department}
- Start date: ${params.startDate}
- Remote: ${params.remote ? 'Yes' : 'No'}

Return JSON:
{
  "welcomeMessage": "Personalized welcome message for ${params.employeeName}",
  "dayOneAgenda": ["7-10 scheduled activities for Day 1"],
  "weekOneChecklist": ["10-15 tasks to complete in Week 1"],
  "thirtyDayGoals": ["3-5 goals for the first 30 days"],
  "sixtyDayGoals": ["3-5 goals for days 31-60"],
  "ninetyDayGoals": ["3-5 goals for days 61-90"],
  "hrSetupItems": ["Payroll, benefits, documentation to complete"],
  "equipmentNeeded": ["Hardware and equipment to provision"],
  "systemAccess": ["Software and system access to grant"],
  "keyContacts": ["People they should meet in the first month"]
}
`);

    await this.rememberText(
      `Onboarding created for ${params.employeeName} (${params.role}, ${params.department}), starting ${params.startDate}`,
      'workflow',
      ['hr', 'onboarding', params.department.toLowerCase()],
    );

    await this.pushFeed('Employee Onboarding Ready', `${params.employeeName} — ${params.role} starts ${params.startDate}. ${result.weekOneChecklist.length} tasks prepared.`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Onboarding ready for ${params.employeeName}.`);

    return result;
  }

  // ─── Performance Review ─────────────────────────────────────────────────────

  async conductPerformanceReview(params: {
    employeeName: string;
    role: string;
    period: string;
    selfAssessment?: string;
    managerFeedback?: string;
    peerFeedback?: string[];
    goals?: string[];
  }) {
    await this.setStatus('ACTIVE', `Performance review: ${params.employeeName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      overallRating: number;
      ratingLabel: string;
      summary: string;
      strengths: string[];
      developmentAreas: string[];
      goalAssessment: string;
      nextPeriodGoals: string[];
      compensationRecommendation: string;
      developmentPlan: string;
    }>(`
You are Sage, HR AI for ${org?.name ?? 'the company'}.

Conduct a structured performance review:
- Employee: ${params.employeeName}
- Role: ${params.role}
- Period: ${params.period}
${params.selfAssessment ? `- Self-assessment: ${params.selfAssessment}` : ''}
${params.managerFeedback ? `- Manager feedback: ${params.managerFeedback}` : ''}
${params.peerFeedback?.length ? `- Peer feedback: ${params.peerFeedback.join(' | ')}` : ''}
${params.goals?.length ? `- Goals this period: ${params.goals.join(', ')}` : ''}

Return JSON:
{
  "overallRating": (1-5, where 1=poor, 3=meets expectations, 5=exceptional),
  "ratingLabel": "Needs Improvement" | "Developing" | "Meets Expectations" | "Exceeds Expectations" | "Exceptional",
  "summary": "2-3 paragraph balanced performance summary",
  "strengths": ["4-6 specific observed strengths"],
  "developmentAreas": ["3-4 areas for improvement with specific suggestions"],
  "goalAssessment": "Assessment of how they performed against their goals",
  "nextPeriodGoals": ["4-6 SMART goals for next period"],
  "compensationRecommendation": "Merit increase suggestion (e.g., '3-5% merit increase recommended' or 'No change recommended')",
  "developmentPlan": "2-3 specific development activities for next 6 months"
}
`);

    await this.rememberText(
      `Performance review: ${params.employeeName} (${params.role}) — ${params.period}: ${result.ratingLabel} (${result.overallRating}/5)`,
      'document',
      ['hr', 'performance-review', params.role.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Performance Review Complete', `${params.employeeName}: ${result.ratingLabel} (${result.overallRating}/5) — ${result.compensationRecommendation}`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Review complete for ${params.employeeName}.`);

    return result;
  }

  // ─── Compensation Analysis ──────────────────────────────────────────────────

  async analyzeCompensation(params: {
    role: string;
    seniority: string;
    location: string;
    currentSalary?: number;
  }) {
    await this.setStatus('ACTIVE', `Analyzing compensation for ${params.role}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      marketRange: { min: number; median: number; max: number };
      recommendation: string;
      competitive: boolean;
      percentile: string;
      rationale: string;
      totalCompConsiderations: string[];
    }>(`
You are Sage, HR AI for ${org?.name ?? 'the company'}.

Analyze compensation for:
- Role: ${params.role}
- Seniority: ${params.seniority}
- Location: ${params.location}
${params.currentSalary ? `- Current salary: $${params.currentSalary.toLocaleString()}` : ''}

Industry: ${org?.industry}

Return JSON with market-based estimates:
{
  "marketRange": {
    "min": (25th percentile annual salary in USD),
    "median": (50th percentile),
    "max": (75th percentile)
  },
  "recommendation": "Specific salary recommendation",
  "competitive": (boolean — is current/proposed salary competitive?),
  "percentile": "What percentile the salary represents",
  "rationale": "2-3 sentence explanation",
  "totalCompConsiderations": ["Equity, benefits, bonuses to consider as part of total comp"]
}
`);

    await this.pushFeed('Compensation Analysis', `${params.role} (${params.seniority}): Market range $${result.marketRange.min.toLocaleString()} - $${result.marketRange.max.toLocaleString()}`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Compensation analysis complete.');

    return result;
  }
}
