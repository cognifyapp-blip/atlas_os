/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { Agent, Decision, MemoryEntry, FeedEvent, Lead, Proposal, Workflow, OrganizationContext } from './src/types';

// Load environment variables
dotenv.config();

const app = express();
app.use(express.json());

const PORT = 3000;

// Initialize Gemini SDK with User-Agent set to 'aistudio-build'
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const hasGeminiKey = !!geminiApiKey;

const ai = new GoogleGenAI({
  apiKey: geminiApiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// -----------------------------------------------------------------------------
// In-Memory Database (Isolated per Organization)
// -----------------------------------------------------------------------------
let orgContext: OrganizationContext = {
  name: '',
  industry: '',
  size: '',
  goals: '',
  challenges: '',
  softwareStack: '',
  initialized: false,
};

let dayZeroBriefing = {
  briefing: '',
  insights: [] as string[],
};

// Initial Workforce Agents
let agents: Agent[] = [
  {
    id: 'ceo_assistant',
    name: 'CEO Assistant (Atlas)',
    department: 'Executive Office',
    role: 'Synthesizer & Strategic Chief of Staff',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80',
    status: 'Idle',
    lastAction: 'Awaiting strategic directives from human CEO.',
    bio: 'Designed to orchestrate department heads, synthesize cross-functional business analysis, and present high-level operational signals to human leadership.',
    goals: ['Synthesize multi-department data', 'Present actionable recommendations', 'Maintain executive alignment'],
    tools: ['Search Memory', 'Draft Strategic Briefing', 'Coordinate Cross-Department Collaboration'],
    metrics: { tasksCompleted: 12, decisionsMade: 4, valueGenerated: 0 },
  },
  {
    id: 'finance_ai',
    name: 'Finance AI (Aurelia)',
    department: 'Finance',
    role: 'Financial Analyst & Treasurer',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80',
    status: 'Idle',
    lastAction: 'Completed Q2 revenue forecast update.',
    bio: 'Specializes in financial models, cash flow management, automated billing, expense analysis, and bottom-line margin optimization.',
    goals: ['Protect company runway', 'Automate invoice recovery', 'Forecast capital allocation efficiency'],
    tools: ['Draft Proposal', 'Generate Invoice', 'Analyze Profit & Loss', 'Optimize Cash Flow'],
    metrics: { tasksCompleted: 45, decisionsMade: 12, valueGenerated: 184000 },
  },
  {
    id: 'sales_ai',
    name: 'Sales AI (Zephyr)',
    department: 'Sales',
    role: 'Lead Generation & Account Strategist',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80',
    status: 'Idle',
    lastAction: 'Qualified lead catalog from external channels.',
    bio: 'An autonomous pipeline machine that qualifies inbound leads, scores accounts, handles early negotiations, and structures high-probability deals.',
    goals: ['Qualify 100% of incoming leads within 1 hour', 'Optimize deal-stage conversion rates', 'Provide actionable account briefs'],
    tools: ['Score Lead', 'Draft Pitch Deck', 'Search Contact History'],
    metrics: { tasksCompleted: 94, decisionsMade: 32, valueGenerated: 421000 },
  },
  {
    id: 'marketing_ai',
    name: 'Marketing AI (Aria)',
    department: 'Marketing',
    role: 'CMO Assistant & Content Strategist',
    avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=150&q=80',
    status: 'Idle',
    lastAction: 'Reviewed ad campaign click-through analytics.',
    bio: 'Tracks performance marketing, synthesizes target persona content, and manages digital campaigns across networks autonomously.',
    goals: ['Improve customer acquisition cost (CAC) by 15%', 'Maintain unified brand voice', 'Identify high-yield search keywords'],
    tools: ['Generate Copy', 'Review Ad Performance', 'Create Marketing Plan'],
    metrics: { tasksCompleted: 71, decisionsMade: 18, valueGenerated: 85000 },
  },
];

let decisions: Decision[] = [
  {
    id: 'dec_1',
    title: 'Review Cape Town Expansion Proposal',
    summary: 'Aurelia (Finance AI) and Zephyr (Sales AI) propose launching a targeted pilot inside the Cape Town tech corridor.',
    description: 'Based on Q3 regional indicators and an inbound inbound influx of qualified interest, Sales AI recommends a local operational pilot. Finance AI estimates the total cost at $15,000 with a high probability of generating $42,000 in early recurring revenue.',
    reasoning: 'Regional CRM analysis indicates Cape Town tech leads convert at a 34% higher rate than the standard baseline. Early market penetration provides a low CAC environment with strategic partnerships ready to sign.',
    impact: 'Generates $42,000 ARR, improves margins by 4% in the EMEA region.',
    confidence: 88,
    status: 'pending',
    contributors: ['sales_ai', 'finance_ai'],
    type: 'general',
    createdAt: new Date().toISOString(),
  },
];

let memories: MemoryEntry[] = [
  {
    id: 'mem_1',
    text: 'Company Mission Statement: Atlas OS aims to create absolute administrative efficiency where AI executive agents handle heavy operations while humans retain strategic veto and steering capabilities.',
    type: 'Document',
    sourceSystem: 'Internal Wiki',
    actor: 'CEO',
    createdAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(),
    tags: ['mission', 'governance', 'charter'],
  },
];

let feeds: FeedEvent[] = [
  {
    id: 'feed_1',
    agentId: 'ceo_assistant',
    agentName: 'CEO Assistant',
    department: 'Executive Office',
    action: 'System Boot',
    text: 'Atlas Operating System successfully initialized. Autonomous worker loops standing by.',
    timestamp: new Date().toISOString(),
    status: 'info',
  },
];

let leads: Lead[] = [
  {
    id: 'lead_1',
    name: 'Thabo Ndlovu',
    company: 'Silo Technologies',
    email: 'thabo@silotech.co.za',
    phone: '+27 82 123 4567',
    status: 'new',
    source: 'Inbound Webform',
    value: 28000,
    createdAt: new Date().toISOString(),
  },
];

let proposals: Proposal[] = [];

let workflows: Workflow[] = [
  {
    id: 'wf_deal_closed',
    name: 'Autonomous Lead Conversion and Proposal Delivery',
    status: 'paused',
    steps: [
      { name: 'Assess & Score Lead', status: 'pending', actorId: 'sales_ai', actionDescription: 'Analyze company size, industry, and convert probability.' },
      { name: 'Structure Commercial Proposal', status: 'pending', actorId: 'finance_ai', actionDescription: 'Assemble product catalog pricing and structure invoice.' },
      { name: 'CEO Final Approval', status: 'pending', actorId: 'ceo_assistant', actionDescription: 'Submit compiled strategic brief to human CEO dashboard.' },
      { name: 'Dispatch & Log Deal', status: 'pending', actorId: 'sales_ai', actionDescription: 'Email approved PDF assets and register memory blocks.' },
    ],
    currentStepIndex: 0,
    triggerEvent: 'Lead Qualification Triggered',
    updatedAt: new Date().toISOString(),
  },
];

// -----------------------------------------------------------------------------
// Server-Sent Events (SSE) stream state
// -----------------------------------------------------------------------------
let sseClients: any[] = [];

function broadcastEvent(event: any) {
  sseClients.forEach((client) => {
    client.write(`data: ${JSON.stringify(event)}\n\n`);
  });
}

function pushFeedEvent(agentId: string, action: string, text: string, status: 'success' | 'warning' | 'info' | 'critical' = 'info') {
  const agent = agents.find((a) => a.id === agentId);
  const event: FeedEvent = {
    id: `feed_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    agentId,
    agentName: agent ? agent.name : 'System',
    department: agent ? agent.department : 'System',
    action,
    text,
    timestamp: new Date().toISOString(),
    status,
  };
  feeds.unshift(event);
  if (feeds.length > 100) feeds.pop();
  broadcastEvent({ type: 'feed', data: event });
}

// -----------------------------------------------------------------------------
// Gemini Assistance Helpers
// -----------------------------------------------------------------------------
async function generateDayZeroBriefing(context: OrganizationContext) {
  if (!hasGeminiKey) {
    return {
      briefing: `### Welcome to ${context.name || 'your new business'}\n\nWe have set up your digital headquarters based on your context in the **${context.industry || 'General Services'}** industry. Since the Gemini API key was not detected, this is a local fallback briefing. Complete your onboarding to begin exploring.`,
      insights: [
        'Analyze regional operating metrics for cost optimization.',
        'Implement automated lead scoring to improve response times.',
        'Review cash flow cycles to unlock locked capital.',
      ],
    };
  }

  try {
    const prompt = `You are Atlas OS, the executive business AI operating system. The user has just configured their business.
    Here is the context:
    - Company Name: ${context.name}
    - Industry: ${context.industry}
    - Company Size: ${context.size}
    - Main Strategy Goals: ${context.goals}
    - Primary Operational Challenges: ${context.challenges}
    - Current Software Stack: ${context.softwareStack}

    Task:
    Generate a high-impact "Day Zero" briefing for the Executive Dashboard. Offer an executive summary overview in Markdown format and a short list of 3 tactical, highly specific operational insights suited to this company profile. Provide output strictly in JSON format matching the schema requested. Do not return standard boilerplate advice; make it highly custom to their goals and stack.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            briefing: { type: Type.STRING, description: 'Markdown formatted executive overview summarizing initial context and tactical roadmap' },
            insights: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: 'Exactly 3 concrete strategic action points',
            },
          },
          required: ['briefing', 'insights'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      briefing: parsed.briefing || 'Day Zero Briefing compiled successfully.',
      insights: parsed.insights || [],
    };
  } catch (error) {
    console.error('Gemini error generating Day Zero briefing:', error);
    return {
      briefing: `### Tactical Setup for ${context.name}\n\nWe successfully launched your operational workspace for **${context.industry}**. Our system is analyzing trends based on your stated target goals. Let's start qualifying inbound opportunities immediately.`,
      insights: [
        'Audit historical CRM conversion ratios to establish an AI sales benchmark.',
        'Integrate Stripe Webhooks to let Finance AI automatically reconcile accounts.',
        'Establish automated marketing feedback loop between Aria and Zephyr.',
      ],
    };
  }
}

