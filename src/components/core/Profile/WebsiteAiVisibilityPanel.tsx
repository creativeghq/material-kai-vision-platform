import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Loader2, MessageSquareQuote, Play, Power, Plus, Users } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import {
  userWebsitesService,
  type AiAnswers,
  type AiMonitoringState,
  type AiVisibility,
  type UserWebsite,
} from '@/services/userWebsitesService';
import {
  createTrackedMention,
  getProbeProviders,
  probeSubjectLlm,
  updateTrackedMention,
  type ProbeProviderRoster,
} from '@/services/mentionMonitoringApi';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
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

/**
 * The feed's own health, above its numbers.
 *
 * Without this the panel shows a confident share-of-voice figure computed from
 * data that stopped arriving six weeks ago, because every subject is switched off
 * and the nightly cron has been succeeding with nothing to do. A dashboard that
 * cannot say "this stopped" is not reporting, it is decorating.
 *
 * Each diagnosis carries the ONE action that resolves it — a banner that explains
 * a problem and leaves the reader to find the fix elsewhere is only half of it.
 */
function MonitoringBanner({
  state, busy, onTrack, onTurnOn, onRun,
}: {
  state: AiMonitoringState;
  busy: string | null;
  onTrack: () => void;
  onTurnOn: (id: string) => void;
  onRun: (id: string) => void;
}) {
  if (!state.diagnosis) return null;
  const canTurnOn = state.subjects_total > 0 && state.subjects_due_eligible === 0;
  const needsOwnBrand = !state.own_brand_tracked && !state.own_brand_subject_id;

  return (
    <div className="rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-xs leading-snug text-amber-800 dark:text-amber-300">{state.diagnosis}</p>
          <p className="text-[11px] text-muted-foreground">
            {state.subjects_active} of {state.subjects_total} subjects active ·{' '}
            {state.subjects_due_eligible} eligible for tonight&rsquo;s run
            {state.site_host ? <> · site is {state.site_host}</> : null}
          </p>
          <div className="flex flex-wrap gap-2">
            {needsOwnBrand && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={onTrack}>
                {busy === 'track' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                Track this site&rsquo;s brand
              </Button>
            )}
            {state.own_brand_subject_id && state.own_brand_inactive && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onTurnOn(state.own_brand_subject_id!)}>
                {busy === 'on' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Power className="mr-1 h-3.5 w-3.5" />}
                Switch {state.own_brand_label} back on
              </Button>
            )}
            {state.own_brand_subject_id && !state.own_brand_inactive && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onRun(state.own_brand_subject_id!)}>
                {busy === 'run' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Run probes now
              </Button>
            )}
            {canTurnOn && !state.own_brand_subject_id && (
              <span className="self-center text-[11px] text-muted-foreground">
                Switch individual subjects on in Mention Monitoring.
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const WebsiteAiVisibilityPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [data, setData] = useState<AiVisibility | null>(null);
  const [state, setState] = useState<AiMonitoringState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // What the tier ASKS for versus what can run. A model dropped for a missing key leaves
  // no row anywhere, so "By assistant" showing two rows read as a two-assistant design.
  const [roster, setRoster] = useState<ProbeProviderRoster | null>(null);
  useEffect(() => {
    let cancelled = false;
    getProbeProviders().then((r) => { if (!cancelled) setRoster(r); }).catch(() => { /* stated below as unknown */ });
    return () => { cancelled = true; };
  }, []);

  const [answers, setAnswers] = useState<AiAnswers | null>(null);
  const [openAnswer, setOpenAnswer] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // `allSettled`: the monitoring state is the thing that EXPLAINS an empty or
      // stale report, so it must still render when the report itself fails.
      const [v, m, a] = await Promise.allSettled([
        userWebsitesService.aiVisibility(website.id, 90),
        userWebsitesService.aiMonitoringState(website.id),
        userWebsitesService.aiAnswers(website.id, 90),
      ]);
      setData(v.status === 'fulfilled' ? v.value : null);
      setState(m.status === 'fulfilled' ? m.value : null);
      setAnswers(a.status === 'fulfilled' ? a.value : null);
    } finally {
      setLoading(false);
    }
  }, [website.id]);

  /** Track this site's own brand — the thing whose absence the panel reports. */
  const trackOwnBrand = async () => {
    setBusy('track');
    try {
      const label = website.display_name?.trim() || (state?.site_host ?? '').split('.')[0];
      const created = await createTrackedMention({
        subject_type: 'brand',
        subject_label: label,
        // `brand_name` is REQUIRED by `chk_tracked_mentions_subject` for a brand or
        // keyword subject that carries no product_id. Sending only `subject_label`
        // passed the route's own validation and died one layer down as a raw 23514
        // check violation surfaced as a 500 — the API accepts a shape the constraint
        // rejects, which is the vocabulary-wider-than-the-CHECK trap.
        brand_name: label,
        homepage_domain: state?.site_host,
        // Switched ON at creation. Every existing subject in this workspace was
        // created inactive and silently never probed; repeating that default here
        // would reproduce the exact defect this panel exists to surface.
        sources_enabled: { llm: true, news: true, blogs: true, rss: true, youtube: false },
        run_first_refresh: false,
      });
      // Attach it to THIS site. Without the link the subject is workspace-level and
      // this panel deliberately ignores it — which is exactly the bug that put price
      // monitoring subjects into a website's AI Visibility report.
      if (created?.id) {
        const { error: linkErr } = await supabase
          .from('tracked_mentions')
          .update({ website_id: website.id } as any)
          .eq('id', created.id);
        if (linkErr) throw new Error(`Tracked, but could not attach it to this site: ${linkErr.message}`);
      }
      toast({ title: `Now tracking ${label}`, description: 'It joins tonight’s probe run.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not track it', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const turnOn = async (id: string) => {
    setBusy('on');
    try {
      await updateTrackedMention(id, {
        is_active: true,
        sources_enabled: { llm: true, news: true, blogs: true, rss: true, youtube: false },
      });
      toast({ title: 'Monitoring switched on' });
      await load();
    } catch (e: any) {
      toast({ title: 'Could not switch it on', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const runNow = async (id: string) => {
    setBusy('run');
    try {
      await probeSubjectLlm({ kind: 'subject', trackedMentionId: id });
      toast({ title: 'Probe run finished', description: 'Figures below are refreshed.' });
      await load();
    } catch (e: any) {
      toast({ title: 'Probe run failed', description: e?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  // ── What we ask ───────────────────────────────────────────────────────────
  // The stock questions are rendered from the subject's facets, and a subject
  // with no product type asks "What are the best products brands?" — which is
  // how Apple and Toyota became this site's "competitors". The questions are
  // the measurement; they have to be editable where the answers are read.
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<{ prompts: string; aliases: string; languages: string; countries: string; includeDefaults: boolean }>({
    prompts: '', aliases: '', languages: '', countries: '', includeDefaults: true,
  });
  const openEditor = async () => {
    const id = state?.own_brand_subject_id;
    if (!id) return;
    const { data } = await supabase
      .from('tracked_mentions')
      .select('aliases, language_codes, country_codes, source_config')
      .eq('id', id)
      .maybeSingle();
    const cfg = (data as any)?.source_config ?? {};
    const probes: { key?: string; prompt?: string }[] = Array.isArray(cfg.custom_probes) ? cfg.custom_probes : [];
    setForm({
      prompts: probes.map((p) => p.prompt ?? '').filter(Boolean).join('\n'),
      aliases: ((data as any)?.aliases ?? []).join(', '),
      languages: ((data as any)?.language_codes ?? []).join(', '),
      countries: ((data as any)?.country_codes ?? []).join(', '),
      // Absent means ON (an existing subject must not silently lose its baseline); only an explicit false is off.
      includeDefaults: cfg.include_default_probes !== false,
    });
    setEditing(true);
  };
  const saveEditor = async () => {
    const id = state?.own_brand_subject_id;
    if (!id) return;
    setSaving(true);
    try {
      const list = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
      const prompts = form.prompts.split('\n').map((p) => p.trim()).filter((p) => p.length >= 8).slice(0, 12);
      await updateTrackedMention(id, {
        aliases: list(form.aliases),
        language_codes: list(form.languages).map((l) => l.toLowerCase()),
        country_codes: list(form.countries).map((c) => c.toUpperCase()),
        source_config: {
          custom_probes: prompts.map((prompt, i) => ({ key: `custom_${i + 1}`, prompt })),
          include_default_probes: form.includeDefaults,
        },
      });
      toast({ title: 'Questions saved', description: 'The next probe run asks these. Run probes now to see the change today.' });
      setEditing(false);
    } catch (e: any) {
      toast({ title: 'Could not save', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };
  const editorDialog = (
    <Dialog open={editing} onOpenChange={(o) => { if (!o) setEditing(false); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>What we ask the assistants</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label htmlFor="ai-vis-prompts" className="text-xs text-muted-foreground">
              Questions, one per line. Ask what a real customer would ask, in the language they would use.
              Placeholders: {'{label}'} {'{brand}'} {'{product_type}'} {'{competitors}'} {'{site}'}.
            </label>
            <Textarea id="ai-vis-prompts" rows={8} value={form.prompts} className="mt-1 text-sm"
              onChange={(e) => setForm((f) => ({ ...f, prompts: e.target.value }))}
              placeholder={'Ποιοι είναι οι καλύτεροι προμηθευτές πλακακιών στη Θεσσαλονίκη;\nI am renovating a hotel in Greece — which suppliers should I look at for tiles and lighting?'} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="ai-vis-aliases" className="text-xs text-muted-foreground">Also known as</label>
              <Input id="ai-vis-aliases" value={form.aliases} className="mt-1" placeholder="MaterialsHub, materialshub.gr"
                onChange={(e) => setForm((f) => ({ ...f, aliases: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="ai-vis-languages" className="text-xs text-muted-foreground">Languages</label>
              <Input id="ai-vis-languages" value={form.languages} className="mt-1" placeholder="el, en"
                onChange={(e) => setForm((f) => ({ ...f, languages: e.target.value }))} />
            </div>
            <div>
              <label htmlFor="ai-vis-countries" className="text-xs text-muted-foreground">Countries</label>
              <Input id="ai-vis-countries" value={form.countries} className="mt-1" placeholder="GR"
                onChange={(e) => setForm((f) => ({ ...f, countries: e.target.value }))} />
            </div>
          </div>
          <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form.includeDefaults}
              onChange={(e) => setForm((f) => ({ ...f, includeDefaults: e.target.checked }))}
            />
            <span>
              Also ask the four stock questions (best brands, use case, compare with alternatives, tell me about).
              They are rendered from the subject's product type; the comparison one invites the assistant to invent
              rivals for a brand it does not know. Brands named in any answer become "who they name instead".
            </span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
          <Button onClick={saveEditor} disabled={saving}>{saving ? 'Saving…' : 'Save questions'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

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
        <CardContent className="space-y-3">
          {state && (
            <MonitoringBanner
              state={state} busy={busy}
              onTrack={trackOwnBrand} onTurnOn={turnOn} onRun={runNow}
            />
          )}
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
      {editorDialog}
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
          {/* Always offered, not only inside the diagnosis banner: after the questions are
              edited, the numbers on this screen are answers to the OLD questions until a run
              happens, and the nightly one is at 03:00 UTC. */}
          {state?.own_brand_subject_id && !state.own_brand_inactive && (
            <div className="mt-2">
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => runNow(state.own_brand_subject_id!)}>
                {busy === 'run' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Run probes now
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {state && (
            <MonitoringBanner
              state={state} busy={busy}
              onTrack={trackOwnBrand} onTurnOn={turnOn} onRun={runNow}
            />
          )}
          {failedShare >= 10 && (
            <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
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
          {(() => {
            // The default ("cheap") tier is what every subject runs unless switched to
            // frontier in Mention Monitoring; that roster is the one to explain here.
            const wanted = roster?.tiers?.cheap ?? [];
            const missing = wanted.filter((m) => !m.enabled);
            if (!roster || wanted.length === 0) return null;
            return (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {wanted.map((m) => (
                  <Badge key={m.model} variant={m.enabled ? 'neutral' : 'warning'} title={`${m.provider} key: ${m.key_source}`}>
                    {modelLabel(m.model)}{m.enabled ? '' : ' — no key configured'}
                  </Badge>
                ))}
                {missing.length > 0 && (
                  <span className="self-center text-[11px] text-muted-foreground">
                    A missing key drops the assistant from the run entirely. Add it under Admin → Platform Secrets.
                  </span>
                )}
              </div>
            );
          })()}
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
          <CardHeader className="flex flex-row items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareQuote className="h-4 w-4 text-primary" />
                Questions we asked
              </CardTitle>
              <CardDescription>
                The prompts behind these numbers, and how often each one produced a mention. They are the
                measurement — if they are not what your customers ask, nothing below means anything.
              </CardDescription>
            </div>
            {state?.own_brand_subject_id && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => void openEditor()}>
                Edit questions
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {(() => {
              const questions = answers?.questions ?? [];
              if (questions.length === 0) {
                return <p className="py-6 text-center text-sm text-muted-foreground">No prompts recorded.</p>;
              }
              // Every assistant the tier asks for gets a row on every question, so an
              // assistant that never ran (no key, unfunded) is a visible gap next to the
              // ones that answered — not a column that quietly does not exist.
              const rosterModels = (roster?.tiers?.cheap ?? []).map((m) => m.model);
              const seenModels = Array.from(new Set(questions.flatMap((q) => q.answers.map((a) => a.model))));
              const allModels = Array.from(new Set([...rosterModels, ...seenModels]));
              return (
                <div className="space-y-4">
                  {questions.map((q) => (
                    <div key={`${q.subject}:${q.template_key}`} className="rounded-sm border border-hairline p-3">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className="text-xs font-medium leading-snug text-foreground">{q.prompt_text}</p>
                        <span className="shrink-0 text-[11px] text-muted-foreground" title={q.template_key}>
                          asked {timeAgo(q.asked_at)}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1.5">
                        {allModels.map((model) => {
                          const a = q.answers.find((x) => x.model === model);
                          const rosterEntry = roster?.tiers?.cheap?.find((m) => m.model === model);
                          const key = `${q.subject}:${q.template_key}:${model}`;
                          const open = !!openAnswer[key];
                          return (
                            <div key={model} className="rounded-sm bg-surface-sunken px-2.5 py-1.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="w-24 shrink-0 text-xs font-medium text-foreground">{modelLabel(model)}</span>
                                {!a ? (
                                  <Badge variant="warning">
                                    {rosterEntry && !rosterEntry.enabled ? 'not run — no key configured' : 'not run'}
                                  </Badge>
                                ) : a.error ? (
                                  <Badge variant="warning" title={a.error}>failed — {a.error.slice(0, 40)}</Badge>
                                ) : a.mentioned ? (
                                  <Badge variant="success">named you{a.position != null ? ` · #${a.position}` : ''}{a.brand_cited ? ' · linked' : ''}</Badge>
                                ) : (
                                  <Badge variant="neutral">did not name you</Badge>
                                )}
                                {a && !a.error && a.competitors.length > 0 && (
                                  <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={a.competitors.join(', ')}>
                                    named: {a.competitors.slice(0, 6).join(', ')}{a.competitors.length > 6 ? ` +${a.competitors.length - 6}` : ''}
                                  </span>
                                )}
                                {a && !a.error && a.answer && (
                                  <button
                                    type="button"
                                    className="ml-auto shrink-0 text-[11px] text-primary hover:underline"
                                    onClick={() => setOpenAnswer((s) => ({ ...s, [key]: !open }))}
                                  >
                                    {open ? 'Hide answer' : 'Show answer'}
                                  </button>
                                )}
                              </div>
                              {a && !a.error && open && (
                                <div className="mt-2 border-t border-hairline pt-2">
                                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-foreground">
                                    {a.answer}{a.answer_truncated ? ' …' : ''}
                                  </p>
                                  {a.cited_urls.length > 0 && (
                                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                                      Cited: {a.cited_urls.slice(0, 5).map((u, i) => (
                                        <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="mr-2 text-primary hover:underline">{u.replace(/^https?:\/\//, '').slice(0, 40)}</a>
                                      ))}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
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
