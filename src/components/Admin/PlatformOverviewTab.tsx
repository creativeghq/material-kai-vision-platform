import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Loader2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, timeAgo } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { humanizeLabel } from '@/utils/humanize';

// Not in the generated types yet.
const untypedRpc = supabase.rpc.bind(supabase) as unknown as (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#84cc16'];
const WINDOW_DAYS = 84;

function getWeekNum(d: Date) {
  const start = new Date(d.getFullYear(), 0, 1);
  return Math.ceil(((d.getTime() - start.getTime()) / 86400000 + start.getDay() + 1) / 7);
}
function weekLabel(d: Date) { return `W${getWeekNum(d)}`; }
function buildWeeks(n: number): string[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (n - 1 - i) * 7); return weekLabel(d);
  });
}
function weekly<T>(rows: T[], at: (r: T) => string | null | undefined): { week: string; count: number }[] {
  const map = new Map<string, number>(buildWeeks(12).map((w) => [w, 0]));
  rows.forEach((r) => {
    const t = at(r);
    if (!t) return;
    const l = weekLabel(new Date(t));
    if (map.has(l)) map.set(l, (map.get(l) ?? 0) + 1);
  });
  return Array.from(map.entries()).map(([week, count]) => ({ week, count }));
}
const hasAny = (series: { count: number }[]) => series.some((s) => s.count > 0);

interface WorkspaceRow {
  workspace_id: string;
  name: string;
  kind: string | null;
  status: string | null;
  is_root: boolean;
  is_fixture: boolean;
  created_at: string;
  disabled_at: string | null;
  owner_name: string | null;
  owner_email: string | null;
  active_members: number;
  pending_members: number;
  entitled_modules: number;
  last_ai_activity_at: string | null;
}

interface AiUsageSummary {
  by_model?: { model_name: string; credits: number; cost: number }[];
  by_operation?: { operation_type: string; credits: number }[];
  by_day?: { day: string; cost: number; credits: number }[];
  by_user?: { user_id: string; credits: number; top_op: string | null }[];
  totals?: { total_cost_usd: number; unique_users: number };
}

interface Overview {
  workspaces: WorkspaceRow[] | null;
  workspacesError: string | null;
  quotes: { status: string; created_at: string }[];
  signups: { professional_type: string | null; created_at: string }[];
  topQuoted: { name: string; count: number }[];
  topBrands: { name: string; quotes: number }[];
  newProducts: { created_at: string }[];
  ai: AiUsageSummary;
  balances: number[];
  gen3d: { created_at: string; room_type: string | null }[];
}

const Section: React.FC<{ title: string; description: string; children: React.ReactNode }> = ({ title, description, children }) => (
  <section className="space-y-4 pt-4">
    <div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
    {children}
  </section>
);

const ChartCard: React.FC<{ title: string; description?: string; empty: boolean; emptyText: string; children: React.ReactNode }> = ({ title, description, empty, emptyText, children }) => (
  <Card>
    <CardHeader>
      <CardTitle>{title}</CardTitle>
      {description && <CardDescription>{description}</CardDescription>}
    </CardHeader>
    <CardContent>
      {empty ? <HubEmptyState title={emptyText} /> : children}
    </CardContent>
  </Card>
);

const WeeklyBars: React.FC<{ data: { week: string; count: number }[]; name: string; color: string }> = ({ data, name, color }) => (
  <ResponsiveContainer width="100%" height={220}>
    <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
      <Tooltip /><Bar dataKey="count" name={name} fill={color} radius={[4, 4, 0, 0]} />
    </BarChart>
  </ResponsiveContainer>
);

