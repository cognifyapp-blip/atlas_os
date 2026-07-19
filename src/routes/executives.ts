/**
 * Atlas OS — Executive API Routes
 *
 * Every AI executive capability exposed as a real API endpoint.
 * All routes resolve the org + executive from the database, instantiate
 * the correct executive class, call the method, and return the result.
 *
 * Base path: /api/v1/executives
 *
 * Pattern:
 *   POST /api/v1/executives/:name/capability
 *
 * Where :name is a slug like 'zephyr', 'aurelia', 'atlas', 'aria', etc.
 */

import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma.js';
import {
  CEOAssistant,
  SalesAI,
  FinanceAI,
  MarketingAI,
  CustomerSuccessAI,
  HRAI,
  OperationsAI,
  LegalAI,
  DeveloperAI,
  IntelligenceAI,
} from '../services/executives/index.js';
import { resolveOrgId } from '../lib/resolveOrg.js';

const router = Router();

// ─── Resolver ─────────────────────────────────────────────────────────────────

async function resolveExec(nameFragment: string, res: Response) {
  const orgId = await resolveOrgId(res);
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) throw new Error('Organization not found.');
  const exec = await prisma.aIExecutive.findFirst({
    where: { organizationId: orgId, name: { contains: nameFragment, mode: 'insensitive' } },
  });
  if (!exec) throw new Error(`Executive matching "${nameFragment}" not found.`);
  return { org, exec };
}

function wrap(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response) => {
    fn(req, res).catch((err: any) => {
      console.error(`[Executive Route Error]`, err.message);
      res.status(500).json({ error: 'Request failed.' });
    });
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// CEO ASSISTANT — Atlas
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/atlas/strategy-session */
router.post('/atlas/strategy-session', wrap(async (req, res) => {
  const { topic, previousMessages } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const { org, exec } = await resolveExec('Atlas', res);
  const atlas = new CEOAssistant(org.id, exec.id);
  res.json(await atlas.runStrategySession(topic, previousMessages ?? []));
}));

/** POST /api/v1/executives/atlas/command */
router.post('/atlas/command', wrap(async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'command required' });
  const { org, exec } = await resolveExec('Atlas', res);
  const atlas = new CEOAssistant(org.id, exec.id);
  res.json(await atlas.processCommand(command));
}));

/** GET /api/v1/executives/atlas/board-report */
router.get('/atlas/board-report', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Atlas', res);
  const atlas = new CEOAssistant(org.id, exec.id);
  res.json(await atlas.generateBoardReport());
}));

/** GET /api/v1/executives/atlas/daily-briefing */
router.get('/atlas/daily-briefing', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Atlas', res);
  const atlas = new CEOAssistant(org.id, exec.id);
  res.json(await atlas.generateDailyBriefing());
}));

// ═══════════════════════════════════════════════════════════════════════════════
// SALES AI — Zephyr
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/zephyr/qualify-lead */
router.post('/zephyr/qualify-lead', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Zephyr', res);
  const zephyr = new SalesAI(org.id, exec.id);
  res.json(await zephyr.qualifyLead(leadId));
}));

/** GET /api/v1/executives/zephyr/pipeline-review */
router.get('/zephyr/pipeline-review', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Zephyr', res);
  const zephyr = new SalesAI(org.id, exec.id);
  res.json(await zephyr.reviewPipeline());
}));

/** POST /api/v1/executives/zephyr/outreach-email */
router.post('/zephyr/outreach-email', wrap(async (req, res) => {
  const { leadId, type } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Zephyr', res);
  const zephyr = new SalesAI(org.id, exec.id);
  res.json(await zephyr.draftOutreachEmail(leadId, type ?? 'initial'));
}));

/** POST /api/v1/executives/zephyr/close-lead */
router.post('/zephyr/close-lead', wrap(async (req, res) => {
  const { leadId, outcome, reason } = req.body;
  if (!leadId || !outcome) return res.status(400).json({ error: 'leadId and outcome required' });
  const { org, exec } = await resolveExec('Zephyr', res);
  const zephyr = new SalesAI(org.id, exec.id);
  res.json(await zephyr.markLeadClosed(leadId, outcome, reason));
}));

