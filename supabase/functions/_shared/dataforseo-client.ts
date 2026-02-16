/**
 * DataForSEO API Client
 *
 * Handles all DataForSEO API calls for the SEO pipeline.
 * Uses Basic Auth (base64(login:password)) — the only auth method DataForSEO supports.
 *
 * Environment variables:
 *   - DATAFORSEO_LOGIN
 *   - DATAFORSEO_PASSWORD
 */

import type {
  KeyTerm,
  KeywordCluster,
  KeywordResearchResult,
  CompetitorData,
  SerpFeatures,
  ContentLandscapeSummary,
} from './seo-types.ts';

const DATAFORSEO_BASE_URL = 'https://api.dataforseo.com/v3';
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 1;
const RETRY_DELAY_MS = 2_000;

export class DataForSEOClient {
  private authHeader: string;

  constructor(login: string, password: string) {
    this.authHeader = 'Basic ' + btoa(`${login}:${password}`);
  }

  // ── Main research method: runs 6 API calls in parallel ──
  async researchKeyword(
    targetKeyword: string,
    topic: string,
    locationCode: number = 2840,
    languageCode: string = 'en',
  ): Promise<KeywordResearchResult> {
    const startTime = Date.now();
    console.log(`[dataforseo] Starting research for "${targetKeyword}" (location: ${locationCode}, language: ${languageCode})`);

    // Run all 6 API calls in parallel
    const [
      keywordsForKeywordsResult,
      relatedKeywordsResult,
      bulkDifficultyResult,
      serpAdvancedResult,
      serpRegularResult,
      contentAnalysisResult,
    ] = await Promise.allSettled([
      // 1. Keyword expansion + volume/CPC
      this.getKeywordsForKeywords(targetKeyword, locationCode, languageCode),
      // 2. Semantically related keywords
      this.getRelatedKeywords(targetKeyword, locationCode, languageCode),
      // 3. Bulk keyword difficulty (will be populated after we have keyword list)
      Promise.resolve([]), // placeholder — we'll batch KD after merging keywords
      // 4. People Also Ask questions
      this.getSerpAdvanced(targetKeyword, locationCode, languageCode),
      // 5. Top 10 SERP competitors
      this.getSerpRegular(targetKeyword, locationCode, languageCode),
      // 6. Content landscape analysis
      this.getContentAnalysis(targetKeyword, languageCode),
    ]);

    // Extract results (graceful handling of failures)
    const expandedKeywords = keywordsForKeywordsResult.status === 'fulfilled'
      ? keywordsForKeywordsResult.value
      : [];
    const relatedKeywords = relatedKeywordsResult.status === 'fulfilled'
      ? relatedKeywordsResult.value
      : [];
    const serpAdvancedData = serpAdvancedResult.status === 'fulfilled'
      ? serpAdvancedResult.value
      : { questions: [], serpFeatures: { hasAiOverview: false, aiOverviewSources: [], hasFeaturedSnippet: false, featuredSnippetType: null, featuredSnippetContent: null, hasKnowledgeGraph: false, hasPeopleAlsoAsk: false, serpFeatureTypes: [] } as SerpFeatures };
    const paaQuestions = serpAdvancedData.questions;
    const serpFeatures = serpAdvancedData.serpFeatures;
    const rawSerpCompetitors = serpRegularResult.status === 'fulfilled'
      ? serpRegularResult.value
      : [];
    const contentLandscapeRaw = contentAnalysisResult.status === 'fulfilled'
      ? contentAnalysisResult.value
      : [];

    // Enrich competitors with Content Analysis data (word count, domain rank, content score)
    const serpCompetitors = this.enrichCompetitorsFromContentAnalysis(rawSerpCompetitors, contentLandscapeRaw);

    // Build content landscape summary for statistics
    const contentLandscape = this.buildContentLandscape(contentLandscapeRaw);

    // Log failures
    const results = [
      keywordsForKeywordsResult, relatedKeywordsResult, bulkDifficultyResult,
      serpAdvancedResult, serpRegularResult, contentAnalysisResult,
    ];
    const names = [
      'keywords_for_keywords', 'related_keywords', 'bulk_difficulty',
      'serp_advanced', 'serp_regular', 'content_analysis',
    ];
    results.forEach((r, i) => {
      if (r.status === 'rejected') {
        console.error(`[dataforseo] ${names[i]} failed:`, r.reason?.message || r.reason);
      }
    });

    // Merge and deduplicate keywords
    const allKeywords = this.mergeKeywords(expandedKeywords, relatedKeywords);

    // Get keyword difficulty scores for top keywords
    const topKeywordTerms = allKeywords.slice(0, 100).map((k) => k.term);
    let difficultyMap: Record<string, number> = {};
    if (topKeywordTerms.length > 0) {
      try {
        difficultyMap = await this.getBulkKeywordDifficulty(
          topKeywordTerms,
          locationCode,
          languageCode,
        );
      } catch (err) {
        console.error('[dataforseo] bulk_keyword_difficulty failed:', err);
      }
    }

    // Enrich keywords with difficulty scores and calculate opportunity
    const enrichedKeywords = allKeywords.map((kw) => ({
      ...kw,
      keywordDifficulty: difficultyMap[kw.term] ?? null,
      opportunityScore: this.calculateOpportunityScore(
        kw.searchVolume,
        kw.competition,
        difficultyMap[kw.term] ?? 50,
      ),
    }));

    // Sort by opportunity score
    enrichedKeywords.sort((a, b) => b.opportunityScore - a.opportunityScore);

    // Build keyword clusters
    const clusters = this.buildClusters(enrichedKeywords, targetKeyword);

    // Find recommended primary and secondaries
    const recommendedPrimary = enrichedKeywords.find(
      (k) => k.term.toLowerCase() === targetKeyword.toLowerCase(),
    ) || enrichedKeywords[0];

    const recommendedSecondaries = enrichedKeywords
      .filter((k) => k.term.toLowerCase() !== targetKeyword.toLowerCase())
      .slice(0, 10);

    // Extract competitor headings for gap analysis
    const gapOpportunities = this.extractContentGaps(serpCompetitors, contentLandscapeRaw);

    const totalVolume = enrichedKeywords.reduce(
      (sum, k) => sum + k.searchVolume,
      0,
    );

    console.log(
      `[dataforseo] Research complete in ${Date.now() - startTime}ms: ` +
      `${enrichedKeywords.length} keywords, ${serpCompetitors.length} competitors, ${paaQuestions.length} PAA questions`,
    );

    return {
      topic,
      targetKeyword,
      clusters,
      serpInsights: serpCompetitors,
      recommendedPrimary,
      recommendedSecondaries,
      totalAddressableVolume: totalVolume,
      contentGapOpportunities: gapOpportunities,
      paaQuestions,
      serpFeatures,
      contentLandscape,
      researchedAt: new Date().toISOString(),
    };
  }

