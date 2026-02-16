/**
 * SEOArticleViewer — Frase-style SEO article viewer with 5 tabs
 *
 * Embeddable in agent chat AND standalone pages.
 * Polls seo_articles table for async pipeline progress.
 *
 * Tabs: Optimize | Brief | Gaps/Gains | Research | Inter-linking
 *
 * Type interfaces match the actual data structures written by seo-pipeline/index.ts
 * and defined in _shared/seo-types.ts (ArticleOutput).
 */

import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Progress } from '@/components/core/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  CheckCircle2,
  Circle,
  Loader2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Maximize2,
  Minimize2,
  FileText,
  BarChart3,
  Search,
  Link2,
  ListChecks,
  Copy,
  Check,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  Sparkles,
  MessageSquare,
  Brain,
} from 'lucide-react';

// ─── Types (matching seo-pipeline output / ArticleOutput) ───────

interface SEOArticle {
  id: string;
  title: string | null;
  slug: string | null;
  target_keyword: string;
  secondary_keywords: string[];
  content_type: string;
  markdown_content: string | null;
  html_content: string | null;
  meta_title: string | null;
  meta_description: string | null;
  article_plan: any;
  content_brief: any;
  content_analysis: any;
  schema_markup: any;
  faq_schema: any;
  optimize_data: OptimizeData | null;
  brief_data: BriefData | null;
  gaps_gains_data: GapsGainsData | null;
  research_tab_data: ResearchTabData | null;
  interlinking_data: InterlinkingData | null;
  overall_score: number | null;
  seo_score: number | null;
  readability_score: number | null;
  word_count: number;
  reading_time_minutes: number;
  keyword_density: any;
  status: string;
  progress_percentage: number;
  current_stage: string | null;
  stages_data: any;
  pipeline_log: string[];
  fix_iterations: number;
  credits_used: number;
  processing_time_ms: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

interface GEOScore {
  overall: number;
  signals: Record<string, number>;
  recommendations: string[];
}

interface SerpFeatures {
  hasAiOverview: boolean;
  aiOverviewSources: { url: string; title: string; domain: string }[];
  hasFeaturedSnippet: boolean;
  featuredSnippetType: string | null;
  featuredSnippetContent: string | null;
  hasKnowledgeGraph: boolean;
  hasPeopleAlsoAsk: boolean;
  serpFeatureTypes: string[];
}

// Matches ArticleOutput.optimize from seo-pipeline
interface OptimizeData {
  contentScore: number;
  avgCompetitorScore: number;
  topCompetitorScore: number;
  geoScore?: GEOScore;
  sectionScores: Record<string, SectionScore>;
}

// Matches ContentAnalysisResult.sectionScores[key]
interface SectionScore {
  status: 'all_good' | 'issues_found';
  issueCount: number;
  details: string[];
}

// Matches ArticleOutput.brief from seo-pipeline
interface BriefData {
  generalInstructions: {
    targetImages: string;
    targetWordCount: string;
    targetHeadings: string;
  };
  outline: ArticleSection[];
  faqQuestions: { id: string; question: string }[];
  keyTerms: string[];
}

interface ArticleSection {
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

// Matches ArticleOutput.gapsGains from seo-pipeline
interface GapsGainsData {
  all: MissingTopic[];
  gaps: MissingTopic[];
  gains: MissingTopic[];
  gapCount: number;
  gainCount: number;
}

interface MissingTopic {
  topic: string;
  type: 'gap' | 'gain';
  competitorCount: number;
  relevanceScore: number;
}

// Matches ArticleOutput.research from seo-pipeline
interface ResearchTabData {
  keyTerms: KeyTerm[];
  competition: CompetitorData[];
  questions: QuestionData[];
  statistics: ContentStatistics;
  serpFeatures?: SerpFeatures;
  detailedReport: any;
}

interface KeyTerm {
  term: string;
  searchVolume: number;
  competition: number;
  cpc: number;
  keywordDifficulty: number | null;
  importance: number;
  usage: number;
  usageRange: string;
  trend: 'up' | 'down' | 'stable';
  trendDelta: number;
  opportunityScore: number;
}

interface CompetitorData {
  url: string;
  title: string;
  domain: string;
  position: number;
  wordCount: number;
  headings: string[];
  contentScore: number | null;
  domainAuthority: number | null;
}

interface QuestionData {
  question: string;
  source: 'paa' | 'autocomplete' | 'related' | 'generated';
  volume: number | null;
  answered: boolean;
}

interface ContentStatistics {
  avgWordCount: number;
  avgContentScore: number;
  sentimentDistribution: Record<string, number>;
  publicationDateRange: { earliest: string; latest: string };
  contentTypeDistribution: Record<string, number>;
}

// Matches ArticleOutput.interlinking from seo-pipeline
interface InterlinkingData {
  suggestedLinks: { anchor: string; targetTopic: string; reason: string }[];
  existingArticles: { id: string; title: string; slug: string; relevance: number }[];
  competitorArticles?: CompetitorData[];
}

// ─── Constants ──────────────────────────────────────────────────

const PIPELINE_STAGES: { key: string; label: string }[] = [
  { key: 'research', label: 'Research' },
  { key: 'plan', label: 'Planning' },
  { key: 'write', label: 'Writing' },
  { key: 'analyze', label: 'Analyzing' },
  { key: 'done', label: 'Done' },
];

// Human-readable names for section score keys
const SECTION_NAMES: Record<string, string> = {
  promptCoverage: 'Prompt Coverage',
  schemaMarkup: 'Schema Markup',
  keyTerms: 'Key Terms',
  metaTags: 'Meta Tags',
  url: 'URL Structure',
  featuredSnippet: 'Featured Snippet',
  h1Heading: 'H1 Heading',
  links: 'Links',
  h2h6Headings: 'H2-H6 Headings',
  contentDepth: 'Content Depth',
  keywordDensity: 'Keyword Density',
};

const GEO_SIGNAL_NAMES: Record<string, string> = {
  statisticsWithAttribution: 'Statistics w/ Attribution',
  namedEntities: 'Named Entities',
  structuredDefinitions: 'Structured Definitions',
  expertQuotes: 'Expert Quotes',
  faqCoverage: 'FAQ Coverage',
  schemaCoverage: 'Schema Coverage',
  sourceCitations: 'Source Citations',
  directAnswers: 'Direct Answers',
  authorityTone: 'Authority Tone',
  selfContainedParagraphs: 'Self-Contained Paragraphs',
};

// ─── Adaptive Polling Hook ──────────────────────────────────────

function useAdaptivePolling(
  articleId: string,
  onData: (data: SEOArticle) => void,
  shouldPoll: boolean,
) {
  useEffect(() => {
    if (!articleId || !shouldPoll) return;

    let pollCount = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isCancelled = false;

    const getInterval = (count: number): number => {
      if (count < 5) return 1000;
      if (count < 15) return 3000;
      if (count < 30) return 5000;
      return 10000;
    };

    const poll = async () => {
      if (isCancelled) return;

      const { data, error } = await supabase
        .from('seo_articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (error) {
        console.error('SEO article poll error:', error);
        if (!isCancelled) {
          pollCount++;
          timeoutId = setTimeout(poll, getInterval(pollCount));
        }
        return;
      }

      if (data) {
        onData(data as SEOArticle);

        if (data.status === 'completed' || data.status === 'failed') {
          return; // Stop polling
        }

        if (!isCancelled) {
          pollCount++;
          timeoutId = setTimeout(poll, getInterval(pollCount));
        }
      }
    };

    poll();

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [articleId, shouldPoll]);
}

// ─── Score Gauge Component ──────────────────────────────────────

function ScoreGauge({ score, label, size = 'lg' }: { score: number; label: string; size?: 'sm' | 'lg' }) {
  const color = score >= 80 ? 'text-green-500' : score >= 60 ? 'text-yellow-500' : 'text-red-500';
  const bgColor = score >= 80 ? 'bg-green-500/10' : score >= 60 ? 'bg-yellow-500/10' : 'bg-red-500/10';
  const dims = size === 'lg' ? 'w-24 h-24' : 'w-16 h-16';
  const textSize = size === 'lg' ? 'text-3xl' : 'text-xl';

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`${dims} ${bgColor} rounded-full flex items-center justify-center border-2 ${color.replace('text-', 'border-')}`}>
        <span className={`${textSize} font-bold ${color}`}>{score}</span>
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ─── Pipeline Progress Component ────────────────────────────────

function PipelineProgress({ currentStage, progress, status }: { currentStage: string | null; progress: number; status: string }) {
  const currentIndex = PIPELINE_STAGES.findIndex((s) => s.key === currentStage);

  return (
    <div className="space-y-4">
      {/* Stage indicators */}
      <div className="flex items-center justify-between">
        {PIPELINE_STAGES.map((stage, i) => {
          const isCompleted = currentIndex > i || status === 'completed';
          const isCurrent = currentIndex === i && status !== 'completed' && status !== 'failed';

          return (
            <React.Fragment key={stage.key}>
              <div className="flex flex-col items-center gap-1">
                {isCompleted ? (
                  <CheckCircle2 className="w-6 h-6 text-green-500" />
                ) : isCurrent ? (
                  <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
                ) : (
                  <Circle className="w-6 h-6 text-muted-foreground/30" />
                )}
                <span className={`text-xs ${isCurrent ? 'text-blue-500 font-medium' : isCompleted ? 'text-green-500' : 'text-muted-foreground/50'}`}>
                  {stage.label}
                </span>
              </div>
              {i < PIPELINE_STAGES.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${isCompleted ? 'bg-green-500' : 'bg-muted-foreground/20'}`} />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Progress bar */}
      <div className="space-y-1">
        <Progress value={progress} className="h-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>
            {status === 'failed' ? 'Failed' : status === 'completed' ? 'Complete' : `${progress}%`}
          </span>
          <span>
            {currentStage === 'research' && 'Researching keywords with DataForSEO...'}
            {currentStage === 'plan' && 'Planning article structure with Gemini...'}
            {currentStage === 'write' && 'Writing article with Claude Sonnet...'}
            {currentStage === 'analyze' && 'Analyzing content quality...'}
            {currentStage === 'finalize' && 'Finalizing report...'}
            {currentStage === 'done' && 'Complete!'}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Optimize Tab ───────────────────────────────────────────────

function OptimizeTab({ data, overallScore }: { data: OptimizeData; overallScore: number }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Convert sectionScores dict to array for rendering
  const sections = useMemo(() => {
    if (!data.sectionScores) return [];
    return Object.entries(data.sectionScores).map(([key, score]) => ({
      key,
      name: SECTION_NAMES[key] || key,
      ...score,
    }));
  }, [data.sectionScores]);

  return (
    <div className="space-y-6">
      {/* Score header */}
      <div className="flex items-center gap-8 flex-wrap">
        <ScoreGauge score={overallScore} label="SEO Score" size="lg" />
        {data.geoScore && (
          <ScoreGauge score={data.geoScore.overall} label="GEO Score" size="lg" />
        )}
        {data.avgCompetitorScore > 0 && (
          <ScoreGauge score={data.avgCompetitorScore} label="Avg Score" size="sm" />
        )}
        {data.topCompetitorScore > 0 && (
          <ScoreGauge score={data.topCompetitorScore} label="Top Score" size="sm" />
        )}
      </div>

      {/* GEO Signal Breakdown */}
      {data.geoScore && (
        <div className="border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">GEO Signals (AI Citation Readiness)</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.geoScore.signals).map(([key, value]) => (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{GEO_SIGNAL_NAMES[key] || key}</span>
                <span className={value > 0 ? 'text-green-500 font-medium' : 'text-muted-foreground'}>{value}pts</span>
              </div>
            ))}
          </div>
          {data.geoScore.recommendations.length > 0 && (
            <div className="mt-2 pt-2 border-t space-y-1">
              <h4 className="text-xs font-semibold text-muted-foreground">Recommendations</h4>
              {data.geoScore.recommendations.map((rec, i) => (
                <p key={i} className="text-xs text-muted-foreground">{rec}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Section scores */}
      <div className="space-y-2">
        {sections.map((section) => (
          <div key={section.key} className="border rounded-lg">
            <button
              className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors"
              onClick={() => setExpanded((prev) => ({ ...prev, [section.key]: !prev[section.key] }))}
            >
              <div className="flex items-center gap-2">
                {section.status === 'all_good' ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                )}
                <span className="text-sm font-medium">{section.name}</span>
              </div>
              <div className="flex items-center gap-2">
                {section.issueCount > 0 ? (
                  <Badge variant="secondary" className="text-xs">
                    {section.issueCount} issue{section.issueCount > 1 ? 's' : ''}
                  </Badge>
                ) : (
                  <span className="text-xs text-green-500">All good</span>
                )}
                {expanded[section.key] ? (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                )}
              </div>
            </button>
            {expanded[section.key] && section.details?.length > 0 && (
              <div className="px-3 pb-3 space-y-1">
                {section.details.map((detail, i) => (
                  <p key={i} className="text-xs text-muted-foreground pl-6">
                    {detail}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Brief Tab ──────────────────────────────────────────────────

function BriefTab({ data }: { data: BriefData }) {
  // Flatten sections into outline items for rendering
  const outlineItems = useMemo(() => {
    const items: { level: number; text: string }[] = [];
    const headingToLevel = (h: string) => parseInt(h.replace('h', ''), 10) || 2;
    const flatten = (sections: ArticleSection[]) => {
      for (const section of sections) {
        items.push({ level: headingToLevel(section.headingLevel), text: section.heading });
        if (section.subsections?.length) {
          flatten(section.subsections);
        }
      }
    };
    if (data.outline) flatten(data.outline);
    return items;
  }, [data.outline]);

  // Convert generalInstructions object to array for rendering
  const instructions = useMemo(() => {
    if (!data.generalInstructions) return [];
    const gi = data.generalInstructions;
    return [
      { label: 'Target Images', value: gi.targetImages },
      { label: 'Target Word Count', value: gi.targetWordCount },
      { label: 'Target Headings', value: gi.targetHeadings },
    ].filter((inst) => inst.value);
  }, [data.generalInstructions]);

  return (
    <div className="space-y-6">
      {/* Instructions */}
      {instructions.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">General Instructions</h3>
          <div className="space-y-2">
            {instructions.map((inst, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="font-medium text-muted-foreground min-w-[140px]">{inst.label}:</span>
                <span>{inst.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outline */}
      {outlineItems.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Content Outline</h3>
          <div className="space-y-1 border rounded-lg p-3">
            {outlineItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2" style={{ paddingLeft: `${(item.level - 1) * 16}px` }}>
                <span className="text-xs text-muted-foreground font-mono min-w-[24px]">H{item.level}</span>
                <span className="text-sm">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* FAQ Questions */}
      {data.faqQuestions?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">FAQ Questions</h3>
          <ul className="space-y-1">
            {data.faqQuestions.map((q, i) => (
              <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                <span className="text-blue-500 mt-0.5">Q:</span>
                <span>{typeof q === 'string' ? q : q.question}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key Terms */}
      {data.keyTerms?.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-3">Key Terms to Include</h3>
          <div className="flex flex-wrap gap-1.5">
            {data.keyTerms.map((term, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {term}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Gaps/Gains Tab ─────────────────────────────────────────────

function GapsGainsTab({ data }: { data: GapsGainsData }) {
  const [filter, setFilter] = useState<'all' | 'gap' | 'gain'>('all');

  const allTopics = data.all || [];
  const filtered = useMemo(() => {
    if (filter === 'all') return allTopics;
    if (filter === 'gap') return data.gaps || [];
    return data.gains || [];
  }, [allTopics, data.gaps, data.gains, filter]);

  const gapCount = data.gapCount ?? (data.gaps?.length || 0);
  const gainCount = data.gainCount ?? (data.gains?.length || 0);

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2">
        <Button
          variant={filter === 'all' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('all')}
        >
          All ({allTopics.length})
        </Button>
        <Button
          variant={filter === 'gap' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('gap')}
          className={filter === 'gap' ? 'bg-red-500 hover:bg-red-600' : ''}
        >
          Gaps ({gapCount})
        </Button>
        <Button
          variant={filter === 'gain' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setFilter('gain')}
          className={filter === 'gain' ? 'bg-green-500 hover:bg-green-600' : ''}
        >
          Gains ({gainCount})
        </Button>
      </div>

      {/* Topic list */}
      <div className="space-y-2">
        {filtered.map((topic, i) => (
          <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
            <div className="flex items-center gap-3">
              <Badge
                variant="secondary"
                className={topic.type === 'gap' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}
              >
                {topic.type}
              </Badge>
              <span className="text-sm">{topic.topic}</span>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>{topic.competitorCount} competitors</span>
              <span>Relevance: {Math.round(topic.relevanceScore * 100)}%</span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">No topics found</p>
        )}
      </div>
    </div>
  );
}

// ─── Research Tab ───────────────────────────────────────────────

function ResearchTab({ data }: { data: ResearchTabData }) {
  const [subTab, setSubTab] = useState<'terms' | 'competition' | 'questions' | 'stats'>('terms');

  const TrendIcon = ({ trend }: { trend: string }) => {
    if (trend === 'up') return <TrendingUp className="w-3 h-3 text-green-500" />;
    if (trend === 'down') return <TrendingDown className="w-3 h-3 text-red-500" />;
    return <Minus className="w-3 h-3 text-muted-foreground" />;
  };

  // Convert importance number (1-10) to label
  const importanceLabel = (score: number): 'high' | 'medium' | 'low' => {
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  };

  // Convert statistics object to renderable entries
  const statsEntries = useMemo(() => {
    if (!data.statistics) return [];
    const s = data.statistics;
    const entries: { label: string; value: string | number }[] = [];
    if (s.avgWordCount > 0) entries.push({ label: 'Avg Word Count', value: s.avgWordCount.toLocaleString() });
    if (s.avgContentScore > 0) entries.push({ label: 'Avg Content Score', value: s.avgContentScore });
    if (s.publicationDateRange?.earliest) entries.push({ label: 'Earliest Published', value: s.publicationDateRange.earliest });
    if (s.publicationDateRange?.latest) entries.push({ label: 'Latest Published', value: s.publicationDateRange.latest });
    if (Object.keys(s.sentimentDistribution || {}).length > 0) {
      entries.push({ label: 'Sentiments', value: Object.entries(s.sentimentDistribution).map(([k, v]) => `${k}: ${v}`).join(', ') });
    }
    if (Object.keys(s.contentTypeDistribution || {}).length > 0) {
      entries.push({ label: 'Content Types', value: Object.entries(s.contentTypeDistribution).map(([k, v]) => `${k}: ${v}`).join(', ') });
    }
    // If no stats available, show a message
    if (entries.length === 0) entries.push({ label: 'Data', value: 'No statistics available yet' });
    return entries;
  }, [data.statistics]);

  return (
    <div className="space-y-4">
      {/* SERP Feature Badges */}
      {data.serpFeatures && (
        <div className="flex flex-wrap gap-2">
          {data.serpFeatures.hasAiOverview && (
            <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 gap-1">
              <Sparkles className="w-3 h-3" />
              AI Overview
            </Badge>
          )}
          {data.serpFeatures.hasFeaturedSnippet && (
            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 gap-1">
              <FileText className="w-3 h-3" />
              Featured Snippet{data.serpFeatures.featuredSnippetType ? `: ${data.serpFeatures.featuredSnippetType}` : ''}
            </Badge>
          )}
          {data.serpFeatures.hasKnowledgeGraph && (
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 gap-1">
              <Brain className="w-3 h-3" />
              Knowledge Graph
            </Badge>
          )}
          {data.serpFeatures.hasPeopleAlsoAsk && (
            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 gap-1">
              <MessageSquare className="w-3 h-3" />
              People Also Ask ({data.questions?.length || 0})
            </Badge>
          )}
        </div>
      )}

      {/* AI Overview Sources (expandable) */}
      {data.serpFeatures?.hasAiOverview && data.serpFeatures.aiOverviewSources.length > 0 && (
        <details className="border rounded-lg">
          <summary className="px-3 py-2 text-xs font-medium cursor-pointer hover:bg-muted/50 flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-blue-500" />
            AI Overview Sources ({data.serpFeatures.aiOverviewSources.length})
          </summary>
          <div className="px-3 pb-3 space-y-1">
            {data.serpFeatures.aiOverviewSources.map((src, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <span className="text-muted-foreground">{src.domain}</span>
                <span className="truncate">{src.title}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Sub-tab buttons */}
      <div className="flex gap-1 border-b">
        {[
          { key: 'terms', label: 'Key Terms' },
          { key: 'competition', label: 'Competition' },
          { key: 'questions', label: 'Questions' },
          { key: 'stats', label: 'Statistics' },
        ].map((tab) => (
          <button
            key={tab.key}
            className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              subTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setSubTab(tab.key as any)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Key Terms — uses KeyTerm from seo-types */}
      {subTab === 'terms' && (
        <div className="space-y-1">
          <div className="grid grid-cols-[1fr_80px_80px_40px] gap-2 text-xs font-medium text-muted-foreground px-3 py-2">
            <span>Term</span>
            <span className="text-center">Usage</span>
            <span className="text-center">Importance</span>
            <span className="text-center">Trend</span>
          </div>
          {(data.keyTerms || []).map((term, i) => {
            const imp = importanceLabel(term.importance);
            return (
              <div key={i} className="grid grid-cols-[1fr_80px_80px_40px] gap-2 items-center px-3 py-2 rounded hover:bg-muted/50">
                <span className="text-sm">{term.term}</span>
                <span className="text-xs text-center">{term.usage}x</span>
                <span className="text-center">
                  <Badge variant="outline" className={`text-xs ${
                    imp === 'high' ? 'border-red-300 text-red-600' :
                    imp === 'medium' ? 'border-yellow-300 text-yellow-600' :
                    'border-gray-300 text-gray-500'
                  }`}>
                    {imp}
                  </Badge>
                </span>
                <span className="flex justify-center">
                  <TrendIcon trend={term.trend} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Competition — uses CompetitorData from seo-types */}
      {subTab === 'competition' && (
        <div className="space-y-2">
          {(data.competition || []).map((comp, i) => (
            <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground font-mono">#{comp.position}</span>
                  <span className="text-sm font-medium truncate">{comp.title}</span>
                </div>
                <a
                  href={comp.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-500 hover:underline truncate block"
                >
                  {comp.url}
                </a>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground ml-4">
                <span>{comp.wordCount?.toLocaleString()} words</span>
                {comp.contentScore != null && comp.contentScore > 0 && (
                  <Badge variant="secondary">{comp.contentScore}</Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Questions — uses QuestionData from seo-types */}
      {subTab === 'questions' && (
        <div className="space-y-2">
          {(data.questions || []).map((q, i) => (
            <div key={i} className="flex items-start gap-3 p-3 border rounded-lg">
              <div className={`mt-0.5 ${q.answered ? 'text-green-500' : 'text-muted-foreground/30'}`}>
                {q.answered ? <CheckCircle2 className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
              </div>
              <div>
                <p className="text-sm">{q.question}</p>
                <Badge variant="outline" className="text-xs mt-1">
                  {q.source === 'paa' ? 'People Also Ask' : q.source}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Statistics — converted from ContentStatistics object */}
      {subTab === 'stats' && (
        <div className="grid grid-cols-2 gap-3">
          {statsEntries.map((stat, i) => (
            <div key={i} className="p-3 border rounded-lg">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="text-lg font-semibold mt-1">{stat.value}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Inter-linking Tab ──────────────────────────────────────────

function InterlinkingTab({ data }: { data: InterlinkingData }) {
  return (
    <div className="space-y-3">
      {/* Suggested Links */}
      {(data.suggestedLinks || []).map((link, i) => (
        <div key={i} className="p-3 border rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-500" />
            <span className="text-sm font-medium">{link.anchor}</span>
          </div>
          <div className="pl-6 space-y-1">
            <p className="text-xs text-muted-foreground">
              Target: <span className="text-foreground">{link.targetTopic}</span>
            </p>
            <p className="text-xs text-muted-foreground">{link.reason}</p>
          </div>
        </div>
      ))}

      {/* Existing Related Articles */}
      {(data.existingArticles || []).length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-2">Related Articles</h4>
          {data.existingArticles.map((article, i) => (
            <div key={i} className="flex items-center justify-between p-2 border rounded">
              <span className="text-sm">{article.title}</span>
              <Badge variant="outline" className="text-xs">
                {Math.round(article.relevance * 100)}% match
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* Competitor Articles from SERP */}
      {(data.competitorArticles || []).length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold mb-2">Competitor Articles (SERP)</h4>
          <div className="space-y-2">
            {data.competitorArticles!.map((comp, i) => (
              <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground font-mono flex-shrink-0">#{comp.position}</span>
                    <span className="text-sm font-medium truncate">{comp.title}</span>
                  </div>
                  <a
                    href={comp.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-blue-500 hover:underline truncate block"
                  >
                    {comp.domain}
                  </a>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground ml-4 flex-shrink-0">
                  {comp.wordCount > 0 && <span>{comp.wordCount.toLocaleString()} words</span>}
                  {comp.domainAuthority != null && comp.domainAuthority > 0 && (
                    <Badge variant="outline" className="text-xs">DA {comp.domainAuthority}</Badge>
                  )}
                  {comp.contentScore != null && comp.contentScore > 0 && (
                    <Badge variant="secondary" className="text-xs">{comp.contentScore}</Badge>
                  )}
                  <a href={comp.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data.suggestedLinks || []).length === 0 && (data.existingArticles || []).length === 0 && (data.competitorArticles || []).length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No inter-linking suggestions available</p>
      )}
    </div>
  );
}

// ─── Article Content Viewer ─────────────────────────────────────

function ArticleContent({ markdown, html }: { markdown: string | null; html: string | null }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (markdown) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!markdown && !html) {
    return <p className="text-sm text-muted-foreground">No content available yet</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
      </div>
      {html ? (
        <div
          className="prose prose-sm dark:prose-invert max-w-none border rounded-lg p-4 max-h-[600px] overflow-y-auto"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      ) : (
        <pre className="text-sm whitespace-pre-wrap border rounded-lg p-4 max-h-[600px] overflow-y-auto bg-muted/30">
          {markdown}
        </pre>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

interface SEOArticleViewerProps {
  articleId: string;
}

export default function SEOArticleViewer({ articleId }: SEOArticleViewerProps) {
  const [article, setArticle] = useState<SEOArticle | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  const [loading, setLoading] = useState(true);

  const isInProgress = article && !['completed', 'failed'].includes(article.status);

  // Initial fetch
  useEffect(() => {
    const fetchArticle = async () => {
      const { data, error } = await supabase
        .from('seo_articles')
        .select('*')
        .eq('id', articleId)
        .single();

      if (!error && data) {
        setArticle(data as SEOArticle);
      }
      setLoading(false);
    };
    fetchArticle();
  }, [articleId]);

  // Adaptive polling while in progress
  useAdaptivePolling(
    articleId,
    (data) => setArticle(data),
    !!isInProgress,
  );

  if (loading) {
    return (
      <Card className="mt-3">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading article...</span>
        </CardContent>
      </Card>
    );
  }

  if (!article) {
    return (
      <Card className="mt-3">
        <CardContent className="py-6">
          <p className="text-sm text-muted-foreground">Article not found</p>
        </CardContent>
      </Card>
    );
  }

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 bg-background overflow-y-auto p-6'
    : 'mt-3';

  return (
    <div className={containerClass}>
      <Card>
        {/* Header */}
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary" />
                <CardTitle className="text-lg truncate">
                  {article.title || article.target_keyword}
                </CardTitle>
                <Badge
                  variant={
                    article.status === 'completed' ? 'default' :
                    article.status === 'failed' ? 'destructive' :
                    'secondary'
                  }
                >
                  {article.status}
                </Badge>
              </div>

              {/* Meta info bar */}
              {article.status === 'completed' && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {article.meta_title && <span>Title: {article.meta_title}</span>}
                  {article.slug && <span>/{article.slug}</span>}
                  {article.schema_markup && (
                    <Badge variant="outline" className="text-xs">
                      {article.schema_markup['@type'] || 'Schema'}
                    </Badge>
                  )}
                </div>
              )}
            </div>

            <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
          </div>

          {/* Pipeline progress (during generation) */}
          {isInProgress && (
            <div className="mt-3">
              <PipelineProgress
                currentStage={article.current_stage}
                progress={article.progress_percentage}
                status={article.status}
              />
            </div>
          )}

          {/* Error message */}
          {article.status === 'failed' && article.error_message && (
            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                <p className="text-sm text-red-600 dark:text-red-400">{article.error_message}</p>
              </div>
            </div>
          )}

          {/* Score / word count footer bar (completed) */}
          {article.status === 'completed' && (
            <div className="mt-3 flex items-center gap-6 text-xs text-muted-foreground border-t pt-3">
              {article.overall_score != null && (
                <span className="flex items-center gap-1">
                  <BarChart3 className="w-3.5 h-3.5" />
                  Score: <span className={`font-semibold ${article.overall_score >= 80 ? 'text-green-500' : article.overall_score >= 60 ? 'text-yellow-500' : 'text-red-500'}`}>{article.overall_score}/100</span>
                </span>
              )}
              <span>{article.word_count?.toLocaleString()} words</span>
              {article.reading_time_minutes > 0 && <span>{article.reading_time_minutes} min read</span>}
              {article.credits_used > 0 && <span>{article.credits_used} credits</span>}
              {article.processing_time_ms > 0 && <span>{(article.processing_time_ms / 1000).toFixed(1)}s</span>}
            </div>
          )}
        </CardHeader>

        {/* Tabs — only show when completed or has partial data */}
        {(article.status === 'completed' || article.markdown_content) && (
          <CardContent className="pt-0">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full justify-start">
                <TabsTrigger value="content" className="gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  Content
                </TabsTrigger>
                {article.optimize_data && (
                  <TabsTrigger value="optimize" className="gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Optimize
                  </TabsTrigger>
                )}
                {article.brief_data && (
                  <TabsTrigger value="brief" className="gap-1">
                    <ListChecks className="w-3.5 h-3.5" />
                    Brief
                  </TabsTrigger>
                )}
                {article.gaps_gains_data && (
                  <TabsTrigger value="gaps" className="gap-1">
                    <Search className="w-3.5 h-3.5" />
                    Gaps/Gains
                  </TabsTrigger>
                )}
                {article.research_tab_data && (
                  <TabsTrigger value="research" className="gap-1">
                    <Search className="w-3.5 h-3.5" />
                    Research
                  </TabsTrigger>
                )}
                {article.interlinking_data && (
                  <TabsTrigger value="interlink" className="gap-1">
                    <Link2 className="w-3.5 h-3.5" />
                    Inter-linking
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="content" className="mt-4">
                <ArticleContent
                  markdown={article.markdown_content}
                  html={article.html_content}
                />
                {/* Meta description */}
                {article.meta_description && (
                  <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Meta Description</p>
                    <p className="text-sm">{article.meta_description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{article.meta_description.length}/155 characters</p>
                  </div>
                )}
              </TabsContent>

              {article.optimize_data && (
                <TabsContent value="optimize" className="mt-4">
                  <OptimizeTab data={article.optimize_data} overallScore={article.overall_score || 0} />
                </TabsContent>
              )}

              {article.brief_data && (
                <TabsContent value="brief" className="mt-4">
                  <BriefTab data={article.brief_data} />
                </TabsContent>
              )}

              {article.gaps_gains_data && (
                <TabsContent value="gaps" className="mt-4">
                  <GapsGainsTab data={article.gaps_gains_data} />
                </TabsContent>
              )}

              {article.research_tab_data && (
                <TabsContent value="research" className="mt-4">
                  <ResearchTab data={article.research_tab_data} />
                </TabsContent>
              )}

              {article.interlinking_data && (
                <TabsContent value="interlink" className="mt-4">
                  <InterlinkingTab data={article.interlinking_data} />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