/** GET /api/v1/executives/zephyr/pipeline-report */
router.get('/zephyr/pipeline-report', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Zephyr', res);
  const zephyr = new SalesAI(org.id, exec.id);
  res.json(await zephyr.generatePipelineReport());
}));

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE AI — Aurelia
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/aurelia/draft-proposal */
router.post('/aurelia/draft-proposal', wrap(async (req, res) => {
  const { leadId, estimatedValue } = req.body;
  if (!leadId || !estimatedValue) return res.status(400).json({ error: 'leadId and estimatedValue required' });
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.draftProposal(leadId, Number(estimatedValue)));
}));

/** POST /api/v1/executives/aurelia/generate-invoice */
router.post('/aurelia/generate-invoice', wrap(async (req, res) => {
  const { proposalId, invoiceNumber } = req.body;
  if (!proposalId) return res.status(400).json({ error: 'proposalId required' });
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.generateInvoice(proposalId, invoiceNumber));
}));

/** GET /api/v1/executives/aurelia/cash-flow-forecast */
router.get('/aurelia/cash-flow-forecast', wrap(async (req, res) => {
  const months = parseInt((req.query.months as string) ?? '6', 10);
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.forecastCashFlow(months));
}));

/** GET /api/v1/executives/aurelia/financial-health */
router.get('/aurelia/financial-health', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.generateFinancialHealthReport());
}));

/** POST /api/v1/executives/aurelia/payment-reminder */
router.post('/aurelia/payment-reminder', wrap(async (req, res) => {
  const { proposalId, daysOverdue } = req.body;
  if (!proposalId || daysOverdue == null) return res.status(400).json({ error: 'proposalId and daysOverdue required' });
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.draftPaymentReminder(proposalId, Number(daysOverdue)));
}));

/** POST /api/v1/executives/aurelia/budget-analysis */
router.post('/aurelia/budget-analysis', wrap(async (req, res) => {
  const { proposedSpend, category } = req.body;
  if (!proposedSpend || !category) return res.status(400).json({ error: 'proposedSpend and category required' });
  const { org, exec } = await resolveExec('Aurelia', res);
  const aurelia = new FinanceAI(org.id, exec.id);
  res.json(await aurelia.analyzeBudget(Number(proposedSpend), category));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// MARKETING AI — Aria
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/aria/plan-campaign */
router.post('/aria/plan-campaign', wrap(async (req, res) => {
  const { goal, targetAudience, budget, duration, channels } = req.body;
  if (!goal || !targetAudience || !budget || !duration) return res.status(400).json({ error: 'goal, targetAudience, budget, duration required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.planCampaign({ goal, targetAudience, budget: Number(budget), duration, channels }));
}));

/** POST /api/v1/executives/aria/generate-content */
router.post('/aria/generate-content', wrap(async (req, res) => {
  const { type, topic, audience, tone, wordCount } = req.body;
  if (!type || !topic || !audience) return res.status(400).json({ error: 'type, topic, audience required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.generateContent({ type, topic, audience, tone, wordCount }));
}));

/** POST /api/v1/executives/aria/score-lead */
router.post('/aria/score-lead', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.scoreMarketingLead(leadId));
}));

/** POST /api/v1/executives/aria/analyse-campaign */
router.post('/aria/analyse-campaign', wrap(async (req, res) => {
  const { workflowId } = req.body;
  if (!workflowId) return res.status(400).json({ error: 'workflowId required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.analyzeCampaignPerformance(workflowId));
}));

/** POST /api/v1/executives/aria/keyword-research */
router.post('/aria/keyword-research', wrap(async (req, res) => {
  const { topic, intent } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.researchKeywords(topic, intent ?? 'informational'));
}));

/** POST /api/v1/executives/aria/email-campaign */
router.post('/aria/email-campaign', wrap(async (req, res) => {
  const { name, audience, goal, emailCount, daysBetween } = req.body;
  if (!name || !audience || !goal) return res.status(400).json({ error: 'name, audience, goal required' });
  const { org, exec } = await resolveExec('Aria', res);
  const aria = new MarketingAI(org.id, exec.id);
  res.json(await aria.createEmailCampaign({ name, audience, goal, emailCount: emailCount ?? 5, daysBetween: daysBetween ?? 3 }));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER SUCCESS AI — Lyra
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/lyra/health-score */
router.post('/lyra/health-score', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.calculateCustomerHealth(leadId));
}));

/** POST /api/v1/executives/lyra/onboarding-plan */
router.post('/lyra/onboarding-plan', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.createOnboardingPlan(leadId));
}));

/** POST /api/v1/executives/lyra/expansion-opportunities */
router.post('/lyra/expansion-opportunities', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.identifyExpansionOpportunities(leadId));
}));

