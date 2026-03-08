import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Building2, TrendingUp, Star, Users, MessageSquare, Eye,
  Package, Loader2, Search, Target, Zap, Award, Globe, Layers, Activity,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import { useFactoryRole } from '@/hooks/useFactoryRole';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/shared/PageHeader';

// ── Color palette ──────────────────────────────────────────────
const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#84cc16'];

// ── Helpers ───────────────────────────────────────────────────
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
function weeksAgo(n: number): Date {
  const d = new Date(); d.setDate(d.getDate() - n * 7); return d;
}

// ── KPI Card ──────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon: Icon, color = 'text-primary' }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <div className="relative rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-primary/30 transition-all overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────
function SectionHeader({ title, desc, icon: Icon }: { title: string; desc?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="mt-14 mb-6">
      <div className="flex items-center gap-2.5 mb-2">
        <Icon className="h-4 w-4 text-primary shrink-0" />
        <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      </div>
      {desc && <p className="text-sm text-muted-foreground leading-snug">{desc}</p>}
      <div className="mt-4 border-b border-border/50" />
    </div>
  );
}

function EmptyState({ message = 'No data yet for this period' }: { message?: string }) {
  return <div className="flex items-center justify-center h-full min-h-[80px] text-xs text-muted-foreground italic py-8">{message}</div>;
}

function formatProfType(type: string): string {
  const map: Record<string, string> = {
    interior_designer: 'Interior Designer', architect: 'Architect',
    designer: 'Designer', manufacturer: 'Manufacturer', brand: 'Brand',
    supplier: 'Supplier', sourcing_agent: 'Sourcing Agent',
    consultant: 'Consultant', other: 'Other',
  };
  return map[type] ?? type;
}

function getMomentum(lastRequested: string | null): string {
  if (!lastRequested) return 'cool';
  const days = (Date.now() - new Date(lastRequested).getTime()) / 86400000;
  return days < 7 ? 'hot' : days < 21 ? 'warm' : 'cool';
}

function prettifyKey(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().replace(/^\w/, (c) => c.toUpperCase());
}

function getLifecycle(firstRequested: string | null, lastRequested: string | null, mentionCount: number, growthPct?: number): string {
  const now = Date.now();
  const firstDays = firstRequested ? (now - new Date(firstRequested).getTime()) / 86400000 : 999;
  const lastDays = lastRequested ? (now - new Date(lastRequested).getTime()) / 86400000 : 999;
  if (growthPct !== undefined) {
    if (growthPct > 80) return 'emerging';
    if (growthPct > 15) return 'growing';
    if (growthPct < -20) return 'declining';
    return 'established';
  }
  if (firstDays < 28) return 'emerging';
  if (lastDays < 7 && mentionCount > 40) return 'growing';
  if (lastDays > 35) return 'declining';
  return 'established';
}

