import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface PDFMetrics {
  totalDocuments: number;
  totalChunks: number;
  totalEmbeddings: number;
  totalImages: number;
  totalProducts: number;
  embeddingSuccessRate: number;
  imageExtractionRate: number;
  productGenerationRate: number;
  averageChunksPerDocument: number;
  averageEmbeddingsPerDocument: number;
  averageImagesPerDocument: number;
  averageProductsPerDocument: number;
}

export const PDFProcessingMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<PDFMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch real data from Supabase
        const [
          { count: totalDocuments },
          { count: totalChunks },
          { count: totalImages },
          { count: totalProducts },
        ] = await Promise.all([
          supabase.from('documents').select('*', { count: 'exact', head: true }),
          supabase.from('document_chunks').select('*', { count: 'exact', head: true }),
          supabase.from('images').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }),
        ]);

        // Embeddings are 1:1 with chunks (stored in VECS, not Supabase table)
        const totalEmbeddings = totalChunks;

        // Calculate rates and averages
        const embeddingSuccessRate = totalChunks > 0 ? (totalEmbeddings / totalChunks) * 100 : 0;
        const imageExtractionRate = totalDocuments > 0 ? (totalImages / totalDocuments) * 100 : 0;
        const productGenerationRate = totalDocuments > 0 ? (totalProducts / totalDocuments) * 100 : 0;
        const averageChunksPerDocument = totalDocuments > 0 ? totalChunks / totalDocuments : 0;
        const averageEmbeddingsPerDocument = totalDocuments > 0 ? totalEmbeddings / totalDocuments : 0;
        const averageImagesPerDocument = totalDocuments > 0 ? totalImages / totalDocuments : 0;
        const averageProductsPerDocument = totalDocuments > 0 ? totalProducts / totalDocuments : 0;

        setMetrics({
          totalDocuments: totalDocuments || 0,
          totalChunks: totalChunks || 0,
          totalEmbeddings: totalEmbeddings || 0,
          totalImages: totalImages || 0,
          totalProducts: totalProducts || 0,
          embeddingSuccessRate,
          imageExtractionRate,
          productGenerationRate,
          averageChunksPerDocument,
          averageEmbeddingsPerDocument,
          averageImagesPerDocument,
          averageProductsPerDocument,
        });
      } catch (err) {
        console.error('Error fetching PDF metrics:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch metrics',
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
    return <div className="p-4">Loading PDF processing metrics...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  if (!metrics) {
    return <div className="p-4">No metrics available</div>;
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

  const hasIssues = (metrics.totalChunks > 0 && metrics.totalEmbeddings === 0) ||
                    (metrics.totalDocuments > 0 && metrics.totalImages === 0);

  return (
    <div className="space-y-4">
      {/* Critical Issues */}
      {hasIssues && (
        <div className="p-4 bg-red-50 border-l-4 border-red-500 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h3 className="font-bold text-red-900 mb-2">Critical Issues Detected</h3>
              <div className="space-y-2">
                {metrics.totalChunks > 0 && metrics.totalEmbeddings === 0 && (
                  <div className="text-sm text-red-700 bg-white/50 p-2 rounded">
                    <strong>❌ No embeddings generated:</strong> {metrics.totalChunks} chunks exist but 0 embeddings.
                    <br />
                    <span className="text-xs">→ OPENAI_API_KEY may not be set in MIVAA deployment.</span>
                  </div>
                )}
                {metrics.totalDocuments > 0 && metrics.totalImages === 0 && (
                  <div className="text-sm text-red-700 bg-white/50 p-2 rounded">
                    <strong>❌ No images extracted:</strong> {metrics.totalDocuments} documents processed but 0 images.
                    <br />
                    <span className="text-xs">→ Check MIVAA image extraction service and logs.</span>
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
          label="Documents"
          value={metrics.totalDocuments}
          gradient="bg-slate-50 border-slate-200"
          icon="📄"
        />
        <MetricCard
          label="Total Products"
          value={metrics.totalProducts}
          gradient="bg-slate-50 border-slate-200"
          icon="📦"
        />
        <MetricCard
          label="Chunks"
          value={metrics.totalChunks}
          gradient="bg-slate-50 border-slate-200"
          icon="🧩"
        />
        <MetricCard
          label="Embeddings"
          value={metrics.totalEmbeddings}
          gradient="bg-slate-50 border-slate-200"
          icon="🔮"
        />
        <MetricCard
          label="Images"
          value={metrics.totalImages}
          gradient="bg-slate-50 border-slate-200"
          icon="🖼️"
        />
      </div>

      {/* Success Rates */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label="Embedding Success Rate"
          value={metrics.embeddingSuccessRate}
          unit="%"
          gradient={metrics.embeddingSuccessRate > 80
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'}
          icon={metrics.embeddingSuccessRate > 80 ? '✅' : '⚠️'}
        />
        <MetricCard
          label="Image Extraction Rate"
          value={metrics.imageExtractionRate}
          unit="%"
          gradient={metrics.imageExtractionRate > 50
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'}
          icon={metrics.imageExtractionRate > 50 ? '✅' : '⚠️'}
        />
        <MetricCard
          label="Product Generation Rate"
          value={metrics.productGenerationRate}
          unit="%"
          gradient="bg-slate-50 border-slate-200"
          icon="📊"
        />
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Avg Chunks/Doc"
          value={metrics.averageChunksPerDocument}
          gradient="bg-slate-50 border-slate-200"
          icon="📝"
        />
        <MetricCard
          label="Avg Embeddings/Doc"
          value={metrics.averageEmbeddingsPerDocument}
          gradient="bg-slate-50 border-slate-200"
          icon="🎯"
        />
        <MetricCard
          label="Avg Images/Doc"
          value={metrics.averageImagesPerDocument}
          gradient="bg-slate-50 border-slate-200"
          icon="🎨"
        />
        <MetricCard
          label="Avg Products/Doc"
          value={metrics.averageProductsPerDocument}
          gradient="bg-slate-50 border-slate-200"
          icon="🏷️"
        />
      </div>

      {/* Recommendations */}
      {(metrics.totalEmbeddings === 0 && metrics.totalChunks > 0) ||
       (metrics.totalImages === 0 && metrics.totalDocuments > 0) ||
       metrics.averageProductsPerDocument < 5 ? (
        <div className="p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">💡</span>
            <div>
              <h3 className="font-bold text-blue-900 mb-2">Recommendations</h3>
              <ul className="text-sm text-blue-800 space-y-1.5">
                {metrics.totalEmbeddings === 0 && metrics.totalChunks > 0 && (
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Set OPENAI_API_KEY environment variable in MIVAA deployment</span>
                  </li>
                )}
                {metrics.totalImages === 0 && metrics.totalDocuments > 0 && (
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Check MIVAA PDF processor image extraction configuration</span>
                  </li>
                )}
                {metrics.averageProductsPerDocument < 5 && (
                  <li className="flex items-start gap-2">
                    <span>•</span>
                    <span>Product generation limit has been increased - consider reprocessing documents</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PDFProcessingMonitor;
