import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ExternalLink, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Label } from '@/components/core/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/core/ui/sheet';
import { Switch } from '@/components/core/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, timeAgo } from '@/utils/datetime';

import { ConversationTraceSheet } from '../AgentHarness/ConversationTraceSheet';
import { failTone, fmtInt, fmtMs, fmtPct, fmtUsd, ratio } from '../AgentHarness/harnessFormat';
import { CronJobsPanel } from '../CronJobsPanel';
import { refreshAdminAttention } from './adminAttention';
import {
  ACTOR_LABEL, OUTCOME_LABEL, SOURCE_LABEL, STATUS_META,
  type OpsAgentRow, type OpsCase, type OpsCaseDetail, type OpsDesk,
} from './agentOpsTypes';
import { HqTabbedPage } from './HqTabbedPage';

const rpc = supabase.rpc.bind(supabase) as unknown as (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;

const WINDOWS = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
] as const;

const CASE_FILTERS = [
  { value: 'active', label: 'Active' },
  { value: 'escalated', label: 'Needs You' },
  { value: 'all', label: 'All' },
] as const;

type CaseFilter = (typeof CASE_FILTERS)[number]['value'];

const AGENT_GROUPS: Array<{ kind: OpsAgentRow['kind']; title: string; description: string }> = [
  { kind: 'dispatcher', title: 'Dispatcher', description: 'The JARVIS review turn that hands cases to the sub-agents. A review that never became a turn counts as failed.' },
  { kind: 'sub_agent', title: 'Agent Ops Sub-Agents', description: 'Stark investigates and fixes; Veritas verifies. Veritas\'s confirm / reject split is the measure of how often Stark is right.' },
  { kind: 'analysis_sub_agent', title: 'Analysis Sub-Agents', description: 'Sub-agents JARVIS calls inside chat turns.' },
  { kind: 'background_agent', title: 'Background Agents', description: 'Scheduled and event-driven runners.' },
];

const AgentOpsPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { toast } = useToast();
  type WindowValue = (typeof WINDOWS)[number]['value'];
  const days = (WINDOWS.some((w) => w.value === params.get('days')) ? params.get('days') : '7') as WindowValue;
  const caseId = params.get('case');
  const traceId = params.get('trace');

  const [data, setData] = useState<OpsDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null) next.delete(key); else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: row, error: err } = await rpc('admin_ops_desk', { p_days: Number(days) });
    if (err) setError(err.message);
    else { setError(null); setData(row as OpsDesk); }
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (key: string, fn: string, args: Record<string, unknown>, success: (d: unknown) => string) => {
    setBusy(key);
    const { data: res, error: err } = await rpc(fn, args);
    setBusy(null);
    if (err) { toast({ title: 'That did not work', description: err.message, variant: 'destructive' }); return null; }
    const r = res as { started?: boolean; reason?: string } | null;
    if (r && r.started === false) toast({ title: 'Review not started', description: r.reason });
    else toast({ title: success(res) });
    void load();
    void refreshAdminAttention();
    return res;
  }, [load, toast]);

  const startReview = (ids?: string[]) => act('review', 'admin_ops_start_review', { p_case_ids: ids ?? null },
    (d) => `JARVIS is reviewing ${(d as { cases?: number }).cases ?? ''} case${(d as { cases?: number }).cases === 1 ? '' : 's'}. Results appear here as Stark and Veritas file them.`);

  const counts = useMemo(() => {
    const cs = data?.cases ?? [];
    return {
      escalated: cs.filter((c) => c.status === 'escalated').length,
      open: cs.filter((c) => c.status === 'open').length,
      inReview: cs.filter((c) => c.status === 'investigating' || c.status === 'awaiting_review').length,
      resolved: cs.filter((c) => c.status === 'resolved').length,
    };
  }, [data]);

  const headerActions = (
    <>
      <HubSegmented options={WINDOWS} value={days} onChange={(v) => setParam('days', v === '7' ? null : v)} aria-label="Time window" />
      <Button variant="outline" size="sm" className="gap-1.5" disabled={!!busy}
        onClick={() => void act('sync', 'admin_ops_sync', {}, (d) => {
          const r = d as { opened?: number; cleared?: number };
          return `Cases synced: ${r.opened ?? 0} opened, ${r.cleared ?? 0} cleared.`;
        })}>
        {busy === 'sync' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        Sync Cases
      </Button>
      <Button size="sm" className="gap-1.5" disabled={!!busy || counts.open === 0} onClick={() => void startReview()}>
        {busy === 'review' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
        Run Review
      </Button>
    </>
  );

  const body = (render: () => React.ReactNode) => () => (
    <>
      {error && (
        <div role="alert" className="rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-4 py-3 text-sm text-[hsl(var(--error))]">
          Could not load Agent Ops: {error}
        </div>
      )}
      {!data && loading ? (
        <div className="flex justify-center py-20 text-muted-foreground" aria-busy="true"><Loader2 className="h-6 w-6 animate-spin" aria-label="Loading" /></div>
      ) : data ? render() : null}
    </>
  );

  return (
    <>
      <HqTabbedPage
        icon={ShieldCheck}
        title="Agent Ops"
        subtitle="What looks broken, and the agents working it: JARVIS hands each case to Stark, who investigates and fixes what is safe to fix, then to Veritas, who verifies the answer."
        actions={headerActions}
        tabs={[
          {
            id: 'cases', label: 'Cases', count: counts.escalated + counts.open + counts.inReview,
            render: body(() => (
              <CasesTab
                desk={data!}
                counts={counts}
                filter={(CASE_FILTERS.some((f) => f.value === params.get('filter')) ? params.get('filter') : 'active') as CaseFilter}
                onFilter={(v) => setParam('filter', v === 'active' ? null : v)}
                onOpen={(id) => setParam('case', id)}
                busy={busy}
                onSettings={(auto) => void act('settings', 'admin_ops_settings',
                  { p_auto_review: auto, p_review_batch: data!.settings.review_batch },
                  () => (auto ? 'Scheduled review is on: every 3 hours when cases are open.' : 'Scheduled review is off.'))}
              />
            )),
          },
          { id: 'agents', label: 'Agents', render: body(() => <AgentsTab agents={data!.agents} days={days} />) },
          { id: 'processes', label: 'Processes', render: body(() => <ProcessesTab desk={data!} onTrace={(id) => setParam('trace', id)} />) },
        ]}
      />
      <CaseSheet
        caseId={caseId}
        onClose={() => setParam('case', null)}
        onTrace={(id) => setParam('trace', id)}
        busy={busy}
        onAction={(id, action) => void act(action, 'admin_ops_case_action', { p_case_id: id, p_action: action },
          () => ({ resolve: 'Case resolved.', dismiss: 'Case dismissed.', reopen: 'Case reopened.' } as Record<string, string>)[action])}
        onReview={(id) => void startReview([id])}
        version={data}
      />
      <ConversationTraceSheet conversationId={traceId} onOpenChange={(o) => { if (!o) setParam('trace', null); }} />
    </>
  );
};

const CasesTab: React.FC<{
  desk: OpsDesk;
  counts: { escalated: number; open: number; inReview: number; resolved: number };
  filter: CaseFilter;
  onFilter: (v: CaseFilter) => void;
  onOpen: (id: string) => void;
  busy: string | null;
  onSettings: (auto: boolean) => void;
}> = ({ desk, counts, filter, onFilter, onOpen, busy, onSettings }) => {
  const rows = desk.cases.filter((c) =>
    filter === 'all' ? true
      : filter === 'escalated' ? c.status === 'escalated'
        : !['resolved', 'dismissed'].includes(c.status));
  return (
    <>
      <HubStatGrid>
        <HubStatTile label="Needs You" value={fmtInt(counts.escalated)} category="Verified, and only a person can finish it" onClick={() => onFilter('escalated')} />
        <HubStatTile label="Open" value={fmtInt(counts.open)} category="Waiting for a review" onClick={() => onFilter('active')} />
        <HubStatTile label="With Stark or Veritas" value={fmtInt(counts.inReview)} category="Being worked now" onClick={() => onFilter('active')} />
        <HubStatTile label="Resolved in Window" value={fmtInt(counts.resolved)} category="Fixed and verified, or the problem cleared" onClick={() => onFilter('all')} />
      </HubStatGrid>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
          <div>
            <CardTitle>Cases</CardTitle>
            <CardDescription>One case per problem source, opened and closed by the checks themselves every 15 minutes.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="ops-auto-review" checked={desk.settings.auto_review} disabled={busy === 'settings'} onCheckedChange={onSettings} />
              <Label htmlFor="ops-auto-review" className="text-xs">Scheduled Review (Every 3h)</Label>
            </div>
            <HubSegmented options={CASE_FILTERS} value={filter} onChange={onFilter} aria-label="Which cases" />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <HubEmptyState
              variant={filter === 'active' ? 'empty' : 'filtered'}
              title={filter === 'escalated' ? 'Nothing is waiting on you' : 'No open cases'}
              description={filter === 'escalated' ? 'Every verified case has been handled.' : 'The checks report nothing broken right now.'}
              action={filter !== 'active' ? <Button variant="outline" size="sm" onClick={() => onFilter('active')}>Show active cases</Button> : undefined}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Case</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead className="text-right">Evidence</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => <CaseRow key={c.id} c={c} onOpen={onOpen} />)}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
};

