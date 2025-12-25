/**
 * Product Monitor Tab
 * On-demand price monitoring tab for individual product pages
 * Shows competitor prices, price history, and allows manual price checks
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  TrendingDown,
  TrendingUp,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  Plus,
  Settings,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CompetitorSourceManager } from './CompetitorSourceManager';

interface ProductMonitorTabProps {
  productId: string;
  productName: string;
  currentPrice?: number;
  currency?: string;
}

interface CompetitorPrice {
  id: string;
  source_name: string;
  source_url: string;
  price: number;
  currency: string;
  availability: string;
  scraped_at: string;
}

interface CompetitorSource {
  id: string;
  source_name: string;
  source_url: string;
  is_active: boolean;
  last_successful_scrape: string | null;
}

export const ProductMonitorTab: React.FC<ProductMonitorTabProps> = ({
  productId,
  productName,
  currentPrice,
  currency = 'USD',
}) => {
  const [isChecking, setIsChecking] = useState(false);
  const [competitorPrices, setCompetitorPrices] = useState<CompetitorPrice[]>([]);
  const [competitorSources, setCompetitorSources] = useState<CompetitorSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddSource, setShowAddSource] = useState(false);
  const [isUpdatingTracking, setIsUpdatingTracking] = useState(false);
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [monitoringFrequency, setMonitoringFrequency] = useState<'hourly' | 'daily' | 'weekly' | 'on_demand'>('daily');
  const { toast } = useToast();

  useEffect(() => {
    loadCompetitorData();
    loadMonitoringConfig();
  }, [productId]);

  const loadMonitoringConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('price_monitoring_products')
        .select('monitoring_enabled, monitoring_frequency')
        .eq('product_id', productId)
        .single();

      if (error && error.code !== 'PGRST116') {
        // PGRST116 is "not found" - that's okay, just means not configured yet
        throw error;
      }

      if (data) {
        setMonitoringEnabled(data.monitoring_enabled || false);
        setMonitoringFrequency(data.monitoring_frequency || 'daily');
      }
    } catch (error) {
      console.error('Failed to load monitoring config:', error);
    }
  };

  const loadCompetitorData = async () => {
    try {
      setIsLoading(true);

      // Load competitor sources
      const { data: sources, error: sourcesError } = await supabase
        .from('competitor_sources')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });

      if (sourcesError) throw sourcesError;
      setCompetitorSources(sources || []);

      // Load latest prices
      const { data: prices, error: pricesError } = await supabase
        .from('price_history')
        .select('*')
        .eq('product_id', productId)
        .order('scraped_at', { ascending: false })
        .limit(10);

      if (pricesError) throw pricesError;
      setCompetitorPrices(prices || []);

    } catch (error: any) {
      console.error('Failed to load competitor data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load competitor data',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCheckNow = async () => {
    try {
      setIsChecking(true);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Authentication Required',
          description: 'Please sign in to check competitor prices',
          variant: 'destructive',
        });
        return;
      }

      // Call the price monitoring Edge Function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/price-monitoring`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            action: 'check_now',
            productId: productId,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to check prices');
      }

      const result = await response.json();

      toast({
        title: 'Price Check Complete',
        description: `Checked ${result.sourcesChecked || 0} sources, found ${result.pricesFound || 0} prices`,
      });

      // Reload data
      await loadCompetitorData();

    } catch (error: any) {
      console.error('Failed to check prices:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to check competitor prices',
        variant: 'destructive',
      });
    } finally {
      setIsChecking(false);
    }
  };

  const handleUpdateTracking = async () => {
    try {
      setIsUpdatingTracking(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: 'Error',
          description: 'You must be logged in to update price tracking',
          variant: 'destructive',
        });
        return;
      }

      // Calculate next check time based on frequency
      let nextCheckAt = null;
      if (monitoringFrequency !== 'on_demand') {
        const now = new Date();
        switch (monitoringFrequency) {
          case 'hourly':
            nextCheckAt = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
            break;
          case 'daily':
            nextCheckAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
            break;
          case 'weekly':
            nextCheckAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
            break;
        }
      }

      // Upsert monitoring configuration
      const { error } = await supabase
        .from('price_monitoring_products')
        .upsert({
          product_id: productId,
          user_id: user.id,
          monitoring_enabled: monitoringEnabled,
          monitoring_frequency: monitoringFrequency,
          next_check_at: nextCheckAt,
          status: monitoringEnabled ? 'active' : 'paused',
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'product_id,user_id'
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Price tracking ${monitoringEnabled ? 'enabled' : 'disabled'} with ${monitoringFrequency} frequency`,
      });

      // If enabled, trigger an immediate check
      if (monitoringEnabled) {
        await handleCheckNow();
      }
    } catch (error) {
      console.error('Failed to update tracking:', error);
      toast({
        title: 'Error',
        description: 'Failed to update price tracking configuration',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingTracking(false);
    }
  };

  const getPriceDifference = (competitorPrice: number) => {
    if (!currentPrice) return null;
    const diff = ((competitorPrice - currentPrice) / currentPrice) * 100;
    return diff;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Check Now Button */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Price Monitoring</h3>
          <p className="text-sm text-gray-600">
            Track competitor prices and get alerts on price changes
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={() => setShowAddSource(true)}
            variant="outline"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Source
          </Button>
          <Button
            onClick={handleCheckNow}
            disabled={isChecking || competitorSources.length === 0}
            size="sm"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isChecking ? 'animate-spin' : ''}`} />
            Check Now
          </Button>
        </div>
      </div>

      {/* Price Tracking Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Automated Price Tracking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium text-gray-900">
                  Enable Automated Tracking
                </label>
                <p className="text-xs text-gray-500">
                  Automatically check competitor prices on a schedule
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={monitoringEnabled}
                  onChange={(e) => setMonitoringEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900">
                Monitoring Frequency
              </label>
              <select
                value={monitoringFrequency}
                onChange={(e) => setMonitoringFrequency(e.target.value as any)}
                disabled={!monitoringEnabled}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="on_demand">On-Demand Only</option>
              </select>
            </div>

            <Button
              onClick={handleUpdateTracking}
              disabled={isUpdatingTracking}
              className="w-full"
              size="sm"
            >
              <Clock className={`h-4 w-4 mr-2 ${isUpdatingTracking ? 'animate-spin' : ''}`} />
              {isUpdatingTracking ? 'Updating...' : 'Update Price Tracking'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* No Sources Alert */}
      {competitorSources.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No competitor sources configured. Add competitor URLs to start tracking prices.
          </AlertDescription>
        </Alert>
      )}

      {/* Competitor Sources */}
      {competitorSources.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competitor Sources ({competitorSources.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {competitorSources.map((source) => (
                <div
                  key={source.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{source.source_name}</span>
                      <Badge variant={source.is_active ? 'default' : 'secondary'}>
                        {source.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                    <a
                      href={source.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-1"
                    >
                      {source.source_url}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {source.last_successful_scrape && (
                      <p className="text-xs text-gray-500 mt-1">
                        Last checked: {new Date(source.last_successful_scrape).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="sm">
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Latest Competitor Prices */}
      {competitorPrices.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Prices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {competitorPrices.map((price) => {
                const priceDiff = getPriceDifference(price.price);
                return (
                  <div
                    key={price.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{price.source_name}</span>
                        <Badge
                          variant={
                            price.availability === 'in_stock'
                              ? 'default'
                              : price.availability === 'out_of_stock'
                              ? 'destructive'
                              : 'secondary'
                          }
                        >
                          {price.availability.replace('_', ' ')}
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(price.scraped_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-gray-900">
                        {price.currency === 'EUR' ? '€' : '$'}
                        {price.price.toFixed(2)}
                      </div>
                      {priceDiff !== null && (
                        <div className="flex items-center gap-1 text-xs">
                          {priceDiff > 0 ? (
                            <>
                              <TrendingUp className="h-3 w-3 text-red-600" />
                              <span className="text-red-600">+{priceDiff.toFixed(1)}%</span>
                            </>
                          ) : priceDiff < 0 ? (
                            <>
                              <TrendingDown className="h-3 w-3 text-green-600" />
                              <span className="text-green-600">{priceDiff.toFixed(1)}%</span>
                            </>
                          ) : (
                            <span className="text-gray-500">Same price</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {competitorSources.length > 0 && competitorPrices.length === 0 && (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No price data available yet. Click "Check Now" to fetch the latest prices.
          </AlertDescription>
        </Alert>
      )}

      {/* Add Source Dialog */}
      <CompetitorSourceManager
        productId={productId}
        isOpen={showAddSource}
        onClose={() => setShowAddSource(false)}
        onSourceAdded={loadCompetitorData}
      />
    </div>
  );
};

