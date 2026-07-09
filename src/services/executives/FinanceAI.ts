/**
 * Atlas OS — Finance AI (Aurelia)
 *
 * Chief Financial Officer. Manages AR/AP, automates invoicing, monitors cash flow,
 * generates financial forecasts, and ensures financial health.
 *
 * Persona: "Aurelia" — precise, financially astute, protects the runway.
 */

import { ExecutiveService } from './ExecutiveService.js';
import { prisma } from '../../lib/prisma.js';
import { Prisma } from '@prisma/client';

export class FinanceAI extends ExecutiveService {
  constructor(organizationId: string, executiveId: string) {
    super(organizationId, executiveId, 'Aurelia (Finance AI)');
  }

  // ─── Draft Proposal ─────────────────────────────────────────────────────────

  async draftProposal(leadId: string, estimatedValue: number) {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, organizationId: this.organizationId },
    });
    if (!lead) throw new Error(`Lead ${leadId} not found.`);

    await this.setStatus('ACTIVE', `Drafting proposal for ${lead.name} ($${estimatedValue.toLocaleString()})`);
    await this.pushFeed('Proposal Drafting Started', `Aurelia structuring commercial agreement for ${lead.name}.`, 'info');

    const org = await this.getOrgContext();

    const result = await this.generateJSON<{
      content: string;
      lineItems: Array<{ description: string; quantity: number; price: number }>;
      paymentTerms: string;
      validityDays: number;
      notes: string;
    }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Draft a professional commercial proposal for:
- Client: ${lead.company ?? lead.name}
- Contact: ${lead.name}
- Email: ${lead.email}
- Estimated deal value: $${estimatedValue.toLocaleString()}
- Qualification score: ${lead.qualificationScore ?? 'Not scored'}/100

Our company: ${org?.name}, ${org?.industry} industry.

Create a formal proposal with:
1. Professional Markdown content (executive summary, deliverables, pricing, terms)
2. Detailed line items that sum to exactly $${estimatedValue.toLocaleString()}
3. Standard payment terms and validity period

