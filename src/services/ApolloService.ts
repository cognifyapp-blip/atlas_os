/**
 * Atlas OS — Apollo.io Service
 *
 * Real contact discovery using Apollo's 240M+ person database.
 * Replaces the LLM-generated fake prospect list in OutboundEngine.
 *
 * Two-step flow (matching Apollo's API design):
 *   Step 1 — Search: POST /api/v1/mixed_people/api_search
 *             Filters by titles, seniority, location, company size.
 *             Returns Apollo IDs + obfuscated names. FREE — no credits used.
 *
 *   Step 2 — Enrich: POST /api/v1/people/bulk_match
 *             Pass Apollo IDs to reveal full names, emails, phone numbers.
 *             Costs Apollo export credits (varies by plan).
 *
 * Configuration:
 *   APOLLO_API_KEY  — Master API key from Apollo dashboard → Settings → API Keys
 *                     Must be a MASTER key — standard keys can't access people search.
 *
 * Rate limits (as of 2026):
 *   People Search: 600 calls/hour
 *   Bulk Enrichment: depends on plan
 */

import type { ProspectRecord } from './OutboundEngine.js';
import type { ICPDefinition } from './OutboundEngine.js';

const APOLLO_BASE = 'https://api.apollo.io/api/v1';

// ─── Raw Apollo response types ────────────────────────────────────────────────

interface ApolloPersonSearchResult {
  id: string;
  first_name: string;
  last_name_obfuscated: string;
  title: string | null;
  has_email: boolean;
  organization?: {
    name?: string;
  };
}

interface ApolloPersonSearchResponse {
  people: ApolloPersonSearchResult[];
  total_entries: number;
}

interface ApolloEnrichedPerson {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string | null;
  email: string | null;
  phone_numbers?: Array<{ raw_number: string }>;
  organization?: {
    name?: string;
    estimated_num_employees?: number;
    annual_revenue_printed?: string;
  };
  city?: string;
  country?: string;
}

interface ApolloEnrichResponse {
  people: ApolloEnrichedPerson[];
  status: string;
}

// ─── ICP → Apollo filter mapping ─────────────────────────────────────────────
// Translates the ICP definition Atlas already uses into Apollo query params.

function icpToApolloFilters(icp: ICPDefinition): Record<string, string | string[]> {
  const params: Record<string, string | string[]> = {};

  // Job titles
  if (icp.jobTitles.length > 0) {
    params['person_titles[]'] = icp.jobTitles;
  }

  // Geography → Apollo person_locations or organization_locations
  if (icp.geographies && icp.geographies.length > 0) {
    params['organization_locations[]'] = icp.geographies;
  }

  // Company size → employee range
  // ICP companySize examples: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5000+"
  const sizeMap: Record<string, string> = {
    '1-10': '1,10',
    '11-50': '11,50',
    '51-200': '51,200',
    '201-500': '201,500',
    '501-1000': '501,1000',
    '1001-5000': '1001,5000',
    '5000+': '5001,100000',
    'startup': '1,50',
    'smb': '11,500',
    'mid-market': '201,2000',
    'enterprise': '1001,100000',
  };

  const sizeKey = Object.keys(sizeMap).find(
    (k) => icp.companySize.toLowerCase().includes(k.toLowerCase()),
  );
  if (sizeKey) {
    params['organization_num_employees_ranges[]'] = [sizeMap[sizeKey]];
  }

  // Only return people who have a verified email
  params['contact_email_status[]'] = ['verified', 'likely to engage'];

  return params;
}

// ─── Build URLSearchParams from filter map (handles arrays) ──────────────────

function buildQueryString(filters: Record<string, string | string[]>): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
      }
    } else {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    }
  }
  return parts.join('&');
}

// ─── Estimate deal value from company size ────────────────────────────────────

