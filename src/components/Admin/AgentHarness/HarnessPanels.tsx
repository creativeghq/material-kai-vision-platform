import React, { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertCircle, AlertTriangle, CheckCircle2, ExternalLink, Loader2, Play, Search, Square } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage } from '@/utils/edgeError';
import { formatDate, formatTime, timeAgo } from '@/utils/datetime';

import type {
  HarnessAgentRow,
  HarnessAttention,
  HarnessBackgroundAgent,
  HarnessConversationRow,
  HarnessEvalBatch,
  HarnessEvalCase,
  HarnessFailure,
  HarnessFailureKind,
  HarnessFlowRow,
  HarnessMemory,
  HarnessModelRow,
  HarnessSeriesPoint,
  HarnessStuckRun,
  HarnessToolRow,
} from './harnessTypes';
import { failTone, fmtInt, fmtMs, fmtPct, fmtTokens, fmtUsd, ratio, shortId } from './harnessFormat';
import { EvalCasesManager } from './EvalCasesManager';

export const Panel: React.FC<{
  id?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  flush?: boolean;
}> = ({ id, title, description, actions, children, className, flush }) => (
  <Card id={id} className={className}>
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2 space-y-0">
      <div className="min-w-0">
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription className="mt-1">{description}</CardDescription>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </CardHeader>
    <CardContent className={flush ? 'p-0' : undefined}>{children}</CardContent>
  </Card>
);

export const HarnessSection: React.FC<{
  id: string;
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, subtitle, icon, actions, children }) => (
  <section id={id} data-harness-section className="scroll-mt-24 border-t border-hairline pt-6 first:border-t-0 first:pt-0">
    <SectionHeader icon={icon} title={title} subtitle={subtitle} actions={actions} />
    <div className="space-y-4">{children}</div>
  </section>
);

const AREA_LABEL: Record<string, string> = {
  tool: 'Tools', eval: 'Evals', reply: 'Replies', request: 'Requests', cost: 'Cost', latency: 'Latency',
  quality: 'Quality', background: 'Background', flow: 'Flows', memory: 'Memory',
};

export const AttentionList: React.FC<{ items: HarnessAttention[]; onJump: (section: string) => void }> = ({ items, onJump }) => {
  if (items.length === 0) {
    return (
      <HubEmptyState
        icon={CheckCircle2}
        title="Nothing needs attention"
        description="No failing tools, evals, replies, runs or unpriced models in this window."
      />
    );
  }
  return (
    <ul className="divide-y divide-hairline overflow-hidden rounded-md border border-hairline bg-card">
      {items.map((a, i) => {
        const Icon = a.severity === 'error' ? AlertCircle : AlertTriangle;
        return (
          <li key={`${a.title}-${i}`}>
            <button
              type="button"
              onClick={() => onJump(a.section)}
              className="flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-surface-sunken"
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === 'error' ? 'text-[hsl(var(--error))]' : 'text-[hsl(var(--warning))]'}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.title}</span>
                <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{a.detail}</span>
              </span>
              <Badge variant="neutral" className="shrink-0">{AREA_LABEL[a.area] ?? a.area}</Badge>
            </button>
          </li>
        );
      })}
    </ul>
  );
};

const RateBadge: React.FC<{ num: number; den: number }> = ({ num, den }) => {
  const r = ratio(num, den);
  if (r == null) return <span className="text-muted-foreground">—</span>;
  if (num === 0) return <span className="tabular-nums text-muted-foreground">0%</span>;
  return <Badge variant={failTone(r)} className="tabular-nums">{fmtPct(r)}</Badge>;
};

