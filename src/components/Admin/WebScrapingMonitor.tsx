import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WebScrapingMetrics {
  totalScrapedPages: number;
  totalScrapedProducts: number;
  totalScrapedImages: number;
  scrapingSuccessRate: number;
  averageProductsPerPage: number;
  averageImagesPerPage: number;
  recentScrapingErrors: number;
  activeSources: number;
}

export const WebScrapingMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<WebScrapingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch web scraping data from Supabase
        // Assuming we have a way to identify scraped content (e.g., by source_type)
        const [
          { data: scrapedPages, count: totalScrapedPages },
          { data: scrapedProducts, count: totalScrapedProducts },
          { data: scrapedImages, count: totalScrapedImages },
          { data: sources },
        ] = await Promise.all([
          supabase
            .from('documents')
            .select('*', { count: 'exact' })
            .eq('source_type', 'web_scraping'),
          supabase
            .from('products')
            .select('*', { count: 'exact' })
            .eq('source_type', 'web_scraping'),
          supabase
            .from('images')
            .select('*', { count: 'exact' })
            .eq('source_type', 'web_scraping'),
          supabase
            .from('scraping_sources')
            .select('*')
            .eq('is_active', true),
        ]);

        // Calculate metrics
        const scrapingSuccessRate = totalScrapedPages > 0 
          ? ((totalScrapedPages - 0) / totalScrapedPages) * 100 
          : 0;
        const averageProductsPerPage = totalScrapedPages > 0 
          ? (totalScrapedProducts || 0) / totalScrapedPages 
          : 0;
        const averageImagesPerPage = totalScrapedPages > 0 
          ? (totalScrapedImages || 0) / totalScrapedPages 
          : 0;

        setMetrics({
          totalScrapedPages: totalScrapedPages || 0,
          totalScrapedProducts: totalScrapedProducts || 0,
          totalScrapedImages: totalScrapedImages || 0,
          scrapingSuccessRate,
          averageProductsPerPage,
          averageImagesPerPage,
          recentScrapingErrors: 0, // TODO: Implement error tracking
          activeSources: sources?.length || 0,
        });
      } catch (err) {
        console.error('Error fetching web scraping metrics:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch web scraping metrics',
        );
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-4 text-gray-600">Loading web scraping metrics...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  if (!metrics) {
    return <div className="p-4 text-gray-600">No web scraping metrics available</div>;
  }

  const MetricCard = ({ label, value, unit = '', gradient, icon }: any) => (
    <div className={`${gradient} border rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-xl">{icon}</span>}
        <div className="text-sm font-medium text-gray-700">{label}</div>
      </div>
      <div className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && <span className="text-sm ml-1 font-normal text-gray-600">{unit}</span>}
      </div>
    </div>
  );

  const hasIssues = metrics.totalScrapedPages > 0 && metrics.totalScrapedProducts === 0;

  return (
    <div className="space-y-4">
      {/* Critical Issues */}
      {hasIssues && (
        <div className="p-4 bg-gradient-to-r from-red-50 to-rose-50 border-l-4 border-red-500 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold text-red-900 mb-2">Critical Issues Detected</h3>
              <div className="space-y-2">
                {metrics.totalScrapedPages > 0 && metrics.totalScrapedProducts === 0 && (
                  <div className="text-sm text-red-700 bg-white/50 p-2 rounded">
                    <strong>❌ No products extracted:</strong> {metrics.totalScrapedPages} pages scraped but 0 products.
                    <br />
                    <span className="text-xs">→ Check web scraping selectors and product extraction logic.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Scraped Pages"
          value={metrics.totalScrapedPages}
          gradient="bg-gradient-to-br from-cyan-50 to-cyan-100 border-cyan-200"
          icon="🌐"
        />
        <MetricCard
          label="Products Extracted"
          value={metrics.totalScrapedProducts}
          gradient="bg-gradient-to-br from-green-50 to-green-100 border-green-200"
          icon="📦"
        />
        <MetricCard
          label="Images Scraped"
          value={metrics.totalScrapedImages}
          gradient="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200"
          icon="🖼️"
        />
        <MetricCard
          label="Active Sources"
          value={metrics.activeSources}
          gradient="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200"
          icon="🔗"
        />
      </div>

      {/* Success Rates & Averages */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label="Scraping Success Rate"
          value={metrics.scrapingSuccessRate}
          unit="%"
          gradient={metrics.scrapingSuccessRate > 90
            ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300"
            : "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300"}
          icon={metrics.scrapingSuccessRate > 90 ? "✅" : "⚠️"}
        />
        <MetricCard
          label="Avg Products/Page"
          value={metrics.averageProductsPerPage}
          gradient="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200"
          icon="🏷️"
        />
        <MetricCard
          label="Avg Images/Page"
          value={metrics.averageImagesPerPage}
          gradient="bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200"
          icon="🎨"
        />
      </div>

      {/* Recommendations */}
      {(metrics.totalScrapedPages > 0 && metrics.totalScrapedProducts === 0) ||
       metrics.activeSources === 0 ? (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h3 className="font-bold text-blue-900 mb-2">Recommendations</h3>
              <ul className="text-sm text-blue-800 space-y-1.5">
                {metrics.totalScrapedPages > 0 && metrics.totalScrapedProducts === 0 && (
                  <>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>Verify CSS selectors for product extraction are up to date</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span>•</span>
                      <span>Check if target websites have changed their HTML structure</span>
                    </li>
                  </>
                )}
                {metrics.activeSources === 0 && (
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>No active scraping sources configured - add sources to begin scraping</span>
                  </li>
                )}
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>Monitor scraping frequency to avoid rate limiting</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default WebScrapingMonitor;