  // ════════════════════════════════════════════════════════════════
  // API CALL METHODS
  // ════════════════════════════════════════════════════════════════

  /** 1. Keyword expansion — returns related keywords with volume/CPC */
  private async getKeywordsForKeywords(
    keyword: string,
    locationCode: number,
    languageCode: string,
  ): Promise<KeyTerm[]> {
    const data = await this.apiCall(
      '/keywords_data/google_ads/keywords_for_keywords/live',
      [
        {
          keywords: [keyword],
          location_code: locationCode,
          language_code: languageCode,
          sort_by: 'relevance',
          include_adult_keywords: false,
        },
      ],
    );

    const items = data?.tasks?.[0]?.result || [];
    return items.map((item: any) => this.parseKeyTerm(item));
  }

  /** 2. Semantically related keywords */
  private async getRelatedKeywords(
    keyword: string,
    locationCode: number,
    languageCode: string,
  ): Promise<KeyTerm[]> {
    const data = await this.apiCall(
      '/dataforseo_labs/google/related_keywords/live',
      [
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          limit: 100,
        },
      ],
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items.map((item: any) => ({
      ...this.parseKeyTerm(item.keyword_data || item),
      term: item.keyword || item.keyword_data?.keyword || '',
    }));
  }

  /** 3. Bulk keyword difficulty scores */
  private async getBulkKeywordDifficulty(
    keywords: string[],
    locationCode: number,
    languageCode: string,
  ): Promise<Record<string, number>> {
    const data = await this.apiCall(
      '/dataforseo_labs/google/bulk_keyword_difficulty/live',
      [
        {
          keywords: keywords.slice(0, 1000), // API limit
          location_code: locationCode,
          language_code: languageCode,
        },
      ],
    );

    const items = data?.tasks?.[0]?.result || [];
    const map: Record<string, number> = {};
    for (const item of items) {
      if (item.keyword && item.keyword_difficulty != null) {
        map[item.keyword] = item.keyword_difficulty;
      }
    }
    return map;
  }