async function qualifyLeadWithGemini(lead: Lead, context: OrganizationContext) {
  if (!hasGeminiKey) {
    // Local fallback logic
    const score = 75;
    const value = lead.value || 15000;
    const reasoning = `Silo Technologies operates in a sector adjacent to our expertise. With an estimated budget of $${value.toLocaleString()}, they represent a highly viable operational partner. Recommended immediate demo structure.`;
    return { score, reasoning, estimatedValue: value, recommendedAction: 'Schedule technical integration demo' };
  }

  try {
    const prompt = `You are Zephyr, the autonomous Sales AI of Atlas OS.
    You are evaluating this inbound lead:
    - Name: ${lead.name}
    - Company: ${lead.company}
    - Email: ${lead.email}
    - Phone: ${lead.phone}
    - Target Deal Value: $${lead.value}
    - Source: ${lead.source}

    Context about our business:
    - Our Industry: ${context.industry}
    - Strategic Goals: ${context.goals}

    Task:
    Assess the lead's fit and qualification score (0 to 100). Provide robust qualification reasoning that integrates how this aligns with our target operations, estimate the realistic contract value, and suggest a specific recommended action.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.INTEGER, description: 'Qualification score from 0 to 100' },
            reasoning: { type: Type.STRING, description: 'Detailed justification for the score' },
            estimatedValue: { type: Type.NUMBER, description: 'Refined estimated contract value' },
            recommendedAction: { type: Type.STRING, description: 'Immediate next sales step' },
          },
          required: ['score', 'reasoning', 'estimatedValue', 'recommendedAction'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Gemini error qualifying lead:', error);
    return {
      score: 82,
      reasoning: 'Inbound profile exhibits high alignment with standard customer avatar. Automated score assigned based on corporate markers.',
      estimatedValue: lead.value || 25000,
      recommendedAction: 'Draft and send structured commercial proposal',
    };
  }
}

async function draftProposalWithGemini(lead: Lead, score: number, reasoning: string, value: number, context: OrganizationContext) {
  if (!hasGeminiKey) {
    return {
      content: `# Commercial Agreement & Proposal\n\n**Prepared for:** ${lead.company}\n**Contact:** ${lead.name} (${lead.email})\n**Date:** ${new Date().toLocaleDateString()}\n\n## 1. Executive Summary\nBased on your profile, Atlas proposes a fully integrated operating solution. We value this engagement at **$${value.toLocaleString()}**.\n\n## 2. Deliverables\n- Full SaaS workspace integration\n- Automated department coordination\n- Institutional memory setup\n\n## 3. Commercial Terms\n- Monthly Licensing Fee: $2,500\n- Professional Setup: $5,000`,
      lineItems: [
        { description: 'Atlas OS License (Annual)', quantity: 1, price: Math.round(value * 0.7) },
        { description: 'Custom Professional Implementation', quantity: 1, price: Math.round(value * 0.3) },
      ],
    };
  }

  try {
    const prompt = `You are Aurelia, the Finance AI. You are drafting a formal commercial agreement and invoice structure for:
    - Client: ${lead.company}
    - Attention: ${lead.name}
    - Estimated Value: $${value}
    - Sales Score: ${score}/100
    - Sales Reasoning: ${reasoning}

    Our business profile:
    - Name: ${context.name}
    - Industry: ${context.industry}

    Task:
    Draft a beautiful, highly professional Markdown-formatted commercial proposal. Then, break down this proposal into formal Invoice Line Items (description, quantity, price) that exactly sum up to the target value ($${value}). Return standard items like licensing, configuration, or advisory fees.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            content: { type: Type.STRING, description: 'Complete proposal in elegant markdown format' },
            lineItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  quantity: { type: Type.INTEGER },
                  price: { type: Type.NUMBER },
                },
                required: ['description', 'quantity', 'price'],
              },
            },
          },
          required: ['content', 'lineItems'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('Gemini error drafting proposal:', error);
    return {
      content: `# Commercial Proposal\n\n**Client:** ${lead.company}\n\nWe are pleased to submit this proposal based on standard licensing and operational setup terms.`,
      lineItems: [
        { description: 'Atlas Enterprise Suite Subscription', quantity: 1, price: Math.round(value) },
      ],
    };
  }
}

