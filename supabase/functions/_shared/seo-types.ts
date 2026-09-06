/**
 * SEO Article Agent Tool — Type Definitions
 *
 * All TypeScript interfaces for the SEO pipeline:
 * Research → Plan → Write → Analyze → Deliver
 *
 * These types flow between edge functions and are stored in the database.
 */

// ════════════════════════════════════════════════════════════════
// KEYWORD RESEARCH
// ════════════════════════════════════════════════════════════════

export interface KeyTerm {
  term: string;
  searchVolume: number;
  competition: number; // 0-1
  cpc: number;
  keywordDifficulty: number | null; // 0-100
  importance: number; // 1-10 derived
  usage: number; // Count in article content (filled post-write)
  usageRange: string; // e.g. "1-9"
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  opportunityScore: number; // Composite 0-100
}

export interface KeywordCluster {
  clusterName: string;
  primaryKeyword: KeyTerm;
  secondaryKeywords: KeyTerm[];
  lsiKeywords: string[];
  questions: string[];
}

export interface CompetitorData {
  url: string;
  title: string;
  domain: string;
  position: number;
  wordCount: number;
  headings: string[];
  contentScore: number | null;
  domainAuthority: number | null;
}

export interface SerpFeatures {
  hasAiOverview: boolean;
  aiOverviewSources: { url: string; title: string; domain: string }[];
  hasFeaturedSnippet: boolean;
  featuredSnippetType: string | null; // paragraph, list, table
  featuredSnippetContent: string | null;
  hasKnowledgeGraph: boolean;
  hasPeopleAlsoAsk: boolean;
  serpFeatureTypes: string[]; // all unique SERP feature types found
}

export interface ContentLandscapeSummary {
  avgWordCount: number;
  avgContentScore: number;
  avgDomainRank: number;
  dateRange: { earliest: string; latest: string };
  contentTypes: Record<string, number>;
  sentiments: Record<string, number>;
}

/**
 * Mention-monitoring opportunity card. Mirror of `Opportunity.to_dict()` in
 * `mention_opportunity_service.py`. Surfaced inside `KeywordResearchResult`
 * via the parallel `/opportunities-stateless` call so the rest of the SEO
 * pipeline (plan / write / analyze) can read AI Overview text, featured-
 * snippet targets, PAA answers, related searches, video / news / shopping
 * carousels, knowledge-graph presence, and paid competition straight off
 * the research blob — no extra calls, no extra credits.
 */
export interface MentionOpportunity {
  type: string;
  title: string;
  rationale: string;
  suggested_action: string;
  priority_score: number; // 0..1
  source: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

/**
 * SERP-derived signals consumed by the SEO pipeline. Populated by the
 * mention-monitoring `/opportunities-stateless` endpoint. Optional — when
 * the call fails or the secret/URL is missing, this stays undefined and
 * the pipeline falls back to its baseline behavior.
 */
export interface SerpSignalBlob {
  opportunities: MentionOpportunity[];
  errors: Record<string, string>;
  fetchedAt: string; // ISO timestamp
  // Quick-access derived projections so downstream stages don't have to
  // re-walk the opportunities array. All optional.
  aiOverviewText?: string | null;
  aiOverviewReferences?: { url?: string; domain?: string; title?: string }[];
  aiOverviewBrandMentioned?: boolean;
  featuredSnippetTarget?: { domain?: string; description?: string; url?: string } | null;
  relatedSearches?: string[];
  topCompetitors?: { rank?: number; domain: string; url?: string; title?: string }[];
  videoCarouselPresent?: boolean;
  videoCarouselPlatforms?: Record<string, number>;
  newsStories?: { source?: string; domain?: string; url?: string; title?: string }[];
  knowledgeGraphPresent?: boolean;
  paidCompetitors?: { domain: string; rank?: number; url?: string }[];
  shoppingListings?: { seller?: string; domain?: string; price?: number | string; currency?: string }[];
  paaAnswers?: { question: string; answerSnippet?: string }[];
  keywordIntents?: Record<string, string>;
}

export interface KeywordResearchResult {
  topic: string;
  targetKeyword: string;
  clusters: KeywordCluster[];
  serpInsights: CompetitorData[];
  recommendedPrimary: KeyTerm;
  recommendedSecondaries: KeyTerm[];
  totalAddressableVolume: number;
  contentGapOpportunities: string[];
  paaQuestions: string[];
  serpFeatures: SerpFeatures;
  contentLandscape: ContentLandscapeSummary;
  researchedAt: string; // ISO timestamp
  /** Mention-monitoring SERP signals (Phase 1 wiring). Optional — never blocks the pipeline. */
  serpSignals?: SerpSignalBlob;
}

// ════════════════════════════════════════════════════════════════
// CONTENT BRIEF (structured input)
// ════════════════════════════════════════════════════════════════

export interface ContentBrief {
  // Business Context
  businessObjective:
    | 'lead_generation'
    | 'brand_awareness'
    | 'customer_retention'
    | 'revenue_growth'
    | 'thought_leadership';
  conversionGoal: string | null;

