import React, { useEffect, useMemo, useState } from 'react';
import { Check, ExternalLink, HelpCircle, Loader2, Minus, Sparkles } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/core/ui/tooltip';
import { compact } from './seo/seoMetrics';
import {
  SERP_FEATURE_GROUPS,
  buildSerpInventory,
  humanizeFeatureKey,
  type SerpFeatureGroup,
} from './seo/serpFeatures';

/**
 * The full read of one keyword-research run.
 *
 * The list view showed five columns — keyword, topic, count, volume, date — while
 * the stored blob held the AI Overview's cited sources, the image pack, the local
 * pack, product carousels, People Also Ask, 17 keyword clusters and 9 ranked
 * competitors. This is that blob, read.
 *
 * The SERP inventory is deliberately an INVENTORY: every feature Google can put
 * on a page is listed with a present/absent verdict, because an absent featured
 * snippet is a finding, not a blank. See `seo/serpFeatures.ts`.
 */

interface ResearchBlob {
  topic?: string;
  targetKeyword?: string;
  researchedAt?: string;
  totalAddressableVolume?: number;
  serpFeatures?: {
    hasAiOverview?: boolean;
    aiOverviewSources?: { url: string; title: string; domain: string }[];
    hasFeaturedSnippet?: boolean;
    featuredSnippetType?: string | null;
    featuredSnippetContent?: string | null;
    hasKnowledgeGraph?: boolean;
    hasPeopleAlsoAsk?: boolean;
    serpFeatureTypes?: string[];
  };
  paaQuestions?: string[];
  clusters?: { name?: string; theme?: string; keywords?: any[]; totalVolume?: number }[];
  serpInsights?: { url?: string; title?: string; domain?: string; position?: number }[];
  contentGapOpportunities?: string[];
  recommendedPrimary?: Record<string, any>;
  recommendedSecondaries?: Record<string, any>[];
  contentLandscape?: {
    avgWordCount?: number;
    avgContentScore?: number;
    avgDomainRank?: number;
    dateRange?: { earliest?: string; latest?: string };
    contentTypes?: Record<string, number>;
    sentiments?: Record<string, number>;
  };
}

interface ResearchRecord {
  id: string;
  topic: string;
  target_keyword: string;
  location_code: number | null;
  language_code: string | null;
  total_keywords_found: number | null;
  total_addressable_volume: number | null;
  created_at: string;
  research_data: ResearchBlob | null;
  top_keywords: any;
  serp_competitors: any;
  paa_questions: any;
}

