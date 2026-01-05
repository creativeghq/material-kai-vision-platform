/**
 * Price Monitoring Dashboard
 * Main interface for managing price monitoring across products
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { TrendingDown, TrendingUp, Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PriceMonitoringProduct, PriceMonitoringJob } from './types';
import { MonitoredProductsList } from './MonitoredProductsList';
import { PriceHistoryChart } from './PriceHistoryChart';
import { PriceAlertsPanel } from './PriceAlertsPanel';
import { AddProductToMonitoring } from './AddProductToMonitoring';

export const PriceMonitoringDashboard: React.FC = () => {
  const [monitoredProducts, setMonitoredProducts] = useState<PriceMonitoringProduct[]>([]);
  const [recentJobs, setRecentJobs] = useState<PriceMonitoringJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [stats, setStats] = useState({
    totalMonitored: 0,
    activeMonitoring: 0,
    priceDropsToday: 0,
    creditsUsedToday: 0,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Load monitored products
      const { data: products, error: productsError } = await supabase
        .from('price_monitoring_products')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (productsError) throw productsError;

      setMonitoredProducts(products || []);

      // Load recent jobs
      const { data: jobs, error: jobsError } = await supabase
        .from('price_monitoring_jobs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (jobsError) throw jobsError;

      setRecentJobs(jobs || []);

      // Calculate stats
      const activeCount = products?.filter(p => p.monitoring_enabled && p.status === 'active').length || 0;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const todayJobs = jobs?.filter(j => new Date(j.created_at) >= todayStart) || [];
      const creditsUsed = todayJobs.reduce((sum, j) => sum + (j.credits_consumed || 0), 0);

      setStats({
        totalMonitored: products?.length || 0,
        activeMonitoring: activeCount,
        priceDropsToday: 0, // TODO: Calculate from price_alert_history
        creditsUsedToday: creditsUsed,
      });

    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast({
        title: 'Error',
        description: 'Failed to load price monitoring data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    loadDashboardData();
  };

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Price Monitoring</h1>
          <p className="text-muted-foreground mt-1">
            Track competitor prices and get alerts on price changes
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleRefresh} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <AddProductToMonitoring onProductAdded={loadDashboardData} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Monitored</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMonitored}</div>
            <p className="text-xs text-muted-foreground">
              {stats.activeMonitoring} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Price Drops Today</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.priceDropsToday}</div>
            <p className="text-xs text-muted-foreground">
              Alerts triggered
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Credits Used Today</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.creditsUsedToday.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">
              Firecrawl credits
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Price Change</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">--</div>
            <p className="text-xs text-muted-foreground">
              Last 7 days
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="products" className="space-y-4">
        <TabsList>
          <TabsTrigger value="products">Monitored Products</TabsTrigger>
          <TabsTrigger value="alerts">Price Alerts</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
          <TabsTrigger value="jobs">Recent Jobs</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <MonitoredProductsList
            products={monitoredProducts}
            onRefresh={loadDashboardData}
          />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <PriceAlertsPanel onRefresh={loadDashboardData} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <PriceHistoryChart />
        </TabsContent>

        <TabsContent value="jobs" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Monitoring Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              {recentJobs.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No monitoring jobs yet
                </p>
              ) : (
                <div className="space-y-2">
                  {recentJobs.map((job) => (
                    <div
                      key={job.id}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Badge variant={
                            job.status === 'completed' ? 'default' :
                            job.status === 'failed' ? 'destructive' :
                            job.status === 'running' ? 'secondary' : 'outline'
                          }>
                            {job.status}
                          </Badge>
                          <span className="text-sm font-medium">
                            {job.job_type === 'on_demand' ? 'On-Demand' : 'Scheduled'}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(job.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">
                          {job.prices_found} prices found
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {job.sources_checked} sources checked
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PriceMonitoringDashboard;