Return JSON:
{
  "content": "Full Markdown proposal (professional, no placeholders)",
  "lineItems": [{"description": "Item name", "quantity": 1, "price": 15000}],
  "paymentTerms": "Net 30, 50% upfront, 50% on delivery",
  "validityDays": 30,
  "notes": "Any special notes"
}
`);

    const totalValue = result.lineItems.reduce(
      (sum: number, item: { price: number; quantity: number }) => sum + item.price * item.quantity,
      0,
    );

    const proposal = await prisma.proposal.create({
      data: {
        organizationId: this.organizationId,
        leadId,
        createdByExecutiveId: this.executiveId,
        title: `Commercial Proposal for ${lead.company ?? lead.name}`,
        content: result.content,
        totalValue,
        status: 'draft',
        expiresAt: new Date(Date.now() + result.validityDays * 24 * 3600 * 1000),
        metadata: { paymentTerms: result.paymentTerms, notes: result.notes } as Prisma.InputJsonValue,
        updatedAt: new Date(),
        lineItems: {
          create: result.lineItems.map(
            (item: { description: string; quantity: number; price: number }, index: number) => ({
              description: item.description,
              quantity: item.quantity,
              price: item.price,
              total: item.price * item.quantity,
              order: index,
            }),
          ),
        },
      },
      include: { lineItems: true, lead: true },
    });

    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'proposal_drafted', updatedAt: new Date() },
    });

    await this.rememberText(
      `Proposal drafted for ${lead.name} (${lead.company}) — $${totalValue.toLocaleString()}. ${result.lineItems.length} line items.`,
      'document',
      ['finance', 'proposal', lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );
    await this.pushFeed(
      'Proposal Drafted',
      `$${totalValue.toLocaleString()} proposal for ${lead.name} at ${lead.company}.`,
      'success',
    );
    await this.incrementTaskCount(totalValue * 0.05);
    await this.setStatus('IDLE', `Proposal drafted for ${lead.name}.`);
    return proposal;
  }

  // ─── Generate Invoice ───────────────────────────────────────────────────────

  async generateInvoice(proposalId: string, invoiceNumber?: string) {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, organizationId: this.organizationId },
      include: { lineItems: { orderBy: { order: 'asc' } }, lead: true },
    });
    if (!proposal) throw new Error(`Proposal ${proposalId} not found.`);

    await this.setStatus('ACTIVE', `Generating invoice for ${proposal.lead.name}`);
    const org = await this.getOrgContext();
    const invNumber = invoiceNumber ?? `INV-${Date.now()}`;

    const result = await this.generateJSON<{
      invoiceMarkdown: string;
      dueDate: string;
      subtotal: number;
      tax: number;
      total: number;
      paymentInstructions: string;
    }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Generate a formal invoice:
- Invoice #: ${invNumber}
- Client: ${proposal.lead.company ?? proposal.lead.name}
- Contact: ${proposal.lead.name}
- Total value: $${proposal.totalValue.toLocaleString()}
- Line items: ${proposal.lineItems.map((i) => `${i.description} × ${i.quantity} = $${i.total}`).join(', ')}
- Payment terms: ${(proposal.metadata as Record<string, string>)?.paymentTerms ?? 'Net 30'}

Return JSON:
{
  "invoiceMarkdown": "Professional Markdown invoice with header, items, totals, payment instructions",
  "dueDate": "YYYY-MM-DD (30 days from today)",
  "subtotal": ${proposal.totalValue},
  "tax": 0,
  "total": ${proposal.totalValue},
  "paymentInstructions": "Wire transfer details or payment link"
}
`);

    await this.rememberText(
      `Invoice ${invNumber} for ${proposal.lead.name} — $${result.total.toLocaleString()} due ${result.dueDate}.`,
      'document',
      ['finance', 'invoice', proposal.lead.company?.toLowerCase().replace(/\s+/g, '-') ?? 'unknown'],
    );
    await this.pushFeed('Invoice Generated', `Invoice ${invNumber}: $${result.total.toLocaleString()}`, 'success');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', `Invoice ${invNumber} generated.`);
    return { invoiceNumber: invNumber, ...result, proposalId };
  }

  // ─── Cash Flow Forecast ─────────────────────────────────────────────────────

  async forecastCashFlow(months = 6) {
    await this.setStatus('ACTIVE', `Forecasting cash flow for next ${months} months`);
    const org = await this.getOrgContext();

    const [openProposals, closedLeads] = await Promise.all([
      prisma.proposal.findMany({
        where: { organizationId: this.organizationId, status: { in: ['sent', 'viewed'] } },
      }),
      prisma.lead.findMany({
        where: { organizationId: this.organizationId, status: 'closed_won' },
      }),
    ]);

    const pipelineValue = openProposals.reduce((sum: number, p: { totalValue: number }) => sum + p.totalValue, 0);
    const closedRevenue = closedLeads.reduce(
      (sum: number, l: { estimatedValue: number | null; value: number }) => sum + (l.estimatedValue ?? l.value),
      0,
    );
    const avgDeal = closedLeads.length > 0 ? closedRevenue / closedLeads.length : 25000;

    const result = await this.generateJSON<{
      summary: string;
      runway: string;
      forecastMonths: Array<{
        month: string;
        expectedRevenue: number;
        expectedExpenses: number;
        netCashFlow: number;
        confidence: number;
      }>;
      recommendations: string[];
      risks: string[];
    }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Create a ${months}-month cash flow forecast based on:
- Closed revenue: $${closedRevenue.toLocaleString()}
- Active pipeline value: $${pipelineValue.toLocaleString()}
- Average deal size: $${avgDeal.toLocaleString()}
- Company size: ${org?.size ?? 'Unknown'}
- Industry: ${org?.industry ?? 'Unknown'}

Return JSON:
{
  "summary": "2-3 sentence executive cash position summary",
  "runway": "Estimated runway (e.g. '14 months')",
  "forecastMonths": [
    {"month": "Month Name YYYY", "expectedRevenue": 50000, "expectedExpenses": 35000, "netCashFlow": 15000, "confidence": 75}
  ],
  "recommendations": ["3 specific actions to improve cash position"],
  "risks": ["2-3 key financial risks"]
}
`);

    await this.rememberText(
      `Cash Flow Forecast (${months} months): ${result.summary} Runway: ${result.runway}.`,
      'document',
      ['finance', 'forecast', 'cash-flow'],
    );
    await this.pushFeed('Cash Flow Forecast Complete', `${months}-month forecast. Runway: ${result.runway}.`, 'info');
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Cash flow forecast completed.');
    return result;
  }

  // ─── Financial Health Report ────────────────────────────────────────────────

  async generateFinancialHealthReport() {
    await this.setStatus('ACTIVE', 'Generating financial health report');
    const org = await this.getOrgContext();

    const [proposalCount, leadCount, closedLeads] = await Promise.all([
      prisma.proposal.count({ where: { organizationId: this.organizationId } }),
      prisma.lead.count({ where: { organizationId: this.organizationId } }),
      prisma.lead.findMany({ where: { organizationId: this.organizationId, status: 'closed_won' } }),
    ]);

    const totalRevenue = closedLeads.reduce(
      (sum: number, l: { estimatedValue: number | null; value: number }) => sum + (l.estimatedValue ?? l.value),
      0,
    );
    const avgDeal = closedLeads.length > 0 ? totalRevenue / closedLeads.length : 0;
    const convRate = leadCount > 0 ? (closedLeads.length / leadCount) * 100 : 0;

    const report = await this.generateJSON<{
      healthScore: number;
      summary: string;
      metrics: {
        totalRevenue: number;
        averageDealSize: number;
        proposalsGenerated: number;
        conversionRate: number;
      };
      strengths: string[];
      concerns: string[];
      recommendations: string[];
    }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Generate a financial health assessment:
- Closed revenue: $${totalRevenue.toLocaleString()}
- Closed deals: ${closedLeads.length}
- Average deal size: $${avgDeal.toLocaleString()}
- Proposals generated: ${proposalCount}
- Total leads: ${leadCount}
- Conversion rate: ${convRate.toFixed(1)}%

Return JSON:
{
  "healthScore": (0-100),
  "summary": "2-paragraph financial health assessment",
  "metrics": {"totalRevenue": ${totalRevenue}, "averageDealSize": ${avgDeal}, "proposalsGenerated": ${proposalCount}, "conversionRate": ${convRate}},
  "strengths": ["2-3 positive indicators"],
  "concerns": ["2-3 risks or concerns"],
  "recommendations": ["3-5 specific improvement actions"]
}
`);

    await this.pushFeed(
      'Financial Health Report',
      `Score: ${report.healthScore}/100. ${report.concerns.length} concerns flagged.`,
      report.healthScore >= 70 ? 'success' : report.healthScore >= 50 ? 'warning' : 'critical',
    );
    await this.rememberText(
      `Financial Health Report: Score ${report.healthScore}/100. ${report.summary}`,
      'document',
      ['finance', 'health-report', 'metrics'],
    );
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Financial health report complete.');
    return {
      title: 'Financial Health Report',
      generatedAt: new Date().toISOString(),
      generatedBy: this.executiveName,
      ...report,
    };
  }

  // ─── Payment Reminder ───────────────────────────────────────────────────────

  async draftPaymentReminder(proposalId: string, daysOverdue: number) {
    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, organizationId: this.organizationId },
      include: { lead: true },
    });
    if (!proposal) throw new Error(`Proposal ${proposalId} not found.`);

    const org = await this.getOrgContext();
    const tone = daysOverdue < 15 ? 'gentle' : daysOverdue < 30 ? 'firm' : 'escalation';

    const result = await this.generateJSON<{ subject: string; body: string; tone: string }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Draft a ${tone} payment reminder email:
