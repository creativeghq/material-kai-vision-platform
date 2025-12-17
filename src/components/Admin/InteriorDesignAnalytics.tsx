import React, { useState, useEffect } from 'react';
import { DollarSign, Image, TrendingUp, Users, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from './GlobalAdminHeader';

interface GenerationStats {
  total_generations: number;
  total_cost: number;
  total_images: number;
  unique_users: number;
}

interface ModelUsage {
  model_id: string;
  model_name: string;
  usage_count: number;
  total_cost: number;
  success_rate: number;
}

export const InteriorDesignAnalytics: React.FC = () => {
  const [stats, setStats] = useState<GenerationStats>({
    total_generations: 0,
    total_cost: 0,
    total_images: 0,
    unique_users: 0,
  });
  const [modelUsage, setModelUsage] = useState<ModelUsage[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Get overall stats
      const { data: generations, error: genError } = await supabase
        .from('generation_3d')
        .select('id, user_id, total_cost, models_results')
        .eq('generation_status', 'completed')
        .not('total_cost', 'is', null);

      if (genError) throw genError;

      // Calculate stats
      const totalCost = generations?.reduce((sum, g) => sum + (Number(g.total_cost) || 0), 0) || 0;
      const uniqueUsers = new Set(generations?.map(g => g.user_id)).size;
      
      // Count total images
      let totalImages = 0;
      generations?.forEach(g => {
        if (g.models_results) {
          Object.values(g.models_results as Record<string, any>).forEach((model: any) => {
            if (model.status === 'completed' && model.image_urls) {
              totalImages += model.image_urls.length;
            }
          });
        }
      });

      setStats({
        total_generations: generations?.length || 0,
        total_cost: totalCost,
        total_images: totalImages,
        unique_users: uniqueUsers,
      });

      // Calculate model usage
      const modelStats: Record<string, { count: number; cost: number; successes: number; total: number }> = {};
      
      generations?.forEach(g => {
        if (g.models_results) {
          Object.entries(g.models_results as Record<string, any>).forEach(([modelId, modelData]: [string, any]) => {
            if (!modelStats[modelId]) {
              modelStats[modelId] = { count: 0, cost: 0, successes: 0, total: 0 };
            }
            modelStats[modelId].total++;
            if (modelData.status === 'completed') {
              modelStats[modelId].count++;
              modelStats[modelId].cost += Number(modelData.cost) || 0;
              modelStats[modelId].successes++;
            }
          });
        }
      });

      const modelUsageArray: ModelUsage[] = Object.entries(modelStats).map(([modelId, data]) => ({
        model_id: modelId,
        model_name: modelId.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        usage_count: data.count,
        total_cost: data.cost,
        success_rate: data.total > 0 ? (data.successes / data.total) * 100 : 0,
      }));

      modelUsageArray.sort((a, b) => b.total_cost - a.total_cost);
      setModelUsage(modelUsageArray);

    } catch (error) {
      console.error('Error fetching analytics:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch interior design analytics',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader />
      
      <div className="p-6 space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Interior Design Generation Analytics</h1>
            <p className="text-muted-foreground">Track model usage and costs</p>
          </div>
          <Button onClick={fetchAnalytics} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">${stats.total_cost.toFixed(2)}</div>
              <p className="text-xs text-muted-foreground">
                {stats.total_generations} generations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Images Generated</CardTitle>
              <Image className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total_images}</div>
              <p className="text-xs text-muted-foreground">
                Avg {(stats.total_images / Math.max(stats.total_generations, 1)).toFixed(1)} per job
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg Cost/Generation</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${(stats.total_cost / Math.max(stats.total_generations, 1)).toFixed(3)}
              </div>
              <p className="text-xs text-muted-foreground">Per generation</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unique Users</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.unique_users}</div>
              <p className="text-xs text-muted-foreground">Active users</p>
            </CardContent>
          </Card>
        </div>

        {/* Model Usage Table */}
        <Card>
          <CardHeader>
            <CardTitle>Model Usage & Costs</CardTitle>
            <CardDescription>Performance and cost breakdown by model</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Usage Count</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Avg Cost</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modelUsage.map((model) => (
                  <TableRow key={model.model_id}>
                    <TableCell className="font-medium">{model.model_name}</TableCell>
                    <TableCell className="text-right">{model.usage_count}</TableCell>
                    <TableCell className="text-right">${model.total_cost.toFixed(3)}</TableCell>
                    <TableCell className="text-right">
                      ${(model.total_cost / Math.max(model.usage_count, 1)).toFixed(3)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant={model.success_rate >= 90 ? 'default' : 'secondary'}>
                        {model.success_rate.toFixed(1)}%
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

