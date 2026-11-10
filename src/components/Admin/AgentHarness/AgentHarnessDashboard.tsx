import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Book,
  ChevronDown,
  Database as DatabaseIcon,
  ExternalLink,
  FileJson,
  FileText,
  LayoutGrid,
  Loader2,
  Radio,
  RefreshCw,
  Workflow,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { HubSegmented } from '@/components/core/hub/HubSegmented';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { PageHeader } from '@/components/shared/PageHeader';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { dataIntegrityService } from '@/services/dataIntegrityService';
import { timeAgo } from '@/utils/datetime';

import { AgentUnmetRequestsPanel } from './AgentUnmetRequestsPanel';
import { ConversationTraceSheet } from './ConversationTraceSheet';
import {
  AgentsTable,
  BackgroundAgentsTable,
  ConversationsTable,
  EvalsPanel,
  FailuresFeed,
  FlowsTable,
  HarnessTimeline,
  MemoryPanel,
  ModelsTable,
  Panel,
  ToolsTable,
} from './HarnessPanels';
import { PriceLookupsCard } from './PriceLookupsCard';
import { ResetPlatformDialog } from '../ResetPlatformDialog';
import type { HarnessOverview } from './harnessTypes';
import { delta, fmtInt, fmtMs, fmtPct, fmtUsd, ratio } from './harnessFormat';

const WINDOWS = [
  { value: '1', label: '24h' },
  { value: '7', label: '7d' },
  { value: '30', label: '30d' },
  { value: '90', label: '90d' },
] as const;
type WindowValue = (typeof WINDOWS)[number]['value'];

const ADMIN_PAGES: Array<{ group: string; items: Array<{ label: string; path: string }> }> = [
  {
    group: 'Harness Configuration',
    items: [
      { label: 'AI Configs — Prompts, Pricing, Models', path: '/admin/ai-configs' },
      { label: 'Background Agents', path: '/admin/ai-configs?tab=background-agents' },
      { label: 'API Gateway', path: '/admin/ai-configs?tab=api-gateway' },
      { label: 'Flows', path: '/flows' },
    ],
  },
  {
    group: 'Data & Pipeline',
    items: [
      { label: 'Materials Data', path: '/admin/materials-data' },
      { label: 'AI Data Review — Metadata, Relevancy, Duplicates', path: '/admin/ai-configs?tab=ai-data' },
      { label: 'Data Import', path: '/admin/data-import' },
      { label: 'Async Job Queue', path: '/admin/async-queue-monitor' },
      { label: 'Knowledge Base', path: '/admin/knowledge-base' },
      { label: '3D Model Debugging', path: '/admin/ai-configs?tab=3d-debug' },
    ],
  },
  {
    group: 'Platform',
    items: [
      { label: 'Operations', path: '/admin/operations' },
      { label: 'Data Health', path: '/admin/data-health' },
      { label: 'Application Logs', path: '/admin/logs' },
      { label: 'Monitoring', path: '/admin/monitoring' },
      { label: 'Modules', path: '/admin/modules' },
      { label: 'Plans', path: '/admin/plans' },
    ],
  },
  {
    group: 'Marketplace',
    items: [
      { label: 'Supplier Claims', path: '/admin/supplier-claims' },
      { label: 'Master Catalog', path: '/catalog-master' },
      { label: 'Freight Quotes', path: '/admin/freight-quotes' },
    ],
  },
];

const EXTERNAL_TOOLS = [
  { label: 'Sentry', href: 'https://ethosco.sentry.io/issues/', icon: AlertTriangle },
  { label: 'MIVAA API Docs', href: 'https://v1api.materialshub.gr/docs', icon: Book },
  { label: 'MIVAA ReDoc', href: 'https://v1api.materialshub.gr/redoc', icon: FileText },
  { label: 'Edge API Docs', href: '/api/edge-swagger.html', icon: DatabaseIcon },
  { label: 'Edge OpenAPI (JSON)', href: '/api/openapi-edge.json', icon: FileJson },
];

const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

