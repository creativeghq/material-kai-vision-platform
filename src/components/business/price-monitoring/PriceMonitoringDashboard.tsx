/**
 * Price Monitoring Dashboard — internal flow.
 *
 * Lists every product enrolled in monitoring (tracked_queries with
 * api_key_id IS NULL) and surfaces top-level stats. Per-product detail
 * lives in `ProductMonitorTab`.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { TrendingDown, Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { TrackedQuery } from '@/services/priceMonitoringApi';
import { MonitoredProductsList } from './MonitoredProductsList';
import { PriceHistoryChart } from './PriceHistoryChart';
import { PriceAlertsPanel } from './PriceAlertsPanel';
import { AddProductToMonitoring } from './AddProductToMonitoring';
import { SectionHeader } from '@/components/shared/SectionHeader';

export const PriceMonitoringDashboard: React.FC = () => {
  const [monitoredProducts, setMonitoredProducts] = useState<TrackedQuery[]>([]);
  // The Price History tab mounted <PriceHistoryChart /> with NO props while the dashboard held
  // no selection state at all, so the chart hit its `if (!productId)` guard and rendered
  // "Select a product to view its price trends" — with no selector anywhere on the page to
  // satisfy it. The tab could never draw a chart. (audit #305 finding 11)
  const [historyProductId, setHistoryProductId] = useState<string>('');
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
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Internal-flow rows: api_key_id IS NULL + product_id NOT NULL.
      const { data: rows, error: rowsError } = await supabase
        .from('tracked_queries')
        .select('*')
        .eq('user_id', user.id)
        .is('api_key_id', null)
        .not('product_id', 'is', null)
        .order('created_at', { ascending: false });

      if (rowsError) throw rowsError;
      const products = (rows ?? []) as unknown as TrackedQuery[];
      setMonitoredProducts(products);

      const activeCount = products.filter((p) => p.is_active).length;

      // Credits today — sum the latest refresh credits across active rows.
      // Rough approximation; precise per-day spend lives in ai_usage_logs.
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      let creditsUsed = 0;
      for (const p of products) {
        if (
          p.last_refreshed_at
          && new Date(p.last_refreshed_at) >= todayStart
          && p.last_refresh_credits_used
        ) {
          creditsUsed += p.last_refresh_credits_used;
        }
      }

      // Price drops today — read from the unified alert log.
      const { count: priceDropCount } = await supabase
        .from('price_alert_log')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('alert_type', 'price_drop')
        .gte('created_at', todayStart.toISOString());

      setStats({
        totalMonitored: products.length,
        activeMonitoring: activeCount,
        priceDropsToday: priceDropCount ?? 0,
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
      <SectionHeader
        title="Price Monitoring"
        subtitle="Track competitor prices and get alerts on price changes"
        actions={(
          <>
            <Button onClick={handleRefresh} variant="outline" size="sm" disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <AddProductToMonitoring onProductAdded={loadDashboardData} />
          </>
        )}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium">Total Monitored</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalMonitored}</div>
            <p className="text-xs text-muted-foreground">{stats.activeMonitoring} active</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium">Price Drops Today</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.priceDropsToday}</div>
            <p className="text-xs text-muted-foreground">Alerts triggered</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="font-medium">Credits Used Today</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.creditsUsedToday.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Discovery + verification</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="products" className="space-y-4">
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="products">Monitored Products</TabsTrigger>
          <TabsTrigger value="alerts">Price Alerts</TabsTrigger>
          <TabsTrigger value="history">Price History</TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-4">
          <MonitoredProductsList products={monitoredProducts} onRefresh={loadDashboardData} />
        </TabsContent>

        <TabsContent value="alerts" className="space-y-4">
          <PriceAlertsPanel onRefresh={loadDashboardData} />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          {(() => {
            // Only products with a product_id can be charted — PriceHistoryChart keys on it.
            const chartable = monitoredProducts.filter((p) => !!p.product_id);
            if (chartable.length === 0) {
              return (
                <p className="text-sm text-muted-foreground">
                  No monitored product has price history yet. Add one from the Monitored Products tab.
                </p>
              );
            }
            return (
              <>
                <Select value={historyProductId} onValueChange={setHistoryProductId}>
                  <SelectTrigger className="w-full sm:w-96">
                    <SelectValue placeholder="Select a product to chart" />
                  </SelectTrigger>
                  <SelectContent>
                    {chartable.map((p) => (
                      <SelectItem key={p.id} value={p.product_id as string}>
                        {p.search_query}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <PriceHistoryChart productId={historyProductId || undefined} />
              </>
            );
          })()}
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PriceMonitoringDashboard;