function LifecycleBadge({ stage }: { stage: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    emerging:    { label: '✦ Emerging',    cls: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
    growing:     { label: '▲ Growing',     cls: 'bg-blue-500/10 text-blue-600 border-blue-500/20' },
    established: { label: '● Established', cls: 'bg-muted text-muted-foreground border-border/40' },
    declining:   { label: '▼ Declining',   cls: 'bg-red-500/10 text-red-500 border-red-500/20' },
  };
  const { label, cls } = map[stage] ?? map.established;
  return <span className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border ${cls}`}>{label}</span>;
}

// ─────────────────────────────────────────────────────────────
// My Factory Tab — Enhanced
// ─────────────────────────────────────────────────────────────
function MyFactoryTab({ factoryName, userId }: { factoryName: string; userId: string }) {
  const [loading, setLoading] = useState(true);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [moodboardSaves, setMoodboardSaves] = useState<{ week: string; saves: number }[]>([]);
  const [quoteCounts, setQuoteCounts] = useState<{ week: string; quotes: number }[]>([]);
  const [hireRequests, setHireRequests] = useState<{ week: string; hires: number }[]>([]);
  const [followerTrend, setFollowerTrend] = useState<{ week: string; follows: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; saves: number; quotes: number }[]>([]);
  const [ratingDist, setRatingDist] = useState<{ rating: string; count: number }[]>([]);
  const [kpis, setKpis] = useState({ totalSaves: 0, totalQuotes: 0, avgRating: 0, hireTotal: 0, followers: 0, profileViews: 0 });
  const [quoteByStatus, setQuoteByStatus] = useState<{ status: string; count: number }[]>([]);
  const [platformConv, setPlatformConv] = useState<string>('—');

  // Factory Visibility
  const [factorySearches, setFactorySearches] = useState<{ term: string; count: number }[]>([]);
  const [factorySearchCount, setFactorySearchCount] = useState(0);
  const [moodboardByCategory, setMoodboardByCategory] = useState<{ name: string; value: number }[]>([]);
  const [vrIn3dCount, setVrIn3dCount] = useState(0);

  // Attribute Explorer
  const [attributeKey, setAttributeKey] = useState<string>('');
  const [availableKeys, setAvailableKeys] = useState<string[]>([]);
  const [attributeData, setAttributeData] = useState<{ value: string; saves: number; quotes: number }[]>([]);
  const [allProductsMeta, setAllProductsMeta] = useState<{ id: string; metadata: Record<string, unknown> }[]>([]);
  const [productActivity, setProductActivity] = useState<{ id: string; saves: number; quotes: number }[]>([]);

  useEffect(() => { load(); }, [factoryName, userId]);

  // Recompute attribute data when key, meta, or activity changes
  useEffect(() => {
    if (!attributeKey || allProductsMeta.length === 0) return;
    const valMap = new Map<string, { saves: number; quotes: number }>();
    allProductsMeta.forEach(({ id, metadata }) => {
      const act = productActivity.find((a) => a.id === id);
      const s = act?.saves ?? 0;
      const q = act?.quotes ?? 0;
      const rawVal = metadata?.[attributeKey];
      if (rawVal == null || rawVal === '') return;
      const vals: string[] = Array.isArray(rawVal) ? rawVal.map(String) : [String(rawVal)];
      vals.forEach((v) => {
        const k = v.slice(0, 40);
        const entry = valMap.get(k) ?? { saves: 0, quotes: 0 };
        entry.saves += s; entry.quotes += q;
        valMap.set(k, entry);
      });
    });
    setAttributeData(
      Array.from(valMap.entries())
        .sort((a, b) => (b[1].saves + b[1].quotes) - (a[1].saves + a[1].quotes))
        .slice(0, 20)
        .map(([value, d]) => ({ value, ...d }))
    );
  }, [attributeKey, allProductsMeta, productActivity]);

  const load = async () => {
    setLoading(true);
    try {
      const weeks8 = buildWeeks(8);
      const ago12 = weeksAgo(12);

      // 1. Factory products with metadata
      const { data: products } = await supabase
        .from('products')
        .select('id, name, metadata')
        .contains('metadata', { factory_name: factoryName });

      const ids = (products ?? []).map((p) => p.id);
      setProductIds(ids);

      // Build metadata for attribute explorer
      const metas = (products ?? []).map((p) => ({
        id: p.id,
        metadata: (p.metadata ?? {}) as Record<string, unknown>,
      }));
      setAllProductsMeta(metas);

      const skipKeys = new Set(['factory_name', 'created_at', 'updated_at', 'id', 'image_url', 'url', 'description']);
      const keySet = new Set<string>();
      metas.forEach(({ metadata }) => Object.keys(metadata).forEach((k) => { if (!skipKeys.has(k)) keySet.add(k); }));
      const sortedKeys = Array.from(keySet).sort();
      setAvailableKeys(sortedKeys);
      if (sortedKeys.length > 0 && !attributeKey) setAttributeKey(sortedKeys[0]);

      // 2. Factory name searches
      const { data: searchRows } = await supabase
        .from('search_analytics')
        .select('query')
        .ilike('query', `%${factoryName}%`)
        .gte('created_at', ago12.toISOString());

      const termMap = new Map<string, number>();
      (searchRows ?? []).forEach((s) => {
        const t = String(s.query ?? '').toLowerCase().trim().slice(0, 50);
        if (t) termMap.set(t, (termMap.get(t) ?? 0) + 1);
      });
      setFactorySearchCount((searchRows ?? []).length);
      setFactorySearches(
        Array.from(termMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10)
          .map(([term, count]) => ({ term, count }))
      );

      let localTotalSaves = 0, localTotalQuotes = 0, localAvgRating = 0, localVrCount = 0;

      if (ids.length > 0) {
        // 3. Moodboard items with product metadata for category breakdown
        const { data: mbItems } = await supabase
          .from('moodboard_items')
          .select('created_at, material_id, products(metadata)')
          .in('material_id', ids);

        // 4. Quote items with status
        const { data: qItems } = await supabase
          .from('quote_items')
          .select('created_at, product_id, quotes(status)')
          .in('product_id', ids);

        // 5. Reviews
        const { data: reviews } = await supabase
          .from('material_reviews')
          .select('rating, created_at')
          .in('product_id', ids);

        // 6. 3D usage via demand analytics
        const { data: demandRows } = await supabase
          .from('material_demand_analytics')
          .select('times_used_in_3d, material_name');
        const productNames = new Set((products ?? []).map((p) => String(p.name ?? '').toLowerCase()));
        (demandRows ?? []).forEach((d: any) => {
          if (productNames.has(String(d.material_name ?? '').toLowerCase())) localVrCount += d.times_used_in_3d ?? 0;
        });
        setVrIn3dCount(localVrCount);

        // Weekly saves & quotes
        const mbByWeek = new Map<string, number>(weeks8.map((w) => [w, 0]));
        const qByWeek = new Map<string, number>(weeks8.map((w) => [w, 0]));
        (mbItems ?? []).forEach((i) => { const l = weekLabel(new Date(i.created_at)); if (mbByWeek.has(l)) mbByWeek.set(l, (mbByWeek.get(l) ?? 0) + 1); });
        (qItems ?? []).forEach((i) => { const l = weekLabel(new Date(i.created_at)); if (qByWeek.has(l)) qByWeek.set(l, (qByWeek.get(l) ?? 0) + 1); });
        setMoodboardSaves(Array.from(mbByWeek.entries()).map(([week, saves]) => ({ week, saves })));
        setQuoteCounts(Array.from(qByWeek.entries()).map(([week, quotes]) => ({ week, quotes })));

        // Moodboard by category
        const catMap = new Map<string, number>();
        (mbItems ?? []).forEach((i) => {
          const cat = ((i.products as any)?.metadata?.category as string) ?? 'Unknown';
          catMap.set(cat, (catMap.get(cat) ?? 0) + 1);
        });
        setMoodboardByCategory(
          Array.from(catMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([name, value]) => ({ name, value }))
        );

        // Per-product activity (for attribute explorer)
        const saveCounts = new Map<string, number>();
        const quotesCnt = new Map<string, number>();
        (mbItems ?? []).forEach((i) => saveCounts.set(i.material_id, (saveCounts.get(i.material_id) ?? 0) + 1));
        (qItems ?? []).forEach((i) => quotesCnt.set(i.product_id, (quotesCnt.get(i.product_id) ?? 0) + 1));
        const activity = ids.map((id) => ({ id, saves: saveCounts.get(id) ?? 0, quotes: quotesCnt.get(id) ?? 0 }));
        setProductActivity(activity);

        // Top products
        const productMap = new Map((products ?? []).map((p) => [p.id, p.name as string]));
        const combined = ids.map((id) => ({
          name: (productMap.get(id) ?? id).slice(0, 30),
          saves: saveCounts.get(id) ?? 0,
          quotes: quotesCnt.get(id) ?? 0,
        })).sort((a, b) => (b.saves + b.quotes) - (a.saves + a.quotes)).slice(0, 10);
        setTopProducts(combined);

        // Quote pipeline by status
        const statusOrder = ['draft', 'submitted', 'quoted', 'accepted', 'rejected'];
        const qStatusMap = new Map<string, number>();
        (qItems ?? []).forEach((qi: any) => {
          const s = (qi.quotes as any)?.status ?? 'unknown';
          qStatusMap.set(s, (qStatusMap.get(s) ?? 0) + 1);
        });
        setQuoteByStatus(
          statusOrder
            .filter((s) => qStatusMap.has(s))
            .map((status) => ({ status, count: qStatusMap.get(status) ?? 0 }))
            .concat(
              Array.from(qStatusMap.entries())
                .filter(([s]) => !statusOrder.includes(s))
                .map(([status, count]) => ({ status, count }))
            )
        );

        // Platform-wide benchmark
        const [{ count: platformSaves }, { count: platformQuotes }] = await Promise.all([
          supabase.from('moodboard_items').select('*', { count: 'exact', head: true }),
          supabase.from('quote_items').select('*', { count: 'exact', head: true }),
        ]);
        setPlatformConv((platformSaves ?? 0) > 0
          ? `${Math.round(((platformQuotes ?? 0) / (platformSaves ?? 1)) * 100)}%`
          : '—');

        // Rating distribution
        setRatingDist([1, 2, 3, 4, 5].map((r) => ({
          rating: `${r}★`, count: (reviews ?? []).filter((rv) => rv.rating === r).length,
        })));

        localTotalSaves = (mbItems ?? []).length;
        localTotalQuotes = (qItems ?? []).length;
        localAvgRating = (reviews ?? []).length > 0
          ? (reviews ?? []).reduce((s, r) => s + r.rating, 0) / (reviews ?? []).length : 0;
      }

      // 7. Hire requests
      const { data: hireData } = await supabase
        .from('profile_contact_requests').select('created_at').eq('to_user_id', userId);
      const hireByWeek = new Map<string, number>(weeks8.map((w) => [w, 0]));
      (hireData ?? []).forEach((h) => { const l = weekLabel(new Date(h.created_at)); if (hireByWeek.has(l)) hireByWeek.set(l, (hireByWeek.get(l) ?? 0) + 1); });
      setHireRequests(Array.from(hireByWeek.entries()).map(([week, hires]) => ({ week, hires })));

      // 8. Followers + profile views
      const { count: followers } = await supabase.from('user_follows').select('*', { count: 'exact', head: true }).eq('following_id', userId);
      const { data: followsRows } = await supabase.from('user_follows').select('created_at').eq('following_id', userId).gte('created_at', ago12.toISOString());
      const followByWeek = new Map<string, number>(weeks8.map((w) => [w, 0]));
      (followsRows ?? []).forEach((f) => { const l = weekLabel(new Date(f.created_at)); if (followByWeek.has(l)) followByWeek.set(l, (followByWeek.get(l) ?? 0) + 1); });
      setFollowerTrend(Array.from(followByWeek.entries()).map(([week, follows]) => ({ week, follows })));

      const { data: profileData } = await supabase.from('user_profiles').select('profile_views').eq('user_id', userId).maybeSingle();

      setKpis({
        totalSaves: localTotalSaves, totalQuotes: localTotalQuotes,
        avgRating: localAvgRating, hireTotal: (hireData ?? []).length,
        followers: followers ?? 0, profileViews: profileData?.profile_views ?? 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const activityData = moodboardSaves.map((m, i) => ({
    week: m.week, saves: m.saves,
    quotes: quoteCounts[i]?.quotes ?? 0,
    hires: hireRequests[i]?.hires ?? 0,
  }));

  const normalize = (v: number, max: number) => max > 0 ? Math.round((v / max) * 100) : 0;
  const radarMax = {
    saves: Math.max(kpis.totalSaves, 1), quotes: Math.max(kpis.totalQuotes, 1),
    rating: 5, hires: Math.max(kpis.hireTotal, 1),
    followers: Math.max(kpis.followers, 1), views: Math.max(kpis.profileViews, 1),
  };
  const radarData = [
    { axis: 'Moodboard Saves', value: normalize(kpis.totalSaves, radarMax.saves) },
    { axis: 'Quote Inclusions', value: normalize(kpis.totalQuotes, radarMax.quotes) },
    { axis: 'Avg Rating', value: normalize(kpis.avgRating, 5) },
    { axis: 'Hire Requests', value: normalize(kpis.hireTotal, radarMax.hires) },
    { axis: 'Followers', value: normalize(kpis.followers, radarMax.followers) },
    { axis: 'Profile Views', value: normalize(kpis.profileViews, radarMax.views) },
  ];

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">{factoryName}</h3>
        <Badge className="text-xs">{productIds.length} products in catalog</Badge>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
        <KpiCard label="Moodboard Saves" value={kpis.totalSaves} icon={Package} />
        <KpiCard label="Quote Inclusions" value={kpis.totalQuotes} icon={TrendingUp} />
        <KpiCard
          label="Your Conv. Rate"
          value={kpis.totalSaves > 0 ? `${Math.round((kpis.totalQuotes / kpis.totalSaves) * 100)}%` : '—'}
          icon={Target}
          color="text-green-600"
        />
        <KpiCard label="Platform Avg Conv." value={platformConv} icon={Globe} color="text-muted-foreground" />
        <KpiCard label="Avg Rating" value={kpis.avgRating > 0 ? `${kpis.avgRating.toFixed(1)}★` : '—'} icon={Star} color="text-amber-500" />
        <KpiCard label="Hire Requests" value={kpis.hireTotal} icon={MessageSquare} />
        <KpiCard label="Followers" value={kpis.followers} icon={Users} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Radar */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Activity className="h-4 w-4" /> Factory Performance Overview</h3>
          <div>
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Radar name="Score" dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Rating distribution */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Star className="h-4 w-4" /> Rating Distribution</h3>
          <div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={ratingDist} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="rating" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Bar dataKey="count" name="Reviews" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Activity over time */}
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4" /> Activity Over Time (last 8 weeks)</h3>
        <div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={activityData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip /><Legend />
              <Line type="monotone" dataKey="saves" stroke={COLORS[0]} name="Moodboard Saves" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="quotes" stroke={COLORS[1]} name="Quote Inclusions" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="hires" stroke={COLORS[2]} name="Hire Requests" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top products */}
      {topProducts.length > 0 && (
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Package className="h-4 w-4" /> Top Products by Activity</h3>
          <div>
            <div className="overflow-auto max-h-[320px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">#</th>
                    <th className="text-left py-2 pr-4 font-medium">Product</th>
                    <th className="text-right py-2 pr-4 font-medium">Saves</th>
                    <th className="text-right py-2 pr-4 font-medium">Quotes</th>
                    <th className="text-right py-2 font-medium">Conv.</th>
                  </tr>
                </thead>
                <tbody>
                  {topProducts.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">{row.name}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.saves}</td>
                      <td className="py-2 pr-4 text-right tabular-nums text-primary">{row.quotes}</td>
                      <td className="py-2 text-right tabular-nums text-green-600 text-xs">
                        {row.saves > 0 ? `${Math.round((row.quotes / row.saves) * 100)}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Quote Pipeline for Factory Materials */}
      {quoteByStatus.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><TrendingUp className="h-4 w-4" /> Quote Pipeline for Your Materials</h3>
            <div>
              <p className="text-xs text-muted-foreground mb-3">Quote request statuses across all quotes including your products</p>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={quoteByStatus} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="status" width={75} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Quotes" radius={[0, 4, 4, 0]}>
                    {quoteByStatus.map((row, i) => (
                      <Cell key={i} fill={
                        row.status === 'accepted' ? '#10b981'
                        : row.status === 'rejected' ? '#ef4444'
                        : row.status === 'quoted' ? '#8b5cf6'
                        : row.status === 'submitted' ? '#06b6d4'
                        : '#f59e0b'
                      } />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Award className="h-4 w-4" /> Conversion Funnel — Your Materials</h3>
            <div>
              <p className="text-xs text-muted-foreground mb-4">From first save to accepted quote</p>
              <div className="space-y-3">
                {[
                  { label: 'Moodboard Saves', value: kpis.totalSaves, color: 'bg-primary', pct: 100 },
                  { label: 'Quote Inclusions', value: kpis.totalQuotes, color: 'bg-violet-500', pct: kpis.totalSaves > 0 ? Math.round((kpis.totalQuotes / kpis.totalSaves) * 100) : 0 },
                  { label: 'Accepted Quotes', value: quoteByStatus.find((s) => s.status === 'accepted')?.count ?? 0, color: 'bg-green-500', pct: kpis.totalQuotes > 0 ? Math.round(((quoteByStatus.find((s) => s.status === 'accepted')?.count ?? 0) / kpis.totalQuotes) * 100) : 0 },
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-semibold tabular-nums">{row.value.toLocaleString()} <span className="text-muted-foreground font-normal">({row.pct}%)</span></span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ──── Factory Visibility & Demand ──────────────────── */}
      <SectionHeader
        title="Factory Visibility & Demand"
        desc="How buyers find your factory — brand searches, category preferences, and material interest signals"
        icon={Globe}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Factory Name Searches (12w)" value={factorySearchCount} icon={Search} color="text-blue-600" />
        <KpiCard label="Materials Used in 3D" value={vrIn3dCount} icon={Eye} color="text-violet-600" />
        <KpiCard label="New Followers (12w)" value={followerTrend.reduce((s, f) => s + f.follows, 0)} icon={Users} color="text-green-600" />
        <KpiCard label="Catalog Products" value={productIds.length} icon={Package} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Factory name searches */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Search className="h-4 w-4" /> Searches Mentioning Your Factory (12w)</h3>
          <div>
            <p className="text-xs text-muted-foreground mb-3">Buyer search queries containing "{factoryName}"</p>
            {factorySearches.length === 0 ? (
              <EmptyState message="No factory-name searches recorded in this period" />
            ) : (
              <div className="overflow-auto max-h-[280px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">#</th>
                      <th className="text-left py-2 pr-4 font-medium">Search Query</th>
                      <th className="text-right py-2 font-medium">Times</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factorySearches.map((row, i) => (
                      <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium">{row.term}</td>
                        <td className="py-2 text-right tabular-nums text-primary font-semibold">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Moodboard by category donut */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Layers className="h-4 w-4" /> Moodboard Saves by Material Category</h3>
          <div>
            <p className="text-xs text-muted-foreground mb-2">Which categories of your materials buyers save most</p>
            {moodboardByCategory.length === 0 ? (
              <EmptyState message="No moodboard saves yet" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={moodboardByCategory} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {moodboardByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10}
                    formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Follower growth */}
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Users className="h-4 w-4" /> New Followers Per Week (last 8 weeks)</h3>
        <div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={followerTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="follows" name="New Followers" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ──── Material Attribute Explorer ─────────────────── */}
      <SectionHeader
        title="Material Attribute Explorer"
        desc="Analyse buyer interest across your catalog by any metadata dimension — color, finish, R-level, category, and more"
        icon={Layers}
      />

      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Saves & Quotes by Attribute Value</h3>
            {availableKeys.length > 0 && (
              <Select value={attributeKey} onValueChange={setAttributeKey}>
                <SelectTrigger className="w-[200px] h-8 text-xs">
                  <SelectValue placeholder="Select attribute" />
                </SelectTrigger>
                <SelectContent>
                  {availableKeys.map((k) => (
                    <SelectItem key={k} value={k} className="text-xs capitalize">{k.replace(/_/g, ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div>
          {availableKeys.length === 0 ? (
            <EmptyState message="No metadata attributes found in your product catalog" />
          ) : attributeData.length === 0 ? (
            <EmptyState message={`No products with "${attributeKey}" attribute`} />
          ) : (
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-4 font-medium">#</th>
                    <th className="text-left py-2 pr-4 font-medium capitalize">{attributeKey.replace(/_/g, ' ')}</th>
                    <th className="text-right py-2 pr-4 font-medium">Moodboard Saves</th>
                    <th className="text-right py-2 font-medium">Quote Inclusions</th>
                  </tr>
                </thead>
                <tbody>
                  {attributeData.map((row, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td>
                      <td className="py-2 pr-4 font-medium">{row.value}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{row.saves}</td>
                      <td className="py-2 text-right tabular-nums text-primary font-semibold">{row.quotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Market Trends Tab — Full Market Intelligence + Factory Scope
// ─────────────────────────────────────────────────────────────
function MarketTrendsTab({ factoryName, isFactory }: { factoryName?: string; isFactory?: boolean }) {
  const [isDemoData, setIsDemoData] = useState(false);
  const [viewScope, setViewScope] = useState<'platform' | 'factory'>('platform');
  const [timeRange, setTimeRange] = useState<number>(12);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [platformCategories, setPlatformCategories] = useState<{ key: string; label: string }[]>([]);

  // ── Core data (both modes)
  const [kpis, setKpis] = useState({ activeDemandSignals: 0, topDemandedMaterial: '—', topCategory: '—', totalCategorySaves: 0, topBuyerType: '—' });
  const [topDemands, setTopDemands] = useState<{ name: string; mentions: number; saves: number; in3d: number; momentum: string }[]>([]);
  const [trendingAttributes, setTrendingAttributes] = useState<{ attribute: string; count: number }[]>([]);
  const [discoveryChannels, setDiscoveryChannels] = useState<{ name: string; value: number }[]>([]);
  const [topMoodboardItems, setTopMoodboardItems] = useState<{ name: string; category: string; boardCount: number }[]>([]);
  const [topQuotedItems, setTopQuotedItems] = useState<{ name: string; category: string; quoteCount: number; addedFrom: string }[]>([]);

  // ── Attribute picker
  const [attrSource, setAttrSource] = useState<string>('');
  const [attrSourceKeys, setAttrSourceKeys] = useState<string[]>([]);
  const [metadataByKey, setMetadataByKey] = useState<Map<string, { attribute: string; count: number }[]>>(new Map());
  const [metadataFieldLabels, setMetadataFieldLabels] = useState<Map<string, string>>(new Map());

  // ── Buyer type (both modes)
  const [buyerTypeData, setBuyerTypeData] = useState<{ type: string; saves: number; quotes: number }[]>([]);

  // ── VR/3D + demand analysis (both modes)
  const [vrUsageData, setVrUsageData] = useState<{ name: string; count: number; roomType: string }[]>([]);
  const [vrKpis, setVrKpis] = useState({ totalGenerations: 0, uniqueMaterials: 0, topRoomType: '—' });
  const [zeroResultDemands, setZeroResultDemands] = useState<{ term: string; count: number; lastSeen: string }[]>([]);
  const [quoteBasketsData, setQuoteBasketsData] = useState<{ product1: string; product2: string; count: number }[]>([]);
  const [lifecycleKpi, setLifecycleKpi] = useState<{ avgDaysToQuote: number; saveToQuoteRate: number }>({ avgDaysToQuote: 0, saveToQuoteRate: 0 });

  // ── Factory scope only
  const [quoteFunnelData, setQuoteFunnelData] = useState<{ stage: string; count: number }[]>([]);
  const [moodboardPairings, setMoodboardPairings] = useState<{ name: string; category: string; count: number }[]>([]);
  const [moodboardStats, setMoodboardStats] = useState<{ total: number; public: number }>({ total: 0, public: 0 });
  const [catalogGaps, setCatalogGaps] = useState<{ name: string; mentions: number }[]>([]);
  const [productVelocity, setProductVelocity] = useState<{ name: string; saves: number; quotes: number; trend: string }[]>([]);
  const [insights, setInsights] = useState<string[]>([]);

  // ── New analytics sections
  const [engagementFunnel, setEngagementFunnel] = useState<{ stage: string; count: number; rate: string; color: string }[]>([]);
  const [discoveryByProduct, setDiscoveryByProduct] = useState<{ name: string; search: number; agent: number; threeD: number; manual: number; page: number }[]>([]);

  // ── Market direction / strategic intelligence
  const [materialGrowthRates, setMaterialGrowthRates] = useState<{ name: string; thisWeek: number; priorWeek: number; growthPct: number; lifecycle: string }[]>([]);
  const [roomTypeTrends, setRoomTypeTrends] = useState<{ roomType: string; thisWeek: number; priorWeek: number; growthPct: number }[]>([]);
  const [segmentGrowth, setSegmentGrowth] = useState<{ type: string; thisWeek: number; priorWeek: number; growthPct: number }[]>([]);

  // ── Computed inline
  const displayedAttributes = metadataByKey.get(attrSource) ?? [];

  // ── Load platform categories once on mount
  useEffect(() => {
    supabase.from('material_categories').select('display_name, category_key').eq('is_active', true).order('sort_order')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setPlatformCategories(data.map((d: any) => ({ key: String(d.category_key), label: String(d.display_name) })));
        } else {
          // Fallback if table empty
          setPlatformCategories([
            { key: 'tiles', label: 'Tiles' }, { key: 'wood', label: 'Wood' },
            { key: 'furniture', label: 'Furniture' }, { key: 'decor', label: 'Decor' },
            { key: 'lighting', label: 'Lighting' }, { key: 'heating', label: 'Heating' },
            { key: 'sanitary', label: 'Sanitary' }, { key: 'kitchen', label: 'Kitchen' },
            { key: 'paint_wall_decor', label: 'Paint / Wall Decors' },
          ]);
        }
      });
  }, []);

  // ── Load metadata field labels once on mount
  useEffect(() => {
    supabase.from('material_metadata_fields').select('field_name, display_name')
      .then(({ data }) => {
        if (data && data.length > 0) {
          const m = new Map<string, string>();
          data.forEach((d: any) => { if (d.field_name && d.display_name) m.set(String(d.field_name), String(d.display_name)); });
          setMetadataFieldLabels(m);
        }
      });
  }, []);

  // ── Demo data ─────────────────────────────────────────────
  const loadDemoData = () => {
    setTopDemands([
      { name: 'Marble Bianco', mentions: 145, saves: 72, in3d: 18, momentum: 'hot' },
      { name: 'Natural Oak Panel', mentions: 132, saves: 68, in3d: 22, momentum: 'hot' },
      { name: 'Concrete Finish', mentions: 118, saves: 55, in3d: 15, momentum: 'warm' },
      { name: 'Warm Linen', mentions: 95, saves: 82, in3d: 8, momentum: 'warm' },
      { name: 'Italian Leather', mentions: 88, saves: 45, in3d: 11, momentum: 'warm' },
      { name: 'Calacatta Marble', mentions: 76, saves: 38, in3d: 9, momentum: 'warm' },
      { name: 'Brass Finish', mentions: 72, saves: 29, in3d: 6, momentum: 'cool' },
      { name: 'Ceramic White', mentions: 65, saves: 44, in3d: 12, momentum: 'cool' },
      { name: 'Velvet Deep Blue', mentions: 58, saves: 62, in3d: 4, momentum: 'cool' },
      { name: 'Rattan Weave', mentions: 52, saves: 35, in3d: 7, momentum: 'cool' },
      { name: 'Recycled Cotton', mentions: 45, saves: 28, in3d: 3, momentum: 'cool' },
      { name: 'Cork Surface', mentions: 38, saves: 22, in3d: 5, momentum: 'cool' },
      { name: 'Travertine Stone', mentions: 35, saves: 18, in3d: 8, momentum: 'cool' },
      { name: 'Smoked Glass', mentions: 28, saves: 15, in3d: 4, momentum: 'cool' },
      { name: 'Terrazzo', mentions: 22, saves: 19, in3d: 6, momentum: 'cool' },
    ]);
    setTrendingAttributes([
      { attribute: 'natural', count: 485 }, { attribute: 'matte finish', count: 362 },
      { attribute: 'sustainable', count: 318 }, { attribute: 'textured', count: 275 },
      { attribute: 'warm tones', count: 241 }, { attribute: 'recycled', count: 198 },
      { attribute: 'handcrafted', count: 165 }, { attribute: 'organic', count: 142 },
      { attribute: 'minimalist', count: 128 }, { attribute: 'earthy palette', count: 105 },
      { attribute: 'bold pattern', count: 88 }, { attribute: 'translucent', count: 72 },
    ]);
    setDiscoveryChannels([
      { name: 'Search', value: 45 }, { name: 'AI Agent', value: 28 },
      { name: 'Product Page', value: 15 }, { name: 'Manual', value: 8 }, { name: '3D Generation', value: 4 },
    ]);
    setTopMoodboardItems([
      { name: 'Marble Bianco 60x60', category: 'Tiles', boardCount: 34 },
      { name: 'Natural Oak Panel', category: 'Wood', boardCount: 28 },
      { name: 'Concrete Finish', category: 'General Materials', boardCount: 22 },
      { name: 'Warm Linen Fabric', category: 'Textiles', boardCount: 18 },
      { name: 'Brass Wall Light', category: 'Lighting', boardCount: 15 },
      { name: 'Calacatta Marble Slab', category: 'Tiles', boardCount: 14 },
      { name: 'Smoked Glass Panel', category: 'Decor', boardCount: 11 },
      { name: 'Rattan Chair', category: 'Furniture', boardCount: 9 },
      { name: 'Underfloor Heating Mat', category: 'Heating', boardCount: 8 },
      { name: 'Travertine Floor', category: 'Tiles', boardCount: 7 },
    ]);
    setTopQuotedItems([
      { name: 'Marble Bianco 60x60', category: 'Tiles', quoteCount: 18, addedFrom: 'search' },
      { name: 'Natural Oak Panel', category: 'Wood', quoteCount: 14, addedFrom: 'agent' },
      { name: 'Underfloor Heating Mat', category: 'Heating', quoteCount: 12, addedFrom: 'search' },
      { name: 'Warm Linen Fabric', category: 'Textiles', quoteCount: 10, addedFrom: 'moodboard' },
      { name: 'Wall-Hung Toilet', category: 'Sanitary', quoteCount: 9, addedFrom: 'product_page' },
      { name: 'Calacatta Marble Slab', category: 'Tiles', quoteCount: 8, addedFrom: 'search' },
      { name: 'Oak Dining Table', category: 'Furniture', quoteCount: 7, addedFrom: 'agent' },
      { name: 'Concrete Finish', category: 'General Materials', quoteCount: 6, addedFrom: '3d_generation' },
      { name: 'Brass Pendant Light', category: 'Lighting', quoteCount: 5, addedFrom: 'moodboard' },
      { name: 'Terrazzo Floor Tile', category: 'Tiles', quoteCount: 4, addedFrom: 'search' },
    ]);
    setBuyerTypeData([
      { type: 'interior_designer', saves: 285, quotes: 92 },
      { type: 'architect', saves: 198, quotes: 78 },
      { type: 'designer', saves: 165, quotes: 45 },
      { type: 'brand', saves: 88, quotes: 32 },
      { type: 'sourcing_agent', saves: 62, quotes: 28 },
      { type: 'other', saves: 35, quotes: 12 },
    ]);
    setKpis({ activeDemandSignals: 15, topDemandedMaterial: 'Marble Bianco', topCategory: 'Flooring', totalCategorySaves: 592, topBuyerType: 'Interior Designer' });
    if (viewScope === 'factory') {
      setProductVelocity([
        { name: 'Marble Bianco 60x60', saves: 28, quotes: 12, trend: 'up' },
        { name: 'Natural Stone Tile', saves: 22, quotes: 8, trend: 'up' },
        { name: 'Travertine Silver', saves: 18, quotes: 6, trend: 'stable' },
        { name: 'Limestone Classic', saves: 12, quotes: 4, trend: 'down' },
        { name: 'Calacatta Gold', saves: 9, quotes: 3, trend: 'stable' },
      ]);
      setQuoteFunnelData([
        { stage: 'Materials Quoted', count: 48 },
        { stage: 'Quotes Submitted', count: 32 },
        { stage: 'Quotes Accepted', count: 22 },
      ]);
      setMoodboardStats({ total: 34, public: 12 });
      setMoodboardPairings([
        { name: 'Warm Oak Panel', category: 'Wood', count: 28 },
        { name: 'Concrete Tile', category: 'Concrete', count: 22 },
        { name: 'Brushed Brass Fixture', category: 'Metal', count: 18 },
        { name: 'Linen Cushion Fabric', category: 'Textiles', count: 15 },
        { name: 'Smoked Glass Panel', category: 'Glass', count: 12 },
        { name: 'Rattan Side Table', category: 'Natural Fiber', count: 9 },
        { name: 'Terracotta Floor Tile', category: 'Ceramic', count: 8 },
      ]);
      setCatalogGaps([
        { name: 'Recycled Oak Panel', mentions: 52 },
        { name: 'Biophilic Wall Panel', mentions: 38 },
        { name: 'Terrazzo Surface', mentions: 31 },
        { name: 'Hemp Fiber Board', mentions: 24 },
        { name: 'Mycelium Composite', mentions: 18 },
      ]);
      setInsights([
        'Interior Designers are your #1 buyer type — 42% of all moodboard saves',
        'Your Stone materials are gaining traction this period',
        'Catalog gap: "Recycled Oak Panel" has 52 demand signals not served by your catalog',
        'Your materials appear in 12 public moodboards — strong organic visibility',
        'Quote acceptance rate: 68% — above platform average of ~61%',
      ]);
    }
    setVrUsageData([
      { name: 'Marble Bianco 60x60', count: 28, roomType: 'Living Room' },
      { name: 'Natural Oak Panel', count: 22, roomType: 'Bedroom' },
      { name: 'Concrete Finish', count: 18, roomType: 'Kitchen' },
      { name: 'Warm Linen Fabric', count: 14, roomType: 'Living Room' },
      { name: 'Brass Pendant', count: 11, roomType: 'Dining Room' },
      { name: 'Calacatta Slab', count: 9, roomType: 'Bathroom' },
      { name: 'Velvet Deep Blue', count: 7, roomType: 'Bedroom' },
    ]);
    setVrKpis({ totalGenerations: 142, uniqueMaterials: 38, topRoomType: 'Living Room' });
    setZeroResultDemands([
      { term: 'biophilic wall panel', count: 48, lastSeen: '2 days ago' },
      { term: 'mycelium composite tile', count: 35, lastSeen: '1 day ago' },
      { term: 'recycled denim panel', count: 28, lastSeen: '3 days ago' },
      { term: 'hemp fiber board', count: 22, lastSeen: '5 hours ago' },
      { term: 'algae-based resin', count: 19, lastSeen: '1 day ago' },
      { term: 'transparent concrete', count: 15, lastSeen: '4 days ago' },
      { term: 'living moss tile', count: 12, lastSeen: '6 days ago' },
      { term: 'phase change material', count: 9, lastSeen: '1 week ago' },
    ]);
    setQuoteBasketsData([
      { product1: 'Marble Bianco 60x60', product2: 'Natural Oak Panel', count: 18 },
      { product1: 'Marble Bianco 60x60', product2: 'Brass Pendant', count: 14 },
      { product1: 'Concrete Finish', product2: 'Smoked Glass Panel', count: 12 },
      { product1: 'Natural Oak Panel', product2: 'Warm Linen Fabric', count: 11 },
      { product1: 'Calacatta Slab', product2: 'Chrome Fixture', count: 9 },
      { product1: 'Rattan Chair', product2: 'Concrete Finish', count: 7 },
    ]);
    setLifecycleKpi({ avgDaysToQuote: 8, saveToQuoteRate: 34 });
    // Engagement funnel demo
    if (viewScope === 'factory') {
      setEngagementFunnel([
        { stage: 'Demand Signals', count: 1240, rate: '100%', color: 'bg-violet-500' },
        { stage: 'Moodboard Saves', count: 382, rate: '30.8%', color: 'bg-blue-500' },
        { stage: 'Quote Requests', count: 127, rate: '10.2%', color: 'bg-cyan-500' },
        { stage: 'Quotes Accepted', count: 48, rate: '3.9%', color: 'bg-green-500' },
      ]);
    } else {
      setEngagementFunnel([
        { stage: 'Demand Signals', count: 14820, rate: '100%', color: 'bg-violet-500' },
        { stage: 'Moodboard Saves', count: 3847, rate: '26.0%', color: 'bg-blue-500' },
        { stage: 'Quote Requests', count: 592, rate: '4.0%', color: 'bg-cyan-500' },
        { stage: 'Quotes Accepted', count: 312, rate: '2.1%', color: 'bg-green-500' },
      ]);
    }
    // Discovery per product demo (both modes)
    setDiscoveryByProduct([
      { name: 'Marble Bianco 60x60', search: 62, agent: 18, threeD: 12, manual: 5, page: 3 },
      { name: 'Natural Oak Panel', search: 38, agent: 42, threeD: 8, manual: 7, page: 5 },
      { name: 'Concrete Finish', search: 55, agent: 22, threeD: 18, manual: 3, page: 2 },
      { name: 'Warm Linen Fabric', search: 28, agent: 55, threeD: 4, manual: 10, page: 3 },
      { name: 'Brass Pendant', search: 72, agent: 12, threeD: 6, manual: 5, page: 5 },
      { name: 'Calacatta Slab', search: 48, agent: 30, threeD: 15, manual: 4, page: 3 },
      { name: 'Velvet Deep Blue', search: 35, agent: 48, threeD: 2, manual: 8, page: 7 },
    ]);
    // Market direction demo data
    setMaterialGrowthRates([
      { name: 'Biophilic Wall Panel', thisWeek: 28, priorWeek: 8,  growthPct: 250, lifecycle: 'emerging' },
      { name: 'Marble Bianco',        thisWeek: 42, priorWeek: 29, growthPct: 45,  lifecycle: 'growing' },
      { name: 'Recycled Oak Panel',   thisWeek: 22, priorWeek: 16, growthPct: 38,  lifecycle: 'growing' },
      { name: 'Natural Oak Panel',    thisWeek: 38, priorWeek: 29, growthPct: 31,  lifecycle: 'growing' },
      { name: 'Terrazzo Surface',     thisWeek: 18, priorWeek: 14, growthPct: 29,  lifecycle: 'growing' },
      { name: 'Concrete Finish',      thisWeek: 24, priorWeek: 22, growthPct: 9,   lifecycle: 'established' },
      { name: 'Warm Linen Fabric',    thisWeek: 19, priorWeek: 18, growthPct: 6,   lifecycle: 'established' },
      { name: 'Calacatta Marble',     thisWeek: 12, priorWeek: 14, growthPct: -14, lifecycle: 'established' },
      { name: 'Brass Finish',         thisWeek: 8,  priorWeek: 12, growthPct: -33, lifecycle: 'declining' },
      { name: 'Cork Surface',         thisWeek: 5,  priorWeek: 11, growthPct: -55, lifecycle: 'declining' },
    ]);
    setRoomTypeTrends([
      { roomType: 'Kitchen',      thisWeek: 22, priorWeek: 15, growthPct: 47 },
      { roomType: 'Living Room',  thisWeek: 38, priorWeek: 28, growthPct: 36 },
      { roomType: 'Bathroom',     thisWeek: 18, priorWeek: 14, growthPct: 29 },
      { roomType: 'Home Office',  thisWeek: 14, priorWeek: 11, growthPct: 27 },
      { roomType: 'Bedroom',      thisWeek: 28, priorWeek: 25, growthPct: 12 },
      { roomType: 'Dining Room',  thisWeek: 10, priorWeek: 10, growthPct: 0  },
    ]);
    setSegmentGrowth([
      { type: 'sourcing_agent',    thisWeek: 18, priorWeek: 11, growthPct: 64 },
      { type: 'interior_designer', thisWeek: 85, priorWeek: 62, growthPct: 37 },
      { type: 'architect',         thisWeek: 48, priorWeek: 38, growthPct: 26 },
      { type: 'designer',          thisWeek: 32, priorWeek: 26, growthPct: 23 },
      { type: 'brand',             thisWeek: 14, priorWeek: 12, growthPct: 17 },
      { type: 'manufacturer',      thisWeek: 9,  priorWeek: 9,  growthPct: 0  },
    ]);
    setIsDemoData(true);
  };

  useEffect(() => { loadDemoData(); load(); }, [viewScope, timeRange, selectedCategory]);

  // ── Data loading ───────────────────────────────────────────
  const load = async () => {
    try {
      const ago = weeksAgo(timeRange);

      if (viewScope === 'platform' || !factoryName) {
        // ── PLATFORM BRANCH ──────────────────────────────────
        const [
          { data: popularSearches },
          { data: demandData },
          { data: qItems },
          { data: mbItems },
        ] = await Promise.all([
          supabase.from('popular_searches').select('*').order('search_count', { ascending: false }).limit(30),
          supabase.from('material_demand_analytics').select('*').order('mention_count', { ascending: false }).limit(20),
          supabase.from('quote_items').select('product_id, added_from, products(id, name, metadata)').gte('created_at', ago.toISOString()).limit(500),
          supabase.from('moodboard_items').select('moodboard_id, material_id, products(id, name, metadata)').gte('created_at', ago.toISOString()).limit(1000),
        ]);

        const hasRealData = (popularSearches ?? []).length > 0 || (demandData ?? []).length > 0;
        if (!hasRealData) return;

        // Apply category filter in-memory
        const catFilter = (item: any) => {
          if (selectedCategory === 'all') return true;
          const cat = (item.products as any)?.metadata?.material_category ?? '';
          return String(cat).toLowerCase() === selectedCategory.toLowerCase();
        };
        const filteredMbItems = (mbItems ?? []).filter(catFilter);
        const filteredQItems = (qItems ?? []).filter(catFilter);

        // Demands with momentum
        const now = new Date();
        const demands = (demandData ?? []).slice(0, 15).map((d: any) => ({
          name: String(d.material_name ?? '').slice(0, 35),
          mentions: d.mention_count ?? 0,
          saves: d.times_saved ?? 0,
          in3d: d.times_used_in_3d ?? 0,
          momentum: getMomentum(d.last_requested ?? null),
        }));
        void now;
        setTopDemands(demands);

        // Trending attributes from search intent
        const attrCount = new Map<string, number>();
        (popularSearches ?? []).forEach((ps: any) => {
          const mentions: string[] = ps.all_material_mentions ?? [];
          mentions.forEach((m: string) => { if (m) attrCount.set(m, (attrCount.get(m) ?? 0) + (ps.search_count ?? 1)); });
        });
        setTrendingAttributes(Array.from(attrCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([attribute, count]) => ({ attribute, count })));

        // Metadata attribute aggregation from moodboard product metadata (for attribute picker)
        const skipKeys = new Set(['factory_name', 'created_at', 'updated_at', 'id', 'image_url', 'url', 'description', 'category', 'name']);
        const keyMap = new Map<string, Map<string, number>>();
        filteredMbItems.forEach((item: any) => {
          const meta = ((item.products as any)?.metadata ?? {}) as Record<string, unknown>;
          Object.entries(meta).forEach(([key, val]) => {
            if (skipKeys.has(key) || val == null || val === '') return;
            if (!keyMap.has(key)) keyMap.set(key, new Map());
            const vals: string[] = Array.isArray(val) ? val.map(String) : [String(val)];
            vals.forEach((v) => {
              const k = v.slice(0, 40);
              keyMap.get(key)!.set(k, (keyMap.get(key)!.get(k) ?? 0) + 1);
            });
          });
        });
        const newKeys = Array.from(keyMap.keys()).sort();
        setAttrSourceKeys(newKeys);
        setAttrSource(prev => (prev === '' || prev === 'intent' || !newKeys.includes(prev)) ? (newKeys[0] ?? '') : prev);
        const newMetaByKey = new Map<string, { attribute: string; count: number }[]>();
        keyMap.forEach((valMap, key) => {
          newMetaByKey.set(key, Array.from(valMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([attribute, count]) => ({ attribute, count })));
        });
        setMetadataByKey(newMetaByKey);

        // Discovery channels
        const channelMap = new Map<string, number>();
        filteredQItems.forEach((qi: any) => { const ch = qi.added_from ?? 'manual'; channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1); });
        const channelLabels: Record<string, string> = { search: 'Search', agent: 'AI Agent', '3d_generation': '3D Generation', manual: 'Manual', product_page: 'Product Page', moodboard: 'Moodboard' };
        setDiscoveryChannels(Array.from(channelMap.entries()).map(([k, v]) => ({ name: channelLabels[k] ?? k, value: v })));

        // Top moodboard items
        const mbProductCount = new Map<string, { name: string; category: string; count: number }>();
        filteredMbItems.forEach((item: any) => {
          const p = item.products as any;
          if (!p?.name) return;
          const key = String(p.id ?? p.name);
          const entry = mbProductCount.get(key) ?? { name: String(p.name).slice(0, 40), category: String(p.metadata?.material_category ?? 'Other'), count: 0 };
          entry.count++;
          mbProductCount.set(key, entry);
        });
        setTopMoodboardItems(Array.from(mbProductCount.values()).sort((a, b) => b.count - a.count).slice(0, 15).map(v => ({ name: v.name, category: v.category, boardCount: v.count })));

        // Top quoted items
        const qProductCount = new Map<string, { name: string; category: string; count: number; addedFrom: string }>();
        filteredQItems.forEach((qi: any) => {
          const p = qi.products as any;
          if (!p?.name) return;
          const key = String(p.id ?? p.name);
          const entry = qProductCount.get(key) ?? { name: String(p.name).slice(0, 40), category: String(p.metadata?.material_category ?? 'Other'), count: 0, addedFrom: qi.added_from ?? 'manual' };
          entry.count++;
          qProductCount.set(key, entry);
        });
        setTopQuotedItems(Array.from(qProductCount.values()).sort((a, b) => b.count - a.count).slice(0, 15).map(v => ({ name: v.name, category: v.category, quoteCount: v.count, addedFrom: v.addedFrom })));

        // Buyer type breakdown (3-step, non-critical)
        let topBuyerType = '—';
        try {
          const mbIdSet = [...new Set(filteredMbItems.map((i: any) => i.moodboard_id).filter(Boolean))];
          if (mbIdSet.length > 0) {
            const { data: mbUsers } = await supabase.from('moodboards').select('id, user_id').in('id', mbIdSet.slice(0, 500));
            const mbIdToUser = new Map((mbUsers ?? []).map((m) => [m.id, m.user_id]));
            const userIdSet = [...new Set((mbUsers ?? []).map((m) => m.user_id).filter(Boolean))];
            const { data: userTypes } = userIdSet.length > 0
              ? await supabase.from('user_profiles').select('user_id, professional_type').in('user_id', userIdSet.slice(0, 500))
              : { data: [] };
            const userToType = new Map((userTypes ?? []).map((u: any) => [u.user_id, u.professional_type ?? 'other']));
            const savesByType = new Map<string, number>();
            filteredMbItems.forEach((item: any) => {
              const uid = mbIdToUser.get(item.moodboard_id);
              const pt: string = uid ? String(userToType.get(uid as string) ?? 'other') : 'other';
              savesByType.set(pt, (savesByType.get(pt) ?? 0) + 1);
            });
            const buyerArr = Array.from(savesByType.entries()).map(([type, saves]) => ({ type, saves, quotes: 0 })).sort((a, b) => b.saves - a.saves);
            setBuyerTypeData(buyerArr);
            topBuyerType = buyerArr[0] ? formatProfType(buyerArr[0].type) : '—';
          } else {
            setBuyerTypeData([]);
          }
        } catch (e) { console.warn('Buyer type join failed (non-critical):', e); }

        // VR/3D usage data
        try {
          const { data: vrData } = await supabase
            .from('generation_3d')
            .select('material_ids, materials_used, room_type, created_at')
            .eq('generation_status', 'completed')
            .gte('created_at', ago.toISOString())
            .limit(500);
          const matCount = new Map<string, { count: number; roomType: string }>();
          (vrData ?? []).forEach((gen: any) => {
            const mats: string[] = (gen.materials_used ?? []).map(String);
            mats.forEach((m) => {
              const entry = matCount.get(m) ?? { count: 0, roomType: String(gen.room_type ?? 'Other') };
              entry.count++;
              matCount.set(m, entry);
            });
          });
          const vrArr = Array.from(matCount.entries())
            .sort((a, b) => b[1].count - a[1].count)
            .slice(0, 10)
            .map(([name, d]) => ({ name: name.slice(0, 40), count: d.count, roomType: d.roomType }));
          setVrUsageData(vrArr);
          const uniqueMats = matCount.size;
          const roomTypes = new Map<string, number>();
          (vrData ?? []).forEach((g: any) => { const r = String(g.room_type ?? 'Other'); roomTypes.set(r, (roomTypes.get(r) ?? 0) + 1); });
          const topRoom = Array.from(roomTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
          setVrKpis({ totalGenerations: (vrData ?? []).length, uniqueMaterials: uniqueMats, topRoomType: topRoom });
        } catch (e) { console.warn('VR data load failed:', e); }

        // Zero-result demand signals
        try {
          const { data: unmatchedData } = await supabase
            .from('unmatched_term_frequency')
            .select('term, frequency_count, last_seen_at')
            .order('frequency_count', { ascending: false })
            .limit(15);
          setZeroResultDemands((unmatchedData ?? []).map((d: any) => ({
            term: String(d.term ?? '').slice(0, 50),
            count: d.frequency_count ?? 0,
            lastSeen: d.last_seen_at ? new Date(d.last_seen_at).toLocaleDateString() : '—',
          })));
        } catch (e) { console.warn('Zero-result data load failed:', e); }

        // Quote basket analysis (co-quoted products)
        try {
          const { data: basketItems } = await supabase
            .from('quote_items')
            .select('quote_id, products(name)')
            .gte('created_at', ago.toISOString())
            .limit(1000);
          {
            const quoteMap = new Map<string, string[]>();
            (basketItems ?? []).forEach((qi: any) => {
              const name = String((qi.products as any)?.name ?? '').slice(0, 40);
              if (!name) return;
              const existing = quoteMap.get(qi.quote_id) ?? [];
              existing.push(name);
              quoteMap.set(qi.quote_id, existing);
            });
            const pairCount = new Map<string, number>();
            quoteMap.forEach((names) => {
              for (let i = 0; i < names.length; i++) {
                for (let j = i + 1; j < names.length; j++) {
                  const key = [names[i], names[j]].sort().join(' || ');
                  pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
                }
              }
            });
            const pairs = Array.from(pairCount.entries())
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([key, count]) => {
                const [p1, p2] = key.split(' || ');
                return { product1: p1 ?? '', product2: p2 ?? '', count };
              });
            setQuoteBasketsData(pairs);
          }
        } catch (e) { console.warn('Basket analysis failed:', e); }

        // ── Engagement funnel (platform) ──────────────────────
        try {
          const [{ data: miData }, { data: funnelQuotes }] = await Promise.all([
            supabase.from('user_material_interactions').select('interaction_type').gte('created_at', ago.toISOString()).limit(5000),
            supabase.from('quotes').select('status').gte('created_at', ago.toISOString()).limit(1000),
          ]);
          const viewCount = (miData ?? []).filter((r: any) => r.interaction_type === 'view').length;
          const funnelSaves = (mbItems ?? []).length;
          const funnelQuoted = (qItems ?? []).length;
          const funnelAccepted = (funnelQuotes ?? []).filter((q: any) => q.status === 'accepted').length;
          const funnelTop = Math.max(viewCount, funnelSaves, 1);
          const pct = (n: number) => `${Math.round((n / funnelTop) * 100)}%`;
          const funnelArr = [
            ...(viewCount > 0 ? [{ stage: 'Material Views', count: viewCount, rate: '100%', color: 'bg-violet-500' }] : []),
            { stage: 'Moodboard Saves', count: funnelSaves, rate: viewCount > 0 ? pct(funnelSaves) : '—', color: 'bg-blue-500' },
            { stage: 'Quote Requests', count: funnelQuoted, rate: viewCount > 0 ? pct(funnelQuoted) : '—', color: 'bg-cyan-500' },
            { stage: 'Quotes Accepted', count: funnelAccepted, rate: viewCount > 0 ? pct(funnelAccepted) : '—', color: 'bg-green-500' },
          ];
          setEngagementFunnel(funnelArr.filter(f => f.count > 0));
        } catch (e) { console.warn('Engagement funnel load failed:', e); }

        // ── Discovery channel per product (platform) ──────────
        const channelPerProduct = new Map<string, { name: string; search: number; agent: number; threeD: number; manual: number; page: number }>();
        [...(filteredMbItems ?? []), ...(filteredQItems ?? [])].forEach((item: any) => {
          const pid = String(item.products?.id ?? item.material_id ?? item.product_id ?? '');
          const name = String(item.products?.name ?? '').slice(0, 30);
          if (!pid || !name) return;
          const ch = String(item.added_from ?? 'manual');
          const entry = channelPerProduct.get(pid) ?? { name, search: 0, agent: 0, threeD: 0, manual: 0, page: 0 };
          if (ch === 'search') entry.search++;
          else if (ch === 'agent') entry.agent++;
          else if (ch === '3d_generation') entry.threeD++;
          else if (ch === 'product_page') entry.page++;
          else entry.manual++;
          channelPerProduct.set(pid, entry);
        });
        const discArr = Array.from(channelPerProduct.values())
          .map(d => ({ ...d, total: d.search + d.agent + d.threeD + d.manual + d.page }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8)
          .map(({ total: _, ...rest }) => rest);
        setDiscoveryByProduct(discArr);

        // ── Market Direction: WoW growth ─────────────────────
        try {
          const cut4w = weeksAgo(4);
          const cut8w = weeksAgo(8);
          const [{ data: recentMb }, { data: priorMb }, { data: recentGen }, { data: priorGen }, { data: recentProf }, { data: priorProf }] = await Promise.all([
            supabase.from('moodboard_items').select('material_id, products(name)').gte('created_at', cut4w.toISOString()).limit(2000),
            supabase.from('moodboard_items').select('material_id, products(name)').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).limit(2000),
            supabase.from('generation_3d').select('room_type').gte('created_at', cut4w.toISOString()).eq('generation_status', 'completed').limit(500),
            supabase.from('generation_3d').select('room_type').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).eq('generation_status', 'completed').limit(500),
            supabase.from('user_profiles').select('professional_type').gte('created_at', cut4w.toISOString()).limit(500),
            supabase.from('user_profiles').select('professional_type').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).limit(500),
          ]);
          // Material growth
          const rMat = new Map<string, { name: string; count: number }>();
          (recentMb ?? []).forEach((i: any) => { const id = String(i.material_id); const n = String((i.products as any)?.name ?? '').slice(0, 35); if (n) rMat.set(id, { name: n, count: (rMat.get(id)?.count ?? 0) + 1 }); });
          const pMat = new Map<string, number>();
          (priorMb ?? []).forEach((i: any) => { const id = String(i.material_id); pMat.set(id, (pMat.get(id) ?? 0) + 1); });
          const growthArr = Array.from(rMat.entries())
            .map(([id, { name, count: tw }]) => { const pw = pMat.get(id) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { name, thisWeek: tw, priorWeek: pw, growthPct: g, lifecycle: getLifecycle(null, null, tw, g) }; })
            .sort((a, b) => b.growthPct - a.growthPct).slice(0, 12);
          setMaterialGrowthRates(growthArr);
          const rRoom = new Map<string, number>(); (recentGen ?? []).forEach((g: any) => { const r = String(g.room_type ?? 'other'); rRoom.set(r, (rRoom.get(r) ?? 0) + 1); });
          const pRoom = new Map<string, number>(); (priorGen ?? []).forEach((g: any) => { const r = String(g.room_type ?? 'other'); pRoom.set(r, (pRoom.get(r) ?? 0) + 1); });
          const roomArr = Array.from(rRoom.entries()).map(([rt, tw]) => { const pw = pRoom.get(rt) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { roomType: rt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), thisWeek: tw, priorWeek: pw, growthPct: g }; }).sort((a, b) => b.growthPct - a.growthPct);
          setRoomTypeTrends(roomArr);
          const rSeg = new Map<string, number>(); (recentProf ?? []).forEach((p: any) => { const t = String(p.professional_type ?? 'other'); rSeg.set(t, (rSeg.get(t) ?? 0) + 1); });
          const pSeg = new Map<string, number>(); (priorProf ?? []).forEach((p: any) => { const t = String(p.professional_type ?? 'other'); pSeg.set(t, (pSeg.get(t) ?? 0) + 1); });
          const segArr = Array.from(rSeg.entries()).map(([type, tw]) => { const pw = pSeg.get(type) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { type, thisWeek: tw, priorWeek: pw, growthPct: g }; }).sort((a, b) => b.growthPct - a.growthPct);
          setSegmentGrowth(segArr);
        } catch (e) { console.warn('Market direction load failed:', e); }

        setIsDemoData(false);
        setKpis({
          activeDemandSignals: (demandData ?? []).length,
          topDemandedMaterial: demands[0]?.name ?? '—',
          topCategory: '—',
          totalCategorySaves: filteredMbItems.length,
          topBuyerType,
        });

      } else {
        // ── FACTORY BRANCH ────────────────────────────────────
        // B1: Load factory products
        const { data: factoryProducts } = await supabase.from('products').select('id, name, metadata').contains('metadata', { factory_name: factoryName });
        const ids = (factoryProducts ?? []).map((p) => p.id);
        const names = (factoryProducts ?? []).map((p) => String(p.name ?? '').toLowerCase());
        if (ids.length === 0) return;

        // Filter by selected category if not 'all'
        const catFilteredIds = selectedCategory === 'all'
          ? ids
          : ids.filter((id: string) => {
              const p = (factoryProducts ?? []).find((fp: any) => fp.id === id);
              const cat = (p?.metadata as any)?.material_category ?? '';
              return String(cat).toLowerCase() === selectedCategory.toLowerCase();
            });
        const effectiveIds = catFilteredIds.length > 0 ? catFilteredIds : ids;

        // B2: Parallel factory-scoped fetches
        const [
          { data: mbItemsRaw },
          { data: qItemsRaw },
          { data: demandData },
          { data: popularSearches },
        ] = await Promise.all([
          supabase.from('moodboard_items').select('moodboard_id, material_id, created_at, products(name, metadata)').in('material_id', effectiveIds).limit(1000),
          supabase.from('quote_items').select('quote_id, product_id, added_from, products(name, metadata)').in('product_id', effectiveIds).limit(500),
          supabase.from('material_demand_analytics').select('material_name, mention_count, times_saved, times_used_in_3d, last_requested').order('mention_count', { ascending: false }).limit(30),
          supabase.from('popular_searches').select('all_material_mentions, search_count').order('search_count', { ascending: false }).limit(30),
        ]);

        const hasRealData = (mbItemsRaw ?? []).length > 0 || (qItemsRaw ?? []).length > 0;
        if (!hasRealData) return;

        // Attribute picker from factory product metadata
        const skipKeys = new Set(['factory_name', 'created_at', 'updated_at', 'id', 'image_url', 'url', 'description', 'category', 'name']);
        const keyMap = new Map<string, Map<string, number>>();
        (mbItemsRaw ?? []).forEach((item: any) => {
          const meta = ((item.products as any)?.metadata ?? {}) as Record<string, unknown>;
          Object.entries(meta).forEach(([key, val]) => {
            if (skipKeys.has(key) || val == null || val === '') return;
            if (!keyMap.has(key)) keyMap.set(key, new Map());
            const vals: string[] = Array.isArray(val) ? val.map(String) : [String(val)];
            vals.forEach((v) => {
              const k = v.slice(0, 40);
              keyMap.get(key)!.set(k, (keyMap.get(key)!.get(k) ?? 0) + 1);
            });
          });
        });
        const newKeys = Array.from(keyMap.keys()).sort();
        setAttrSourceKeys(newKeys);
        setAttrSource(prev => (prev === '' || prev === 'intent' || !newKeys.includes(prev)) ? (newKeys[0] ?? '') : prev);
        const newMetaByKey = new Map<string, { attribute: string; count: number }[]>();
        keyMap.forEach((valMap, key) => {
          newMetaByKey.set(key, Array.from(valMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([attribute, count]) => ({ attribute, count })));
        });
        setMetadataByKey(newMetaByKey);

        // Trending attributes
        const attrCount = new Map<string, number>();
        (popularSearches ?? []).forEach((ps: any) => {
          const mentions: string[] = ps.all_material_mentions ?? [];
          mentions.forEach((m: string) => { if (m) attrCount.set(m, (attrCount.get(m) ?? 0) + (ps.search_count ?? 1)); });
        });
        setTrendingAttributes(Array.from(attrCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([attribute, count]) => ({ attribute, count })));

        // Factory demand ranking (match by name)
        const factoryDemands = (demandData ?? []).filter((d: any) => names.some((n) => {
          const dn = String(d.material_name ?? '').toLowerCase();
          return n.includes(dn.split(' ')[0]) || dn.includes(n.split(' ')[0]);
        })).slice(0, 15).map((d: any) => ({
          name: String(d.material_name ?? '').slice(0, 35),
          mentions: d.mention_count ?? 0, saves: d.times_saved ?? 0,
          in3d: d.times_used_in_3d ?? 0, momentum: getMomentum(d.last_requested ?? null),
        }));

        // For products not in demand analytics, fill from moodboard/quote activity
        const mbCount = new Map<string, number>();
        const qCount = new Map<string, number>();
        (mbItemsRaw ?? []).forEach((i: any) => mbCount.set(i.material_id, (mbCount.get(i.material_id) ?? 0) + 1));
        (qItemsRaw ?? []).forEach((i: any) => qCount.set(i.product_id, (qCount.get(i.product_id) ?? 0) + 1));
        const pNameMap = new Map<string, string>((factoryProducts ?? []).map((p) => [String(p.id), String(p.name ?? '').slice(0, 35)]));
        const demandNames = new Set(factoryDemands.map((d) => d.name.toLowerCase()));
        const notInDemand = ids
          .filter((id) => { const n = (pNameMap.get(id) ?? '').toLowerCase(); return !demandNames.has(n) && ((mbCount.get(id) ?? 0) + (qCount.get(id) ?? 0)) > 0; })
          .map((id) => ({ name: pNameMap.get(id) ?? id, mentions: 0, saves: mbCount.get(id) ?? 0, in3d: 0, momentum: 'cool' }))
          .sort((a, b) => b.saves - a.saves).slice(0, 5);
        setTopDemands([...factoryDemands, ...notInDemand]);

        // Discovery channels (factory-scoped)
        const channelMap = new Map<string, number>();
        (qItemsRaw ?? []).forEach((qi: any) => { const ch = qi.added_from ?? 'manual'; channelMap.set(ch, (channelMap.get(ch) ?? 0) + 1); });
        const channelLabels: Record<string, string> = { search: 'Search', agent: 'AI Agent', '3d_generation': '3D Generation', manual: 'Manual', product_page: 'Product Page', moodboard: 'Moodboard' };
        setDiscoveryChannels(Array.from(channelMap.entries()).map(([k, v]) => ({ name: channelLabels[k] ?? k, value: v })));

        // B3: Buyer type (3-step)
        let topBuyerType = '—';
        let buyerArr: { type: string; saves: number; quotes: number }[] = [];
        try {
          const mbIdSet = [...new Set((mbItemsRaw ?? []).map((i: any) => i.moodboard_id).filter(Boolean))];
          if (mbIdSet.length > 0) {
            const { data: mbUsers } = await supabase.from('moodboards').select('id, user_id').in('id', mbIdSet.slice(0, 300));
            const mbIdToUser = new Map((mbUsers ?? []).map((m) => [m.id, m.user_id]));
            const userIdSet = [...new Set((mbUsers ?? []).map((m) => m.user_id).filter(Boolean))];
            const { data: userTypes } = userIdSet.length > 0
              ? await supabase.from('user_profiles').select('user_id, professional_type').in('user_id', userIdSet.slice(0, 300))
              : { data: [] };
            const userToType = new Map((userTypes ?? []).map((u: any) => [u.user_id, u.professional_type ?? 'other']));
            const savesByType = new Map<string, number>();
            (mbItemsRaw ?? []).forEach((item: any) => {
              const uid = mbIdToUser.get(item.moodboard_id);
              const pt: string = uid ? String(userToType.get(uid as string) ?? 'other') : 'other';
              savesByType.set(pt, (savesByType.get(pt) ?? 0) + 1);
            });
            buyerArr = Array.from(savesByType.entries()).map(([type, saves]) => ({ type, saves, quotes: 0 })).sort((a, b) => b.saves - a.saves);
            topBuyerType = buyerArr[0] ? formatProfType(buyerArr[0].type) : '—';
          }
          setBuyerTypeData(buyerArr);
        } catch (e) { console.warn('Factory buyer type join failed (non-critical):', e); }

        // B4: Quote funnel
        let localFunnel: { stage: string; count: number }[] = [];
        try {
          const quoteIds = [...new Set((qItemsRaw ?? []).map((i: any) => i.quote_id).filter(Boolean))];
          if (quoteIds.length > 0) {
            const { data: quotesData } = await supabase.from('quotes').select('id, status').in('id', quoteIds.slice(0, 300));
            const statusMap = new Map<string, number>();
            (quotesData ?? []).forEach((q) => statusMap.set(q.status, (statusMap.get(q.status) ?? 0) + 1));
            const submitted = (statusMap.get('submitted') ?? 0) + (statusMap.get('quoted') ?? 0) + (statusMap.get('accepted') ?? 0) + (statusMap.get('rejected') ?? 0);
            const accepted = statusMap.get('accepted') ?? 0;
            localFunnel = [
              { stage: 'Materials Quoted', count: quoteIds.length },
              { stage: 'Quotes Submitted', count: submitted },
              { stage: 'Quotes Accepted', count: accepted },
            ];
            setQuoteFunnelData(localFunnel);
          }
        } catch (e) { console.warn('Quote funnel load failed (non-critical):', e); }

        // B5: Moodboard intelligence
        try {
          const mbIdSet = [...new Set((mbItemsRaw ?? []).map((i: any) => i.moodboard_id).filter(Boolean))];
          if (mbIdSet.length > 0) {
            const { data: mbBoards } = await supabase.from('moodboards').select('id, is_public').in('id', mbIdSet.slice(0, 300));
            const publicCount = (mbBoards ?? []).filter((m) => m.is_public).length;
            setMoodboardStats({ total: mbIdSet.length, public: publicCount });
            // Pairing analysis: other materials in the same moodboards
            const { data: pairingItemsRaw } = await supabase.from('moodboard_items').select('material_id, products(name, metadata)').in('moodboard_id', mbIdSet.slice(0, 300)).limit(800);
            const factoryIdSet = new Set(ids);
            const pairCount = new Map<string, { name: string; category: string; count: number }>();
            (pairingItemsRaw ?? []).filter((item: any) => !factoryIdSet.has(item.material_id)).forEach((item: any) => {
              const pName = ((item.products as any)?.name as string) ?? item.material_id;
              const pCat = ((item.products as any)?.metadata?.category as string) ?? 'Unknown';
              const key = pName.slice(0, 40);
              const entry = pairCount.get(key) ?? { name: pName.slice(0, 40), category: pCat, count: 0 };
              entry.count++;
              pairCount.set(key, entry);
            });
            setMoodboardPairings(Array.from(pairCount.values()).sort((a, b) => b.count - a.count).slice(0, 10));
          } else {
            setMoodboardStats({ total: 0, public: 0 });
            setMoodboardPairings([]);
          }
        } catch (e) { console.warn('Moodboard pairing load failed (non-critical):', e); }

        // B6: Catalog gaps
        const gaps = (demandData ?? []).filter((d: any) => !names.some((n) => {
          const dn = String(d.material_name ?? '').toLowerCase();
          return n.includes(dn.split(' ')[0]) || dn.includes(n.split(' ')[0]);
        })).slice(0, 5).map((d: any) => ({ name: String(d.material_name ?? '').slice(0, 35), mentions: d.mention_count ?? 0 }));
        setCatalogGaps(gaps);

        // Top moodboard items (factory scope)
        const mbProdCount = new Map<string, { name: string; category: string; count: number }>();
        (mbItemsRaw ?? []).forEach((item: any) => {
          const p = item.products as any;
          if (!p?.name) return;
          const key = String((item as any).material_id ?? p.name);
          const entry = mbProdCount.get(key) ?? { name: String(p.name).slice(0, 40), category: String(p.metadata?.material_category ?? 'Other'), count: 0 };
          entry.count++;
          mbProdCount.set(key, entry);
        });
        setTopMoodboardItems(Array.from(mbProdCount.values()).sort((a, b) => b.count - a.count).slice(0, 15).map(v => ({ name: v.name, category: v.category, boardCount: v.count })));

        // Top quoted items (factory scope)
        const qProdCount = new Map<string, { name: string; category: string; count: number; addedFrom: string }>();
        (qItemsRaw ?? []).forEach((qi: any) => {
          const p = qi.products as any;
          if (!p?.name) return;
          const key = String((qi as any).product_id ?? p.name);
          const entry = qProdCount.get(key) ?? { name: String(p.name).slice(0, 40), category: String(p.metadata?.material_category ?? 'Other'), count: 0, addedFrom: qi.added_from ?? 'manual' };
          entry.count++;
          qProdCount.set(key, entry);
        });
        setTopQuotedItems(Array.from(qProdCount.values()).sort((a, b) => b.count - a.count).slice(0, 15).map(v => ({ name: v.name, category: v.category, quoteCount: v.count, addedFrom: v.addedFrom })));

        // VR/3D usage for factory products
        try {
          const { data: vrData } = await supabase
            .from('generation_3d')
            .select('material_ids, materials_used, room_type, created_at')
            .eq('generation_status', 'completed')
            .gte('created_at', ago.toISOString())
            .limit(500);
          const factoryIdSet = new Set(effectiveIds);
          const matched = (vrData ?? []).filter((g: any) => {
            const mids: string[] = g.material_ids ?? [];
            return mids.some((id: string) => factoryIdSet.has(id));
          });
          const pNameLookup = new Map<string, string>((factoryProducts ?? []).map((p: any) => [String(p.id), String(p.name ?? '').slice(0, 40)]));
          const matCount = new Map<string, { count: number; roomType: string }>();
          matched.forEach((gen: any) => {
            const mids: string[] = (gen.material_ids ?? []).filter((id: string) => factoryIdSet.has(id));
            mids.forEach((id: string) => {
              const name: string = pNameLookup.get(id) ?? id;
              const entry = matCount.get(name) ?? { count: 0, roomType: String(gen.room_type ?? 'Other') };
              entry.count++;
              matCount.set(name, entry);
            });
          });
          const vrArr = Array.from(matCount.entries()).sort((a, b) => b[1].count - a[1].count).slice(0, 10)
            .map(([name, d]) => ({ name, count: d.count, roomType: d.roomType }));
          setVrUsageData(vrArr);
          const roomTypes = new Map<string, number>();
          matched.forEach((g: any) => { const r = String(g.room_type ?? 'Other'); roomTypes.set(r, (roomTypes.get(r) ?? 0) + 1); });
          const topRoom = Array.from(roomTypes.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
          setVrKpis({ totalGenerations: matched.length, uniqueMaterials: matCount.size, topRoomType: topRoom });
        } catch (e) { console.warn('VR factory data failed:', e); }

        // Quote basket for factory products
        try {
          const { data: basketItems } = await supabase
            .from('quote_items')
            .select('quote_id, product_id, products(name)')
            .in('product_id', effectiveIds)
            .gte('created_at', ago.toISOString())
            .limit(500);
          {
            // Get all quote_ids that include factory products
            const factoryQuoteIds = [...new Set((basketItems ?? []).map((qi: any) => qi.quote_id))];
            if (factoryQuoteIds.length > 0) {
              const { data: allQuoteItems } = await supabase
                .from('quote_items')
                .select('quote_id, products(name)')
                .in('quote_id', factoryQuoteIds.slice(0, 200))
                .limit(800);
              const quoteMap = new Map<string, string[]>();
              (allQuoteItems ?? []).forEach((qi: any) => {
                const name = String((qi.products as any)?.name ?? '').slice(0, 40);
                if (!name) return;
                const existing = quoteMap.get(qi.quote_id) ?? [];
                existing.push(name);
                quoteMap.set(qi.quote_id, existing);
              });
              const pairCount = new Map<string, number>();
              quoteMap.forEach((names) => {
                for (let i = 0; i < names.length; i++) {
                  for (let j = i + 1; j < names.length; j++) {
                    const key = [names[i], names[j]].sort().join(' || ');
                    pairCount.set(key, (pairCount.get(key) ?? 0) + 1);
                  }
                }
              });
              const pairs = Array.from(pairCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8)
                .map(([key, count]) => {
                  const [p1, p2] = key.split(' || ');
                  return { product1: p1 ?? '', product2: p2 ?? '', count };
                });
              setQuoteBasketsData(pairs);
            } else {
              setQuoteBasketsData([]);
            }
          }
        } catch (e) { console.warn('Factory basket analysis failed:', e); }

        // B7: Product velocity (last 4w vs prior 4w)
        const cut4w = weeksAgo(4);
        const cut8w = weeksAgo(8);
        const mbRecent = (mbItemsRaw ?? []).filter((i: any) => new Date(i.created_at) >= cut4w);
        const mbPrior = (mbItemsRaw ?? []).filter((i: any) => new Date(i.created_at) >= cut8w && new Date(i.created_at) < cut4w);
        const recentMap = new Map<string, number>();
        const priorMap = new Map<string, number>();
        mbRecent.forEach((i: any) => recentMap.set(i.material_id, (recentMap.get(i.material_id) ?? 0) + 1));
        mbPrior.forEach((i: any) => priorMap.set(i.material_id, (priorMap.get(i.material_id) ?? 0) + 1));
        const velocity = ids.map((id) => {
          const pName = (pNameMap.get(id) ?? id).slice(0, 35);
          const recent = recentMap.get(id) ?? 0;
          const prior = priorMap.get(id) ?? 0;
          const trend = prior === 0 ? (recent > 0 ? 'up' : 'stable') : recent > prior * 1.15 ? 'up' : recent < prior * 0.85 ? 'down' : 'stable';
          return { name: pName, saves: recent, quotes: qCount.get(id) ?? 0, trend };
        }).filter((p) => p.saves + p.quotes > 0).sort((a, b) => (b.saves + b.quotes) - (a.saves + a.quotes)).slice(0, 10);
        setProductVelocity(velocity);

        // B8: Rule-based insights
        const insightsList: string[] = [];
        if (buyerArr[0]) {
          const totalSaves = buyerArr.reduce((s, b) => s + b.saves, 0);
          const topPct = totalSaves > 0 ? Math.round((buyerArr[0].saves / totalSaves) * 100) : 0;
          insightsList.push(`${formatProfType(buyerArr[0].type)} is your #1 buyer type — ${topPct}% of all moodboard saves`);
        }
        const risingProduct = velocity.find((p) => p.trend === 'up');
        if (risingProduct) insightsList.push(`"${risingProduct.name}" is gaining traction — up this period vs prior 4 weeks`);
        if (gaps.length > 0) insightsList.push(`Catalog gap: "${gaps[0].name}" has ${gaps[0].mentions} demand signals not served by your catalog`);
        const vrTotal = factoryDemands.reduce((s, d) => s + d.in3d, 0);
        if (vrTotal > 0) insightsList.push(`Your materials used in ${vrTotal} VR/3D worlds — indicates serious project buyers`);
        const localAccepted = localFunnel.find((s) => s.stage === 'Quotes Accepted')?.count ?? 0;
        const localSubmitted = localFunnel.find((s) => s.stage === 'Quotes Submitted')?.count ?? 0;
        if (localSubmitted > 0) insightsList.push(`Quote acceptance rate: ${Math.round((localAccepted / localSubmitted) * 100)}% (platform avg ~61%)`);
        setInsights(insightsList);

        // ── Factory funnel ─────────────────────────────────────
        try {
          const factoryMi = await supabase.from('user_material_interactions').select('interaction_type').in('material_id', ids).gte('created_at', ago.toISOString()).limit(2000);
          const fViews = (factoryMi.data ?? []).filter((r: any) => r.interaction_type === 'view').length;
          const fSaves = (mbItemsRaw ?? []).length;
          const fQuoted = (qItemsRaw ?? []).length;
          const fAccepted = localAccepted;
          const fTop = Math.max(fViews, fSaves, 1);
          const fp = (n: number) => `${Math.round((n / fTop) * 100)}%`;
          setEngagementFunnel([
            ...(fViews > 0 ? [{ stage: 'Material Views', count: fViews, rate: '100%', color: 'bg-violet-500' }] : []),
            { stage: 'Moodboard Saves', count: fSaves, rate: fViews > 0 ? fp(fSaves) : '—', color: 'bg-blue-500' },
            { stage: 'Quote Requests', count: fQuoted, rate: fViews > 0 ? fp(fQuoted) : '—', color: 'bg-cyan-500' },
            { stage: 'Quotes Accepted', count: fAccepted, rate: fViews > 0 ? fp(fAccepted) : '—', color: 'bg-green-500' },
          ].filter(f => f.count > 0));
        } catch (e) { console.warn('Factory engagement funnel load failed:', e); }

        // ── Discovery channel per product (factory) ────────────
        const factoryChannelPerProduct = new Map<string, { name: string; search: number; agent: number; threeD: number; manual: number; page: number }>();
        [...(mbItemsRaw ?? []), ...(qItemsRaw ?? [])].forEach((item: any) => {
          const pid = String(item.material_id ?? item.product_id ?? '');
          const name = String(item.products?.name ?? '').slice(0, 30);
          if (!pid || !name) return;
          const ch = String(item.added_from ?? 'manual');
          const entry = factoryChannelPerProduct.get(pid) ?? { name, search: 0, agent: 0, threeD: 0, manual: 0, page: 0 };
          if (ch === 'search') entry.search++;
          else if (ch === 'agent') entry.agent++;
          else if (ch === '3d_generation') entry.threeD++;
          else if (ch === 'product_page') entry.page++;
          else entry.manual++;
          factoryChannelPerProduct.set(pid, entry);
        });
        const factoryDiscArr = Array.from(factoryChannelPerProduct.values())
          .map(d => ({ ...d, total: d.search + d.agent + d.threeD + d.manual + d.page }))
          .sort((a, b) => b.total - a.total)
          .slice(0, 8)
          .map(({ total: _, ...rest }) => rest);
        setDiscoveryByProduct(factoryDiscArr);

        // ── Market direction for factory mode (platform-wide signals) ──
        try {
          const cut4w = weeksAgo(4);
          const cut8w = weeksAgo(8);
          const [{ data: recentMb }, { data: priorMb }, { data: recentGen }, { data: priorGen }, { data: recentProf }, { data: priorProf }] = await Promise.all([
            supabase.from('moodboard_items').select('material_id, products(name)').gte('created_at', cut4w.toISOString()).limit(2000),
            supabase.from('moodboard_items').select('material_id, products(name)').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).limit(2000),
            supabase.from('generation_3d').select('room_type').gte('created_at', cut4w.toISOString()).eq('generation_status', 'completed').limit(500),
            supabase.from('generation_3d').select('room_type').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).eq('generation_status', 'completed').limit(500),
            supabase.from('user_profiles').select('professional_type').gte('created_at', cut4w.toISOString()).limit(500),
            supabase.from('user_profiles').select('professional_type').gte('created_at', cut8w.toISOString()).lt('created_at', cut4w.toISOString()).limit(500),
          ]);
          const rMat = new Map<string, { name: string; count: number }>();
          (recentMb ?? []).forEach((i: any) => { const id = String(i.material_id); const n = String((i.products as any)?.name ?? '').slice(0, 35); if (n) rMat.set(id, { name: n, count: (rMat.get(id)?.count ?? 0) + 1 }); });
          const pMat = new Map<string, number>();
          (priorMb ?? []).forEach((i: any) => { const id = String(i.material_id); pMat.set(id, (pMat.get(id) ?? 0) + 1); });
          const growthArr = Array.from(rMat.entries())
            .map(([id, { name, count: tw }]) => { const pw = pMat.get(id) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { name, thisWeek: tw, priorWeek: pw, growthPct: g, lifecycle: getLifecycle(null, null, tw, g) }; })
            .sort((a, b) => b.growthPct - a.growthPct).slice(0, 12);
          setMaterialGrowthRates(growthArr);
          const rRoom = new Map<string, number>(); (recentGen ?? []).forEach((g: any) => { const r = String(g.room_type ?? 'other'); rRoom.set(r, (rRoom.get(r) ?? 0) + 1); });
          const pRoom = new Map<string, number>(); (priorGen ?? []).forEach((g: any) => { const r = String(g.room_type ?? 'other'); pRoom.set(r, (pRoom.get(r) ?? 0) + 1); });
          const roomArr = Array.from(rRoom.entries()).map(([rt, tw]) => { const pw = pRoom.get(rt) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { roomType: rt.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()), thisWeek: tw, priorWeek: pw, growthPct: g }; }).sort((a, b) => b.growthPct - a.growthPct);
          setRoomTypeTrends(roomArr);
          const rSeg = new Map<string, number>(); (recentProf ?? []).forEach((p: any) => { const t = String(p.professional_type ?? 'other'); rSeg.set(t, (rSeg.get(t) ?? 0) + 1); });
          const pSeg = new Map<string, number>(); (priorProf ?? []).forEach((p: any) => { const t = String(p.professional_type ?? 'other'); pSeg.set(t, (pSeg.get(t) ?? 0) + 1); });
          const segArr = Array.from(rSeg.entries()).map(([type, tw]) => { const pw = pSeg.get(type) ?? 0; const g = pw > 0 ? Math.round(((tw - pw) / pw) * 100) : 100; return { type, thisWeek: tw, priorWeek: pw, growthPct: g }; }).sort((a, b) => b.growthPct - a.growthPct);
          setSegmentGrowth(segArr);
        } catch (e) { console.warn('Factory market direction load failed:', e); }

        // ── Zero-result demand signals (factory scope) ──────────
        try {
          const { data: unmatchedData } = await supabase
            .from('unmatched_term_frequency')
            .select('term, frequency_count, last_seen_at')
            .order('frequency_count', { ascending: false })
            .limit(15);
          setZeroResultDemands((unmatchedData ?? []).map((d: any) => ({
            term: String(d.term ?? '').slice(0, 50),
            count: d.frequency_count ?? 0,
            lastSeen: d.last_seen_at ? new Date(d.last_seen_at).toLocaleDateString() : '—',
          })));
        } catch (e) { console.warn('Factory zero-result load failed:', e); }

        setIsDemoData(false);
        setKpis({
          activeDemandSignals: factoryDemands.length,
          topDemandedMaterial: factoryDemands[0]?.name ?? (velocity[0]?.name ?? '—'),
          topCategory: '—',
          totalCategorySaves: (mbItemsRaw ?? []).length,
          topBuyerType,
        });
      }
    } catch (err) {
      console.error('MarketTrendsTab load error:', err);
    }
  };

  // ── JSX ────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {isDemoData && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600">
          <span className="text-xs font-semibold">Demo data</span>
          <span className="text-amber-500/80">—</span>
          <span className="text-xs">Sample data shown. Automatically replaced with live data once activity is recorded.</span>
        </div>
      )}

      {/* ── Filter bar ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={viewScope} onValueChange={(v) => setViewScope(v as 'platform' | 'factory')}>
          <SelectTrigger className="h-8 w-[180px] text-xs border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="platform" className="text-xs">All Platform</SelectItem>
            <SelectItem value="factory" className="text-xs">
              {factoryName ? `My Factory — ${factoryName}` : 'My Factory'}
            </SelectItem>
          </SelectContent>
        </Select>
        <Select value={selectedCategory} onValueChange={setSelectedCategory}>
          <SelectTrigger className="h-8 w-[175px] text-xs border-border/60">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">All Categories</SelectItem>
            {platformCategories.map((cat) => (
              <SelectItem key={cat.key} value={cat.key} className="text-xs">{cat.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(timeRange)} onValueChange={(v) => setTimeRange(Number(v))}>
          <SelectTrigger className="h-8 w-[90px] text-xs border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="4" className="text-xs">4W</SelectItem>
            <SelectItem value="8" className="text-xs">8W</SelectItem>
            <SelectItem value="12" className="text-xs">12W</SelectItem>
            <SelectItem value="24" className="text-xs">6M</SelectItem>
          </SelectContent>
        </Select>
        {viewScope === 'factory' && factoryName && (
          <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">
            My Factory · {factoryName}
          </span>
        )}
      </div>

      {/* ── Key Insights (factory mode only) ── */}
      {viewScope === 'factory' && insights.length > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
          <div className="flex items-center gap-2 mb-2.5">
            <Zap className="h-3 w-3 text-primary" />
            <span className="text-xs font-semibold text-primary">Market Intelligence</span>
          </div>
          <ul className="space-y-1.5">
            {insights.map((insight, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                <span className="text-primary mt-0.5 shrink-0 font-bold">›</span>
                <span>{insight}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {viewScope === 'platform' ? (
          <>
            <KpiCard label="Active Demand Signals" value={kpis.activeDemandSignals} icon={TrendingUp} />
            <KpiCard label="Top Demanded Material" value={kpis.topDemandedMaterial} icon={Package} color="text-violet-600" />
            <KpiCard label="Most Saved Category" value={kpis.topCategory} icon={Star} color="text-amber-500" />
            <KpiCard label="Total Category Saves" value={kpis.totalCategorySaves} icon={Eye} color="text-cyan-600" />
            <KpiCard label="Top Buyer Type" value={kpis.topBuyerType} icon={Users} color="text-green-600" />
          </>
        ) : (
          <>
            <KpiCard label="Products in Demand" value={kpis.activeDemandSignals} icon={Package} color="text-violet-600" />
            <KpiCard label="Top Performing Product" value={kpis.topDemandedMaterial} icon={TrendingUp} />
            <KpiCard label="Top Category" value={kpis.topCategory} icon={Star} color="text-amber-500" />
            <KpiCard label="Total Material Saves" value={kpis.totalCategorySaves} icon={Eye} color="text-cyan-600" />
            <KpiCard label="#1 Buyer Type" value={kpis.topBuyerType} icon={Users} color="text-green-600" />
          </>
        )}
      </div>

      {/* ──── Where the Market is Going ──────────────────────── */}
      {materialGrowthRates.length > 0 && (
        <>
          <SectionHeader
            title="Where the Market is Going"
            desc="Week-over-week momentum signals — emerging materials, shifting design contexts, and growing buyer segments"
            icon={TrendingUp}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

            {/* Material growth rates */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6 lg:col-span-1">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Rising & Declining Materials</h3>
                <p className="text-xs text-muted-foreground">Save velocity change — this 4 weeks vs prior 4 weeks</p>
              </div>
              <div className="overflow-hidden -mx-6 -mb-6 mt-2">
                <div className="divide-y divide-border/30">
                  {materialGrowthRates.slice(0, 8).map((row, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="min-w-0 flex-1 mr-3">
                        <div className="text-xs font-medium truncate">{row.name}</div>
                        <LifecycleBadge stage={row.lifecycle} />
                      </div>
                      <div className="text-right shrink-0">
                        <div className={`text-sm font-bold tabular-nums ${row.growthPct > 0 ? 'text-green-600' : row.growthPct < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {row.growthPct > 0 ? '+' : ''}{row.growthPct}%
                        </div>
                        <div className="text-[11px] text-muted-foreground">{row.thisWeek} saves</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Room type trends */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Eye className="h-4 w-4" /> 3D Room Type Trends</h3>
                <p className="text-xs text-muted-foreground">Which spaces buyers are designing most actively</p>
              </div>
              <div className="overflow-hidden -mx-6 -mb-6 mt-2">
                <div className="divide-y divide-border/30">
                  {roomTypeTrends.slice(0, 6).map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{row.roomType}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-muted/50 overflow-hidden">
                          <div
                            className={`h-1.5 rounded-full transition-all ${row.growthPct >= 0 ? 'bg-primary/70' : 'bg-muted-foreground/40'}`}
                            style={{ width: `${Math.min(100, Math.abs(row.growthPct))}%` }}
                          />
                        </div>
                      </div>
                      <div className={`text-sm font-bold tabular-nums shrink-0 ${row.growthPct > 0 ? 'text-green-600' : row.growthPct < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                        {row.growthPct > 0 ? '+' : ''}{row.growthPct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Buyer segment growth */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Users className="h-4 w-4" /> Buyer Segment Growth</h3>
                <p className="text-xs text-muted-foreground">New registrations by professional type — which buyers are arriving fastest</p>
              </div>
              <div className="overflow-hidden -mx-6 -mb-6 mt-2">
                <div className="divide-y divide-border/30">
                  {segmentGrowth.slice(0, 6).map((row, i) => (
                    <div key={i} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium">{formatProfType(row.type)}</div>
                        <div className="text-[11px] text-muted-foreground">{row.thisWeek} new this period</div>
                      </div>
                      <div className={`text-sm font-bold tabular-nums shrink-0 ${row.growthPct > 0 ? 'text-green-600' : row.growthPct === 0 ? 'text-muted-foreground' : 'text-red-500'}`}>
                        {row.growthPct > 0 ? '+' : ''}{row.growthPct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Demand Intelligence ──────────────────────────── */}
      <SectionHeader
        title={viewScope === 'factory' ? "Your Products' Demand Signals" : 'Demand Intelligence'}
        desc={viewScope === 'factory' ? 'How your catalog performs across market demand analytics — matched by product name' : 'What materials and attributes buyers are actively seeking across the platform'}
        icon={TrendingUp}
      />

      {/* Demanded Materials table */}
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Package className="h-4 w-4" />
                {viewScope === 'factory' ? "Your Products — Market Demand Ranking" : 'Top 15 Demanded Materials'}
              </h3>
              {viewScope === 'factory' && topDemands.length > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {topDemands.filter((d) => d.mentions > 0).length}/{topDemands.length} products with demand signals
                </p>
              )}
            </div>
          </div>
        </div>
        <div className="overflow-hidden -mx-6 -mb-6 mt-2">
          {topDemands.length === 0 ? <div className="px-4 pb-4"><EmptyState /></div> : (
            <div className="overflow-auto max-h-[400px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                  <tr className="text-xs font-semibold text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Material</th>
                    <th className="text-left px-3 py-2.5 font-medium">Stage</th>
                    <th className="text-right px-3 py-2.5 font-medium">Signals</th>
                    <th className="text-right px-3 py-2.5 font-medium">{viewScope === 'factory' ? 'Board Saves' : 'Saves'}</th>
                    <th className="text-right px-3 py-2.5 font-medium">3D Uses</th>
                    <th className="text-right px-4 py-2.5 font-medium">Momentum</th>
                  </tr>
                </thead>
                <tbody>
                  {topDemands.map((row, i) => {
                    const maxMentions = topDemands[0]?.mentions || 1;
                    const pct = Math.round((row.mentions / maxMentions) * 100);
                    return (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{row.name}</div>
                          {row.mentions > 0 && (
                            <div className="mt-0.5 h-0.5 rounded-full bg-border/40 w-24">
                              <div className="h-0.5 rounded-full bg-primary/50" style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <LifecycleBadge stage={getLifecycle(null, null, row.mentions, materialGrowthRates.find(g => g.name === row.name)?.growthPct)} />
                        </td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums">{row.mentions > 0 ? row.mentions : <span className="text-muted-foreground/40">—</span>}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-green-500">{row.saves}</td>
                        <td className="px-3 py-2 text-right font-mono tabular-nums text-violet-500">{row.in3d > 0 ? row.in3d : <span className="text-muted-foreground/40">—</span>}</td>
                        <td className="px-4 py-2 text-right">
                          {row.momentum === 'hot'
                            ? <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">▲ HOT</span>
                            : row.momentum === 'warm'
                            ? <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 border border-amber-500/20">→ WARM</span>
                            : <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">↓ COOL</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Trending Material Attributes */}
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><TrendingUp className="h-4 w-4" /> Trending Material Attributes</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {attrSource
                  ? `Showing: ${metadataFieldLabels.get(attrSource) ?? prettifyKey(attrSource)}${selectedCategory !== 'all' ? ` · ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ''}${viewScope === 'factory' ? ' · your products' : ''}`
                  : 'Select an attribute below to explore trends'}
              </p>
            </div>
            {attrSourceKeys.length > 0 && (
              <Select value={attrSource} onValueChange={setAttrSource}>
                <SelectTrigger className="w-[200px] h-8 text-xs border-border/60"><SelectValue placeholder="Select attribute…" /></SelectTrigger>
                <SelectContent>
                  {attrSourceKeys.map((k) => (
                    <SelectItem key={k} value={k} className="text-xs">
                      {metadataFieldLabels.get(k) ?? prettifyKey(k)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>
        <div>
          {!attrSource || displayedAttributes.length === 0 ? (
            <EmptyState message={attrSourceKeys.length === 0 ? 'No attribute data recorded yet — attributes appear once products are saved to moodboards' : `No products with "${metadataFieldLabels.get(attrSource) ?? prettifyKey(attrSource)}" attribute found`} />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={displayedAttributes} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/0.4)" />
                <XAxis type="number" tick={{ fontSize: 10, fontFamily: 'monospace' }} allowDecimals={false} />
                <YAxis type="category" dataKey="attribute" width={150} tick={{ fontSize: 10, fontFamily: 'monospace' }} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 11, fontFamily: 'monospace' }}
                  formatter={(v: any) => [v, 'frequency']}
                />
                <Bar dataKey="count" name="Count" fill={COLORS[6]} radius={[0, 4, 4, 0]}>
                  {displayedAttributes.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Discovery Channel per Product ── */}
      {discoveryByProduct.length > 0 && (
        <>
          <SectionHeader
            title="How Materials Are Discovered"
            desc={viewScope === 'factory' ? 'Which channels buyers use to find your products — optimize for the source that converts best' : 'How buyers are discovering top materials — search-led vs AI-led vs 3D scene exploration'}
            icon={Search}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Search className="h-4 w-4" /> Discovery Source Breakdown — Top Products</h3>
              <p className="text-xs text-muted-foreground">Each row shows what % of saves + quote interactions came from each channel</p>
            </div>
            <div className="overflow-hidden -mx-6 -mb-6 mt-2">
              <div className="overflow-auto max-h-[360px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">Product</th>
                      <th className="text-right px-2 py-2.5 font-medium text-blue-500">Search</th>
                      <th className="text-right px-2 py-2.5 font-medium text-violet-500">AI Agent</th>
                      <th className="text-right px-2 py-2.5 font-medium text-amber-500">3D Scene</th>
                      <th className="text-right px-2 py-2.5 font-medium text-muted-foreground">Manual</th>
                      <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discoveryByProduct.map((row, i) => {
                      const total = row.search + row.agent + row.threeD + row.manual + row.page || 1;
                      const dom = Math.max(row.search, row.agent, row.threeD);
                      const domLabel = dom === row.search ? 'Search' : dom === row.agent ? 'AI Agent' : '3D Scene';
                      const domColor = dom === row.search ? 'text-blue-500' : dom === row.agent ? 'text-violet-500' : 'text-amber-500';
                      return (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{row.name}</div>
                            <div className={`text-[11px] ${domColor}`}>dominant: {domLabel}</div>
                          </td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{row.search > 0 ? `${Math.round((row.search / total) * 100)}%` : '—'}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{row.agent > 0 ? `${Math.round((row.agent / total) * 100)}%` : '—'}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums">{row.threeD > 0 ? `${Math.round((row.threeD / total) * 100)}%` : '—'}</td>
                          <td className="px-2 py-2.5 text-right tabular-nums text-muted-foreground">{row.manual > 0 ? `${Math.round((row.manual / total) * 100)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{row.page > 0 ? `${Math.round((row.page / total) * 100)}%` : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Moodboard Activity ───────────────────────── */}
      <SectionHeader
        title="Moodboard Activity"
        desc={viewScope === 'factory' ? 'Which of your products buyers are saving to design boards most frequently' : `Most saved products to design boards${selectedCategory !== 'all' ? ` in ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ' across all categories'}`}
        icon={Layers}
      />

      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {viewScope === 'factory' ? 'Your Most Board-Saved Products' : 'Top Products Saved to Moodboards'}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">Products buyers include most often in design boards — strong intent signal</p>
        </div>
        <div className="overflow-hidden -mx-6 -mb-6 mt-2">
          {topMoodboardItems.length === 0 ? <div className="px-4 pb-4"><EmptyState message="No moodboard saves recorded in this period" /></div> : (
            <div className="overflow-auto max-h-[360px]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                  <tr className="text-xs font-semibold text-muted-foreground">
                    <th className="text-left px-4 py-2.5 font-medium">#</th>
                    <th className="text-left px-3 py-2.5 font-medium">Product</th>
                    <th className="text-left px-3 py-2.5 font-medium">Category</th>
                    <th className="text-right px-4 py-2.5 font-medium">Board Saves</th>
                  </tr>
                </thead>
                <tbody>
                  {topMoodboardItems.map((row, i) => (
                    <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">{row.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.category}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-violet-500">{row.boardCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ──── Quote Purchase Flow ───────────────────────── */}
      <SectionHeader
        title="Quote Purchase Flow"
        desc={viewScope === 'factory' ? 'Which of your products buyers are requesting quotes for — and how they found them' : `Most quoted products${selectedCategory !== 'all' ? ` in ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ''} — the real purchase intent signal`}
        icon={Target}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Target className="h-4 w-4" />
              {viewScope === 'factory' ? 'Your Most Quoted Products' : 'Top Products in Buyer Quotes'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">Direct purchase intent — products requested in quotes</p>
          </div>
          <div className="overflow-hidden -mx-6 -mb-6 mt-2">
            {topQuotedItems.length === 0 ? <div className="px-4 pb-4"><EmptyState message="No quotes recorded in this period" /></div> : (
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs font-semibold text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-3 py-2.5 font-medium">Product</th>
                      <th className="text-left px-3 py-2.5 font-medium">Category</th>
                      <th className="text-right px-4 py-2.5 font-medium">Quotes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topQuotedItems.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.category}</td>
                        <td className="px-4 py-2 text-right font-mono tabular-nums font-bold text-primary">{row.quoteCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Search className="h-4 w-4" /> How Buyers Found Quoted Products</h3>
            <p className="text-xs text-muted-foreground mt-1">Attribution — which touchpoint led to the quote request</p>
          </div>
          <div>
            {discoveryChannels.length === 0 ? <EmptyState message="No quote source data available" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={discoveryChannels} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={95} paddingAngle={3}>
                    {discoveryChannels.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend layout="vertical" align="right" verticalAlign="middle" iconSize={10} formatter={(v) => <span style={{ fontSize: 11 }}>{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* ──── Quote Intelligence (factory mode only) ──── */}
      {viewScope === 'factory' && quoteFunnelData.length > 0 && (
        <>
          <SectionHeader title="Quote Intelligence" desc="How your quoted materials progress through the buyer pipeline" icon={Award} />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {quoteFunnelData.map((stage, i) => (
              <div key={i} className="rounded-xl border border-border/50 bg-card px-4 py-3">
                <p className="text-xs font-semibold text-muted-foreground mb-2">{stage.stage}</p>
                <p className="text-3xl font-bold text-primary tabular-nums">{stage.count}</p>
                {i > 0 && quoteFunnelData[i - 1].count > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {Math.round((stage.count / quoteFunnelData[i - 1].count) * 100)}% conversion
                  </p>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* ──── Buyer Profile Intelligence ──── */}
      <SectionHeader
        title="Buyer Profile Intelligence"
        desc={viewScope === 'factory' ? 'Who is saving and requesting quotes for your materials — broken down by professional type' : 'Who is actively saving and quoting materials across the platform'}
        icon={Users}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Users className="h-4 w-4" /> Activity by Professional Type</h3>
          </div>
          <div>
            {buyerTypeData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={buyerTypeData.map((b) => ({ ...b, typeLabel: formatProfType(b.type) }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <YAxis type="category" dataKey="typeLabel" width={130} tick={{ fontSize: 11 }} />
                  <Tooltip /><Legend />
                  <Bar dataKey="saves" name="Moodboard Saves" fill={COLORS[0]} radius={[0, 4, 4, 0]} />
                  <Bar dataKey="quotes" name="Quote Inclusions" fill={COLORS[1]} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Users className="h-4 w-4" /> Buyer Segment Breakdown & Conversion</h3>
            {viewScope === 'factory' && buyerTypeData[0] && (
              <p className="text-xs text-muted-foreground mt-1">
                Your #1 segment is <span className="text-primary font-medium">{formatProfType(buyerTypeData[0].type)}</span> — focus your catalog on their preferred styles
              </p>
            )}
          </div>
          <div>
            {buyerTypeData.length === 0 ? <EmptyState /> : (
              <div className="overflow-auto max-h-[280px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs font-semibold text-muted-foreground border-b border-border/50">
                      <th className="text-left py-2.5 pr-3 font-bold">Buyer Type</th>
                      <th className="text-right py-2.5 pr-3 font-bold">Saves</th>
                      <th className="text-right py-2.5 pr-3 font-bold">Quotes</th>
                      <th className="text-right py-2.5 font-medium">Conv.%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyerTypeData.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors text-xs">
                        <td className="py-2 pr-3 font-medium">{formatProfType(row.type)}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums">{row.saves}</td>
                        <td className="py-2 pr-3 text-right font-mono tabular-nums text-primary">{row.quotes}</td>
                        <td className="py-2 text-right font-mono tabular-nums text-green-500">
                          {row.saves > 0 ? `${Math.round((row.quotes / row.saves) * 100)}%` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ──── VR / 3D Scene Usage ──── */}
      {(vrUsageData.length > 0 || vrKpis.totalGenerations > 0) && (
        <>
          <SectionHeader
            title="3D Scene & VR Usage"
            desc={viewScope === 'factory' ? 'How buyers use your materials in AI 3D room generations and VR scenes' : 'Which materials buyers drop into AI-generated 3D scenes — the highest intent signal'}
            icon={Layers}
          />
          <div className="grid grid-cols-3 gap-3 mb-4">
            <KpiCard label="3D Generations with These Materials" value={vrKpis.totalGenerations} icon={Activity} color="text-violet-600" />
            <KpiCard label="Unique Materials Used in 3D" value={vrKpis.uniqueMaterials} icon={Package} color="text-cyan-600" />
            <KpiCard label="Top Room Type" value={vrKpis.topRoomType} icon={Globe} color="text-amber-500" />
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Layers className="h-4 w-4" />
                {viewScope === 'factory' ? 'Your Products in 3D Scenes' : 'Top Materials Used in 3D Generations'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">Materials actively placed in room visualizations — buyers are testing purchase decisions</p>
            </div>
            <div className="overflow-hidden -mx-6 -mb-6 mt-2">
              <div className="overflow-auto max-h-[300px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-3 py-2.5 font-medium">Material</th>
                      <th className="text-left px-3 py-2.5 font-medium">Room Type</th>
                      <th className="text-right px-4 py-2.5 font-medium">3D Uses</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vrUsageData.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{row.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.roomType}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-violet-600">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Catalog Opportunity Intelligence ──── */}
      {zeroResultDemands.length > 0 && (
        <>
          <SectionHeader
            title="Catalog Opportunity Intelligence"
            desc="Buyers searched for these materials and found nothing on the platform — each one is an uncontested market gap"
            icon={Search}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Total Unmet Demands</p>
              <p className="text-2xl font-bold text-amber-600">{zeroResultDemands.length}</p>
              <p className="text-xs text-muted-foreground mt-1">active gaps with no current supply</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Highest Demand Gap</p>
              <p className="text-sm font-semibold truncate">{zeroResultDemands[0]?.term ?? '—'}</p>
              <p className="text-xs text-muted-foreground mt-1">{zeroResultDemands[0]?.count ?? 0} searches, zero results</p>
            </div>
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1">Opportunity Signal</p>
              <p className="text-sm font-semibold text-emerald-600">First-mover advantage</p>
              <p className="text-xs text-muted-foreground mt-1">No supplier currently serves these searches</p>
            </div>
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Search className="h-4 w-4" /> What Buyers Want but Cannot Find</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {viewScope === 'factory'
                  ? 'Ranked by search frequency — any term adjacent to your category is a launch opportunity'
                  : 'Platform-wide gaps — first supplier to list wins all organic demand for these terms'}
              </p>
            </div>
            <div className="overflow-hidden -mx-6 -mb-6 mt-2">
              <div className="overflow-auto max-h-[320px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-3 py-2.5 font-medium">Buyer Search Term</th>
                      <th className="text-right px-3 py-2.5 font-medium">Searches</th>
                      <th className="text-left px-3 py-2.5 font-medium">Urgency</th>
                      <th className="text-right px-4 py-2.5 font-medium">Last Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroResultDemands.map((row, i) => {
                      const maxCount = zeroResultDemands[0]?.count || 1;
                      const urgency = row.count > maxCount * 0.6 ? 'high' : row.count > maxCount * 0.3 ? 'medium' : 'low';
                      return (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-2.5 text-muted-foreground">{i + 1}</td>
                          <td className="px-3 py-2.5">
                            <span className="font-medium">{row.term}</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-amber-600">{row.count}</td>
                          <td className="px-3 py-2.5">
                            {urgency === 'high'
                              ? <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded border bg-red-500/10 text-red-600 border-red-500/20">High</span>
                              : urgency === 'medium'
                              ? <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded border bg-amber-500/10 text-amber-600 border-amber-500/20">Medium</span>
                              : <span className="inline-block text-xs font-medium px-1.5 py-0.5 rounded border bg-muted text-muted-foreground border-border/40">Low</span>}
                          </td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{row.lastSeen}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Quote Basket Intelligence ──── */}
      {quoteBasketsData.length > 0 && (
        <>
          <SectionHeader
            title="Quote Basket Intelligence"
            desc={viewScope === 'factory' ? 'Products buyers pair with yours in the same quote — reveals complementary catalog opportunities' : 'Products most frequently co-quoted together — reveals buyer project composition'}
            icon={Award}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Award className="h-4 w-4" />
                {viewScope === 'factory' ? 'Co-Quoted with Your Products' : 'Most Co-Quoted Product Pairs'}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">When buyers build quotes, they include these products together — understand project composition</p>
            </div>
            <div className="overflow-hidden -mx-6 -mb-6 mt-2">
              <div className="overflow-auto max-h-[280px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs text-muted-foreground">
                      <th className="text-left px-4 py-2.5 font-medium">#</th>
                      <th className="text-left px-3 py-2.5 font-medium">Product A</th>
                      <th className="text-left px-3 py-2.5 font-medium">Product B</th>
                      <th className="text-right px-4 py-2.5 font-medium">Times Together</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quoteBasketsData.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{row.product1}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.product2}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-semibold text-primary">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Buyer Intent Lifecycle ──── */}
      {lifecycleKpi.avgDaysToQuote > 0 && (
        <>
          <SectionHeader
            title="Buyer Intent Lifecycle"
            desc="How long buyers take to move from saving to quoting — critical for timing your follow-up strategy"
            icon={Activity}
          />
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              label="Avg Days: Save → Quote Request"
              value={`${lifecycleKpi.avgDaysToQuote}d`}
              sub="Median time from first moodboard save to quote submission"
              icon={TrendingUp}
              color="text-cyan-600"
            />
            <KpiCard
              label="Save-to-Quote Conversion"
              value={`${lifecycleKpi.saveToQuoteRate}%`}
              sub="Share of saved materials that eventually become quote requests"
              icon={Award}
              color="text-green-600"
            />
          </div>
        </>
      )}

      {/* ── Engagement Funnel ── */}
      {engagementFunnel.length > 0 && (
        <>
          <SectionHeader
            title="Buyer Engagement Funnel"
            desc={viewScope === 'factory' ? 'How buyers progress from first contact to accepting a quote for your materials' : 'Platform-wide buyer journey from material interest to confirmed purchase'}
            icon={TrendingUp}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><TrendingUp className="h-4 w-4" /> From Interest to Conversion</h3>
              <p className="text-xs text-muted-foreground">Each stage shows drop-off — where buyers disengage in the purchase journey</p>
            </div>
            <div>
              <div className="space-y-3">
                {engagementFunnel.map((stage, i) => {
                  const maxCount = engagementFunnel[0]?.count || 1;
                  const barWidth = Math.round((stage.count / maxCount) * 100);
                  return (
                    <div key={i} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-medium">{stage.stage}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground tabular-nums">{stage.count.toLocaleString()}</span>
                          <span className={`font-semibold px-1.5 py-0.5 rounded text-white text-[11px] ${stage.color}`}>{stage.rate}</span>
                        </div>
                      </div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div className={`h-2 rounded-full ${stage.color} opacity-80 transition-all`} style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ──── Moodboard Intelligence (factory mode only) ──── */}
      {viewScope === 'factory' && (
        <>
          <SectionHeader
            title="Moodboard Intelligence"
            desc="How buyers incorporate your materials into design boards — and what they pair them with"
            icon={Layers}
          />
          <div className="grid grid-cols-3 gap-3">
            <KpiCard label="Boards Including Your Materials" value={moodboardStats.total} icon={Package} />
            <KpiCard label="Public Boards" value={moodboardStats.public} icon={Globe} color="text-cyan-600" />
            <KpiCard label="Public Share" value={moodboardStats.total > 0 ? `${Math.round((moodboardStats.public / moodboardStats.total) * 100)}%` : '—'} icon={Eye} color="text-green-600" />
          </div>
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Layers className="h-4 w-4" /> Material Pairing Analysis</h3>
              <p className="text-xs text-muted-foreground mt-1">When buyers save your materials to moodboards, they also most often include these products — revealing the design contexts your materials belong to</p>
            </div>
            <div>
              {moodboardPairings.length === 0 ? (
                <EmptyState message="No co-save data yet — grow your catalog visibility to see pairing patterns" />
              ) : (
                <div className="overflow-auto max-h-[300px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                      <tr className="text-xs font-semibold text-muted-foreground border-b border-border/50">
                        <th className="text-left py-2.5 pr-4 font-bold">#</th>
                        <th className="text-left py-2.5 pr-4 font-bold">Partner Product</th>
                        <th className="text-left py-2.5 pr-4 font-bold">Category</th>
                        <th className="text-right py-2.5 font-medium">Times Paired</th>
                      </tr>
                    </thead>
                    <tbody>
                      {moodboardPairings.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors text-xs">
                          <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-4 font-medium">{row.name}</td>
                          <td className="py-2 pr-4 text-xs text-muted-foreground">{row.category}</td>
                          <td className="py-2 text-right font-mono tabular-nums text-primary font-bold">{row.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ──── Catalog Gap Analysis (factory mode only) ──── */}
      {viewScope === 'factory' && (
        <>
          <SectionHeader
            title="Product Development Opportunities"
            desc="Materials buyers are actively demanding that are not in your catalog — actionable expansion signals"
            icon={Search}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Target className="h-4 w-4" /> Catalog Gaps — Top Unserved Demands</h3>
              <p className="text-xs text-muted-foreground mt-1">Top platform demand signals that don't match any product in your catalog</p>
            </div>
            <div>
              {catalogGaps.length === 0 ? (
                <EmptyState message="Your catalog covers all top demanded materials" />
              ) : (
                <div className="overflow-auto max-h-[260px]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                      <tr className="text-xs font-semibold text-muted-foreground border-b border-border/50">
                        <th className="text-left py-2.5 pr-4 font-bold">#</th>
                        <th className="text-left py-2.5 pr-4 font-bold">Demanded Material</th>
                        <th className="text-right py-2.5 pr-4 font-bold">Signals</th>
                        <th className="text-right py-2.5 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catalogGaps.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors text-xs">
                          <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 pr-4 font-medium">{row.name}</td>
                          <td className="py-2 pr-4 text-right font-mono tabular-nums text-amber-500 font-bold">{row.mentions}</td>
                          <td className="py-2 text-right">
                            <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">MISSING</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ──── Product Velocity (factory mode only) ──── */}
      {viewScope === 'factory' && productVelocity.length > 0 && (
        <>
          <SectionHeader title="Product Velocity" desc="Week-over-week traction — last 4 weeks vs prior 4 weeks" icon={Zap} />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div>
              <div className="overflow-auto max-h-[300px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                    <tr className="text-xs font-semibold text-muted-foreground border-b border-border/50">
                      <th className="text-left py-2.5 pr-4 font-bold">#</th>
                      <th className="text-left py-2.5 pr-4 font-bold">Product</th>
                      <th className="text-right py-2.5 pr-4 font-bold">Saves 4W</th>
                      <th className="text-right py-2.5 pr-4 font-bold">Quotes</th>
                      <th className="text-right py-2.5 font-medium">Velocity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productVelocity.map((row, i) => (
                      <tr key={i} className="border-b border-border/30 last:border-0 hover:bg-muted/30 transition-colors text-xs">
                        <td className="py-2 pr-4 text-muted-foreground">{i + 1}</td>
                        <td className="py-2 pr-4 font-medium">{row.name}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums">{row.saves}</td>
                        <td className="py-2 pr-4 text-right font-mono tabular-nums text-primary">{row.quotes}</td>
                        <td className="py-2 text-right">
                          {row.trend === 'up'
                            ? <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-green-500/10 text-green-500 border border-green-500/20">▲ RISING</span>
                            : row.trend === 'down'
                            ? <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 border border-red-500/20">▼ DECLINE</span>
                            : <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/30">→ STABLE</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
export default function FactoryAnalyticsPage() {
  const { user } = useAuth();
  const { isFactory, isAdmin, factoryClaimedName, loading } = useFactoryRole();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isFactory && !isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-2">
          <Building2 className="h-10 w-10 text-muted-foreground mx-auto" />
          <p className="text-muted-foreground">Access restricted to verified factories and admins.</p>
        </div>
      </div>
    );
  }

  const defaultTab = isFactory ? 'my-factory' : 'market-trends';

  return (
    <div>
      <PageHeader
        icon={Building2}
        title="Factory Analytics"
        subtitle={isAdmin ? 'Full platform + factory analytics view' : 'Your factory performance and market trends'}
      />

      <div className="max-w-7xl mx-auto px-6 py-8">
      <Tabs defaultValue={defaultTab} className="space-y-6">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          {isFactory && (
            <TabsTrigger value="my-factory" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Building2 className="h-4 w-4" />My Factory
            </TabsTrigger>
          )}
          <TabsTrigger value="market-trends" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <TrendingUp className="h-4 w-4" />Market Trends
          </TabsTrigger>
        </TabsList>

        {isFactory && user && (
          <TabsContent value="my-factory">
            <MyFactoryTab factoryName={factoryClaimedName ?? ''} userId={user.id} />
          </TabsContent>
        )}

        <TabsContent value="market-trends">
          <MarketTrendsTab isFactory={isFactory} factoryName={factoryClaimedName ?? undefined} />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
}
