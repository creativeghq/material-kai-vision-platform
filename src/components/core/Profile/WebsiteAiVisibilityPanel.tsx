import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Loader2, MessageSquareQuote, Users } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { userWebsitesService, type AiVisibility, type UserWebsite } from '@/services/userWebsitesService';
import { Sparkline } from './seo/Sparkline';
import { timeAgo } from '@/utils/datetime';
import { compact } from './seo/seoMetrics';

/**
 * Websites → AI Visibility.
 *
 * The LLM reporting surface. 636 probes across three models already existed in
 * `llm_mention_probes` and had no home on the website dashboard at all — this is
 * where that work becomes readable.
 *
 * The single most important thing this screen does is REFUSE TO REPORT A FAILED
 * MODEL AS ZERO. Every `gpt-4o-mini` probe in the stored set returned HTTP 429.
 * Counted the naive way — mentions ÷ probes sent — that model reads "0% share of
 * voice", which a person correctly interprets as "AI assistants never mention
 * us" and incorrectly acts on. The share is measured against probes that
 * ANSWERED (`get_website_ai_visibility`), a model with nothing to divide by
 * reports "No verdict", and the reason is printed next to it.
 */

/** A model's own display name. Never invent a vendor label we cannot verify. */
function modelLabel(model: string): string {
  if (model.startsWith('claude')) return 'Claude';
  if (model.startsWith('gpt') || model.startsWith('o1') || model.startsWith('o3')) return 'ChatGPT';
  if (model === 'sonar' || model.startsWith('sonar')) return 'Perplexity';
  if (model.startsWith('gemini')) return 'Gemini';
  return model;
}

function ShareCell({ share, note }: { share: number | null; note: string | null }) {
  if (share == null) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <AlertTriangle className="h-3 w-3 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <span className="text-xs font-medium text-amber-800 dark:text-amber-300" title={note ?? undefined}>
          No verdict
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-end gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
        <div className="h-full bg-primary" style={{ width: `${Math.min(share, 100)}%` }} />
      </div>
      <span className="w-12 text-right text-sm font-semibold tabular-nums text-foreground">{share}%</span>
    </div>
  );
}

export const WebsiteAiVisibilityPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const [data, setData] = useState<AiVisibility | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await userWebsitesService.aiVisibility(website.id, 90));
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="dashboard-card">
        <CardContent className="flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data || data.status === 'not_collected') {
    return (
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Visibility
          </CardTitle>
          <CardDescription>
            What AI assistants say about you when someone asks for a recommendation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <HubEmptyState
            variant="empty"
            title="Nothing is being probed yet"
            description={
              data?.note ||
              'Add a brand or product as a tracked subject and we will ask the assistants about it on a schedule, then report who they name.'
            }
          />
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;
  const failedShare = t.probes > 0 ? Math.round((t.failed / t.probes) * 100) : 0;
  const sentimentTotal = Object.values(data.sentiment).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-4">
      {/* ── Headline ───────────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-primary" />
            AI Visibility
          </CardTitle>
          <CardDescription>
            {compact(t.answered)} answered probes across {data.models.length} assistants, over the last{' '}
            {data.window_days} days · last run {timeAgo(t.last_run_at)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {failedShare >= 10 && (
            <div className="flex items-start gap-2 rounded-sm border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {compact(t.failed)} of {compact(t.probes)} probes ({failedShare}%) failed and were excluded from
                every figure here. A failed probe is not an absent mention — where a whole assistant failed, it
                is marked <b>No verdict</b> below rather than 0%.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Share of voice</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {t.share_of_voice != null ? `${t.share_of_voice}%` : 'Unknown'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                named in {compact(t.mentioned)} of {compact(t.answered)} answers
              </p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Avg. mention rank</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {t.avg_position != null ? `#${t.avg_position}` : '—'}
              </p>
              <p className="text-[11px] text-muted-foreground">position in the list when named</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Subjects probed</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{t.subjects_probed}</p>
              <p className="text-[11px] text-muted-foreground">of {data.subjects_tracked} tracked</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Answers citing you</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">
                {t.with_citations > 0 ? compact(t.with_citations) : 'Not captured'}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t.with_citations > 0
                  ? 'answers that linked your site'
                  : 'no probe in this window recorded citation links'}
              </p>
            </div>
          </div>

          {data.trend.filter((p) => p.v != null).length >= 2 && (
            <div className="border-t border-hairline pt-3">
              <p className="mb-1 text-xs text-muted-foreground">Share of voice, weekly</p>
              <Sparkline
                points={data.trend.filter((p) => p.v != null).map((p) => p.v as number)}
                className="h-12 w-full"
                ariaLabel="Weekly share of voice"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── By assistant ───────────────────────────────────────────────── */}
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-base">By assistant</CardTitle>
          <CardDescription>
            Each assistant is a different audience with a different answer. A row with no verdict had no
            successful probe — that is a broken feed, not an absence of mentions.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Assistant</TableHead>
                  <TableHead className="text-right">Answered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Named you</TableHead>
                  <TableHead className="text-right">Avg. rank</TableHead>
                  <TableHead className="text-right">Share of voice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.models.map((m) => (
                  <TableRow key={m.model}>
                    <TableCell>
                      <div className="font-medium text-foreground">{modelLabel(m.model)}</div>
                      <div className="text-[11px] text-muted-foreground">{m.model}</div>
                      {m.note && (
                        <div className="mt-1 max-w-md text-[11px] leading-snug text-amber-800 dark:text-amber-300">
                          {m.note}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.answered}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.failed > 0 ? (
                        <Badge variant="warning">{m.failed}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{m.mentioned}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.avg_position != null ? `#${m.avg_position}` : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <ShareCell share={m.share_of_voice} note={m.note} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* ── Subjects ───────────────────────────────────────────────────── */}
      {data.subjects.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">By subject</CardTitle>
            <CardDescription>Which of your brands and products the assistants actually know.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Subject</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Named</TableHead>
                    <TableHead className="text-right">Share of voice</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.subjects.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="max-w-[280px] truncate font-medium">{s.label}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{s.subject_type}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.answered}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.mentioned}</TableCell>
                      <TableCell className="text-right">
                        <ShareCell
                          share={s.share_of_voice}
                          note={s.status !== 'ok' ? 'No probe for this subject answered in this window.' : null}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Competitors ─────────────────────────────────────────────── */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Who they name instead
            </CardTitle>
            <CardDescription>
              Brands the assistants mentioned in the same answers. This is the competitive set as the model sees
              it, which is not always the one you would list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.competitors.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No competing brands were named in these answers.
              </p>
            ) : (
              <div className="space-y-2">
                {data.competitors.map((c) => {
                  const top = data.competitors[0].mentions || 1;
                  return (
                    <div key={c.name} className="flex items-center gap-3">
                      <span className="w-40 shrink-0 truncate text-xs text-foreground">{c.name}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div className="h-full bg-primary/60" style={{ width: `${(c.mentions / top) * 100}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs tabular-nums text-muted-foreground">
                        {c.mentions}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Prompts ─────────────────────────────────────────────────── */}
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquareQuote className="h-4 w-4 text-primary" />
              Questions we asked
            </CardTitle>
            <CardDescription>
              The prompts behind these numbers, and how often each one produced a mention.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.prompts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No prompts recorded.</p>
            ) : (
              <div className="space-y-3">
                {data.prompts.map((p) => (
                  <div key={p.template_key} className="border-b border-hairline pb-3 last:border-0 last:pb-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-xs font-medium text-foreground">{p.template_key}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {p.share_of_voice != null ? `${p.share_of_voice}%` : 'No verdict'}
                      </span>
                    </div>
                    {p.prompt_text && (
                      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                        {p.prompt_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Sentiment ──────────────────────────────────────────────────── */}
      {sentimentTotal > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">How they talk about you</CardTitle>
            <CardDescription>Tone of the answers that named you, across {sentimentTotal} mentions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4">
              {Object.entries(data.sentiment).map(([k, n]) => (
                <div key={k}>
                  <p className="text-[11px] capitalize text-muted-foreground">{k}</p>
                  <p className="text-lg font-semibold tabular-nums text-foreground">
                    {n} <span className="text-xs font-normal text-muted-foreground">
                      ({Math.round((n / sentimentTotal) * 100)}%)
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default WebsiteAiVisibilityPanel;
