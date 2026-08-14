import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, Search, Target, Award, Globe, Layers, Activity,
  Download, Calendar, ChevronUp, ChevronDown, Minus, Package, Star, Eye, Users,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import {
  COLORS, KpiCard, SectionHeader, EmptyState, LifecycleBadge,
  getMomentum, prettifyKey, getLifecycle, formatProfType,
} from '../shared/AnalyticsUIComponents';
import {
  weeksAgo,
  buildMonthlyTrend,
  forecastWeeks,
  downloadCSV,
  convRate,
  CHART_MARGINS,
  GRID_PROPS,
} from '../shared/analyticsUtils';

/**
 * The four sub-areas the sections group into. Order here is the order of the rail.
 *   demand    — momentum, demanded materials & attributes, the 4-week forecast, seasonality
 *   discovery — how buyers reach a product, and what they searched for and did not find
 *   buyers    — who they are, how long they take, where they drop out
 *   activity  — what they actually did: moodboards, quotes, baskets, 3D scenes
 */
const MARKET_TABS = [
  { value: 'demand', label: 'Demand', icon: TrendingUp },
  { value: 'discovery', label: 'Discovery', icon: Search },
  { value: 'buyers', label: 'Buyers', icon: Users },
  { value: 'activity', label: 'Activity', icon: Activity },
] as const;