  // Audience Definition
  audience: {
    primaryPersona: string;
    knowledgeLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    painPoints: string[];
    decisionStage: 'awareness' | 'consideration' | 'decision';
    contentPreferences: string | null;
  };

  // Brand Voice
  brandVoice: {
    toneAttributes: string[];
    personalityTraits: string[];
    writingStyle: string | null;
    terminologyPreferences: string[];
    avoidList: string[];
    exampleContentUrls: string[];
  };

  // Content Requirements
  contentType:
    | 'blog_post'
    | 'guide'
    | 'listicle'
    | 'case_study'
    | 'comparison'
    | 'how_to'
    | 'thought_leadership';
  callToAction: string | null;
  requiredPoints: string[];
  internalLinksContext: string[];

  // ── E-E-A-T provenance — Google's "Who / How / Why" self-assessment ──
  // Feeds the JSON-LD author/publisher block AND the visible byline appended at
  // finalize. Optional on purpose: when it is absent the analyzer raises a
  // `provenance` fix rather than the pipeline inventing an author, because a
  // fabricated byline is worse than no byline.
  provenance?: {
    authorName: string | null;
    authorTitle: string | null;
    authorBio: string | null;
    authorUrl: string | null;
    /** Falls back to the connected website's display name when null. */
    publisherName: string | null;
    /** Named human who checked the draft — the strongest signal on YMYL topics. */
    reviewedBy: string | null;
    /** "How" — Google asks for automation to be disclosed, not hidden. */
    aiDisclosure: 'ai_generated' | 'ai_assisted' | 'human_written' | null;
  } | null;

  // ── First-hand experience — the "E" in E-E-A-T ──────────────────────
  // Everything else the writer sees is derived from the SERP it is trying to
  // outrank, so without this block the article contains nothing a reader could
  // not already get from the incumbents. This is the only input that carries
  // information Google cannot find anywhere else.
  firsthandExperience?: {
    /** Numbers we measured ourselves, not sourced from a competitor page. */
    proprietaryData: string[];
    /** Our own products, projects, installations, customers. */
    ownedExamples: string[];
    /** How we know it — test setup, sample size, time period. */
    methodology: string | null;
    /** Why we are qualified — years in the trade, certifications, volume handled. */
    credentials: string | null;
  } | null;

  // Cluster Context
  clusterContext: {
    pillarTopic: string | null;
    relatedArticles: string[];
    differentiationNote: string | null;
  } | null;