const severityBadge = (s: OpsCase['severity']) => (s === 'critical' ? 'error' : s === 'warning' ? 'warning' : 'info');

const CaseRow: React.FC<{ c: OpsCase; onOpen: (id: string) => void }> = ({ c, onOpen }) => (
  <TableRow className="cursor-pointer hover:bg-surface-sunken" onClick={() => onOpen(c.id)}>
    <TableCell className="max-w-[420px]">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onOpen(c.id); }}
        className="block text-left text-sm font-medium hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {c.title}
      </button>
      <div className="mt-0.5 flex items-center gap-1.5">
        <Badge variant={severityBadge(c.severity)} className="capitalize">{c.severity}</Badge>
        {c.round > 0 && <span className="text-xs text-muted-foreground">Round {c.round}</span>}
      </div>
    </TableCell>
    <TableCell className="text-sm text-muted-foreground">{SOURCE_LABEL[c.source_kind]}</TableCell>
    <TableCell><Badge variant={STATUS_META[c.status].badge}>{STATUS_META[c.status].label}</Badge></TableCell>
    <TableCell className="text-sm">
      {c.outcome ? OUTCOME_LABEL[c.outcome] : <span className="text-muted-foreground">—</span>}
      {c.verdict && <span className={`ml-1.5 text-xs ${c.verdict === 'confirmed' ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--error))]'}`}>{c.verdict === 'confirmed' ? 'Verified' : 'Rejected'}</span>}
    </TableCell>
    <TableCell className="text-right tabular-nums">{c.evidence_count != null ? fmtInt(c.evidence_count) : '—'}</TableCell>
    <TableCell className="text-sm text-muted-foreground">
      {c.last_event ? <>{ACTOR_LABEL[c.last_event.actor]} · {timeAgo(c.last_event.at)}</> : '—'}
    </TableCell>
  </TableRow>
);