  /** 4. SERP Advanced — extracts PAA questions + all SERP features (AI Overview, Featured Snippet, etc.) */
  private async getSerpAdvanced(
    keyword: string,
    locationCode: number,
    languageCode: string,
  ): Promise<{ questions: string[]; serpFeatures: SerpFeatures }> {
    const data = await this.apiCall(
      '/serp/google/organic/live/advanced',
      [
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          device: 'desktop',
          depth: 10,
        },
      ],
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    const questions: string[] = [];
    const featureTypes = new Set<string>();

    const serpFeatures: SerpFeatures = {
      hasAiOverview: false,
      aiOverviewSources: [],
      hasFeaturedSnippet: false,
      featuredSnippetType: null,
      featuredSnippetContent: null,
      hasKnowledgeGraph: false,
      hasPeopleAlsoAsk: false,
      serpFeatureTypes: [],
    };

    for (const item of items) {
      if (item.type) featureTypes.add(item.type);

      // People Also Ask
      if (item.type === 'people_also_ask' && Array.isArray(item.items)) {
        serpFeatures.hasPeopleAlsoAsk = true;
        for (const paa of item.items) {
          if (paa.title) questions.push(paa.title);
        }
      }

      // AI Overview
      if (item.type === 'ai_overview') {
        serpFeatures.hasAiOverview = true;
        // Extract cited sources from AI Overview references
        const refs = item.references || item.items || [];
        if (Array.isArray(refs)) {
          for (const ref of refs) {
            if (ref.url) {
              serpFeatures.aiOverviewSources.push({
                url: ref.url,
                title: ref.title || '',
                domain: ref.domain || new URL(ref.url).hostname,
              });
            }
          }
        }
      }

      // Featured Snippet
      if (item.type === 'featured_snippet') {
        serpFeatures.hasFeaturedSnippet = true;
        serpFeatures.featuredSnippetType = item.featured_snippet?.type || item.description ? 'paragraph' : null;
        serpFeatures.featuredSnippetContent = item.description || item.featured_snippet?.description || null;
      }

      // Knowledge Graph
      if (item.type === 'knowledge_graph') {
        serpFeatures.hasKnowledgeGraph = true;
      }
    }

    serpFeatures.serpFeatureTypes = [...featureTypes];

    return { questions, serpFeatures };
  }

  /** 5. SERP Regular — top 10 organic competitors */
  private async getSerpRegular(
    keyword: string,
    locationCode: number,
    languageCode: string,
  ): Promise<CompetitorData[]> {
    const data = await this.apiCall(
      '/serp/google/organic/live/regular',
      [
        {
          keyword,
          location_code: locationCode,
          language_code: languageCode,
          device: 'desktop',
          depth: 10,
        },
      ],
    );

    const items = data?.tasks?.[0]?.result?.[0]?.items || [];
    return items
      .filter((item: any) => item.type === 'organic')
      .map((item: any) => ({
        url: item.url || '',
        title: item.title || '',
        domain: item.domain || '',
        position: item.rank_group || 0,
        wordCount: 0, // Not available from SERP
        headings: [],  // Not available from SERP
        contentScore: null,
        domainAuthority: null,
      }));
  }

  /** 6. Content analysis — landscape of existing content */
  private async getContentAnalysis(
    keyword: string,
    languageCode: string,
  ): Promise<any[]> {
    const data = await this.apiCall(
      '/content_analysis/search/live',
      [
        {
          keyword,
          search_mode: 'as_is',
          page_size: 10,
          internal_list_limit: 5,
        },
      ],
    );

    return data?.tasks?.[0]?.result?.[0]?.items || [];
  }

  // ════════════════════════════════════════════════════════════════
  // DATA ENRICHMENT
  // ════════════════════════════════════════════════════════════════

  /** Enrich SERP competitors with Content Analysis data (word count, domain rank) */
  private enrichCompetitorsFromContentAnalysis(
    competitors: CompetitorData[],
    contentItems: any[],
  ): CompetitorData[] {
    if (!contentItems.length) return competitors;

    // Index content analysis items by domain for fast lookup
    const domainMap = new Map<string, any>();
    for (const item of contentItems) {
      const domain = item.page_category?.domain || item.url?.match(/https?:\/\/([^/]+)/)?.[1] || '';
      if (domain && !domainMap.has(domain)) {
        domainMap.set(domain, item);
      }
    }

    return competitors.map((comp) => {
      const match = domainMap.get(comp.domain);
      if (!match) return comp;

      return {
        ...comp,
        wordCount: match.content_info?.word_count || match.word_count || comp.wordCount,
        domainAuthority: match.domain_info?.rank || match.domain_rank || comp.domainAuthority,
        contentScore: match.content_info?.score || match.content_score || comp.contentScore,
      };
    });
  }