function estimateDealValue(employeeCount?: number, budgetRange?: string): number {
  if (budgetRange) {
    const nums = budgetRange.replace(/[^0-9-]/g, '').split('-').map(Number).filter(Boolean);
    if (nums.length > 0) return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  if (!employeeCount) return 15000;
  if (employeeCount < 50) return 8000;
  if (employeeCount < 200) return 20000;
  if (employeeCount < 1000) return 50000;
  return 120000;
}

// ─── ApolloService ────────────────────────────────────────────────────────────

export class ApolloService {
  private readonly apiKey: string;

  constructor() {
    const key = process.env.APOLLO_API_KEY;
    if (!key) throw new Error('APOLLO_API_KEY is not configured. Add it to your environment variables.');
    this.apiKey = key;
  }

  static isConfigured(): boolean {
    return !!process.env.APOLLO_API_KEY;
  }

  // ─── Step 1: Search for people matching the ICP ────────────────────────────
  // Returns Apollo IDs + basic info. No emails yet. FREE endpoint.

  async searchPeople(icp: ICPDefinition, count: number): Promise<ApolloPersonSearchResult[]> {
    const filters = icpToApolloFilters(icp);
    const perPage = Math.min(count, 25); // Apollo recommends small per_page for performance
    const qs = buildQueryString({
      ...filters,
      per_page: String(perPage),
      page: '1',
    });

    const url = `${APOLLO_BASE}/mixed_people/api_search?${qs}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Apollo People Search failed (${response.status}): ${err}`);
    }

    const data = await response.json() as ApolloPersonSearchResponse;
    return (data.people ?? []).filter((p) => p.has_email).slice(0, count);
  }

  // ─── Step 2: Enrich people by Apollo ID to get full name + email ───────────
  // Costs credits. Only called for people with has_email=true.

  async enrichPeople(apolloIds: string[]): Promise<ApolloEnrichedPerson[]> {
    if (apolloIds.length === 0) return [];

    // Apollo bulk_match accepts up to 10 IDs per request
    const BATCH_SIZE = 10;
    const allEnriched: ApolloEnrichedPerson[] = [];

    for (let i = 0; i < apolloIds.length; i += BATCH_SIZE) {
      const batch = apolloIds.slice(i, i + BATCH_SIZE);

      const response = await fetch(`${APOLLO_BASE}/people/bulk_match`, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          details: batch.map((id) => ({ id })),
          reveal_personal_emails: false, // work emails only — personal emails cost more credits
          reveal_phone_number: false,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error(`[ApolloService] Bulk enrichment failed for batch (${response.status}): ${err}`);
        continue; // skip failed batch, don't throw — partial results are better than none
      }

      const data = await response.json() as ApolloEnrichResponse;
      const valid = (data.people ?? []).filter((p) => p.email);
      allEnriched.push(...valid);
    }

    return allEnriched;
  }

  // ─── Full pipeline: search → enrich → map to ProspectRecord ───────────────
  // This is the method OutboundEngine calls instead of the LLM fake generator.

  async findProspects(params: {
    icp: ICPDefinition;
    count: number;
    orgName: string;
  }): Promise<ProspectRecord[]> {
    const { icp, count, orgName } = params;

    console.log(`[ApolloService] Searching for ${count} prospects matching ICP: ${icp.industry}, ${icp.companySize}, titles: ${icp.jobTitles.join(', ')}`);

    // Step 1: Search
    const searchResults = await this.searchPeople(icp, count);

    if (searchResults.length === 0) {
      console.warn('[ApolloService] People search returned 0 results. Try broadening ICP filters.');
      return [];
    }

    console.log(`[ApolloService] Found ${searchResults.length} candidates. Enriching for emails…`);

    // Step 2: Enrich (get real emails — costs credits)
    const apolloIds = searchResults.map((p) => p.id);
    const enriched = await this.enrichPeople(apolloIds);

    console.log(`[ApolloService] Enriched ${enriched.length} contacts with verified emails.`);

    // Step 3: Map to ProspectRecord
    const prospects: ProspectRecord[] = enriched.map((person): ProspectRecord => {
      const employeeCount = person.organization?.estimated_num_employees;
      const estimatedValue = estimateDealValue(employeeCount, icp.budgetRange);

      // Build a fit reason from the ICP
      const painPointStr = icp.painPoints.slice(0, 2).join(' and ');
      const icpFitReason = `${person.title ?? 'Decision maker'} at ${person.organization?.name ?? 'their company'} — likely experiencing ${painPointStr}, which ${orgName} directly addresses.`;

      return {
        name: person.name || `${person.first_name} ${person.last_name}`.trim(),
        email: person.email!,
        company: person.organization?.name ?? 'Unknown Company',
        title: person.title ?? 'Decision Maker',
        phone: person.phone_numbers?.[0]?.raw_number,
        estimatedValue,
        icpFitReason,
      };
    });

    return prospects;
  }
}

export const apolloService = new ApolloService();
