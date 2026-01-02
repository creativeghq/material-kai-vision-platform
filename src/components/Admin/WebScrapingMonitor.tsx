import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface WebScrapingMetrics {
  totalScrapedPages: number;
  totalScrapedProducts: number;
  totalScrapedImages: number;
  totalScrapedChunks: number;
  totalScrapedEmbeddings: number;
  scrapingSuccessRate: number;
  averageProductsPerPage: number;
  averageImagesPerPage: number;
  averageChunksPerProduct: number;
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
        // Step 1: Fetch products first to get their IDs
        const { data: scrapedProducts, count: totalScrapedProducts } = await supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('source_type', 'web_scraping');

        // Step 2: Fetch chunks using product IDs
        const productIds = scrapedProducts?.map((p: any) => p.id) || [];
        const { data: scrapedChunks, count: totalScrapedChunks } = productIds.length > 0
          ? await supabase
              .from('document_chunks')
              .select('*', { count: 'exact' })
              .in('product_id', productIds)
          : { data: null, count: 0 };

        // Step 3: Fetch embeddings using chunk IDs
        const chunkIds = scrapedChunks?.map((c: any) => c.id) || [];
        const { count: totalScrapedEmbeddings } = chunkIds.length > 0
          ? await supabase
              .from('embeddings')
              .select('*', { count: 'exact', head: true })
              .in('chunk_id', chunkIds)
          : { count: 0 };

        // Step 4: Fetch remaining data in parallel
        const [
          { count: totalScrapedPages },
          { count: totalScrapedImages },
          { data: sources },
        ] = await Promise.all([
          supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('source_type', 'web_scraping'),
          supabase
            .from('images')
            .select('*', { count: 'exact', head: true })
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
        const averageChunksPerProduct = totalScrapedProducts > 0
          ? (totalScrapedChunks || 0) / totalScrapedProducts
          : 0;

        setMetrics({
          totalScrapedPages: totalScrapedPages || 0,
          totalScrapedProducts: totalScrapedProducts || 0,
          totalScrapedImages: totalScrapedImages || 0,
          totalScrapedChunks: totalScrapedChunks || 0,
          totalScrapedEmbeddings: totalScrapedEmbeddings || 0,
          scrapingSuccessRate,
          averageProductsPerPage,
          averageImagesPerPage,
          averageChunksPerProduct,
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

  const MetricCard = ({ label, value, unit = '', icon }: any) => (
    <div className="dashboard-card">
      <div className="flex items-center gap-2 mb-2">
        {icon && <span className="text-xl">{icon}</span>}
        <div className="text-sm font-medium text-muted-foreground">{label}</div>
      </div>
      <div className="text-2xl font-bold text-foreground">
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && <span className="text-sm ml-1 font-normal text-muted-foreground">{unit}</span>}
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
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MetricCard
          label="Scraped Pages"
          value={metrics.totalScrapedPages}
          icon="🌐"
        />
        <MetricCard
          label="Products Extracted"
          value={metrics.totalScrapedProducts}
          icon="📦"
        />
        <MetricCard
          label="Images Scraped"
          value={metrics.totalScrapedImages}
          icon="🖼️"
        />
        <MetricCard
          label="Chunks Generated"
          value={metrics.totalScrapedChunks}
          icon="📝"
        />
        <MetricCard
          label="Embeddings Created"
          value={metrics.totalScrapedEmbeddings}
          icon="🧠"
        />
        <MetricCard
          label="Active Sources"
          value={metrics.activeSources}
          icon="🔗"
        />
      </div>

      {/* Success Rates & Averages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard
          label="Scraping Success Rate"
          value={metrics.scrapingSuccessRate}
          unit="%"
          icon={metrics.scrapingSuccessRate > 90 ? '✅' : '⚠️'}
        />
        <MetricCard
          label="Avg Products/Page"
          value={metrics.averageProductsPerPage}
          icon="🏷️"
        />
        <MetricCard
          label="Avg Images/Page"
          value={metrics.averageImagesPerPage}
          icon="🎨"
        />
        <MetricCard
          label="Avg Chunks/Product"
          value={metrics.averageChunksPerProduct}
          icon="📊"
        />
      </div>
    </div>
  );
};

export default WebScrapingMonitor;