const AgentHarnessDashboard: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const { activeWorkspaceId } = useWorkspace();
  const days = (WINDOWS.some((w) => w.value === params.get('days')) ? params.get('days') : '7') as WindowValue;
  const traceId = params.get('trace');

  const [data, setData] = useState<HarnessOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [openFindings, setOpenFindings] = useState(0);

  useEffect(() => {
    void dataIntegrityService.listFindings({ status: 'open' })
      .then((f) => setOpenFindings(f.length))
      .catch(() => setOpenFindings(0));
  }, []);

  const setParam = useCallback((key: string, value: string | null) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value == null) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }, [setParams]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: row, error: err } = await supabase.rpc('admin_agent_harness_overview', { p_days: Number(days) });
    if (err) setError(err.message);
    else {
      setError(null);
      setData(row as unknown as HarnessOverview);
      setLoadedAt(new Date().toISOString());
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => { void load(); }, 30_000);
    return () => window.clearInterval(t);
  }, [live, load]);

  const k = data?.kpis;
  const evalSummary = useMemo(() => {
    const ran = (data?.evals.latest ?? []).filter((c) => c.passed != null);
    return { ran: ran.length, passed: ran.filter((c) => c.passed).length, total: data?.evals.latest.length ?? 0 };
  }, [data]);
  const bg = useMemo(() => {
    const rows = data?.background.agents ?? [];
    return { runs: rows.reduce((s, r) => s + r.runs, 0), failed: rows.reduce((s, r) => s + r.failed, 0) };
  }, [data]);
  const flowTotals = useMemo(() => {
    const m = data?.flows.by_status ?? {};
    const total = Object.values(m).reduce((s, n) => s + n, 0);
    return { total, failed: m.failed ?? 0 };
  }, [data]);

  const windowCaption = `vs previous ${WINDOWS.find((w) => w.value === days)?.label}`;
  const openTrace = useCallback((id: string) => setParam('trace', id), [setParam]);

  return (
    <div>
      <PageHeader
        icon={Radio}
        title="Agent Harness"
        subtitle="Every agent turn, model call, tool call, eval, background run and flow — derived live from the harness logs."
        actions={
          <>
            <HubSegmented
              options={WINDOWS}
              value={days}
              onChange={(v) => setParam('days', v === '7' ? null : v)}
              aria-label="Time window"
            />
            <Button
              variant={live ? 'secondary' : 'outline'}
              size="sm"
              className="gap-1.5"
              onClick={() => setLive((v) => !v)}
              title="Refresh every 30 seconds"
            >
              <span className={`h-2 w-2 rounded-full ${live ? 'bg-[hsl(var(--success))] animate-pulse' : 'bg-muted-foreground/40'}`} />
              Live
            </Button>
            {loadedAt && <span className="hidden text-xs text-muted-foreground lg:inline">Updated {timeAgo(loadedAt)}</span>}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  <LayoutGrid className="h-3.5 w-3.5" /> Admin
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[70vh] w-72 overflow-y-auto">
                {ADMIN_PAGES.map((g, gi) => (
                  <React.Fragment key={g.group}>
                    {gi > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuLabel className="text-xs text-muted-foreground">{g.group}</DropdownMenuLabel>
                    {g.items.map((it) => (
                      <DropdownMenuItem key={it.path} asChild>
                        <Link to={it.path} className="flex items-center justify-between gap-2">
                          {it.label}
                          {it.path === '/admin/data-health' && openFindings > 0 && (
                            <span className="text-xs font-semibold text-[hsl(var(--error))]">{openFindings} open</span>
                          )}
                        </Link>
                      </DropdownMenuItem>
                    ))}
                  </React.Fragment>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Tools <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {EXTERNAL_TOOLS.map((t) => (
                  <DropdownMenuItem key={t.href} onClick={() => window.open(t.href, '_blank', 'noopener')} className="flex items-center gap-2">
                    <t.icon className="h-4 w-4" />
                    {t.label}
                    <ExternalLink className="ml-auto h-3 w-3" />
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5">
                  <ResetPlatformDialog />
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-4 p-3 sm:p-6">
        {error && (
          <div className="rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-4 py-3 text-sm text-[hsl(var(--error))]">
            Could not load the harness overview: {error}
          </div>
        )}

        {!data && loading && (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}

        {data && k && (
          <>
            <HubStatGrid>
              <HubStatTile
                label="Agent Turns"
                value={fmtInt(k.turns)}
                category={`${fmtInt(k.conversations)} conversations · ${fmtInt(k.users)} users · ${fmtInt(k.workspaces)} workspaces`}
                delta={delta(k.turns, k.turns_prev, true, windowCaption)}
                help="Main model turns from agent_usage_logs. Memory and next-step calls are counted separately as aux calls."
                onClick={() => scrollTo('agents')}
              />
              <HubStatTile
                label="Model + Tool Cost"
                value={fmtUsd(k.cost_usd)}
                category={`${fmtUsd(k.billed_usd)} billed · ${fmtInt(Math.round(k.credits))} credits`}
                delta={delta(k.cost_usd, k.cost_usd_prev, false, windowCaption)}
                help="Raw provider cost (tokens priced by ai_model_pricing) plus tool costs. Billed is after markup."
                onClick={() => scrollTo('agents')}
              />
              <HubStatTile
                label="Turn Latency p95"
                value={fmtMs(k.latency_p95_ms)}
                category={`p50 ${fmtMs(k.latency_p50_ms)}`}
                delta={delta(k.latency_p95_ms, k.latency_p95_prev_ms, false, windowCaption)}
                onClick={() => scrollTo('agents')}
              />
              <HubStatTile
                label="Tool Failure Rate"
                value={fmtPct(ratio(k.tool_failed, k.tool_calls))}
                category={k.tool_calls ? `${fmtInt(k.tool_failed)} of ${fmtInt(k.tool_calls)} calls` : 'No tool calls in window'}
                delta={delta(ratio(k.tool_failed, k.tool_calls), ratio(k.tool_failed_prev, k.tool_calls_prev), false, windowCaption)}
                onClick={() => scrollTo('tools')}
              />
              <HubStatTile
                label="Zero-Result Rate"
                value={fmtPct(ratio(k.tool_zero, k.tool_calls - k.tool_failed))}
                category={`${fmtInt(k.tool_zero)} successful calls returned nothing`}
                help="Measured against calls that SUCCEEDED — a failed call is unknown, not empty."
                onClick={() => scrollTo('tools')}
              />
              <HubStatTile
                label="Failed Requests"
                value={fmtPct(ratio(k.requests_failed, k.requests))}
                category={k.requests
                  ? Object.entries(k.requests_by_status).sort().map(([s, n]) => `${s}×${n}`).join(' · ')
                  : 'No agent-chat requests logged'}
                help={`Non-2xx responses from the agent-chat edge function (api_usage_logs).${data.window.requests_capped ? ' api_usage_logs keeps 15 days, so this covers the last 15 days only.' : ''}`}
                onClick={() => scrollTo('failures')}
              />
              <HubStatTile
                label="Empty Replies"
                value={fmtInt(k.no_response)}
                category={`${fmtInt(k.server_recovered)} recovered by server · ${fmtInt(k.client_cancelled)} cancelled`}
                help="Assistant turns persisted as 'No response from agent'."
                onClick={() => scrollTo('failures')}
              />
              <HubStatTile
                label="Prompt Cache Hit"
                value={fmtPct(ratio(k.cache_read_tokens, k.input_tokens + k.cache_read_tokens + k.cache_write_tokens))}
                category={`${fmtInt(Math.round(k.cache_read_tokens / 1000))}k read · ${fmtInt(Math.round(k.cache_write_tokens / 1000))}k written`}
                help="Cache-read tokens as a share of all prompt tokens (uncached input + cache read + cache write)."
                onClick={() => scrollTo('agents')}
              />
              <HubStatTile
                label="Eval Pass Rate"
                value={fmtPct(ratio(evalSummary.passed, evalSummary.ran))}
                category={evalSummary.ran
                  ? `${evalSummary.passed}/${evalSummary.ran} cases on their latest run${evalSummary.ran < evalSummary.total ? ` · ${evalSummary.total - evalSummary.ran} never run` : ''}`
                  : 'No case has run yet'}
                onClick={() => scrollTo('evals')}
              />
              <HubStatTile
                label="User Ratings"
                value={`${fmtInt(k.rating_up)} / ${fmtInt(k.rating_down)}`}
                category="Up / down"
                onClick={() => scrollTo('conversations')}
              />
              <HubStatTile
                label="Background Run Failures"
                value={fmtPct(ratio(bg.failed, bg.runs))}
                category={`${fmtInt(bg.failed)} of ${fmtInt(bg.runs)} runs${data.background.stuck.length ? ` · ${data.background.stuck.length} stuck` : ''}`}
                onClick={() => scrollTo('background')}
              />
              <HubStatTile
                label="Flow Run Failures"
                value={fmtPct(ratio(flowTotals.failed, flowTotals.total))}
                category={`${fmtInt(flowTotals.failed)} of ${fmtInt(flowTotals.total)} runs`}
                onClick={() => scrollTo('background')}
              />
            </HubStatGrid>

            <Panel
              id="activity"
              title="Activity"
              description={`Turns, tool calls and failures per ${Number(days) <= 2 ? 'hour' : 'day'} (UTC buckets). Dashed line is cost, right axis.`}
            >
              <HarnessTimeline series={data.series} hourly={Number(days) <= 2} />
            </Panel>

            <div id="agents" className="grid gap-4 xl:grid-cols-2">
              <Panel title="Agents" description="Per agent: main turns, aux calls (memory, next steps), latency and spend." flush>
                <AgentsTable rows={data.agents} />
              </Panel>
              <Panel title="Models" description="Token use, prompt-cache hit and cost per model." flush>
                <ModelsTable rows={data.models} />
              </Panel>
            </div>

            <Panel id="tools" title="Tools" description="Every tool the agents called in this window, worst offenders visible by rate.">
              <ToolsTable rows={data.tools} />
            </Panel>

            <div className="grid gap-4 xl:grid-cols-5">
              <Panel id="failures" title="Failures" description="Newest first, across tools, requests, replies, background agents and flows." className="xl:col-span-2">
                <FailuresFeed rows={data.failures} onOpenConversation={openTrace} />
              </Panel>
              <div className="xl:col-span-3">
                <EvalsPanel
                  latest={data.evals.latest}
                  batches={data.evals.batches}
                  workspaceId={activeWorkspaceId}
                  onOpenConversation={openTrace}
                  onRan={() => void load()}
                />
              </div>
            </div>

            <div id="unmet">
              <AgentUnmetRequestsPanel onOpenConversation={openTrace} />
            </div>

            <div id="background" className="grid gap-4 xl:grid-cols-2">
              <Panel
                title="Background Agents"
                description="Scheduled and event-driven agents, runs in this window."
                actions={<Button asChild size="sm" variant="ghost"><Link to="/admin/ai-configs?tab=background-agents">Configure</Link></Button>}
              >
                <BackgroundAgentsTable rows={data.background.agents} stuck={data.background.stuck} />
              </Panel>
              <Panel
                title="Flows"
                description="Automation runs (test runs excluded), busiest first."
                actions={<Button asChild size="sm" variant="ghost" className="gap-1.5"><Link to="/flows"><Workflow className="h-3.5 w-3.5" /> Open</Link></Button>}
              >
                <FlowsTable byStatus={data.flows.by_status} rows={data.flows.top} />
              </Panel>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Panel title="Agent Memory" description="Long-term memories the agents write and recall. Counts are all-time; created/recalled are in this window.">
                <MemoryPanel memory={data.memory} />
              </Panel>
              <PriceLookupsCard />
            </div>

            <Panel
              id="conversations"
              title="Conversations"
              description="Most recent 200 in this window. Click a row for the full trace: messages, model calls, tool arguments and results."
            >
              <ConversationsTable rows={data.conversations} onOpen={openTrace} />
            </Panel>
          </>
        )}
      </div>

      <ConversationTraceSheet conversationId={traceId} onOpenChange={(o) => { if (!o) setParam('trace', null); }} />
    </div>
  );
};

export default AgentHarnessDashboard;
