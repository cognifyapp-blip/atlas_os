/**
 * Atlas OS — Outbound Engine
 *
 * Gives the executive team the ability to generate leads from scratch —
 * without waiting for inbound. This is what makes zero-to-client possible.
 *
 * Iris + Aria identify ideal target companies based on the ICP.
 * Zephyr creates lead records and drafts personalised outreach.
 * EmailService sends the emails when configured.
 *
 * Prospect sourcing strategy (in priority order):
 *   1. Apollo.io (APOLLO_API_KEY set) — real people from 240M+ contact DB.
 *      Step 1: People Search (free) → Step 2: Bulk Enrichment (credits).
 *   2. LLM fallback (no APOLLO_API_KEY) — AI-generated fictional prospects.
 *      Good for demos/testing. Replace with Apollo for production.
 */

import OpenAI from 'openai';
import { prisma } from '../lib/prisma.js';
import { SalesAI } from './executives/SalesAI.js';
import { MarketingAI } from './executives/MarketingAI.js';
import { emailService } from './EmailService.js';
import { eventBus } from './EventBus.js';
import { ApolloService } from './ApolloService.js';

function createAIClient(): OpenAI | null {
  const provider = process.env.AI_PROVIDER || 'openrouter';
  if (provider === 'openrouter' && process.env.OPENROUTER_API_KEY)
    return new OpenAI({ apiKey: process.env.OPENROUTER_API_KEY, baseURL: 'https://openrouter.ai/api/v1', defaultHeaders: { 'HTTP-Referer': 'https://atlas-os.local', 'X-Title': 'Atlas OS' } });
  if (provider === 'openai' && process.env.OPENAI_API_KEY)
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  if (provider === 'deepseek' && process.env.DEEPSEEK_API_KEY)
    return new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com/v1' });
  return null;
}

const aiClient = createAIClient();
const AI_MODEL = process.env.OPENROUTER_MODEL || 'deepseek/deepseek-chat';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICPDefinition {
  industry: string;
  companySize: string;
  jobTitles: string[];
  painPoints: string[];
  geographies?: string[];
  budgetRange?: string;
  excludeCompetitors?: string[];
}

export interface OutboundCampaignParams {
  organizationId: string;
  campaignName: string;
  icp: ICPDefinition;
  emailCount?: number;     // prospects to generate (default 10)
  sendEmails?: boolean;    // actually send via EmailService (default false — drafts only)
  goalId?: string;         // link to a mission goal
}

export interface ProspectRecord {
  name: string;
  email: string;
  company: string;
  title: string;
  phone?: string;
  estimatedValue: number;
  icpFitReason: string;
}

export interface OutboundResult {
  campaignName: string;
  prospectsGenerated: number;
  leadsCreated: number;
  emailsDrafted: number;
  emailsSent: number;
  leadIds: string[];
  summary: string;
}

// ─── OutboundEngine ───────────────────────────────────────────────────────────

class AtlasOutboundEngine {
  private static _instance: AtlasOutboundEngine | null = null;

  private constructor() {}

  static getInstance(): AtlasOutboundEngine {
    if (!AtlasOutboundEngine._instance) {
      AtlasOutboundEngine._instance = new AtlasOutboundEngine();
    }
    return AtlasOutboundEngine._instance;
  }

  // ─── Run a full outbound campaign ──────────────────────────────────────────

