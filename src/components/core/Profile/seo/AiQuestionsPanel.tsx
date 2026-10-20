import React, { useMemo, useState } from 'react';
import { Check, ExternalLink, Loader2, Pencil, Plus, Search } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { HubToolbar } from '@/components/core/hub/HubToolbar';
import { formatDate } from '@/utils/datetime';
import { compact, statusPresentation } from './seoMetrics';
import { formatUsd, PLATFORM_LABEL, type AiQuestionSource, type AiQuestionsReport, type SearchQuestion } from './aiCitations';
import { safeHref } from '@/utils/safeUrl';

const pathOf = (url: string | null): string => {
  if (!url) return '—';
  try { return new URL(url).pathname || '/'; } catch { return url; }
};

const TOPIC_LIMIT = 10;

/** The same rule set_website_ai_question_topics applies, so the editor can say what it will drop. */
function cleanTopics(raw: string): { kept: string[]; dropped: string[] } {
  const kept: string[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const t = part.trim().replace(/\s+/g, ' ');
    if (!t) continue;
    if (t.length < 2 || t.length > 60 || kept.length >= TOPIC_LIMIT) { dropped.push(t); continue; }
    if (seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    kept.push(t);
  }
  return { kept, dropped };
}

const AIO_BADGE: Record<SearchQuestion['ai_overview'], { label: string; variant: 'success' | 'warning' | 'neutral' | 'info' }> = {
  cites_you: { label: 'AI Overview cites you', variant: 'success' },
  cites_others: { label: 'AI Overview cites others', variant: 'warning' },
  none: { label: 'No AI Overview', variant: 'neutral' },
  unknown: { label: 'Not rank-checked', variant: 'info' },
};

type Tab = 'market' | 'cited' | 'search' | 'paa';

const TOPICS_SOURCE: Record<string, string> = {
  set: 'chosen for this site',
  tracked_keywords: 'derived from your tracked keywords',
  none: 'none — add one, or track a short keyword',
};

export const AiQuestionsPanel: React.FC<{
  report: AiQuestionsReport | null;
  canTrack: boolean;
  trackedCount: number;
  trackLimit: number;
  onTrack: (question: string, source: AiQuestionSource) => Promise<void>;
  onSaveTopics: (topics: string[]) => Promise<void>;
}> = ({ report, canTrack, trackedCount, trackLimit, onTrack, onSaveTopics }) => {
  const [tab, setTab] = useState<Tab>('market');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [openAnswer, setOpenAnswer] = useState<string | null>(null);
  const [topicDraft, setTopicDraft] = useState<string | null>(null);
  const [savingTopics, setSavingTopics] = useState(false);

  const market = report?.market;
  const marketRows = useMemo(() => market?.rows ?? [], [market]);

  const saveTopics = async (topics: string[]) => {
    setSavingTopics(true);
    try {
      await onSaveTopics(topics);
      setTopicDraft(null);
    } catch {
      // The caller has already said why; the draft stays open so nothing typed is lost.
    } finally {
      setSavingTopics(false);
    }
  };
  const draft = topicDraft === null ? null : cleanTopics(topicDraft);

  const cited = useMemo(() => report?.cited.rows ?? [], [report]);
  const searchRows = useMemo(() => report?.search.rows ?? [], [report]);
  const q = search.trim().toLowerCase();
  const citedShown = cited.filter((r) => !q || r.question.toLowerCase().includes(q));
  const searchShown = searchRows.filter((r) => !q || r.query.toLowerCase().includes(q));
  const paaRows = useMemo(() => report?.paa?.rows ?? [], [report]);
  const paaShown = paaRows.filter((r) => !q || r.question.toLowerCase().includes(q));
  const marketShown = marketRows.filter((r) => !q || r.question.toLowerCase().includes(q));
  const full = trackedCount >= trackLimit;

  const track = async (question: string, source: AiQuestionSource) => {
    setBusy(question);
    try { await onTrack(question, source); } finally { setBusy(null); }
  };

  const trackButton = (question: string, tracked: boolean, source: AiQuestionSource) => {
    if (tracked) {
      return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />Tracked</span>;
    }
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={!canTrack || full || busy !== null}
        title={!canTrack ? 'Track this site in AI visibility first.' : full ? `The probe list holds ${trackLimit} questions; remove one in Edit questions.` : 'Ask the assistants this question on every probe run.'}
        onClick={() => void track(question, source)}
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
              Questions worth measuring
            </CardTitle>
            <CardDescription>
              No assistant tells you what people asked it before they reached you, so these are the nearest real
              questions: what people in your market ask Google's AI about your topics, answers that already cite
              you, your own longer searches, and People Also Ask. Track one and every assistant is asked it, in
              your market, on each probe run.
            </CardDescription>
          </div>
          <HubSegmented
            aria-label="Question source"
            value={tab}
            onChange={(v) => setTab(v as Tab)}
            options={[
              { value: 'market', label: `Asked in your market (${marketRows.length})` },
              { value: 'cited', label: `AI cites you (${cited.length})` },
              { value: 'search', label: `You rank in Google (${searchRows.length})` },
              { value: 'paa', label: `People also ask (${paaRows.length})` },
            ]}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <HubToolbar search={search} onSearchChange={setSearch} searchPlaceholder="Search questions…" />

        {tab === 'market' && (
          <>
            <div className="space-y-2 border-b border-hairline px-3 py-2">
              {topicDraft === null ? (
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span>Topics searched ({TOPICS_SOURCE[market?.topics_source ?? 'none'] ?? market?.topics_source}):</span>
                  {(market?.topics ?? []).map((t) => <Badge key={t} variant="neutral">{t}</Badge>)}
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setTopicDraft((market?.topics ?? []).join(', '))}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />Edit topics
                  </Button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label htmlFor="ai-question-topics" className="text-xs text-muted-foreground">
                    Topics, comma-separated, up to 10. Short head terms find the most questions (πλακάκια, not πλακάκια
                    μπάνιου θεσσαλονίκη). Each topic is one paid corpus search per covered assistant on every read.
                  </label>
                  <Input id="ai-question-topics" value={topicDraft} onChange={(e) => setTopicDraft(e.target.value)} />
                  {draft && draft.dropped.length > 0 && (
                    <p className="text-xs text-amber-800 dark:text-amber-300">
                      Not saved: {draft.dropped.join(', ')} (a topic is 2–60 characters, and at most {TOPIC_LIMIT} are kept).
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={savingTopics || !draft || draft.kept.length === 0} onClick={() => draft && void saveTopics(draft.kept)}>
                      {savingTopics && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}Save topics
                    </Button>
                    <Button size="sm" variant="outline" disabled={savingTopics} onClick={() => void saveTopics([])}>
                      Use tracked keywords
                    </Button>
                    <Button size="sm" variant="ghost" disabled={savingTopics} onClick={() => setTopicDraft(null)}>Cancel</Button>
                  </div>
                </div>
              )}
              {(market?.fetches ?? []).map((f) => (
                <p key={f.platform} className="text-xs text-muted-foreground">
                  <Badge variant={f.status === 'ok' ? 'success' : f.status === 'collector_failed' ? 'error' : 'neutral'}>
                    {PLATFORM_LABEL[f.platform] ?? f.platform}
                  </Badge>{' '}
                  {f.status === 'ok' || (f.status === 'no_data' && f.per_topic.length > 0)
                    ? `${compact(f.found ?? 0)} questions · ${f.country_code ?? '—'} / ${f.language_code ?? '—'} · ${formatDate(f.captured_at)}${f.cost_usd != null ? ` · ${formatUsd(f.cost_usd)}` : ''}`
                    : (f.note ?? statusPresentation(f.status).explain)}
                  {f.per_topic.length > 0 && (
                    <span className="ml-1">
                      ({f.per_topic.map((p) => `${p.topic} ${p.status === 'collector_failed' ? 'failed' : (p.total_count ?? 0)}`).join(' · ')})
                    </span>
                  )}
                  {f.status === 'ok' && f.note && <span className="ml-1">{f.note}</span>}
                </p>
              ))}
            </div>
            {marketRows.length === 0 ? (
              <HubEmptyState
                title={!market || market.status === 'not_collected'
                  ? ((market?.topics ?? []).length === 0 ? 'No topic to search' : 'Not searched yet')
                  : market.status === 'collector_failed' ? 'The market search failed' : 'No market question found'}
                description={!market || market.status === 'not_collected'
                  ? ((market?.topics ?? []).length === 0
                    ? 'Add a topic, or track a short keyword, and the next LLM Mentions read searches the market for it.'
                    : 'The topics are searched with LLM Mentions. Refresh LLM Mentions above, or wait for the weekly run.')
                  : market.status === 'collector_failed'
                    ? 'The questions in this market are unknown, not zero. The line above says what failed.'
                    : 'No AI answer in this market has a question containing these topics. Try shorter head terms.'}
                action={topicDraft === null
                  ? <Button size="sm" variant="outline" onClick={() => setTopicDraft((market?.topics ?? []).join(', '))}>Edit topics</Button>
                  : undefined}
              />
            ) : marketShown.length === 0 ? (
              <HubEmptyState variant="filtered" title="No question matches" action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear filters</Button>} />
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Question</th>
                      <th className="px-3 py-2 text-left">Topic</th>
                      <th className="px-3 py-2 text-right">AI search volume</th>
                      <th className="px-3 py-2 text-left">Who the answer cites</th>
                      <th className="px-3 py-2 text-left">Engine</th>
                      <th className="px-3 py-2"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {marketShown.map((r) => {
                      const key = `m:${r.platform}:${r.question}`;
                      return (
                        <React.Fragment key={key}>
                          <tr className="align-top">
                            <td className="max-w-[380px] px-3 py-2">
                              <p className="text-xs font-medium leading-snug text-foreground">{r.question}</p>
                              {r.answer && (
                                <button type="button" className="mt-0.5 text-[11px] text-primary hover:underline" onClick={() => setOpenAnswer(openAnswer === key ? null : key)}>
                                  {openAnswer === key ? 'Hide answer' : 'Show answer'}
                                </button>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.topics.join(', ') || '—'}</td>
                            <td className="px-3 py-2 text-right text-xs tabular-nums">{r.ai_search_volume != null ? compact(r.ai_search_volume) : '—'}</td>
                            <td className="max-w-[300px] px-3 py-2 text-xs">
                              {r.cites_you && <Badge variant="success" className="mr-1">Cites you</Badge>}
                              {r.rival_sources.length > 0
                                ? <span className="text-muted-foreground">{r.rival_sources.slice(0, 4).map((s) => s.domain).join(', ')}{r.rival_sources.length > 4 ? ` +${r.rival_sources.length - 4}` : ''}</span>
                                : !r.cites_you && <span className="text-muted-foreground">No source</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{PLATFORM_LABEL[r.platform] ?? r.platform}</td>
                            <td className="px-3 py-2 text-right">{trackButton(r.question, r.tracked, 'ai_market')}</td>
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
                                <a href={safeHref(first.url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                                  {pathOf(first.url)}<ExternalLink className="h-3 w-3" />
                                </a>
                              ) : '—'}
                              {first?.position != null && <span className="ml-1 text-muted-foreground">· source #{first.position} of {r.source_count}</span>}
                              {r.our_sources.length > 1 && <span className="ml-1 text-muted-foreground">+{r.our_sources.length - 1}</span>}
                            </td>
                            <td className="px-3 py-2 text-xs text-muted-foreground">{r.last_response_at ? formatDate(r.last_response_at) : '—'}</td>
                            <td className="px-3 py-2 text-right">{trackButton(r.question, r.tracked, 'ai_cited')}</td>
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
            <HubEmptyState title="No question-shaped searches" description={`No query in ${report?.search.from ?? '—'} → ${report?.search.to ?? '—'} reads as a question (τι, πώς, ποιο, πόσο, what, how, which, best, vs, a "?", or five words or more).`} />
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
                            <a href={safeHref(r.top_page)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
                              {pathOf(r.top_page)}<ExternalLink className="h-3 w-3" />
                            </a>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2"><Badge variant={AIO_BADGE[r.ai_overview].variant}>{AIO_BADGE[r.ai_overview].label}</Badge></td>
                        <td className="px-3 py-2 text-right">{trackButton(r.query, r.tracked, 'gsc')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}
        {tab === 'paa' && (
          report?.paa?.status === 'not_collected' || !report?.paa ? (
            <HubEmptyState title="No keyword research yet" description="People Also Ask questions are captured when you research a keyword for this site. Run keyword research in the article writer to collect them." />
          ) : paaRows.length === 0 ? (
            <HubEmptyState title="No People Also Ask questions" description={`None of the ${report.paa.research_runs} research runs for this site returned a People Also Ask block.`} />
          ) : paaShown.length === 0 ? (
            <HubEmptyState variant="filtered" title="No question matches" action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear filters</Button>} />
          ) : (
            <>
              <p className="border-b border-hairline px-3 py-1.5 text-xs text-muted-foreground">
                From {report.paa.research_runs} keyword research runs. Google shows these beside the keyword, so they are what a buyer
                asks next.
              </p>
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Question</th>
                      <th className="px-3 py-2 text-left">Researched keyword</th>
                      <th className="px-3 py-2 text-right">Seen</th>
                      <th className="px-3 py-2 text-left">Last seen</th>
                      <th className="px-3 py-2"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {paaShown.map((r) => (
                      <tr key={r.question} className="align-top">
                        <td className="max-w-[420px] px-3 py-2 text-xs font-medium leading-snug text-foreground">{r.question}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.keywords.length > 0 ? r.keywords.join(', ') : '—'}</td>
                        <td className="px-3 py-2 text-right text-xs tabular-nums">{r.seen}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{r.last_seen ? formatDate(r.last_seen) : '—'}</td>
                        <td className="px-3 py-2 text-right">{trackButton(r.question, r.tracked, 'paa')}</td>
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