const AgentsTab: React.FC<{ agents: OpsAgentRow[]; days: string }> = ({ agents, days }) => (
  <>
    {AGENT_GROUPS.map((g) => {
      const rows = agents.filter((a) => a.kind === g.kind);
      if (rows.length === 0) return null;
      return (
        <Card key={g.kind}>
          <CardHeader>
            <CardTitle>{g.title}</CardTitle>
            <CardDescription>{g.description} Last {WINDOWS.find((w) => w.value === days)?.label}.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Agent</TableHead>
                  <TableHead className="text-right">Runs</TableHead>
                  <TableHead className="text-right">Failure Rate</TableHead>
                  <TableHead className="text-right">Avg Duration</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead>Last Run</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((a) => {
                  const r = ratio(a.failed, a.runs);
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[340px]">
                        <div className="text-sm font-medium">{a.name}</div>
                        <div className="line-clamp-2 text-xs text-muted-foreground">{a.role}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtInt(a.runs)}</TableCell>
                      <TableCell className="text-right">
                        {r == null ? <span className="text-muted-foreground">—</span>
                          : <Badge variant={failTone(r)} className="tabular-nums">{fmtPct(r)}</Badge>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtMs(a.avg_ms)}</TableCell>
                      <TableCell className="text-right tabular-nums">{a.cost_usd != null ? fmtUsd(Number(a.cost_usd)) : '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{a.last_at ? timeAgo(a.last_at) : 'Never in window'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{a.note ?? '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      );
    })}
  </>
);

const ProcessesTab: React.FC<{ desk: OpsDesk; onTrace: (id: string) => void }> = ({ desk, onTrace }) => (
  <>
    <Card>
      <CardHeader>
        <CardTitle>Agent Ops Reviews</CardTitle>
        <CardDescription>Each review is one JARVIS turn. A review older than 10 minutes with no turn never started.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {desk.reviews.length === 0 ? (
          <HubEmptyState title="No review has run in this window" description="Run Review on this page starts one for the open cases." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead className="text-right">Cases</TableHead>
                <TableHead>Turn</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Trace</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desk.reviews.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">{formatDate(r.created_at, { withTime: true })}</TableCell>
                  <TableCell className="text-sm capitalize">{r.triggered_by}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cases}</TableCell>
                  <TableCell>
                    {r.never_started ? <Badge variant="error">Never Started</Badge>
                      : !r.turn_status ? <Badge variant="info">Starting</Badge>
                        : <Badge variant={r.turn_status === 'ok' ? 'success' : r.turn_status === 'running' ? 'info' : 'error'} className="capitalize">{r.turn_status.replace(/_/g, ' ')}</Badge>}
                    {r.turn_error && <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{r.turn_error}</div>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMs(r.total_ms)}</TableCell>
                  <TableCell><Button variant="ghost" size="sm" onClick={() => onTrace(r.conversation_id)}>Open</Button></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Background Agent Runs</CardTitle>
          <CardDescription>The latest 50 runs in this window.</CardDescription>
        </div>
        <Button asChild variant="ghost" size="sm"><Link to="/admin/ai-configs?tab=background-agents">Configure</Link></Button>
      </CardHeader>
      <CardContent className="p-0">
        {desk.runs.length === 0 ? (
          <HubEmptyState title="No background agent ran in this window" description="Widen the window to see earlier runs." />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agent</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Trigger</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Duration</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {desk.runs.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm font-medium">{r.agent}</TableCell>
                  <TableCell>
                    <Badge variant={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'error' : r.status === 'cancelled' ? 'neutral' : 'info'} className="capitalize">{r.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm capitalize text-muted-foreground">{r.triggered_by ?? '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtMs(r.duration_ms)}</TableCell>
                  <TableCell className="max-w-[320px] text-xs text-muted-foreground"><span className="line-clamp-2">{r.error ?? '—'}</span></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    <CronJobsPanel />

    <p className="text-xs text-muted-foreground">
      Document processing jobs have their own page: <Link to="/admin/async-queue-monitor" className="text-primary hover:underline">Job Queue</Link>.
    </p>
  </>
);

const CaseSheet: React.FC<{
  caseId: string | null;
  onClose: () => void;
  onTrace: (id: string) => void;
  onAction: (id: string, action: 'resolve' | 'dismiss' | 'reopen') => void;
  onReview: (id: string) => void;
  busy: string | null;
  version: unknown;
}> = ({ caseId, onClose, onTrace, onAction, onReview, busy, version }) => {
  const [detail, setDetail] = useState<OpsCaseDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!caseId) { setDetail(null); return; }
    let live = true;
    void rpc('admin_ops_case', { p_case_id: caseId }).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(error.message); else { setErr(null); setDetail(data as OpsCaseDetail); }
    });
    return () => { live = false; };
  }, [caseId, version]);

  const c = detail?.case;
  return (
    <Sheet open={!!caseId} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{c?.title ?? 'Case'}</SheetTitle>
          <SheetDescription>{c ? `${SOURCE_LABEL[c.source_kind]} · ${c.source_key}` : 'Loading…'}</SheetDescription>
        </SheetHeader>
        {err && <p role="alert" className="mt-4 text-sm text-[hsl(var(--error))]">Could not load the case: {err}</p>}
        {!c && !err && <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading" /></div>}
        {c && detail && (
          <div className="mt-4 space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={STATUS_META[c.status].badge}>{STATUS_META[c.status].label}</Badge>
              <Badge variant={severityBadge(c.severity)} className="capitalize">{c.severity}</Badge>
              {c.round > 0 && <span className="text-xs text-muted-foreground">Round {c.round} of 2</span>}
              <span className="text-xs text-muted-foreground">Opened {formatDate(c.opened_at, { withTime: true })}</span>
            </div>
            {c.summary && <p className="text-sm text-muted-foreground">{c.summary}</p>}

            <div className="flex flex-wrap gap-2">
              {c.status === 'open' && (
                <Button size="sm" className="gap-1.5" disabled={!!busy} onClick={() => onReview(c.id)}>
                  <Play className="h-3.5 w-3.5" aria-hidden="true" /> Review This Case
                </Button>
              )}
              {!['resolved', 'dismissed'].includes(c.status) && (
                <>
                  <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => onAction(c.id, 'resolve')}>Mark resolved</Button>
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onAction(c.id, 'dismiss')}>Dismiss</Button>
                </>
              )}
              {['resolved', 'dismissed', 'escalated'].includes(c.status) && (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => onAction(c.id, 'reopen')}>Reopen</Button>
              )}
            </div>

            {(c.diagnosis || c.proposed_fix || c.verdict_note) && (
              <section aria-labelledby="ops-answer" className="space-y-2 rounded-md border border-hairline bg-card p-3">
                <h3 id="ops-answer" className="text-sm font-semibold">
                  Stark's Answer{c.outcome ? `: ${OUTCOME_LABEL[c.outcome]}` : ''}
                </h3>
                {c.diagnosis && <p className="whitespace-pre-wrap text-sm">{c.diagnosis}</p>}
                {c.root_cause && <p className="text-sm"><span className="font-medium">Cause: </span>{c.root_cause}</p>}
                {c.proposed_fix && <p className="text-sm"><span className="font-medium">What to do: </span>{c.proposed_fix}</p>}
                {c.verdict && (
                  <p className={`text-sm ${c.verdict === 'confirmed' ? 'text-[hsl(var(--success))]' : 'text-[hsl(var(--error))]'}`}>
                    Veritas {c.verdict === 'confirmed' ? 'confirmed' : 'rejected'} this{c.verdict_note ? `: ${c.verdict_note}` : '.'}
                  </p>
                )}
              </section>
            )}

            <section aria-labelledby="ops-timeline">
              <h3 id="ops-timeline" className="mb-2 text-sm font-semibold">Timeline</h3>
              <ol className="space-y-2 border-l border-hairline pl-4">
                {detail.events.map((e) => (
                  <li key={e.id} className="text-sm">
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{ACTOR_LABEL[e.actor]}</span>
                      <span>{e.kind.replace(/_/g, ' ')}</span>
                      <span>{formatDate(e.created_at, { withTime: true })}</span>
                      {e.conversation_id && (
                        <button type="button" className="inline-flex items-center gap-1 text-primary hover:underline" onClick={() => onTrace(e.conversation_id!)}>
                          Trace <ExternalLink className="h-3 w-3" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                    {e.note && <p className="mt-0.5 whitespace-pre-wrap">{e.note}</p>}
                  </li>
                ))}
              </ol>
            </section>

            <section aria-labelledby="ops-evidence">
              <h3 id="ops-evidence" className="mb-2 text-sm font-semibold">Evidence</h3>
              {!detail.safe_fix_available && c.source_kind === 'integrity_check' && (
                <p className="mb-2 text-xs text-muted-foreground">No unattended heal is enabled for this check, so Stark can diagnose it but not change data.</p>
              )}
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all rounded-sm border border-hairline bg-surface-sunken p-2 text-[11px] leading-relaxed">
                {JSON.stringify(detail.evidence, null, 2)}
              </pre>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
};

export default AgentOpsPage;
