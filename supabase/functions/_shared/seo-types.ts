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
    authorityTone: number;
    selfContainedParagraphs: number;
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
  };
}

// ════════════════════════════════════════════════════════════════
// GAPS / GAINS
// ════════════════════════════════════════════════════════════════

export interface MissingTopic {
  topic: string;
  type: 'gap' | 'gain';
  competitorCount: number; // How many competitors cover it
  relevanceScore: number;
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
