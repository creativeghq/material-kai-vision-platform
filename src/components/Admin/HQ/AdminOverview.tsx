import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Book,
  CheckCircle2,
  ChevronDown,
  Database as DatabaseIcon,
  ExternalLink,
  FileJson,
  FileText,
  Info,
  LayoutDashboard,
  Loader2,
  RefreshCw,
} from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/core/ui/dropdown-menu';
import { Skeleton } from '@/components/core/ui/skeleton';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';
import { timeAgo } from '@/utils/datetime';

import { delta, fmtInt, fmtPct, fmtUsd, ratio } from '../AgentHarness/harnessFormat';
import type { HarnessOverview } from '../AgentHarness/harnessTypes';
import { ResetPlatformDialog } from '../ResetPlatformDialog';
import { approvalsTotal, useAdminAttention, type AdminAttention, type ApprovalQueue } from './adminAttention';
import { ADMIN_NAV } from './adminNav';

type Severity = 'critical' | 'warning' | 'info';

interface AttentionRow {
  id: string;
  severity: Severity;
  area: string;
  title: string;
  detail: string;
  to: string;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

const SEVERITY_META: Record<Severity, { icon: typeof AlertCircle; badge: 'error' | 'warning' | 'info'; label: string; tone: string }> = {
  critical: { icon: AlertCircle, badge: 'error', label: 'Critical', tone: 'text-[hsl(var(--error))]' },
  warning: { icon: AlertTriangle, badge: 'warning', label: 'Warning', tone: 'text-[hsl(var(--warning))]' },
  info: { icon: Info, badge: 'info', label: 'Info', tone: 'text-[hsl(var(--info))]' },
};

const APPROVAL_LABELS: Record<ApprovalQueue, { tab: string; one: string; many: string }> = {
  registrations: { tab: 'registrations', one: 'brand registration', many: 'brand registrations' },
  access: { tab: 'access', one: 'access request', many: 'access requests' },
  resellers: { tab: 'resellers', one: 'reseller application', many: 'reseller applications' },
  marketplace: { tab: 'marketplace', one: 'marketplace application', many: 'marketplace applications' },
  supplier_claims: { tab: 'supplier-claims', one: 'supplier claim', many: 'supplier claims' },
  freight_quotes: { tab: 'freight-quotes', one: 'freight quote request', many: 'freight quote requests' },
};

const EXTERNAL_TOOLS = [
  { label: 'Sentry', href: 'https://ethosco.sentry.io/issues/', icon: AlertTriangle },
  { label: 'MIVAA API Docs', href: 'https://v1api.materialshub.gr/docs', icon: Book },
  { label: 'MIVAA ReDoc', href: 'https://v1api.materialshub.gr/redoc', icon: FileText },
  { label: 'Edge API Docs', href: '/api/edge-swagger.html', icon: DatabaseIcon },
  { label: 'Edge OpenAPI (JSON)', href: '/api/openapi-edge.json', icon: FileJson },
];

const plural = (n: number, one: string, many: string) => `${fmtInt(n)} ${n === 1 ? one : many}`;

function platformRows(a: AdminAttention): AttentionRow[] {
  const rows: AttentionRow[] = [];
  if (a.providers.failing > 0) {
    rows.push({ id: 'providers', severity: 'critical', area: 'System', to: '/admin/system-health',
      title: `${plural(a.providers.failing, 'generation provider is', 'generation providers are')} failing`,
      detail: 'An enabled model answered its last health probe with an error. Generations on it will fail.' });
  }
  if (a.jobs.stale > 0) {
    rows.push({ id: 'jobs-stale', severity: 'critical', area: 'Pipeline', to: '/admin/async-queue-monitor',
      title: `${plural(a.jobs.stale, 'job has', 'jobs have')} stopped reporting`,
      detail: 'Processing with no heartbeat for 30 minutes or more.' });
  }
  if (a.integrity.critical > 0) {
    rows.push({ id: 'integrity-critical', severity: 'critical', area: 'Data', to: '/admin/data-health',
      title: plural(a.integrity.critical, 'critical integrity finding', 'critical integrity findings'),
      detail: 'Open findings from the nightly integrity sweep that need a decision.' });
  }
  if (a.jobs.failed_24h > 0) {
    rows.push({ id: 'jobs-failed', severity: 'warning', area: 'Pipeline', to: '/admin/async-queue-monitor',
      title: `${plural(a.jobs.failed_24h, 'job', 'jobs')} failed in the last 24 hours`,
      detail: 'Open the job for its stage history and the reason it ended.' });
  }
  if (a.ingestion.needs_review > 0) {
    rows.push({ id: 'ingestion', severity: 'warning', area: 'Pipeline', to: '/admin/ingestion-quality',
      title: `${plural(a.ingestion.needs_review, 'catalogue needs', 'catalogues need')} a quality review`,
      detail: 'The post-ingestion audit flagged these documents and nobody has marked them clean.' });
  }
  (Object.keys(APPROVAL_LABELS) as ApprovalQueue[]).forEach((q) => {
    const n = a.approvals[q];
    if (n > 0) {
      const l = APPROVAL_LABELS[q];
      rows.push({ id: `approval-${q}`, severity: 'warning', area: 'Approvals', to: `/admin/approvals?tab=${l.tab}`,
        title: `${plural(n, l.one, l.many)} waiting`, detail: 'Someone is waiting on an operator decision.' });
    }
  });
  if (a.integrity.warning > 0) {
    rows.push({ id: 'integrity-warning', severity: 'info', area: 'Data', to: '/admin/data-health',
      title: plural(a.integrity.warning, 'integrity warning', 'integrity warnings'),
      detail: 'Lower-severity findings still open.' });
  }
  if (a.providers.unprobed > 0) {
    rows.push({ id: 'providers-unprobed', severity: 'info', area: 'System', to: '/admin/system-health',
      title: `${plural(a.providers.unprobed, 'enabled provider has', 'enabled providers have')} no health probe`,
      detail: 'Their health is unknown, not good — nothing asks them.' });
  }
  return rows;
}

function harnessRows(h: HarnessOverview): AttentionRow[] {
  return h.attention.map((x, i) => ({
    id: `agent-${i}`,
    severity: x.severity === 'error' ? 'critical' : 'warning',
    area: 'Agents',
    title: x.title,
    detail: x.detail,
    to: '/admin/agents',
  }));
}

const AdminOverview: React.FC = () => {
  const navigate = useNavigate();
  const attention = useAdminAttention();
  const [harness, setHarness] = useState<HarnessOverview | null>(null);
  const [harnessError, setHarnessError] = useState<string | null>(null);
  const [harnessLoading, setHarnessLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<Severity | 'all'>('all');

  const loadHarness = useCallback(async () => {
    setHarnessLoading(true);
    const { data, error } = await supabase.rpc('admin_agent_harness_overview', { p_days: 7 });
    if (error) setHarnessError(error.message);
    else {
      setHarnessError(null);
      setHarness(data as unknown as HarnessOverview);
    }
    setHarnessLoading(false);
  }, []);

  useEffect(() => { void loadHarness(); }, [loadHarness]);

  const refreshAll = useCallback(() => {
    void attention.refresh();
    void loadHarness();
  }, [attention, loadHarness]);

  const rows = useMemo(() => {
    const all = [
      ...(attention.data ? platformRows(attention.data) : []),
      ...(harness ? harnessRows(harness) : []),
    ];
    return all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  }, [attention.data, harness]);

  const counts = useMemo(() => ({
    critical: rows.filter((r) => r.severity === 'critical').length,
    warning: rows.filter((r) => r.severity === 'warning').length,
    info: rows.filter((r) => r.severity === 'info').length,
  }), [rows]);

  const visible = severityFilter === 'all' ? rows : rows.filter((r) => r.severity === severityFilter);
  const busy = attention.loading || harnessLoading;
  const firstLoad = (!attention.data && !attention.error) || (!harness && !harnessError);

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Headquarters"
        subtitle="Every agent, pipeline and platform check in one place, with what needs a decision first."
        actions={
          <>
            {attention.data && (
              <span className="hidden text-xs text-muted-foreground lg:inline" aria-live="polite">
                Updated {timeAgo(attention.data.generated_at)}
              </span>
            )}
            <Button variant="outline" size="sm" className="gap-1.5" onClick={refreshAll} disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
              Refresh
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5">
                  Tools <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {EXTERNAL_TOOLS.map((t) => (
                  <DropdownMenuItem key={t.href} onClick={() => window.open(t.href, '_blank', 'noopener')} className="flex items-center gap-2">
                    <t.icon className="h-4 w-4" aria-hidden="true" />
                    {t.label}
                    <ExternalLink className="ml-auto h-3 w-3" aria-hidden="true" />
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

      <div className="space-y-6 p-3 sm:p-6">
        <section aria-labelledby="hq-attention-title">
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
              <div>
                <CardTitle id="hq-attention-title">Needs Attention</CardTitle>
                <CardDescription>Worst first. Each item opens the page where it is resolved.</CardDescription>
              </div>
              <div role="group" aria-label="Filter by severity" className="flex flex-wrap gap-1.5">
                {(['all', 'critical', 'warning', 'info'] as const).map((s) => {
                  const n = s === 'all' ? rows.length : counts[s];
                  const pressed = severityFilter === s;
                  return (
                    <Button
                      key={s}
                      type="button"
                      size="sm"
                      variant={pressed ? 'secondary' : 'ghost'}
                      aria-pressed={pressed}
                      onClick={() => setSeverityFilter(s)}
                      className="gap-1.5"
                    >
                      {s === 'all' ? 'All' : SEVERITY_META[s].label}
                      <span className="tabular-nums text-muted-foreground">{n}</span>
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {(attention.error || harnessError) && (
                <div role="alert" className="mx-4 mb-3 rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-3 py-2 text-sm text-[hsl(var(--error))]">
                  {attention.error && <p>Platform checks could not be read: {attention.error}. Their items are missing from this list, not clear.</p>}
                  {harnessError && <p>Agent checks could not be read: {harnessError}. Their items are missing from this list, not clear.</p>}
                </div>
              )}
              {firstLoad && rows.length === 0 ? (
                <ul aria-busy="true" aria-label="Loading checks" className="divide-y divide-hairline border-t border-hairline">
                  {[0, 1, 2].map((i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded-full" />
                      <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div>
                    </li>
                  ))}
                </ul>
              ) : visible.length === 0 ? (
                <div className="flex items-center gap-3 border-t border-hairline px-4 py-6 text-sm">
                  <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" aria-hidden="true" />
                  <span>
                    {severityFilter === 'all'
                      ? (attention.error || harnessError ? 'Nothing flagged by the checks that could be read.' : 'All clear. Nothing needs attention right now.')
                      : `No ${SEVERITY_META[severityFilter].label.toLowerCase()} items.`}
                  </span>
                </div>
              ) : (
                <ul className="divide-y divide-hairline border-t border-hairline">
                  {visible.map((r) => {
                    const meta = SEVERITY_META[r.severity];
                    const Icon = meta.icon;
                    return (
                      <li key={r.id}>
                        <Link
                          to={r.to}
                          className="group flex items-start gap-3 px-4 py-3 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        >
                          <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${meta.tone}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">
                              <span className="sr-only">{meta.label}: </span>{r.title}
                            </span>
                            <span className="mt-0.5 block line-clamp-2 text-xs text-muted-foreground">{r.detail}</span>
                          </span>
                          <Badge variant="neutral" className="hidden shrink-0 sm:inline-flex">{r.area}</Badge>
                          <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        <section aria-labelledby="hq-glance-title" className="space-y-3">
          <h2 id="hq-glance-title" className="font-sans text-sm font-semibold">At a Glance</h2>
          <HubStatGrid>
            <GlanceTile loading={!attention.data && !attention.error} error={attention.error}>
              {attention.data && (
                <HubStatTile
                  label="Pending Approvals"
                  value={fmtInt(approvalsTotal(attention.data))}
                  category="Across six queues"
                  help="Brand registrations, access requests, resellers, marketplace, supplier claims and freight quotes awaiting a decision."
                  onClick={() => navigate('/admin/approvals')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={!attention.data && !attention.error} error={attention.error}>
              {attention.data && (
                <HubStatTile
                  label="Open Integrity Findings"
                  value={fmtInt(attention.data.integrity.critical + attention.data.integrity.warning + attention.data.integrity.info)}
                  category={`${fmtInt(attention.data.integrity.critical)} critical · ${fmtInt(attention.data.integrity.warning)} warning`}
                  onClick={() => navigate('/admin/data-health')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={!attention.data && !attention.error} error={attention.error}>
              {attention.data && (
                <HubStatTile
                  label="Ingestion Quality"
                  value={attention.data.ingestion.audited
                    ? fmtPct(ratio(attention.data.ingestion.audited - attention.data.ingestion.needs_review, attention.data.ingestion.audited))
                    : '—'}
                  category={attention.data.ingestion.audited
                    ? `${fmtInt(attention.data.ingestion.needs_review)} of ${fmtInt(attention.data.ingestion.audited)} catalogues need review`
                    : 'No catalogue has been audited yet'}
                  help="Share of audited catalogues whose latest audit passed or was marked clean."
                  onClick={() => navigate('/admin/ingestion-quality')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={!attention.data && !attention.error} error={attention.error}>
              {attention.data && (
                <HubStatTile
                  label="Generation Providers"
                  value={`${fmtInt(attention.data.providers.enabled - attention.data.providers.failing - attention.data.providers.unprobed)} / ${fmtInt(attention.data.providers.enabled)}`}
                  category={`${fmtInt(attention.data.providers.failing)} failing · ${fmtInt(attention.data.providers.unprobed)} unprobed`}
                  help="Enabled models whose last health probe answered ok. An unprobed model is unknown, not healthy."
                  onClick={() => navigate('/admin/system-health')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={harnessLoading && !harness} error={harnessError}>
              {harness && (
                <HubStatTile
                  label="Agent Turns · 7d"
                  value={fmtInt(harness.kpis.turns)}
                  category={`${fmtInt(harness.kpis.conversations)} conversations · ${fmtInt(harness.kpis.users)} users`}
                  delta={delta(harness.kpis.turns, harness.kpis.turns_prev, true, 'vs previous 7d')}
                  onClick={() => navigate('/admin/agents')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={harnessLoading && !harness} error={harnessError}>
              {harness && (
                <HubStatTile
                  label="Model + Tool Cost · 7d"
                  value={fmtUsd(harness.kpis.cost_usd)}
                  category={`${fmtUsd(harness.kpis.billed_usd)} billed`}
                  delta={delta(harness.kpis.cost_usd, harness.kpis.cost_usd_prev, false, 'vs previous 7d')}
                  onClick={() => navigate('/admin/agents')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={harnessLoading && !harness} error={harnessError}>
              {harness && (
                <HubStatTile
                  label="Tool Failure Rate · 7d"
                  value={fmtPct(ratio(harness.kpis.tool_failed, harness.kpis.tool_calls))}
                  category={harness.kpis.tool_calls ? `${fmtInt(harness.kpis.tool_failed)} of ${fmtInt(harness.kpis.tool_calls)} calls` : 'No tool calls in window'}
                  delta={delta(ratio(harness.kpis.tool_failed, harness.kpis.tool_calls), ratio(harness.kpis.tool_failed_prev, harness.kpis.tool_calls_prev), false, 'vs previous 7d')}
                  onClick={() => navigate('/admin/agents')}
                />
              )}
            </GlanceTile>
            <GlanceTile loading={harnessLoading && !harness} error={harnessError}>
              {harness && (() => {
                const ran = harness.evals.latest.filter((c) => c.passed != null);
                const passed = ran.filter((c) => c.passed).length;
                return (
                  <HubStatTile
                    label="Eval Pass Rate"
                    value={fmtPct(ratio(passed, ran.length))}
                    category={ran.length ? `${passed}/${ran.length} cases on their latest run` : 'No case has run yet'}
                    onClick={() => navigate('/admin/agents')}
                  />
                );
              })()}
            </GlanceTile>
          </HubStatGrid>
        </section>

        <section aria-labelledby="hq-areas-title" className="space-y-3">
          <h2 id="hq-areas-title" className="font-sans text-sm font-semibold">Explore</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {ADMIN_NAV.filter((g) => g.label).map((g) => (
              <Card key={g.label}>
                <CardHeader className="pb-2">
                  <CardTitle>{g.label}</CardTitle>
                </CardHeader>
                <CardContent className="p-0 pb-2">
                  <ul>
                    {g.items.map((d) => {
                      const n = attention.data && d.count ? d.count(attention.data) : 0;
                      return (
                        <li key={d.id}>
                          <Link
                            to={d.path}
                            className="flex items-start gap-2.5 px-4 py-2 hover:bg-surface-sunken focus-visible:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          >
                            <d.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">{d.label}</span>
                              <span className="block text-xs text-muted-foreground">{d.description}</span>
                            </span>
                            {n > 0 && (
                              <Badge variant="warning" className="shrink-0 tabular-nums" aria-label={`${n} need attention`}>{n}</Badge>
                            )}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

const GlanceTile: React.FC<{ loading: boolean; error: string | null; children: React.ReactNode }> = ({ loading, error, children }) => {
  if (loading) return <Skeleton className="h-[104px] rounded-md" aria-label="Loading" />;
  if (error && !children) {
    return (
      <div className="rounded-md border border-hairline bg-card p-4 text-xs text-muted-foreground">
        Unknown — the source could not be read.
      </div>
    );
  }
  return <>{children}</>;
};

export default AdminOverview;
