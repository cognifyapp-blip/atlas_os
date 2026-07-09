/**
 * Atlas OS — Legal AI (Lexis)
 *
 * General Counsel. Drafts and reviews contracts, monitors compliance,
 * assesses legal risk, and protects the company from legal exposure.
 *
 * Persona: "Lexis" — methodical, risk-averse, the company's legal guardian.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';

export class LegalAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Lexis (Legal AI)');
  }

  // ─── Draft NDA ──────────────────────────────────────────────────────────────

  async draftNDA(params: {
    partyName: string;
    partyType: 'vendor' | 'employee' | 'contractor' | 'partner' | 'investor';
    purpose: string;
    duration?: string;
    mutual?: boolean;
  }) {
    await this.setStatus('ACTIVE', `Drafting NDA for ${params.partyName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      title: string;
      content: string;
      keyTerms: string[];
      riskFlags: string[];
      signingInstructions: string;
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Draft a ${params.mutual ? 'mutual' : 'one-way'} Non-Disclosure Agreement:
- Party: ${params.partyName} (${params.partyType})
- Purpose: ${params.purpose}
- Duration: ${params.duration ?? '2 years'}
- Our company: ${org?.name}

Generate a legally sound, professional NDA in Markdown format.
Include: definitions, obligations, exclusions, term and termination, remedies, governing law.

Return JSON:
{
  "title": "NDA title",
  "content": "Full NDA in Markdown (all standard legal sections, professional language)",
  "keyTerms": ["5-7 key terms and obligations summarized"],
  "riskFlags": ["Any unusual provisions or risks in this agreement"],
  "signingInstructions": "How the parties should execute this agreement"
}
`);

    await this.rememberText(
      `NDA drafted for ${params.partyName} (${params.partyType}) — Purpose: ${params.purpose}`,
      'document',
      ['legal', 'nda', params.partyType, params.partyName.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('NDA Drafted', `${params.mutual ? 'Mutual' : 'One-way'} NDA for ${params.partyName} (${params.partyType})`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `NDA drafted for ${params.partyName}.`);

    return result;
  }

  // ─── Draft MSA ──────────────────────────────────────────────────────────────

  async draftMSA(params: {
    clientName: string;
    serviceDescription: string;
    monthlyFee?: number;
    termMonths?: number;
    slaRequirements?: string[];
  }) {
    await this.setStatus('ACTIVE', `Drafting MSA for ${params.clientName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      title: string;
      content: string;
      slaTerms: string[];
      paymentTerms: string;
      terminationClauses: string[];
      limitationOfLiability: string;
      riskFlags: string[];
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Draft a Master Services Agreement (MSA):
- Client: ${params.clientName}
- Services: ${params.serviceDescription}
- Monthly fee: ${params.monthlyFee ? `$${params.monthlyFee.toLocaleString()}` : 'TBD'}
- Initial term: ${params.termMonths ?? 12} months
- SLA requirements: ${params.slaRequirements?.join(', ') ?? 'Standard SLAs'}
- Provider: ${org?.name}

Generate a comprehensive, professionally drafted MSA in Markdown.
Include: services scope, payment terms, IP ownership, warranties, limitation of liability, SLAs, termination, dispute resolution.

Return JSON:
{
  "title": "MSA title",
  "content": "Full MSA in Markdown (all standard commercial contract sections)",
  "slaTerms": ["SLA commitments extracted from the document"],
  "paymentTerms": "Summary of payment structure",
  "terminationClauses": ["Key termination provisions"],
  "limitationOfLiability": "Limitation of liability cap and carve-outs",
  "riskFlags": ["Any provisions that may need negotiation or review"]
}
`);

    await this.rememberText(
      `MSA drafted for ${params.clientName} — Services: ${params.serviceDescription}, ${params.termMonths ?? 12} month term`,
      'document',
      ['legal', 'msa', 'contract', params.clientName.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('MSA Drafted', `Master Services Agreement for ${params.clientName} — ${params.termMonths ?? 12} month term`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `MSA drafted for ${params.clientName}.`);

    return result;
  }

  // ─── Review Contract ─────────────────────────────────────────────────────────

  async reviewContract(params: {
    contractType: string;
    contractText: string;
    reviewingAs: 'buyer' | 'seller' | 'employer' | 'employee' | 'partner';
  }) {
    await this.setStatus('ACTIVE', `Reviewing ${params.contractType}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      riskScore: number;
      summary: string;
      redFlags: Array<{
        clause: string;
        risk: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        recommendation: string;
      }>;
      favourable: string[];
      negotiationPoints: string[];
      recommendation: 'sign' | 'negotiate' | 'reject';
      approvalRequired: boolean;
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Review this ${params.contractType} from the perspective of ${params.reviewingAs}:

Contract text:
---
${params.contractText.substring(0, 4000)}
---

Identify all legal risks, unfavourable terms, and recommended changes.

Return JSON:
{
  "riskScore": (0-100, where 0 is perfectly safe and 100 is extremely risky),
  "summary": "2-3 paragraph plain-English summary of what this contract says and its key implications",
  "redFlags": [
    {
      "clause": "Quoted or paraphrased problematic clause",
      "risk": "Why this is risky for us",
      "severity": "low" | "medium" | "high" | "critical",
      "recommendation": "What we should ask for instead"
    }
  ],
  "favourable": ["Terms that are favourable to us"],
  "negotiationPoints": ["Prioritized list of changes to negotiate"],
  "recommendation": "sign" | "negotiate" | "reject",
  "approvalRequired": (boolean — does this need CEO/board approval based on scope?)
}
`);

    await this.rememberText(
      `Contract review (${params.contractType}): Risk score ${result.riskScore}/100. Recommendation: ${result.recommendation}. ${result.redFlags.length} red flags identified.`,
      'decision',
      ['legal', 'contract-review', params.contractType.toLowerCase().replace(/\s+/g, '-')],
    );

    // Create a decision if approval is required or risk is high
    if (result.approvalRequired || result.riskScore > 60) {
      await this.createDecision({
        title: `Legal Review: ${params.contractType}`,
        summary: `Lexis has reviewed this ${params.contractType}. Risk score: ${result.riskScore}/100. Recommendation: ${result.recommendation}.`,
        reasoning: result.summary,
        impact: `${result.redFlags.filter((f) => f.severity === 'critical' || f.severity === 'high').length} high-severity red flags. ${result.negotiationPoints.length} negotiation points.`,
        confidence: 100 - result.riskScore,
        type: 'legal',
        expiresInHours: 72,
        metadata: { contractType: params.contractType, riskScore: result.riskScore },
      });
    }

    await this.pushFeed(
      `Contract Review: ${result.recommendation.charAt(0).toUpperCase() + result.recommendation.slice(1)}`,
      `${params.contractType}: Risk ${result.riskScore}/100, ${result.redFlags.length} red flags, recommendation: ${result.recommendation}`,
      result.riskScore > 70 ? 'critical' : result.riskScore > 40 ? 'warning' : 'success',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Contract review complete.`);

    return result;
  }

  // ─── Compliance Check ────────────────────────────────────────────────────────

  async checkCompliance(params: {
    area: 'gdpr' | 'ccpa' | 'hipaa' | 'sox' | 'pci_dss' | 'employment' | 'general';
    description: string;
  }) {
    await this.setStatus('ACTIVE', `Compliance check: ${params.area.toUpperCase()}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      complianceScore: number;
      status: 'compliant' | 'partial' | 'non_compliant';
      requirements: Array<{
        requirement: string;
        status: 'met' | 'partial' | 'missing';
        action: string;
        deadline?: string;
        priority: 'low' | 'medium' | 'high' | 'critical';
      }>;
      risks: string[];
      immediateActions: string[];
      documentation: string[];
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Conduct a ${params.area.toUpperCase()} compliance assessment:
Description: ${params.description}
Company: ${org?.name}, ${org?.industry} industry, ${org?.size} employees

Return JSON:
{
  "complianceScore": (0-100, where 100 is fully compliant),
  "status": "compliant" | "partial" | "non_compliant",
  "requirements": [
    {
      "requirement": "Specific regulatory requirement",
      "status": "met" | "partial" | "missing",
      "action": "What needs to be done",
      "deadline": "When this must be completed (if applicable)",
      "priority": "low" | "medium" | "high" | "critical"
    },
    ... (8-12 requirements)
  ],
  "risks": ["3-5 compliance risks if requirements are not met"],
  "immediateActions": ["Top 3 actions to take immediately"],
  "documentation": ["Required documentation that must be created/maintained"]
}
`);

    if (result.complianceScore < 70) {
      await this.createDecision({
        title: `${params.area.toUpperCase()} Compliance Gap Identified`,
        summary: `Compliance score: ${result.complianceScore}/100. Status: ${result.status}. ${result.requirements.filter((r) => r.status === 'missing').length} missing requirements.`,
        reasoning: `Compliance gaps identified in ${params.area.toUpperCase()} assessment. Immediate action required.`,
        impact: result.risks.join(' | '),
        confidence: 95,
        type: 'legal',
        expiresInHours: 48,
      });
    }

    await this.rememberText(
      `${params.area.toUpperCase()} compliance check: Score ${result.complianceScore}/100 (${result.status}). ${result.requirements.filter((r) => r.status === 'missing').length} missing items.`,
      'insight',
      ['legal', 'compliance', params.area],
    );

    await this.pushFeed(
      `${params.area.toUpperCase()} Compliance: ${result.status.replace('_', ' ')}`,
      `Score: ${result.complianceScore}/100. ${result.requirements.filter((r) => r.priority === 'critical').length} critical items.`,
      result.complianceScore < 50 ? 'critical' : result.complianceScore < 75 ? 'warning' : 'success',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Compliance check complete.`);

    return result;
  }

  // ─── Legal Risk Assessment ───────────────────────────────────────────────────

  async assessLegalRisk(params: {
    decision: string;
    context: string;
    stakeholders?: string[];
  }) {
    await this.setStatus('ACTIVE', `Assessing legal risk: ${params.decision}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      overallRisk: 'low' | 'medium' | 'high' | 'critical';
      riskScore: number;
      analysis: string;
      riskCategories: Array<{
        category: string;
        risk: string;
        likelihood: string;
        impact: string;
        mitigation: string;
      }>;
      legalOpinion: string;
      conditions: string[];
      alternativeApproaches: string[];
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Provide a legal risk assessment for this business decision:
- Decision: ${params.decision}
- Context: ${params.context}
- Stakeholders: ${params.stakeholders?.join(', ') ?? 'Internal team'}

Company: ${org?.name}, ${org?.industry} industry.

Return JSON:
{
  "overallRisk": "low" | "medium" | "high" | "critical",
  "riskScore": (0-100, where 100 is maximum legal risk),
  "analysis": "2-3 paragraph plain-English legal analysis",
  "riskCategories": [
    {
      "category": "Contractual" | "Regulatory" | "Employment" | "IP" | "Privacy" | "Litigation",
      "risk": "Specific risk description",
      "likelihood": "low" | "medium" | "high",
      "impact": "low" | "medium" | "high",
      "mitigation": "How to reduce this risk"
    },
    ... (3-6 risk categories)
  ],
  "legalOpinion": "Lexis's formal legal opinion on whether to proceed",
  "conditions": ["Conditions under which this can safely proceed"],
  "alternativeApproaches": ["Legally safer alternatives to consider"]
}
`);

    await this.rememberText(
      `Legal risk assessment: "${params.decision}" — Overall: ${result.overallRisk}, Score: ${result.riskScore}/100`,
      'decision',
      ['legal', 'risk-assessment', result.overallRisk],
    );

    await this.pushFeed(
      `Legal Risk: ${result.overallRisk.toUpperCase()}`,
      `"${params.decision}" — Risk score: ${result.riskScore}/100. ${result.conditions.length} conditions for safe proceeding.`,
      result.overallRisk === 'critical' ? 'critical' : result.overallRisk === 'high' ? 'warning' : 'info',
    );

    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Legal risk assessment complete.');

    return result;
  }

  // ─── Draft Vendor Agreement ──────────────────────────────────────────────────

  async draftVendorAgreement(params: {
    vendorName: string;
    serviceType: string;
    annualValue: number;
    duration: string;
    keyTerms?: string[];
  }) {
    await this.setStatus('ACTIVE', `Drafting vendor agreement for ${params.vendorName}`);

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      title: string;
      content: string;
      protectionClauses: string[];
      exitClauses: string[];
      performanceMetrics: string[];
    }>(`
You are Lexis, General Counsel AI for ${org?.name ?? 'the company'}.

Draft a vendor agreement:
- Vendor: ${params.vendorName}
- Service: ${params.serviceType}
- Annual value: $${params.annualValue.toLocaleString()}
- Duration: ${params.duration}
- Special terms: ${params.keyTerms?.join(', ') ?? 'Standard terms'}

Include: scope of work, payment terms, performance standards, data security, termination rights, indemnification.

Return JSON:
{
  "title": "Agreement title",
  "content": "Full vendor agreement in Markdown",
  "protectionClauses": ["Key protections included for our company"],
  "exitClauses": ["Termination and exit provisions"],
  "performanceMetrics": ["Measurable performance standards included"]
}
`);

    await this.rememberText(
      `Vendor agreement drafted: ${params.vendorName} — $${params.annualValue.toLocaleString()}/year, ${params.duration}`,
      'document',
      ['legal', 'vendor-agreement', params.vendorName.toLowerCase().replace(/\s+/g, '-')],
    );

    await this.pushFeed('Vendor Agreement Drafted', `${params.vendorName}: $${params.annualValue.toLocaleString()}/year, ${params.duration}`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Vendor agreement drafted for ${params.vendorName}.`);

    return result;
  }
}
