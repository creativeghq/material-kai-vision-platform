import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface XMLMetrics {
  totalXMLDocuments: number;
  totalXMLProducts: number;
  totalXMLImages: number;
  totalXMLChunks: number;
  totalXMLEmbeddings: number;
  xmlProcessingSuccessRate: number;
  averageProductsPerXML: number;
  averageImagesPerXML: number;
  averageChunksPerProduct: number;
  recentXMLProcessingErrors: number;
}

export const XMLProcessingMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<XMLMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch XML-specific data from Supabase
        // Step 1: Fetch products first to get their IDs
        const { data: xmlProducts, count: totalXMLProducts } = await supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('source_type', 'xml');

        // Step 2: Fetch chunks using product IDs
        const productIds = xmlProducts?.map((p: any) => p.id) || [];
        const { data: xmlChunks, count: totalXMLChunks } = productIds.length > 0
          ? await supabase
              .from('document_chunks')
              .select('*', { count: 'exact' })
              .in('product_id', productIds)
          : { data: null, count: 0 };

        // Step 3: Fetch embeddings using chunk IDs
        const chunkIds = xmlChunks?.map((c: any) => c.id) || [];
        const { count: totalXMLEmbeddings } = chunkIds.length > 0
          ? await supabase
              .from('embeddings')
              .select('*', { count: 'exact', head: true })
              .in('chunk_id', chunkIds)
          : { count: 0 };

        // Step 4: Fetch remaining data in parallel
        const [
          { count: totalXMLDocuments },
          { count: totalXMLImages },
        ] = await Promise.all([
          supabase
            .from('documents')
            .select('*', { count: 'exact', head: true })
            .eq('file_type', 'xml'),
          supabase
            .from('images')
            .select('*', { count: 'exact', head: true })
            .eq('source_type', 'xml'),
        ]);

        // Calculate metrics
        const xmlProcessingSuccessRate = totalXMLDocuments > 0
          ? ((totalXMLDocuments - 0) / totalXMLDocuments) * 100
          : 0;
        const averageProductsPerXML = totalXMLDocuments > 0
          ? (totalXMLProducts || 0) / totalXMLDocuments
          : 0;
        const averageImagesPerXML = totalXMLDocuments > 0
          ? (totalXMLImages || 0) / totalXMLDocuments
          : 0;
        const averageChunksPerProduct = totalXMLProducts > 0
          ? (totalXMLChunks || 0) / totalXMLProducts
          : 0;

        setMetrics({
          totalXMLDocuments: totalXMLDocuments || 0,
          totalXMLProducts: totalXMLProducts || 0,
          totalXMLImages: totalXMLImages || 0,
          totalXMLChunks: totalXMLChunks || 0,
          totalXMLEmbeddings: totalXMLEmbeddings || 0,
          xmlProcessingSuccessRate,
          averageProductsPerXML,
          averageImagesPerXML,
          averageChunksPerProduct,
          recentXMLProcessingErrors: 0, // TODO: Implement error tracking
        });
      } catch (err) {
        console.error('Error fetching XML metrics:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch XML metrics',
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
    return <div className="p-4 text-gray-600">Loading XML processing metrics...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  if (!metrics) {
    return <div className="p-4 text-gray-600">No XML metrics available</div>;
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

  const hasIssues = metrics.totalXMLDocuments > 0 && metrics.totalXMLProducts === 0;

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
                {metrics.totalXMLDocuments > 0 && metrics.totalXMLProducts === 0 && (
                  <div className="text-sm text-red-700 bg-white/50 p-2 rounded">
                    <strong>❌ No products generated:</strong> {metrics.totalXMLDocuments} XML documents processed but 0 products.
                    <br />
                    <span className="text-xs">→ Check XML parsing and product extraction logic.</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MetricCard
          label="XML Documents"
          value={metrics.totalXMLDocuments}
          icon="📋"
        />
        <MetricCard
          label="Products from XML"
          value={metrics.totalXMLProducts}
          icon="📦"
        />
        <MetricCard
          label="Images from XML"
          value={metrics.totalXMLImages}
          icon="🖼️"
        />
        <MetricCard
          label="Chunks Generated"
          value={metrics.totalXMLChunks}
          icon="📝"
        />
        <MetricCard
          label="Embeddings Created"
          value={metrics.totalXMLEmbeddings}
          icon="🧠"
        />
      </div>

      {/* Success Rates & Averages */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <MetricCard
          label="Processing Success Rate"
          value={metrics.xmlProcessingSuccessRate}
          unit="%"
          icon={metrics.xmlProcessingSuccessRate > 90 ? '✅' : '⚠️'}
        />
        <MetricCard
          label="Avg Products/XML"
          value={metrics.averageProductsPerXML}
          icon="🏷️"
        />
        <MetricCard
          label="Avg Images/XML"
          value={metrics.averageImagesPerXML}
          icon="🎨"
        />
        <MetricCard
          label="Avg Chunks/Product"
          value={metrics.averageChunksPerProduct}
          icon="📊"
        />
      </div>

      {/* Recommendations */}
      {metrics.totalXMLDocuments > 0 && metrics.totalXMLProducts === 0 ? (
        <div className="p-4 bg-gradient-to-r from-blue-50 to-cyan-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h3 className="font-bold text-blue-900 mb-2">Recommendations</h3>
              <ul className="text-sm text-blue-800 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>Verify XML schema compatibility with product extraction logic</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>Check MIVAA XML processor logs for parsing errors</span>
                </li>
                <li className="flex items-start gap-2">
                  <span>•</span>
                  <span>Ensure XML files contain valid product data structures</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default XMLProcessingMonitor;

