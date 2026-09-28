import React, { useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { HubToolbar } from '@/components/core/hub/HubToolbar';
import { formatDate } from '@/utils/datetime';
import { compact, statusPresentation } from './seoMetrics';
import type { AiQuestionsReport, SearchQuestion } from './aiCitations';

const pathOf = (url: string | null): string => {
  if (!url) return '—';
  try { return new URL(url).pathname || '/'; } catch { return url; }
};

const PLATFORM_LABEL: Record<string, string> = { google: 'Google AI Overview', chat_gpt: 'ChatGPT' };

const AIO_BADGE: Record<SearchQuestion['ai_overview'], { label: string; variant: 'success' | 'warning' | 'neutral' | 'info' }> = {
  cites_you: { label: 'AI Overview cites you', variant: 'success' },
  cites_others: { label: 'AI Overview cites others', variant: 'warning' },
  none: { label: 'No AI Overview', variant: 'neutral' },
  unknown: { label: 'Not rank-checked', variant: 'info' },
};

export const AiQuestionsPanel: React.FC<{
  report: AiQuestionsReport | null;
  canTrack: boolean;
  trackedCount: number;
  trackLimit: number;
  onTrack: (question: string) => Promise<void>;
}> = ({ report, canTrack, trackedCount, trackLimit, onTrack }) => {
  const [tab, setTab] = useState<'cited' | 'search'>('cited');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState<string | null>(null);

  const cited = useMemo(() => report?.cited.rows ?? [], [report]);
  const searchRows = useMemo(() => report?.search.rows ?? [], [report]);
  const q = search.trim().toLowerCase();
  const citedShown = cited.filter((r) => !q || r.question.toLowerCase().includes(q));
  const searchShown = searchRows.filter((r) => !q || r.query.toLowerCase().includes(q));
  const full = trackedCount >= trackLimit;

  const track = async (question: string) => {
    setBusy(question);
    try { await onTrack(question); } finally { setBusy(null); }
  };

  const trackButton = (question: string, tracked: boolean) => {
    if (tracked) {
      return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />Tracked</span>;
    }
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={!canTrack || full || busy !== null}
        title={!canTrack ? 'Track this site in AI visibility first.' : full ? `The probe list holds ${trackLimit} questions; remove one in Edit questions.` : 'Ask the assistants this question on every probe run.'}
        onClick={() => void track(question)}
      >
        {busy === question ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
        Track
      </Button>
    );
  };

  const statuses = report?.cited.status ?? [];

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Search className="h-4 w-4 text-primary" />
              Questions you already show up for
            </CardTitle>
            <CardDescription>
              Real questions where an AI answer already cites your site, and question-shaped searches you already
              rank for in Google. Track one to measure it on every probe run.
            </CardDescription>
          </div>
          <HubSegmented
            aria-label="Question source"
            value={tab}
            onChange={(v) => setTab(v as 'cited' | 'search')}
            options={[
              { value: 'cited', label: `AI cites you (${cited.length})` },
              { value: 'search', label: `You rank in Google (${searchRows.length})` },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <HubToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search questions…" />

        {tab === 'cited' && (
          <>
            {statuses.length > 0 && (
              <div className="space-y-1 border-b border-hairline px-3 py-2">
                {statuses.map((s) => {
                  const pres = statusPresentation(s.status);
                  return (
                    <p key={s.platform} className="text-xs text-muted-foreground">
                      <Badge variant={s.status === 'ok' ? 'success' : s.status === 'collector_failed' ? 'error' : 'neutral'}>
                        {PLATFORM_LABEL[s.platform] ?? s.platform}
                      </Badge>{' '}
                      {s.status === 'ok'
                        ? `${compact(s.stored ?? 0)} questions stored${s.total_count != null ? ` of ${compact(s.total_count)} in the corpus` : ''} · ${s.country_code ?? '—'} / ${s.language_code ?? '—'} · ${formatDate(s.captured_at)}`
                        : (s.note ?? pres.explain)}
                    </p>
                  );
                })}
              </div>
            )}
            {cited.length === 0 ? (
              <HubEmptyState
                title={statuses.length === 0 ? 'Not collected yet' : 'No cited questions'}
                description={statuses.length === 0
                  ? 'These come from DataForSEO LLM Mentions. Refresh LLM Mentions above, or wait for the weekly run.'
                  : 'The last fetch found no AI answer citing this site. The per-platform line above says why.'}
              />
            ) : citedShown.length === 0 ? (
              <HubEmptyState variant="filtered" title="No question matches" action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear filters</Button>} />
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Question</th>
                      <th className="px-3 py-2 text-left">Engine</th>
                      <th className="px-3 py-2 text-right">AI search volume</th>
                      <th className="px-3 py-2 text-left">Your cited page</th>
                      <th className="px-3 py-2 text-left">Last seen</th>
                      <th className="px-3 py-2"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {citedShown.map((r) => {
                      const key = `${r.platform}:${r.question}`;
                      const first = r.our_sources[0];
                      return (
                        <React.Fragment key={key}>
                          <tr className="align-top">
                            <td className="max-w-[420px] px-3 py-2">
                              <p className="text-xs font-medium leading-snug text-foreground">{r.question}</p>
                              {r.answer && (
                                <button type="button" className="mt-0.5 text-[11px] text-primary hover:underline" onClick={() => setOpenAnswer(openAnswer === key ? null : key)}>
                                  {openAnswer === key ? 'Hide answer' : 'Show answer'}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{PLATFORM_LABEL[r.platform] ?? r.platform}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{r.ai_search_volume != null ? compact(r.ai_search_volume) : '—'}</td>
                            <td className="px-3 py-2 text-xs">
                              {first ? (
                                <a href={first.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  {pathOf(first.url)}<ExternalLink className="h-3 w-3" />
                                </a>
                              ) : '—'}
                              {first?.position != null && <span className="ml-1 text-muted-foreground">· source #{first.position} of {r.source_count}</span>}
                              {r.our_sources.length > 1 && <span className="ml-1 text-muted-foreground">+{r.our_sources.length - 1}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.last_response_at ? formatDate(r.last_response_at) : '—'}</td>
                            <td className="px-3 py-2 text-right">{trackButton(r.question, r.tracked)}</td>
                          </tr>
                          {openAnswer === key && r.answer && (
                            <tr>
                              <td colSpan={6} className="bg-surface-sunken px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
                                {r.answer}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {tab === 'search' && (
          report?.search.status === 'not_connected' ? (
            <HubEmptyState title="Search Console not connected" description="Connect Search Console under Search Performance to see the questions you rank for." />
          ) : searchRows.length === 0 ? (
            <HubEmptyState title="No question-shaped searches" description={`No query in ${report?.search.from ?? '—'} → ${report?.search.to ?? '—'} reads as a question (τι, πώς, ποιο, πόσο, what, how, which, best, vs, or a "?").`} />
          ) : searchShown.length === 0 ? (
            <HubEmptyState variant="filtered" title="No question matches" action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear filters</Button>} />
          ) : (
            <>
              <p className="border-b border-hairline px-3 py-1.5 text-xs text-muted-foreground">
                Search Console, {report?.search.from} → {report?.search.to}. AI Overview status comes from the rank tracker, so only
                questions you also track as keywords have one.
              </p>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Search</th>
                      <th className="px-3 py-2 text-right">Impressions</th>
                      <th className="px-3 py-2 text-right">Clicks</th>
                      <th className="px-3 py-2 text-right">Position</th>
                      <th className="px-3 py-2 text-left">Your page</th>
                      <th className="px-3 py-2 text-left">AI Overview</th>
                      <th className="px-3 py-2"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {searchShown.map((r) => (
                      <tr key={r.query} className="align-top">
                        <td className="max-w-[380px] px-3 py-2 text-xs font-medium leading-snug text-foreground">{r.query}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(r.impressions)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{compact(r.clicks)}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{r.position ?? '—'}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.top_page ? (
                            <a href={r.top_page} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              {pathOf(r.top_page)}<ExternalLink className="h-3 w-3" />
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2"><Badge variant={AIO_BADGE[r.ai_overview].variant}>{AIO_BADGE[r.ai_overview].label}</Badge></td>
                        <td className="px-3 py-2 text-right">{trackButton(r.query, r.tracked)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
      </CardContent>
    </Card>
  );
};