  /** Build content landscape summary from Content Analysis API results */
  private buildContentLandscape(contentItems: any[]): ContentLandscapeSummary {
    const empty: ContentLandscapeSummary = {
      avgWordCount: 0,
      avgContentScore: 0,
      avgDomainRank: 0,
      dateRange: { earliest: '', latest: '' },
      contentTypes: {},
      sentiments: {},
    };

    if (!contentItems.length) return empty;

    const wordCounts: number[] = [];
    const domainRanks: number[] = [];
    const contentScores: number[] = [];
    const dates: string[] = [];
    const contentTypes: Record<string, number> = {};
    const sentiments: Record<string, number> = {};

    for (const item of contentItems) {
      const wc = item.content_info?.word_count || item.word_count || 0;
      if (wc > 0) wordCounts.push(wc);

      const dr = item.domain_info?.rank || item.domain_rank || 0;
      if (dr > 0) domainRanks.push(dr);

      const cs = item.content_info?.score || item.content_score || 0;
      if (cs > 0) contentScores.push(cs);

      const date = item.date_published || item.content_info?.date_published || '';
      if (date) dates.push(date);

      const ct = item.content_info?.content_type || item.content_type || 'unknown';
      contentTypes[ct] = (contentTypes[ct] || 0) + 1;

      const sent = item.content_info?.sentiment?.connotation || item.sentiment_connotation || 'neutral';
      sentiments[sent] = (sentiments[sent] || 0) + 1;
    }

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;
    const sortedDates = dates.filter(Boolean).sort();

    return {
      avgWordCount: avg(wordCounts),
      avgContentScore: avg(contentScores),
      avgDomainRank: avg(domainRanks),
      dateRange: {
        earliest: sortedDates[0] || '',
        latest: sortedDates[sortedDates.length - 1] || '',
      },
      contentTypes,
      sentiments,
    };
  }

  // ════════════════════════════════════════════════════════════════
  // HELPERS
  // ════════════════════════════════════════════════════════════════

  /** Make an API call with retry and timeout */
  private async apiCall(endpoint: string, body: any[]): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(
          () => controller.abort(),
          REQUEST_TIMEOUT_MS,
        );

        const response = await fetch(`${DATAFORSEO_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errText = await response.text();
          // Retry on 429 (rate limit) or 503 (service unavailable)
          if (
            (response.status === 429 || response.status === 503) &&
            attempt < MAX_RETRIES
          ) {
            console.warn(
              `[dataforseo] ${endpoint} returned ${response.status}, retrying in ${RETRY_DELAY_MS}ms...`,
            );
            await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
            continue;
          }
          throw new Error(
            `DataForSEO ${endpoint} error (${response.status}): ${errText}`,
          );
        }

        return await response.json();
      } catch (error) {
        lastError = error as Error;
        if (
          lastError.name === 'AbortError' ||
          (attempt >= MAX_RETRIES)
        ) {
          break;
        }
        console.warn(
          `[dataforseo] ${endpoint} attempt ${attempt + 1} failed, retrying...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    throw lastError || new Error(`DataForSEO ${endpoint} failed after retries`);
  }

  /** Parse a DataForSEO keyword result into our KeyTerm format */
  private parseKeyTerm(item: any): KeyTerm {
    const searchVolume = item.search_volume || item.keyword_info?.search_volume || 0;
    const competition = item.competition_index ?? item.keyword_info?.competition ?? 0;
    const cpc = item.cpc || item.keyword_info?.cpc || 0;

    // Calculate trend from monthly_searches
    const monthlies = item.monthly_searches || item.keyword_info?.monthly_searches || [];
    const { trend, trendDelta } = this.calculateTrend(monthlies);

    return {
      term: item.keyword || '',
      searchVolume,
      competition: typeof competition === 'number' ? competition / 100 : 0,
      cpc,
      keywordDifficulty: null, // Filled later by bulk difficulty
      importance: Math.min(10, Math.max(1, Math.round(searchVolume / 1000) + 1)),
      usage: 0,
      usageRange: searchVolume > 10000 ? '5-15' : searchVolume > 1000 ? '3-9' : '1-5',
      trend,
      trendDelta,
      opportunityScore: 0, // Filled later
    };
  }