  // Performance Feedback (for iterative improvement)
  performanceFeedback: {
    previousArticleScores: { title: string; score: number; topIssue: string }[];
    audienceFeedbackNotes: string | null;
    promptRefinements: string | null;
  } | null;
}

// ════════════════════════════════════════════════════════════════
// ARTICLE PLAN
// ════════════════════════════════════════════════════════════════

export interface ArticleSection {
  heading: string;
  headingLevel: 'h1' | 'h2' | 'h3' | 'h4';
  targetKeywords: string[];
  description: string;
  estimatedWordCount: number;
  includeFaq: boolean;
  includeTable: boolean;
  includeList: boolean;
  subsections: ArticleSection[];
}

export type SchemaType =
  | 'Article'
  | 'FAQPage'
  | 'HowTo'
  | 'Review'
  | 'Product'
  | 'ItemList';

export interface ArticlePlan {
  title: string; // H1 heading
  metaTitle: string; // ≤60 chars
  metaDescription: string; // ≤155 chars
  slug: string; // URL slug
  primaryKeyword: string;
  secondaryKeywords: string[];
  lsiKeywords: string[];
  sections: ArticleSection[];
  targetWordCount: number;
  searchIntent:
    | 'informational'
    | 'navigational'
    | 'commercial'
    | 'transactional';
  recommendedSchema: SchemaType[];
  featuredSnippetTarget: string | null;
  faqQuestions: string[];
  entityMentions: string[]; // GEO: named entities
  citationSources: string[]; // GEO: authority sources
  statisticalClaims: string[]; // GEO: data points
}

// ════════════════════════════════════════════════════════════════
// CONTENT ANALYSIS
// ════════════════════════════════════════════════════════════════

export interface SectionScore {
  status: 'all_good' | 'issues_found';
  issueCount: number;
  details: string[];
}

export interface ContentFix {
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
  affectedSection: string | null;
  autoFixable: boolean;
  applied: boolean;
  /**
   * What this fix can actually be applied TO.
   *
   *  - `section` — one located block, carried verbatim in `anchor`. Applying it rewrites
   *    that block and nothing else, so a bad edit can only damage the paragraph it touched.
   *  - `document` — a property of the article as a whole (keyword density, depth, entity
   *    coverage). There is no single paragraph to rewrite.
   *  - `config` — not in the body at all. Meta tags come from the plan; provenance and
   *    firsthand experience come from the content brief. Rewriting prose cannot fix these,
   *    which is why they are the ones that keep the score down no matter how often the
   *    fixer runs.
   *
   * Absent means `document`, so an unclassified fix is never offered a targeted apply.
   */
  scope?: 'section' | 'document' | 'config';
  /**
   * The exact block this fix is about, VERBATIM, when `scope` is `section`.
   *
   * Verbatim rather than a heading name on purpose: applying a fix is then a string
   * replace, not a fuzzy search for "the section called Introduction" in a document whose
   * headings are in Greek and may repeat. The analyzer already computes these — it found
   * the paragraphs over 80 words and then set `affectedSection: null` and threw the
   * location away.
   */
  anchor?: string | null;
  /**
   * Facets of ONE finding, penalised ONCE between them.
   *
   * "5 paragraphs exceed 80 words" is one problem with the article. Reporting it as four
   * individually-applicable fixes plus an overflow summary made it four penalties plus one,
   * and the score fell 66 → 48 for an article nobody had touched. The score measures the
   * ARTICLE; it must not move because the analyzer changed how it presents a finding.
   *
   * Fixes sharing a group cost the group's severity once. Absent means a fix stands alone.
   */
  penaltyGroup?: string;
}

export interface GEOScore {
  overall: number; // 0-100
  signals: {
    statisticsWithAttribution: number;
    namedEntities: number;
    structuredDefinitions: number;
    expertQuotes: number;
    faqCoverage: number;
    schemaCoverage: number;
    sourceCitations: number;
    directAnswers: number;
    /**
     * Unattributed-claim penalty. This was a HEDGING penalty ("might", "perhaps",
     * "possibly") until 2026-08-10, which scored an article UP for stating things
     * it could not support as flat fact — the exact inverse of Google's
     * helpful-content guidance on easily-verified factual errors, and actively
     * dangerous on YMYL topics. It now penalizes the real problem: a confident
     * claim with nobody behind it ("studies show", "experts agree").
     */
    claimAttribution: number;
    selfContainedParagraphs: number;
    /**
     * Content freshness (#349 C1). Answer engines cite recently-updated pages
     * materially more often than the same page left to age, and nothing in this
     * analyzer had any notion of age at all — a three-year-old article and one
     * written this morning scored identically.
     *
     * Fed by `content_dated_at` on the request (the article's `last_reviewed_at`,
     * falling back to `completed_at`). ABSENT for a draft being analysed before it
     * has ever been published, which is not the same as stale: an unpublished draft
     * scores full marks rather than being penalised for a date it cannot have.
     */
    freshness: number;
  };
  recommendations: string[];
}

export interface ContentAnalysisResult {
  overallScore: number; // 0-100
  wordCount: number;
  readabilityScore: number | null;
  sentimentPolarity: string | null;
  keywordDensity: Record<string, number>;
  topEntities: string[];
  fixes: ContentFix[];
  geoScore: GEOScore;
  sectionScores: {
    promptCoverage: SectionScore;
    schemaMarkup: SectionScore;
    keyTerms: SectionScore;
    metaTags: SectionScore;
    url: SectionScore;
    featuredSnippet: SectionScore;
    h1Heading: SectionScore;
    links: SectionScore;
    h2h6Headings: SectionScore;
    contentDepth: SectionScore;
    keywordDensity: SectionScore;
    /** Google's "Who / How / Why" — author byline, AI disclosure, first-hand experience. */
    helpfulContent: SectionScore;
  };
}

// ════════════════════════════════════════════════════════════════
// GAPS / GAINS
// ════════════════════════════════════════════════════════════════

export interface MissingTopic {
  /** The keyword, question or section heading — never a competitor's page title. */
  topic: string;
  type: 'gap' | 'gain';
  /** Where the topic came from, so a reader knows what they are being shown. */
  source: 'keyword' | 'question' | 'competitor_heading';
  /**
   * Monthly searches, from DataForSEO. NULL when there is no usable figure — which includes the
   * 0 the client writes when the API returns nothing, since the two are indistinguishable by the
   * time they get here and neither is a number to rank decisions by.
   */
  searchVolume: number | null;
  /** How many ranked competitors mention it, counted — not the flat `3` this used to carry. */
  competitorCount: number;
  /** 0-1, from the keyword's opportunity score where research computed one. */
  relevanceScore: number;
  /** The query names a competitor's brand: worth seeing, rarely worth writing. */
  competitorBrand?: boolean;
}

// ════════════════════════════════════════════════════════════════
// RESEARCH TAB DATA
// ════════════════════════════════════════════════════════════════

export interface QuestionData {
  question: string;
  source: 'paa' | 'autocomplete' | 'related' | 'generated';
  volume: number | null;
  answered: boolean;
}

export interface ContentStatistics {
  avgWordCount: number;
  avgContentScore: number;
  sentimentDistribution: Record<string, number>;
  publicationDateRange: { earliest: string; latest: string };
  contentTypeDistribution: Record<string, number>;
}

// ════════════════════════════════════════════════════════════════
// ARTICLE OUTPUT (full Frase-style report)
// ════════════════════════════════════════════════════════════════

export interface ArticleOutput {
  // Article Content
  id: string; // UUID from Supabase
  topic: string;
  targetKeyword: string;
  title: string;
  contentMarkdown: string;
  contentHtml: string;
  wordCount: number;

