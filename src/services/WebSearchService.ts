/**
 * Atlas OS — Web Search Service
 *
 * Gives all AI executives the ability to search the web in real time.
 * Uses Serper (https://serper.dev) — Google Search results as clean JSON.
 *
 * Why Serper:
 *   - $0.30 / 1,000 searches — cheapest real Google results
 *   - 2,500 free searches/month on the free tier
 *   - 1.8s average response time — fast enough for agent workflows
 *   - Returns organic results, news, knowledge graph, and "people also ask"
 *   - Simple: POST https://google.serper.dev/search with X-API-KEY header
 *
 * Setup:
 *   1. Sign up at https://serper.dev
 *   2. Copy your API key from the dashboard
 *   3. Set SERPER_API_KEY in your environment
 *
 * Search types available:
 *   - search    : Standard Google web search (organic + knowledge graph)
 *   - news      : Google News search (recent articles, sorted by date)
 *   - places    : Google Maps / local business search
 *   - images    : Google Image search
 *
 * All executives access this via ExecutiveService.webSearch() and
 * ExecutiveService.searchNews(). Raw results are fed back into the
 * LLM prompt so the executive can synthesize them into actionable output.
 */

const SERPER_BASE = 'https://google.serper.dev';

// ─── Response types ───────────────────────────────────────────────────────────

export interface SerperOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
  date?: string;
  sitelinks?: Array<{ title: string; link: string }>;
}

export interface SerperNewsResult {
  title: string;
  link: string;
  snippet: string;
  date: string;
  source: string;
  imageUrl?: string;
}

export interface SerperPlaceResult {
  title: string;
  address: string;
  rating?: number;
  ratingCount?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  cid?: string;
}

export interface SerperKnowledgeGraph {
  title?: string;
  type?: string;
  website?: string;
  description?: string;
  attributes?: Record<string, string>;
}

export interface WebSearchResult {
  query: string;
  organic: SerperOrganicResult[];
  news: SerperNewsResult[];
  knowledgeGraph?: SerperKnowledgeGraph;
  peopleAlsoAsk?: Array<{ question: string; snippet: string; link: string }>;
  relatedSearches?: string[];
  searchedAt: string;
  source: 'serper' | 'unavailable';
}

export interface NewsSearchResult {
  query: string;
  articles: SerperNewsResult[];
  searchedAt: string;
  source: 'serper' | 'unavailable';
}

export interface PlacesSearchResult {
  query: string;
  places: SerperPlaceResult[];
  searchedAt: string;
  source: 'serper' | 'unavailable';
}

// ─── WebSearchService ─────────────────────────────────────────────────────────

class AtlasWebSearchService {
  private static _instance: AtlasWebSearchService | null = null;

  private constructor() {}

  static getInstance(): AtlasWebSearchService {
    if (!AtlasWebSearchService._instance) {
      AtlasWebSearchService._instance = new AtlasWebSearchService();
    }
    return AtlasWebSearchService._instance;
  }

  static isConfigured(): boolean {
    return !!process.env.SERPER_API_KEY;
  }

  private get apiKey(): string | undefined {
    return process.env.SERPER_API_KEY;
  }

  // ─── Core search request ────────────────────────────────────────────────────

