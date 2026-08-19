import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BarChart3, Filter, Info, Loader2, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { PageHeader } from '@/components/shared/PageHeader';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  HubDataTable,
  HubEmptyState,
  HubStatGrid,
  HubStatTile,
  type HubColumn,
} from '@/components/core/hub';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { formatMoney } from '@/utils/decimal';
import {
  dealsService,
  getDealForecast,
  getDealOutcomesByMonth,
  getDealOwnerStats,
  getDealStageFunnel,
  getDealVelocity,
  type DealForecastRow,
  type DealFunnelRow,
  type DealOutcomeRow,
  type DealOwnerStatRow,
  type DealType,
  type DealVelocityRow,
} from '@/services/dealsService';

/**
 * PIPELINE ANALYTICS — what the board cannot tell you by looking at it.
 *
 * Every number on this page is computed by SQL (`get_deal_stage_funnel`, `get_deal_velocity`,
 * `get_deal_outcomes_by_month`, `get_deal_owner_stats`, `get_deal_forecast`) and only formatted
 * here. That is not ceremony: a conversion rate implemented twice is a conversion rate that will
 * eventually disagree with itself, and the funnel in particular needs to know which stage is
 * further along — which the database already knows from `crm_deal_stages.sort` and the browser
 * would have to be told.
 *
 * Two honesty rules run through the whole page:
 *
 *   1. **Money is never summed across currencies.** Each money figure is per-currency, because
 *      €10,000 + $10,000 = 20,000 of nothing.
 *   2. **A measurement says how much data it rests on.** Stage velocity shows its sample size and
 *      refuses to draw a number from fewer than three observations. An average over two deals is
 *      not a cycle time, and a dashboard that renders it as one invites a staffing decision the
 *      data cannot support.
 */

/** Chart colours come from the theme tokens, so the page is legible in all four theme combinations. */
const CHART = {
  primary: 'hsl(var(--primary))',
  success: 'hsl(var(--success))',
  error: 'hsl(var(--error))',
  muted: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--hairline))',
};

/** Below this, an average is an anecdote. See the honesty rules above. */
const MIN_VELOCITY_SAMPLE = 3;

const tooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--hairline))',
  borderRadius: '8px',
  fontSize: '12px',
  color: 'hsl(var(--popover-foreground))',
} as const;

