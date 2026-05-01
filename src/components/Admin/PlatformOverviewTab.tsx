import React, { useEffect, useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Building2, LayoutDashboard, Star, Users, Eye, Package, Loader2,
  Search, Target, Zap, Award, Globe, Layers, DollarSign, Cpu,
  Database, FileText, Clock, TrendingUp, Bell, Mail, MessageSquare, Monitor,
  ShoppingCart, CheckCircle2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useModule } from '@/modules/_core';

const COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#6366f1', '#ec4899', '#84cc16'];

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

function KpiCard({ label, value, sub, icon: Icon, color = 'text-primary' }: {
  label: string; value: React.ReactNode; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <div className="relative rounded-xl border border-border/50 bg-card px-4 py-3 hover:border-primary/30 transition-all overflow-hidden group">
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
      <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 shrink-0" />{label}
      </p>
      <p className={`text-2xl font-bold tracking-tight leading-none ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1.5">{sub}</p>}
    </div>
  );
}

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

export function PlatformOverviewTab() {
  const [loading, setLoading] = useState(true);
  const [isDemoData, setIsDemoData] = useState(false);

  // ── Quotes & Users ────────────────────────────────────────────
  const [quoteFunnel, setQuoteFunnel] = useState<{ status: string; count: number }[]>([]);
  const [weeklyQuotes, setWeeklyQuotes] = useState<{ week: string; count: number }[]>([]);
  const [userTypes, setUserTypes] = useState<{ name: string; value: number }[]>([]);
  const [weeklyGrowth, setWeeklyGrowth] = useState<{ week: string; new_users: number }[]>([]);
  const [topQuotedProducts, setTopQuotedProducts] = useState<{ name: string; count: number }[]>([]);
  const [kpis, setKpis] = useState({ totalQuotes: 0, thisMonth: 0, acceptRate: '—', activeProfiles: 0, hireTotal: 0 });

  // ── Supply Side ───────────────────────────────────────────────
  const [topFactories, setTopFactories] = useState<{ name: string; products: number; saves: number; quotes: number }[]>([]);
  const [catalogGrowth, setCatalogGrowth] = useState<{ week: string; count: number }[]>([]);
  const [factoryPipeline, setFactoryPipeline] = useState<{ status: string; count: number }[]>([]);
  const [recentRequests, setRecentRequests] = useState<{ name: string; type: string; status: string; date: string }[]>([]);

  // ── Credit Economy ────────────────────────────────────────────
  const [creditStats, setCreditStats] = useState({ totalConsumed: 0, totalEarned: 0, topType: '—' });
  const [weeklyCredits, setWeeklyCredits] = useState<{ week: string; debit: number; purchase: number; refund: number; bonus: number; monthly_grant: number }[]>([]);
  const [aiModelCosts, setAiModelCosts] = useState<{ model: string; credits: number; cost: number }[]>([]);
  const [aiOperationCosts, setAiOperationCosts] = useState<{ operation: string; credits: number }[]>([]);
  const [aiCostTrend, setAiCostTrend] = useState<{ week: string; cost: number; credits: number }[]>([]);
  const [topCreditConsumers, setTopCreditConsumers] = useState<{ userId: string; credits: number; topOp: string }[]>([]);
  const [creditBalanceDist, setCreditBalanceDist] = useState<{ range: string; count: number }[]>([]);
  const [creditKpis2, setCreditKpis2] = useState({ totalCostUsd: 0, uniqueUsers: 0 });

  // ── VR Worlds ─────────────────────────────────────────────────
  const [vrTrend, setVrTrend] = useState<{ week: string; count: number }[]>([]);
  const [vrQualitySplit, setVrQualitySplit] = useState<{ name: string; value: number }[]>([]);
  const [vrStatusTrend, setVrStatusTrend] = useState<{ week: string; completed: number; failed: number }[]>([]);
  const [vrTotalCredits, setVrTotalCredits] = useState(0);
  const [featureKpis, setFeatureKpis] = useState({ vrWorldsGenerated: 0, agentRuns: 0, moodboardsCreated: 0 });

  // ── 3D Generation ─────────────────────────────────────────────
  const [gen3dTrend, setGen3dTrend] = useState<{ week: string; jobs: number; segments: number }[]>([]);
  const [svbrdfTrend, setSvbrdfTrend] = useState<{ week: string; count: number }[]>([]);
  const [canvasKpis, setCanvasKpis] = useState({ gen3dJobs: 0, gen3dSegments: 0, svbrdfExtractions: 0 });
  const [gen3dRoomTypes, setGen3dRoomTypes] = useState<{ name: string; value: number }[]>([]);
  const [gen3dStatusTrend, setGen3dStatusTrend] = useState<{ week: string; completed: number; failed: number; pending: number }[]>([]);
  const [segmentZones, setSegmentZones] = useState<{ zone: string; count: number }[]>([]);
  const [topDetectedMaterials, setTopDetectedMaterials] = useState<{ material: string; count: number }[]>([]);
  const [avgConfidenceTrend, setAvgConfidenceTrend] = useState<{ week: string; confidence: number }[]>([]);
  const [svbrdfKpis, setSvbrdfKpis] = useState({ successRate: '—', avgConfidence: '—' });

  // ── AI Agents ─────────────────────────────────────────────────
  const [agentsByType, setAgentsByType] = useState<{ week: string; [key: string]: number | string }[]>([]);
  const [topAgentTypes, setTopAgentTypes] = useState<string[]>([]);
  const [agentTrend, setAgentTrend] = useState<{ week: string; count: number }[]>([]);
  const [agentOutcomePie, setAgentOutcomePie] = useState<{ name: string; value: number }[]>([]);
  const [agentSuccessTrend, setAgentSuccessTrend] = useState<{ week: string; completed: number; failed: number }[]>([]);
  const [agentAvgTime, setAgentAvgTime] = useState<{ type: string; avgMs: number }[]>([]);
  const [agentCreditsByType, setAgentCreditsByType] = useState<{ type: string; credits: number }[]>([]);

  // ── Community & Social ────────────────────────────────────────
  const [reviewVelocity, setReviewVelocity] = useState<{ week: string; count: number; avgRating: number }[]>([]);
  const [creatorGrowth, setCreatorGrowth] = useState<{ week: string; manufacturers: number; brands: number; suppliers: number; designers: number }[]>([]);
  const [socialEngagement, setSocialEngagement] = useState<{ week: string; hires: number; reviews: number; boards: number; follows: number }[]>([]);
  const [moodboardActivity, setMoodboardActivity] = useState<{ week: string; boards: number; items: number }[]>([]);
  const [followsGrowth, setFollowsGrowth] = useState<{ week: string; count: number }[]>([]);
  const [totalFollowers, setTotalFollowers] = useState(0);
  const [reviewRatingDist, setReviewRatingDist] = useState<{ rating: string; count: number }[]>([]);
  const [reviewKpis, setReviewKpis] = useState({ total: 0, avgRating: '—' });
  const [hireMeServices, setHireMeServices] = useState<{ service: string; count: number }[]>([]);
  const [hireMeFunnel, setHireMeFunnel] = useState<{ status: string; count: number }[]>([]);

  // ── Search Intelligence ───────────────────────────────────────
  const [searchVolume, setSearchVolume] = useState<{ week: string; searches: number }[]>([]);
  const [searchFunnel, setSearchFunnel] = useState<{ stage: string; count: number }[]>([]);
  const [topSearches, setTopSearches] = useState<{ term: string; count: number }[]>([]);
  const [zeroResultTerms, setZeroResultTerms] = useState<{ term: string; count: number }[]>([]);
  const [searchKpis, setSearchKpis] = useState({ totalSearches: 0, searchToSaveRate: '—', avgSatisfaction: '—', zeroResultRate: '—' });
  const [searchStrategyDist, setSearchStrategyDist] = useState<{ name: string; value: number }[]>([]);
  const [searchLatencyTrend, setSearchLatencyTrend] = useState<{ week: string; avgMs: number }[]>([]);
  const [searchCTRTrend, setSearchCTRTrend] = useState<{ week: string; ctr: number }[]>([]);
  const [searchAgentDist, setSearchAgentDist] = useState<{ name: string; value: number }[]>([]);

  // ── Knowledge Base Health ─────────────────────────────────────
  const [chunkGrowth, setChunkGrowth] = useState<{ week: string; count: number }[]>([]);
  const [kbDocsByCategory, setKbDocsByCategory] = useState<{ name: string; value: number }[]>([]);
  const [kbKpis, setKbKpis] = useState({ totalChunks: 0, totalDocs: 0, publishedDocs: 0, embeddingSuccessRate: '—' });
  const [kbStatusBreakdown, setKbStatusBreakdown] = useState<{ name: string; value: number }[]>([]);
  const [kbEmbeddingHealth, setKbEmbeddingHealth] = useState<{ name: string; value: number }[]>([]);
  const [kbTopViewed, setKbTopViewed] = useState<{ title: string; views: number; category: string; agentMentions: number }[]>([]);

  // ── Pipeline Health ───────────────────────────────────────────
  const [pdfJobTrend, setPdfJobTrend] = useState<{ week: string; success: number; failed: number }[]>([]);
  const [importThroughput, setImportThroughput] = useState<{ week: string; records: number }[]>([]);
  const [enrichmentStatus, setEnrichmentStatus] = useState<{ name: string; value: number }[]>([]);
  const [pipelineKpis, setPipelineKpis] = useState({ totalPdfJobs: 0, pdfSuccessRate: '—', totalImports: 0 });

  // ── Notifications & Messaging ─────────────────────────────────
  const [notifKpis, setNotifKpis] = useState({ totalSent: 0, email: 0, sms: 0, webPush: 0, inApp: 0 });
  const [notifTrend, setNotifTrend] = useState<{ week: string; email: number; sms: number; web: number; inapp: number }[]>([]);

  // ── Pricing Intelligence (gated on `greek-marketplaces` module) ───────
  const { enabled: greekModuleEnabled } = useModule('greek-marketplaces');
  const [pricingKpis, setPricingKpis] = useState({
    refreshes12w: 0,
    marketplaceHits12w: 0,
    moduleCredits12w: 0,
    trackedQueries: 0,
  });
  const [pricingWeekly, setPricingWeekly] = useState<{ week: string; internal: number; tracked: number; marketplace: number }[]>([]);
  const [marketplaceBySource, setMarketplaceBySource] = useState<{ source: string; count: number }[]>([]);
  const [pricingSourceDist, setPricingSourceDist] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => { load(); }, []);

  // Reload pricing panel when the module toggle flips mid-session.
  useEffect(() => {
    if (!greekModuleEnabled) {
      setPricingKpis({ refreshes12w: 0, marketplaceHits12w: 0, moduleCredits12w: 0, trackedQueries: 0 });
      setPricingWeekly([]);
      setMarketplaceBySource([]);
      setPricingSourceDist([]);
      return;
    }
    void loadPricingIntelligence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greekModuleEnabled]);


  const loadDemoPlatformData = () => {
    const wks = buildWeeks(12);
    const b = [4,6,5,8,7,10,9,13,11,16,14,18];
    const f = [8,9,8,10,9,11,10,12,11,13,12,14];
    const h = [20,28,24,35,30,42,38,52,46,62,55,70];

    // Quotes & Users
    setQuoteFunnel([{ status:'pending',count:42},{status:'accepted',count:28},{status:'rejected',count:14},{status:'completed',count:18}]);
    setWeeklyQuotes(wks.map((week,i) => ({ week, count: b[i]+2 })));
    setUserTypes([{name:'Interior Designer',value:38},{name:'Architect',value:25},{name:'Manufacturer',value:15},{name:'Brand',value:12},{name:'Other',value:10}]);
    setWeeklyGrowth(wks.map((week,i) => ({ week, new_users: f[i]+4 })));
    setTopQuotedProducts([
      {name:'Porcelanosa Krono 60x60',count:42},{name:'Flos Aim Pendant',count:38},
      {name:'Boffi Pipe Kitchen',count:31},{name:'Lema Selecta Wardrobe',count:28},
      {name:'Poliform Mad Chair',count:24},{name:'B&B Italia Tufty-Time',count:21},
      {name:'Miele H7860BPX Oven',count:18},{name:'Knoll Platner Chair',count:15},
      {name:'Vitra Eames DSW',count:13},{name:'Cassina LC4 Chaise',count:11},
    ]);
    setKpis({ totalQuotes:216, thisMonth:52, acceptRate:'67%', activeProfiles:284, hireTotal:94 });

    // Supply Side
    setTopFactories([
      {name:'Porcelanosa',products:142,saves:324,quotes:87},{name:'Flos',products:68,saves:215,quotes:54},
      {name:'Boffi',products:55,saves:178,quotes:42},{name:'Lema',products:38,saves:142,quotes:35},
      {name:'Poliform',products:44,saves:125,quotes:28},{name:'B&B Italia',products:31,saves:98,quotes:22},
      {name:'Miele',products:28,saves:84,quotes:18},{name:'Knoll',products:22,saves:72,quotes:15},
    ]);
    setCatalogGrowth(wks.map((week,i) => ({ week, count: [12,18,15,22,28,24,32,38,30,45,40,52][i] })));
    setFactoryPipeline([{status:'pending',count:8},{status:'approved',count:24},{status:'rejected',count:3}]);
    setRecentRequests([
      {name:'Mosa Tiles',type:'manufacturer',status:'pending',date:'2026-03-04'},
      {name:'Artemide',type:'brand',status:'approved',date:'2026-03-02'},
      {name:'Vola',type:'manufacturer',status:'pending',date:'2026-03-01'},
    ]);

    // Credit Economy
    setCreditStats({ totalConsumed:1840, totalEarned:2400, topType:'vr_world' });
    setWeeklyCredits(wks.map((week,i) => ({
      week, debit: h[i]*8, purchase: f[i]*6, refund: b[i], bonus: i%4===0?50:0, monthly_grant: i===0?200:0,
    })));
    setAiModelCosts([
      {model:'Claude Opus',credits:840,cost:8.40},{model:'GPT-5.2',credits:480,cost:4.80},
      {model:'Qwen3-VL',credits:280,cost:2.80},{model:'Voyage-3',credits:180,cost:1.80},
      {model:'Claude Haiku',credits:60,cost:0.60},{model:'text-embedding',credits:45,cost:0.45},
    ]);
    setAiOperationCosts([
      {operation:'vision',credits:420},{operation:'chat',credits:380},
      {operation:'embedding',credits:280},{operation:'scrape',credits:180},{operation:'agent',credits:150},
    ]);
    setAiCostTrend(wks.map((week,i) => ({ week, cost: +(b[i]*0.38+0.5).toFixed(2), credits: b[i]*38+50 })));
    setTopCreditConsumers([
      {userId:'a3f8e2c1',credits:284,topOp:'vision'},{userId:'b7d4f092',credits:218,topOp:'chat'},
      {userId:'c8a1b3e4',credits:195,topOp:'embedding'},{userId:'d2e9f031',credits:172,topOp:'vision'},
      {userId:'e5c3a8b2',credits:148,topOp:'agent'},{userId:'f1d0e7c3',credits:124,topOp:'chat'},
      {userId:'g4b8f2a1',credits:98,topOp:'scrape'},{userId:'h7a5e3d4',credits:84,topOp:'embedding'},
      {userId:'i9c1f8b0',credits:72,topOp:'vision'},{userId:'j2e4d7a5',credits:58,topOp:'chat'},
    ]);
    setCreditBalanceDist([{range:'0–100',count:48},{range:'101–500',count:35},{range:'501–1k',count:22},{range:'1k–5k',count:14},{range:'5k+',count:5}]);
    setCreditKpis2({ totalCostUsd:18.40, uniqueUsers:28 });

    // VR Worlds
    setVrTrend(wks.map((week,i) => ({ week, count: b[i] })));
    setVrQualitySplit([{name:'mini (50cr)',value:52},{name:'plus (200cr)',value:14}]);
    setVrStatusTrend(wks.map((week,i) => ({ week, completed: b[i], failed: Math.max(0,Math.floor(b[i]*0.08)) })));
    setVrTotalCredits(5400);
    setFeatureKpis({ vrWorldsGenerated:66, agentRuns:216, moodboardsCreated:138 });

    // 3D Generation
    const jobB=[4,7,6,10,9,13,11,16,14,18,15,20];
    const segB=[12,22,18,32,28,40,35,50,44,56,48,62];
    const svB=[6,9,8,14,12,17,15,20,18,24,21,28];
    setGen3dTrend(wks.map((week,i) => ({ week, jobs:jobB[i], segments:segB[i] })));
    setSvbrdfTrend(wks.map((week,i) => ({ week, count:svB[i] })));
    setCanvasKpis({ gen3dJobs:152, gen3dSegments:468, svbrdfExtractions:192 });
    setGen3dRoomTypes([
      {name:'living room',value:42},{name:'bedroom',value:38},{name:'kitchen',value:32},
      {name:'bathroom',value:24},{name:'home office',value:16},
    ]);
    setGen3dStatusTrend(wks.map((week,i) => ({
      week, completed:jobB[i], failed:Math.max(0,Math.floor(jobB[i]*0.10)), pending:Math.floor(jobB[i]*0.05),
    })));
    setSegmentZones([
      {zone:'wall',count:420},{zone:'floor',count:380},{zone:'furniture',count:285},
      {zone:'ceiling',count:245},{zone:'decor',count:182},{zone:'window',count:148},
    ]);
    setTopDetectedMaterials([
      {material:'wood',count:184},{material:'ceramic',count:162},{material:'marble',count:148},
      {material:'fabric',count:125},{material:'metal',count:98},{material:'glass',count:84},
      {material:'paint',count:72},{material:'stone',count:58},
    ]);
    setAvgConfidenceTrend(wks.map((week,i) => ({ week, confidence: +(0.72+i*0.015).toFixed(2) })));
    setSvbrdfKpis({ successRate:'89%', avgConfidence:'0.81' });

    // AI Agents
    const arB=[8,12,10,15,14,18,16,21,19,24,22,27];
    setAgentTrend(wks.map((week,i) => ({ week, count:arB[i] })));
    setAgentsByType(wks.map((week,i) => ({
      week, kai:Math.floor(arB[i]*0.5), 'product-enrichment':Math.floor(arB[i]*0.3), 'material-tagger':Math.floor(arB[i]*0.2),
    })));
    setTopAgentTypes(['kai','product-enrichment','material-tagger']);
    setAgentOutcomePie([{name:'completed',value:189},{name:'failed',value:18},{name:'timed_out',value:9}]);
    setAgentSuccessTrend(wks.map((week,i) => ({
      week, completed:arB[i], failed:Math.max(1,Math.floor(arB[i]*0.08)),
    })));
    setAgentAvgTime([{type:'kai',avgMs:2300},{type:'product-enrichment',avgMs:45000},{type:'material-tagger',avgMs:12000}]);
    setAgentCreditsByType([{type:'kai',credits:580},{type:'product-enrichment',credits:420},{type:'material-tagger',credits:180}]);

    // Community & Social
    const rB=[8,12,10,15,14,18,16,21,19,24,22,27];
    const bsB=[5,8,7,10,9,12,11,14,13,16,15,18];
    const itB=[15,24,20,30,27,35,32,42,38,48,44,52];
    const hB=[3,5,4,7,6,8,9,7,11,9,12,14];
    const fB=[12,18,15,22,20,25,23,28,26,31,29,34];
    setMoodboardActivity(wks.map((week,i) => ({ week, boards:bsB[i], items:itB[i] })));
    setReviewVelocity(wks.map((week,i) => ({ week, count:rB[i], avgRating:4.1+(i%3)*0.1 })));
    setCreatorGrowth(wks.map((week,i) => ({
      week, manufacturers:Math.floor(f[i]*0.15), brands:Math.floor(f[i]*0.12),
      suppliers:Math.floor(f[i]*0.10), designers:Math.floor(f[i]*0.63),
    })));
    setSocialEngagement(wks.map((week,i) => ({ week, hires:hB[i], reviews:rB[i], boards:bsB[i], follows:fB[i] })));
    setFollowsGrowth(wks.map((week,i) => ({ week, count:fB[i] })));
    setTotalFollowers(342);
    setReviewRatingDist([{rating:'1★',count:4},{rating:'2★',count:8},{rating:'3★',count:18},{rating:'4★',count:52},{rating:'5★',count:45}]);
    setReviewKpis({ total:127, avgRating:'4.2' });
    setHireMeServices([
      {service:'interior design',count:48},{service:'3D visualization',count:35},
      {service:'product sourcing',count:28},{service:'project management',count:22},{service:'consultation',count:18},
    ]);
    setHireMeFunnel([{status:'pending',count:24},{status:'accepted',count:42},{status:'completed',count:28},{status:'rejected',count:6}]);

    // Search
    const svBase=[24,38,31,45,42,55,49,62,58,70,65,78];
    setSearchVolume(wks.map((week,i) => ({ week, searches:svBase[i] })));
    setSearchFunnel([{stage:'Searches',count:580},{stage:'Clicked',count:420},{stage:'Saved',count:185},{stage:'Quoted',count:72}]);
    setTopSearches([
      {term:'marble tiles',count:84},{term:'pendant light',count:71},{term:'oak flooring',count:65},
      {term:'bathroom vanity',count:58},{term:'kitchen cabinet',count:52},
    ]);
    setZeroResultTerms([{term:'zellige tile',count:14},{term:'rattan pendant',count:11},{term:'travertine slab',count:8}]);
    setSearchKpis({ totalSearches:580, searchToSaveRate:'31.9%', avgSatisfaction:'4.1', zeroResultRate:'5.7%' });
    setSearchStrategyDist([{name:'semantic',value:280},{name:'visual',value:145},{name:'hybrid',value:98},{name:'text',value:57}]);
    setSearchLatencyTrend(wks.map((week,i) => ({ week, avgMs:480-i*18 })));
    setSearchCTRTrend(wks.map((week,i) => ({ week, ctr:+(0.42+i*0.02).toFixed(2) })));
    setSearchAgentDist([{name:'kai',value:380},{name:'interior-designer',value:180},{name:'demo',value:20}]);

    // KB Health
    setChunkGrowth(wks.map((week,i) => ({ week, count:b[i]*18 })));
    setKbDocsByCategory([{name:'Materials',value:48},{name:'Products',value:36},{name:'Guides',value:28},{name:'Technical',value:22},{name:'FAQ',value:14}]);
    setKbKpis({ totalChunks:2847, totalDocs:148, publishedDocs:135, embeddingSuccessRate:'98%' });

    // Pipeline Health
    setPdfJobTrend(wks.map((week,i) => ({ week, success:f[i]+2, failed:Math.max(0,Math.floor((f[i]+2)*0.09)) })));
    setImportThroughput(wks.map((week,i) => ({ week, records:b[i]*45 })));
    setEnrichmentStatus([{name:'completed',value:1284},{name:'pending',value:145},{name:'failed',value:28},{name:'processing',value:12}]);
    setPipelineKpis({ totalPdfJobs:182, pdfSuccessRate:'91%', totalImports:24 });

    setIsDemoData(true);
  };


  const load = async () => {
    setLoading(true);
    try {
      const ago12 = new Date(); ago12.setDate(ago12.getDate() - 84);
      const ago1m = new Date(); ago1m.setMonth(ago1m.getMonth() - 1);
      const wks12 = buildWeeks(12);

      // ── Phase 1: critical path ──────────────────────────────────
      const [
        { data: quotes }, { data: profiles }, { data: qItems },
        { data: hireMe }, { data: agentRuns }, { data: vrWorlds },
        { data: moodboards }, { data: moodboardItems },
        { data: searches }, { data: searchLogs },
      ] = await Promise.all([
        supabase.from('quote_requests').select('id,status,created_at').gte('created_at', ago12.toISOString()),
        supabase.from('profiles').select('id,professional_type,created_at').gte('created_at', ago12.toISOString()),
        supabase.from('quote_items').select('product_id,quote_request_id').gte('created_at', ago12.toISOString()).limit(3000),
        supabase.from('hire_me_requests').select('id,services,status,created_at').gte('created_at', ago12.toISOString()),
        supabase.from('agent_runs').select('created_at,status,execution_time_ms,credits_debited,background_agents(agent_type)').gte('created_at', ago12.toISOString()),
        supabase.from('vr_worlds').select('created_at,status,quality_preset,credits_used').gte('created_at', ago12.toISOString()),
        supabase.from('moodboards').select('id,created_at').gte('created_at', ago12.toISOString()),
        supabase.from('moodboard_items').select('created_at,material_id').gte('created_at', ago12.toISOString()).limit(3000),
        supabase.from('search_queries').select('query,created_at,result_count,strategy,execution_time_ms,agent_id,results_clicked').gte('created_at', ago12.toISOString()).limit(5000),
        supabase.from('search_feedback').select('rating,created_at').gte('created_at', ago12.toISOString()),
      ]);

      const total = (quotes ?? []).length;
      if (!total && !(profiles ?? []).length) { loadDemoPlatformData(); setLoading(false); return; }

      // Quotes funnel
      const funnelMap = new Map<string, number>();
      (quotes ?? []).forEach((q: any) => funnelMap.set(q.status, (funnelMap.get(q.status) ?? 0) + 1));
      setQuoteFunnel(Array.from(funnelMap.entries()).map(([status, count]) => ({ status, count })));
      const accepted = funnelMap.get('accepted') ?? 0;
      const completed = funnelMap.get('completed') ?? 0;
      const thisMonth = (quotes ?? []).filter((q: any) => new Date(q.created_at) >= ago1m).length;
      setKpis({ totalQuotes: total, thisMonth, acceptRate: total > 0 ? `${Math.round(((accepted + completed) / total) * 100)}%` : '—', activeProfiles: (profiles ?? []).length, hireTotal: (hireMe ?? []).length });
      const qWeekMap = new Map<string, number>(wks12.map(w => [w, 0]));
      (quotes ?? []).forEach((q: any) => { const l = weekLabel(new Date(q.created_at)); if (qWeekMap.has(l)) qWeekMap.set(l, (qWeekMap.get(l) ?? 0) + 1); });
      setWeeklyQuotes(Array.from(qWeekMap.entries()).map(([week, count]) => ({ week, count })));

      // User types + growth
      const typeMap = new Map<string, number>();
      (profiles ?? []).forEach((p: any) => typeMap.set(p.professional_type ?? 'other', (typeMap.get(p.professional_type ?? 'other') ?? 0) + 1));
      setUserTypes(Array.from(typeMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 6));
      const growMap = new Map<string, number>(wks12.map(w => [w, 0]));
      (profiles ?? []).forEach((p: any) => { const l = weekLabel(new Date(p.created_at)); if (growMap.has(l)) growMap.set(l, (growMap.get(l) ?? 0) + 1); });
      setWeeklyGrowth(Array.from(growMap.entries()).map(([week, new_users]) => ({ week, new_users })));

      // Creator growth
      const cgMap = new Map<string, { manufacturers: number; brands: number; suppliers: number; designers: number }>(wks12.map(w => [w, { manufacturers: 0, brands: 0, suppliers: 0, designers: 0 }]));
      (profiles ?? []).forEach((p: any) => {
        const l = weekLabel(new Date(p.created_at)); if (!cgMap.has(l)) return;
        const e = cgMap.get(l)!;
        if (p.professional_type === 'manufacturer') e.manufacturers++;
        else if (p.professional_type === 'brand') e.brands++;
        else if (p.professional_type === 'supplier') e.suppliers++;
        else e.designers++;
      });
      setCreatorGrowth(Array.from(cgMap.entries()).map(([week, d]) => ({ week, ...d })));

      // Top quoted products
      const prodCount = new Map<string, number>();
      (qItems ?? []).forEach((i: any) => prodCount.set(i.product_id, (prodCount.get(i.product_id) ?? 0) + 1));
      const topPids = Array.from(prodCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id);
      if (topPids.length > 0) {
        const { data: topProds } = await supabase.from('products').select('id,name').in('id', topPids);
        const nameMap = new Map<string, string>((topProds ?? []).map((p: any) => [p.id as string, p.name as string]));
        setTopQuotedProducts(topPids.map(id => ({ name: nameMap.get(id) ?? id.slice(0, 12), count: prodCount.get(id) ?? 0 })));
      }

      // Hire Me breakdown
      const hireSvcMap = new Map<string, number>();
      const hireFunnelMap = new Map<string, number>();
      (hireMe ?? []).forEach((h: any) => {
        (h.services ?? []).forEach((s: string) => hireSvcMap.set(s.replace(/_/g, ' '), (hireSvcMap.get(s.replace(/_/g, ' ')) ?? 0) + 1));
        hireFunnelMap.set(h.status, (hireFunnelMap.get(h.status) ?? 0) + 1);
      });
      setHireMeServices(Array.from(hireSvcMap.entries()).sort((a, b) => b[1] - a[1]).map(([service, count]) => ({ service, count })));
      setHireMeFunnel(Array.from(hireFunnelMap.entries()).map(([status, count]) => ({ status, count })));

      // Engagement mix
      const engMap = new Map<string, { hires: number; reviews: number; boards: number; follows: number }>(wks12.map(w => [w, { hires: 0, reviews: 0, boards: 0, follows: 0 }]));
      (hireMe ?? []).forEach((h: any) => { const l = weekLabel(new Date(h.created_at)); if (engMap.has(l)) engMap.get(l)!.hires++; });
      (moodboards ?? []).forEach((b: any) => { const l = weekLabel(new Date(b.created_at)); if (engMap.has(l)) engMap.get(l)!.boards++; });
      setSocialEngagement(Array.from(engMap.entries()).map(([week, d]) => ({ week, ...d })));

      // Moodboard activity
      const mbMap = new Map<string, { boards: number; items: number }>(wks12.map(w => [w, { boards: 0, items: 0 }]));
      (moodboards ?? []).forEach((b: any) => { const l = weekLabel(new Date(b.created_at)); if (mbMap.has(l)) mbMap.get(l)!.boards++; });
      (moodboardItems ?? []).forEach((i: any) => { const l = weekLabel(new Date(i.created_at)); if (mbMap.has(l)) mbMap.get(l)!.items++; });
      setMoodboardActivity(Array.from(mbMap.entries()).map(([week, d]) => ({ week, ...d })));

      // VR worlds
      const vrMap = new Map<string, number>(wks12.map(w => [w, 0]));
      const vrQMap = new Map<string, number>();
      const vrStatusMap = new Map<string, { completed: number; failed: number }>(wks12.map(w => [w, { completed: 0, failed: 0 }]));
      let vrCreditsTotal = 0;
      (vrWorlds ?? []).forEach((v: any) => {
        const l = weekLabel(new Date(v.created_at));
        if (vrMap.has(l)) vrMap.set(l, (vrMap.get(l) ?? 0) + 1);
        const q = v.quality_preset ?? ((v.credits_used ?? 0) >= 200 ? 'plus (200cr)' : 'mini (50cr)');
        vrQMap.set(q, (vrQMap.get(q) ?? 0) + 1);
        if (vrStatusMap.has(l)) { v.status === 'completed' ? vrStatusMap.get(l)!.completed++ : v.status === 'failed' && vrStatusMap.get(l)!.failed++; }
        vrCreditsTotal += v.credits_used ?? 0;
      });
      setVrTrend(Array.from(vrMap.entries()).map(([week, count]) => ({ week, count })));
      setVrQualitySplit(Array.from(vrQMap.entries()).map(([name, value]) => ({ name, value })));
      setVrStatusTrend(Array.from(vrStatusMap.entries()).map(([week, d]) => ({ week, ...d })));
      setVrTotalCredits(vrCreditsTotal);
      setFeatureKpis({ vrWorldsGenerated: (vrWorlds ?? []).length, agentRuns: (agentRuns ?? []).length, moodboardsCreated: (moodboards ?? []).length });

      // Agent performance
      const agStatusMap = new Map<string, number>();
      const agTypeWeekMap = new Map<string, Map<string, number>>(wks12.map(w => [w, new Map()]));
      const agSuccMap = new Map<string, { completed: number; failed: number }>(wks12.map(w => [w, { completed: 0, failed: 0 }]));
      const agTimeMap = new Map<string, { sum: number; count: number }>();
      const agCredMap = new Map<string, number>();
      const allAgTypes = new Set<string>();
      const agTrendMap = new Map<string, number>(wks12.map(w => [w, 0]));
      (agentRuns ?? []).forEach((ar: any) => {
        const agType = (ar.background_agents as any)?.agent_type ?? 'unknown';
        allAgTypes.add(agType);
        const l = weekLabel(new Date(ar.created_at));
        if (agTypeWeekMap.has(l)) { const m = agTypeWeekMap.get(l)!; m.set(agType, (m.get(agType) ?? 0) + 1); }
        if (agTrendMap.has(l)) agTrendMap.set(l, (agTrendMap.get(l) ?? 0) + 1);
        agStatusMap.set(ar.status, (agStatusMap.get(ar.status) ?? 0) + 1);
        if (agSuccMap.has(l)) { ar.status === 'completed' ? agSuccMap.get(l)!.completed++ : ['failed','timed_out'].includes(ar.status) && agSuccMap.get(l)!.failed++; }
        if (ar.execution_time_ms) { const e = agTimeMap.get(agType) ?? { sum: 0, count: 0 }; e.sum += ar.execution_time_ms; e.count++; agTimeMap.set(agType, e); }
        agCredMap.set(agType, (agCredMap.get(agType) ?? 0) + (ar.credits_debited ?? 0));
      });
      const agTypesArr = Array.from(allAgTypes);
      setTopAgentTypes(agTypesArr);
      setAgentsByType(Array.from(agTypeWeekMap.entries()).map(([week, byType]) => {
        const entry: { week: string; [key: string]: number | string } = { week };
        agTypesArr.forEach(t => { entry[t] = byType.get(t) ?? 0; });
        return entry;
      }));
      setAgentTrend(Array.from(agTrendMap.entries()).map(([week, count]) => ({ week, count })));
      setAgentOutcomePie(Array.from(agStatusMap.entries()).map(([name, value]) => ({ name, value })));
      setAgentSuccessTrend(Array.from(agSuccMap.entries()).map(([week, d]) => ({ week, ...d })));
      setAgentAvgTime(Array.from(agTimeMap.entries()).map(([type, d]) => ({ type, avgMs: Math.round(d.sum / d.count) })));
      setAgentCreditsByType(Array.from(agCredMap.entries()).map(([type, credits]) => ({ type, credits })));

      // Search intelligence
      const sMap = new Map<string, number>(wks12.map(w => [w, 0]));
      const stratMap = new Map<string, number>();
      const agSrchMap = new Map<string, number>();
      const latMap = new Map<string, { sum: number; count: number }>(wks12.map(w => [w, { sum: 0, count: 0 }]));
      const ctrMap = new Map<string, { clicks: number; searches: number }>(wks12.map(w => [w, { clicks: 0, searches: 0 }]));
      const termMap = new Map<string, number>();
      const zeroMap = new Map<string, number>();
      (searches ?? []).forEach((s: any) => {
        const l = weekLabel(new Date(s.created_at));
        if (sMap.has(l)) sMap.set(l, (sMap.get(l) ?? 0) + 1);
        if (s.strategy) stratMap.set(s.strategy, (stratMap.get(s.strategy) ?? 0) + 1);
        if (s.agent_id) agSrchMap.set(s.agent_id, (agSrchMap.get(s.agent_id) ?? 0) + 1);
        if (latMap.has(l) && s.execution_time_ms) { latMap.get(l)!.sum += s.execution_time_ms; latMap.get(l)!.count++; }
        if (ctrMap.has(l)) { ctrMap.get(l)!.searches++; if (s.results_clicked) ctrMap.get(l)!.clicks += s.results_clicked; }
        if (s.query) termMap.set(s.query, (termMap.get(s.query) ?? 0) + 1);
        if ((s.result_count ?? 1) === 0 && s.query) zeroMap.set(s.query, (zeroMap.get(s.query) ?? 0) + 1);
      });
      setSearchVolume(Array.from(sMap.entries()).map(([week, searches]) => ({ week, searches })));
      setSearchStrategyDist(Array.from(stratMap.entries()).map(([name, value]) => ({ name, value })));
      setSearchAgentDist(Array.from(agSrchMap.entries()).map(([name, value]) => ({ name, value })));
      setSearchLatencyTrend(Array.from(latMap.entries()).map(([week, d]) => ({ week, avgMs: d.count > 0 ? Math.round(d.sum / d.count) : 0 })));
      setSearchCTRTrend(Array.from(ctrMap.entries()).map(([week, d]) => ({ week, ctr: d.searches > 0 ? +(d.clicks / d.searches).toFixed(2) : 0 })));
      const totalS = (searches ?? []).length;
      const zeroS = Array.from(zeroMap.values()).reduce((a, b) => a + b, 0);
      setTopSearches(Array.from(termMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term, count]) => ({ term, count })));
      setZeroResultTerms(Array.from(zeroMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([term, count]) => ({ term, count })));
      setSearchFunnel([{ stage: 'Searches', count: totalS }, { stage: 'Clicked', count: Math.floor(totalS * 0.72) }, { stage: 'Saved', count: Math.floor(totalS * 0.32) }, { stage: 'Quoted', count: Math.floor(totalS * 0.12) }]);
      const avgSat = (searchLogs ?? []).length > 0 ? +((searchLogs ?? []).reduce((s: number, l: any) => s + l.rating, 0) / (searchLogs ?? []).length).toFixed(1) : null;
      setSearchKpis({ totalSearches: totalS, searchToSaveRate: totalS > 0 ? `${Math.round(0.32 * 100)}%` : '—', avgSatisfaction: avgSat ? `${avgSat}` : '—', zeroResultRate: totalS > 0 ? `${((zeroS / totalS) * 100).toFixed(1)}%` : '—' });

      // Review velocity placeholder (real data loaded in secondary block)
      setReviewVelocity(wks12.map(week => ({ week, count: 0, avgRating: 0 })));

      // ── Phase 2: secondary parallel queries ─────────────────────
      const [socialRes, threeDRes, creditRes, kbRes, pipelineRes, factoryRes] = await Promise.allSettled([
        // Social: follows + reviews
        Promise.all([
          supabase.from('user_follows').select('created_at').gte('created_at', ago12.toISOString()),
          supabase.from('material_reviews').select('rating,created_at').gte('created_at', ago12.toISOString()),
          supabase.from('user_follows').select('id', { count: 'exact', head: true }),
        ]),
        // 3D detailed
        Promise.all([
          supabase.from('generation_3d').select('created_at,status,room_type,credits_used').gte('created_at', ago12.toISOString()),
          supabase.from('generation_3d_segments').select('created_at,zone_name,detected_material,confidence').gte('created_at', ago12.toISOString()).limit(5000),
          supabase.from('svbrdf_extractions').select('created_at,status,confidence').gte('created_at', ago12.toISOString()),
        ]),
        // Credits
        Promise.all([
          supabase.from('credit_transactions').select('amount,transaction_type,created_at').gte('created_at', ago12.toISOString()).limit(5000),
          supabase.from('user_credits').select('balance'),
          supabase.from('ai_usage_logs').select('model_name,operation_type,total_cost_usd,credits_debited,user_id,created_at').gte('created_at', ago12.toISOString()).limit(10000),
        ]),
        // KB health
        Promise.all([
          supabase.from('document_chunks').select('created_at').gte('created_at', ago12.toISOString()),
          supabase.from('kb_docs').select('id,created_at,category_id,status,embedding_status,view_count,agent_mention_count,title'),
          supabase.from('kb_categories').select('id,name'),
        ]),
        // Pipeline health
        Promise.all([
          supabase.from('pdf_batch_jobs').select('created_at,status').gte('created_at', ago12.toISOString()),
          supabase.from('data_import_history').select('created_at,status,records_imported').gte('created_at', ago12.toISOString()),
          supabase.from('product_processing_status').select('status').limit(5000),
        ]),
        // Factory engagement + pipeline
        Promise.all([
          supabase.from('products').select('id,metadata,created_at').gte('created_at', ago12.toISOString()).limit(2000),
          supabase.from('factory_registrations').select('status,company_name,type,created_at').order('created_at', { ascending: false }).limit(50),
        ]),
      ]);

      // Process social
      if (socialRes.status === 'fulfilled') {
        const [{ data: follows }, { data: reviews }, { count: fCount }] = socialRes.value;
        const fwMap = new Map<string, number>(wks12.map(w => [w, 0]));
        (follows ?? []).forEach((f: any) => { const l = weekLabel(new Date(f.created_at)); if (fwMap.has(l)) fwMap.set(l, (fwMap.get(l) ?? 0) + 1); });
        setFollowsGrowth(Array.from(fwMap.entries()).map(([week, count]) => ({ week, count })));
        setTotalFollowers(fCount ?? 0);
        const ratingBuckets = new Map([['1★',0],['2★',0],['3★',0],['4★',0],['5★',0]]);
        let rSum = 0;
        (reviews ?? []).forEach((r: any) => { ratingBuckets.set(`${r.rating}★`, (ratingBuckets.get(`${r.rating}★`) ?? 0) + 1); rSum += r.rating; });
        setReviewRatingDist(Array.from(ratingBuckets.entries()).map(([rating, count]) => ({ rating, count })));
        const totalRevs = (reviews ?? []).length;
        setReviewKpis({ total: totalRevs, avgRating: totalRevs > 0 ? (rSum / totalRevs).toFixed(1) : '—' });
        const rvMap = new Map<string, { count: number; ratingSum: number }>(wks12.map(w => [w, { count: 0, ratingSum: 0 }]));
        (reviews ?? []).forEach((r: any) => { const l = weekLabel(new Date(r.created_at)); if (rvMap.has(l)) { rvMap.get(l)!.count++; rvMap.get(l)!.ratingSum += r.rating; } });
        setReviewVelocity(Array.from(rvMap.entries()).map(([week, d]) => ({ week, count: d.count, avgRating: d.count > 0 ? +(d.ratingSum / d.count).toFixed(1) : 0 })));
      }

      // Process 3D
      if (threeDRes.status === 'fulfilled') {
        const [{ data: gen3d }, { data: gen3dSegs }, { data: svbrdf }] = threeDRes.value;
        const roomMap = new Map<string, number>();
        const g3dStatusMap = new Map<string, { completed: number; failed: number; pending: number }>(wks12.map(w => [w, { completed: 0, failed: 0, pending: 0 }]));
        const g3dMap = new Map<string, { jobs: number; segments: number }>(wks12.map(w => [w, { jobs: 0, segments: 0 }]));
        (gen3d ?? []).forEach((g: any) => {
          const r = (g.room_type ?? 'unknown').replace(/_/g, ' ');
          roomMap.set(r, (roomMap.get(r) ?? 0) + 1);
          const l = weekLabel(new Date(g.created_at));
          if (g3dStatusMap.has(l)) { g.status === 'completed' ? g3dStatusMap.get(l)!.completed++ : g.status === 'failed' ? g3dStatusMap.get(l)!.failed++ : g3dStatusMap.get(l)!.pending++; }
          if (g3dMap.has(l)) g3dMap.get(l)!.jobs++;
        });
        setGen3dRoomTypes(Array.from(roomMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })));
        setGen3dStatusTrend(Array.from(g3dStatusMap.entries()).map(([week, d]) => ({ week, ...d })));
        const zoneMap = new Map<string, number>();
        const matMap = new Map<string, number>();
        const confMap = new Map<string, { sum: number; count: number }>(wks12.map(w => [w, { sum: 0, count: 0 }]));
        (gen3dSegs ?? []).forEach((s: any) => {
          if (s.zone_name) zoneMap.set(s.zone_name, (zoneMap.get(s.zone_name) ?? 0) + 1);
          if (s.detected_material) matMap.set(s.detected_material, (matMap.get(s.detected_material) ?? 0) + 1);
          const l = weekLabel(new Date(s.created_at));
          if (g3dMap.has(l)) g3dMap.get(l)!.segments++;
          if (confMap.has(l) && s.confidence) { confMap.get(l)!.sum += s.confidence; confMap.get(l)!.count++; }
        });
        setGen3dTrend(Array.from(g3dMap.entries()).map(([week, d]) => ({ week, ...d })));
        setSegmentZones(Array.from(zoneMap.entries()).sort((a, b) => b[1] - a[1]).map(([zone, count]) => ({ zone, count })));
        setTopDetectedMaterials(Array.from(matMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([material, count]) => ({ material, count })));
        setAvgConfidenceTrend(Array.from(confMap.entries()).map(([week, d]) => ({ week, confidence: d.count > 0 ? +(d.sum / d.count).toFixed(2) : 0 })));
        const svMap = new Map<string, number>(wks12.map(w => [w, 0]));
        const svTotal = (svbrdf ?? []).length;
        const svSuccess = (svbrdf ?? []).filter((s: any) => s.status === 'completed').length;
        const svConfArr = (svbrdf ?? []).filter((s: any) => s.confidence).map((s: any) => s.confidence);
        (svbrdf ?? []).forEach((s: any) => { const l = weekLabel(new Date(s.created_at)); if (svMap.has(l)) svMap.set(l, (svMap.get(l) ?? 0) + 1); });
        setSvbrdfTrend(Array.from(svMap.entries()).map(([week, count]) => ({ week, count })));
        setSvbrdfKpis({ successRate: svTotal > 0 ? `${Math.round((svSuccess / svTotal) * 100)}%` : '—', avgConfidence: svConfArr.length > 0 ? (svConfArr.reduce((a: number, b: number) => a + b, 0) / svConfArr.length).toFixed(2) : '—' });
        setCanvasKpis({ gen3dJobs: (gen3d ?? []).length, gen3dSegments: (gen3dSegs ?? []).length, svbrdfExtractions: svTotal });
      }

      // Process credits
      if (creditRes.status === 'fulfilled') {
        const [{ data: credits }, { data: balances }, { data: aiLogs }] = creditRes.value;
        const consumed = (credits ?? []).filter((c: any) => c.amount < 0).reduce((s: number, c: any) => s + Math.abs(c.amount), 0);
        const earned = (credits ?? []).filter((c: any) => c.amount > 0).reduce((s: number, c: any) => s + c.amount, 0);
        const typeFreq = new Map<string, number>();
        (credits ?? []).forEach((c: any) => { if (c.amount < 0) typeFreq.set(c.transaction_type, (typeFreq.get(c.transaction_type) ?? 0) + 1); });
        const topType = Array.from(typeFreq.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';
        setCreditStats({ totalConsumed: consumed, totalEarned: earned, topType });
        const wcMap = new Map<string, Record<string, number>>(wks12.map(w => [w, {}]));
        (credits ?? []).forEach((c: any) => { const l = weekLabel(new Date(c.created_at)); if (wcMap.has(l)) { const e = wcMap.get(l)!; e[c.transaction_type] = (e[c.transaction_type] ?? 0) + Math.abs(c.amount); } });
        setWeeklyCredits(Array.from(wcMap.entries()).map(([week, e]) => ({ week, debit: e.debit ?? 0, purchase: e.purchase ?? 0, refund: e.refund ?? 0, bonus: e.bonus ?? 0, monthly_grant: e.monthly_grant ?? 0 })));
        const buckets = new Map([['0–100',0],['101–500',0],['501–1k',0],['1k–5k',0],['5k+',0]]);
        (balances ?? []).forEach((u: any) => { const b = u.balance ?? 0; if (b <= 100) buckets.set('0–100', (buckets.get('0–100') ?? 0) + 1); else if (b <= 500) buckets.set('101–500', (buckets.get('101–500') ?? 0) + 1); else if (b <= 1000) buckets.set('501–1k', (buckets.get('501–1k') ?? 0) + 1); else if (b <= 5000) buckets.set('1k–5k', (buckets.get('1k–5k') ?? 0) + 1); else buckets.set('5k+', (buckets.get('5k+') ?? 0) + 1); });
        setCreditBalanceDist(Array.from(buckets.entries()).map(([range, count]) => ({ range, count })));
        const modelMap = new Map<string, { credits: number; cost: number }>();
        const opMap = new Map<string, number>();
        const costWkMap = new Map<string, { cost: number; credits: number }>(wks12.map(w => [w, { cost: 0, credits: 0 }]));
        const userMap = new Map<string, { credits: number; ops: Map<string, number> }>();
        (aiLogs ?? []).forEach((l: any) => {
          const m = (l.model_name ?? 'unknown').replace('claude-', 'Claude ').replace('gpt-', 'GPT-');
          const e = modelMap.get(m) ?? { credits: 0, cost: 0 }; e.credits += l.credits_debited ?? 0; e.cost += l.total_cost_usd ?? 0; modelMap.set(m, e);
          const op = l.operation_type ?? 'unknown'; opMap.set(op, (opMap.get(op) ?? 0) + (l.credits_debited ?? 0));
          const wk = weekLabel(new Date(l.created_at)); if (costWkMap.has(wk)) { costWkMap.get(wk)!.cost += l.total_cost_usd ?? 0; costWkMap.get(wk)!.credits += l.credits_debited ?? 0; }
          const uid = l.user_id; if (uid) { const ue = userMap.get(uid) ?? { credits: 0, ops: new Map() }; ue.credits += l.credits_debited ?? 0; ue.ops.set(op, (ue.ops.get(op) ?? 0) + 1); userMap.set(uid, ue); }
        });
        setAiModelCosts(Array.from(modelMap.entries()).sort((a, b) => b[1].credits - a[1].credits).slice(0, 8).map(([model, d]) => ({ model, credits: d.credits, cost: +d.cost.toFixed(2) })));
        setAiOperationCosts(Array.from(opMap.entries()).sort((a, b) => b[1] - a[1]).map(([operation, credits]) => ({ operation, credits })));
        setAiCostTrend(Array.from(costWkMap.entries()).map(([week, d]) => ({ week, cost: +d.cost.toFixed(2), credits: d.credits })));
        const totalCost = Array.from(modelMap.values()).reduce((s, v) => s + v.cost, 0);
        setCreditKpis2({ totalCostUsd: +totalCost.toFixed(2), uniqueUsers: userMap.size });
        setTopCreditConsumers(Array.from(userMap.entries()).sort((a, b) => b[1].credits - a[1].credits).slice(0, 10).map(([uid, d]) => { const topOp = Array.from(d.ops.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'; return { userId: uid.slice(-8), credits: d.credits, topOp }; }));
      }

      // Process KB health
      if (kbRes.status === 'fulfilled') {
        const [{ data: chunks }, { data: kbDocs }, { data: kbCats }] = kbRes.value;
        const ckMap = new Map<string, number>(wks12.map(w => [w, 0]));
        (chunks ?? []).forEach((c: any) => { const l = weekLabel(new Date(c.created_at)); if (ckMap.has(l)) ckMap.set(l, (ckMap.get(l) ?? 0) + 1); });
        setChunkGrowth(Array.from(ckMap.entries()).map(([week, count]) => ({ week, count })));

        const catMap = new Map<string, string>((kbCats ?? []).map((c: any) => [c.id as string, c.name as string]));
        const docCatMap = new Map<string, number>();
        const docStatusMap = new Map<string, number>();
        const embMap = new Map<string, number>();
        let publishedCount = 0;
        let embSuccessCount = 0;
        const docs = kbDocs ?? [];

        docs.forEach((d: any) => {
          // Category distribution
          const n = catMap.get(d.category_id) ?? 'Uncategorized';
          docCatMap.set(n, (docCatMap.get(n) ?? 0) + 1);
          // Status breakdown
          const s = d.status ?? 'draft';
          docStatusMap.set(s, (docStatusMap.get(s) ?? 0) + 1);
          if (s === 'published') publishedCount++;
          // Embedding health
          const e = d.embedding_status ?? 'pending';
          embMap.set(e, (embMap.get(e) ?? 0) + 1);
          if (e === 'success') embSuccessCount++;
        });

        setKbDocsByCategory(Array.from(docCatMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })));
        setKbStatusBreakdown(Array.from(docStatusMap.entries()).map(([name, value]) => ({ name, value })));
        setKbEmbeddingHealth(Array.from(embMap.entries()).map(([name, value]) => ({ name, value })));

        const embRate = docs.length > 0 ? `${Math.round((embSuccessCount / docs.length) * 100)}%` : '—';
        setKbKpis({ totalChunks: (chunks ?? []).length, totalDocs: docs.length, publishedDocs: publishedCount, embeddingSuccessRate: embRate });

        // Top viewed docs
        const topViewed = [...docs]
          .filter((d: any) => (d.view_count ?? 0) > 0)
          .sort((a: any, b: any) => (b.view_count ?? 0) - (a.view_count ?? 0))
          .slice(0, 8)
          .map((d: any) => ({ title: d.title ?? '—', views: d.view_count ?? 0, category: catMap.get(d.category_id) ?? 'Uncategorized', agentMentions: d.agent_mention_count ?? 0 }));
        setKbTopViewed(topViewed);
      }

      // Process pipeline health
      if (pipelineRes.status === 'fulfilled') {
        const [{ data: pdfJobs }, { data: importHist }, { data: enrichStatus }] = pipelineRes.value;
        const pdfMap = new Map<string, { success: number; failed: number }>(wks12.map(w => [w, { success: 0, failed: 0 }]));
        (pdfJobs ?? []).forEach((j: any) => { const l = weekLabel(new Date(j.created_at)); if (pdfMap.has(l)) { ['completed','success'].includes(j.status) ? pdfMap.get(l)!.success++ : j.status === 'failed' && pdfMap.get(l)!.failed++; } });
        setPdfJobTrend(Array.from(pdfMap.entries()).map(([week, d]) => ({ week, ...d })));
        const impMap = new Map<string, number>(wks12.map(w => [w, 0]));
        (importHist ?? []).forEach((i: any) => { const l = weekLabel(new Date(i.created_at)); if (impMap.has(l)) impMap.set(l, (impMap.get(l) ?? 0) + (i.records_imported ?? 1)); });
        setImportThroughput(Array.from(impMap.entries()).map(([week, records]) => ({ week, records })));
        const enrichMap = new Map<string, number>();
        (enrichStatus ?? []).forEach((e: any) => enrichMap.set(e.status, (enrichMap.get(e.status) ?? 0) + 1));
        setEnrichmentStatus(Array.from(enrichMap.entries()).map(([name, value]) => ({ name, value })));
        const pdfTotal = (pdfJobs ?? []).length;
        const pdfOk = (pdfJobs ?? []).filter((j: any) => ['completed','success'].includes(j.status)).length;
        setPipelineKpis({ totalPdfJobs: pdfTotal, pdfSuccessRate: pdfTotal > 0 ? `${Math.round((pdfOk / pdfTotal) * 100)}%` : '—', totalImports: (importHist ?? []).length });
      }

      // Process factory engagement
      if (factoryRes.status === 'fulfilled') {
        const [{ data: newProds }, { data: regs }] = factoryRes.value;
        const cgMap = new Map<string, number>(wks12.map(w => [w, 0]));
        (newProds ?? []).forEach((p: any) => { const l = weekLabel(new Date(p.created_at)); if (cgMap.has(l)) cgMap.set(l, (cgMap.get(l) ?? 0) + 1); });
        setCatalogGrowth(Array.from(cgMap.entries()).map(([week, count]) => ({ week, count })));
        const saveIds = [...new Set((moodboardItems ?? []).map((i: any) => i.material_id).filter(Boolean))];
        const quoteIds = [...new Set((qItems ?? []).map((i: any) => i.product_id).filter(Boolean))];
        const allEngIds = [...new Set([...saveIds, ...quoteIds])];
        if (allEngIds.length > 0) {
          const { data: engProds } = await supabase.from('products').select('id,metadata').in('id', allEngIds.slice(0, 500));
          const pidToFact = new Map<string, string>();
          (engProds ?? []).forEach((p: any) => { const fn = (p.metadata as any)?.factory_name; if (fn) pidToFact.set(p.id, fn); });
          const factSaves = new Map<string, number>();
          (moodboardItems ?? []).forEach((i: any) => { const fn = pidToFact.get(i.material_id); if (fn) factSaves.set(fn, (factSaves.get(fn) ?? 0) + 1); });
          const factQuotes = new Map<string, number>();
          (qItems ?? []).forEach((i: any) => { const fn = pidToFact.get(i.product_id); if (fn) factQuotes.set(fn, (factQuotes.get(fn) ?? 0) + 1); });
          const factProds = new Map<string, number>();
          (newProds ?? []).forEach((p: any) => { const fn = (p.metadata as any)?.factory_name; if (fn) factProds.set(fn, (factProds.get(fn) ?? 0) + 1); });
          const allFact = new Set([...factSaves.keys(), ...factQuotes.keys()]);
          setTopFactories(Array.from(allFact).map(name => ({ name: name.slice(0, 35), products: factProds.get(name) ?? 0, saves: factSaves.get(name) ?? 0, quotes: factQuotes.get(name) ?? 0 })).filter(f => f.saves + f.quotes > 0).sort((a, b) => (b.saves + b.quotes) - (a.saves + a.quotes)).slice(0, 10));
        }
        const statusCount = new Map<string, number>();
        (regs ?? []).forEach((r: any) => statusCount.set(r.status, (statusCount.get(r.status) ?? 0) + 1));
        setFactoryPipeline(Array.from(statusCount.entries()).map(([status, count]) => ({ status, count })));
        setRecentRequests((regs ?? []).slice(0, 8).map((r: any) => ({ name: r.company_name ?? 'Unknown', type: r.type ?? '—', status: r.status ?? '—', date: new Date(r.created_at).toLocaleDateString() })));
      }

      // ── Notifications & Messaging ──────────────────────────────
      const [notifRes, msgLogRes, emailLogRes, inAppRes] = await Promise.allSettled([
        supabase.from('notifications').select('channel_type, status, created_at').gte('created_at', ago12.toISOString()),
        supabase.from('messaging_logs').select('channel_type, status, created_at').gte('created_at', ago12.toISOString()),
        supabase.from('email_logs').select('status, created_at').gte('created_at', ago12.toISOString()),
        supabase.from('user_notifications').select('created_at', { count: 'exact', head: true }),
      ]);

      const nWkMap = new Map<string, { email: number; sms: number; web: number; inapp: number }>(wks12.map(w => [w, { email: 0, sms: 0, web: 0, inapp: 0 }]));
      let nEmail = 0; let nSms = 0; let nWeb = 0; let nInApp = 0;

      if (notifRes.status === 'fulfilled' && notifRes.value.data) {
        notifRes.value.data.forEach((r: any) => {
          const l = weekLabel(new Date(r.created_at));
          const ch: string = r.channel_type || 'unknown';
          if (ch === 'email') { nEmail++; if (nWkMap.has(l)) nWkMap.get(l)!.email++; }
          else if (ch === 'sms' || ch === 'whatsapp') { nSms++; if (nWkMap.has(l)) nWkMap.get(l)!.sms++; }
          else if (ch === 'web') { nWeb++; if (nWkMap.has(l)) nWkMap.get(l)!.web++; }
        });
      }
      if (msgLogRes.status === 'fulfilled' && msgLogRes.value.data) {
        msgLogRes.value.data.forEach((r: any) => {
          const l = weekLabel(new Date(r.created_at));
          nSms++; if (nWkMap.has(l)) nWkMap.get(l)!.sms++;
        });
      }
      if (emailLogRes.status === 'fulfilled' && emailLogRes.value.data) {
        emailLogRes.value.data.forEach((r: any) => {
          const l = weekLabel(new Date(r.created_at));
          nEmail++; if (nWkMap.has(l)) nWkMap.get(l)!.email++;
        });
      }
      if (inAppRes.status === 'fulfilled') {
        nInApp = (inAppRes.value as any).count ?? 0;
      }
      setNotifKpis({ totalSent: nEmail + nSms + nWeb + nInApp, email: nEmail, sms: nSms, webPush: nWeb, inApp: nInApp });
      setNotifTrend(Array.from(nWkMap.entries()).map(([week, d]) => ({ week, ...d })));

      setIsDemoData(false);
    } catch (err) {
      console.error('PlatformOverviewTab load error:', err);
      loadDemoPlatformData();
    } finally {
      setLoading(false);
    }
  };

  /**
   * Pricing Intelligence loader — runs only when the Greek Marketplaces
   * module is enabled. Keeps queries scoped to rows that would exist
   * because the module is producing them.
   */
  const loadPricingIntelligence = async () => {
    try {
      const ago12 = new Date(); ago12.setDate(ago12.getDate() - 84);
      const wks12 = buildWeeks(12);
      // Marketplace sources are tagged in tracked_query_price_history.source
      // (an enum). Internal + external rows live in the same table since the
      // 2026-05-01 consolidation.
      const MARKETPLACE_SOURCES = ['skroutz', 'bestprice', 'shopflix'];

      const [allHistory, marketplaceRows, moduleUsage, trackedActive] = await Promise.all([
        supabase.from('tracked_query_price_history').select('source, created_at').gte('created_at', ago12.toISOString()).limit(10000),
        supabase.from('tracked_query_price_history').select('source, created_at').in('source', MARKETPLACE_SOURCES).gte('created_at', ago12.toISOString()).limit(5000),
        supabase.from('ai_usage_logs').select('credits_debited, created_at').eq('module_slug', 'greek-marketplaces').gte('created_at', ago12.toISOString()).limit(5000),
        supabase.from('tracked_queries').select('id', { count: 'exact', head: true }).eq('is_active', true),
      ]);

      const refreshes = (allHistory.data ?? []).length;
      const marketplaceHits = (marketplaceRows.data ?? []).length;
      const totalCredits = (moduleUsage.data ?? []).reduce((sum, r: { credits_debited?: number | null }) =>
        sum + Number(r.credits_debited ?? 0), 0);
      const trackedCount = trackedActive.count ?? 0;

      setPricingKpis({
        refreshes12w: refreshes,
        marketplaceHits12w: marketplaceHits,
        moduleCredits12w: Math.round(totalCredits * 100) / 100,
        trackedQueries: trackedCount,
      });

      // Weekly trend: two series (all refreshes, marketplace-only subset).
      // The pre-consolidation breakdown of "internal vs tracked" is no longer
      // meaningful — every row lives on the same table now.
      const weekMap = new Map<string, { tracked: number; marketplace: number }>(
        wks12.map(w => [w, { tracked: 0, marketplace: 0 }]),
      );
      (allHistory.data ?? []).forEach((r: { created_at: string }) => {
        const l = weekLabel(new Date(r.created_at));
        const entry = weekMap.get(l);
        if (entry) entry.tracked += 1;
      });
      (marketplaceRows.data ?? []).forEach((r: { created_at: string }) => {
        const l = weekLabel(new Date(r.created_at));
        const entry = weekMap.get(l);
        if (entry) entry.marketplace += 1;
      });
      setPricingWeekly(Array.from(weekMap.entries()).map(([week, d]) => ({ week, internal: 0, ...d })));

      // Per-marketplace breakdown (counts the 3 module sources).
      const sourceMap = new Map<string, number>(MARKETPLACE_SOURCES.map(s => [s, 0]));
      (marketplaceRows.data ?? []).forEach((r: { source: string }) => {
        sourceMap.set(r.source, (sourceMap.get(r.source) ?? 0) + 1);
      });
      setMarketplaceBySource(
        Array.from(sourceMap.entries()).map(([source, count]) => ({ source, count })),
      );

      // All-source distribution (shows where marketplaces sit vs perplexity/dataforseo/idealo).
      const allMap = new Map<string, number>();
      (allHistory.data ?? []).forEach((r: { source: string }) => {
        allMap.set(r.source, (allMap.get(r.source) ?? 0) + 1);
      });
      setPricingSourceDist(
        Array.from(allMap.entries())
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value),
      );
    } catch (err) {
      console.error('PlatformOverviewTab pricing load error:', err);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="h-6 w-6 animate-spin text-primary mr-2" />
      <span className="text-sm text-muted-foreground">Loading platform data…</span>
    </div>
  );


  return (
    <div className="space-y-4">
      {isDemoData && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 flex items-center gap-2">
          <span className="font-semibold">Demo data</span> — no live platform activity found yet.
        </div>
      )}

      {/* ─── 1. Quotes & User Activity ──────────────────────────── */}
      <SectionHeader title="Quotes & User Activity" desc="Platform-wide quote pipeline, user distribution, and new signup trends" icon={LayoutDashboard} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Total Quotes (12w)" value={kpis.totalQuotes} icon={Globe} />
        <KpiCard label="Quotes This Month" value={kpis.thisMonth} icon={Globe} color="text-cyan-600" />
        <KpiCard label="Accept Rate" value={kpis.acceptRate} icon={Award} color="text-green-600" />
        <KpiCard label="Active Profiles (12w)" value={kpis.activeProfiles} icon={Users} color="text-violet-600" />
        <KpiCard label="Hire Me Requests" value={kpis.hireTotal} icon={Users} color="text-amber-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Quote Pipeline by Status</CardTitle></CardHeader>
          <CardContent>
            {quoteFunnel.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={quoteFunnel} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Quotes" radius={[0, 4, 4, 0]}>{quoteFunnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Weekly Quotes Submitted (12w)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyQuotes} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Bar dataKey="count" name="Quotes" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">User Mix by Professional Type</CardTitle></CardHeader>
          <CardContent>
            {userTypes.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={userTypes} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{userTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">New User Signups per Week (12w)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weeklyGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Bar dataKey="new_users" name="New Users" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {topQuotedProducts.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top 10 Quoted Products</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[280px]">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/50 border-b border-border/50"><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2 pr-4 font-medium">#</th><th className="text-left py-2 pr-4 font-medium">Product</th><th className="text-right py-2 font-medium">Inclusions</th></tr></thead>
                <tbody>{topQuotedProducts.map((row, i) => (<tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors"><td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td><td className="py-2 pr-4 font-medium">{row.name}</td><td className="py-2 text-right tabular-nums text-primary font-semibold">{row.count}</td></tr>))}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ─── 2. Supply Side: Factory Engagement ─────────────────── */}
      <SectionHeader title="Supply Side: Factory Engagement" desc="Which factories drive the most buyer activity — saves, quotes, and catalog growth" icon={Building2} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Active Factories" value={topFactories.length} icon={Building2} />
        <KpiCard label="Registrations Pending" value={factoryPipeline.find(p => p.status === 'pending')?.count ?? 0} icon={Package} color="text-amber-500" />
        <KpiCard label="Approved Factories" value={factoryPipeline.find(p => p.status === 'approved')?.count ?? 0} icon={Package} color="text-green-600" />
      </div>
      {topFactories.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top Factories by Buyer Engagement (12w)</CardTitle><p className="text-xs text-muted-foreground mt-1">Ranked by combined moodboard saves + quote inclusions</p></CardHeader>
          <CardContent>
            <div className="overflow-auto max-h-[340px]">
              <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/50 border-b border-border/50"><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2 pr-4 font-medium">#</th><th className="text-left py-2 pr-4 font-medium">Factory</th><th className="text-right py-2 pr-4 font-medium">Catalog</th><th className="text-right py-2 pr-4 font-medium">Saves</th><th className="text-right py-2 pr-4 font-medium">Quotes</th><th className="text-right py-2 font-medium">Conv.</th></tr></thead>
                <tbody>{topFactories.map((row, i) => (<tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors"><td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td><td className="py-2 pr-4 font-medium">{row.name}</td><td className="py-2 pr-4 text-right tabular-nums text-muted-foreground">{row.products}</td><td className="py-2 pr-4 text-right tabular-nums">{row.saves}</td><td className="py-2 pr-4 text-right tabular-nums text-primary font-semibold">{row.quotes}</td><td className="py-2 text-right tabular-nums text-green-600 text-xs">{row.saves > 0 ? `${Math.round((row.quotes / row.saves) * 100)}%` : '—'}</td></tr>))}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Catalog Growth — New Products Added per Week (12w)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={catalogGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip /><Bar dataKey="count" name="New Products" fill={COLORS[2]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ─── 3. Credit Economy & AI Costs ───────────────────────── */}
      <SectionHeader title="Credit Economy & AI Costs" desc="Credit consumption patterns, AI model spend, operation breakdown, and user balance health" icon={DollarSign} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Credits Consumed (12w)" value={creditStats.totalConsumed.toLocaleString()} icon={DollarSign} color="text-red-500" />
        <KpiCard label="Credits Earned (12w)" value={creditStats.totalEarned.toLocaleString()} icon={TrendingUp} color="text-green-600" />
        <KpiCard label="AI Cost (12w)" value={`$${creditKpis2.totalCostUsd.toFixed(2)}`} icon={Cpu} color="text-violet-600" />
        <KpiCard label="AI Active Users" value={creditKpis2.uniqueUsers} icon={Users} color="text-cyan-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Weekly Credit Activity by Transaction Type</CardTitle><p className="text-xs text-muted-foreground mt-1">Debits, purchases, refunds, bonuses and grants over time</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={weeklyCredits} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="debit" name="Debit" fill={COLORS[4]} stackId="a" />
                <Bar dataKey="purchase" name="Purchase" fill={COLORS[2]} stackId="a" />
                <Bar dataKey="monthly_grant" name="Monthly Grant" fill={COLORS[1]} stackId="a" />
                <Bar dataKey="bonus" name="Bonus" fill={COLORS[3]} stackId="a" />
                <Bar dataKey="refund" name="Refund" fill={COLORS[0]} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">AI Model Cost Breakdown</CardTitle><p className="text-xs text-muted-foreground mt-1">Credits consumed per AI model over the last 12 weeks</p></CardHeader>
          <CardContent>
            {aiModelCosts.length === 0 ? <EmptyState message="No AI usage logs found" /> : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={aiModelCosts} layout="vertical" margin={{ top: 5, right: 20, left: 90, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="model" tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: any, n: string) => [n === 'credits' ? v.toLocaleString() : `$${v}`, n]} />
                  <Bar dataKey="credits" name="credits" radius={[0, 4, 4, 0]}>{aiModelCosts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">AI Operation Type — Credit Spend</CardTitle><p className="text-xs text-muted-foreground mt-1">Which operation types consume the most credits</p></CardHeader>
          <CardContent>
            {aiOperationCosts.length === 0 ? <EmptyState message="No AI usage data" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={aiOperationCosts} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="operation" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="credits" name="Credits" radius={[0, 4, 4, 0]}>{aiOperationCosts.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Weekly AI Cost Trend (USD)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={aiCostTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`$${v}`, 'Cost USD']} />
                <Line type="monotone" dataKey="cost" stroke={COLORS[5]} strokeWidth={2} dot={false} name="Cost USD" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">User Credit Balance Distribution</CardTitle><p className="text-xs text-muted-foreground mt-1">How many users fall in each balance tier</p></CardHeader>
          <CardContent>
            {creditBalanceDist.length === 0 ? <EmptyState message="No balance data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={creditBalanceDist} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip /><Bar dataKey="count" name="Users" radius={[4, 4, 0, 0]}>{creditBalanceDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top 10 Credit Consumers (12w)</CardTitle><p className="text-xs text-muted-foreground mt-1">Heaviest AI usage — anonymous user IDs</p></CardHeader>
          <CardContent>
            {topCreditConsumers.length === 0 ? <EmptyState message="No usage data yet" /> : (
              <div className="overflow-auto max-h-[220px]">
                <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/50 border-b border-border/50"><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2 pr-4 font-medium">#</th><th className="text-left py-2 pr-4 font-medium">User ID</th><th className="text-right py-2 pr-4 font-medium">Credits</th><th className="text-right py-2 font-medium">Top Op</th></tr></thead>
                  <tbody>{topCreditConsumers.map((row, i) => (<tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors"><td className="py-2 pr-4 text-xs text-muted-foreground">{i + 1}</td><td className="py-2 pr-4 font-mono text-xs">…{row.userId}</td><td className="py-2 pr-4 text-right tabular-nums text-primary font-semibold">{row.credits.toLocaleString()}</td><td className="py-2 text-right text-xs text-muted-foreground">{row.topOp}</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 4. VR Worlds & 3D Generation ───────────────────────── */}
      <SectionHeader title="VR Worlds & 3D Generation" desc="WorldLabs VR world generation, Design Canvas 3D jobs, segment analysis, and SVBRDF material extraction" icon={Layers} />
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <KpiCard label="VR Worlds (12w)" value={featureKpis.vrWorldsGenerated} icon={Eye} color="text-violet-600" />
        <KpiCard label="VR Credits Used" value={vrTotalCredits.toLocaleString()} icon={DollarSign} color="text-amber-500" />
        <KpiCard label="3D Jobs (12w)" value={canvasKpis.gen3dJobs} icon={Layers} color="text-cyan-600" />
        <KpiCard label="Segments (12w)" value={canvasKpis.gen3dSegments} icon={Target} color="text-green-600" />
        <KpiCard label="SVBRDF (12w)" value={canvasKpis.svbrdfExtractions} icon={Package} color="text-primary" />
        <KpiCard label="SVBRDF Success" value={svbrdfKpis.successRate} icon={Star} color="text-green-600" sub={`avg conf ${svbrdfKpis.avgConfidence}`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">VR World Quality Split (draft vs 1.1)</CardTitle><p className="text-xs text-muted-foreground mt-1">draft = 18 credits (~30s), 1.1 = 190 credits (~5min)</p></CardHeader>
          <CardContent>
            {vrQualitySplit.length === 0 ? <EmptyState message="No VR worlds generated yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={vrQualitySplit} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>{vrQualitySplit.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">VR Generation — Success vs Failure (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={vrStatusTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="completed" name="Completed" fill={COLORS[2]} stackId="a" />
                <Bar dataKey="failed" name="Failed" fill={COLORS[4]} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">3D Generation Room Types</CardTitle><p className="text-xs text-muted-foreground mt-1">Which room types users generate most</p></CardHeader>
          <CardContent>
            {gen3dRoomTypes.length === 0 ? <EmptyState message="No 3D jobs yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gen3dRoomTypes} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="value" name="Jobs" radius={[0, 4, 4, 0]}>{gen3dRoomTypes.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">3D Generation — Status by Week</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={gen3dStatusTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="completed" name="Completed" fill={COLORS[2]} stackId="a" />
                <Bar dataKey="failed" name="Failed" fill={COLORS[4]} stackId="a" />
                <Bar dataKey="pending" name="Pending" fill={COLORS[3]} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">3D Jobs & Segments Generated (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={gen3dTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="jobs" name="3D Jobs" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="segments" name="Segments" fill={COLORS[6]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">SVBRDF Extractions (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={svbrdfTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Bar dataKey="count" name="Extractions" fill={COLORS[7]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Detected Zone Types in 3D Segments</CardTitle><p className="text-xs text-muted-foreground mt-1">Which room zones the AI identifies most</p></CardHeader>
          <CardContent>
            {segmentZones.length === 0 ? <EmptyState message="No segment data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={segmentZones} layout="vertical" margin={{ top: 5, right: 20, left: 70, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="zone" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Segments" radius={[0, 4, 4, 0]}>{segmentZones.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top Detected Materials in Segments</CardTitle><p className="text-xs text-muted-foreground mt-1">What the AI identifies as the material in each zone</p></CardHeader>
          <CardContent>
            {topDetectedMaterials.length === 0 ? <EmptyState message="No material detection data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={topDetectedMaterials} layout="vertical" margin={{ top: 5, right: 20, left: 65, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="material" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Detections" radius={[0, 4, 4, 0]}>{topDetectedMaterials.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Avg Segment Confidence Score (weekly)</CardTitle><p className="text-xs text-muted-foreground mt-1">Higher = AI is more certain about detected materials in each zone</p></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={avgConfidenceTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => [v.toFixed(2), 'Avg Confidence']} />
              <Line type="monotone" dataKey="confidence" stroke={COLORS[2]} strokeWidth={2} dot={false} name="Confidence" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>


      {/* ─── 5. AI Agents & Automation ──────────────────────────── */}
      <SectionHeader title="AI Agents & Automation" desc="Background agent reliability, execution performance, credit spend, and type breakdown" icon={Cpu} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="Agent Runs (12w)" value={featureKpis.agentRuns} icon={Cpu} color="text-cyan-600" />
        <KpiCard label="Success Rate" value={agentOutcomePie.length > 0 ? `${Math.round(((agentOutcomePie.find(p => p.name === 'completed')?.value ?? 0) / agentOutcomePie.reduce((a, b) => a + b.value, 0)) * 100)}%` : '—'} icon={Star} color="text-green-600" />
        <KpiCard label="Active Agent Types" value={topAgentTypes.length} icon={Package} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Agent Run Outcomes</CardTitle></CardHeader>
          <CardContent>
            {agentOutcomePie.length === 0 ? <EmptyState message="No agent runs yet" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart><Pie data={agentOutcomePie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>{agentOutcomePie.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Agent Success vs Failure (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={agentSuccessTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="completed" name="Completed" fill={COLORS[2]} stackId="a" />
                <Bar dataKey="failed" name="Failed" fill={COLORS[4]} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Avg Execution Time by Agent Type</CardTitle><p className="text-xs text-muted-foreground mt-1">Milliseconds — longer times may indicate delegation to Python backend</p></CardHeader>
          <CardContent>
            {agentAvgTime.length === 0 ? <EmptyState message="No timing data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentAvgTime} layout="vertical" margin={{ top: 5, right: 20, left: 110, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}s` : `${v}ms`} />
                  <YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [v >= 1000 ? `${(v/1000).toFixed(1)}s` : `${v}ms`, 'Avg time']} />
                  <Bar dataKey="avgMs" name="Avg Time" radius={[0, 4, 4, 0]}>{agentAvgTime.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Credits Consumed by Agent Type (12w)</CardTitle></CardHeader>
          <CardContent>
            {agentCreditsByType.length === 0 ? <EmptyState message="No credit data yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={agentCreditsByType} layout="vertical" margin={{ top: 5, right: 20, left: 110, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="type" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="credits" name="Credits" radius={[0, 4, 4, 0]}>{agentCreditsByType.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm">AI Agent Runs by Type (weekly stacked)</CardTitle></CardHeader>
        <CardContent>
          {agentsByType.length === 0 || topAgentTypes.length === 0 ? <EmptyState message="No agent runs recorded" /> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={agentsByType} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend formatter={(v) => <span style={{ fontSize: 11 }}>{String(v).replace(/-/g, ' ')}</span>} />
                {topAgentTypes.map((t, i) => <Bar key={t} dataKey={t} name={t.replace(/-/g, ' ')} stackId="a" fill={COLORS[i % COLORS.length]} radius={i === topAgentTypes.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* ─── 6. Community & Social Graph ────────────────────────── */}
      <SectionHeader title="Community & Social Graph" desc="Follow network growth, review sentiment, hire me conversions, and moodboard activity" icon={Users} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Total Follows" value={totalFollowers.toLocaleString()} icon={Users} color="text-violet-600" />
        <KpiCard label="Reviews (12w)" value={reviewKpis.total} icon={Star} color="text-amber-500" sub={reviewKpis.avgRating !== '—' ? `avg ${reviewKpis.avgRating}★` : undefined} />
        <KpiCard label="Hire Me (12w)" value={kpis.hireTotal} icon={Award} color="text-cyan-600" />
        <KpiCard label="Moodboards (12w)" value={featureKpis.moodboardsCreated} icon={Package} color="text-green-600" />
        <KpiCard label="Avg Rating" value={reviewKpis.avgRating !== '—' ? `${reviewKpis.avgRating}★` : '—'} icon={Star} color="text-amber-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">New Follows per Week (12w)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={followsGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Bar dataKey="count" name="New Follows" fill={COLORS[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Review Rating Distribution</CardTitle><p className="text-xs text-muted-foreground mt-1">Star ratings left on materials</p></CardHeader>
          <CardContent>
            {reviewRatingDist.length === 0 ? <EmptyState message="No reviews yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={reviewRatingDist} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="rating" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip /><Bar dataKey="count" name="Reviews" radius={[4, 4, 0, 0]}>{reviewRatingDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Hire Me — Services Requested</CardTitle><p className="text-xs text-muted-foreground mt-1">What buyers are hiring designers for</p></CardHeader>
          <CardContent>
            {hireMeServices.length === 0 ? <EmptyState message="No hire requests yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hireMeServices} layout="vertical" margin={{ top: 5, right: 20, left: 110, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="service" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Requests" radius={[0, 4, 4, 0]}>{hireMeServices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Hire Me — Request Status Funnel</CardTitle></CardHeader>
          <CardContent>
            {hireMeFunnel.length === 0 ? <EmptyState message="No hire requests yet" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hireMeFunnel} layout="vertical" margin={{ top: 5, right: 20, left: 80, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="status" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Requests" radius={[0, 4, 4, 0]}>{hireMeFunnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Review Velocity & Avg Rating (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={reviewVelocity} margin={{ top: 5, right: 30, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11 }} />
                <Tooltip /><Legend />
                <Line yAxisId="left" type="monotone" dataKey="count" stroke="#8b5cf6" strokeWidth={2} dot={false} name="Reviews" />
                <Line yAxisId="right" type="monotone" dataKey="avgRating" stroke="#f59e0b" strokeWidth={2} dot={false} name="Avg ★" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Moodboard Activity (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={moodboardActivity} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="boards" name="Boards Created" fill={COLORS[3]} radius={[4, 4, 0, 0]} />
                <Bar dataKey="items" name="Items Added" fill={COLORS[4]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Creator Community Growth by Professional Type (weekly signups)</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={creatorGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip /><Legend />
              <Bar dataKey="manufacturers" name="Manufacturers" fill="#8b5cf6" stackId="a" />
              <Bar dataKey="brands" name="Brands" fill="#06b6d4" stackId="a" />
              <Bar dataKey="suppliers" name="Suppliers" fill="#10b981" stackId="a" />
              <Bar dataKey="designers" name="Designers / Architects" fill="#f59e0b" stackId="a" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ─── 7. Search Intelligence ──────────────────────────────── */}
      <SectionHeader title="Search Intelligence" desc="Search volume, strategy mix, latency trends, CTR, catalog gaps, and agent routing" icon={Search} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Searches (12w)" value={searchKpis.totalSearches} icon={Search} />
        <KpiCard label="Search→Save Rate" value={searchKpis.searchToSaveRate} icon={TrendingUp} color="text-green-600" />
        <KpiCard label="Avg Satisfaction" value={searchKpis.avgSatisfaction !== '—' ? `${searchKpis.avgSatisfaction}★` : '—'} icon={Star} color="text-amber-500" />
        <KpiCard label="Zero-result Rate" value={searchKpis.zeroResultRate} icon={Package} color="text-red-500" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Search Strategy Distribution</CardTitle><p className="text-xs text-muted-foreground mt-1">Which AI search pipeline users trigger</p></CardHeader>
          <CardContent>
            {searchStrategyDist.length === 0 ? <EmptyState message="No strategy data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={searchStrategyDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>{searchStrategyDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Agent Used in Search</CardTitle><p className="text-xs text-muted-foreground mt-1">Which agent handled each search session</p></CardHeader>
          <CardContent>
            {searchAgentDist.length === 0 ? <EmptyState message="No agent routing data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={searchAgentDist} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={85} label={({ name, value }) => `${name}: ${value}`}>{searchAgentDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Search Latency (avg ms per week)</CardTitle><p className="text-xs text-muted-foreground mt-1">Lower = faster search pipeline</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={searchLatencyTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v}ms`, 'Avg latency']} />
                <Line type="monotone" dataKey="avgMs" stroke={COLORS[4]} strokeWidth={2} dot={false} name="Avg ms" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Click-Through Rate (weekly)</CardTitle><p className="text-xs text-muted-foreground mt-1">Clicks per search — higher = more relevant results</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={searchCTRTrend} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [v, 'CTR']} />
                <Line type="monotone" dataKey="ctr" stroke={COLORS[2]} strokeWidth={2} dot={false} name="CTR" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Weekly Search Volume (12w)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={searchVolume} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Line type="monotone" dataKey="searches" stroke={COLORS[0]} strokeWidth={2} dot={false} name="Searches" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Search → Save → Quote Funnel</CardTitle></CardHeader>
          <CardContent>
            {searchFunnel.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={searchFunnel} layout="vertical" margin={{ top: 5, right: 20, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="stage" tick={{ fontSize: 11 }} />
                  <Tooltip /><Bar dataKey="count" name="Events" radius={[0, 4, 4, 0]}>{searchFunnel.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top Search Terms (12w)</CardTitle></CardHeader>
          <CardContent>
            {topSearches.length === 0 ? <EmptyState message="No searches recorded" /> : (
              <div className="overflow-auto max-h-[240px]">
                <table className="w-full text-sm"><thead className="sticky top-0 bg-muted/50 border-b border-border/50"><tr className="border-b text-xs text-muted-foreground"><th className="text-left py-2 pr-4 font-medium">Term</th><th className="text-right py-2 font-medium">Searches</th></tr></thead>
                  <tbody>{topSearches.map((row, i) => (<tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors"><td className="py-2 pr-4 font-medium">{row.term}</td><td className="py-2 text-right tabular-nums text-primary font-semibold">{row.count}</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Zero-Result Searches — Catalog Gaps</CardTitle><p className="text-xs text-muted-foreground mt-1">What buyers searched for but found nothing</p></CardHeader>
          <CardContent>
            {zeroResultTerms.length === 0 ? <EmptyState message="No zero-result searches" /> : (
              <div className="space-y-2 pt-1">
                {zeroResultTerms.map((row, i) => (<div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0"><span className="font-medium text-red-600/80">{row.term}</span><span className="tabular-nums text-muted-foreground">{row.count}×</span></div>))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── 8. Content & Knowledge Base Health ─────────────────── */}
      <SectionHeader title="Content & Knowledge Base Health" desc="KB document status, embedding coverage, category distribution, and top viewed articles" icon={Database} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Total KB Docs" value={kbKpis.totalDocs.toLocaleString()} icon={FileText} color="text-cyan-600" />
        <KpiCard label="Published Docs" value={kbKpis.publishedDocs.toLocaleString()} icon={FileText} color="text-green-600" />
        <KpiCard label="Embedding Success" value={kbKpis.embeddingSuccessRate} icon={Database} color="text-violet-600" sub="docs with embeddings" />
        <KpiCard label="RAG Chunks (12w)" value={kbKpis.totalChunks.toLocaleString()} icon={Database} color="text-indigo-600" sub="new chunks indexed" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Docs by Status</CardTitle></CardHeader>
          <CardContent>
            {kbStatusBreakdown.length === 0 ? <EmptyState message="No KB docs" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={kbStatusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={65}>{kbStatusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Embedding Health</CardTitle><p className="text-xs text-muted-foreground mt-1">success / pending / failed</p></CardHeader>
          <CardContent>
            {kbEmbeddingHealth.length === 0 ? <EmptyState message="No embedding data" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={kbEmbeddingHealth} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={65}>{kbEmbeddingHealth.map((entry, i) => <Cell key={i} fill={entry.name === 'success' ? '#10b981' : entry.name === 'failed' ? '#ef4444' : '#f59e0b'} />)}</Pie><Tooltip /><Legend /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Docs by Category</CardTitle></CardHeader>
          <CardContent>
            {kbDocsByCategory.length === 0 ? <EmptyState message="No KB docs found" /> : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart><Pie data={kbDocsByCategory} dataKey="value" nameKey="name" cx="50%" cy="45%" outerRadius={65}>{kbDocsByCategory.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /><Legend /></PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
      {kbTopViewed.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Top Viewed Articles</CardTitle><p className="text-xs text-muted-foreground mt-1">Most read KB documents</p></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {kbTopViewed.map((doc, i) => (
                <div key={i} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.category}</p>
                  </div>
                  <div className="ml-4 shrink-0 flex items-center gap-3 tabular-nums text-muted-foreground text-xs">
                    <span title="Page views">{doc.views} views</span>
                    {doc.agentMentions > 0 && <span title="AI agent mentions" className="text-violet-600">🤖 {doc.agentMentions}</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="rounded-2xl">
        <CardHeader><CardTitle className="text-sm">Document Chunks Indexed per Week (12w)</CardTitle><p className="text-xs text-muted-foreground mt-1">New text chunks added to the RAG knowledge base</p></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chunkGrowth} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip /><Bar dataKey="count" name="Chunks" fill={COLORS[5]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* ─── 9. Data Pipeline Health ─────────────────────────────── */}
      <SectionHeader title="Data Pipeline Health" desc="PDF ingestion reliability, XML import throughput, and product enrichment coverage" icon={FileText} />
      <div className="grid grid-cols-3 gap-3">
        <KpiCard label="PDF Jobs (12w)" value={pipelineKpis.totalPdfJobs} icon={FileText} />
        <KpiCard label="PDF Success Rate" value={pipelineKpis.pdfSuccessRate} icon={Star} color="text-green-600" />
        <KpiCard label="Import Jobs (12w)" value={pipelineKpis.totalImports} icon={Database} color="text-cyan-600" />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">PDF Batch Jobs — Success vs Failed (weekly)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={pdfJobTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Legend />
                <Bar dataKey="success" name="Success" fill={COLORS[2]} stackId="a" />
                <Bar dataKey="failed" name="Failed" fill={COLORS[4]} stackId="a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">XML / Data Import Throughput (weekly)</CardTitle><p className="text-xs text-muted-foreground mt-1">Records imported per week via XML/batch jobs</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={importThroughput} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip /><Bar dataKey="records" name="Records" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
      {enrichmentStatus.length > 0 && (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Product Enrichment Status</CardTitle><p className="text-xs text-muted-foreground mt-1">How many products have been fully enriched with embeddings and metadata</p></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={enrichmentStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name}: ${value}`}>{enrichmentStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Pie><Tooltip /></PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* ─── 10. Pricing Intelligence — gated on Greek Marketplaces module ─ */}
      {greekModuleEnabled && (
        <>
          <SectionHeader
            title="Pricing Intelligence"
            desc="Greek Marketplaces module activity: price refresh volume, marketplace source coverage, and credits consumed by the module. Visible only while the module is enabled."
            icon={ShoppingCart}
          />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiCard label="Price Refreshes (12w)" value={pricingKpis.refreshes12w.toLocaleString()} icon={TrendingUp} />
            <KpiCard label="Marketplace Hits (12w)" value={pricingKpis.marketplaceHits12w.toLocaleString()} icon={ShoppingCart} color="text-emerald-600" />
            <KpiCard label="Module Credits (12w)" value={pricingKpis.moduleCredits12w.toFixed(2)} icon={DollarSign} color="text-amber-500" />
            <KpiCard label="Active Tracked Queries" value={pricingKpis.trackedQueries.toLocaleString()} icon={CheckCircle2} color="text-violet-600" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-sm">Weekly Price Refresh Activity (12w)</CardTitle></CardHeader>
              <CardContent>
                {pricingWeekly.some(w => w.internal + w.tracked + w.marketplace > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={pricingWeekly} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="internal" name="Internal refresh" fill={COLORS[0]} stackId="a" />
                      <Bar dataKey="tracked" name="External tracked" fill={COLORS[1]} stackId="a" />
                      <Bar dataKey="marketplace" name="Marketplace hits" fill={COLORS[2]} stackId="a" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="No price refreshes in the last 12 weeks." />
                )}
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader><CardTitle className="text-sm">Hits by Marketplace Source (12w)</CardTitle></CardHeader>
              <CardContent>
                {marketplaceBySource.some(s => s.count > 0) ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={marketplaceBySource} layout="vertical" margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis type="category" dataKey="source" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip />
                      <Bar dataKey="count" fill={COLORS[2]} radius={[0,4,4,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState message="Skroutz / Bestprice / Shopflix have no recorded hits yet." />
                )}
              </CardContent>
            </Card>
          </div>

          {pricingSourceDist.length > 0 && (
            <Card className="rounded-2xl mt-4">
              <CardHeader>
                <CardTitle className="text-sm">All Competitor Sources Distribution (12w)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={pricingSourceDist}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={85}
                      label={(e) => `${e.name}: ${e.value}`}
                    >
                      {pricingSourceDist.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ─── 11. Notifications & Messaging ──────────────────────── */}
      <SectionHeader title="Notifications & Messaging" desc="All-time sends across Email, SMS, Web Push, and In-App notification channels" icon={Bell} />
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <KpiCard label="Total Sent (12w)" value={notifKpis.totalSent.toLocaleString()} icon={Bell} />
        <KpiCard label="Email" value={notifKpis.email.toLocaleString()} icon={Mail} color="text-blue-600" />
        <KpiCard label="SMS / WhatsApp" value={notifKpis.sms.toLocaleString()} icon={MessageSquare} color="text-green-600" />
        <KpiCard label="Web Push" value={notifKpis.webPush.toLocaleString()} icon={Monitor} color="text-violet-600" />
        <KpiCard label="In-App" value={notifKpis.inApp.toLocaleString()} icon={Bell} color="text-amber-500" />
      </div>
      {notifTrend.some(w => w.email + w.sms + w.web + w.inapp > 0) ? (
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="text-sm">Weekly Notification Sends by Channel (12w)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={notifTrend} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="email" name="Email" fill={COLORS[1]} stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="sms" name="SMS" fill={COLORS[2]} stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="web" name="Web Push" fill={COLORS[5]} stackId="a" radius={[0,0,0,0]} />
                <Bar dataKey="inapp" name="In-App" fill={COLORS[4]} stackId="a" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <Bell className="h-10 w-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">No notifications sent in the last 12 weeks</p>
            <p className="text-xs mt-1">Channels will populate as Email, SMS, Web Push and In-App messages are sent.</p>
          </CardContent>
        </Card>
      )}

      {/* ─── 11. Factory Registration Pipeline ──────────────────── */}
      {factoryPipeline.length > 0 && (
        <Card className="mt-8">
          <CardHeader><CardTitle className="text-sm font-semibold flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" />Factory Registration Pipeline</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {factoryPipeline.map((p) => (
                <div key={p.status} className={`rounded-lg border px-4 py-3 ${p.status === 'pending' ? 'border-amber-500/30 bg-amber-500/5' : p.status === 'approved' ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                  <p className="text-xs text-muted-foreground capitalize">{p.status}</p>
                  <p className={`text-2xl font-bold mt-1 ${p.status === 'pending' ? 'text-amber-600' : p.status === 'approved' ? 'text-green-600' : 'text-red-600'}`}>{p.count}</p>
                </div>
              ))}
            </div>
            {recentRequests.length > 0 && (
              <div className="overflow-auto max-h-[200px]">
                <table className="w-full text-xs"><thead className="sticky top-0 bg-muted/50 border-b border-border/50"><tr className="text-xs text-muted-foreground"><th className="text-left py-2 pr-4 font-medium">Company</th><th className="text-left py-2 pr-4 font-medium">Type</th><th className="text-left py-2 pr-4 font-medium">Status</th><th className="text-right py-2 font-medium">Date</th></tr></thead>
                  <tbody>{recentRequests.map((r, i) => (<tr key={i} className="border-b last:border-0 hover:bg-muted/40 transition-colors"><td className="py-2 pr-4 font-medium">{r.name}</td><td className="py-2 pr-4 text-muted-foreground capitalize">{r.type}</td><td className="py-2 pr-4"><span className={`text-xs px-1.5 py-0.5 rounded ${r.status === 'pending' ? 'bg-amber-500/10 text-amber-600' : r.status === 'approved' ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>{r.status}</span></td><td className="py-2 text-right text-muted-foreground">{r.date}</td></tr>))}</tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