function Figure({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

export const KeywordResearchDetail: React.FC<{ researchId: string; siteDomain?: string }> = ({
  researchId,
  siteDomain,
}) => {
  const [row, setRow] = useState<ResearchRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from('seo_keyword_research')
        .select(
          'id, topic, target_keyword, location_code, language_code, total_keywords_found, total_addressable_volume, created_at, research_data, top_keywords, serp_competitors, paa_questions',
        )
        .eq('id', researchId)
        .maybeSingle();
      if (cancelled) return;
      if (err) setError(err.message);
      else setRow(data as unknown as ResearchRecord);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [researchId]);

  const blob = row?.research_data ?? null;
  const features = blob?.serpFeatures;

  const inventory = useMemo(() => buildSerpInventory(features?.serpFeatureTypes), [features]);

  const grouped = useMemo(() => {
    const out = new Map<SerpFeatureGroup, typeof inventory.verdicts>();
    for (const v of inventory.verdicts) {
      const list = out.get(v.descriptor.group) ?? [];
      list.push(v);
      out.set(v.descriptor.group, list);
    }
    return out;
  }, [inventory]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error || !row) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{error || 'Research run not found.'}</p>;
  }

  const primary = blob?.recommendedPrimary ?? {};
  const paa: string[] = blob?.paaQuestions ?? (Array.isArray(row.paa_questions) ? row.paa_questions : []);
  const competitors = blob?.serpInsights ?? (Array.isArray(row.serp_competitors) ? row.serp_competitors : []);
  const clusters = blob?.clusters ?? [];
  const aiSources = features?.aiOverviewSources ?? [];
  const weAreCited =
    !!siteDomain && aiSources.some((s) => (s.domain || '').replace(/^www\./, '').includes(siteDomain.replace(/^www\./, '')));
  const presentCount = inventory.verdicts.filter((v) => v.present).length;

  return (
    <div className="space-y-4">
      {/* ── Header figures ─────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base">{row.target_keyword}</CardTitle>
          <CardDescription>
            {row.topic}
            {row.language_code ? <> · {row.language_code}</> : null}
            {blob?.researchedAt ? <> · researched {formatDate(blob.researchedAt)}</> : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <Figure
              label="Search volume"
              value={primary.searchVolume != null ? compact(primary.searchVolume) : '—'}
              sub="monthly, this market"
            />
            <Figure
              label="Difficulty"
              value={primary.keywordDifficulty != null ? primary.keywordDifficulty : 'Not scored'}
              sub={primary.keywordDifficulty == null ? 'not returned for this keyword' : '0–100'}
            />
            <Figure label="CPC" value={primary.cpc != null ? `$${Number(primary.cpc).toFixed(2)}` : '—'} sub="paid cost per click" />
            <Figure
              label="Competition"
              value={primary.competition != null ? `${Math.round(Number(primary.competition) * 100)}%` : '—'}
              sub="advertiser density"
            />
            <Figure
              label="Opportunity"
              value={primary.opportunityScore != null ? primary.opportunityScore : '—'}
              sub="volume vs difficulty"
            />
            <Figure
              label="Addressable volume"
              value={row.total_addressable_volume != null ? compact(row.total_addressable_volume) : '—'}
              sub={`across ${compact(row.total_keywords_found ?? 0)} keywords`}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── SERP feature inventory ─────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base">What the results page looks like</CardTitle>
          <CardDescription>
            {presentCount} of {inventory.verdicts.length} features are on this page. Absences are listed too — an
            unclaimed snippet or an image pack you are not in is a finding, not a blank.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {([...grouped.entries()] as [SerpFeatureGroup, typeof inventory.verdicts][]).map(([group, list]) => (
            <div key={group}>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{SERP_FEATURE_GROUPS[group]}</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {list.map(({ descriptor, present }) => (
                  <div
                    key={descriptor.key}
                    className={`rounded-sm border p-2.5 ${
                      present ? 'border-hairline bg-card' : 'border-hairline bg-surface-sunken'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {present ? (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--success))]" aria-hidden="true" />
                      ) : (
                        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={`text-xs font-semibold ${present ? 'text-foreground' : 'text-muted-foreground'}`}
                          >
                            {descriptor.label}
                          </span>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button type="button" aria-label={`What is ${descriptor.label}`} className="text-muted-foreground hover:text-foreground">
                                <HelpCircle className="h-3 w-3" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">{descriptor.what}</TooltipContent>
                          </Tooltip>
                        </div>
                        <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                          {present ? descriptor.ifPresent : descriptor.ifAbsent ?? 'Not on this page.'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {inventory.unknown.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold text-muted-foreground">
                Also on the page, not yet catalogued
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inventory.unknown.map((k) => (
                  <Badge key={k} variant="neutral">
                    {humanizeFeatureKey(k)}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── AI Overview ────────────────────────────────────────────────── */}
      {features?.hasAiOverview && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              AI Overview sources
            </CardTitle>
            <CardDescription>
              Google answers this query itself and cites {aiSources.length} sources.{' '}
              {siteDomain
                ? weAreCited
                  ? 'Your domain is among them.'
                  : 'Your domain is not among them — these pages are taking the answer.'
                : 'These pages are taking the answer.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {aiSources.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                An AI Overview was shown but no citations were captured on this run.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {aiSources.map((s, i) => (
                  <li key={i} className="rounded-sm border border-hairline bg-surface-sunken px-2.5 py-1.5">
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline gap-2 text-xs text-primary hover:underline"
                    >
                      <span className="min-w-0 flex-1 truncate">{s.title || s.url}</span>
                      <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <span className="text-[11px] text-muted-foreground">{s.domain}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Featured snippet ───────────────────────────────────────────── */}
      {features?.hasFeaturedSnippet && features.featuredSnippetContent && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">The snippet being shown</CardTitle>
            <CardDescription>
              Position zero is taken{features.featuredSnippetType ? ` by a ${features.featuredSnippetType}` : ''}.
              Match the format to compete for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <blockquote className="border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-muted-foreground">
              {features.featuredSnippetContent}
            </blockquote>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── People Also Ask ─────────────────────────────────────────── */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Questions people also ask</CardTitle>
            <CardDescription>Straight from the results page — the follow-ups this query leads to.</CardDescription>
          </CardHeader>
          <CardContent>
            {paa.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No People Also Ask block on this query.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {paa.map((q, i) => (
                  <li key={i} className="rounded-sm border border-hairline bg-surface-sunken px-2.5 py-1.5 text-xs text-foreground">
                    {typeof q === 'string' ? q : (q as any)?.question}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Competitors ─────────────────────────────────────────────── */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Who ranks now</CardTitle>
            <CardDescription>The organic results you would have to displace.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {competitors.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">No competitors captured.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10 text-right">#</TableHead>
                    <TableHead>Page</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {competitors.slice(0, 12).map((c: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {c.position ?? i + 1}
                      </TableCell>
                      <TableCell className="max-w-0">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block truncate text-xs text-primary hover:underline"
                        >
                          {c.title || c.url}
                        </a>
                        <span className="text-[11px] text-muted-foreground">{c.domain}</span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Clusters ───────────────────────────────────────────────────── */}
      {clusters.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Keyword clusters</CardTitle>
            <CardDescription>
              {clusters.length} themes the expanded keyword set falls into. Each is a candidate page rather than a
              candidate paragraph.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Theme</TableHead>
                    <TableHead className="text-right">Keywords</TableHead>
                    <TableHead className="text-right">Volume</TableHead>
                    <TableHead>Top terms</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clusters.map((c: any, i: number) => {
                    const kws: any[] = Array.isArray(c.keywords) ? c.keywords : [];
                    const vol =
                      c.totalVolume ?? kws.reduce((s, k) => s + (Number(k?.searchVolume) || 0), 0);
                    return (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name || c.theme || `Cluster ${i + 1}`}</TableCell>
                        <TableCell className="text-right tabular-nums">{kws.length || '—'}</TableCell>
                        <TableCell className="text-right tabular-nums">{vol ? compact(vol) : '—'}</TableCell>
                        <TableCell className="max-w-[320px] truncate text-xs text-muted-foreground">
                          {kws
                            .slice(0, 4)
                            .map((k: any) => k?.term ?? k?.keyword)
                            .filter(Boolean)
                            .join(', ') || '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Content landscape ──────────────────────────────────────────── */}
      {blob?.contentLandscape && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">The content already out there</CardTitle>
            <CardDescription>What the pages competing for this query look like.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Figure
                label="Avg. word count"
                value={
                  blob.contentLandscape.avgWordCount
                    ? compact(blob.contentLandscape.avgWordCount)
                    : 'Not measured'
                }
                sub={blob.contentLandscape.avgWordCount ? 'words per page' : 'the source returned no length data'}
              />
              <Figure
                label="Avg. domain rank"
                value={blob.contentLandscape.avgDomainRank ? Math.round(blob.contentLandscape.avgDomainRank) : '—'}
                sub="of the ranking set"
              />
              <Figure
                label="Content score"
                value={
                  blob.contentLandscape.avgContentScore
                    ? Math.round(blob.contentLandscape.avgContentScore)
                    : 'Not measured'
                }
              />
              <Figure
                label="Freshest page"
                value={
                  blob.contentLandscape.dateRange?.latest
                    ? new Date(blob.contentLandscape.dateRange.latest).getFullYear()
                    : '—'
                }
                sub={
                  blob.contentLandscape.dateRange?.earliest
                    ? `oldest ${new Date(blob.contentLandscape.dateRange.earliest).getFullYear()}`
                    : undefined
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Gaps ───────────────────────────────────────────────────────── */}
      {(blob?.contentGapOpportunities?.length ?? 0) > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">Gaps worth covering</CardTitle>
            <CardDescription>Subjects the ranking pages address that a new page would need to match.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {blob!.contentGapOpportunities!.map((g, i) => (
                <Badge key={i} variant="secondary">
                  {g}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default KeywordResearchDetail;