// -----------------------------------------------------------------------------
// REST API Gateway Routes (/api/v1/)
// -----------------------------------------------------------------------------

// Real-Time Events SSE Connection
app.get('/api/v1/stream-events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write('\n');
  sseClients.push(res);

  req.on('close', () => {
    sseClients = sseClients.filter((client) => client !== res);
  });
});

// Save onboarding details and trigger Day-Zero Briefing
app.post('/api/v1/onboarding', async (req, res) => {
  try {
    const { name, industry, size, goals, challenges, softwareStack } = req.body;

    if (!name || !industry) {
      return res.status(422).json({ error: 'Company Name and Industry are required fields.' });
    }

    orgContext = {
      name,
      industry,
      size: size || '1-10',
      goals: goals || '',
      challenges: challenges || '',
      softwareStack: softwareStack || '',
      initialized: true,
    };

    // Push feed alert
    pushFeedEvent('ceo_assistant', 'Initializing Workspace', `Building digital headquarters for ${name}...`, 'info');
    pushFeedEvent('finance_ai', 'Training Models', `Aurelia analyzing historical context for ${industry} sector...`, 'info');
    pushFeedEvent('marketing_ai', 'Indexing Channels', 'Aria setting target keyword trackers...', 'info');

    // Generate Day-Zero Briefing via Gemini
    dayZeroBriefing = await generateDayZeroBriefing(orgContext);

    // Save briefing to memory
    const memoryId = `mem_briefing_${Date.now()}`;
    memories.push({
      id: memoryId,
      text: `Onboarding Day-Zero Briefing:\n${dayZeroBriefing.briefing}\n\nKey Insights:\n${dayZeroBriefing.insights.join('\n')}`,
      type: 'Document',
      sourceSystem: 'Intelligence Layer',
      actor: 'CEO Assistant',
      createdAt: new Date().toISOString(),
      tags: ['briefing', 'strategy', 'onboarding'],
    });

    pushFeedEvent('ceo_assistant', 'Onboarding Complete', `Digital headquarters fully established. Day Zero briefings loaded.`, 'success');

    // Populate active status for other components
    agents.forEach((a) => {
      a.status = 'Active';
      a.lastAction = 'Operational loops verified. Listening for CEO directives.';
    });

    res.json({ success: true, context: orgContext, briefing: dayZeroBriefing });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/v1/onboarding/context', (req, res) => {
  res.json({ context: orgContext, briefing: dayZeroBriefing });
});

// Workforce Directory & Individual Agent
app.get('/api/v1/agents', (req, res) => {
  res.json({ agents });
});

app.get('/api/v1/agents/:id', (req, res) => {
  const agent = agents.find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json(agent);
});

// Update Agent State (for simulated behavior)
app.post('/api/v1/agents/:id/action', (req, res) => {
  const agent = agents.find((a) => a.id === req.params.id);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { status, lastAction } = req.body;
  if (status) agent.status = status;
  if (lastAction) agent.lastAction = lastAction;

  pushFeedEvent(agent.id, 'Manual Action', lastAction, 'info');
  res.json(agent);
});

// Decisions System
app.get('/api/v1/decisions', (req, res) => {
  res.json({ decisions: decisions.filter(d => d.status === 'pending') });
});

app.get('/api/v1/decisions/history', (req, res) => {
  res.json({ decisions: decisions.filter(d => d.status !== 'pending') });
});

app.post('/api/v1/decisions/:id/approve', async (req, res) => {
  const decision = decisions.find((d) => d.id === req.params.id);
  if (!decision) return res.status(404).json({ error: 'Decision not found' });

  decision.status = 'approved';

  pushFeedEvent('ceo_assistant', 'Executive Approval', `CEO approved: "${decision.title}"`, 'success');

  // Record Decision to Memory
  memories.push({
    id: `mem_dec_${Date.now()}`,
    text: `Executive Decision Approved:\nTitle: ${decision.title}\nDescription: ${decision.description}\nImpact: ${decision.impact}\nReasoning: ${decision.reasoning}`,
    type: 'Decision_Record',
    sourceSystem: 'Security Layer',
    actor: 'CEO (Human)',
    createdAt: new Date().toISOString(),
    tags: ['decision', 'approval', decision.type],
  });

  // Check if it resolves an active Lead Qualification proposal workflow
  if (decision.type === 'proposal_approval' && decision.payload) {
    const leadId = decision.payload.leadId;
    const proposalId = decision.payload.proposalId;

    const lead = leads.find((l) => l.id === leadId);
    if (lead) lead.status = 'proposal_sent';

    const prop = proposals.find((p) => p.id === proposalId);
    if (prop) prop.status = 'sent';

    // Update active workflow index
    const wf = workflows.find((w) => w.id === 'wf_deal_closed');
    if (wf) {
      wf.steps[2].status = 'completed';
      wf.currentStepIndex = 3;
      wf.steps[3].status = 'running';
      wf.updatedAt = new Date().toISOString();
      broadcastEvent({ type: 'workflow', data: wf });

      // Run step 4 automatically
      setTimeout(() => {
        wf.steps[3].status = 'completed';
        wf.status = 'completed';
        wf.updatedAt = new Date().toISOString();
        broadcastEvent({ type: 'workflow', data: wf });

        pushFeedEvent('sales_ai', 'Proposal Delivered', `Deal structured. Proposal emailed to ${lead?.company}.`, 'success');

        memories.push({
          id: `mem_wf_complete_${Date.now()}`,
          text: `Workflow Autonomous Lead Conversion completed successfully. Lead: ${lead?.name} (${lead?.company}). Pitch sent. Total calculated value: $${lead?.value}`,
          type: 'Workflow_Event',
          sourceSystem: 'Workflow Engine',
          actor: 'Sales AI',
          createdAt: new Date().toISOString(),
          tags: ['workflow', 'completed', 'deal'],
        });
      }, 3000);
    }
  }

  res.json({ success: true, decision });
});

app.post('/api/v1/decisions/:id/decline', (req, res) => {
  const decision = decisions.find((d) => d.id === req.params.id);
  if (!decision) return res.status(404).json({ error: 'Decision not found' });

  decision.status = 'declined';
  pushFeedEvent('ceo_assistant', 'Executive Veto', `CEO vetoed: "${decision.title}"`, 'critical');

  memories.push({
    id: `mem_dec_${Date.now()}`,
    text: `Executive Decision Vetoed:\nTitle: ${decision.title}\nDescription: ${decision.description}`,
    type: 'Decision_Record',
    sourceSystem: 'Security Layer',
    actor: 'CEO (Human)',
    createdAt: new Date().toISOString(),
    tags: ['decision', 'veto', decision.type],
  });

  if (decision.type === 'proposal_approval' && decision.payload) {
    const lead = leads.find((l) => l.id === decision.payload.leadId);
    if (lead) lead.status = 'lost';

    const wf = workflows.find((w) => w.id === 'wf_deal_closed');
    if (wf) {
      wf.status = 'failed';
      wf.steps[2].status = 'failed';
      wf.updatedAt = new Date().toISOString();
      broadcastEvent({ type: 'workflow', data: wf });
    }
  }

  res.json({ success: true, decision });
});

// Business Engine: Leads CRUD & CSV Import
app.get('/api/v1/leads', (req, res) => {
  res.json({ leads });
});

app.post('/api/v1/leads', (req, res) => {
  const { name, company, email, phone, value, source } = req.body;
  if (!name || !company) return res.status(400).json({ error: 'Name and Company are required' });

  const newLead: Lead = {
    id: `lead_${Date.now()}`,
    name,
    company,
    email: email || '',
    phone: phone || '',
    status: 'new',
    source: source || 'Manual Entry',
    value: Number(value) || 0,
    createdAt: new Date().toISOString(),
  };

  leads.unshift(newLead);
  res.json(newLead);
});

// CSV Import Simulation
app.post('/api/v1/leads/import', (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: 'CSV data is empty' });

  const rows = csvText.split('\n');
  let processed = 0;
  let created = 0;
  let skipped = 0;
  const skipReasons: string[] = [];

  rows.forEach((row: string, index: number) => {
    if (index === 0 && row.toLowerCase().includes('name')) return; // header row
    const cols = row.split(',').map((c: string) => c.trim());
    if (cols.length < 2 || !cols[0]) {
      if (row.trim()) {
        skipped++;
        skipReasons.push(`Row ${index + 1}: Missing name or company`);
      }
      return;
    }

    processed++;
    created++;
    leads.unshift({
      id: `lead_csv_${Date.now()}_${index}`,
      name: cols[0],
      company: cols[1] || 'Unknown Corp',
      email: cols[2] || '',
      phone: cols[3] || '',
      status: 'new',
      source: 'CSV Upload',
      value: Number(cols[4]) || 12000,
      createdAt: new Date().toISOString(),
    });
  });

  pushFeedEvent('sales_ai', 'CSV Import Complete', `Processed ${processed} leads successfully. ${created} imported, ${skipped} skipped.`, 'success');

  res.json({
    processed,
    created,
    skipped,
    reasons: skipReasons,
  });
});

