import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, TrendingUp, AlertCircle, Clock, ArrowDownCircle, ArrowUpCircle, FileText, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  financeService,
  formatMoney,
  formatPct,
  ageBucketLabel,
  type AgingRow,
  type FollowUpRow,
  type PnlRow,
  type CashFlowRow,
  type Invoice,
  type AgeBucket,
} from '@/modules/finance/services/financeService';

const AGE_BUCKETS: AgeBucket[] = ['current', '0-30', '31-60', '61-90', '90+'];

const FinancePage: React.FC = () => {
  const { toast } = useToast();
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [ar, setAr] = useState<AgingRow[]>([]);
  const [ap, setAp] = useState<AgingRow[]>([]);
  const [followUps, setFollowUps] = useState<FollowUpRow[]>([]);
  const [pnl, setPnl] = useState<PnlRow[]>([]);
  const [cashFlow, setCashFlow] = useState<CashFlowRow[]>([]);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);

  useEffect(() => {
    void resolveWorkspace();
  }, []);

  const resolveWorkspace = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Not authenticated');
      setLoading(false);
      return;
    }
    const { data: member } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    setWorkspaceId(member?.workspace_id ?? null);
  };

  useEffect(() => {
    if (!workspaceId) return;
    void loadAll(workspaceId);
  }, [workspaceId]);

  const loadAll = async (wsId: string) => {
    try {
      setLoading(true);
      setError(null);
      const [arRows, apRows, queue, pnlRows, cashRows, invoices] = await Promise.all([
        financeService.getArAging(wsId),
        financeService.getApAging(wsId),
        financeService.getFollowUpQueue(wsId),
        financeService.getMonthlyPnl(wsId, 12),
        financeService.getCashFlowForecast(wsId, 90),
        financeService.listInvoices({ workspaceId: wsId, limit: 25 }),
      ]);
      setAr(arRows);
      setAp(apRows);
      setFollowUps(queue);
      setPnl(pnlRows);
      setCashFlow(cashRows);
      setRecentInvoices(invoices);
    } catch (err: any) {
      setError(err?.message ?? 'Failed to load finance data');
      toast({ title: 'Load failed', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // ---- Derived metrics
  const kpis = useMemo(() => {
    const arOutstanding = ar.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const apOutstanding = ap.reduce((acc, r) => acc + (r.amount_due || 0), 0);
    const overdue = ar.filter((r) => r.age_bucket !== 'current' && r.age_bucket !== 'paid' && r.age_bucket !== 'no_due_date');
    const overdueTotal = overdue.reduce((acc, r) => acc + (r.amount_due || 0), 0);

    const monthRevenue = pnl.length > 0 ? Number(pnl[pnl.length - 1].revenue_net ?? 0) : 0;
    const monthMargin = pnl.length > 0 ? Number(pnl[pnl.length - 1].gross_margin ?? 0) : 0;
    const monthMarginPct = pnl.length > 0 ? pnl[pnl.length - 1].gross_margin_pct : null;

    // DSO = avg days from issue to paid on the last 90 days of paid invoices.
    // Cheap proxy: avg days_overdue across currently outstanding rows + 30d term.
    const avgDsoProxy =
      ar.length > 0
        ? Math.round(ar.reduce((acc, r) => acc + (r.days_overdue || 0), 0) / ar.length) + 30
        : 0;

    return { arOutstanding, apOutstanding, overdueTotal, monthRevenue, monthMargin, monthMarginPct, avgDsoProxy };
  }, [ar, ap, pnl]);

  const arBuckets = useMemo(() => bucketize(ar), [ar]);
  const apBuckets = useMemo(() => bucketize(ap), [ap]);

  if (loading && !workspaceId) {
    return (
      <div className="flex h-[calc(100vh-200px)] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!workspaceId) {
    return (
      <div className="container max-w-3xl py-10">
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            No active workspace found for your account.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-7xl space-y-6 py-6">
      <PageHeader
        icon={DollarSign}
        title="Finance"
        subtitle="Revenue, receivables, payables, and follow-up queue."
      />

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5" />
            <span>{error}</span>
          </CardContent>
        </Card>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          icon={ArrowDownCircle}
          label="AR outstanding"
          value={formatMoney(kpis.arOutstanding)}
          accent={kpis.overdueTotal > 0 ? 'destructive' : 'default'}
          subtext={kpis.overdueTotal > 0 ? `${formatMoney(kpis.overdueTotal)} overdue` : 'All on schedule'}
        />
        <KpiCard
          icon={ArrowUpCircle}
          label="AP outstanding"
          value={formatMoney(kpis.apOutstanding)}
          subtext={`${ap.length} open bills`}
        />
        <KpiCard
          icon={TrendingUp}
          label="This month revenue (net)"
          value={formatMoney(kpis.monthRevenue)}
          subtext={
            kpis.monthMarginPct != null
              ? `${formatMoney(kpis.monthMargin)} margin · ${formatPct(kpis.monthMarginPct)}`
              : '—'
          }
        />
        <KpiCard
          icon={Clock}
          label="DSO (rough)"
          value={`${kpis.avgDsoProxy}d`}
          subtext={`${followUps.length} quotes need follow-up`}
        />
      </div>

      <Tabs defaultValue="ar" className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="ar" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Receivables ({ar.length})
          </TabsTrigger>
          <TabsTrigger value="ap" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Payables ({ap.length})
          </TabsTrigger>
          <TabsTrigger value="followups" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Follow-up queue ({followUps.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Recent invoices
          </TabsTrigger>
          <TabsTrigger value="cashflow" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Cash flow
          </TabsTrigger>
          <TabsTrigger value="pnl" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            P&amp;L
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ar" className="mt-4">
          <AgingTable buckets={arBuckets} rows={ar} kind="ar" />
        </TabsContent>
        <TabsContent value="ap" className="mt-4">
          <AgingTable buckets={apBuckets} rows={ap} kind="ap" />
        </TabsContent>
        <TabsContent value="followups" className="mt-4">
          <FollowUpsTable rows={followUps} />
        </TabsContent>
        <TabsContent value="invoices" className="mt-4">
          <RecentInvoicesTable rows={recentInvoices} />
        </TabsContent>
        <TabsContent value="cashflow" className="mt-4">
          <CashFlowChart rows={cashFlow} />
        </TabsContent>
        <TabsContent value="pnl" className="mt-4">
          <PnlTable rows={pnl} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

// =============================================================================
// Sub-components
// =============================================================================

const KpiCard: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  subtext: string;
  accent?: 'default' | 'destructive';
}> = ({ icon: Icon, label, value, subtext, accent }) => (
  <Card className="dashboard-card border-0">
    <CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className={`mt-2 text-2xl font-semibold ${accent === 'destructive' ? 'text-destructive' : ''}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{subtext}</div>
    </CardContent>
  </Card>
);

function bucketize(rows: AgingRow[]): Record<AgeBucket, { count: number; total: number }> {
  const out = {
    current: { count: 0, total: 0 },
    '0-30': { count: 0, total: 0 },
    '31-60': { count: 0, total: 0 },
    '61-90': { count: 0, total: 0 },
    '90+': { count: 0, total: 0 },
    paid: { count: 0, total: 0 },
    no_due_date: { count: 0, total: 0 },
  } as Record<AgeBucket, { count: number; total: number }>;
  for (const r of rows) {
    out[r.age_bucket].count += 1;
    out[r.age_bucket].total += r.amount_due || 0;
  }
  return out;
}

const AgingTable: React.FC<{
  buckets: Record<AgeBucket, { count: number; total: number }>;
  rows: AgingRow[];
  kind: 'ar' | 'ap';
}> = ({ buckets, rows, kind }) => {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {AGE_BUCKETS.map((b) => (
          <Card key={b} className="dashboard-card border-0">
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{ageBucketLabel(b)}</div>
              <div className="text-lg font-semibold">{formatMoney(buckets[b].total)}</div>
              <div className="text-[10px] text-muted-foreground">{buckets[b].count} row(s)</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="text-sm">Open {kind === 'ar' ? 'invoices' : 'supplier bills'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 text-left">Number</th>
                <th className="px-4 py-2 text-left">Bucket</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Due</th>
                <th className="px-4 py-2 text-right">Due date</th>
                <th className="px-4 py-2 text-right">Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nothing open here.</td></tr>
              )}
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
                  <td className="px-4 py-2 font-mono text-xs">
                    {kind === 'ar' ? (
                      <Link to={`/admin/finance/invoices/${r.id}`} className="text-primary hover:underline">
                        {r.internal_number}
                      </Link>
                    ) : (
                      r.supplier_bill_number ?? '—'
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={r.age_bucket === '90+' ? 'destructive' : r.age_bucket === '61-90' ? 'destructive' : 'outline'}>
                      {ageBucketLabel(r.age_bucket)}
                    </Badge>
                  </td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.total)}</td>
                  <td className="px-4 py-2 text-right">{formatMoney(r.amount_paid)}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatMoney(r.amount_due)}</td>
                  <td className="px-4 py-2 text-right">{r.due_at ?? '—'}</td>
                  <td className="px-4 py-2 text-right">{r.days_overdue > 0 ? `${r.days_overdue}d` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
};

const FollowUpsTable: React.FC<{ rows: FollowUpRow[] }> = ({ rows }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3">
      <CardTitle className="text-sm">Quotes needing a nudge</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Quote</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Value</th>
            <th className="px-4 py-2 text-right">Days idle</th>
            <th className="px-4 py-2 text-right">Next follow-up</th>
            <th className="px-4 py-2 text-left" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No follow-ups outstanding.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-border/30 hover:bg-muted/30">
              <td className="px-4 py-2">
                <Link to={`/quotes/${r.id}`} className="text-primary hover:underline">
                  {r.quote_number ?? r.name ?? r.id.slice(0, 8)}
                </Link>
              </td>
              <td className="px-4 py-2"><Badge variant="outline">{r.status}</Badge></td>
              <td className="px-4 py-2 text-right">{formatMoney(r.grand_total ?? 0, r.currency ?? 'EUR')}</td>
              <td className="px-4 py-2 text-right">{r.days_since_activity ?? '—'}d</td>
              <td className="px-4 py-2 text-right">{r.next_scheduled_follow_up ? new Date(r.next_scheduled_follow_up).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-right">
                <Link to={`/quotes/${r.id}`}><Button size="sm" variant="outline">Open</Button></Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

const RecentInvoicesTable: React.FC<{ rows: Invoice[] }> = ({ rows }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3">
      <CardTitle className="text-sm">Latest invoices</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Number</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-right">Total</th>
            <th className="px-4 py-2 text-right">Paid</th>
            <th className="px-4 py-2 text-right">Due</th>
            <th className="px-4 py-2 text-right">Issued</th>
            <th className="px-4 py-2 text-right">Due date</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No invoices yet.</td></tr>
          )}
          {rows.map((i) => (
            <tr key={i.id} className="border-b border-border/30 hover:bg-muted/30">
              <td className="px-4 py-2 font-mono text-xs">
                <Link to={`/admin/finance/invoices/${i.id}`} className="text-primary hover:underline">
                  {i.internal_number}
                </Link>
              </td>
              <td className="px-4 py-2">
                <Badge variant={i.status === 'overdue' ? 'destructive' : i.status === 'paid' ? 'default' : 'outline'}>
                  {i.status}
                </Badge>
              </td>
              <td className="px-4 py-2 text-right">{formatMoney(i.total, i.currency)}</td>
              <td className="px-4 py-2 text-right">{formatMoney(i.amount_paid, i.currency)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(i.amount_due, i.currency)}</td>
              <td className="px-4 py-2 text-right">{i.issued_at ? new Date(i.issued_at).toLocaleDateString() : '—'}</td>
              <td className="px-4 py-2 text-right">{i.due_at ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

const PnlTable: React.FC<{ rows: PnlRow[] }> = ({ rows }) => (
  <Card>
    <CardHeader className="border-b border-border/60 px-5 py-3">
      <CardTitle className="text-sm">Monthly P&amp;L</CardTitle>
    </CardHeader>
    <CardContent className="p-0">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b border-border/60">
            <th className="px-4 py-2 text-left">Month</th>
            <th className="px-4 py-2 text-right">Invoices</th>
            <th className="px-4 py-2 text-right">Revenue (net)</th>
            <th className="px-4 py-2 text-right">COGS</th>
            <th className="px-4 py-2 text-right">Gross margin</th>
            <th className="px-4 py-2 text-right">Margin %</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No invoices issued yet — nothing to roll up.</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.period_month} className="border-b border-border/30 hover:bg-muted/30">
              <td className="px-4 py-2">{new Date(r.period_month).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</td>
              <td className="px-4 py-2 text-right">{r.invoice_count}</td>
              <td className="px-4 py-2 text-right">{formatMoney(r.revenue_net)}</td>
              <td className="px-4 py-2 text-right">{formatMoney(r.cogs)}</td>
              <td className="px-4 py-2 text-right font-medium">{formatMoney(r.gross_margin)}</td>
              <td className="px-4 py-2 text-right">{formatPct(r.gross_margin_pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </CardContent>
  </Card>
);

const CashFlowChart: React.FC<{ rows: CashFlowRow[] }> = ({ rows }) => {
  const grouped = useMemo(() => {
    const acc = new Map<string, { in: number; out: number }>();
    for (const r of rows) {
      const key = r.expected_date.slice(0, 7); // group by month
      const cell = acc.get(key) ?? { in: 0, out: 0 };
      if (r.direction === 'in') cell.in += Number(r.amount ?? 0);
      else cell.out += Number(r.amount ?? 0);
      acc.set(key, cell);
    }
    return Array.from(acc.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="text-sm">Cash flow forecast (next 90 days)</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border/60">
              <th className="px-4 py-2 text-left">Month</th>
              <th className="px-4 py-2 text-right text-emerald-500">Expected in</th>
              <th className="px-4 py-2 text-right text-red-400">Expected out</th>
              <th className="px-4 py-2 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">No dated invoices or bills in the next 90 days.</td></tr>
            )}
            {grouped.map(([month, cell]) => (
              <tr key={month} className="border-b border-border/30">
                <td className="px-4 py-2">{month}</td>
                <td className="px-4 py-2 text-right text-emerald-500">{formatMoney(cell.in)}</td>
                <td className="px-4 py-2 text-right text-red-400">{formatMoney(cell.out)}</td>
                <td className={`px-4 py-2 text-right font-medium ${cell.in - cell.out < 0 ? 'text-destructive' : ''}`}>
                  {formatMoney(cell.in - cell.out)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
};

export default FinancePage;