export const HarnessTimeline: React.FC<{ series: HarnessSeriesPoint[]; hourly: boolean }> = ({ series, hourly }) => {
  const data = series.map((p) => ({
    label: hourly ? formatTime(p.bucket) : formatDate(p.bucket).replace(/, \d{4}$/, ''),
    Turns: p.turns,
    'Tool calls': p.tool_calls,
    'Tool failures': p.tool_failed,
    'Failed requests': p.requests_failed,
    'Cost (USD)': Number(p.cost_usd.toFixed(4)),
  }));
  if (data.every((d) => d.Turns === 0 && d['Tool calls'] === 0)) {
    return <HubEmptyState title="No agent activity in this window" description="Widen the window to see earlier turns." />;
  }
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--hairline))" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis yAxisId="n" allowDecimals={false} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <YAxis yAxisId="usd" orientation="right" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--hairline))', fontSize: 12 }}
            labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="n" dataKey="Tool calls" fill="hsl(var(--chart-2))" radius={[2, 2, 0, 0]} />
          <Bar yAxisId="n" dataKey="Turns" fill="hsl(var(--chart-1))" radius={[2, 2, 0, 0]} />
          <Line yAxisId="n" type="monotone" dataKey="Tool failures" stroke="hsl(var(--error))" strokeWidth={2} dot={false} />
          <Line yAxisId="n" type="monotone" dataKey="Failed requests" stroke="hsl(var(--warning))" strokeWidth={2} dot={false} />
          <Line yAxisId="usd" type="monotone" dataKey="Cost (USD)" stroke="hsl(var(--chart-3))" strokeDasharray="4 3" dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};