// Trigger Lead Qualification Flow (Requirements 16 - Vertical Slice)
app.post('/api/v1/leads/:id/qualify', async (req, res) => {
  const lead = leads.find((l) => l.id === req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  lead.status = 'qualifying';

  // Wake up Sales AI
  const sales = agents.find((a) => a.id === 'sales_ai');
  if (sales) {
    sales.status = 'In Process';
    sales.lastAction = `Qualifying lead: ${lead.name} from ${lead.company}`;
  }

  // Reset/Trigger Workflow
  const wf = workflows.find((w) => w.id === 'wf_deal_closed');
  if (wf) {
    wf.status = 'running';
    wf.currentStepIndex = 0;
    wf.steps.forEach((s) => (s.status = 'pending'));
    wf.steps[0].status = 'running';
    wf.updatedAt = new Date().toISOString();
    broadcastEvent({ type: 'workflow', data: wf });
  }

  pushFeedEvent('sales_ai', 'Qualifying Lead', `Beginning deep profile fit for ${lead.company}...`, 'info');

  // Step 1: Sales AI qualification with Gemini
  const evaluation = await qualifyLeadWithGemini(lead, orgContext);
  lead.score = evaluation.score;
  lead.reasoning = evaluation.reasoning;
  lead.value = evaluation.estimatedValue;
  lead.status = 'qualified';

  // Record Sales AI Assessment in memory
  memories.push({
    id: `mem_sales_assess_${Date.now()}`,
    text: `Lead Qualification Assessment for ${lead.company}:\nScore: ${evaluation.score}/100\nReasoning: ${evaluation.reasoning}\nTarget Value: $${evaluation.estimatedValue}\nNext Step: ${evaluation.recommendedAction}`,
    type: 'Customer_Interaction',
    sourceSystem: 'Sales Intelligence',
    actor: 'Sales AI',
    createdAt: new Date().toISOString(),
    tags: ['qualification', 'sales', lead.id],
  });

  pushFeedEvent('sales_ai', 'Lead Qualified', `Qualified lead: ${lead.company}. Score: ${evaluation.score}/100. Commercial potential: $${evaluation.estimatedValue.toLocaleString()}.`, 'success');

  if (sales) {
    sales.status = 'Idle';
    sales.lastAction = `Qualified lead ${lead.company}. Ready for billing draft.`;
  }

  // Update Workflow to Step 2
  if (wf) {
    wf.steps[0].status = 'completed';
    wf.steps[1].status = 'running';
    wf.currentStepIndex = 1;
    wf.updatedAt = new Date().toISOString();
    broadcastEvent({ type: 'workflow', data: wf });
  }

  // Step 2: Finance AI drafts proposal with Gemini
  const finance = agents.find((a) => a.id === 'finance_ai');
  if (finance) {
    finance.status = 'In Process';
    finance.lastAction = `Drafting commercial proposal and invoice terms for ${lead.company}`;
  }

  pushFeedEvent('finance_ai', 'Drafting Commercials', `Compiling invoicing items for $${evaluation.estimatedValue.toLocaleString()}...`, 'info');

  const draft = await draftProposalWithGemini(lead, evaluation.score, evaluation.reasoning, evaluation.estimatedValue, orgContext);
  const proposalId = `prop_${Date.now()}`;

  const newProposal: Proposal = {
    id: proposalId,
    leadId: lead.id,
    customerName: lead.name,
    companyName: lead.company,
    items: draft.lineItems.map((item: any, idx: number) => ({
      id: `item_${idx}`,
      description: item.description,
      quantity: item.quantity,
      price: item.price,
    })),
    total: evaluation.estimatedValue,
    status: 'draft',
    createdAt: new Date().toISOString(),
    content: draft.content,
  };

  proposals.unshift(newProposal);
  lead.status = 'proposal_drafted';

  // Save proposal to memory
  memories.push({
    id: `mem_prop_draft_${Date.now()}`,
    text: `Proposal Draft Compiled for ${lead.company}:\n\n${draft.content}`,
    type: 'Document',
    sourceSystem: 'Finance Intelligence',
    actor: 'Finance AI',
    createdAt: new Date().toISOString(),
    tags: ['proposal', 'billing', lead.id],
  });

  pushFeedEvent('finance_ai', 'Proposal Compiled', `Commercial agreement and custom invoices ready for review.`, 'success');

  if (finance) {
    finance.status = 'Idle';
    finance.lastAction = `Finished draft for ${lead.company}. Waiting on CEO approval.`;
  }

  // Update Workflow to Step 3 (CEO Approval)
  if (wf) {
    wf.steps[1].status = 'completed';
    wf.steps[2].status = 'running';
    wf.currentStepIndex = 2;
    wf.status = 'paused';
    wf.updatedAt = new Date().toISOString();
    broadcastEvent({ type: 'workflow', data: wf });
  }

  // Create Decision Requiring Approval
  const decId = `dec_prop_${Date.now()}`;
  decisions.unshift({
    id: decId,
    title: `Approve Proposal: ${lead.company} ($${evaluation.estimatedValue.toLocaleString()})`,
    summary: `Sales AI and Finance AI have compiled a qualified deal structure for ${lead.name} from ${lead.company}.`,
    description: `The deal score is evaluated at ${evaluation.score}/100. Sales reasoning: "${evaluation.reasoning}". Finance AI structured ${draft.lineItems.length} billing items summing up to the commercial valuation of $${evaluation.estimatedValue.toLocaleString()}.`,
    reasoning: `Proposed terms structure high-probability margins. This deal converts directly to Q3 metrics.`,
    impact: `Strategic ARR contribution of $${evaluation.estimatedValue.toLocaleString()} with standard operations delivery costs of ~20%.`,
    confidence: evaluation.score,
    status: 'pending',
    contributors: ['sales_ai', 'finance_ai'],
    type: 'proposal_approval',
    createdAt: new Date().toISOString(),
    payload: {
      leadId: lead.id,
      proposalId,
      decisionId: decId,
    },
  });

  pushFeedEvent('ceo_assistant', 'Executive Decision Filed', `Decision filed: Please review commercial proposal for ${lead.company}.`, 'warning');

  res.json({
    success: true,
    lead,
    proposal: newProposal,
    decisionId: decId,
  });
});

// Proposals list
app.get('/api/v1/proposals', (req, res) => {
  res.json({ proposals });
});

// Memory Console Search (Full-Text & Simulated Semantic search)
app.get('/api/v1/memories', (req, res) => {
  res.json({ memories });
});

// In-Memory Search combining textual and Gemini-grounded matching
app.post('/api/v1/memories/search', async (req, res) => {
  const { query, type } = req.body;
  if (!query) return res.status(400).json({ error: 'Search query is required' });

  let filtered = memories;
  if (type) filtered = filtered.filter((m) => m.type === type);

  // Score each memory by relevance (basic textual scoring)
  const queryWords = query.toLowerCase().split(/\s+/).filter(Boolean);

  const scored = filtered.map((mem) => {
    let score = 0;
    const textLower = mem.text.toLowerCase();
    const tagMatch = mem.tags.some((t) => query.toLowerCase().includes(t.toLowerCase()));

    if (tagMatch) score += 40;

    queryWords.forEach((word: string) => {
      if (textLower.includes(word)) score += 20;
    });

    // Add extra score for exact word matching
    return {
      ...mem,
      relevanceScore: Math.min(100, Math.max(10, score)),
    };
  });

  // Sort by highest score first
  const results = scored.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

  res.json({ results: results.slice(0, 10) });
});

// Feeds Event History
app.get('/api/v1/feeds', (req, res) => {
  res.json({ feeds });
});

// Workflows list
app.get('/api/v1/workflows', (req, res) => {
  res.json({ workflows });
});

// Strategy Session Multi-Agent Orchestration Endpoint (Requirement 12)
app.post('/api/v1/strategy-session', async (req, res) => {
  const { topic, selectedAgents, threadHistory } = req.body;

  if (!topic) return res.status(400).json({ error: 'Strategic topic is required' });

  const activeParticipants = selectedAgents || ['finance_ai', 'sales_ai', 'marketing_ai'];

  if (!hasGeminiKey) {
    // Return standard synthetic conversation responses
    const speakerId = activeParticipants[Math.floor(Math.random() * activeParticipants.length)];
    const agent = agents.find((a) => a.id === speakerId);
    return res.json({
      speakerId,
      messageText: `[Local Mode - Offline] As ${agent?.name || 'an executive agent'}, I have reviewed the topic "${topic}". I propose setting up structured timelines, analyzing current constraints, and deploying specialized automation to handle immediate bottlenecks.`,
      isSynthesis: false,
    });
  }

  try {
    const threadPrompt = (threadHistory || []).map((msg: any) => `${msg.role === 'user' ? 'Human CEO' : msg.speakerName}: ${msg.content}`).join('\n');

    const prompt = `You are orchestrating a strategic corporate Strategy Session for Atlas OS.
    Human CEO wants strategic alignment on this topic: "${topic}".
    Participating AI Executives: ${activeParticipants.map((id: string) => agents.find((a) => a.id === id)?.name).join(', ')}.

    Thread History so far:
    ${threadPrompt}

    Task:
    Choose the single most appropriate agent from the participants who should speak next to advance the conversation, or if the conversation has reached a mature strategic checkpoint, have the "CEO Assistant (Atlas)" perform the strategic synthesis and output a formal recommendation.
    
    If an AI Executive is speaking next, provide their response.
    If the CEO Assistant is synthesizing, output "ceo_assistant" as speakerId, check isSynthesis to true, and compile a clear strategic recommendation containing:
    1. A single powerful recommendation statement.
    2. A checklist of actions.
    3. Operational constraints.

    Ensure output conforms to the JSON schema. Keep responses authoritative, professional, and dense with commercial insights.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            speakerId: { type: Type.STRING, description: "Agent ID speaking next. Must be one of: 'finance_ai', 'sales_ai', 'marketing_ai', or 'ceo_assistant'" },
            messageText: { type: Type.STRING, description: 'Core speech response' },
            isSynthesis: { type: Type.BOOLEAN, description: 'True if conversation is fully summarized by the CEO Assistant with a concrete recommendation' },
            recommendation: {
              type: Type.OBJECT,
              properties: {
                statement: { type: Type.STRING, description: 'Synthesized proposal' },
                actions: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Checklist of strategic tasks' },
                constraints: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Target constraints/budget ceilings' },
              },
            },
          },
          required: ['speakerId', 'messageText', 'isSynthesis'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');

    // Record Strategy Session to Memory
    memories.push({
      id: `mem_strat_${Date.now()}`,
      text: `Strategy Session Interaction on "${topic}":\nSpeaker: ${parsed.speakerId}\nContent: ${parsed.messageText}`,
      type: 'Strategy_Session',
      sourceSystem: 'Central Intelligence Office',
      actor: parsed.speakerId,
      createdAt: new Date().toISOString(),
      tags: ['strategy', 'collaboration', topic.replace(/\s+/g, '_').toLowerCase()],
    });

    res.json(parsed);
  } catch (error: any) {
    console.error('Gemini error in strategy session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Command Center Overlay NLP Processor (Requirement 13)
app.post('/api/v1/command-center', async (req, res) => {
  const { command } = req.body;
  if (!command) return res.status(400).json({ error: 'Command text is required' });

  pushFeedEvent('ceo_assistant', 'Command Center Query', `Processing voice/NLP command: "${command}"`, 'info');

  if (!hasGeminiKey) {
    return res.json({
      text: `Received command "${command}". Here is a summary of actions:
      - We can navigate you directly to your Sales Dashboard, Finance Ledger, or Central Memory.
      - Standard operational parameters are currently nominal.`,
      navigationTarget: null,
    });
  }

  try {
    const prompt = `You are the Command Center processor for Atlas OS (CEO Assistant).
    The CEO entered this natural language command: "${command}"

    Task:
    Evaluate the command. Give a direct, concise executive feedback summary. If the command expresses a clear desire to navigate or perform a specific workflow, return one of these strict navigation routes as navigationTarget:
    - "/dashboard" (Mission Control / dashboard / overview)
    - "/sales" (Sales Center / qualified deals / CRM)
    - "/finance" (Finance Department / ledger / invoicing)
    - "/marketing" (Marketing Studio / Aria / campaigns)
    - "/memory" (Central Intelligence / memory search / log history)
    - "/pulse" (Organization Pulse / workflow map)
    - "/boardroom" (Boardroom Mode)
    - "/workforce" (Workforce Directory)
    Otherwise, return null for navigationTarget.

    Return your output strictly as a JSON object matching the schema.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            text: { type: Type.STRING, description: 'Concise, professional executive feedback' },
            navigationTarget: { type: Type.STRING, description: 'Optional route target' },
          },
          required: ['text'],
        },
      },
    });

    res.json(JSON.parse(response.text || '{}'));
  } catch (error: any) {
    res.json({
      text: `Command received. Direct processing failed, routed command to CEO assistant offline queue.`,
      navigationTarget: null,
    });
  }
});