  // SEO Metadata
  metaTitle: string;
  metaDescription: string;
  slug: string;
  primaryKeyword: string;
  secondaryKeywords: string[];
  schemaMarkup: object; // JSON-LD
  faqSchema: { question: string; answer: string }[];

  // Tab: Optimize
  optimize: {
    contentScore: number; // 0-100
    avgCompetitorScore: number;
    topCompetitorScore: number;
    geoScore: GEOScore;
    sectionScores: ContentAnalysisResult['sectionScores'];
  };

  // Tab: Brief
  brief: {
    generalInstructions: {
      targetImages: string; // e.g. "5-7"
      targetWordCount: string; // e.g. "2300+"
      targetHeadings: string; // e.g. "24-30"
    };
    outline: ArticleSection[];
    faqQuestions: { id: string; question: string }[];
    keyTerms: string[];
  };

  // Tab: Gaps/Gains
  gapsGains: {
    all: MissingTopic[];
    gaps: MissingTopic[];
    gains: MissingTopic[];
    gapCount: number;
    gainCount: number;
  };

  // Tab: Research
  research: {
    keyTerms: KeyTerm[];
    competition: CompetitorData[];
    questions: QuestionData[];
    statistics: ContentStatistics;
    serpFeatures: SerpFeatures;
    detailedReport: object;
  };

  // Tab: Inter-linking
  interlinking: {
    suggestedLinks: {
      anchor: string;
      targetTopic: string;
      reason: string;
    }[];
    existingArticles: {
      id: string;
      title: string;
      slug: string;
      relevance: number;
    }[];
    competitorArticles: CompetitorData[];
  };