const HorizontalBars: React.FC<{ data: { label: string; value: number }[]; name: string }> = ({ data, name }) => (
  <ResponsiveContainer width="100%" height={Math.max(160, data.length * 28)}>
    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
      <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={120} />
      <Tooltip /><Bar dataKey="value" name={name} radius={[0, 4, 4, 0]}>{data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
    </BarChart>
  </ResponsiveContainer>
);

async function loadOverview(): Promise<Overview> {
  const since = new Date(); since.setDate(since.getDate() - WINDOW_DAYS);
  const sinceIso = since.toISOString();

  const [ws, quotes, signups, qItems, newProducts, ai, balances, gen3d] = await Promise.all([
    untypedRpc('admin_workspace_overview'),
    supabase.from('quote_requests').select('status,created_at').gte('created_at', sinceIso),
    supabase.from('user_profiles').select('professional_type,created_at').gte('created_at', sinceIso),
    // quote_items carries no timestamp, so inclusions are counted over all time.
    supabase.from('quote_items').select('product_id').not('product_id', 'is', null).limit(5000),
    supabase.from('products').select('created_at').gte('created_at', sinceIso).limit(5000),
    supabase.rpc('admin_ai_usage_summary', { p_since: sinceIso }),
    supabase.from('user_credits').select('balance'),
    supabase.from('generation_3d').select('created_at,room_type').gte('created_at', sinceIso).limit(5000),
  ]);

  const counts = new Map<string, number>();
  ((qItems.data ?? []) as { product_id: string }[]).forEach((i) => counts.set(i.product_id, (counts.get(i.product_id) ?? 0) + 1));
  const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  let topQuoted: Overview['topQuoted'] = [];
  let topBrands: Overview['topBrands'] = [];
  if (ranked.length > 0) {
    const { data: prods } = await supabase.from('products').select('id,name,metadata').in('id', ranked.slice(0, 500).map(([id]) => id));
    const byId = new Map(((prods ?? []) as { id: string; name: string; metadata: { factory_name?: string } | null }[]).map((p) => [p.id, p]));
    topQuoted = ranked.slice(0, 10).map(([id, count]) => ({ name: byId.get(id)?.name ?? '—', count }));
    const brands = new Map<string, number>();
    ranked.forEach(([id, count]) => {
      const brand = byId.get(id)?.metadata?.factory_name;
      if (brand) brands.set(brand, (brands.get(brand) ?? 0) + count);
    });
    topBrands = Array.from(brands.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, q]) => ({ name, quotes: q }));
  }

  return {
    workspaces: ws.error ? null : ((ws.data ?? []) as WorkspaceRow[]),
    workspacesError: ws.error?.message ?? null,
    quotes: (quotes.data ?? []) as Overview['quotes'],
    signups: (signups.data ?? []) as Overview['signups'],
    topQuoted,
    topBrands,
    newProducts: (newProducts.data ?? []) as Overview['newProducts'],
    ai: (ai.data ?? {}) as AiUsageSummary,
    balances: ((balances.data ?? []) as { balance: number | null }[]).map((b) => Number(b.balance ?? 0)),
    gen3d: (gen3d.data ?? []) as Overview['gen3d'],
  };
}

