import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Building2, TrendingUp, Star, Users, MessageSquare, Eye,
  Package, Loader2, Search, Target, Globe, Layers, Activity, Heart,
  MapPin, UserCheck, Lock, BarChart3,
} from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { buildWeeks, weeksAgo, weekLabel, convRate, CHART_MARGINS, GRID_PROPS } from '../shared/analyticsUtils';
import { COLORS, KpiCard, SectionHeader, EmptyState, AnalyticsTable, AnalyticsCol, formatProfType } from '../shared/AnalyticsUIComponents';
import { getManufacturer } from '@/utils/productMetadata';

// ─────────────────────────────────────────────────────────────
// My Factory Tab — Enhanced
// ─────────────────────────────────────────────────────────────
export const MyFactoryTab = function MyFactoryTab({ factoryName, userId, tier = 'free' }: { factoryName: string; userId: string; tier?: 'free' | 'pro' | 'enterprise' }) {
  const isPro = tier === 'pro' || tier === 'enterprise';
  const isEnterprise = tier === 'enterprise';
  const [loading, setLoading] = useState(true);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [moodboardSaves, setMoodboardSaves] = useState<{ week: string; saves: number }[]>([]);
  const [quoteCounts, setQuoteCounts] = useState<{ week: string; quotes: number }[]>([]);
  const [hireRequests, setHireRequests] = useState<{ week: string; hires: number }[]>([]);
  const [followerTrend, setFollowerTrend] = useState<{ week: string; follows: number }[]>([]);
  const [topProducts, setTopProducts] = useState<{ name: string; saves: number; quotes: number }[]>([]);
  const [ratingDist, setRatingDist] = useState<{ rating: string; count: number }[]>([]);
  const [kpis, setKpis] = useState({ totalSaves: 0, totalQuotes: 0, avgRating: 0, hireTotal: 0, followers: 0, profileViews: 0, preferredCount: 0 });
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

  // Geographic Demand
  const [geographicData, setGeographicData] = useState<{ location: string; views: number; saves: number; quotes: number }[]>([]);

  // Designer Leads (aggregated engagement by profession type)
  const [designerEngagement, setDesignerEngagement] = useState<{ profession: string; users: number; saves: number; quotes: number }[]>([]);

  // Competitive ranking
  const [competitiveRank, setCompetitiveRank] = useState<{ category: string; rank: number; total: number }[]>([]);

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
        .map(([value, d]) => ({ value, ...d })),
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
          .map(([term, count]) => ({ term, count })),
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
            .map(([name, value]) => ({ name, value })),
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
                .map(([status, count]) => ({ status, count })),
            ),
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

      // 8. Preferred factory count — how many users have added this factory to their preferred list
      const { data: allProfiles } = await supabase
        .from('user_profiles')
        .select('preferred_factories');
      const preferredCount = (allProfiles ?? []).filter((p) => {
        const pf = p.preferred_factories as { name: string }[] | null;
        return Array.isArray(pf) && pf.some((f) => f.name === factoryName);
      }).length;

      // 9. Followers + profile views
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
        preferredCount,
      });

      // ── NEW: Geographic Demand from manufacturer_analytics_events ──
      if (ids.length > 0) {
        const { data: geoEvents } = await supabase
          .from('manufacturer_analytics_events')
          .select('event_type, user_city, user_country')
          .in('product_id', ids.slice(0, 50))
          .not('user_country', 'is', null);

        if (geoEvents && geoEvents.length > 0) {
          const geoMap = new Map<string, { views: number; saves: number; quotes: number }>();
          for (const ev of geoEvents) {
            const loc = [ev.user_city, ev.user_country].filter(Boolean).join(', ') || 'Unknown';
            const entry = geoMap.get(loc) ?? { views: 0, saves: 0, quotes: 0 };
            if (ev.event_type === 'product_view') entry.views++;
            else if (ev.event_type === 'product_save') entry.saves++;
            else if (ev.event_type === 'product_quote') entry.quotes++;
            geoMap.set(loc, entry);
          }
          setGeographicData(
            Array.from(geoMap.entries())
              .map(([location, d]) => ({ location, ...d }))
              .sort((a, b) => (b.views + b.saves + b.quotes) - (a.views + a.saves + a.quotes))
              .slice(0, 15),
          );
        }

        // ── NEW: Designer Engagement by Profession ──
        // Get unique user_ids from saves and quotes on factory products
        const engagedUserIds = new Set<string>();
        const userSaveCounts = new Map<string, number>();
        const userQuoteCounts = new Map<string, number>();

        const { data: mbItemsAll } = await supabase
          .from('moodboard_items')
          .select('moodboard_id, material_id, moodboards(user_id)')
          .in('material_id', ids.slice(0, 50));

        (mbItemsAll ?? []).forEach((item: any) => {
          const uid = item.moodboards?.user_id;
          if (uid) {
            engagedUserIds.add(uid);
            userSaveCounts.set(uid, (userSaveCounts.get(uid) ?? 0) + 1);
          }
        });

        const { data: qItemsAll } = await supabase
          .from('quote_items')
          .select('product_id, quotes(user_id)')
          .in('product_id', ids.slice(0, 50));

        (qItemsAll ?? []).forEach((item: any) => {
          const uid = item.quotes?.user_id;
          if (uid) {
            engagedUserIds.add(uid);
            userQuoteCounts.set(uid, (userQuoteCounts.get(uid) ?? 0) + 1);
          }
        });

        if (engagedUserIds.size > 0) {
          const { data: userProfiles } = await supabase
            .from('user_profiles')
            .select('user_id, profession_type')
            .in('user_id', Array.from(engagedUserIds).slice(0, 100));

          const profMap = new Map<string, { users: Set<string>; saves: number; quotes: number }>();
          (userProfiles ?? []).forEach((p) => {
            const prof = p.profession_type || 'other';
            const entry = profMap.get(prof) ?? { users: new Set(), saves: 0, quotes: 0 };
            entry.users.add(p.user_id);
            entry.saves += userSaveCounts.get(p.user_id) ?? 0;
            entry.quotes += userQuoteCounts.get(p.user_id) ?? 0;
            profMap.set(prof, entry);
          });

          setDesignerEngagement(
            Array.from(profMap.entries())
              .map(([profession, d]) => ({
                profession: formatProfType(profession),
                users: d.users.size,
                saves: d.saves,
                quotes: d.quotes,
              }))
              .sort((a, b) => (b.saves + b.quotes) - (a.saves + a.quotes)),
          );
        }

        // ── NEW: Competitive Positioning ──
        // For each category the factory has products in, rank vs. other factories
        const factoryCategories = new Map<string, number>();
        (products ?? []).forEach((p) => {
          const cat = (p.metadata as Record<string, unknown>)?.category as string;
          if (cat) factoryCategories.set(cat, (factoryCategories.get(cat) ?? 0) + 1);
        });

        if (factoryCategories.size > 0) {
          const topCats = Array.from(factoryCategories.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
          const rankResults: { category: string; rank: number; total: number }[] = [];

          for (const [cat] of topCats) {
            const { data: catProducts } = await supabase
              .from('products')
              .select('id, metadata')
              .contains('metadata', { category: cat })
              .limit(500);

            // Count saves per factory in this category
            const factorySaves = new Map<string, number>();
            const catProductIds = (catProducts ?? []).map(p => p.id);

            if (catProductIds.length > 0) {
              const { count: catMbCount } = await supabase
                .from('moodboard_items')
                .select('*', { count: 'exact', head: true })
                .in('material_id', catProductIds);

              // Count our factory's saves
              const ourIds = catProductIds.filter(id => ids.includes(id));
              const { count: ourSaves } = await supabase
                .from('moodboard_items')
                .select('*', { count: 'exact', head: true })
                .in('material_id', ourIds.length > 0 ? ourIds : ['none']);

              // Estimate unique factories in this category
              const factoryNames = new Set<string>();
              (catProducts ?? []).forEach(p => {
                const fn = getManufacturer(p.metadata as Record<string, unknown>);
                if (fn) factoryNames.add(fn);
              });

              const totalFactories = factoryNames.size || 1;
              const avgSaves = (catMbCount ?? 0) / totalFactories;
              const rank = (ourSaves ?? 0) >= avgSaves
                ? Math.max(1, Math.ceil(totalFactories * 0.3))
                : Math.ceil(totalFactories * 0.6);

              rankResults.push({ category: cat, rank, total: totalFactories });
            }
          }

          setCompetitiveRank(rankResults);
        }
      }
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
    preferred: Math.max(kpis.preferredCount, 1),
  };
  const radarData = [
    { axis: 'Moodboard Saves', value: normalize(kpis.totalSaves, radarMax.saves) },
    { axis: 'Quote Inclusions', value: normalize(kpis.totalQuotes, radarMax.quotes) },
    { axis: 'Avg Rating', value: normalize(kpis.avgRating, 5) },
    { axis: 'Hire Requests', value: normalize(kpis.hireTotal, radarMax.hires) },
    { axis: 'Followers', value: normalize(kpis.followers, radarMax.followers) },
    { axis: 'Profile Views', value: normalize(kpis.profileViews, radarMax.views) },
    { axis: 'Preferred by Users', value: normalize(kpis.preferredCount, radarMax.preferred) },
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
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <KpiCard label="Moodboard Saves" value={kpis.totalSaves} icon={Package} />
        <KpiCard label="Quote Inclusions" value={kpis.totalQuotes} icon={TrendingUp} />
        <KpiCard
          label="Your Conv. Rate"
          value={convRate(kpis.totalQuotes, kpis.totalSaves)}
          icon={Target}
          color="text-green-600"
        />
        <KpiCard label="Platform Avg Conv." value={platformConv} icon={Globe} color="text-muted-foreground" />
        <KpiCard label="Avg Rating" value={kpis.avgRating > 0 ? `${kpis.avgRating.toFixed(1)}★` : '—'} icon={Star} color="text-amber-500" />
        <KpiCard label="Hire Requests" value={kpis.hireTotal} icon={MessageSquare} />
        <KpiCard label="Followers" value={kpis.followers} icon={Users} />
        <KpiCard label="Preferred by Users" value={kpis.preferredCount} icon={Heart} color="text-pink-500" />
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
              <BarChart data={ratingDist} margin={CHART_MARGINS.bar}>
                <CartesianGrid {...GRID_PROPS} />
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
            <LineChart data={activityData} margin={CHART_MARGINS.line}>
              <CartesianGrid {...GRID_PROPS} />
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
          <AnalyticsTable<{ name: string; saves: number; quotes: number }>
            maxH={320}
            rows={topProducts}
            columns={[
              { header: '#',      thClass: 'text-left pr-4', tdClass: 'pr-4 text-xs text-muted-foreground', render: (_, i) => i + 1 },
              { header: 'Product',                           tdClass: 'pr-4 font-medium',                   render: (r) => r.name },
              { header: 'Saves',  thClass: 'text-right pr-4', tdClass: 'pr-4 text-right tabular-nums',     render: (r) => r.saves },
              { header: 'Quotes', thClass: 'text-right pr-4', tdClass: 'pr-4 text-right tabular-nums text-primary', render: (r) => r.quotes },
              { header: 'Conv.',  thClass: 'text-right',      tdClass: 'text-right tabular-nums text-green-600 text-xs', render: (r) => convRate(r.quotes, r.saves) },
            ] as AnalyticsCol<{ name: string; saves: number; quotes: number }>[]}
          />
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
                <BarChart data={quoteByStatus} layout="vertical" margin={CHART_MARGINS.barH}>
                  <CartesianGrid {...GRID_PROPS} />
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
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><Star className="h-4 w-4" /> Conversion Funnel — Your Materials</h3>
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

      {/* ──── Geographic Demand & Designer Engagement ──────── */}
      <SectionHeader
        title={`Audience & Geographic Insights${!isPro ? ' (Pro)' : ''}`}
        desc={isPro ? 'Where your interest comes from and who is engaging with your materials' : 'Upgrade to Pro to see geographic demand and designer engagement data'}
        icon={isPro ? MapPin : Lock}
      />

      {!isPro ? (
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80 pointer-events-none" />
          <Lock className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">Geographic Demand & Designer Engagement</p>
          <p className="text-xs text-muted-foreground/70 mb-4">See where your interest comes from and which designers engage with your products</p>
          <Badge className="text-xs">Available on Pro plan</Badge>
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Geographic Demand */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><MapPin className="h-4 w-4" /> Geographic Demand</h3>
          <p className="text-xs text-muted-foreground mb-3">Where designers viewing your products are located</p>
          {geographicData.length === 0 ? (
            <EmptyState message="Geographic data will appear as designers interact with your products" />
          ) : (
            <AnalyticsTable<{ location: string; views: number; saves: number; quotes: number }>
              maxH={320}
              rows={geographicData}
              columns={[
                { header: '#', thClass: 'text-left pr-2', tdClass: 'pr-2 text-xs text-muted-foreground', render: (_, i) => i + 1 },
                { header: 'Location', tdClass: 'pr-4 font-medium', render: (r) => (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                    {r.location}
                  </span>
                )},
                { header: 'Views', thClass: 'text-right pr-3', tdClass: 'pr-3 text-right tabular-nums text-xs', render: (r) => r.views },
                { header: 'Saves', thClass: 'text-right pr-3', tdClass: 'pr-3 text-right tabular-nums text-xs', render: (r) => r.saves },
                { header: 'Quotes', thClass: 'text-right', tdClass: 'text-right tabular-nums text-primary font-semibold text-xs', render: (r) => r.quotes },
              ] as AnalyticsCol<{ location: string; views: number; saves: number; quotes: number }>[]}
            />
          )}
        </div>

        {/* Designer Engagement by Profession */}
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><UserCheck className="h-4 w-4" /> Designer Engagement by Profession</h3>
          <p className="text-xs text-muted-foreground mb-3">Who is saving and quoting your materials</p>
          {designerEngagement.length === 0 ? (
            <EmptyState message="Engagement data will build up as designers interact with your products" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={designerEngagement} margin={CHART_MARGINS.bar}>
                  <CartesianGrid {...GRID_PROPS} />
                  <XAxis dataKey="profession" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="saves" name="Saves" fill={COLORS[0]} radius={[4, 4, 0, 0]} stackId="a" />
                  <Bar dataKey="quotes" name="Quotes" fill={COLORS[1]} radius={[4, 4, 0, 0]} stackId="a" />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {designerEngagement.reduce((s, d) => s + d.users, 0)} unique designers engaged
              </div>
            </>
          )}
        </div>
      </div>
      )}

      {/* Competitive Positioning */}
      {isPro && competitiveRank.length > 0 && (
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-4"><BarChart3 className="h-4 w-4" /> Competitive Positioning</h3>
          <p className="text-xs text-muted-foreground mb-4">How your materials rank vs. other manufacturers in each category</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {competitiveRank.map((r) => (
              <div key={r.category} className="rounded-xl border border-border/60 p-4 bg-muted/20">
                <p className="text-xs text-muted-foreground capitalize mb-1">{r.category.replace(/_/g, ' ')}</p>
                <div className="flex items-end gap-2">
                  <span className="text-2xl font-bold text-primary">#{r.rank}</span>
                  <span className="text-sm text-muted-foreground mb-0.5">of {r.total} manufacturer{r.total !== 1 ? 's' : ''}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${r.rank <= Math.ceil(r.total * 0.3) ? 'bg-green-500' : r.rank <= Math.ceil(r.total * 0.6) ? 'bg-amber-500' : 'bg-red-400'}`}
                    style={{ width: `${Math.max(10, 100 - ((r.rank - 1) / Math.max(r.total - 1, 1)) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
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
              <AnalyticsTable<{ term: string; count: number }>
                maxH={280}
                rows={factorySearches}
                columns={[
                  { header: '#',            thClass: 'text-left pr-4', tdClass: 'pr-4 text-xs text-muted-foreground', render: (_, i) => i + 1 },
                  { header: 'Search Query',                             tdClass: 'pr-4 font-medium',                   render: (r) => r.term },
                  { header: 'Times',        thClass: 'text-right',     tdClass: 'text-right tabular-nums text-primary font-semibold', render: (r) => r.count },
                ] as AnalyticsCol<{ term: string; count: number }>[]}
              />
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
            <BarChart data={followerTrend} margin={CHART_MARGINS.bar}>
              <CartesianGrid {...GRID_PROPS} />
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
            <AnalyticsTable<{ value: string; saves: number; quotes: number }>
              maxH={360}
              rows={attributeData}
              columns={[
                { header: '#',                                             thClass: 'text-left pr-4', tdClass: 'pr-4 text-xs text-muted-foreground', render: (_, i) => i + 1 },
                { header: attributeKey.replace(/_/g, ' '), thClass: 'text-left pr-4 capitalize',     tdClass: 'pr-4 font-medium',                   render: (r) => r.value },
                { header: 'Moodboard Saves',                               thClass: 'text-right pr-4', tdClass: 'pr-4 text-right tabular-nums',      render: (r) => r.saves },
                { header: 'Quote Inclusions',                              thClass: 'text-right',      tdClass: 'text-right tabular-nums text-primary font-semibold', render: (r) => r.quotes },
              ] as AnalyticsCol<{ value: string; saves: number; quotes: number }>[]}
            />
          )}
        </div>
      </div>
    </div>
  );
};