  /** Calculate trend direction from monthly search volumes */
  private calculateTrend(
    monthlies: { year: number; month: number; search_volume: number }[],
  ): { trend: 'up' | 'down' | 'stable'; trendDelta: number } {
    if (!monthlies || monthlies.length < 3) {
      return { trend: 'stable', trendDelta: 0 };
    }

    // Compare last 3 months average vs previous 3 months
    const sorted = [...monthlies].sort(
      (a, b) => b.year * 100 + b.month - (a.year * 100 + a.month),
    );
    const recent = sorted.slice(0, 3);
    const previous = sorted.slice(3, 6);

    if (previous.length === 0) return { trend: 'stable', trendDelta: 0 };

    const recentAvg =
      recent.reduce((s, m) => s + m.search_volume, 0) / recent.length;
    const previousAvg =
      previous.reduce((s, m) => s + m.search_volume, 0) / previous.length;

    if (previousAvg === 0) return { trend: 'stable', trendDelta: 0 };

    const delta = ((recentAvg - previousAvg) / previousAvg) * 100;

    if (delta > 10) return { trend: 'up', trendDelta: Math.round(delta) };
    if (delta < -10) return { trend: 'down', trendDelta: Math.round(delta) };
    return { trend: 'stable', trendDelta: Math.round(delta) };
  }

  /** Calculate opportunity score: volume * (1 - competition) * (1 - difficulty) */
  private calculateOpportunityScore(
    volume: number,
    competition: number,
    difficulty: number,
  ): number {
    const volumeNorm = Math.min(1, volume / 10000); // Normalize to 0-1
    const score =
      volumeNorm * 0.4 +
      (1 - competition) * 0.3 +
      (1 - difficulty / 100) * 0.3;
    return Math.round(score * 100);
  }

  /** Merge and deduplicate keywords from multiple sources */
  private mergeKeywords(
    expanded: KeyTerm[],
    related: KeyTerm[],
  ): KeyTerm[] {
    const seen = new Map<string, KeyTerm>();

    // Expanded keywords first (more reliable data)
    for (const kw of expanded) {
      const key = kw.term.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.set(key, kw);
      }
    }

    // Related keywords fill gaps
    for (const kw of related) {
      const key = kw.term.toLowerCase().trim();
      if (key && !seen.has(key)) {
        seen.set(key, kw);
      }
    }

    return Array.from(seen.values());
  }

  /** Build keyword clusters by grouping keywords with shared terms */
  private buildClusters(
    keywords: KeyTerm[],
    targetKeyword: string,
  ): KeywordCluster[] {
    const targetWords = new Set(targetKeyword.toLowerCase().split(/\s+/));
    const clusters: KeywordCluster[] = [];

    // Primary cluster: keywords containing the target keyword terms
    const primaryCluster: KeyTerm[] = [];
    const remaining: KeyTerm[] = [];

    for (const kw of keywords) {
      const kwWords = kw.term.toLowerCase().split(/\s+/);
      const overlap = kwWords.filter((w) => targetWords.has(w)).length;
      if (overlap > 0) {
        primaryCluster.push(kw);
      } else {
        remaining.push(kw);
      }
    }

    if (primaryCluster.length > 0) {
      clusters.push({
        clusterName: targetKeyword,
        primaryKeyword: primaryCluster[0],
        secondaryKeywords: primaryCluster.slice(1, 10),
        lsiKeywords: primaryCluster.slice(10, 20).map((k) => k.term),
        questions: [],
      });
    }

    // Group remaining keywords by common terms (simple heuristic)
    const wordGroups = new Map<string, KeyTerm[]>();
    for (const kw of remaining) {
      const words = kw.term.toLowerCase().split(/\s+/);
      const groupWord = words.find((w) => w.length > 3) || words[0];
      if (!wordGroups.has(groupWord)) {
        wordGroups.set(groupWord, []);
      }
      wordGroups.get(groupWord)!.push(kw);
    }

    // Create clusters for groups with 3+ keywords
    for (const [groupName, groupKws] of wordGroups) {
      if (groupKws.length >= 3) {
        clusters.push({
          clusterName: groupName,
          primaryKeyword: groupKws[0],
          secondaryKeywords: groupKws.slice(1, 8),
          lsiKeywords: groupKws.slice(8, 15).map((k) => k.term),
          questions: [],
        });
      }
    }

    return clusters;
  }

  /** Extract content gaps from competitor data */
  private extractContentGaps(
    competitors: CompetitorData[],
    contentLandscape: any[],
  ): string[] {
    const gaps: string[] = [];

    // Extract topics from content analysis results
    for (const item of contentLandscape) {
      if (item.title) {
        gaps.push(item.title);
      }
    }

    // Extract competitor titles as gap indicators
    for (const comp of competitors) {
      if (comp.title) {
        gaps.push(comp.title);
      }
    }

    // Deduplicate and limit
    return [...new Set(gaps)].slice(0, 20);
  }
}