export const MarketTrendsTab: React.FC = () => {
  const [isDemoData, setIsDemoData] = useState(false);
  const [timeRange, setTimeRange] = useState<number>(12);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [platformCategories, setPlatformCategories] = useState<{ key: string; label: string }[]>([]);

  // ── Core data (both modes)
  const [kpis, setKpis] = useState({ activeDemandSignals: 0, topDemandedMaterial: '—', topCategory: '—', totalCategorySaves: 0, topBuyerType: '—' });
  const [topDemands, setTopDemands] = useState<{ name: string; mentions: number; saves: number; in3d: number; momentum: string }[]>([]);
  const [discoveryChannels, setDiscoveryChannels] = useState<{ name: string; value: number }[]>([]);
  const [topMoodboardItems, setTopMoodboardItems] = useState<{ name: string; category: string; materialType?: string; boardCount: number }[]>([]);
  const [topQuotedItems, setTopQuotedItems] = useState<{ name: string; category: string; materialType?: string; quoteCount: number; addedFrom: string }[]>([]);

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


  // ── New analytics sections
  const [engagementFunnel, setEngagementFunnel] = useState<{ stage: string; count: number; rate: string; color: string }[]>([]);
  const [discoveryByProduct, setDiscoveryByProduct] = useState<{ name: string; search: number; agent: number; threeD: number; manual: number; page: number }[]>([]);

  // ── Market direction / strategic intelligence
  const [materialGrowthRates, setMaterialGrowthRates] = useState<{ name: string; thisWeek: number; priorWeek: number; growthPct: number; lifecycle: string }[]>([]);
  const [roomTypeTrends, setRoomTypeTrends] = useState<{ roomType: string; thisWeek: number; priorWeek: number; growthPct: number }[]>([]);
  const [segmentGrowth, setSegmentGrowth] = useState<{ type: string; thisWeek: number; priorWeek: number; growthPct: number }[]>([]);

  // ── Seasonal trends (monthly, this year vs last year)
  const [monthlyTrend, setMonthlyTrend] = useState<{ label: string; thisYear: number; lastYear: number }[]>([]);

  // Sub-area is URL-driven so the App Launcher (and any shared link) can address one directly.
  // An unknown ?tab= falls back to Demand rather than selecting no tab and painting a blank body —
  // the failure deepLinkTargets.test.ts exists to catch.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = MARKET_TABS.some((t) => t.value === tabParam) ? tabParam! : 'demand';
  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  // ── Computed inline
  const displayedAttributes = metadataByKey.get(attrSource) ?? [];

  // ── Export handler
  const handleExport = () => {
    const header = ['Material', 'This Period Saves', 'Prior Period Saves', 'Growth %', 'Lifecycle', 'Forecast W+1', 'Forecast W+2', 'Forecast W+3', 'Forecast W+4'];
    const dataRows = materialGrowthRates.slice(0, 20).map((r) => {
      const fc = forecastWeeks(r.thisWeek, r.growthPct, 4);
      return [r.name, String(r.thisWeek), String(r.priorWeek), `${r.growthPct}%`, r.lifecycle, ...fc.map(String)];
    });
    downloadCSV(`material-trends-${new Date().toISOString().slice(0,10)}.csv`, [header, ...dataRows]);
  };

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
    setDiscoveryChannels([
      { name: 'Search', value: 45 }, { name: 'AI Agent', value: 28 },
      { name: 'Product Page', value: 15 }, { name: 'Manual', value: 8 }, { name: '3D Generation', value: 4 },
    ]);
    setTopMoodboardItems([
      { name: 'Marble Bianco 60x60', category: 'Tiles', materialType: 'porcelain_tile', boardCount: 34 },
      { name: 'Natural Oak Panel', category: 'Wood', materialType: 'engineered_wood', boardCount: 28 },
      { name: 'Concrete Finish', category: 'General Materials', materialType: 'concrete', boardCount: 22 },
      { name: 'Warm Linen Curtain', category: 'Decor', materialType: 'curtain', boardCount: 18 },
      { name: 'Brass Wall Light', category: 'Lighting', materialType: 'wall_light', boardCount: 15 },
      { name: 'Calacatta Marble Slab', category: 'General Materials', materialType: 'stone_slab', boardCount: 14 },
      { name: 'Smoked Glass Panel', category: 'Decor', materialType: 'mirror', boardCount: 11 },
      { name: 'Rattan Chair', category: 'Furniture', materialType: 'dining_chair', boardCount: 9 },
      { name: 'Underfloor Heating Mat', category: 'Heating', materialType: 'underfloor_heating', boardCount: 8 },
      { name: 'Travertine Floor', category: 'Tiles', materialType: 'floor_tile', boardCount: 7 },
    ]);
    setTopQuotedItems([
      { name: 'Marble Bianco 60x60', category: 'Tiles', materialType: 'porcelain_tile', quoteCount: 18, addedFrom: 'search' },
      { name: 'Natural Oak Panel', category: 'Wood', materialType: 'engineered_wood', quoteCount: 14, addedFrom: 'agent' },
      { name: 'Underfloor Heating Mat', category: 'Heating', materialType: 'underfloor_heating', quoteCount: 12, addedFrom: 'search' },
      { name: 'Warm Linen Curtain', category: 'Decor', materialType: 'curtain', quoteCount: 10, addedFrom: 'moodboard' },
      { name: 'Wall-Hung Toilet', category: 'Sanitary', materialType: 'toilet', quoteCount: 9, addedFrom: 'product_page' },
      { name: 'Calacatta Marble Slab', category: 'General Materials', materialType: 'stone_slab', quoteCount: 8, addedFrom: 'search' },
      { name: 'Oak Dining Table', category: 'Furniture', materialType: 'dining_table', quoteCount: 7, addedFrom: 'agent' },
      { name: 'Concrete Finish', category: 'General Materials', materialType: 'concrete', quoteCount: 6, addedFrom: '3d_generation' },
      { name: 'Brass Pendant Light', category: 'Lighting', materialType: 'pendant_light', quoteCount: 5, addedFrom: 'moodboard' },
      { name: 'Terrazzo Floor Tile', category: 'Tiles', materialType: 'floor_tile', quoteCount: 4, addedFrom: 'search' },
    ]);
    setBuyerTypeData([
      { type: 'interior_designer', saves: 285, quotes: 92 },
      { type: 'architect', saves: 198, quotes: 78 },
      { type: 'designer', saves: 165, quotes: 45 },
      { type: 'brand', saves: 88, quotes: 32 },
      { type: 'sourcing_agent', saves: 62, quotes: 28 },
      { type: 'other', saves: 35, quotes: 12 },
    ]);
    setKpis({ activeDemandSignals: 15, topDemandedMaterial: 'Marble Bianco', topCategory: 'Tiles', totalCategorySaves: 592, topBuyerType: 'Interior Designer' });
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
    // Engagement funnel demo — always platform-wide
    setEngagementFunnel([
      { stage: 'Material Views', count: 14820, rate: '100%', color: 'bg-violet-500' },
      { stage: 'Moodboard Saves', count: 3847, rate: '26.0%', color: 'bg-blue-500' },
      { stage: 'Quote Requests', count: 592, rate: '4.0%', color: 'bg-cyan-500' },
      { stage: 'Quotes Accepted', count: 312, rate: '2.1%', color: 'bg-green-500' },
    ]);
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

  /*
    Loading follows the tabs. The core fetch — the four platform queries behind the KPI row, the
    demanded-materials table and the discovery-channel breakdown — always runs, because the KPIs sit
    above the rail and are on screen whichever sub-area you are in. Everything else is a PANE
    loader that fires the first time you open its sub-area: 3D scenes and quote baskets for
    Activity, the funnel for Buyers, unmatched search terms for Discovery, week-over-week growth and
    two years of seasonality for Demand.

    That is nine queries deferred, several of them 1,000–5,000 rows, on a page where the reader
    only ever looks at one sub-area at a time.

    `panesLoaded` keys on the FILTERS as well as the tab, so switching back to a pane you have
    already opened costs nothing, while changing the category or the time range correctly reloads
    it. A pane that throws is removed from the set so it can be retried by revisiting it, rather
    than being remembered as done.

    Panes wait for `coreReady`: the Buyers funnel needs two totals the core fetch produces, and
    landing directly on ?tab=buyers would otherwise race it and draw a funnel out of zeroes.
    Demo data is seeded up-front for every pane, so a sub-area is never empty while its real query
    is still in flight.
  */
  const coreTotals = useRef({ saves: 0, quoted: 0 });
  const panesLoaded = useRef(new Set<string>());
  const [coreReady, setCoreReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setCoreReady(false);
    panesLoaded.current.clear();
    loadDemoData();
    load().finally(() => { if (!cancelled) setCoreReady(true); });
    return () => { cancelled = true; };
  }, [timeRange, selectedCategory]);

  useEffect(() => {
    if (!coreReady) return;
    const key = `${tab}|${timeRange}|${selectedCategory}`;
    if (panesLoaded.current.has(key)) return;
    panesLoaded.current.add(key);
    const run = tab === 'demand' ? loadDemandPane
      : tab === 'discovery' ? loadDiscoveryPane
      : tab === 'buyers' ? loadBuyersPane
      : loadActivityPane;
    run().catch((e) => {
      panesLoaded.current.delete(key);
      console.error(`Market trends "${tab}" pane failed:`, e);
    });
  }, [coreReady, tab, timeRange, selectedCategory]);

  // ── Data loading ───────────────────────────────────────────
  const load = async () => {
    try {
      const ago = weeksAgo(timeRange);

      {
        // ── PLATFORM BRANCH (always runs) ─────────────────────
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
        } catch (e) { console.error('Buyer type join failed:', e); }

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


        // The funnel pane loads later and needs these two totals; the arrays themselves are
        // not worth holding in state, and re-fetching them per pane would undo the point.
        coreTotals.current = { saves: (mbItems ?? []).length, quoted: (qItems ?? []).length };
        setIsDemoData(false);
        setKpis({
          activeDemandSignals: (demandData ?? []).length,
          topDemandedMaterial: demands[0]?.name ?? '—',
          topCategory: '—',
          totalCategorySaves: filteredMbItems.length,
          topBuyerType,
        });
      } // ─── end platform branch ────────────────────────────────

    } catch (err) {
      console.error('MarketTrendsTab load error:', err);
    }
  };

  const loadDemandPane = async () => {
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
    } catch (e) { console.error('Market direction load failed:', e); }

    // ── Seasonal trend: moodboard saves by month (24 months)
    try {
      const twoYearsAgo = new Date(); twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
      const { data: monthData } = await supabase
        .from('moodboard_items').select('created_at')
        .gte('created_at', twoYearsAgo.toISOString()).limit(5000);
      setMonthlyTrend(buildMonthlyTrend(monthData ?? []));
    } catch (e) { console.error('Seasonal load failed:', e); }
  };

  const loadDiscoveryPane = async () => {
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
        lastSeen: d.last_seen_at ? formatDate(d.last_seen_at) : '—',
      })));
    } catch (e) { console.error('Zero-result data load failed:', e); }
  };

  const loadBuyersPane = async () => {
    const ago = weeksAgo(timeRange);
    // ── Engagement funnel (platform) ──────────────────────
    try {
      const [{ data: miData }, { data: funnelQuotes }] = await Promise.all([
        supabase.from('user_material_interactions').select('interaction_type').gte('created_at', ago.toISOString()).limit(5000),
        supabase.from('quotes').select('status').gte('created_at', ago.toISOString()).limit(1000),
      ]);
      const viewCount = (miData ?? []).filter((r: any) => r.interaction_type === 'view').length;
      const funnelSaves = coreTotals.current.saves;
      const funnelQuoted = coreTotals.current.quoted;
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
    } catch (e) { console.error('Engagement funnel load failed:', e); }
  };

  const loadActivityPane = async () => {
    const ago = weeksAgo(timeRange);
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
    } catch (e) { console.error('VR data load failed:', e); }

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
    } catch (e) { console.error('Basket analysis failed:', e); }
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
        <button
          onClick={handleExport}
          disabled={materialGrowthRates.length === 0}
          className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border/60 rounded-lg px-3 py-1.5 hover:bg-accent/50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
          title="Download trend data as CSV"
        >
          <Download className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Active Demand Signals" value={kpis.activeDemandSignals} icon={TrendingUp} />
        <KpiCard label="Top Demanded Material" value={kpis.topDemandedMaterial} icon={Package} color="text-violet-600" />
        <KpiCard label="Most Saved Category" value={kpis.topCategory} icon={Star} color="text-amber-500" />
        <KpiCard label="Total Category Saves" value={kpis.totalCategorySaves} icon={Eye} color="text-cyan-600" />
        <KpiCard label="Top Buyer Type" value={kpis.topBuyerType} icon={Users} color="text-green-600" />
      </div>


      {/* ── Sub-areas ──
          Thirteen sections in one scroll: the ones below the fold went unread, and no link could
          address them. Same split the CRM company's Market tab got. `?tab=` so the App Launcher can
          deep-link a sub-area and a reader can send a URL that lands where they mean.
          NOTE: every query still runs on arrival — these tabs divide the READING, not the loading. */}
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="finance-tabs-list flex h-auto w-full flex-row flex-wrap gap-1 bg-transparent p-0">
          {MARKET_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2">
              <t.icon className="h-4 w-4 shrink-0" />
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="demand" className="space-y-5 mt-0">
      {/* ──── Where the Market is Going ──────────────────────── */}
      {materialGrowthRates.length > 0 && (
        <>
          <SectionHeader
            title="Where the Market Is Going"
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
        title={'Demand Intelligence'}
        desc={'What materials and attributes buyers are actively seeking across the platform'}
        icon={TrendingUp}
      />

      {/* Demanded Materials table */}
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Package className="h-4 w-4" />
                {'Top 15 Demanded Materials'}
              </h3>
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
                    <th className="text-right px-3 py-2.5 font-medium">{'Saves'}</th>
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
                          <div className="font-medium flex items-center gap-1.5">
                            {row.name}
                          </div>
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
                  ? `Showing: ${metadataFieldLabels.get(attrSource) ?? prettifyKey(attrSource)}${selectedCategory !== 'all' ? ` · ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ''}`
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
              <BarChart data={displayedAttributes} layout="vertical" margin={CHART_MARGINS.barH}>
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

      {/* ──── Demand Forecast ──────────────────────────────── */}
      {materialGrowthRates.length > 0 && (
        <>
          <SectionHeader
            title="4-Week Demand Forecast"
            desc="Projected save velocity based on current growth rate — clipped at ±40%/week to avoid outlier distortion"
            icon={TrendingUp}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border/40">
                    <th className="text-left py-2 pr-4 text-muted-foreground font-normal">Material</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-normal">Now</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-normal">W+1</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-normal">W+2</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-normal">W+3</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-normal">W+4</th>
                    <th className="text-right py-2 pl-3 text-muted-foreground font-normal">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/20">
                  {materialGrowthRates.slice(0, 10).map((row, i) => {
                    const fc = forecastWeeks(row.thisWeek, row.growthPct, 4);
                    const up = row.growthPct > 5;
                    const down = row.growthPct < -5;
                    return (
                      <tr key={i} className="hover:bg-muted/20 transition-colors">
                        <td className="py-2.5 pr-4 font-medium truncate max-w-[160px]">{row.name}</td>
                        <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground">{row.thisWeek}</td>
                        {fc.map((v, j) => (
                          <td key={j} className={`py-2.5 px-3 text-right tabular-nums font-semibold ${up ? 'text-green-600' : down ? 'text-red-500' : 'text-foreground'}`}>{v}</td>
                        ))}
                        <td className="py-2.5 pl-3 text-right">
                          {up   ? <ChevronUp   className="h-4 w-4 text-green-500 ml-auto" />
                          : down ? <ChevronDown className="h-4 w-4 text-red-400 ml-auto" />
                          :        <Minus       className="h-4 w-4 text-muted-foreground ml-auto" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground mt-4 italic">
              Forecast uses linear compound growth. Assumes market conditions remain stable. Treat as directional guidance only.
            </p>
          </div>
        </>
      )}

      {/* ──── Seasonal Patterns ───────────────────────────── */}
      {monthlyTrend.some((m) => m.thisYear > 0 || m.lastYear > 0) && (
        <>
          <SectionHeader
            title="Seasonal Patterns"
            desc="Monthly moodboard save volume — current year vs prior year. Reveals demand cycles and seasonal peaks."
            icon={Calendar}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="flex items-center gap-4 mb-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/70" />
                {new Date().getFullYear()}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/30" />
                {new Date().getFullYear() - 1}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={monthlyTrend} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  formatter={(v: number, name: string) => [v, name === 'thisYear' ? String(new Date().getFullYear()) : String(new Date().getFullYear() - 1)]}
                />
                <Bar dataKey="lastYear" fill="hsl(var(--muted-foreground) / 0.25)" radius={[3,3,0,0]} />
                <Bar dataKey="thisYear"  fill="hsl(var(--primary) / 0.75)"          radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
            {(() => {
              const peak = [...monthlyTrend].sort((a, b) => b.thisYear - a.thisYear)[0];
              const slow = [...monthlyTrend].filter((m) => m.thisYear > 0).sort((a, b) => a.thisYear - b.thisYear)[0];
              if (!peak || peak.thisYear === 0) return null;
              return (
                <div className="mt-4 flex gap-4 text-xs text-muted-foreground">
                  <span>Peak month: <span className="font-semibold text-foreground">{peak.label}</span> ({peak.thisYear} saves)</span>
                  {slow && <span>Slowest: <span className="font-semibold text-foreground">{slow.label}</span> ({slow.thisYear} saves)</span>}
                </div>
              );
            })()}
          </div>
        </>
      )}
        </TabsContent>
        <TabsContent value="discovery" className="space-y-5 mt-0">
      {/* ── Discovery Channel per Product ── */}
      {discoveryByProduct.length > 0 && (
        <>
          <SectionHeader
            title="How Materials Are Discovered"
            desc={'How buyers are discovering top materials — search-led vs AI-led vs 3D scene exploration'}
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
                {'Platform-wide gaps — first supplier to list wins all organic demand for these terms'}
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

        </TabsContent>
        <TabsContent value="buyers" className="space-y-5 mt-0">
      {/* ──── Buyer Profile Intelligence ──── */}
      <SectionHeader
        title="Buyer Profile Intelligence"
        desc={'Who is actively saving and quoting materials across the platform'}
        icon={Users}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Users className="h-4 w-4" /> Platform Activity by Professional Type</h3>
          </div>
          <div>
            {buyerTypeData.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={buyerTypeData.map((b) => ({ ...b, typeLabel: formatProfType(b.type) }))}
                  layout="vertical"
                  margin={CHART_MARGINS.barH}
                >
                  <CartesianGrid {...GRID_PROPS} />
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
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Users className="h-4 w-4" /> Platform Buyer Segment Breakdown</h3>
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
                          {convRate(row.quotes, row.saves)}
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
            desc={'Platform-wide buyer journey from material interest to confirmed purchase'}
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
                          <span className="text-muted-foreground tabular-nums">{formatNumber(stage.count)}</span>
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

        </TabsContent>
        <TabsContent value="activity" className="space-y-5 mt-0">
      {/* ──── Moodboard Activity ───────────────────────── */}
      <SectionHeader
        title="Moodboard Activity"
        desc={`Most saved products to design boards${selectedCategory !== 'all' ? ` in ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ' across all categories'}`}
        icon={Layers}
      />

      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <Layers className="h-4 w-4" />
            {'Top Products Saved to Moodboards'}
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
                    <th className="text-left px-3 py-2.5 font-medium">Type</th>
                    <th className="text-right px-4 py-2.5 font-medium">Board Saves</th>
                  </tr>
                </thead>
                <tbody>
                  {topMoodboardItems.map((row, i) => (
                    <tr key={i} className={'border-b border-border/30 hover:bg-muted/30 transition-colors '}>
                      <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        <div className="flex items-center gap-1.5">
                          {row.name}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{row.category}</td>
                      <td className="px-3 py-2">
                        {row.materialType && (
                          <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                            {row.materialType.replace(/_/g, ' ')}
                          </span>
                        )}
                      </td>
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
        desc={`Most quoted products${selectedCategory !== 'all' ? ` in ${platformCategories.find(c => c.key === selectedCategory)?.label ?? selectedCategory}` : ''} — the real purchase intent signal`}
        icon={Target}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Target className="h-4 w-4" />
              {'Top Products in Buyer Quotes'}
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
                      <th className="text-left px-3 py-2.5 font-medium">Type</th>
                      <th className="text-right px-4 py-2.5 font-medium">Quotes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topQuotedItems.map((row, i) => (
                      <tr key={i} className={'border-b border-border/30 hover:bg-muted/30 transition-colors '}>
                        <td className="px-4 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">
                          <div className="flex items-center gap-1.5">
                            {row.name}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{row.category}</td>
                        <td className="px-3 py-2">
                          {row.materialType && (
                            <span className="text-[10px] font-medium text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              {row.materialType.replace(/_/g, ' ')}
                            </span>
                          )}
                        </td>
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

      {/* ──── VR / 3D Scene Usage ──── */}
      {(vrUsageData.length > 0 || vrKpis.totalGenerations > 0) && (
        <>
          <SectionHeader
            title="3D Scene & VR Usage"
            desc={'Which materials buyers drop into AI-generated 3D scenes — the highest intent signal'}
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
                {'Top Materials Used in 3D Generations'}
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

      {/* ──── Quote Basket Intelligence ──── */}
      {quoteBasketsData.length > 0 && (
        <>
          <SectionHeader
            title="Quote Basket Intelligence"
            desc={'Products most frequently co-quoted together — reveals buyer project composition'}
            icon={Award}
          />
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
            <div className="mb-4">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Award className="h-4 w-4" />
                {'Most Co-Quoted Product Pairs'}
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

        </TabsContent>
      </Tabs>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────