const WorkspacesSection: React.FC<{ rows: WorkspaceRow[] | null; error: string | null }> = ({ rows, error }) => {
  const live = (rows ?? []).filter((w) => !w.is_fixture && !w.disabled_at);
  const activeAi = live.filter((w) => w.last_ai_activity_at && Date.now() - new Date(w.last_ai_activity_at).getTime() < 30 * 86400000).length;
  return (
    <Section title="Workspaces" description="Every business on the platform, who owns it, and whether it is being used.">
      <HubStatGrid>
        <HubStatTile label="Workspaces" value={rows ? formatNumber(live.length) : '—'} category="Excluding fixtures and disabled" />
        <HubStatTile label="Members" value={rows ? formatNumber(live.reduce((s, w) => s + w.active_members, 0)) : '—'} category="Active memberships" />
        <HubStatTile label="Used AI in 30 Days" value={rows ? formatNumber(activeAi) : '—'} category="Workspaces with a model call" />
        <HubStatTile label="Without Members" value={rows ? formatNumber(live.filter((w) => w.active_members === 0).length) : '—'} category="No active member" />
      </HubStatGrid>
      <Card>
        <CardHeader>
          <CardTitle>All Workspaces</CardTitle>
          <CardDescription>Last activity is the latest AI call billed to the workspace.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {error ? (
            <div role="alert" className="px-4 py-3 text-sm text-[hsl(var(--error))]">Workspaces could not be read: {error}</div>
          ) : !rows || rows.length === 0 ? (
            <HubEmptyState title="No workspaces" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Workspace</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead className="text-right">Members</TableHead>
                  <TableHead className="text-right">Modules</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((w) => (
                  <TableRow key={w.workspace_id}>
                    <TableCell>
                      <div className="font-medium">{w.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {w.is_root && <Badge variant="info">Operator</Badge>}
                        {w.is_fixture && <Badge variant="neutral">Fixture</Badge>}
                        {w.disabled_at && <Badge variant="error">Disabled</Badge>}
                        {w.status && w.status !== 'active' && <Badge variant="warning">{humanizeLabel(w.status)}</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{w.kind ? humanizeLabel(w.kind) : '—'}</TableCell>
                    <TableCell className="text-sm">
                      <div>{w.owner_name ?? '—'}</div>
                      {w.owner_email && <div className="text-xs text-muted-foreground">{w.owner_email}</div>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {w.active_members}
                      {w.pending_members > 0 && <span className="text-xs text-muted-foreground"> +{w.pending_members} pending</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{w.entitled_modules}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatDate(w.created_at)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{w.last_ai_activity_at ? timeAgo(w.last_ai_activity_at) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </Section>
  );
};

export function PlatformOverviewTab() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadOverview().then(setData).catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return (
      <div role="alert" className="rounded-sm border border-[hsl(var(--error)/0.3)] bg-[hsl(var(--error-bg))] px-4 py-3 text-sm text-[hsl(var(--error))]">
        The platform could not be read: {error}
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24" aria-busy="true">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="Loading" />
      </div>
    );
  }

  const monthAgo = new Date(); monthAgo.setMonth(monthAgo.getMonth() - 1);
  const quoteStatus = new Map<string, number>();
  data.quotes.forEach((q) => quoteStatus.set(q.status, (quoteStatus.get(q.status) ?? 0) + 1));
  const won = (quoteStatus.get('accepted') ?? 0) + (quoteStatus.get('completed') ?? 0);
  const weeklyQuotes = weekly(data.quotes, (q) => q.created_at);
  const weeklySignups = weekly(data.signups, (s) => s.created_at);
  const userMix = new Map<string, number>();
  data.signups.forEach((s) => { const k = s.professional_type ?? 'other'; userMix.set(k, (userMix.get(k) ?? 0) + 1); });
  const weeklyProducts = weekly(data.newProducts, (p) => p.created_at);

  const ai = data.ai;
  const costByWeek = new Map<string, number>(buildWeeks(12).map((w) => [w, 0]));
  (ai.by_day ?? []).forEach((d) => {
    const wk = weekLabel(new Date(d.day));
    if (costByWeek.has(wk)) costByWeek.set(wk, (costByWeek.get(wk) ?? 0) + Number(d.cost ?? 0));
  });
  const costTrend = Array.from(costByWeek.entries()).map(([week, cost]) => ({ week, cost: +cost.toFixed(2) }));
  const balanceTiers: [string, (b: number) => boolean][] = [
    ['0–100', (b) => b <= 100], ['101–500', (b) => b > 100 && b <= 500], ['501–1k', (b) => b > 500 && b <= 1000],
    ['1k–5k', (b) => b > 1000 && b <= 5000], ['5k+', (b) => b > 5000],
  ];

  const weekly3d = weekly(data.gen3d, (g) => g.created_at);
  const rooms = new Map<string, number>();
  data.gen3d.forEach((g) => { if (g.room_type) rooms.set(humanizeLabel(g.room_type), (rooms.get(humanizeLabel(g.room_type)) ?? 0) + 1); });

  return (
    <div className="space-y-6">
      <WorkspacesSection rows={data.workspaces} error={data.workspacesError} />

      <Section title="Quotes & Users" description="Quote requests and new sign-ups over the last 12 weeks.">
        <HubStatGrid>
          <HubStatTile label="Quote Requests (12w)" value={formatNumber(data.quotes.length)} />
          <HubStatTile label="This Month" value={formatNumber(data.quotes.filter((q) => new Date(q.created_at) >= monthAgo).length)} />
          <HubStatTile label="Accept Rate" value={data.quotes.length > 0 ? `${Math.round((won / data.quotes.length) * 100)}%` : '—'} category="Accepted or completed" />
          <HubStatTile label="New Users (12w)" value={formatNumber(data.signups.length)} />
        </HubStatGrid>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Quote Requests per Week" empty={!hasAny(weeklyQuotes)} emptyText="No quote requests in 12 weeks">
            <WeeklyBars data={weeklyQuotes} name="Quote Requests" color={COLORS[0]} />
          </ChartCard>
          <ChartCard title="New Users per Week" empty={!hasAny(weeklySignups)} emptyText="No sign-ups in 12 weeks">
            <WeeklyBars data={weeklySignups} name="New Users" color={COLORS[1]} />
          </ChartCard>
          <ChartCard title="Quote Requests by Status" empty={quoteStatus.size === 0} emptyText="No quote requests in 12 weeks">
            <HorizontalBars data={Array.from(quoteStatus.entries()).map(([label, value]) => ({ label: humanizeLabel(label), value }))} name="Quote Requests" />
          </ChartCard>
          <ChartCard title="New Users by Professional Type" empty={userMix.size === 0} emptyText="No sign-ups in 12 weeks">
            <HorizontalBars data={Array.from(userMix.entries()).sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label: humanizeLabel(label), value }))} name="Users" />
          </ChartCard>
        </div>
      </Section>

      <Section title="Brand Engagement" description="Which brands and products appear on quotes, and how fast the catalogue grows.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Most Quoted Products</CardTitle><CardDescription>All time — quote lines carry no date.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {data.topQuoted.length === 0 ? <HubEmptyState title="No catalogue product has been quoted" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Product</TableHead><TableHead className="text-right">Quote Lines</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.topQuoted.map((r, i) => (
                      <TableRow key={i}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right tabular-nums">{r.count}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Most Quoted Brands</CardTitle><CardDescription>Quote lines grouped by the product's brand.</CardDescription></CardHeader>
            <CardContent className="p-0">
              {data.topBrands.length === 0 ? <HubEmptyState title="No quoted product names a brand" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Brand</TableHead><TableHead className="text-right">Quote Lines</TableHead></TableRow></TableHeader>
                  <TableBody>
                    {data.topBrands.map((r) => (
                      <TableRow key={r.name}><TableCell className="font-medium">{r.name}</TableCell><TableCell className="text-right tabular-nums">{r.quotes}</TableCell></TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
        <ChartCard title="New Products per Week" empty={!hasAny(weeklyProducts)} emptyText="No products added in 12 weeks">
          <WeeklyBars data={weeklyProducts} name="New Products" color={COLORS[2]} />
        </ChartCard>
      </Section>

      <Section title="Credit Economy & AI Costs" description="Where AI spend goes and how much credit users hold. Per-agent detail lives on Agent Harness.">
        <HubStatGrid>
          <HubStatTile label="AI Cost (12w)" value={`$${Number(ai.totals?.total_cost_usd ?? 0).toFixed(2)}`} category="Provider cost" />
          <HubStatTile label="Users Spending Credits" value={formatNumber(Number(ai.totals?.unique_users ?? 0))} category="12 weeks" />
          <HubStatTile label="Users With a Balance" value={formatNumber(data.balances.filter((b) => b > 0).length)} category={`${formatNumber(data.balances.length)} credit accounts`} />
        </HubStatGrid>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="AI Cost per Week (USD)" empty={!costTrend.some((c) => c.cost > 0)} emptyText="No AI cost in 12 weeks">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={costTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`$${String(v)}`, 'Cost USD']} />
                <Line type="monotone" dataKey="cost" stroke={COLORS[5]} strokeWidth={2} dot={false} name="Cost USD" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Credits by Model" empty={(ai.by_model ?? []).length === 0} emptyText="No AI usage in 12 weeks">
            <HorizontalBars data={(ai.by_model ?? []).slice(0, 10).map((m) => ({ label: m.model_name ?? 'unknown', value: Number(m.credits ?? 0) }))} name="Credits" />
          </ChartCard>
          <ChartCard title="Credits by Operation" empty={(ai.by_operation ?? []).length === 0} emptyText="No AI usage in 12 weeks">
            <HorizontalBars data={(ai.by_operation ?? []).slice(0, 10).map((o) => ({ label: humanizeLabel(o.operation_type), value: Number(o.credits ?? 0) }))} name="Credits" />
          </ChartCard>
          <ChartCard title="Users by Credit Balance" empty={data.balances.length === 0} emptyText="No credit accounts">
            <HorizontalBars data={balanceTiers.map(([label, test]) => ({ label, value: data.balances.filter(test).length }))} name="Users" />
          </ChartCard>
        </div>
      </Section>

      <Section title="3D Generation" description="Design Canvas 3D jobs over the last 12 weeks.">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="3D Jobs per Week" empty={!hasAny(weekly3d)} emptyText="No 3D jobs in 12 weeks">
            <WeeklyBars data={weekly3d} name="3D Jobs" color={COLORS[3]} />
          </ChartCard>
          <ChartCard title="3D Jobs by Room Type" description="Jobs that named a room." empty={rooms.size === 0} emptyText="No 3D job named a room type">
            <HorizontalBars data={Array.from(rooms.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([label, value]) => ({ label, value }))} name="3D Jobs" />
          </ChartCard>
        </div>
      </Section>
    </div>
  );
}