  async runCampaign(params: OutboundCampaignParams): Promise<OutboundResult> {
    if (!aiClient) throw new Error('No AI provider configured.');

    const org = await prisma.organization.findUnique({ where: { id: params.organizationId } });
    const count = params.emailCount ?? 10;

    // Step 1: Iris + Aria generate the prospect list
    const prospects = await this.generateProspects({
      org: { name: org?.name ?? '', industry: org?.industry ?? '', goals: org?.goals ?? '' },
      icp: params.icp,
      count,
    });

    // Step 2: Create lead records
    const zephyrExec = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: 'Zephyr', mode: 'insensitive' } },
    });
    const ariaExec = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: 'Aria', mode: 'insensitive' } },
    });

    const leadIds: string[] = [];
    let emailsSent = 0;
    let emailsDrafted = 0;

    for (const prospect of prospects) {
      // Check if lead already exists (avoid duplicates)
      const existing = await prisma.lead.findFirst({
        where: { organizationId: params.organizationId, email: prospect.email },
      });
      if (existing) {
        leadIds.push(existing.id);
        continue;
      }

      const lead = await prisma.lead.create({
        data: {
          organizationId: params.organizationId,
          name: prospect.name,
          company: prospect.company,
          email: prospect.email,
          phone: prospect.phone ?? null,
          value: prospect.estimatedValue,
          source: 'outbound_campaign',
          metadata: {
            campaignName: params.campaignName,
            title: prospect.title,
            icpFitReason: prospect.icpFitReason,
            goalId: params.goalId,
            outbound: true,
          },
          updatedAt: new Date(),
        },
      });
      leadIds.push(lead.id);

      // Step 3: Aria scores as MQL immediately (outbound = pre-qualified intent)
      if (ariaExec) {
        try {
          const aria = new MarketingAI(params.organizationId, ariaExec.id);
          // Score directly without requiring status = 'new' filter
          await prisma.feedEvent.create({
            data: {
              organizationId: params.organizationId,
              executiveId: ariaExec.id,
              action: 'Outbound Prospect Added',
              text: `${prospect.name} at ${prospect.company} (${prospect.title}) — ${prospect.icpFitReason}`,
              status: 'info',
            },
          });
        } catch { /* continue */ }
      }

      // Step 4: Zephyr drafts personalised outreach
      if (zephyrExec) {
        try {
          const zephyr = new SalesAI(params.organizationId, zephyrExec.id);
          const emailDraft = await this.draftPersonalisedOutreach({
            prospect,
            org: { name: org?.name ?? '', industry: org?.industry ?? '', goals: org?.goals ?? '' },
            campaignName: params.campaignName,
          });

          emailsDrafted++;

          // Step 5: Actually send if configured and sendEmails=true
          if (params.sendEmails) {
            const sendResult = await emailService.send({
              to: prospect.email,
              subject: emailDraft.subject,
              body: emailDraft.body,
            });

            if (sendResult.success && !sendResult.logged) {
              emailsSent++;
              await prisma.lead.update({
                where: { id: lead.id },
                data: {
                  status: 'new',  // outreach sent but still needs qualification — not a proposal
                  metadata: {
                    ...((lead.metadata as any) ?? {}),
                    outreachSent: true,
                    outreachSentAt: new Date().toISOString(),
                    emailProvider: sendResult.provider,
                  },
                  updatedAt: new Date(),
                },
              });

              await prisma.feedEvent.create({
                data: {
                  organizationId: params.organizationId,
                  executiveId: zephyrExec.id,
                  action: 'Outreach Email Sent',
                  text: `Email sent to ${prospect.name} at ${prospect.company} via ${sendResult.provider}.`,
                  status: 'success',
                },
              });
            }
          } else {
            // Store draft in memory for later sending
            await prisma.memory.create({
              data: {
                organizationId: params.organizationId,
                executiveId: zephyrExec.id,
                text: `[OUTREACH DRAFT] To: ${prospect.email} (${prospect.name}, ${prospect.company})\nSubject: ${emailDraft.subject}\n\n${emailDraft.body}`,
                type: 'document',
                actor: 'Zephyr (Sales AI)',
                sourceSystem: 'Outbound Engine',
                tags: ['outbound', 'email-draft', params.campaignName.toLowerCase().replace(/\s+/g, '-'), lead.id],
                updatedAt: new Date(),
              },
            });
          }
        } catch (err: any) {
          console.error(`[OutboundEngine] Email draft failed for ${prospect.email}: ${err.message}`);
        }
      }
    }

    // Step 6: Campaign summary feed event
    const atlasExec = await prisma.aIExecutive.findFirst({
      where: { organizationId: params.organizationId, name: { contains: 'Atlas', mode: 'insensitive' } },
    });

    const summary = `Outbound campaign "${params.campaignName}": ${leadIds.length} prospects created, ${emailsDrafted} emails drafted${emailsSent > 0 ? `, ${emailsSent} sent` : ' (configure RESEND_API_KEY to send)'}.`;

    if (atlasExec) {
      await prisma.feedEvent.create({
        data: {
          organizationId: params.organizationId,
          executiveId: atlasExec.id,
          action: 'Outbound Campaign Complete',
          text: summary,
          status: 'success',
        },
      });
    }

    // Qualify all leads in parallel (max 5 concurrent to avoid LLM rate limits)
    const QUALIFY_CONCURRENCY = 5;
    for (let i = 0; i < leadIds.length; i += QUALIFY_CONCURRENCY) {
      const batch = leadIds.slice(i, i + QUALIFY_CONCURRENCY);
      await Promise.allSettled(
        batch.map(async (leadId) => {
          try {
            if (!zephyrExec) return;
            const zephyr = new SalesAI(params.organizationId, zephyrExec.id);
            const { qualification } = await zephyr.qualifyLead(leadId);
            if (qualification.score >= 70) {
              eventBus.publish('lead.qualified', {
                organizationId: params.organizationId,
                leadId,
                score: qualification.score,
                estimatedValue: qualification.estimatedValue,
                executiveId: zephyrExec.id,
              });
            }
          } catch { /* qualification errors are non-fatal */ }
        }),
      );
    }

    return {
      campaignName: params.campaignName,
      prospectsGenerated: prospects.length,
      leadsCreated: leadIds.length,
      emailsDrafted,
      emailsSent,
      leadIds,
      summary,
    };
  }

  // ─── Generate prospect list ────────────────────────────────────────────────
  // Uses Apollo.io if APOLLO_API_KEY is set (real people, real emails).
  // Falls back to LLM-generated fictional prospects for demos/testing.

  async generateProspects(params: {
    org: { name: string; industry: string; goals: string };
    icp: ICPDefinition;
    count: number;
  }): Promise<ProspectRecord[]> {

    // ── Apollo path (production) ────────────────────────────────────────────
    if (ApolloService.isConfigured()) {
      console.log('[OutboundEngine] Apollo API key detected — using real contact data.');
      try {
        const apollo = new ApolloService();
        const prospects = await apollo.findProspects({
          icp: params.icp,
          count: params.count,
          orgName: params.org.name,
        });

        if (prospects.length > 0) {
          console.log(`[OutboundEngine] Apollo returned ${prospects.length} real prospects.`);
          return prospects;
        }

        // Apollo returned nothing (very narrow ICP) — fall through to LLM
        console.warn('[OutboundEngine] Apollo returned 0 prospects. Falling back to LLM generation. Try broadening ICP filters.');
      } catch (err: any) {
        console.error(`[OutboundEngine] Apollo search failed: ${err.message}. Falling back to LLM.`);
      }
    }

    // ── LLM fallback (demo / no Apollo key) ────────────────────────────────
    console.log('[OutboundEngine] Using LLM-generated fictional prospects (set APOLLO_API_KEY for real contacts).');
    if (!aiClient) throw new Error('No AI provider configured. Set OPENROUTER_API_KEY or APOLLO_API_KEY.');

    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{
        role: 'user',
        content: `You are Iris, Intelligence AI for ${params.org.name}.

Generate ${params.count} realistic B2B prospect records that match this Ideal Customer Profile:
- Industry: ${params.icp.industry}
- Company size: ${params.icp.companySize}
- Target job titles: ${params.icp.jobTitles.join(', ')}
- Pain points we solve: ${params.icp.painPoints.join(', ')}
- Geographies: ${params.icp.geographies?.join(', ') ?? 'Global'}
- Budget range: ${params.icp.budgetRange ?? 'Mid-market'}

Our company: ${params.org.name}, ${params.org.industry} industry.
Our value prop addresses: ${params.org.goals}

Generate realistic but fictional prospects. Use plausible names, company names, and professional email formats (firstname@company.com).

Return JSON:
{
  "prospects": [
    {
      "name": "Full name",
      "email": "professional@company.com",
      "company": "Company Name",
      "title": "Job title",
      "phone": "+1 555 000 0000",
      "estimatedValue": (realistic deal value in USD based on company size),
      "icpFitReason": "1-sentence reason this prospect fits our ICP perfectly"
    }
  ]
}`,
      }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    let raw: any;
    try {
      const parsed = JSON.parse(completion.choices[0]?.message?.content ?? '{}');
      raw = Array.isArray(parsed) ? parsed : (parsed.prospects ?? parsed.data ?? []);
    } catch {
      raw = [];
    }

    return raw.slice(0, params.count).map((p: any) => ({
      name: p.name ?? 'Unknown',
      email: p.email ?? `prospect${Date.now()}@example.com`,
      company: p.company ?? 'Unknown Company',
      title: p.title ?? 'Decision Maker',
      phone: p.phone,
      estimatedValue: p.estimatedValue ?? 25000,
      icpFitReason: p.icpFitReason ?? 'Matches ICP criteria',
    }));
  }

  // ─── Draft personalised outreach ──────────────────────────────────────────

  private async draftPersonalisedOutreach(params: {
    prospect: ProspectRecord;
    org: { name: string; industry: string; goals: string };
    campaignName: string;
  }): Promise<{ subject: string; body: string }> {
    if (!aiClient) return { subject: `Quick question, ${params.prospect.name}`, body: '' };

    const completion = await aiClient.chat.completions.create({
      model: AI_MODEL,
      messages: [{
        role: 'user',
        content: `You are Zephyr, Sales AI for ${params.org.name}.

Draft a cold outreach email to:
- Name: ${params.prospect.name}
- Title: ${params.prospect.title}
- Company: ${params.prospect.company}
- Why they fit: ${params.prospect.icpFitReason}

Our company: ${params.org.name}, ${params.org.industry}.
Campaign: ${params.campaignName}

Rules:
- Max 120 words in the body
- No generic openers ("I hope this email finds you well")
- Reference their specific situation (use the icpFitReason)
- One clear call to action (15-minute call)
- Feels human, not like a template
- First-name basis

Return JSON: {"subject": "Subject line", "body": "Email body (plain text)"}`,
      }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    try {
      return JSON.parse(completion.choices[0]?.message?.content ?? '{}');
    } catch {
      return {
        subject: `Quick question for ${params.prospect.name}`,
        body: `Hi ${params.prospect.name.split(' ')[0]},\n\nI noticed ${params.prospect.company} might be dealing with ${params.prospect.icpFitReason}.\n\n${params.org.name} helps companies like yours with exactly this. Worth a 15-minute call?\n\nBest,\nZephyr`,
      };
    }
  }
}

export const outboundEngine = AtlasOutboundEngine.getInstance();
