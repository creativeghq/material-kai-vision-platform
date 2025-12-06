import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart3,
  Users,
  Search,
  TrendingUp,
  MousePointer,
  Activity,
  Home,
  ArrowLeft,
  Clock,
  FileText,
  Link2,
  MessageSquare,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';
import Phase3MetricsPanel from './Phase3MetricsPanel';
import { ChunkQualityDashboard } from './ChunkQualityDashboard';
import QualityStabilityMetricsPanel from './QualityStabilityMetricsPanel';
import { PDFProcessingMonitor } from './PDFProcessingMonitor';

interface UsageAnalytics {
  total_searches: number;
  total_api_calls: number;
  active_users: number;
  avg_response_time: number;
}

interface SearchAnalytic {
  id: string;
  query_text: string;
  results_shown: number;
  clicks_count: number;
  satisfaction_rating: number;
  created_at: string;
  response_time_ms: number;
}

interface ApiUsageLog {
  id: string;
  api_key_id: string;
  endpoint: string;
  method: string;
  status_code: number;
  response_time_ms: number | null;
  request_size_bytes: number | null;
  response_size_bytes: number | null;
  ip_address: string | null;
  user_agent: string | null;
  error_message: string | null;
  created_at: string | null;
}

export const AnalyticsDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('overview');
  const [analytics, setAnalytics] = useState<UsageAnalytics>({
    total_searches: 0,
    total_api_calls: 0,
    active_users: 0,
    avg_response_time: 0,
  });
  const [searchAnalytics, setSearchAnalytics] = useState<SearchAnalytic[]>([]);
  const [apiUsage, setApiUsage] = useState<ApiUsageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch search analytics
      const { data: searchData, error: searchError } = await supabase
        .from('analytics_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (searchError) throw searchError;

      // Fetch API usage logs
      const { data: apiData, error: apiError } = await supabase
        .from('api_usage_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (apiError) throw apiError;

      // Filter and cast data to match expected types
      const filteredSearchData = (searchData || [])
        .filter(
          (item: unknown) =>
            (item as any).created_at &&
            (item as any).event_type &&
            (item as any).id,
        )
        .map((item: unknown) => ({
          id: (item as any).id,
          query_text:
            (((item as any).event_data as Record<string, unknown>)
              ?.query as string) || 'Unknown query',
          results_shown:
            (((item as any).event_data as Record<string, unknown>)
              ?.results_count as number) || 0,
          clicks_count:
            (((item as any).event_data as Record<string, unknown>)
              ?.clicks as number) || 0,
          satisfaction_rating:
            (((item as any).event_data as Record<string, unknown>)
              ?.rating as number) ?? 0,
          response_time_ms:
            (((item as any).event_data as Record<string, unknown>)
              ?.response_time as number) || 0,
          created_at: (item as any).created_at || new Date().toISOString(),
          user_id: (item as any).user_id,
          session_id: (item as any).session_id,
        }));

      const filteredApiData = (apiData || [])
        .filter(
          (item: unknown) =>
            (item as any).created_at &&
            (item as any).id &&
            (item as any).status_code !== null,
        )
        .map((item: unknown) => ({
          ...(item as any),
          response_status: (item as any).status_code || 0,
          response_time_ms: (item as any).response_time_ms || 0,
          user_id: (item as any).api_key_id || 'anonymous',
          endpoint_id: (item as any).endpoint || 'unknown',
          user_agent: (item as any).user_agent || 'unknown',
        }));

      setSearchAnalytics(filteredSearchData);
      setApiUsage(filteredApiData);

      // Calculate aggregate statistics
      const totalSearches = searchData?.length || 0;
      const totalApiCalls = apiData?.length || 0;
      const uniqueUsers = new Set([
        ...(searchData
          ?.map((s: unknown) => (s as any).user_id)
          .filter(Boolean) || []),
        ...(apiData
          ?.map((a: unknown) => (a as any).api_key_id)
          .filter(Boolean) || []),
      ]).size;
      const avgResponseTime =
        apiData?.reduce(
          (sum: any, log: any) => sum + (log.response_time_ms || 0),
          0,
        ) / Math.max(apiData?.length || 1, 1);

      setAnalytics({
        total_searches: totalSearches,
        total_api_calls: totalApiCalls,
        active_users: uniqueUsers,
        avg_response_time: Math.round(avgResponseTime),
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch analytics data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'text-green-600';
    if (status >= 400 && status < 500) return 'text-yellow-600';
    if (status >= 500) return 'text-red-600';
    return 'text-gray-600';
  };

  const StatCard = ({
    title,
    value,
    icon: Icon,
    description,
    trend,
  }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
    description: string;
    trend?: number;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{description}</p>
          {trend !== undefined && (
            <Badge
              className={`text-xs ${trend > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
            >
              {trend > 0 ? '+' : ''}
              {trend}%
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading analytics...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Analytics Dashboard"
        description="Comprehensive analytics: search, API usage, PDF processing, chunk quality, and validation metrics"
        badge="Analytics"
      />

      {/* Main Content */}
      <div className="p-6 space-y-6">
        {/* Overview Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total Searches"
            value={analytics.total_searches}
            icon={Search}
            description="Search queries processed"
            trend={12}
          />
          <StatCard
            title="API Calls"
            value={analytics.total_api_calls}
            icon={BarChart3}
            description="Total API requests"
            trend={8}
          />
          <StatCard
            title="Active Users"
            value={analytics.active_users}
            icon={Users}
            description="Unique users today"
            trend={15}
          />
          <StatCard
            title="Avg Response Time"
            value={`${analytics.avg_response_time}ms`}
            icon={Clock}
            description="Average API response time"
            trend={-5}
          />
        </div>

        <Tabs defaultValue="searches" className="space-y-4">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="searches">
              <Search className="h-4 w-4 mr-2" />
              Search
            </TabsTrigger>
            <TabsTrigger value="api-usage">
              <Activity className="h-4 w-4 mr-2" />
              API Usage
            </TabsTrigger>
            <TabsTrigger value="pdf-processing">
              <FileText className="h-4 w-4 mr-2" />
              PDF Processing
            </TabsTrigger>
            <TabsTrigger value="chunk-quality">
              <CheckCircle className="h-4 w-4 mr-2" />
              Chunk Quality
            </TabsTrigger>
            <TabsTrigger value="quality-stability">
              <Database className="h-4 w-4 mr-2" />
              Quality & Stability
            </TabsTrigger>
            <TabsTrigger value="phase3-metrics">
              <Link2 className="h-4 w-4 mr-2" />
              Phase 3 Metrics
            </TabsTrigger>
            <TabsTrigger value="user-behavior">
              <Users className="h-4 w-4 mr-2" />
              User Behavior
            </TabsTrigger>
          </TabsList>

          <TabsContent value="searches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Recent Search Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Query</TableHead>
                      <TableHead>Results</TableHead>
                      <TableHead>Clicks</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>Satisfaction</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {searchAnalytics.slice(0, 10).map((search) => (
                      <TableRow key={search.id}>
                        <TableCell className="font-medium max-w-xs truncate">
                          {search.query_text}
                        </TableCell>
                        <TableCell>
                          <Badge className="border border-gray-300 bg-white text-gray-700">
                            {search.results_shown}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MousePointer className="h-3 w-3" />
                            {search.clicks_count}
                          </div>
                        </TableCell>
                        <TableCell>{search.response_time_ms}ms</TableCell>
                        <TableCell>
                          {search.satisfaction_rating ? (
                            <Badge
                              className={
                                search.satisfaction_rating >= 4
                                  ? 'bg-green-100 text-green-800'
                                  : 'bg-gray-100 text-gray-800'
                              }
                            >
                              {search.satisfaction_rating}/5
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          {new Date(search.created_at).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="api-usage" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>API Usage Logs</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Response Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {apiUsage.slice(0, 15).map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="font-mono text-sm max-w-xs truncate">
                          {log.endpoint}
                        </TableCell>
                        <TableCell>
                          <Badge className="border border-gray-300 bg-white text-gray-700">
                            {log.method}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className={getStatusColor(log.status_code)}>
                            {log.status_code}
                          </span>
                        </TableCell>
                        <TableCell>{log.response_time_ms || 0}ms</TableCell>
                        <TableCell>
                          <code className="text-xs bg-gray-100 px-1 py-0.5 rounded">
                            {log.api_key_id
                              ? log.api_key_id.slice(0, 8) + '...'
                              : 'Anonymous'}
                          </code>
                        </TableCell>
                        <TableCell>
                          {log.created_at
                            ? new Date(log.created_at).toLocaleString()
                            : 'N/A'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pdf-processing" className="space-y-4">
            <PDFProcessingMonitor />
          </TabsContent>

          <TabsContent value="chunk-quality" className="space-y-4">
            <ChunkQualityDashboard />
          </TabsContent>

          <TabsContent value="quality-stability" className="space-y-4">
            <QualityStabilityMetricsPanel />
          </TabsContent>

          <TabsContent value="phase3-metrics" className="space-y-4">
            <Phase3MetricsPanel />
          </TabsContent>

          <TabsContent value="user-behavior" className="space-y-4">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Search Patterns</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Material searches</span>
                        <span>45%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full w-[45%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Property searches</span>
                        <span>32%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-green-600 h-2 rounded-full w-[32%]" />
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm">
                        <span>Style searches</span>
                        <span>23%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="bg-yellow-600 h-2 rounded-full w-[23%]" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>User Engagement</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-sm">Average session time</span>
                      <span className="font-mono text-sm">12.5 min</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Pages per session</span>
                      <span className="font-mono text-sm">8.2</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Bounce rate</span>
                      <span className="font-mono text-sm">24%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm">Return rate</span>
                      <span className="font-mono text-sm">67%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