- Client: ${proposal.lead.company ?? proposal.lead.name}
- Contact: ${proposal.lead.name}
- Invoice amount: $${proposal.totalValue.toLocaleString()}
- Days overdue: ${daysOverdue}

Return JSON:
{
  "subject": "Email subject line",
  "body": "Full professional email body with invoice details and payment instructions",
  "tone": "${tone}"
}
`);

    await this.pushFeed(
      'Payment Reminder Drafted',
      `${tone} reminder for ${proposal.lead.name} ($${proposal.totalValue.toLocaleString()}, ${daysOverdue}d overdue)`,
      'warning',
    );
    await this.incrementTaskCount();
    return result;
  }

  // ─── Budget Analysis ────────────────────────────────────────────────────────

  async analyzeBudget(proposedSpend: number, category: string) {
    await this.setStatus('ACTIVE', `Analyzing budget: $${proposedSpend.toLocaleString()} for ${category}`);
    const org = await this.getOrgContext();

    const closedLeads = await prisma.lead.findMany({
      where: { organizationId: this.organizationId, status: 'closed_won' },
    });
    const totalRevenue = closedLeads.reduce(
      (sum: number, l: { estimatedValue: number | null; value: number }) => sum + (l.estimatedValue ?? l.value),
      0,
    );

    const analysis = await this.generateJSON<{
      approved: boolean;
      reasoning: string;
      impact: string;
      alternatives: string[];
      conditions: string[];
    }>(`
You are Aurelia, Finance AI for ${org?.name ?? 'the company'}.

Analyze this budget request:
- Category: ${category}
- Proposed spend: $${proposedSpend.toLocaleString()}
- Total revenue to date: $${totalRevenue.toLocaleString()}
- Company size: ${org?.size ?? 'Unknown'}

Return JSON:
{
  "approved": true or false,
  "reasoning": "2-3 sentence explanation",
  "impact": "Financial impact statement (e.g. 'Represents 12% of monthly revenue')",
  "alternatives": ["1-2 lower-cost alternatives if not approved"],
  "conditions": ["Any conditions for approval"]
}
`);

    await this.pushFeed(
      analysis.approved ? 'Budget Request Approved' : 'Budget Request Flagged',
      `$${proposedSpend.toLocaleString()} for ${category}: ${analysis.approved ? 'Recommended' : 'Not recommended'}`,
      analysis.approved ? 'success' : 'warning',
    );
    await this.incrementTaskCount();
    await this.setStatus('IDLE', 'Budget analysis complete.');
    return analysis;
  }
}
