import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface XMLMetrics {
  totalXMLDocuments: number;
  totalXMLProducts: number;
  totalXMLImages: number;
  xmlProcessingSuccessRate: number;
  averageProductsPerXML: number;
  averageImagesPerXML: number;
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
        // Assuming we have a way to identify XML documents (e.g., by file_type or source)
        const [
          { data: xmlDocs, count: totalXMLDocuments },
          { data: xmlProducts, count: totalXMLProducts },
          { data: xmlImages, count: totalXMLImages },
        ] = await Promise.all([
          supabase
            .from('documents')
            .select('*', { count: 'exact' })
            .eq('file_type', 'xml'),
          supabase
            .from('products')
            .select('*', { count: 'exact' })
            .eq('source_type', 'xml'),
          supabase
            .from('images')
            .select('*', { count: 'exact' })
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

        setMetrics({
          totalXMLDocuments: totalXMLDocuments || 0,
          totalXMLProducts: totalXMLProducts || 0,
          totalXMLImages: totalXMLImages || 0,
          xmlProcessingSuccessRate,
          averageProductsPerXML,
          averageImagesPerXML,
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <MetricCard
          label="XML Documents"
          value={metrics.totalXMLDocuments}
          gradient="bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200"
          icon="📋"
        />
        <MetricCard
          label="Products from XML"
          value={metrics.totalXMLProducts}
          gradient="bg-gradient-to-br from-green-50 to-green-100 border-green-200"
          icon="📦"
        />
        <MetricCard 
          label="Images from XML" 
          value={metrics.totalXMLImages} 
          gradient="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200"
          icon="🖼️"
        />
      </div>

      {/* Success Rates & Averages */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <MetricCard
          label="Processing Success Rate"
          value={metrics.xmlProcessingSuccessRate}
          unit="%"
          gradient={metrics.xmlProcessingSuccessRate > 90
            ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-emerald-300"
            : "bg-gradient-to-br from-amber-50 to-amber-100 border-amber-300"}
          icon={metrics.xmlProcessingSuccessRate > 90 ? "✅" : "⚠️"}
        />
        <MetricCard
          label="Avg Products/XML"
          value={metrics.averageProductsPerXML}
          gradient="bg-gradient-to-br from-teal-50 to-teal-100 border-teal-200"
          icon="🏷️"
        />
        <MetricCard
          label="Avg Images/XML"
          value={metrics.averageImagesPerXML}
          gradient="bg-gradient-to-br from-rose-50 to-rose-100 border-rose-200"
          icon="🎨"
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

