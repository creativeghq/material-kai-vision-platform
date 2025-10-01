import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  Brain,
  CheckCircle,
  Clock,
  Zap,
  Star,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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


// import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

import { RAGManagementPanel } from './RAGManagementPanel';
import { MetadataFieldsManagement } from './MetadataFieldsManagement';
import { AITestingPanel } from './AITestingPanel';

interface AnalyticsEvent {
  id: string;
  event_type: string;
  event_data: unknown;
  created_at: string;
  user_id: string;
}

export const AdminPanel: React.FC = () => {
  const navigate = useNavigate();
  const [analyticsData, setAnalyticsData] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalAnalyses: 0,
    avgScore: 0,
    openaiSuccess: 0,
    claudeSuccess: 0,
    avgProcessingTime: 0,
  });
  const { toast } = useToast();

  const fetchAnalyticsData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all AI-related analytics events
      // TODO: Create analytics_events table in database schema
      // const { data, error } = await supabase
      //   .from('analytics_events')
      //   .select('*')
      //   .or('event_type.ilike.%ai%,event_type.ilike.%hybrid%')
      //   .order('created_at', { ascending: false })
      //   .limit(100);

      // if (error) {
      //   throw error;
      // }

      // Mock response until analytics_events table is created
      const data: unknown = null;

      const filteredData = Array.isArray(data)
        ? data.filter((item: unknown) =>
            item && typeof item === 'object' && 'created_at' in item &&
            (item as Record<string, unknown>).created_at !== null
          ) as AnalyticsEvent[]
        : [] as AnalyticsEvent[];
      setAnalyticsData(filteredData);
      calculateStats(filteredData);
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

  const calculateStats = (data: AnalyticsEvent[]) => {
    const hybridEvents = data.filter(e => e.event_type.includes('hybrid'));

    let totalScore = 0;
    let scoreCount = 0;
    let openaiCount = 0;
    let claudeCount = 0;
    let totalProcessingTime = 0;

    hybridEvents.forEach(event => {
      const eventData = event.event_data as Record<string, unknown>;

      if (typeof eventData.final_score === 'number') {
        totalScore += eventData.final_score;
        scoreCount++;
      }

      if (eventData.final_provider === 'openai') openaiCount++;
      if (eventData.final_provider === 'claude') claudeCount++;

      if (typeof eventData.processing_time_ms === 'number') {
        totalProcessingTime += eventData.processing_time_ms;
      }
    });

    setStats({
      totalAnalyses: hybridEvents.length,
      avgScore: scoreCount > 0 ? totalScore / scoreCount : 0,
      openaiSuccess: openaiCount,
      claudeSuccess: claudeCount,
      avgProcessingTime: hybridEvents.length > 0 ? totalProcessingTime / hybridEvents.length : 0,
    });
  };

  const getScoreBadge = (score: number) => {
    if (score >= 0.9) return <Badge className="bg-green-100 text-green-800">Excellent</Badge>;
    if (score >= 0.7) return <Badge className="bg-blue-100 text-blue-800">Good</Badge>;
    if (score >= 0.5) return <Badge className="bg-yellow-100 text-yellow-800">Fair</Badge>;
    return <Badge className="bg-red-100 text-red-800">Poor</Badge>;
  };

  const getProviderBadge = (provider: string) => {
    if (provider === 'openai') return <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">OpenAI</Badge>;
    if (provider === 'claude') return <Badge className="px-2 py-1 bg-gray-200 text-gray-800">Claude</Badge>;
    return <Badge className="px-2 py-1 bg-blue-100 text-blue-800">{provider}</Badge>;
  };

  const formatTime = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  const StatCard = ({ title, value, icon: Icon, description }: {
    title: string;
    value: string | number;
    icon: React.ComponentType<{ className?: string }>;
    description: string;
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-4" />
          <p>Loading admin panel...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header with Navigation */}
      <div className="border-b bg-card px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Button
                onClick={() => navigate('/')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <Activity className="h-4 w-4" />
                Back to Main
              </Button>
              <Button
                onClick={() => navigate('/admin')}
                className="px-2 py-1 text-sm border border-gray-300 hover:bg-gray-50 flex items-center gap-2"
              >
                <BarChart3 className="h-4 w-4" />
                Back to Admin
              </Button>
            </div>
            <div className="h-6 w-px bg-border" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Admin Panel</h1>
              <p className="text-sm text-muted-foreground">
                AI Performance Analytics & System Overview
              </p>
            </div>
          </div>
          <Button onClick={fetchAnalyticsData} disabled={loading}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-6 space-y-6">

      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title="Total Analyses"
          value={stats.totalAnalyses}
          icon={Brain}
          description="Hybrid AI analyses completed"
        />
        <StatCard
          title="Average Score"
          value={stats.avgScore.toFixed(2)}
          icon={Star}
          description="Overall quality rating"
        />
        <StatCard
          title="OpenAI Success"
          value={stats.openaiSuccess}
          icon={CheckCircle}
          description="Analyses completed by OpenAI"
        />
        <StatCard
          title="Claude Success"
          value={stats.claudeSuccess}
          icon={Zap}
          description="Analyses completed by Claude"
        />
        <StatCard
          title="Avg Processing"
          value={`${(stats.avgProcessingTime / 1000).toFixed(1)}s`}
          icon={Clock}
          description="Average processing time"
        />
      </div>

      <Tabs defaultValue="recent" className="space-y-4">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="recent">Recent Activity</TabsTrigger>
          <TabsTrigger value="scores">Score Analysis</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="rag">RAG System</TabsTrigger>
          <TabsTrigger value="metadata">Metadata Fields</TabsTrigger>
          <TabsTrigger value="testing">AI Testing</TabsTrigger>
        </TabsList>

        <TabsContent value="recent" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent AI Analysis Events</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Processing Time</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {analyticsData.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="text-sm">
                        {formatTime(event.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge className="px-2 py-1 border border-gray-300 bg-white text-gray-700">{event.event_type}</Badge>
                      </TableCell>
                      <TableCell>
                        {(event.event_data as Record<string, unknown>).final_score ?
                          getScoreBadge((event.event_data as Record<string, unknown>).final_score as number) :
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        {(event.event_data as Record<string, unknown>).final_provider ?
                          getProviderBadge((event.event_data as Record<string, unknown>).final_provider as string) :
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        {(event.event_data as Record<string, unknown>).processing_time_ms ?
                          `${((event.event_data as Record<string, unknown>).processing_time_ms as number / 1000).toFixed(2)}s` :
                          '-'
                        }
                      </TableCell>
                      <TableCell>
                        <details className="cursor-pointer">
                          <summary className="text-sm text-blue-600 hover:text-blue-800">
                            View JSON
                          </summary>
                          <pre className="text-xs bg-gray-50 p-2 mt-2 rounded overflow-auto max-w-xs">
                            {JSON.stringify(event.event_data, null, 2)}
                          </pre>
                        </details>
                      </TableCell>
                    </TableRow>
                  ))}
                  {analyticsData.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <div className="text-muted-foreground">
                          <BarChart3 className="h-8 w-8 mx-auto mb-2" />
                          No analytics data yet. Try uploading some materials for AI analysis!
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scores" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Score Distribution Analysis</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {analyticsData.filter(e => {
                        const eventData = e.event_data as Record<string, unknown>;
                        return typeof eventData.final_score === 'number' && eventData.final_score >= 0.9;
                      }).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Excellent (≥0.9)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {analyticsData.filter(e => {
                        const score = (e.event_data as Record<string, unknown>).final_score;
                        return typeof score === 'number' && score >= 0.7 && score < 0.9;
                      }).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Good (0.7-0.9)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-yellow-600">
                      {analyticsData.filter(e => {
                        const score = (e.event_data as Record<string, unknown>).final_score;
                        return typeof score === 'number' && score >= 0.5 && score < 0.7;
                      }).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Fair (0.5-0.7)</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {analyticsData.filter(e => {
                        const score = (e.event_data as Record<string, unknown>).final_score;
                        return typeof score === 'number' && score < 0.5;
                      }).length}
                    </div>
                    <div className="text-sm text-muted-foreground">Poor (&lt;0.5)</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Provider Performance Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold mb-2">Provider Usage</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>OpenAI</span>
                      <span className="font-mono">{stats.openaiSuccess}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Claude</span>
                      <span className="font-mono">{stats.claudeSuccess}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="font-semibold mb-2">Performance Metrics</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Success Rate</span>
                      <span className="font-mono">
                        {((stats.openaiSuccess + stats.claudeSuccess) / Math.max(stats.totalAnalyses, 1) * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Avg Score</span>
                      <span className="font-mono">{stats.avgScore.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rag" className="space-y-4">
          <RAGManagementPanel />
        </TabsContent>

        <TabsContent value="metadata" className="space-y-4">
          <MetadataFieldsManagement />
        </TabsContent>

        <TabsContent value="testing" className="space-y-4">
          <AITestingPanel />
        </TabsContent>
      </Tabs>
      </div>
    </div>
  );
};