/** POST /api/v1/executives/lyra/churn-prevention */
router.post('/lyra/churn-prevention', wrap(async (req, res) => {
  const { leadId } = req.body;
  if (!leadId) return res.status(400).json({ error: 'leadId required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.createChurnPreventionPlan(leadId));
}));

/** POST /api/v1/executives/lyra/qbr-agenda */
router.post('/lyra/qbr-agenda', wrap(async (req, res) => {
  const { leadId, quarter } = req.body;
  if (!leadId || !quarter) return res.status(400).json({ error: 'leadId and quarter required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.generateQBRAgenda(leadId, quarter));
}));

/** POST /api/v1/executives/lyra/analyse-nps */
router.post('/lyra/analyse-nps', wrap(async (req, res) => {
  const { scores } = req.body;
  if (!scores || !Array.isArray(scores)) return res.status(400).json({ error: 'scores array required' });
  const { org, exec } = await resolveExec('Lyra', res);
  const lyra = new CustomerSuccessAI(org.id, exec.id);
  res.json(await lyra.analyzeNPS(scores));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// HR AI — Sage
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/sage/job-description */
router.post('/sage/job-description', wrap(async (req, res) => {
  const { title, department, seniority, skills, salaryRange, remote } = req.body;
  if (!title || !department || !seniority || !skills) return res.status(400).json({ error: 'title, department, seniority, skills required' });
  const { org, exec } = await resolveExec('Sage', res);
  const sage = new HRAI(org.id, exec.id);
  res.json(await sage.createJobDescription({ title, department, seniority, skills, salaryRange, remote }));
}));

/** POST /api/v1/executives/sage/screen-candidate */
router.post('/sage/screen-candidate', wrap(async (req, res) => {
  const { role, candidateName, resumeSummary, requirements, screeningAnswers } = req.body;
  if (!role || !candidateName || !resumeSummary || !requirements) return res.status(400).json({ error: 'role, candidateName, resumeSummary, requirements required' });
  const { org, exec } = await resolveExec('Sage', res);
  const sage = new HRAI(org.id, exec.id);
  res.json(await sage.screenCandidate({ role, candidateName, resumeSummary, requirements, screeningAnswers }));
}));

/** POST /api/v1/executives/sage/onboarding-checklist */
router.post('/sage/onboarding-checklist', wrap(async (req, res) => {
  const { employeeName, role, department, startDate, remote } = req.body;
  if (!employeeName || !role || !department || !startDate) return res.status(400).json({ error: 'employeeName, role, department, startDate required' });
  const { org, exec } = await resolveExec('Sage', res);
  const sage = new HRAI(org.id, exec.id);
  res.json(await sage.createOnboardingChecklist({ employeeName, role, department, startDate, remote: remote ?? false }));
}));

/** POST /api/v1/executives/sage/performance-review */
router.post('/sage/performance-review', wrap(async (req, res) => {
  const { employeeName, role, period, selfAssessment, managerFeedback, peerFeedback, goals } = req.body;
  if (!employeeName || !role || !period) return res.status(400).json({ error: 'employeeName, role, period required' });
  const { org, exec } = await resolveExec('Sage', res);
  const sage = new HRAI(org.id, exec.id);
  res.json(await sage.conductPerformanceReview({ employeeName, role, period, selfAssessment, managerFeedback, peerFeedback, goals }));
}));

/** POST /api/v1/executives/sage/compensation-analysis */
router.post('/sage/compensation-analysis', wrap(async (req, res) => {
  const { role, seniority, location, currentSalary } = req.body;
  if (!role || !seniority || !location) return res.status(400).json({ error: 'role, seniority, location required' });
  const { org, exec } = await resolveExec('Sage', res);
  const sage = new HRAI(org.id, exec.id);
  res.json(await sage.analyzeCompensation({ role, seniority, location, currentSalary }));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// OPERATIONS AI — Orion
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/orion/audit-process */
router.post('/orion/audit-process', wrap(async (req, res) => {
  const { processName, currentSteps, frequency, timeSpent, painPoints } = req.body;
  if (!processName || !currentSteps) return res.status(400).json({ error: 'processName and currentSteps required' });
  const { org, exec } = await resolveExec('Orion', res);
  const orion = new OperationsAI(org.id, exec.id);
  res.json(await orion.auditProcess({ processName, currentSteps, frequency: frequency ?? 'Daily', timeSpent: timeSpent ?? 'Unknown', painPoints: painPoints ?? [] }));
}));

/** POST /api/v1/executives/orion/create-automation */
router.post('/orion/create-automation', wrap(async (req, res) => {
  const { name, trigger, steps, department } = req.body;
  if (!name || !trigger || !steps || !department) return res.status(400).json({ error: 'name, trigger, steps, department required' });
  const { org, exec } = await resolveExec('Orion', res);
  const orion = new OperationsAI(org.id, exec.id);
  res.json(await orion.createAutomationWorkflow({ name, trigger, steps, department }));
}));

/** POST /api/v1/executives/orion/analyse-vendor */
router.post('/orion/analyse-vendor', wrap(async (req, res) => {
  const { vendorName, serviceType, currentCost, contractEndDate, issues, alternatives } = req.body;
  if (!vendorName || !serviceType || currentCost == null) return res.status(400).json({ error: 'vendorName, serviceType, currentCost required' });
  const { org, exec } = await resolveExec('Orion', res);
  const orion = new OperationsAI(org.id, exec.id);
  res.json(await orion.analyzeVendor({ vendorName, serviceType, currentCost: Number(currentCost), contractEndDate, issues: issues ?? [], alternatives }));
}));

/** POST /api/v1/executives/orion/triage-incident */
router.post('/orion/triage-incident', wrap(async (req, res) => {
  const { title, description, severity, affectedSystems, reportedBy } = req.body;
  if (!title || !description || !severity || !affectedSystems) return res.status(400).json({ error: 'title, description, severity, affectedSystems required' });
  const { org, exec } = await resolveExec('Orion', res);
  const orion = new OperationsAI(org.id, exec.id);
  res.json(await orion.triageIncident({ title, description, severity, affectedSystems, reportedBy }));
}));

/** GET /api/v1/executives/orion/operational-report */
router.get('/orion/operational-report', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Orion', res);
  const orion = new OperationsAI(org.id, exec.id);
  res.json(await orion.generateOperationalReport());
}));

// ═══════════════════════════════════════════════════════════════════════════════
// LEGAL AI — Lexis
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/lexis/draft-nda */
router.post('/lexis/draft-nda', wrap(async (req, res) => {
  const { partyName, partyType, purpose, duration, mutual } = req.body;
  if (!partyName || !partyType || !purpose) return res.status(400).json({ error: 'partyName, partyType, purpose required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.draftNDA({ partyName, partyType, purpose, duration, mutual: mutual ?? false }));
}));

/** POST /api/v1/executives/lexis/draft-msa */
router.post('/lexis/draft-msa', wrap(async (req, res) => {
  const { clientName, serviceDescription, monthlyFee, termMonths, slaRequirements } = req.body;
  if (!clientName || !serviceDescription) return res.status(400).json({ error: 'clientName and serviceDescription required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.draftMSA({ clientName, serviceDescription, monthlyFee, termMonths, slaRequirements }));
}));

/** POST /api/v1/executives/lexis/review-contract */
router.post('/lexis/review-contract', wrap(async (req, res) => {
  const { contractType, contractText, reviewingAs } = req.body;
  if (!contractType || !contractText || !reviewingAs) return res.status(400).json({ error: 'contractType, contractText, reviewingAs required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.reviewContract({ contractType, contractText, reviewingAs }));
}));

/** POST /api/v1/executives/lexis/compliance-check */
router.post('/lexis/compliance-check', wrap(async (req, res) => {
  const { area, description } = req.body;
  if (!area || !description) return res.status(400).json({ error: 'area and description required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.checkCompliance({ area, description }));
}));

/** POST /api/v1/executives/lexis/risk-assessment */
router.post('/lexis/risk-assessment', wrap(async (req, res) => {
  const { decision, context, stakeholders } = req.body;
  if (!decision || !context) return res.status(400).json({ error: 'decision and context required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.assessLegalRisk({ decision, context, stakeholders }));
}));

/** POST /api/v1/executives/lexis/vendor-agreement */
router.post('/lexis/vendor-agreement', wrap(async (req, res) => {
  const { vendorName, serviceType, annualValue, duration, keyTerms } = req.body;
  if (!vendorName || !serviceType || !annualValue || !duration) return res.status(400).json({ error: 'vendorName, serviceType, annualValue, duration required' });
  const { org, exec } = await resolveExec('Lexis', res);
  const lexis = new LegalAI(org.id, exec.id);
  res.json(await lexis.draftVendorAgreement({ vendorName, serviceType, annualValue: Number(annualValue), duration, keyTerms }));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// DEVELOPER AI — Forge
// ═══════════════════════════════════════════════════════════════════════════════

/** POST /api/v1/executives/forge/generate-code */
router.post('/forge/generate-code', wrap(async (req, res) => {
  const { description, language, framework, requirements, existingContext } = req.body;
  if (!description || !language || !requirements) return res.status(400).json({ error: 'description, language, requirements required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.generateCode({ description, language, framework, requirements, existingContext }));
}));

/** POST /api/v1/executives/forge/review-code */
router.post('/forge/review-code', wrap(async (req, res) => {
  const { code, language, context, focusAreas } = req.body;
  if (!code || !language) return res.status(400).json({ error: 'code and language required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.reviewCode({ code, language, context, focusAreas }));
}));

/** POST /api/v1/executives/forge/triage-bug */
router.post('/forge/triage-bug', wrap(async (req, res) => {
  const { title, description, errorMessage, stackTrace, environment, severity } = req.body;
  if (!title || !description || !severity || !environment) return res.status(400).json({ error: 'title, description, environment, severity required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.triageBug({ title, description, errorMessage, stackTrace, environment, severity }));
}));

/** POST /api/v1/executives/forge/architecture-review */
router.post('/forge/architecture-review', wrap(async (req, res) => {
  const { description, currentStack, proposedChanges, scale, constraints } = req.body;
  if (!description || !currentStack) return res.status(400).json({ error: 'description and currentStack required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.reviewArchitecture({ description, currentStack, proposedChanges, scale, constraints }));
}));

/** POST /api/v1/executives/forge/security-audit */
router.post('/forge/security-audit', wrap(async (req, res) => {
  const { scope, codeOrConfig, knownVulnerabilities } = req.body;
  if (!scope) return res.status(400).json({ error: 'scope required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.conductSecurityAudit({ scope, codeOrConfig, knownVulnerabilities }));
}));

/** POST /api/v1/executives/forge/plan-sprint */
router.post('/forge/plan-sprint', wrap(async (req, res) => {
  const { teamSize, sprintDays, backlog, velocity } = req.body;
  if (!teamSize || !sprintDays || !backlog) return res.status(400).json({ error: 'teamSize, sprintDays, backlog required' });
  const { org, exec } = await resolveExec('Forge', res);
  const forge = new DeveloperAI(org.id, exec.id);
  res.json(await forge.planSprint({ teamSize: Number(teamSize), sprintDays: Number(sprintDays), backlog, velocity }));
}));

// ═══════════════════════════════════════════════════════════════════════════════
// INTELLIGENCE AI — Iris
// ═══════════════════════════════════════════════════════════════════════════════

/** GET /api/v1/executives/iris/intelligence-report */
router.get('/iris/intelligence-report', wrap(async (req, res) => {
  const period = (req.query.period as 'daily' | 'weekly' | 'monthly') ?? 'weekly';
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.generateIntelligenceReport(period));
}));

/** POST /api/v1/executives/iris/analyse-trends */
router.post('/iris/analyse-trends', wrap(async (req, res) => {
  const { metric, lookbackDays } = req.body;
  if (!metric) return res.status(400).json({ error: 'metric required' });
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.analyzeTrends({ metric, lookbackDays }));
}));

/** GET /api/v1/executives/iris/detect-anomalies */
router.get('/iris/detect-anomalies', wrap(async (_req, res) => {
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.detectAnomalies());
}));

/** GET /api/v1/executives/iris/revenue-forecast */
router.get('/iris/revenue-forecast', wrap(async (req, res) => {
  const months = parseInt((req.query.months as string) ?? '3', 10);
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.forecastRevenue(months));
}));

/** POST /api/v1/executives/iris/competitive-analysis */
router.post('/iris/competitive-analysis', wrap(async (req, res) => {
  const { competitors, focusArea } = req.body;
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.analyzeCompetitivePosition({ competitors, focusArea }));
}));

/** POST /api/v1/executives/iris/market-news */
router.post('/iris/market-news', wrap(async (req, res) => {
  const { topics, timeRange, numArticles } = req.body;
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.monitorMarketNews({ topics, timeRange, numArticles }));
}));

/** POST /api/v1/executives/iris/research-company */
router.post('/iris/research-company', wrap(async (req, res) => {
  const { companyName } = req.body;
  if (!companyName) return res.status(400).json({ error: 'companyName required' });
  const { org, exec } = await resolveExec('Iris', res);
  const iris = new IntelligenceAI(org.id, exec.id);
  res.json(await iris.researchCompany(companyName));
}));

export default router;
