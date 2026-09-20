import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Loader2, MessageSquareQuote, Play, Power, Plus, Quote, Users } from 'lucide-react';

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
  type AiCitationReport,
  type CitabilityReport,
  type LlmMentionsReport,
  type AiMonitoringState,
  type AiRival,
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
import { cn } from '@/lib/utils';
import { timeAgo } from '@/utils/datetime';
import { AiEngineCard, engineGridCols } from './seo/AiEngineCard';
import { CitabilityPanel } from './seo/CitabilityPanel';
import { LlmMentionsPanel } from './seo/LlmMentionsPanel';
import {
  VERDICT_BADGE, VERDICT_LABEL, answerVerdict, displayHost, formatUsd, modelLabel,
  withRosterEngines,
} from './seo/aiCitations';
import { compact } from './seo/seoMetrics';

/** The feed's own health, above its numbers. */
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

const RivalList: React.FC<{ rivals: AiRival[]; empty: string }> = ({ rivals, empty }) => {
  if (rivals.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  }
  const top = rivals[0].answers || 1;
  return (
    <ol className="space-y-2">
      {rivals.map((r, i) => (
        <li key={r.domain ?? r.name} className="flex items-center gap-3">
          <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}</span>
          <span className="w-44 shrink-0 truncate text-xs text-foreground" title={r.domain ?? r.name}>
            {r.domain ?? r.name}
          </span>
          <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-sm bg-muted">
            <div className="h-full bg-primary/60" style={{ width: `${(r.answers / top) * 100}%` }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{r.answers}</span>
          <span className="hidden w-28 shrink-0 truncate text-[11px] text-muted-foreground sm:block">
            {r.engines.map(modelLabel).join(', ')}
          </span>
        </li>
      ))}
    </ol>
  );
};

export const WebsiteAiVisibilityPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [data, setData] = useState<AiVisibility | null>(null);
  const [report, setReport] = useState<AiCitationReport | null>(null);
  const [citability, setCitability] = useState<CitabilityReport | null>(null);
  const [corpus, setCorpus] = useState<LlmMentionsReport | null>(null);
  const [state, setState] = useState<AiMonitoringState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  // What the tier ASKS for versus what can run. A model dropped for a missing key leaves
  // no row anywhere, so a two-engine report read as a two-engine design.
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
      const [v, m, a, c, q, x] = await Promise.allSettled([
        userWebsitesService.aiVisibility(website.id, 90),
        userWebsitesService.aiMonitoringState(website.id),
        userWebsitesService.aiAnswers(website.id, 90),
        userWebsitesService.aiCitationReport(website.id, 90),
        userWebsitesService.citabilityReport(website.id, 90),
        userWebsitesService.llmMentions(website.id, 90),
      ]);
      setData(v.status === 'fulfilled' ? v.value : null);
      setState(m.status === 'fulfilled' ? m.value : null);
      setAnswers(a.status === 'fulfilled' ? a.value : null);
      setReport(c.status === 'fulfilled' ? c.value : null);
      setCitability(q.status === 'fulfilled' ? q.value : null);
      setCorpus(x.status === 'fulfilled' ? x.value : null);
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
        // passes the route's own validation and dies one layer down as a raw 23514.
        brand_name: label,
        homepage_domain: state?.site_host,
        // Switched ON at creation. Every existing subject in this workspace was
        // created inactive and silently never probed.
        sources_enabled: { llm: true, news: true, blogs: true, rss: true, youtube: false },
        run_first_refresh: false,
      });
      // Attach it to THIS site. Without the link the subject is workspace-level and
      // this panel deliberately ignores it.
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
      // Absent means ON; only an explicit false is off.
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
            AI Citations
          </CardTitle>
          <CardDescription>
            What the assistants answer when a buyer asks for what you sell — and who they cite instead of you.
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
            title="Nothing is being asked yet"
            description={
              data?.note ||
              'Track this site’s brand and we will put a buyer’s questions to every assistant on a schedule, then report who gets named and cited.'
            }
            action={
              state && !state.own_brand_tracked && !state.own_brand_subject_id ? (
                <Button size="sm" disabled={!!busy} onClick={trackOwnBrand}>
                  {busy === 'track' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
                  Track this site&rsquo;s brand
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  const t = data.totals;
  const failedShare = t.probes > 0 ? Math.round((t.failed / t.probes) * 100) : 0;
  const sentimentTotal = Object.values(data.sentiment).reduce((s, n) => s + n, 0);
  const engines = withRosterEngines(report?.engines ?? [], roster?.tiers?.cheap);
  const citedInstead = report?.cited_instead ?? [];
  const namedInstead = report?.named_instead ?? [];
  // Nobody browsed, so "cited" has no denominator. Say it once, at the top.
  const noSources = report?.status === 'no_sources';

  return (
    <div className="space-y-4">
      {editorDialog}

      <Card className="dashboard-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" />
                AI Citations
              </CardTitle>
              <CardDescription>
                What the assistants answer when a buyer asks for what you sell — and who they cite instead of
                you. {compact(t.answered)} answered questions across {data.models.length} assistants over{' '}
                {data.window_days} days · last asked {timeAgo(t.last_run_at)}
                {report?.totals.cost_usd ? ` · ${formatUsd(report.totals.cost_usd)} spent` : ''}
              </CardDescription>
            </div>
            {state?.own_brand_subject_id && !state.own_brand_inactive && (
              <Button size="sm" variant="secondary" className="shrink-0" disabled={!!busy} onClick={() => runNow(state.own_brand_subject_id!)}>
                {busy === 'run' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-1 h-3.5 w-3.5" />}
                Run probes now
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {state && (
            <MonitoringBanner
              state={state} busy={busy}
              onTrack={trackOwnBrand} onTurnOn={turnOn} onRun={runNow}
            />
          )}
          {noSources && report?.note && (
            <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
              <Quote className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{report.note}</span>
            </div>
          )}
          {failedShare >= 10 && (
            <div className="flex items-start gap-2 rounded-sm border border-[hsl(var(--warning)/0.25)] bg-[hsl(var(--warning-bg))] px-3 py-2 text-xs leading-snug text-amber-800 dark:text-amber-300">
              <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {compact(t.failed)} of {compact(t.probes)} questions ({failedShare}%) never got an answer and are
                excluded from every rate here. A failed call is not an absent mention — where a whole assistant
                failed it reads <b>Unknown</b> below, never 0%.
              </span>
            </div>
          )}
          {(() => {
            // The "cheap" tier is what every subject runs unless switched to frontier.
            const wanted = roster?.tiers?.cheap ?? [];
            const missing = wanted.filter((m) => !m.enabled);
            if (!roster || wanted.length === 0) return null;
            return (
              <div className="flex flex-wrap gap-1.5">
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
        </CardContent>
      </Card>

      {engines.length > 0 && (
        <div className={cn('grid gap-3', engineGridCols(engines.length))}>
          {engines.map((e) => (
            <AiEngineCard key={e.model} engine={e} citedInstead={citedInstead} namedInstead={namedInstead} />
          ))}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Quote className="h-4 w-4 text-primary" />
              Cited instead of you
            </CardTitle>
            <CardDescription>
              The pages an assistant linked as its source in answers that did <b>not</b> link yours. This is the
              page you have to beat, not a brand you have to out-shout.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RivalList
              rivals={citedInstead}
              empty={
                noSources
                  ? 'No assistant returned a single source in this window, so there is nothing to compare against — this is unknown, not "nobody beat you".'
                  : 'Every sourced answer in this window linked you.'
              }
            />
          </CardContent>
        </Card>

        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              Named instead of you
            </CardTitle>
            <CardDescription>
              Brands the assistants reached for in answers that never mentioned you. This is the competitive set
              as the model sees it, which is not always the one you would list.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RivalList rivals={namedInstead} empty="No competing brand was named in an answer that left you out." />
          </CardContent>
        </Card>
      </div>

      <LlmMentionsPanel
        report={corpus}
        onRefresh={async () => {
          try {
            await userWebsitesService.refreshLlmMentions(website.id);
            setCorpus(await userWebsitesService.llmMentions(website.id, 90));
          } catch (e: any) {
            toast({ title: 'Could not read the corpus', description: e?.message, variant: 'destructive' });
          }
        }}
      />

      <CitabilityPanel
        report={citability}
        onAnalyse={async (question) => {
          try {
            await userWebsitesService.analyseCitability(website.id, question);
            setCitability(await userWebsitesService.citabilityReport(website.id, 90));
          } catch (e: any) {
            toast({ title: 'Could not read the page', description: e?.message, variant: 'destructive' });
          }
        }}
      />

      <Card className="dashboard-card">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <MessageSquareQuote className="h-4 w-4 text-primary" />
                Question by question
              </CardTitle>
              <CardDescription>
                Every assistant&rsquo;s latest answer to every question we ask. They are the measurement — if they
                are not what your customers ask, nothing above means anything.
              </CardDescription>
            </div>
            {state?.own_brand_subject_id && (
              <Button size="sm" variant="outline" className="shrink-0" onClick={() => void openEditor()}>
                Edit questions
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {(() => {
            const questions = answers?.questions ?? [];
            if (questions.length === 0) {
              return <p className="py-6 text-center text-sm text-muted-foreground">No questions recorded.</p>;
            }
            // Every assistant the tier asks for gets a chip, so one that never ran is
            // a visible gap rather than a column that quietly does not exist.
            const rosterModels = (roster?.tiers?.cheap ?? []).map((m) => m.model);
            const seenModels = Array.from(new Set(questions.flatMap((q) => q.answers.map((a) => a.model))));
            const allModels = Array.from(new Set([...rosterModels, ...seenModels]));
            return (
              <ul className="space-y-2.5">
                {questions.map((q) => (
                  <li key={`${q.subject}:${q.template_key}`} className="rounded-sm border border-hairline">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 bg-surface-sunken px-3 py-2">
                      <p className="min-w-0 flex-1 text-xs font-medium leading-snug text-foreground">{q.prompt_text}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground" title={q.template_key}>
                        {q.subject} · asked {timeAgo(q.asked_at)}
                      </span>
                    </div>
                    <div className="divide-y divide-hairline">
                      {allModels.map((model) => {
                        const a = q.answers.find((x) => x.model === model);
                        const rosterEntry = roster?.tiers?.cheap?.find((m) => m.model === model);
                        const verdict = answerVerdict(a);
                        const key = `${q.subject}:${q.template_key}:${model}`;
                        const open = !!openAnswer[key];
                        return (
                          <div key={model} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="w-20 shrink-0 text-xs font-medium text-foreground">{modelLabel(model)}</span>
                              <Badge
                                variant={VERDICT_BADGE[verdict]}
                                title={verdict === 'failed' ? (a?.error ?? undefined) : undefined}
                              >
                                {verdict === 'not_run' && rosterEntry && !rosterEntry.enabled
                                  ? 'Not run — no key'
                                  : VERDICT_LABEL[verdict]}
                                {verdict === 'named' && a?.position != null ? ` · #${a.position}` : ''}
                              </Badge>
                              {a && !a.error && a.cited_urls.length > 0 && (
                                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                  sources: {a.cited_urls.slice(0, 4).map(displayHost).join(', ')}
                                  {a.cited_urls.length > 4 ? ` +${a.cited_urls.length - 4}` : ''}
                                </span>
                              )}
                              {a && !a.error && a.cited_urls.length === 0 && a.competitors.length > 0 && (
                                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground" title={a.competitors.join(', ')}>
                                  named: {a.competitors.slice(0, 5).join(', ')}
                                  {a.competitors.length > 5 ? ` +${a.competitors.length - 5}` : ''}
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
                                  <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                                    {a.cited_urls.slice(0, 8).map((u, i) => (
                                      <a key={i} href={u} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                        {displayHost(u)}
                                      </a>
                                    ))}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </li>
                ))}
              </ul>
            );
          })()}
        </CardContent>
      </Card>

      {data.subjects.length > 1 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">By subject</CardTitle>
            <CardDescription>Which of your brands and products the assistants actually know.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Answered</TableHead>
                  <TableHead className="text-right">Named</TableHead>
                  <TableHead className="text-right">Named rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.subjects.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="max-w-[280px] truncate font-medium">{s.label}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{s.subject_type}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.answered}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.mentioned}</TableCell>
                    <TableCell className="text-right">
                      {s.share_of_voice == null ? (
                        <span className={cn('text-xs font-medium', 'text-amber-800 dark:text-amber-300')}>
                          Unknown
                        </span>
                      ) : (
                        <span className="text-sm font-semibold tabular-nums text-foreground">{s.share_of_voice}%</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {sentimentTotal > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="text-base">How they talk about you</CardTitle>
            <CardDescription>Tone of the answers that named you, across {sentimentTotal} mentions.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6">
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
