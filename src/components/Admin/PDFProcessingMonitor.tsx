import React, { useEffect, useState } from 'react';

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

        // Use Edge Function to fetch PDF processing metrics
        const response = await fetch('/api/pdf-processing-metrics', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch metrics: ${response.statusText}`);
        }

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || 'Failed to fetch metrics');
        }

        setMetrics(data.metrics);
      } catch (err) {
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

  const MetricCard = ({ label, value, unit = '', color = 'blue' }: any) => (
    <div className={`bg-${color}-50 border border-${color}-200 rounded-lg p-4`}>
      <div className="text-sm text-gray-600">{label}</div>
      <div className="text-2xl font-bold text-gray-900">
        {typeof value === 'number' ? value.toFixed(1) : value}
        {unit && <span className="text-sm ml-1">{unit}</span>}
      </div>
    </div>
  );

  return (
    <div className="p-6 bg-white rounded-lg">
      <h2 className="text-2xl font-bold mb-6">📊 PDF Processing Monitoring</h2>

      {/* Critical Issues */}
      <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
        <h3 className="font-bold text-red-900 mb-2">⚠️ Critical Issues</h3>
        {metrics.totalChunks > 0 && metrics.totalEmbeddings === 0 && (
          <p className="text-red-700">
            ❌ No embeddings generated {metrics.totalChunks} chunks exist but 0
            embeddings.
            <br />
            <span className="text-sm">
              This indicates OPENAI_API_KEY is not set in MIVAA deployment.
            </span>
          </p>
        )}
        {metrics.totalDocuments > 0 && metrics.totalImages === 0 && (
          <p className="text-red-700">
            ❌ No images extracted {metrics.totalDocuments} documents processed
            but 0 images.
            <br />
            <span className="text-sm">
              Check MIVAA image extraction service and logs.
            </span>
          </p>
        )}
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label="Documents"
          value={metrics.totalDocuments}
          color="blue"
        />
        <MetricCard label="Chunks" value={metrics.totalChunks} color="green" />
        <MetricCard
          label="Embeddings"
          value={metrics.totalEmbeddings}
          color="purple"
        />
        <MetricCard label="Images" value={metrics.totalImages} color="orange" />
      </div>

      {/* Success Rates */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label="Embedding Success Rate"
          value={metrics.embeddingSuccessRate}
          unit="%"
          color={metrics.embeddingSuccessRate > 80 ? 'green' : 'red'}
        />
        <MetricCard
          label="Image Extraction Rate"
          value={metrics.imageExtractionRate}
          unit="%"
          color={metrics.imageExtractionRate > 50 ? 'green' : 'red'}
        />
        <MetricCard
          label="Product Generation Rate"
          value={metrics.productGenerationRate}
          unit="%"
          color="blue"
        />
      </div>

      {/* Averages */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Avg Chunks/Doc"
          value={metrics.averageChunksPerDocument}
          color="blue"
        />
        <MetricCard
          label="Avg Embeddings/Doc"
          value={metrics.averageEmbeddingsPerDocument}
          color="purple"
        />
        <MetricCard
          label="Avg Images/Doc"
          value={metrics.averageImagesPerDocument}
          color="orange"
        />
        <MetricCard
          label="Avg Products/Doc"
          value={metrics.averageProductsPerDocument}
          color="green"
        />
      </div>

      {/* Recommendations */}
      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <h3 className="font-bold text-blue-900 mb-2">💡 Recommendations</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          {metrics.totalEmbeddings === 0 && metrics.totalChunks > 0 && (
            <li>
              • Set OPENAI_API_KEY environment variable in MIVAA deployment
            </li>
          )}
          {metrics.totalImages === 0 && metrics.totalDocuments > 0 && (
            <li>• Check MIVAA PDF processor image extraction configuration</li>
          )}
          {metrics.averageProductsPerDocument < 5 && (
            <li>
              • Product generation limit has been increased - reprocess
              documents
            </li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default PDFProcessingMonitor;