export default function PipelineAnalyticsPage() {
  const navigate = useNavigate();
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const [searchParams, setSearchParams] = useSearchParams();
  const ws = activeWorkspaceId ?? '';

  const [types, setTypes] = useState<DealType[] | null>(null);
  const [typeId, setTypeId] = useState<string | null>(searchParams.get('type'));
  const [months, setMonths] = useState(12);

  const [funnel, setFunnel] = useState<DealFunnelRow[]>([]);
  const [velocity, setVelocity] = useState<DealVelocityRow[]>([]);
  const [outcomes, setOutcomes] = useState<DealOutcomeRow[]>([]);
  const [owners, setOwners] = useState<DealOwnerStatRow[]>([]);
  const [forecast, setForecast] = useState<DealForecastRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ws) return;
    let cancelled = false;
    void dealsService.listTypes(ws).then((all) => {
      if (cancelled) return;
      setTypes(all);
      setTypeId((prev) => (prev && all.some((t) => t.id === prev) ? prev : all[0]?.id ?? null));
    }).catch(() => { if (!cancelled) setTypes([]); });
    return () => { cancelled = true; };
  }, [ws]);

  const load = useCallback(async () => {
    if (!ws || !typeId) return;
    setLoading(true);
    const [fn, ve, ou, ow, fc] = await Promise.all([
      getDealStageFunnel(ws, typeId).catch(() => [] as DealFunnelRow[]),
      getDealVelocity(ws, typeId).catch(() => [] as DealVelocityRow[]),
      getDealOutcomesByMonth(ws, typeId, months).catch(() => [] as DealOutcomeRow[]),
      getDealOwnerStats(ws, typeId).catch(() => [] as DealOwnerStatRow[]),
      getDealForecast(ws, typeId).catch(() => [] as DealForecastRow[]),
    ]);
    setFunnel(fn);
    setVelocity(ve);
    setOutcomes(ou);
    setOwners(ow);
    setForecast(fc);
    setLoading(false);
  }, [ws, typeId, months]);

  useEffect(() => { void load(); }, [load]);

  const pickType = (next: string) => {
    setTypeId(next);
    const p = new URLSearchParams(searchParams);
    p.set('type', next);
    setSearchParams(p, { replace: true });
  };

  // The primary currency = the one carrying the most open pipeline. Charts render ONE currency at
  // a time; mixing them into a single bar is the exact mistake the SQL is grouped to prevent.
  const currencies = useMemo(
    () => [...new Set(outcomes.map((o) => o.currency))].sort(),
    [outcomes],
  );
  const [currency, setCurrency] = useState<string | null>(null);
  const activeCurrency = currency ?? forecast[0]?.currency ?? currencies[0] ?? 'EUR';

  const monthly = useMemo(
    () => outcomes
      .filter((o) => o.currency === activeCurrency)
      .map((o) => ({
        month: new Date(o.month).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
        won: Number(o.won_count),
        lost: Number(o.lost_count),
        created: Number(o.created_count),
        wonValue: Number(o.won_value),
      })),
    [outcomes, activeCurrency],
  );

  const funnelChart = useMemo(
    () => funnel
      .filter((r) => !r.is_lost)
      .map((r) => ({ label: r.label, reached: Number(r.reached), conversion: r.conversion_pct })),
    [funnel],
  );

  const velocityChart = useMemo(
    () => velocity
      .filter((v) => Number(v.sample_size) >= MIN_VELOCITY_SAMPLE && v.avg_days != null)
      .map((v) => ({ label: v.label, days: Number(v.avg_days), n: Number(v.sample_size) })),
    [velocity],
  );

  const thinVelocity = velocity.filter((v) => Number(v.sample_size) > 0 && Number(v.sample_size) < MIN_VELOCITY_SAMPLE);

  const fc = forecast.find((f) => f.currency === activeCurrency) ?? forecast[0] ?? null;
  const totalWon = monthly.reduce((t, m) => t + m.won, 0);
  const totalLost = monthly.reduce((t, m) => t + m.lost, 0);
  const winRate = totalWon + totalLost > 0 ? Math.round((100 * totalWon) / (totalWon + totalLost)) : null;

  const ownerColumns: HubColumn<DealOwnerStatRow>[] = [
    { id: 'owner', header: 'Owner', cell: (r) => r.owner_name },
    { id: 'open', header: 'Open', align: 'right', cell: (r) => r.open_count },
    {
      id: 'openValue',
      header: 'Open value',
      align: 'right',
      cell: (r) => formatMoney(Number(r.open_value), r.currency, { decimals: 0 }),
    },
    { id: 'won', header: 'Won', align: 'right', cell: (r) => r.won_count },
    {
      id: 'wonValue',
      header: 'Won value',
      align: 'right',
      cell: (r) => formatMoney(Number(r.won_value), r.currency, { decimals: 0 }),
    },
    { id: 'lost', header: 'Lost', align: 'right', hideBelow: 'sm', cell: (r) => r.lost_count },
    {
      id: 'winRate',
      header: 'Win rate',
      align: 'right',
      cell: (r) => (r.win_rate_pct == null ? '—' : `${r.win_rate_pct}%`),
    },
  ];

  if (wsLoading || types === null) {
    return <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Pipeline analytics"
        subtitle="Conversion, velocity and outcomes — derived from the deals themselves"
        breadcrumbs={[{ label: 'CRM', to: '/crm' }, { label: 'Pipeline analytics' }]}
        actions={
          <>
            {types.length > 1 && (
              <Select value={typeId ?? undefined} onValueChange={pickType}>
                <SelectTrigger className="h-9 w-[180px] text-xs"><SelectValue placeholder="Deal type" /></SelectTrigger>
                <SelectContent>
                  {types.map((t) => <SelectItem key={t.id} value={t.id} className="text-xs">{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
              <SelectTrigger className="h-9 w-[130px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="3" className="text-xs">Last 3 months</SelectItem>
                <SelectItem value="6" className="text-xs">Last 6 months</SelectItem>
                <SelectItem value="12" className="text-xs">Last 12 months</SelectItem>
                <SelectItem value="24" className="text-xs">Last 24 months</SelectItem>
              </SelectContent>
            </Select>
            {currencies.length > 1 && (
              <Select value={activeCurrency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 w-[100px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {currencies.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button size="sm" variant="outline" onClick={() => navigate('/crm?tab=pipeline')}>
              Back to board
            </Button>
          </>
        }
      />

      <div className="space-y-6 p-4 sm:p-6">
        {loading && (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        )}

        {!loading && funnel.length === 0 && (
          <Card>
            <HubEmptyState
              icon={Filter}
              title="Nothing to analyse yet"
              description="Once this pipeline has deals in it, conversion, cycle time and win rate appear here."
              action={<Button size="sm" onClick={() => navigate('/crm?tab=pipeline')}>Open the board</Button>}
            />
          </Card>
        )}

        {!loading && funnel.length > 0 && (
          <>
            {/* ── Headline numbers ─────────────────────────────────────────────────── */}
            <HubStatGrid>
              <HubStatTile
                label="Weighted pipeline"
                value={formatMoney(Number(fc?.weighted_value ?? 0), activeCurrency, { decimals: 0 })}
                help="Open value × each deal's probability. A deal with no probability set falls back to how far along its stage is."
              />
              <HubStatTile
                label="Open pipeline"
                value={formatMoney(Number(fc?.open_value ?? 0), activeCurrency, { decimals: 0 })}
                category={`${fc?.open_count ?? 0} OPEN DEALS`}
              />
              <HubStatTile
                label={`Won · last ${months} months`}
                value={formatMoney(monthly.reduce((t, m) => t + m.wonValue, 0), activeCurrency, { decimals: 0 })}
                category={`${totalWon} DEALS`}
              />
              <HubStatTile
                label="Win rate"
                value={winRate == null ? '—' : `${winRate}%`}
                help="Won ÷ closed. Open deals are excluded — counting them as losses makes a healthy pipeline look like a failing one."
                category={winRate == null ? 'NOTHING CLOSED YET' : `${totalWon} WON / ${totalLost} LOST`}
              />
            </HubStatGrid>

            {/* ── Funnel ───────────────────────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Stage funnel"
                subtitle="How many deals ever reached each stage, and the share that went on to the next one."
              />
              <div className="grid gap-3 lg:grid-cols-5">
                <Card className="lg:col-span-3">
                  <CardHeader>
                    <CardTitle>Deals reaching each stage</CardTitle>
                    <CardDescription>
                      Derived from stage order — a deal sitting in stage 4 must have passed 1–3, so
                      this is correct from the first deal rather than only after history accrues.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={funnelChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} horizontal={false} />
                        <XAxis type="number" stroke={CHART.muted} fontSize={11} allowDecimals={false} />
                        <YAxis type="category" dataKey="label" stroke={CHART.muted} fontSize={11} width={120} />
                        <RTooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, 'deals']} />
                        <Bar dataKey="reached" fill={CHART.primary} radius={[0, 3, 3, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card className="lg:col-span-2">
                  <CardHeader>
                    <CardTitle>Conversion &amp; leakage</CardTitle>
                    <CardDescription>Where deals stop moving.</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-hairline">
                      {funnel.filter((r) => !r.is_lost).map((r) => (
                        <div key={r.stage_key} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{r.label}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {r.current_open} open
                              {r.lost_here > 0 && <> · {r.lost_here} lost here</>}
                            </p>
                          </div>
                          <span className="shrink-0 tabular-nums text-sm font-semibold">
                            {/* Null on the last stage: there is nothing to convert TO, and printing
                                0% there reads as total failure rather than end-of-funnel. */}
                            {r.conversion_pct == null ? '—' : `${r.conversion_pct}%`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </section>

            {/* ── Outcomes over time ───────────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Outcomes over time"
                subtitle={`Created, won and lost per month, in ${activeCurrency}.`}
              />
              <Card>
                <CardContent>
                  {monthly.length === 0 ? (
                    <HubEmptyState
                      icon={TrendingUp}
                      variant="filtered"
                      title="No closed deals in this window"
                      description="Widen the period, or close a deal and it will appear here."
                    />
                  ) : (
                    <ResponsiveContainer width="100%" height={280}>
                      <ComposedChart data={monthly} margin={{ left: 8, right: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                        <XAxis dataKey="month" stroke={CHART.muted} fontSize={11} />
                        <YAxis yAxisId="count" stroke={CHART.muted} fontSize={11} allowDecimals={false} />
                        <YAxis yAxisId="value" orientation="right" stroke={CHART.muted} fontSize={11} />
                        <RTooltip
                          contentStyle={tooltipStyle}
                          formatter={(value: number, name: string) =>
                            name === 'Won value'
                              ? [formatMoney(value, activeCurrency, { decimals: 0 }), name]
                              : [value, name]
                          }
                        />
                        <Legend wrapperStyle={{ fontSize: 11 }} />
                        <Bar yAxisId="count" dataKey="created" name="Created" fill={CHART.muted} radius={[3, 3, 0, 0]} />
                        <Bar yAxisId="count" dataKey="won" name="Won" fill={CHART.success} radius={[3, 3, 0, 0]} />
                        <Bar yAxisId="count" dataKey="lost" name="Lost" fill={CHART.error} radius={[3, 3, 0, 0]} />
                        <Line yAxisId="value" type="monotone" dataKey="wonValue" name="Won value" stroke={CHART.primary} strokeWidth={2} dot={false} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ── Velocity ─────────────────────────────────────────────────────────── */}
            <section>
              <SectionHeader
                title="Time in stage"
                subtitle="Average days a deal spends in each stage before moving on."
              />
              <Card>
                <CardContent>
                  {velocityChart.length === 0 ? (
                    <HubEmptyState
                      icon={Info}
                      title="Not enough movement recorded yet"
                      description={`Stage timing is measured from observed moves, so it needs at least ${MIN_VELOCITY_SAMPLE} completed transitions per stage. Deals that existed before history was switched on are excluded — how long they sat in earlier stages is not knowable, and guessing it would put an invented number here.`}
                    />
                  ) : (
                    <>
                      <ResponsiveContainer width="100%" height={240}>
                        <BarChart data={velocityChart} margin={{ left: 8, right: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke={CHART.grid} vertical={false} />
                          <XAxis dataKey="label" stroke={CHART.muted} fontSize={11} />
                          <YAxis stroke={CHART.muted} fontSize={11} />
                          <RTooltip
                            contentStyle={tooltipStyle}
                            formatter={(v: number, _n, p) => [`${v} days (${(p?.payload as { n: number })?.n} deals)`, 'Average']}
                          />
                          <Bar dataKey="days" radius={[3, 3, 0, 0]}>
                            {velocityChart.map((d) => (
                              <Cell key={d.label} fill={CHART.primary} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                      {thinVelocity.length > 0 && (
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          Not shown, too few observations to average:{' '}
                          {thinVelocity.map((v) => `${v.label} (${v.sample_size})`).join(', ')}.
                        </p>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            </section>

            {/* ── Owners ───────────────────────────────────────────────────────────── */}
            <section>
              <SectionHeader title="By owner" subtitle="Who is carrying what, and how much of it closes." />
              <HubDataTable
                rows={owners}
                columns={ownerColumns}
                rowId={(r) => `${r.owner_user_id ?? 'none'}-${r.currency}`}
                empty={
                  <HubEmptyState
                    icon={Filter}
                    title="No owner data yet"
                    description="Deals show up here once they have an owner."
                  />
                }
              />
            </section>
          </>
        )}
      </div>
    </>
  );
}