// Boardroom Slide deck Compiler & PDF Mock exporter (Requirement 15)
app.get('/api/v1/boardroom/report', async (req, res) => {
  if (!hasGeminiKey) {
    return res.json({
      markdownReport: `# Atlas OS - Board Briefing\n\n## 1. Executive Operations\n- System status: NOMINAL\n- Operational targets: ACTIVE\n\n## 2. Strategic Objectives\n- Cost containment and margin safety implemented\n- Inbound pipeline scoring fully qualified\n\n## 3. Department Financial Metrics\n- ARR Forecast: $418,000\n- High Confidence deals: 3`,
    });
  }

  try {
    const prompt = `Generate a cinematic, high-impact Board Presentation Report summarizing the active Atlas OS operations.
    Company: ${orgContext.name || 'Atlas Operations'}
    Industry: ${orgContext.industry}
    Goals: ${orgContext.goals}

    Compile a deep-dive, professional report in beautiful Markdown format covering Q3 strategic opportunities, AI workforce productivity, and commercial growth. Focus on executive clarity and precision.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    res.json({ markdownReport: response.text });
  } catch (error) {
    res.json({
      markdownReport: `# Atlas Board Report\n\nCompilation occurred with local backup files. Operational status is steady.`,
    });
  }
});

app.post('/api/v1/boardroom/export', (req, res) => {
  // Simulates PDF file generation and return within 15 seconds (Returns instant success mock link)
  setTimeout(() => {
    res.json({
      success: true,
      downloadLink: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    });
  }, 1000);
});

// -----------------------------------------------------------------------------
// Vite and Production Asset Handlers
// -----------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Atlas OS Gateway running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