export const AgentsTable: React.FC<{ rows: HarnessAgentRow[] }> = ({ rows }) =>
  rows.length === 0 ? (
    <HubEmptyState title="No agent turns in this window" />
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent</TableHead>
          <TableHead className="text-right">Turns</TableHead>
          <TableHead className="text-right">Aux Calls</TableHead>
          <TableHead className="text-right">Users</TableHead>
          <TableHead className="text-right">p50</TableHead>
          <TableHead className="text-right">p95</TableHead>
          <TableHead className="text-right">Cost</TableHead>
          <TableHead className="text-right">Credits</TableHead>
          <TableHead>Models</TableHead>
          <TableHead>Last</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.agent}>
            <TableCell className="font-mono text-xs">{r.agent}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtInt(r.turns)}</TableCell>
            <TableCell className="text-right tabular-nums text-muted-foreground" title={`Memory / next-step calls · ${fmtUsd(r.aux_cost_usd)}`}>{fmtInt(r.aux_calls)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtInt(r.users)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtMs(r.p50_ms)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtMs(r.p95_ms)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtUsd(r.cost_usd)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmtInt(Math.round(r.credits))}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{(r.models ?? []).join(', ') || '—'}</TableCell>
            <TableCell className="text-xs text-muted-foreground">{timeAgo(r.last_at)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

export const ModelsTable: React.FC<{ rows: HarnessModelRow[] }> = ({ rows }) =>
  rows.length === 0 ? (
    <HubEmptyState title="No model calls in this window" />
  ) : (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Model</TableHead>
          <TableHead className="text-right">Calls</TableHead>
          <TableHead className="text-right">Input</TableHead>
          <TableHead className="text-right">Output</TableHead>
          <TableHead className="text-right">Cache Hit</TableHead>
          <TableHead className="text-right">p95</TableHead>
          <TableHead className="text-right">Cost</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => {
          const promptTokens = r.input_tokens + r.cache_read_tokens + r.cache_write_tokens;
          return (
            <TableRow key={r.model}>
              <TableCell className="font-mono text-xs">
                {r.model}
                {r.unpriced > 0 && (
                  <Badge variant="warning" className="ml-2" title="Calls with tokens but a zero cost — missing from ai_model_pricing">
                    {r.unpriced} unpriced
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.calls)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtTokens(r.input_tokens)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtTokens(r.output_tokens)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtPct(ratio(r.cache_read_tokens, promptTokens))}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtMs(r.p95_ms)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtUsd(r.cost_usd)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

export const ToolsTable: React.FC<{ rows: HarnessToolRow[] }> = ({ rows }) => {
  const [q, setQ] = useState('');
  const shown = rows.filter((r) => !q || r.tool.toLowerCase().includes(q.toLowerCase()));
  if (rows.length === 0) return <HubEmptyState title="No tool calls in this window" />;
  return (
    <>
      <div className="relative mb-3 max-w-xs">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter tools" className="h-8 pl-8 text-sm" />
      </div>
      {shown.length === 0 ? (
        <HubEmptyState
          variant="filtered"
          title="No tool matches"
          action={<Button size="sm" variant="outline" onClick={() => setQ('')}>Clear filter</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tool</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Zero Results</TableHead>
              <TableHead className="text-right">p50</TableHead>
              <TableHead className="text-right">p95</TableHead>
              <TableHead>Agents</TableHead>
              <TableHead>Last Error</TableHead>
              <TableHead>Last</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.tool}>
                <TableCell className="font-mono text-xs">{r.tool}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.calls)}</TableCell>
                <TableCell className="text-right"><RateBadge num={r.failed} den={r.calls} /></TableCell>
                <TableCell className="text-right"><RateBadge num={r.zero} den={r.calls - r.failed} /></TableCell>
                <TableCell className="text-right tabular-nums">{fmtMs(r.p50_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtMs(r.p95_ms)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{(r.agents ?? []).join(', ') || '—'}</TableCell>
                <TableCell className="max-w-[320px] truncate text-xs text-[hsl(var(--error))]" title={r.last_error ?? undefined}>
                  {r.last_error ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(r.last_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
};

const FAILURE_LABEL: Record<HarnessFailureKind, { label: string; variant: 'error' | 'warning' | 'info' | 'neutral' }> = {
  tool: { label: 'Tool', variant: 'error' },
  turn: { label: 'Model Turn', variant: 'error' },
  request: { label: 'Request', variant: 'warning' },
  no_response: { label: 'No Reply', variant: 'error' },
  background: { label: 'Background', variant: 'info' },
  flow: { label: 'Flow', variant: 'neutral' },
};

export const FailuresFeed: React.FC<{ rows: HarnessFailure[]; onOpenConversation: (id: string) => void }> = ({ rows, onOpenConversation }) => {
  const [kind, setKind] = useState<HarnessFailureKind | 'all'>('all');
  const counts = useMemo(() => {
    const c: Partial<Record<HarnessFailureKind, number>> = {};
    for (const r of rows) c[r.kind] = (c[r.kind] ?? 0) + 1;
    return c;
  }, [rows]);
  const shown = kind === 'all' ? rows : rows.filter((r) => r.kind === kind);
  if (rows.length === 0) {
    return <HubEmptyState title="No failures in this window" description="Tool errors, failed requests, empty replies, background and flow failures all land here." />;
  }
  return (
    <>
      <div className="mb-2 flex flex-wrap gap-1">
        <Button size="sm" variant={kind === 'all' ? 'secondary' : 'ghost'} onClick={() => setKind('all')}>All ({rows.length})</Button>
        {(Object.keys(counts) as HarnessFailureKind[]).map((k) => (
          <Button key={k} size="sm" variant={kind === k ? 'secondary' : 'ghost'} onClick={() => setKind(k)}>
            {FAILURE_LABEL[k].label} ({counts[k]})
          </Button>
        ))}
      </div>
      <ul className="max-h-[420px] divide-y divide-hairline overflow-y-auto rounded-md border border-hairline">
        {shown.map((f, i) => (
          <li key={`${f.kind}-${f.at}-${i}`} className="flex items-start gap-2 px-3 py-2 text-sm">
            <Badge variant={FAILURE_LABEL[f.kind].variant} className="mt-0.5 shrink-0">{FAILURE_LABEL[f.kind].label}</Badge>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">
                <span className="font-mono text-xs">{f.title}</span>
                {f.agent && <span className="ml-2 text-xs text-muted-foreground">{f.agent}</span>}
              </p>
              {f.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{f.detail}</p>}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="text-xs text-muted-foreground" title={formatDate(f.at, { withTime: true })}>{timeAgo(f.at)}</span>
              {f.conversation_id && (
                <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => onOpenConversation(f.conversation_id!)}>
                  Trace
                </Button>
              )}
              {f.flow_id && (
                <Link to="/flows" className="text-xs text-primary hover:underline">Flows</Link>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
};

export const EvalsPanel: React.FC<{
  latest: HarnessEvalCase[];
  batches: HarnessEvalBatch[];
  workspaceId: string | null;
  onOpenConversation: (id: string) => void;
  onRan: () => void;
}> = ({ latest, batches, workspaceId, onOpenConversation, onRan }) => {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ done: number; total: number } | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const stopRef = useRef(false);

  const runCase = async (caseKey: string, batchId: string): Promise<boolean> => {
    setRunning(caseKey);
    const { error } = await supabase.functions.invoke('agent-eval', {
      body: { case_key: caseKey, workspace_id: workspaceId, batch_id: batchId },
    });
    setRunning(null);
    if (error) {
      toast({ title: `Eval ${caseKey} could not run`, description: await edgeErrorMessage(error), variant: 'destructive' });
      return false;
    }
    return true;
  };

  const runOne = async (caseKey: string) => {
    if (await runCase(caseKey, crypto.randomUUID())) onRan();
  };

  const runAll = async () => {
    setConfirmAll(false);
    stopRef.current = false;
    const batchId = crypto.randomUUID();
    setQueue({ done: 0, total: latest.length });
    for (let i = 0; i < latest.length; i += 1) {
      if (stopRef.current) break;
      await runCase(latest[i].case_key, batchId);
      setQueue({ done: i + 1, total: latest.length });
    }
    setQueue(null);
    onRan();
  };

  const busy = running !== null || queue !== null;
  const last = batches[0];

  return (
    <Panel
      id="evals"
      title="Golden Evals"
      description={last
        ? `Last batch ${timeAgo(last.at)} · ${last.passed}/${last.runs} passed · ${fmtInt(Math.round(last.credits))} credits`
        : 'No eval batch has run yet.'}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" disabled={queue !== null} onClick={() => setManageOpen(true)}>
            Manage cases
          </Button>
          {queue ? (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { stopRef.current = true; }}>
              <Square className="h-3.5 w-3.5" /> Stop ({queue.done}/{queue.total})
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5" disabled={busy || !workspaceId || latest.length === 0} onClick={() => setConfirmAll(true)}>
              <Play className="h-3.5 w-3.5" /> Run all
            </Button>
          )}
        </div>
      }
    >
      {batches.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-1" aria-label="Pass rate by batch">
          {[...batches].reverse().map((b) => {
            const r = ratio(b.passed, b.runs) ?? 0;
            return (
              <div key={b.batch_id ?? b.at} className="flex flex-col items-center gap-1" title={`${formatDate(b.at, { withTime: true })} · ${b.passed}/${b.runs}`}>
                <div className="flex h-10 w-5 items-end overflow-hidden rounded-xs bg-surface-sunken">
                  <div className="w-full" style={{ height: `${Math.max(r * 100, 4)}%`, background: `hsl(var(--${failTone(1 - r)}))` }} />
                </div>
                <span className="text-[10px] tabular-nums text-muted-foreground">{fmtPct(r)}</span>
              </div>
            );
          })}
        </div>
      )}
      {latest.length === 0 ? (
        <HubEmptyState
          title="No active eval cases"
          description="Add a case to give the harness a regression check."
          action={<Button size="sm" variant="outline" onClick={() => setManageOpen(true)}>Manage cases</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>Verdict</TableHead>
              <TableHead>Why</TableHead>
              <TableHead className="text-right">Latency</TableHead>
              <TableHead>Ran</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {latest.map((c) => (
              <TableRow key={c.case_key}>
                <TableCell>
                  <p className="text-sm font-medium">{c.title}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{c.case_key}</p>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {c.agent}
                  {c.routed_agent && c.routed_agent !== c.agent && <span className="text-muted-foreground"> → {c.routed_agent}</span>}
                </TableCell>
                <TableCell>
                  {c.passed == null ? <Badge variant="neutral">Never Run</Badge>
                    : c.passed ? <Badge variant="success">Passed</Badge>
                      : <Badge variant="error">Failed</Badge>}
                </TableCell>
                <TableCell className="max-w-[280px] text-xs text-muted-foreground">
                  {c.error || (c.failures ?? []).map((f) => f.message).filter(Boolean).join(' · ') || '—'}
                  {(c.failure_classes ?? []).length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {(c.failure_classes ?? []).map((fc) => <Badge key={fc} variant="outline" className="font-mono text-[10px]">{fc}</Badge>)}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtMs(c.latency_ms)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(c.at)}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {c.conversation_id && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => onOpenConversation(c.conversation_id!)}>Trace</Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={busy || !workspaceId} onClick={() => void runOne(c.case_key)}>
                      {running === c.case_key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Run'}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Run all {latest.length} eval cases?</AlertDialogTitle>
            <AlertDialogDescription>
              Each case is a real agent turn run as you in the current workspace, so it spends credits and can take
              up to two minutes. They run one after another; you can stop between cases.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void runAll()}>Run all</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <EvalCasesManager open={manageOpen} onOpenChange={setManageOpen} onChanged={onRan} />
    </Panel>
  );
};

export const BackgroundAgentsTable: React.FC<{ rows: HarnessBackgroundAgent[]; stuck: HarnessStuckRun[] }> = ({ rows, stuck }) => (
  <>
    {stuck.length > 0 && (
      <div className="mb-3 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">
        {stuck.length} run{stuck.length === 1 ? '' : 's'} with no heartbeat for 15+ minutes:{' '}
        {stuck.map((s) => `${s.agent ?? 'agent'} (${shortId(s.run_id)}, ${s.status})`).join(', ')}
      </div>
    )}
    {rows.length === 0 ? (
      <HubEmptyState
        title="No background agents"
        action={<Button asChild size="sm" variant="outline"><Link to="/admin/ai-configs?tab=background-agents">Create one</Link></Button>}
      />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Agent</TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead className="text-right">Cost</TableHead>
            <TableHead>Last Run</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>
                <p className="text-sm font-medium">{r.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{r.agent_type}{r.model ? ` · ${r.model}` : ''}</p>
              </TableCell>
              <TableCell className="text-xs">
                {!r.enabled && <Badge variant="neutral" className="mr-1">Disabled</Badge>}
                <span className="font-mono">{r.trigger_type === 'cron' ? r.schedule : r.event_type ?? r.trigger_type}</span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.runs)}</TableCell>
              <TableCell className="text-right"><RateBadge num={r.failed} den={r.runs} /></TableCell>
              <TableCell className="text-right tabular-nums">{fmtMs(r.p95_ms)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtUsd(r.cost_usd)}</TableCell>
              <TableCell className="text-xs">
                {r.last_run_status && (
                  <Badge variant={r.last_run_status === 'completed' ? 'success' : r.last_run_status === 'failed' ? 'error' : 'info'} className="mr-1">
                    {r.last_run_status}
                  </Badge>
                )}
                <span className="text-muted-foreground">{timeAgo(r.last_run_at)}</span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </>
);

export const FlowsTable: React.FC<{ byStatus: Record<string, number>; rows: HarnessFlowRow[] }> = ({ byStatus, rows }) => (
  <>
    <div className="mb-3 flex flex-wrap gap-1.5 text-xs">
      {Object.entries(byStatus).map(([s, n]) => (
        <Badge key={s} variant={s === 'failed' ? 'error' : s === 'completed' ? 'success' : 'info'}>{s}: {fmtInt(n)}</Badge>
      ))}
    </div>
    {rows.length === 0 ? (
      <HubEmptyState title="No flow runs in this window" action={<Button asChild size="sm" variant="outline"><Link to="/flows">Open Flows</Link></Button>} />
    ) : (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Flow</TableHead>
            <TableHead className="text-right">Runs</TableHead>
            <TableHead className="text-right">Failed</TableHead>
            <TableHead className="text-right">p95</TableHead>
            <TableHead>Last</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.flow_id}>
              <TableCell>
                <p className="text-sm">{r.name}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{r.trigger_type}{r.is_global ? ' · global' : ''}</p>
              </TableCell>
              <TableCell className="text-right tabular-nums">{fmtInt(r.runs)}</TableCell>
              <TableCell className="text-right"><RateBadge num={r.failed} den={r.runs} /></TableCell>
              <TableCell className="text-right tabular-nums">{fmtMs(r.p95_ms)}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{timeAgo(r.last_at)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
  </>
);

export const MemoryPanel: React.FC<{ memory: HarnessMemory }> = ({ memory }) => {
  const stat = (label: string, value: number, tone?: 'warning') => (
    <div className="bg-card px-3 py-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-semibold tabular-nums ${tone === 'warning' && value > 0 ? 'text-[hsl(var(--warning))]' : ''}`}>{fmtInt(value)}</dd>
    </div>
  );
  return (
    <>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-hairline bg-hairline sm:grid-cols-4">
        {stat('Active', memory.active)}
        {stat('Created', memory.created_in_window)}
        {stat('Recalled', memory.recalled_in_window)}
        {stat('Never Recalled', memory.never_recalled)}
        {stat('Superseded', memory.superseded)}
        {stat('Expired', memory.expired)}
        {stat('Missing Embedding', memory.unembedded, 'warning')}
      </dl>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[['By Type', memory.by_type], ['By Agent', memory.by_agent]].map(([label, map]) => (
          <div key={label as string}>
            <p className="mb-1 text-xs font-semibold text-muted-foreground">{label as string}</p>
            <div className="flex flex-wrap gap-1">
              {Object.entries(map as Record<string, number>).sort((a, b) => b[1] - a[1]).map(([k, n]) => (
                <Badge key={k} variant="neutral" className="tabular-nums">{k} · {n}</Badge>
              ))}
              {Object.keys(map as Record<string, number>).length === 0 && <span className="text-xs text-muted-foreground">—</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};

type ConvFilter = 'all' | 'problems' | 'real';

export const ConversationsTable: React.FC<{
  rows: HarnessConversationRow[];
  onOpen: (id: string) => void;
}> = ({ rows, onOpen }) => {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<ConvFilter>('all');
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const needle = q.trim().toLowerCase();

  const shown = rows.filter((r) => {
    if (filter === 'problems' && !(r.tool_failed > 0 || r.rating_down > 0 || r.turns === 0)) return false;
    if (filter === 'real' && r.is_eval) return false;
    if (!needle) return true;
    return [r.id, r.title, r.user_email, r.agent].some((v) => (v ?? '').toLowerCase().includes(needle));
  });

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && uuid.test(q.trim())) onOpen(q.trim()); }}
            placeholder="Search title, user, agent — or paste a conversation id"
            className="h-8 pl-8 text-sm"
          />
        </div>
        {uuid.test(q.trim()) && (
          <Button size="sm" variant="secondary" onClick={() => onOpen(q.trim())}>Open trace</Button>
        )}
        <div className="flex gap-1">
          {([['all', 'All'], ['problems', 'With Problems'], ['real', 'Exclude Evals']] as const).map(([v, l]) => (
            <Button key={v} size="sm" variant={filter === v ? 'secondary' : 'ghost'} onClick={() => setFilter(v)}>{l}</Button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <HubEmptyState title="No conversations in this window" action={<Button asChild size="sm" variant="outline"><Link to="/agent-hub">Open Agent Hub</Link></Button>} />
      ) : shown.length === 0 ? (
        <HubEmptyState
          variant="filtered"
          title="No conversation matches"
          action={<Button size="sm" variant="outline" onClick={() => { setQ(''); setFilter('all'); }}>Clear filters</Button>}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Conversation</TableHead>
              <TableHead>Agent</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="text-right">Turns</TableHead>
              <TableHead className="text-right">Tools</TableHead>
              <TableHead className="text-right">Failed</TableHead>
              <TableHead className="text-right">Max Latency</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead>Last</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {shown.map((r) => (
              <TableRow key={r.id} className="cursor-pointer" onClick={() => onOpen(r.id)}>
                <TableCell className="max-w-[300px]">
                  <p className="truncate text-sm">{r.title || 'Untitled'}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    {shortId(r.id)}
                    {r.is_eval && <Badge variant="info" className="ml-1.5">Eval</Badge>}
                    {r.rating_down > 0 && <Badge variant="error" className="ml-1.5">Rated Down</Badge>}
                  </p>
                </TableCell>
                <TableCell className="font-mono text-xs">{r.agent ?? '—'}</TableCell>
                <TableCell className="max-w-[180px] truncate text-xs text-muted-foreground">{r.user_email ?? '—'}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.turns)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtInt(r.tool_calls)}</TableCell>
                <TableCell className="text-right">
                  {r.tool_failed > 0 ? <Badge variant="error" className="tabular-nums">{r.tool_failed}</Badge>
                    : <span className="tabular-nums text-muted-foreground">0</span>}
                  {r.tool_zero > 0 && <Badge variant="warning" className="ml-1 tabular-nums" title="Zero-result calls">{r.tool_zero}∅</Badge>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtMs(r.max_latency_ms)}</TableCell>
                <TableCell className="text-right tabular-nums">{fmtUsd(r.cost_usd)}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{timeAgo(r.last_at)}</TableCell>
                <TableCell>
                  <a
                    href={`/agent-hub?conversation=${r.id}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Open in Agent Hub"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
};