  // Pipeline Metadata
  pipelineLog: string[];
  fixIterations: number;
  status: 'draft' | 'generating' | 'completed' | 'failed' | 'published';
  createdAt: string;
}

// ════════════════════════════════════════════════════════════════
// EDGE FUNCTION REQUEST / RESPONSE TYPES
// ════════════════════════════════════════════════════════════════

export interface SEOResearchRequest {
  topic: string;
  target_keyword: string;
  language_code?: string; // default: 'en'
  location_code?: number; // default: 2840 (US)
  user_id?: string; // passed by agent tools for credit debit
}

export interface SEOResearchResponse {
  success: boolean;
  data?: {
    research_id: string;
    research: KeywordResearchResult;
    credits_used: number;
  };
  error?: string;
}

export interface SEOPlanRequest {
  topic: string;
  target_keyword: string;
  keyword_research: KeywordResearchResult;
  content_brief?: ContentBrief;
  additional_instructions?: string;
  user_id?: string;
}

export interface SEOPlanResponse {
  success: boolean;
  data?: {
    plan: ArticlePlan;
    credits_used: number;
  };
  error?: string;
}

export interface SEOWriteRequest {
  article_plan: ArticlePlan;
  content_brief?: ContentBrief;
  keyword_research_summary?: Partial<KeywordResearchResult>;
  user_id?: string;
}

export interface SEOWriteResponse {
  success: boolean;
  data?: {
    content_markdown: string;
    word_count: number;
    title: string;
    credits_used: number;
  };
  error?: string;
}

export interface SEOAnalyzeRequest {
  content_markdown: string;
  article_plan: ArticlePlan;
  content_brief?: ContentBrief;
  auto_fix?: boolean; // default: true
  max_iterations?: number; // default: 3
  user_id?: string;
  /** Phase 4 — mention-monitoring SERP signals. Drives 6 extra gap-scoring
   * rules (AI Overview match, featured-snippet alignment, PAA coverage,
   * related-search coverage, entity authority, intent alignment). */
  serp_signals?: SerpSignalBlob;
  /**
   * When this content was last materially written or reviewed, ISO-8601. Drives the
   * `freshness` GEO signal. Omit for a draft that has never been published — the
   * signal then scores full marks instead of penalising an article for having no
   * publication date yet.
   *
   * Read it from `seo_article_freshness.content_dated_at`; do NOT pass `updated_at`,
   * which any write touches and which therefore says nothing about the content.
   */
  content_dated_at?: string;
  /**
   * A stored `seo_articles` row to score. When supplied, the handler DERIVES
   * `content_dated_at` from `seo_article_freshness` and ignores whatever the caller
   * sent — the article's own review date is the fact, and a client-supplied one is at
   * best a copy of it.
   */
  article_id?: string;
}

export interface SEOAnalyzeResponse {
  success: boolean;
  data?: {
    content_markdown: string;
    word_count: number;
    analysis: ContentAnalysisResult;
    fix_iterations: number;
    meets_threshold: boolean;
    credits_used: number;
  };
  error?: string;
}

export interface SEOPipelineRequest {
  topic: string;
  target_keyword: string;
  content_brief?: ContentBrief;
  additional_instructions?: string;
  auto_fix?: boolean; // default: true
  max_fix_iterations?: number; // default: 3
  language_code?: string; // default: 'en'
  location_code?: number; // default: 2840 (US)
  skip_research?: boolean;
  existing_research?: KeywordResearchResult;
  user_id?: string;
}

export interface SEOPipelineResponse {
  success: boolean;
  data?: {
    article_id: string;
    article: ArticleOutput;
  };
  error?: string;
}

// ════════════════════════════════════════════════════════════════
// PIPELINE STATUS (for async polling)
// ════════════════════════════════════════════════════════════════

export type PipelineStage =
  | 'research'
  | 'plan'
  | 'write'
  | 'analyze'
  | 'finalize'
  | 'done';

export type ArticleStatus =
  | 'draft'
  | 'researching'
  | 'planning'
  | 'writing'
  | 'analyzing'
  | 'completed'
  | 'failed';

export interface PipelineStageData {
  stage: PipelineStage;
  started_at: string;
  completed_at: string | null;
  result: unknown; // stage-specific intermediate result
  error: string | null;
}
