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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');
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

      {/* Stats Overview */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSearches.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                {stats.avgSearchesPerUser.toFixed(1)} per user
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.uniqueUsers.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Active searchers</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Save Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.savedSearchRate.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">Searches saved</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Moodboard Rate</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.moodboardConversionRate.toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Added to moodboards</p>
            </CardContent>
          </Card>
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
                  Math.round((material.mention_count / 10) * 100)
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
    </div>
  );
};

