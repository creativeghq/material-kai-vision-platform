/**
 * Price History Chart
 * Displays price trends over time with interactive chart
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface PriceHistoryChartProps {
  productId?: string;
  productName?: string;
  timeRange?: '7d' | '30d' | '90d' | 'all';
}

interface PriceDataPoint {
  date: string;
  price: number;
  source: string;
  availability: string;
}

export const PriceHistoryChart: React.FC<PriceHistoryChartProps> = ({
  productId,
  productName,
  timeRange = '30d',
}) => {
  const [priceData, setPriceData] = useState<PriceDataPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({
    currentPrice: 0,
    lowestPrice: 0,
    highestPrice: 0,
    averagePrice: 0,
    priceChange: 0,
    priceChangePercent: 0,
  });

  useEffect(() => {
    if (productId) {
      loadPriceHistory();
    }
  }, [productId, timeRange]);

  const loadPriceHistory = async () => {
    if (!productId) return;

    try {
      setIsLoading(true);

      // Calculate date range
      const now = new Date();
      let startDate = new Date();
      switch (timeRange) {
        case '7d':
          startDate.setDate(now.getDate() - 7);
          break;
        case '30d':
          startDate.setDate(now.getDate() - 30);
          break;
        case '90d':
          startDate.setDate(now.getDate() - 90);
          break;
        case 'all':
          startDate = new Date(0); // Beginning of time
          break;
      }

      // Fetch price history
      const { data, error } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .gte('scraped_at', startDate.toISOString())
        .order('scraped_at', { ascending: true });

      if (error) throw error;

      // Transform data for chart
      const chartData: PriceDataPoint[] = (data || []).map((item) => ({
        date: new Date(item.scraped_at).toLocaleDateString(),
        price: item.price,
        source: item.source_name,
        availability: item.availability,
      }));

      setPriceData(chartData);

      // Calculate statistics
      if (chartData.length > 0) {
        const prices = chartData.map((d) => d.price);
        const currentPrice = prices[prices.length - 1];
        const lowestPrice = Math.min(...prices);
        const highestPrice = Math.max(...prices);
        const averagePrice = prices.reduce((a, b) => a + b, 0) / prices.length;
        const firstPrice = prices[0];
        const priceChange = currentPrice - firstPrice;
        const priceChangePercent = ((priceChange / firstPrice) * 100);

        setStats({
          currentPrice,
          lowestPrice,
          highestPrice,
          averagePrice,
          priceChange,
          priceChangePercent,
        });
      }
    } catch (error) {
      console.error('Failed to load price history:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!productId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Price History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              Select a product to view its price trends
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Price History</CardTitle>
            {productName && (
              <p className="text-sm text-muted-foreground mt-1">{productName}</p>
            )}
          </div>
          {priceData.length > 0 && (
            <div className="flex items-center gap-2">
              {stats.priceChangePercent > 0 ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3" />
                  +{stats.priceChangePercent.toFixed(1)}%
                </Badge>
              ) : stats.priceChangePercent < 0 ? (
                <Badge variant="default" className="flex items-center gap-1 bg-green-600">
                  <TrendingDown className="h-3 w-3" />
                  {stats.priceChangePercent.toFixed(1)}%
                </Badge>
              ) : (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Minus className="h-3 w-3" />
                  No change
                </Badge>
              )}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading price history...</p>
          </div>
        ) : priceData.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              No price history available for this product
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Check competitor prices to start tracking
            </p>
          </div>
        ) : (
          <>
            {/* Statistics Cards */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Current</p>
                <p className="text-lg font-bold text-gray-900">
                  ${stats.currentPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Lowest</p>
                <p className="text-lg font-bold text-green-600">
                  ${stats.lowestPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Highest</p>
                <p className="text-lg font-bold text-red-600">
                  ${stats.highestPrice.toFixed(2)}
                </p>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                <p className="text-xs text-gray-600 mb-1">Average</p>
                <p className="text-lg font-bold text-gray-900">
                  ${stats.averagePrice.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default PriceHistoryChart;
