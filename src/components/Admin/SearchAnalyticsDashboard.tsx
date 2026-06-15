import { useState, useEffect } from 'react';
import {
  TrendingUp,
  Search,
  Package,
  Users,
  BarChart3,
  RefreshCw,
  Download,
  Calendar,
  Filter,
  Zap,
  Database,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';

interface PerformanceStats {
  total_searches: number;
  cache_hits: number;
  cache_hit_rate: number;
  zero_result_count: number;
  zero_result_rate: number;
  product_name_searches: number;
  avg_total_ms: number;
  p50_total_ms: number;
  p95_total_ms: number;
  p99_total_ms: number;
  avg_query_understanding_ms: number;
  avg_embedding_generation_ms: number;
  avg_vector_search_ms: number;
  avg_fulltext_search_ms: number;
  avg_scoring_ms: number;
  avg_enhancement_ms: number;
}

interface SlowestQuery {
  query_text: string;
  total_ms: number;
  query_understanding_ms: number | null;
  embedding_generation_ms: number | null;
  vector_search_ms: number | null;
  fulltext_search_ms: number | null;
  scoring_ms: number | null;
  enhancement_ms: number | null;
  result_count: number;
  cache_hit: boolean;
  timestamp: string;
}

interface ZeroResultQuery {
  query_text: string;
  occurrences: number;
  unique_users: number;
  last_seen: string;
}

interface CacheStats {
  total_cached_queries: number;
  total_cache_hits: number;
  avg_hits_per_entry: number;
  oldest_entry: string | null;
  newest_entry: string | null;
  avg_parse_latency_saved_ms: number;
  estimated_total_ms_saved: number;
}

interface CachedQuery {
  query_text: string;
  hit_count: number;
  parse_latency_ms: number;
  total_ms_saved: number;
  is_product_name: boolean;
  model_used: string;
  last_hit_at: string;
  created_at: string;
}

interface PopularSearch {
  query_text: string;
  search_count: number;
  unique_users: number;
  avg_results: number;
  times_saved: number;
  times_added_to_moodboard: number;
  last_searched: string;
  all_material_mentions: any[];
}

interface MaterialDemand {
  material_name: string;
  material_category: string;
  mention_count: number;
  unique_users_requesting: number;
  times_saved: number;
  times_added_to_moodboard: number;
  times_used_in_3d: number;
  avg_confidence: number;
  last_requested: string;
  first_requested: string;
  example_queries: any[];
}

interface AnalyticsStats {
  totalSearches: number;
  uniqueUsers: number;
  avgSearchesPerUser: number;
  topSearchStrategy: string;
  savedSearchRate: number;
  moodboardConversionRate: number;
}

export const SearchAnalyticsDashboard = () => {
  const [popularSearches, setPopularSearches] = useState<PopularSearch[]>([]);
  const [materialDemand, setMaterialDemand] = useState<MaterialDemand[]>([]);
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [perfStats, setPerfStats] = useState<PerformanceStats | null>(null);
  const [slowestQueries, setSlowestQueries] = useState<SlowestQuery[]>([]);
  const [zeroResults, setZeroResults] = useState<ZeroResultQuery[]>([]);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [topCached, setTopCached] = useState<CachedQuery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
  const [activeTab, setActiveTab] = useState('overview');
  const { toast } = useToast();

  const loadAnalytics = async () => {
    try {
      setLoading(true);

      // Load popular searches from materialized view
      const { data: searches, error: searchError } = await supabase
        .from('popular_searches')
        .select('*')
        .limit(20);

      if (searchError) throw searchError;
      setPopularSearches(searches || []);

      // Load material demand from materialized view
      const { data: materials, error: materialError } = await supabase
        .from('material_demand_analytics')
        .select('*')
        .limit(50);

      if (materialError) throw materialError;
      setMaterialDemand(materials || []);

      // Calculate overall stats
      const interval = timeRange === '7d' ? '7 days' : timeRange === '30d' ? '30 days' : '90 days';
      const { data: statsData, error: statsError } = await supabase.rpc('get_search_stats', {
        time_interval: interval,
      });

      if (!statsError && statsData) {
        setStats(statsData);
      }

      // Load per-stage performance stats
      const { data: perfData, error: perfError } = await supabase.rpc('get_search_performance_stats', {
        time_interval: interval,
      });
      if (!perfError && perfData) {
        setPerfStats(perfData);
      }

      // Load slowest queries
      const { data: slowData, error: slowError } = await supabase.rpc('get_slowest_queries', {
        time_interval: interval,
        max_results: 20,
      });
      if (!slowError && slowData) {
        setSlowestQueries(slowData);
      }

      // Load zero-result queries
      const { data: zeroData, error: zeroError } = await supabase.rpc('get_zero_result_queries', {
        time_interval: interval,
        max_results: 30,
      });
      if (!zeroError && zeroData) {
        setZeroResults(zeroData);
      }

      // Load cache stats
      const { data: cacheData, error: cacheError } = await supabase.rpc('get_query_cache_stats');
      if (!cacheError && cacheData) {
        setCacheStats(cacheData);
      }

      // Load top cached queries
      const { data: topCachedData, error: topCachedError } = await supabase.rpc('get_top_cached_queries', {
        max_results: 20,
      });
      if (!topCachedError && topCachedData) {
        setTopCached(topCachedData);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to load search analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const refreshViews = async () => {
    try {
      setRefreshing(true);
      const { error } = await supabase.rpc('refresh_search_analytics_views');

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Analytics views refreshed successfully',
      });

      await loadAnalytics();
    } catch (error) {
      console.error('Error refreshing views:', error);
      toast({
        title: 'Error',
        description: 'Failed to refresh analytics views',
        variant: 'destructive',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const exportToCSV = (data: any[], filename: string) => {
    const csv = [
      Object.keys(data[0]).join(','),
      ...data.map((row) => Object.values(row).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Search Analytics</h2>
          <p className="text-muted-foreground">
            Track user search behavior and material demand patterns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={timeRange} onValueChange={(value: any) => setTimeRange(value)}>
            <SelectTrigger className="w-32">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={refreshViews} disabled={refreshing} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="cache" className="flex items-center gap-2">
            <Database className="h-4 w-4" />
            Cache Effectiveness
          </TabsTrigger>
        </TabsList>

      <TabsContent value="overview" className="space-y-6">
      {/* Stats Overview - Compact Design */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Search className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Total Searches</p>
            </div>
            <div className="text-2xl font-bold">{stats.totalSearches.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stats.avgSearchesPerUser.toFixed(1)} per user
            </p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Unique Users</p>
            </div>
            <div className="text-2xl font-bold">{stats.uniqueUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Active searchers</p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Save Rate</p>
            </div>
            <div className="text-2xl font-bold">{stats.savedSearchRate.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground mt-1">Searches saved</p>
          </div>

          <div className="dashboard-card">
            <div className="flex items-center gap-2 mb-2">
              <Package className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
              <p className="text-xs text-muted-foreground">Moodboard Rate</p>
            </div>
            <div className="text-2xl font-bold">
              {stats.moodboardConversionRate.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground mt-1">Added to moodboards</p>
          </div>
        </div>
      )}

      {/* Popular Searches */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Popular Search Queries
              </CardTitle>
              <CardDescription>Most frequently searched terms by users</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(popularSearches, 'popular-searches')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {popularSearches.slice(0, 15).map((search, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono">
                      #{index + 1}
                    </Badge>
                    <span className="font-medium">{search.query_text}</span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Search className="h-3 w-3" />
                      {search.search_count} searches
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {search.unique_users} users
                    </span>
                    {search.times_saved > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Saved {search.times_saved}x
                      </Badge>
                    )}
                    {search.times_added_to_moodboard > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        Moodboard {search.times_added_to_moodboard}x
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Material Demand Analytics */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Material Demand Analytics
              </CardTitle>
              <CardDescription>
                Most requested materials - Use for procurement planning
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => exportToCSV(materialDemand, 'material-demand')}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {materialDemand.slice(0, 20).map((material, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline" className="font-mono">
                      #{index + 1}
                    </Badge>
                    <span className="font-semibold text-lg">{material.material_name}</span>
                    {material.material_category && (
                      <Badge className="capitalize">{material.material_category}</Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground">Mentions</div>
                      <div className="font-semibold text-lg">
                        {material.mention_count.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Unique Users</div>
                      <div className="font-semibold text-lg">
                        {material.unique_users_requesting.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Saved</div>
                      <div className="font-semibold text-lg">{material.times_saved}</div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Used in 3D</div>
                      <div className="font-semibold text-lg">{material.times_used_in_3d}</div>
                    </div>
                  </div>

                  {material.example_queries && material.example_queries.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs text-muted-foreground mb-1">Example searches:</div>
                      <div className="flex flex-wrap gap-1">
                        {material.example_queries.slice(0, 3).map((q: any, i: number) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {typeof q === 'string' ? q : q.query}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="ml-4">
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">Demand Score</div>
                    <div className="text-2xl font-bold text-primary">
                      {Math.min(100, Math.round((material.mention_count / 10) * 100))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {materialDemand.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No material demand data available yet</p>
              <p className="text-sm">Data will appear as users perform searches</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Procurement Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Procurement Insights
          </CardTitle>
          <CardDescription>
            Top materials to consider for inventory based on user demand
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {materialDemand
              .filter((m) => m.mention_count >= 5)
              .slice(0, 10)
              .map((material, index) => {
                const demandScore = Math.min(
                  100,
                  Math.round((material.mention_count / 10) * 100),
                );
                const priority =
                  demandScore >= 80 ? 'high' : demandScore >= 50 ? 'medium' : 'low';

                return (
                  <div key={index} className="flex items-center gap-4">
                    <Badge
                      variant={
                        priority === 'high'
                          ? 'destructive'
                          : priority === 'medium'
                            ? 'default'
                            : 'secondary'
                      }
                      className="w-20 justify-center"
                    >
                      {priority.toUpperCase()}
                    </Badge>
                    <div className="flex-1">
                      <div className="font-medium">{material.material_name}</div>
                      <div className="text-sm text-muted-foreground">
                        {material.unique_users_requesting} users requesting •{' '}
                        {material.mention_count} total mentions
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{demandScore}%</div>
                      <div className="text-xs text-muted-foreground">demand</div>
                    </div>
                  </div>
                );
              })}
          </div>
        </CardContent>
      </Card>
      </TabsContent>

      {/* ─────────────────── PERFORMANCE TAB ─────────────────── */}
      <TabsContent value="performance" className="space-y-6">
        {/* Stage Timing Breakdown */}
        {perfStats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="dashboard-card">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-xs text-muted-foreground">Avg Total</p>
                </div>
                <div className="text-2xl font-bold">{perfStats.avg_total_ms}ms</div>
                <p className="text-xs text-muted-foreground mt-1">
                  p50 {perfStats.p50_total_ms?.toFixed(0)}ms / p95 {perfStats.p95_total_ms?.toFixed(0)}ms
                </p>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-2 mb-2">
                  <Database className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-xs text-muted-foreground">Cache Hit Rate</p>
                </div>
                <div className="text-2xl font-bold">{perfStats.cache_hit_rate?.toFixed(1) || 0}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {perfStats.cache_hits?.toLocaleString()} of {perfStats.total_searches?.toLocaleString()}
                </p>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-xs text-muted-foreground">Zero-Result Rate</p>
                </div>
                <div className="text-2xl font-bold">{perfStats.zero_result_rate?.toFixed(1) || 0}%</div>
                <p className="text-xs text-muted-foreground mt-1">
                  {perfStats.zero_result_count?.toLocaleString()} empty
                </p>
              </div>

              <div className="dashboard-card">
                <div className="flex items-center gap-2 mb-2">
                  <Search className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                  <p className="text-xs text-muted-foreground">Product-Name Searches</p>
                </div>
                <div className="text-2xl font-bold">
                  {perfStats.product_name_searches?.toLocaleString() || 0}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {perfStats.total_searches > 0
                    ? ((perfStats.product_name_searches / perfStats.total_searches) * 100).toFixed(1)
                    : 0}% of total
                </p>
              </div>
            </div>

            {/* Per-Stage Average Timings */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  Per-Stage Average Timings
                </CardTitle>
                <CardDescription>
                  Where time is spent on a typical search request — find the bottleneck
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(() => {
                  const stages = [
                    { name: 'Query Understanding (LLM)', value: perfStats.avg_query_understanding_ms || 0, color: 'bg-purple-500' },
                    { name: 'Embedding Generation', value: perfStats.avg_embedding_generation_ms || 0, color: 'bg-blue-500' },
                    { name: 'Vector + Fulltext Search', value: perfStats.avg_vector_search_ms || 0, color: 'bg-green-500' },
                    { name: 'Fulltext Search', value: perfStats.avg_fulltext_search_ms || 0, color: 'bg-emerald-500' },
                    { name: 'Scoring', value: perfStats.avg_scoring_ms || 0, color: 'bg-amber-500' },
                    { name: 'Enhancement (related products/images)', value: perfStats.avg_enhancement_ms || 0, color: 'bg-orange-500' },
                  ].filter((s) => s.value > 0);
                  const max = Math.max(...stages.map((s) => s.value), 1);

                  return (
                    <div className="space-y-3">
                      {stages.map((stage, i) => (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium">{stage.name}</span>
                            <span className="text-sm tabular-nums text-muted-foreground">
                              {stage.value}ms
                            </span>
                          </div>
                          <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full ${stage.color}`}
                              style={{ width: `${(stage.value / max) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                      {stages.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          No stage timing data yet. Run some searches to populate.
                        </p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </>
        )}

        {/* Slowest Queries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Slowest Queries
            </CardTitle>
            <CardDescription>
              Top 20 slowest searches with stage breakdown — investigate these first
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {slowestQueries.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No slow queries recorded yet.
                </p>
              )}
              {slowestQueries.map((q, i) => (
                <div key={i} className="border rounded-lg p-3 hover:bg-accent/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Badge variant="outline" className="font-mono shrink-0">#{i + 1}</Badge>
                      <span className="font-medium truncate">{q.query_text}</span>
                      {q.cache_hit && (
                        <Badge variant="secondary" className="shrink-0">cached</Badge>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold tabular-nums">{q.total_ms}ms</div>
                      <div className="text-xs text-muted-foreground">{q.result_count} results</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    {q.query_understanding_ms != null && (
                      <span>QU: {q.query_understanding_ms}ms</span>
                    )}
                    {q.vector_search_ms != null && <span>Search: {q.vector_search_ms}ms</span>}
                    {q.enhancement_ms != null && <span>Enhance: {q.enhancement_ms}ms</span>}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Zero-Result Queries */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              Zero-Result Queries
            </CardTitle>
            <CardDescription>
              What users searched for but didn't find — gaps in your catalog
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {zeroResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No zero-result queries in this period. Catalog coverage is good.
                </p>
              )}
              {zeroResults.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-2 border rounded hover:bg-accent/30">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="font-mono shrink-0">#{i + 1}</Badge>
                    <span className="font-medium truncate">{q.query_text}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0">
                    <Badge variant="destructive">{q.occurrences}x</Badge>
                    <span className="text-muted-foreground">{q.unique_users} users</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      {/* ─────────────────── CACHE EFFECTIVENESS TAB ─────────────────── */}
      <TabsContent value="cache" className="space-y-6">
        {cacheStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Database className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Cached Queries</p>
              </div>
              <div className="text-2xl font-bold">
                {cacheStats.total_cached_queries?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">unique entries</p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Total Cache Hits</p>
              </div>
              <div className="text-2xl font-bold">
                {cacheStats.total_cache_hits?.toLocaleString() || 0}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {cacheStats.avg_hits_per_entry?.toFixed(1) || 0} avg per entry
              </p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Time Saved</p>
              </div>
              <div className="text-2xl font-bold">
                {((cacheStats.estimated_total_ms_saved || 0) / 1000).toFixed(1)}s
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                ~{cacheStats.avg_parse_latency_saved_ms || 0}ms per hit
              </p>
            </div>

            <div className="dashboard-card">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="h-4 w-4" style={{ color: 'hsl(var(--primary))' }} />
                <p className="text-xs text-muted-foreground">Cache Age</p>
              </div>
              <div className="text-2xl font-bold">
                {cacheStats.oldest_entry
                  ? Math.round((Date.now() - new Date(cacheStats.oldest_entry).getTime()) / (1000 * 60 * 60 * 24))
                  : 0}
                d
              </div>
              <p className="text-xs text-muted-foreground mt-1">since oldest entry</p>
            </div>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Cached Queries
            </CardTitle>
            <CardDescription>
              Most-hit cache entries — these queries skip the LLM parser entirely
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topCached.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No cached queries yet. Run some searches to populate the cache.
                </p>
              )}
              {topCached.map((q, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/30">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Badge variant="outline" className="font-mono shrink-0">#{i + 1}</Badge>
                    <span className="font-medium truncate">{q.query_text}</span>
                    {q.is_product_name && (
                      <Badge variant="secondary" className="shrink-0 text-xs">product-name</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-sm shrink-0">
                    <Badge>{q.hit_count} hits</Badge>
                    <span className="text-muted-foreground tabular-nums">
                      {(q.total_ms_saved / 1000).toFixed(1)}s saved
                    </span>
                    <span className="text-xs text-muted-foreground">{q.model_used}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>
    </div>
  );
};

