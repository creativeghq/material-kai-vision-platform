/**
 * Monitored Products List
 * Displays list of products being monitored with controls
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Play, Pause, Settings, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PriceMonitoringProduct } from './types';

interface MonitoredProductsListProps {
  products: PriceMonitoringProduct[];
  onRefresh: () => void;
}

export const MonitoredProductsList: React.FC<MonitoredProductsListProps> = ({
  products,
  onRefresh,
}) => {
  const [productDetails, setProductDetails] = useState<Record<string, any>>({});
  const [latestPrices, setLatestPrices] = useState<Record<string, any>>({});
  const { toast } = useToast();

  useEffect(() => {
    if (products.length > 0) {
      loadProductDetails();
      loadLatestPrices();
    }
  }, [products]);

  const loadProductDetails = async () => {
    const productIds = products.map(p => p.product_id);

    const { data, error } = await supabase
      .from('products')
      .select('id, name, metadata')
      .in('id', productIds);

    if (!error && data) {
      const detailsMap = data.reduce((acc, product) => {
        acc[product.id] = product;
        return acc;
      }, {} as Record<string, any>);
      setProductDetails(detailsMap);
    }
  };

  const loadLatestPrices = async () => {
    const productIds = products.map(p => p.product_id);

    // Get latest price for each product
    const pricesMap: Record<string, any> = {};

    for (const productId of productIds) {
      const { data } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .order('scraped_at', { ascending: false })
        .limit(2); // Get last 2 to calculate trend

      if (data && data.length > 0) {
        pricesMap[productId] = {
          current: data[0],
          previous: data[1] || null,
        };
      }
    }

    setLatestPrices(pricesMap);
  };

  const handleToggleMonitoring = async (productId: string, currentlyEnabled: boolean) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('price_monitoring_products')
        .update({
          monitoring_enabled: !currentlyEnabled,
          status: !currentlyEnabled ? 'active' : 'paused',
        })
        .eq('product_id', productId)
        .eq('user_id', user.id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Monitoring ${!currentlyEnabled ? 'enabled' : 'paused'}`,
      });

      onRefresh();
    } catch (error) {
      console.error('Error toggling monitoring:', error);
      toast({
        title: 'Error',
        description: 'Failed to update monitoring status',
        variant: 'destructive',
      });
    }
  };

  const handleCheckNow = async (productId: string) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/price-monitoring`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'check_now',
            productId,
          }),
        },
      );

      const result = await response.json();

      if (result.success) {
        toast({
          title: 'Success',
          description: `Price check started. ${result.results?.pricesFound || 0} prices found.`,
        });
        onRefresh();
      } else {
        throw new Error(result.error || 'Failed to check prices');
      }
    } catch (error) {
      console.error('Error checking prices:', error);
      toast({
        title: 'Error',
        description: 'Failed to start price check',
        variant: 'destructive',
      });
    }
  };

  const getPriceTrend = (productId: string) => {
    const prices = latestPrices[productId];
    if (!prices || !prices.previous) return null;

    const change = prices.current.price - prices.previous.price;
    const changePercent = ((change / prices.previous.price) * 100).toFixed(1);

    if (change < 0) {
      return { icon: TrendingDown, color: 'text-green-600', text: `${changePercent}%` };
    } else if (change > 0) {
      return { icon: TrendingUp, color: 'text-red-600', text: `+${changePercent}%` };
    } else {
      return { icon: Minus, color: 'text-gray-600', text: '0%' };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Monitored Products</CardTitle>
      </CardHeader>
      <CardContent>
        {products.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No products being monitored yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Add products to start tracking competitor prices
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Current Price</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Check</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => {
                const details = productDetails[product.product_id];
                const prices = latestPrices[product.product_id];
                const trend = getPriceTrend(product.product_id);
                const TrendIcon = trend?.icon;

                return (
                  <TableRow key={product.id}>
                    <TableCell className="font-medium">
                      {details?.name || 'Loading...'}
                    </TableCell>
                    <TableCell>
                      {prices?.current ? (
                        <span className="font-semibold">
                          ${prices.current.price.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">--</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {trend && TrendIcon && (
                        <div className={`flex items-center gap-1 ${trend.color}`}>
                          <TrendIcon className="h-4 w-4" />
                          <span className="text-sm font-medium">{trend.text}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {product.monitoring_frequency}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={
                        product.status === 'active' ? 'default' :
                        product.status === 'error' ? 'destructive' : 'secondary'
                      }>
                        {product.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {product.last_check_at
                        ? new Date(product.last_check_at).toLocaleString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Switch
                          checked={product.monitoring_enabled}
                          onCheckedChange={() =>
                            handleToggleMonitoring(product.product_id, product.monitoring_enabled)
                          }
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCheckNow(product.product_id)}
                          disabled={!product.monitoring_enabled}
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
};

export default MonitoredProductsList;