  private async request(
    endpoint: 'search' | 'news' | 'places' | 'images',
    body: Record<string, unknown>,
  ): Promise<any> {
    if (!this.apiKey) {
      throw new Error('SERPER_API_KEY is not configured. Set it in your environment variables to enable web search.');
    }

    const response = await fetch(`${SERPER_BASE}/${endpoint}`, {
      method: 'POST',
      headers: {
        'X-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Serper ${endpoint} request failed (${response.status}): ${err}`);
    }

    return response.json();
  }

  // ─── Web search ─────────────────────────────────────────────────────────────
  // Standard Google search — organic results + knowledge graph.

  async search(query: string, options: {
    numResults?: number;   // 10 (default), up to 100
    country?: string;      // e.g. 'us', 'gb', 'au'
    language?: string;     // e.g. 'en'
    timeRange?: 'qdr:h' | 'qdr:d' | 'qdr:w' | 'qdr:m' | 'qdr:y'; // past hour/day/week/month/year
  } = {}): Promise<WebSearchResult> {
    const data = await this.request('search', {
      q: query,
      num: options.numResults ?? 10,
      ...(options.country ? { gl: options.country } : {}),
      ...(options.language ? { hl: options.language } : {}),
      ...(options.timeRange ? { tbs: options.timeRange } : {}),
    });

    return {
      query,
      organic: (data.organic ?? []).map((r: any): SerperOrganicResult => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
        position: r.position ?? 0,
        date: r.date,
        sitelinks: r.sitelinks,
      })),
      news: (data.topStories ?? []).map((r: any): SerperNewsResult => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
        date: r.date ?? '',
        source: r.source ?? '',
        imageUrl: r.imageUrl,
      })),
      knowledgeGraph: data.knowledgeGraph
        ? {
            title: data.knowledgeGraph.title,
            type: data.knowledgeGraph.type,
            website: data.knowledgeGraph.website,
            description: data.knowledgeGraph.description,
            attributes: data.knowledgeGraph.attributes,
          }
        : undefined,
      peopleAlsoAsk: (data.peopleAlsoAsk ?? []).map((p: any) => ({
        question: p.question,
        snippet: p.snippet ?? '',
        link: p.link ?? '',
      })),
      relatedSearches: (data.relatedSearches ?? []).map((r: any) => r.query ?? r),
      searchedAt: new Date().toISOString(),
      source: 'serper',
    };
  }

  // ─── News search ────────────────────────────────────────────────────────────
  // Recent news articles sorted by date — ideal for market monitoring.

  async searchNews(query: string, options: {
    numResults?: number;
    country?: string;
    timeRange?: 'qdr:h' | 'qdr:d' | 'qdr:w' | 'qdr:m';
  } = {}): Promise<NewsSearchResult> {
    const data = await this.request('news', {
      q: query,
      num: options.numResults ?? 10,
      ...(options.country ? { gl: options.country } : {}),
      ...(options.timeRange ? { tbs: options.timeRange } : {}),
    });

    return {
      query,
      articles: (data.news ?? []).map((r: any): SerperNewsResult => ({
        title: r.title ?? '',
        link: r.link ?? '',
        snippet: r.snippet ?? '',
        date: r.date ?? '',
        source: r.source ?? '',
        imageUrl: r.imageUrl,
      })),
      searchedAt: new Date().toISOString(),
      source: 'serper',
    };
  }

  // ─── Places search ──────────────────────────────────────────────────────────
  // Google Maps local business results — useful for local market research.

  async searchPlaces(query: string, location?: string): Promise<PlacesSearchResult> {
    const q = location ? `${query} in ${location}` : query;

    const data = await this.request('places', {
      q,
    });

    return {
      query: q,
      places: (data.places ?? []).map((r: any): SerperPlaceResult => ({
        title: r.title ?? '',
        address: r.address ?? '',
        rating: r.rating,
        ratingCount: r.ratingCount,
        category: r.category,
        phoneNumber: r.phoneNumber,
        website: r.website,
        cid: r.cid,
      })),
      searchedAt: new Date().toISOString(),
      source: 'serper',
    };
  }

  // ─── Helper: format results for LLM prompt injection ──────────────────────
  // Converts search results into a compact, readable string for prompts.

  static formatForPrompt(results: WebSearchResult, maxResults = 5): string {
    const lines: string[] = [`Web search results for: "${results.query}"`];

    if (results.knowledgeGraph?.description) {
      lines.push(`\nKnowledge Graph: ${results.knowledgeGraph.title} — ${results.knowledgeGraph.description}`);
    }

    if (results.organic.length > 0) {
      lines.push('\nTop results:');
      results.organic.slice(0, maxResults).forEach((r, i) => {
        lines.push(`${i + 1}. ${r.title}`);
        lines.push(`   ${r.snippet}`);
        lines.push(`   Source: ${r.link}`);
      });
    }

    if (results.news.length > 0) {
      lines.push('\nRecent news:');
      results.news.slice(0, 3).forEach((r) => {
        lines.push(`• [${r.date}] ${r.title} — ${r.source}`);
        lines.push(`  ${r.snippet}`);
      });
    }

    return lines.join('\n');
  }

  static formatNewsForPrompt(results: NewsSearchResult, maxArticles = 8): string {
    const lines: string[] = [`News search results for: "${results.query}"\n`];

    results.articles.slice(0, maxArticles).forEach((a) => {
      lines.push(`• [${a.date}] ${a.title}`);
      lines.push(`  Source: ${a.source}`);
      lines.push(`  ${a.snippet}`);
      lines.push('');
    });

    return lines.join('\n');
  }

  static formatPlacesForPrompt(results: PlacesSearchResult): string {
    const lines: string[] = [`Local business results for: "${results.query}"\n`];

    results.places.forEach((p) => {
      lines.push(`• ${p.title}`);
      if (p.category) lines.push(`  Category: ${p.category}`);
      lines.push(`  Address: ${p.address}`);
      if (p.rating) lines.push(`  Rating: ${p.rating}/5 (${p.ratingCount ?? 0} reviews)`);
      if (p.website) lines.push(`  Website: ${p.website}`);
      if (p.phoneNumber) lines.push(`  Phone: ${p.phoneNumber}`);
      lines.push('');
    });

    return lines.join('\n');
  }
}

export const webSearchService = AtlasWebSearchService.getInstance();
export { AtlasWebSearchService as WebSearchService };
