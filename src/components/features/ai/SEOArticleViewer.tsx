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

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '@/integrations/supabase/client';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/core/ui/accordion';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Dialog, DialogContent } from '@/components/core/ui/dialog';
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
  Zap,
  Lightbulb,
  Info,
  AlertOctagon,
  Quote,
  BookOpen,
  HelpCircle,
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
  siteArticles?: SiteMatch[];
}

interface SiteMatch {
  url: string;
  title: string | null;
  description: string | null;
  relevance: number;
  anchorSuggestion: string;
  alreadyLinked: boolean;
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
            {currentStage === 'write' && 'Writing article with Claude Opus...'}
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
              <span
                className={`text-sm capitalize ${topic.type === 'gap' ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}
              >
                {topic.type}
              </span>
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
                  <span className={`text-xs capitalize ${
                    imp === 'high' ? 'text-red-500 dark:text-red-400' :
                    imp === 'medium' ? 'text-amber-600 dark:text-amber-400' :
                    'text-muted-foreground'
                  }`}>
                    {imp}
                  </span>
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
                  className="text-xs text-primary hover:underline truncate block"
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

interface ParsedLink {
  anchor: string;
  href: string;
  kind: 'external' | 'internal' | 'relative';
}

/** Pull every [anchor](href) link out of the markdown body. */
function parseLinksFromMarkdown(markdown: string | null): ParsedLink[] {
  if (!markdown) return [];
  const matches = [...markdown.matchAll(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)];
  const seen = new Set<string>();
  const links: ParsedLink[] = [];
  for (const m of matches) {
    const anchor = m[1].trim();
    const href = m[2].trim();
    if (!href || href.startsWith('#')) continue;
    const dedupeKey = `${anchor}|${href}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    let kind: ParsedLink['kind'] = 'external';
    if (href.startsWith('/')) kind = 'relative';
    else if (!/^https?:\/\//i.test(href)) kind = 'internal';
    links.push({ anchor, href, kind });
  }
  return links;
}

function InterlinkingTab({ data, markdown, onApplyLink }: { data: InterlinkingData; markdown: string | null; onApplyLink?: (anchor: string, url: string) => Promise<'inserted' | 'exists' | 'notfound'> }) {
  const writtenLinks = useMemo(() => parseLinksFromMarkdown(markdown), [markdown]);
  const internalWritten = writtenLinks.filter((l) => l.kind !== 'external');
  const externalWritten = writtenLinks.filter((l) => l.kind === 'external');
  const siteMatches = data.siteArticles || [];
  const [copied, setCopied] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, 'inserted' | 'exists' | 'notfound'>>({});

  const copyMarkdownLink = async (m: SiteMatch) => {
    await navigator.clipboard.writeText(`[${m.anchorSuggestion}](${m.url})`);
    setCopied(m.url);
    setTimeout(() => setCopied(null), 1500);
  };

  const insertLink = async (m: SiteMatch) => {
    if (!onApplyLink) return;
    const result = await onApplyLink(m.anchorSuggestion, m.url);
    setApplied((prev) => ({ ...prev, [m.url]: result }));
    setTimeout(() => setApplied((prev) => { const n = { ...prev }; delete n[m.url]; return n; }), 2500);
  };

  const hasAnything =
    siteMatches.length > 0 ||
    (data.suggestedLinks || []).length > 0 ||
    (data.existingArticles || []).length > 0 ||
    (data.competitorArticles || []).length > 0 ||
    writtenLinks.length > 0;

  return (
    <div className="space-y-5">
      {/* Site-aware matches if user has connected a website */}
      {siteMatches.length > 0 ? (
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Globe className="w-4 h-4 text-primary" />
            <h4 className="text-sm font-semibold">Suggested Internal Links from Your Site</h4>
            <Badge variant="outline" className="text-[10px]">{siteMatches.length}</Badge>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Pages from your connected website ranked by semantic relevance to this article. Click "Copy" to grab a markdown link.
          </p>
          <div className="space-y-2">
            {siteMatches.map((m, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-sm font-medium">{m.anchorSuggestion}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {Math.round(m.relevance * 100)}% match
                  </Badge>
                  {m.alreadyLinked && (
                    <Badge variant="secondary" className="text-[10px]">already in draft</Badge>
                  )}
                  <div className="ml-auto flex items-center gap-1">
                    {onApplyLink && !m.alreadyLinked && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => insertLink(m)}
                        title="Insert this link into the article draft"
                      >
                        {applied[m.url] === 'inserted' ? <Check className="w-3 h-3 mr-1" /> : null}
                        {applied[m.url] === 'inserted' ? 'Inserted'
                          : applied[m.url] === 'exists' ? 'Already linked'
                          : applied[m.url] === 'notfound' ? 'Anchor not found'
                          : 'Insert'}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => copyMarkdownLink(m)}
                    >
                      {copied === m.url ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
                      {copied === m.url ? 'Copied' : 'Copy MD link'}
                    </Button>
                  </div>
                </div>
                <div className="pl-5 space-y-0.5">
                  {m.title && <p className="text-xs text-foreground truncate">{m.title}</p>}
                  {m.description && <p className="text-xs text-muted-foreground line-clamp-2">{m.description}</p>}
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1"
                  >
                    {m.url}
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        // No connected site — show the CTA disclaimer
        <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-muted-foreground">
          <AlertTriangle className="w-3.5 h-3.5 text-blue-500 mt-0.5 flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <p>
              No connected website found. The suggestions below come from links written in your draft and
              articles previously generated through this tool.
            </p>
            <p>
              <a href="/profile" className="text-primary font-medium hover:underline">
                Connect your website's sitemap →
              </a>{' '}
              to enable site-aware inter-linking suggestions.
            </p>
          </div>
        </div>
      )}

      {/* Pipeline-suggested links (markdown markers — usually empty) */}
      {(data.suggestedLinks || []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Pipeline Suggestions</h4>
          <div className="space-y-2">
            {data.suggestedLinks.map((link, i) => (
              <div key={i} className="p-3 border rounded-lg space-y-1">
                <div className="flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">{link.anchor}</span>
                </div>
                <div className="pl-6 space-y-0.5">
                  <p className="text-xs text-muted-foreground">
                    Target: <span className="text-foreground">{link.targetTopic}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{link.reason}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Internal/relative links the writer actually put in the article */}
      {internalWritten.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">
            Internal Links in Draft <span className="text-xs font-normal text-muted-foreground">({internalWritten.length})</span>
          </h4>
          <div className="space-y-1.5">
            {internalWritten.map((link, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-2 border rounded">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <Link2 className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                  <span className="text-sm truncate">{link.anchor}</span>
                </div>
                <code className="text-xs text-muted-foreground truncate max-w-[40%]">{link.href}</code>
                <span className="text-[10px] text-muted-foreground capitalize flex-shrink-0">{link.kind}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* External links the writer cited */}
      {externalWritten.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">
            External Citations <span className="text-xs font-normal text-muted-foreground">({externalWritten.length})</span>
          </h4>
          <div className="space-y-1.5">
            {externalWritten.map((link, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-2 border rounded">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <ExternalLink className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{link.anchor}</span>
                </div>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline truncate max-w-[45%]"
                >
                  {link.href}
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Articles previously generated by this user via this tool */}
      {(data.existingArticles || []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">Related Articles in Your Library</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Other SEO articles you've generated through this tool, ranked by keyword overlap.
          </p>
          <div className="space-y-1.5">
            {data.existingArticles.map((article, i) => (
              <div key={i} className="flex items-center justify-between gap-3 p-2 border rounded">
                <span className="text-sm truncate flex-1">{article.title}</span>
                {article.slug && (
                  <code className="text-xs text-muted-foreground truncate max-w-[40%]">/{article.slug}</code>
                )}
                <Badge variant="outline" className="text-xs flex-shrink-0">
                  {Math.round(article.relevance * 100)}% match
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SERP competitor articles — for research, not linking */}
      {(data.competitorArticles || []).length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-1">Competitor Pages (SERP)</h4>
          <p className="text-xs text-muted-foreground mb-2">
            Top-ranking pages for this keyword. Use them for research and link-building outreach, not direct linking.
          </p>
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
                    className="text-xs text-primary hover:underline truncate block"
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

      {!hasAnything && (
        <p className="text-sm text-muted-foreground text-center py-4">No inter-linking data available</p>
      )}
    </div>
  );
}

// ─── Article Content Viewer ─────────────────────────────────────

// ─── Custom Article Renderer ────────────────────────────────────
//
// The seo-write prompt produces markdown with a strict structure + custom callout
// blockquotes (`> [!tldr]`, `> [!key]`, `> [!definition]`, `> [!example]`,
// `> [!info]`, `> [!warning]`, `> [!quote]`). We parse the markdown into
// semantic sections + render each with first-class UI.

type CalloutKind = 'tldr' | 'key' | 'definition' | 'example' | 'info' | 'warning' | 'quote';

interface CalloutBlock {
  type: 'callout';
  kind: CalloutKind;
  title: string | null; // for [!definition] Term Name
  body: string; // markdown inside the callout
}

interface FaqEntry {
  question: string;
  answer: string; // markdown
}

interface FaqSection {
  type: 'faq';
  heading: string;
  entries: FaqEntry[];
}

interface PlainSection {
  type: 'plain';
  markdown: string;
}

type ArticleBlock = CalloutBlock | FaqSection | PlainSection;

const CALLOUT_TAG_REGEX = /^\[!(tldr|key|definition|example|info|warning|quote)\](?:\s+(.+))?$/i;
const FAQ_HEADING_REGEX = /^##\s+(?:frequently\s+asked\s+questions|faqs?)\s*$/i;

const CALLOUT_META: Record<CalloutKind, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** colorClass = border + bg + text */
  borderClass: string;
  bgClass: string;
  iconClass: string;
}> = {
  tldr:       { label: 'TL;DR',         Icon: Zap,         borderClass: 'border-primary/40',     bgClass: 'bg-primary/5',         iconClass: 'text-primary' },
  key:        { label: 'Key Takeaways', Icon: ListChecks,  borderClass: 'border-emerald-500/30', bgClass: 'bg-emerald-500/5',     iconClass: 'text-emerald-500' },
  definition: { label: 'Definition',    Icon: BookOpen,    borderClass: 'border-blue-500/30',    bgClass: 'bg-blue-500/5',        iconClass: 'text-blue-500' },
  example:    { label: 'Example',       Icon: Lightbulb,   borderClass: 'border-amber-500/30',   bgClass: 'bg-amber-500/5',       iconClass: 'text-amber-500' },
  info:       { label: 'Note',          Icon: Info,        borderClass: 'border-sky-500/30',     bgClass: 'bg-sky-500/5',         iconClass: 'text-sky-500' },
  warning:    { label: 'Heads up',      Icon: AlertOctagon, borderClass: 'border-red-500/30',     bgClass: 'bg-red-500/5',         iconClass: 'text-red-500' },
  quote:      { label: 'Quote',         Icon: Quote,       borderClass: 'border-muted-foreground/30', bgClass: 'bg-muted/40',     iconClass: 'text-muted-foreground' },
};

/** Pull the leading H1 out of the markdown so we can render it as the post title. */
function extractLeadingH1(markdown: string): string | null {
  const m = markdown.match(/^#\s+([^\n]+)/);
  return m ? m[1].trim() : null;
}

function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\n]*\n+/, '');
}

/** Extract the lead paragraph (first non-empty paragraph after the H1, before any heading or callout). */
function extractLead(markdown: string): { lead: string | null; rest: string } {
  const lines = markdown.split('\n');
  let i = 0;
  // skip leading blank lines
  while (i < lines.length && lines[i].trim() === '') i++;
  if (i >= lines.length) return { lead: null, rest: markdown };

  // first content line — bail if it's a heading/blockquote/list/code-fence
  const first = lines[i].trim();
  if (
    first.startsWith('#') ||
    first.startsWith('>') ||
    first.startsWith('-') ||
    first.startsWith('*') ||
    first.startsWith('```') ||
    /^\d+\./.test(first)
  ) {
    return { lead: null, rest: markdown };
  }

  // collect lines until blank line or a structural marker
  const leadLines: string[] = [];
  while (i < lines.length && lines[i].trim() !== '') {
    leadLines.push(lines[i]);
    i++;
  }
  // skip blank line(s)
  while (i < lines.length && lines[i].trim() === '') i++;

  return {
    lead: leadLines.join('\n').trim(),
    rest: lines.slice(i).join('\n'),
  };
}

/**
 * Extract FAQ entries from a contiguous slice of markdown that lives inside an
 * `## Frequently Asked Questions` section. We try several question shapes since
 * the writer model isn't always consistent:
 *
 *   1. `### Question?`        (preferred)
 *   2. `#### Question?`       (one level off)
 *   3. `**Question?**`        (bold paragraph)
 *   4. `**Q:** Question`      (Q-prefixed bold)
 *   5. `Q: Question`          (plain Q prefix)
 *
 * Returns [] if nothing question-shaped is found.
 */
function extractFaqEntries(sectionLines: string[]): FaqEntry[] {
  const entries: FaqEntry[] = [];

  const isQuestionLine = (
    line: string,
  ): { question: string } | null => {
    const t = line.trim();
    if (!t) return null;

    // ### Question / #### Question
    const headingMatch = t.match(/^#{3,4}\s+(.+?)\s*$/);
    if (headingMatch) {
      const q = headingMatch[1].trim();
      // strip trailing colon or wrapping bold/italic
      return { question: q.replace(/^\*+|\*+$/g, '').replace(/:\s*$/, '').trim() };
    }

    // **Q:** Question
    const qPrefixBold = t.match(/^\*\*\s*Q\s*[:\.\-]?\s*\*\*\s*(.+)$/i);
    if (qPrefixBold) return { question: qPrefixBold[1].trim() };

    // Q: Question
    const qPrefix = t.match(/^Q\s*[:\.\-]\s*(.+)$/i);
    if (qPrefix) return { question: qPrefix[1].trim() };

    // **Question?**  — entire line is bold and ends with ?
    const fullBold = t.match(/^\*\*([^*]+\?)\s*\*\*\s*$/);
    if (fullBold) return { question: fullBold[1].trim() };

    return null;
  };

  let i = 0;
  while (i < sectionLines.length) {
    const match = isQuestionLine(sectionLines[i]);
    if (!match) {
      i++;
      continue;
    }

    const question = match.question;
    i++;

    // Collect answer lines until the next question or section end
    const answerLines: string[] = [];
    while (i < sectionLines.length && !isQuestionLine(sectionLines[i])) {
      // strip a leading "**A:**" / "A:" if present on the first content line
      const t = sectionLines[i].trim();
      if (answerLines.length === 0 && t) {
        const stripped = t
          .replace(/^\*\*\s*A\s*[:\.\-]?\s*\*\*\s*/i, '')
          .replace(/^A\s*[:\.\-]\s*/i, '');
        answerLines.push(stripped !== t ? stripped : sectionLines[i]);
      } else {
        answerLines.push(sectionLines[i]);
      }
      i++;
    }

    const answer = answerLines.join('\n').trim();
    if (question) entries.push({ question, answer });
  }

  return entries;
}

/**
 * Walk the markdown line by line, splitting into:
 *  - callout blocks (blockquotes whose first inner line is `[!tag]`)
 *  - FAQ sections (H2 "Frequently Asked Questions" → consume until next H2)
 *  - plain markdown chunks (rendered with ReactMarkdown)
 */
function parseArticle(markdown: string): ArticleBlock[] {
  const blocks: ArticleBlock[] = [];
  const lines = markdown.split('\n');
  let buffer: string[] = [];

  const flushBuffer = () => {
    const text = buffer.join('\n').trim();
    if (text) blocks.push({ type: 'plain', markdown: text });
    buffer = [];
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // FAQ section detection — accept multiple question shapes since
    // Claude doesn't always emit perfect H3s for FAQs:
    //   - ### What is X?
    //   - #### What is X?  (sometimes drops a level)
    //   - **What is X?**   (bold paragraph)
    //   - **Q:** What is X? / Q: What is X?
    if (FAQ_HEADING_REGEX.test(trimmed)) {
      flushBuffer();
      const headingText = trimmed.replace(/^##\s+/, '');
      const sectionStart = i + 1;
      i++;

      // Slurp the FAQ section into a contiguous block
      const sectionLines: string[] = [];
      while (i < lines.length) {
        const innerTrim = lines[i].trim();
        if (/^##\s+/.test(innerTrim) && !FAQ_HEADING_REGEX.test(innerTrim)) break;
        sectionLines.push(lines[i]);
        i++;
      }

      const entries = extractFaqEntries(sectionLines);

      if (entries.length > 0) {
        blocks.push({ type: 'faq', heading: headingText, entries });
      } else {
        // No questions extractable — fall back to rendering the section as
        // plain markdown so the user still sees what Claude wrote, instead of
        // an empty accordion header.
        const rawSection = lines.slice(sectionStart - 1, i).join('\n').trim();
        if (rawSection) blocks.push({ type: 'plain', markdown: rawSection });
      }
      continue;
    }

    // Callout block detection
    if (trimmed.startsWith('>')) {
      // Peek the first non-empty inner line
      const firstInner = trimmed.replace(/^>\s?/, '').trim();
      const calloutMatch = firstInner.match(CALLOUT_TAG_REGEX);
      if (calloutMatch) {
        flushBuffer();
        const kind = calloutMatch[1].toLowerCase() as CalloutKind;
        const title = calloutMatch[2]?.trim() || null;

        // Collect all subsequent quoted lines
        const innerLines: string[] = [];
        i++; // skip the tag line
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          innerLines.push(lines[i].replace(/^>\s?/, ''));
          i++;
        }

        blocks.push({
          type: 'callout',
          kind,
          title,
          body: innerLines.join('\n').trim(),
        });
        continue;
      }
    }

    buffer.push(line);
    i++;
  }
  flushBuffer();
  return blocks;
}

// ─── Custom Markdown Renderer ───────────────────────────────────
//
// We hand-roll every markdown element instead of leaning on Tailwind prose,
// so the article reads like a polished editorial post: serif body, generous
// rhythm, and section dividers that feel intentional.

import type { Components } from 'react-markdown';

/** Slugify heading text so each heading gets a stable anchor id. */
function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

/** Convert ReactNode children (heading) to a flat string for slug + aria-labels. */
function nodeToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children;
  if (typeof children === 'number') return String(children);
  if (Array.isArray(children)) return children.map(nodeToText).join('');
  if (React.isValidElement(children)) return nodeToText((children as any).props?.children);
  return '';
}

/** Build the components dictionary used in every ReactMarkdown call. */
function buildMarkdownComponents(opts: { dense?: boolean } = {}): Components {
  const { dense = false } = opts;

  return {
    h1: ({ children }) => (
      <h1 className="font-sans text-3xl md:text-4xl font-bold tracking-tight text-foreground mt-12 mb-5">
        {children}
      </h1>
    ),
    h2: ({ children }) => {
      const text = nodeToText(children);
      return (
        <h2
          id={slugify(text)}
          className="font-sans scroll-mt-24 mt-14 mb-4 pb-3 border-b border-border/40 text-2xl md:text-[1.75rem] font-semibold tracking-tight text-foreground first:mt-0"
        >
          <span className="text-primary mr-2 select-none">§</span>
          {children}
        </h2>
      );
    },
    h3: ({ children }) => {
      const text = nodeToText(children);
      return (
        <h3
          id={slugify(text)}
          className="font-sans scroll-mt-24 mt-9 mb-3 text-xl font-semibold tracking-tight text-foreground"
        >
          {children}
        </h3>
      );
    },
    h4: ({ children }) => (
      <h4 className="font-sans mt-6 mb-2 text-base font-semibold uppercase tracking-wider text-muted-foreground">
        {children}
      </h4>
    ),
    p: ({ children }) => (
      <p className={`font-serif ${dense ? 'my-2 leading-[1.7]' : 'my-5 leading-[1.8]'} text-[1.0625rem] text-foreground/95`}>
        {children}
      </p>
    ),
    a: ({ children, href }) => (
      <a
        href={href}
        target={href?.startsWith('http') ? '_blank' : undefined}
        rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        className="text-primary font-medium underline decoration-primary/30 underline-offset-[3px] hover:decoration-primary transition-colors"
      >
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className="font-semibold text-foreground">{children}</strong>
    ),
    em: ({ children }) => <em className="italic text-foreground/90">{children}</em>,
    ul: ({ children }) => (
      <ul className={`font-serif ${dense ? 'my-2' : 'my-5'} space-y-2 pl-1 list-none`}>{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className={`font-serif ${dense ? 'my-2' : 'my-5'} space-y-2 pl-6 list-decimal marker:text-primary marker:font-semibold`}>
        {children}
      </ol>
    ),
    li: ({ children, ordered }: any) => (
      <li
        className={`text-[1.0625rem] leading-[1.75] text-foreground/95 ${ordered ? 'pl-1' : 'relative pl-6 before:absolute before:left-0 before:top-[0.7em] before:w-2 before:h-[2px] before:bg-primary'}`}
      >
        {children}
      </li>
    ),
    code: ({ children, className }) => {
      const isBlock = className?.includes('language-');
      if (isBlock) {
        return (
          <code className={`${className} font-mono text-sm`}>
            {children}
          </code>
        );
      }
      return (
        <code className="font-mono text-[0.875em] bg-muted/70 text-foreground px-1.5 py-0.5 rounded border border-border/50">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-6 p-4 rounded-lg bg-muted/50 border border-border/60 overflow-x-auto text-sm leading-relaxed">
        {children}
      </pre>
    ),
    blockquote: ({ children }) => (
      <blockquote className="my-6 px-6 py-4 border-l-4 border-l-primary/60 bg-primary/[0.03] rounded-r-lg">
        <div className="font-serif italic text-lg leading-relaxed text-foreground/85 [&_p]:my-1 [&_p]:font-serif [&_p]:italic">
          {children}
        </div>
      </blockquote>
    ),
    hr: () => (
      <div className="my-12 flex items-center justify-center gap-2 text-muted-foreground/50" aria-hidden="true">
        <span className="h-px w-12 bg-border/60" />
        <span className="text-xs">✦</span>
        <span className="h-px w-12 bg-border/60" />
      </div>
    ),
    table: ({ children }) => (
      <div className="my-7 overflow-x-auto rounded-lg border border-border/60 shadow-sm">
        <table className="w-full text-sm border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
    tbody: ({ children }) => <tbody className="divide-y divide-border/40">{children}</tbody>,
    tr: ({ children }) => <tr className="even:bg-muted/20">{children}</tr>,
    th: ({ children }) => (
      <th className="font-sans text-left px-4 py-3 font-semibold text-foreground text-xs uppercase tracking-wider">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="font-serif px-4 py-3 text-foreground/90 align-top text-[0.9375rem] leading-relaxed">{children}</td>
    ),
    img: ({ src, alt }) => (
      <figure className="my-7">
        <img src={src} alt={alt || ''} className="w-full rounded-lg border border-border/60 shadow-sm" loading="lazy" />
        {alt && <figcaption className="mt-2 text-center text-xs text-muted-foreground italic font-serif">{alt}</figcaption>}
      </figure>
    ),
  };
}

const ARTICLE_COMPONENTS = buildMarkdownComponents();
const DENSE_COMPONENTS = buildMarkdownComponents({ dense: true });

function PlainMarkdown({ children, dense = false }: { children: string; dense?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={dense ? DENSE_COMPONENTS : ARTICLE_COMPONENTS}
    >
      {children}
    </ReactMarkdown>
  );
}

function Callout({ block }: { block: CalloutBlock }) {
  const meta = CALLOUT_META[block.kind];
  const Icon = meta.Icon;

  return (
    <aside
      className={`my-8 rounded-2xl border ${meta.borderClass} ${meta.bgClass} overflow-hidden shadow-sm`}
      role={block.kind === 'warning' ? 'alert' : 'note'}
    >
      <div className="flex items-center gap-2.5 px-6 pt-5 pb-3">
        <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full ${meta.bgClass} ${meta.iconClass} ring-1 ring-current/20`}>
          <Icon className="w-3.5 h-3.5" />
        </span>
        <span className={`text-[0.6875rem] font-bold uppercase tracking-[0.12em] ${meta.iconClass}`}>
          {meta.label}
        </span>
        {block.kind === 'definition' && block.title && (
          <span className="text-base font-sans font-semibold text-foreground ml-1">{block.title}</span>
        )}
      </div>
      <div className="px-6 pb-5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
        <PlainMarkdown dense>{block.body}</PlainMarkdown>
      </div>
    </aside>
  );
}

function FaqAccordion({ block }: { block: FaqSection }) {
  if (!block.entries || block.entries.length === 0) return null;

  return (
    <section className="my-12">
      <div className="flex items-baseline gap-3 mb-6 pb-3 border-b border-border/40">
        <span className="text-primary text-xl select-none" aria-hidden="true">§</span>
        <h2 id={slugify(block.heading)} className="font-sans text-2xl md:text-[1.75rem] font-semibold tracking-tight text-foreground scroll-mt-24">
          {block.heading}
        </h2>
        <span className="ml-auto text-xs text-muted-foreground">
          {block.entries.length} question{block.entries.length === 1 ? '' : 's'}
        </span>
      </div>
      <Accordion type="multiple" className="space-y-2">
        {block.entries.map((entry, i) => (
          <AccordionItem
            key={i}
            value={`faq-${i}`}
            className="border border-border/60 rounded-xl px-5 bg-card/40 data-[state=open]:bg-muted/30 data-[state=open]:border-primary/30 transition-colors"
          >
            <AccordionTrigger className="font-sans text-base font-semibold text-foreground text-left hover:no-underline py-4 [&[data-state=open]>svg]:text-primary">
              <span className="flex items-baseline gap-3 flex-1">
                <span className="text-primary/60 font-mono text-xs flex-shrink-0">{String(i + 1).padStart(2, '0')}</span>
                <span>{entry.question}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent className="pb-4 pl-9">
              <PlainMarkdown dense>{entry.answer || '_No answer provided._'}</PlainMarkdown>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}

function ArticleBlocks({ blocks }: { blocks: ArticleBlock[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.type === 'callout') return <Callout key={i} block={b} />;
        if (b.type === 'faq') return <FaqAccordion key={i} block={b} />;
        return <PlainMarkdown key={i}>{b.markdown}</PlainMarkdown>;
      })}
    </>
  );
}

// ─── Top-level Article Content ──────────────────────────────────

interface ArticleContentProps {
  markdown: string | null;
  html: string | null;
  /** Article title (article.title from DB). Used when markdown has no H1 of its own. */
  title?: string | null;
  /** Meta description — rendered as a dek under the title. */
  metaDescription?: string | null;
  wordCount?: number;
  readingTimeMinutes?: number;
}

function ArticleContent({ markdown, html, title, metaDescription, wordCount, readingTimeMinutes }: ArticleContentProps) {
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState<'rendered' | 'markdown'>('rendered');

  const handleCopy = async () => {
    if (markdown) {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const { headline, lead, blocks, raw } = useMemo(() => {
    const rawSource = markdown || html || '';
    const headlineFromMarkdown = extractLeadingH1(rawSource);
    const afterH1 = headlineFromMarkdown ? stripLeadingH1(rawSource) : rawSource;
    const { lead: leadPara, rest } = extractLead(afterH1);
    return {
      headline: headlineFromMarkdown || title || null,
      lead: leadPara,
      blocks: parseArticle(rest),
      raw: rawSource,
    };
  }, [markdown, html, title]);

  if (!markdown && !html) {
    return <p className="text-sm text-muted-foreground">No content available yet</p>;
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex justify-end gap-1">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setView(view === 'rendered' ? 'markdown' : 'rendered')}
        >
          {view === 'rendered' ? 'View Markdown' : 'View Rendered'}
        </Button>
        <Button variant="ghost" size="sm" onClick={handleCopy}>
          {copied ? <Check className="w-3 h-3 mr-1" /> : <Copy className="w-3 h-3 mr-1" />}
          {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
      </div>

      {view === 'rendered' ? (
        <article className="rounded-2xl bg-card border border-border/60 shadow-md max-h-[80vh] overflow-y-auto">
          {/* Editorial header — kicker, title, dek, byline strip */}
          <header className="px-6 md:px-12 pt-10 md:pt-14 pb-8">
            <div className="max-w-[680px] mx-auto space-y-5">
              {/* Kicker */}
              <div className="flex items-center gap-2 text-[0.6875rem] uppercase tracking-[0.18em] font-semibold text-primary">
                <span className="h-px w-8 bg-primary/60" />
                <span>SEO Article</span>
              </div>

              {headline && (
                <h1 className="font-sans text-[2rem] md:text-[2.75rem] leading-[1.15] font-bold tracking-tight text-foreground">
                  {headline}
                </h1>
              )}

              {metaDescription && (
                <p className="font-serif text-lg md:text-xl leading-[1.55] text-muted-foreground">
                  {metaDescription}
                </p>
              )}

              {(wordCount || readingTimeMinutes) && (
                <div className="flex items-center gap-3 pt-3 mt-2 border-t border-border/40 text-xs text-muted-foreground">
                  {readingTimeMinutes ? (
                    <span className="font-sans uppercase tracking-wider font-medium">
                      {readingTimeMinutes} min read
                    </span>
                  ) : null}
                  {wordCount && readingTimeMinutes ? <span className="text-muted-foreground/50">·</span> : null}
                  {wordCount ? (
                    <span className="font-sans uppercase tracking-wider">
                      {wordCount.toLocaleString()} words
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </header>

          {/* Body — narrower measure for comfortable reading */}
          <div className="px-6 md:px-12 pb-16">
            <div className="max-w-[680px] mx-auto">
              {/* Lead paragraph — drop cap, larger, serif */}
              {lead && (
                <p className="font-serif text-[1.25rem] md:text-[1.3125rem] leading-[1.65] text-foreground/95 mb-8 first-letter:font-sans first-letter:text-[3.75rem] first-letter:font-bold first-letter:text-primary first-letter:mr-2 first-letter:float-left first-letter:leading-[0.9] first-letter:mt-1.5">
                  {lead}
                </p>
              )}

              {/* Sectioned blocks (callouts, FAQ, plain markdown) */}
              <ArticleBlocks blocks={blocks} />
            </div>
          </div>
        </article>
      ) : (
        <pre className="text-xs whitespace-pre-wrap font-mono border rounded-lg p-4 max-h-[80vh] overflow-y-auto bg-muted/30">
          {raw}
        </pre>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────

interface SEOArticleViewerProps {
  articleId?: string;
  initialArticle?: SEOArticle; // Demo / offline mode — skips Supabase fetch
}

export default function SEOArticleViewer({ articleId, initialArticle }: SEOArticleViewerProps) {
  const [article, setArticle] = useState<SEOArticle | null>(initialArticle ?? null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('content');
  const [loading, setLoading] = useState(!initialArticle && !!articleId);

  const isInProgress = article && !['completed', 'failed'].includes(article.status);

  // Initial fetch — skipped when initialArticle is provided (demo mode)
  useEffect(() => {
    if (initialArticle || !articleId) return;
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
  }, [articleId, initialArticle]);

  // Adaptive polling while in progress — disabled in demo mode
  useAdaptivePolling(
    articleId ?? '',
    (data) => setArticle(data),
    !initialArticle && !!isInProgress,
  );

  // Insert an inter-link suggestion INTO the article (was copy-to-clipboard only). Replaces the first
  // plain occurrence of the anchor text — not already inside a link — with a markdown link, then persists.
  const applyInterlink = useCallback(async (anchor: string, url: string): Promise<'inserted' | 'exists' | 'notfound'> => {
    if (!article?.id) return 'notfound';
    const md = article.markdown_content ?? '';
    if (md.includes(`](${url})`) || md.includes(`[${anchor}](`)) return 'exists';
    const esc = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let re: RegExp;
    try { re = new RegExp(`(?<!\\[)\\b${esc}\\b(?!\\]|\\()`); } catch { re = new RegExp(esc); }
    if (!re.test(md)) return 'notfound';
    const next = md.replace(re, `[${anchor}](${url})`);
    const { error } = await supabase.from('seo_articles').update({ markdown_content: next }).eq('id', article.id);
    if (error) return 'notfound';
    setArticle({ ...article, markdown_content: next });
    return 'inserted';
  }, [article]);

  if (loading) {
    return (
      <Card className="mt-3">
        <CardContent className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Loading article...</span>
        </CardContent>
      </Card>
    );
  }

  if (!article) {
    return (
      <Card className="mt-3">
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">Article not found</p>
        </CardContent>
      </Card>
    );
  }

  const statusVariant =
    article.status === 'completed' ? 'default' :
    article.status === 'failed' ? 'destructive' :
    'secondary';

  const scoreColor =
    article.overall_score == null ? '' :
    article.overall_score >= 80 ? 'text-green-500' :
    article.overall_score >= 60 ? 'text-yellow-500' :
    'text-red-500';

  return (
    <>
      {/* Compact inline trigger — title, subtitle, open icon */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="mt-3 w-full text-left group"
      >
        <Card className="transition-colors group-hover:bg-muted/40 group-hover:border-primary/40">
          <CardContent className="p-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
              <FileText className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0 space-y-0.5">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium truncate">
                  {article.title || article.target_keyword}
                </p>
                <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0 h-4 capitalize flex-shrink-0">
                  {article.status}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                {isInProgress && article.current_stage && (
                  <span className="flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    {article.current_stage} · {article.progress_percentage}%
                  </span>
                )}
                {article.status === 'completed' && (
                  <>
                    {article.overall_score != null && (
                      <span className={`font-medium ${scoreColor}`}>{article.overall_score}/100</span>
                    )}
                    {article.word_count > 0 && <span>{article.word_count.toLocaleString()} words</span>}
                    {article.reading_time_minutes > 0 && <span>{article.reading_time_minutes} min read</span>}
                  </>
                )}
                {article.status === 'failed' && (
                  <span className="text-red-500 truncate">{article.error_message || 'Generation failed'}</span>
                )}
              </div>
            </div>
            <Maximize2 className="w-4 h-4 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
          </CardContent>
        </Card>
      </button>

      {/* Modal with full article details */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-5xl w-[calc(100%-2rem)] max-h-[90vh] overflow-y-auto p-0">
          <div className="p-6 space-y-4">
            {/* Header */}
            <div className="space-y-2 pr-8">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-primary flex-shrink-0" />
                <h2 className="text-lg font-semibold flex-1 min-w-0 truncate">
                  {article.title || article.target_keyword}
                </h2>
                <Badge variant={statusVariant} className="capitalize flex-shrink-0">
                  {article.status}
                </Badge>
              </div>

              {article.status === 'completed' && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
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

            {/* Pipeline progress (during generation) */}
            {isInProgress && (
              <PipelineProgress
                currentStage={article.current_stage}
                progress={article.progress_percentage}
                status={article.status}
              />
            )}

            {/* Error message */}
            {article.status === 'failed' && article.error_message && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                  <p className="text-sm text-red-600 dark:text-red-400">{article.error_message}</p>
                </div>
              </div>
            )}

            {/* Score / word count bar (completed) */}
            {article.status === 'completed' && (
              <div className="flex items-center gap-6 text-xs text-muted-foreground border-t border-b py-3 flex-wrap">
                {article.overall_score != null && (
                  <span className="flex items-center gap-1">
                    <BarChart3 className="w-3.5 h-3.5" />
                    Score: <span className={`font-semibold ${scoreColor}`}>{article.overall_score}/100</span>
                  </span>
                )}
                <span>{article.word_count?.toLocaleString()} words</span>
                {article.reading_time_minutes > 0 && <span>{article.reading_time_minutes} min read</span>}
                {article.credits_used > 0 && <span>{article.credits_used} credits</span>}
                {article.processing_time_ms > 0 && <span>{(article.processing_time_ms / 1000).toFixed(1)}s</span>}
              </div>
            )}

            {/* Tabs — only show when completed or has partial data */}
            {(article.status === 'completed' || article.markdown_content) && (
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
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
                      Inter-Linking
                    </TabsTrigger>
                  )}
                </TabsList>

                <TabsContent value="content" className="mt-4">
                  <ArticleContent
                    markdown={article.markdown_content}
                    html={article.html_content}
                    title={article.title}
                    metaDescription={article.meta_description}
                    wordCount={article.word_count}
                    readingTimeMinutes={article.reading_time_minutes}
                  />
                  {/* SEO meta description (separate from the post dek for SEO inspection) */}
                  {article.meta_description && (
                    <div className="mt-4 p-3 bg-muted/30 rounded-lg">
                      <p className="text-xs font-medium text-muted-foreground mb-1">Meta Description (SEO)</p>
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
                    <InterlinkingTab data={article.interlinking_data} markdown={article.markdown_content} onApplyLink={applyInterlink} />
                  </TabsContent>
                )}
              </Tabs>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
