import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';

interface ProcessingMetrics {
  source: string;
  documents: number;
  products: number;
  chunks: number;
  embeddings: number;
  images: number;
  successRate: number;
  avgProductsPerDoc: number;
  avgImagesPerDoc: number;
  avgChunksPerProduct: number;
}

export const UnifiedProcessingMonitor: React.FC = () => {
  const [metrics, setMetrics] = useState<ProcessingMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch PDF metrics
        const [
          { count: pdfDocuments },
          { count: pdfChunks },
          { count: pdfImages },
          { count: pdfProducts },
        ] = await Promise.all([
          supabase.from('documents').select('*', { count: 'exact', head: true }),
          supabase.from('document_chunks').select('*', { count: 'exact', head: true }),
          supabase.from('images').select('*', { count: 'exact', head: true }),
          supabase.from('products').select('*', { count: 'exact', head: true }),
        ]);

        // Embeddings are 1:1 with chunks (stored in VECS, not Supabase table)
        const pdfEmbeddings = pdfChunks;

        // Fetch XML metrics
        const { data: xmlProducts, count: totalXMLProducts } = await supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('source_type', 'xml');

        const xmlProductIds = xmlProducts?.map((p: any) => p.id) || [];
        const { count: totalXMLChunks } = xmlProductIds.length > 0
          ? await supabase.from('document_chunks').select('*', { count: 'exact', head: true }).in('product_id', xmlProductIds)
          : { count: 0 };

        const { data: xmlChunks } = xmlProductIds.length > 0
          ? await supabase.from('document_chunks').select('id').in('product_id', xmlProductIds)
          : { data: [] };

        const xmlChunkIds = xmlChunks?.map((c: any) => c.id) || [];
        // Embeddings are 1:1 with chunks (stored in VECS, not Supabase table)
        const totalXMLEmbeddings = totalXMLChunks;

        const [
          { count: totalXMLDocuments },
          { count: totalXMLImages },
        ] = await Promise.all([
          supabase.from('documents').select('*', { count: 'exact', head: true }).eq('file_type', 'xml'),
          supabase.from('images').select('*', { count: 'exact', head: true }).eq('source_type', 'xml'),
        ]);

        // Fetch Web Scraping metrics
        const { data: scrapedProducts, count: totalScrapedProducts } = await supabase
          .from('products')
          .select('*', { count: 'exact' })
          .eq('source_type', 'web_scraping');

        const scrapedProductIds = scrapedProducts?.map((p: any) => p.id) || [];
        const { count: totalScrapedChunks } = scrapedProductIds.length > 0
          ? await supabase.from('document_chunks').select('*', { count: 'exact', head: true }).in('product_id', scrapedProductIds)
          : { count: 0 };

        const { data: scrapedChunks } = scrapedProductIds.length > 0
          ? await supabase.from('document_chunks').select('id').in('product_id', scrapedProductIds)
          : { data: [] };

        const scrapedChunkIds = scrapedChunks?.map((c: any) => c.id) || [];
        // Embeddings are 1:1 with chunks (stored in VECS, not Supabase table)
        const totalScrapedEmbeddings = totalScrapedChunks;

        const [
          { count: totalScrapedPages },
          { count: totalScrapedImages },
        ] = await Promise.all([
          supabase.from('web_scraping_sessions').select('*', { count: 'exact', head: true }),
          supabase.from('images').select('*', { count: 'exact', head: true }).eq('source_type', 'web_scraping'),
        ]);

        // Calculate metrics for each source
        const pdfMetrics: ProcessingMetrics = {
          source: 'PDF',
          documents: pdfDocuments || 0,
          products: pdfProducts || 0,
          chunks: pdfChunks || 0,
          embeddings: pdfEmbeddings || 0,
          images: pdfImages || 0,
          successRate: pdfDocuments > 0 ? ((pdfEmbeddings || 0) / (pdfChunks || 1)) * 100 : 0,
          avgProductsPerDoc: pdfDocuments > 0 ? (pdfProducts || 0) / pdfDocuments : 0,
          avgImagesPerDoc: pdfDocuments > 0 ? (pdfImages || 0) / pdfDocuments : 0,
          avgChunksPerProduct: pdfProducts > 0 ? (pdfChunks || 0) / pdfProducts : 0,
        };

        const xmlMetrics: ProcessingMetrics = {
          source: 'XML',
          documents: totalXMLDocuments || 0,
          products: totalXMLProducts || 0,
          chunks: totalXMLChunks || 0,
          embeddings: totalXMLEmbeddings || 0,
          images: totalXMLImages || 0,
          successRate: totalXMLDocuments > 0 ? ((totalXMLDocuments - 0) / totalXMLDocuments) * 100 : 0,
          avgProductsPerDoc: totalXMLDocuments > 0 ? (totalXMLProducts || 0) / totalXMLDocuments : 0,
          avgImagesPerDoc: totalXMLDocuments > 0 ? (totalXMLImages || 0) / totalXMLDocuments : 0,
          avgChunksPerProduct: totalXMLProducts > 0 ? (totalXMLChunks || 0) / totalXMLProducts : 0,
        };

        const scrapingMetrics: ProcessingMetrics = {
          source: 'Web Scraping',
          documents: totalScrapedPages || 0,
          products: totalScrapedProducts || 0,
          chunks: totalScrapedChunks || 0,
          embeddings: totalScrapedEmbeddings || 0,
          images: totalScrapedImages || 0,
          successRate: totalScrapedPages > 0 ? ((totalScrapedPages - 0) / totalScrapedPages) * 100 : 0,
          avgProductsPerDoc: totalScrapedPages > 0 ? (totalScrapedProducts || 0) / totalScrapedPages : 0,
          avgImagesPerDoc: totalScrapedPages > 0 ? (totalScrapedImages || 0) / totalScrapedPages : 0,
          avgChunksPerProduct: totalScrapedProducts > 0 ? (totalScrapedChunks || 0) / totalScrapedProducts : 0,
        };

        setMetrics([pdfMetrics, xmlMetrics, scrapingMetrics]);
      } catch (err) {
        console.error('Error fetching processing metrics:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return <div className="p-4 text-gray-600">Loading processing metrics...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-600">Error: {error}</div>;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="font-semibold">Source</TableHead>
            <TableHead className="text-right">Documents</TableHead>
            <TableHead className="text-right">Products</TableHead>
            <TableHead className="text-right">Chunks</TableHead>
            <TableHead className="text-right">Embeddings</TableHead>
            <TableHead className="text-right">Images</TableHead>
            <TableHead className="text-right">Success Rate</TableHead>
            <TableHead className="text-right">Avg Products/Doc</TableHead>
            <TableHead className="text-right">Avg Images/Doc</TableHead>
            <TableHead className="text-right">Avg Chunks/Product</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {metrics.map((metric) => (
            <TableRow key={metric.source}>
              <TableCell className="font-medium">{metric.source}</TableCell>
              <TableCell className="text-right">{metric.documents}</TableCell>
              <TableCell className="text-right">{metric.products}</TableCell>
              <TableCell className="text-right">{metric.chunks}</TableCell>
              <TableCell className="text-right">{metric.embeddings}</TableCell>
              <TableCell className="text-right">{metric.images}</TableCell>
              <TableCell className="text-right">{metric.successRate.toFixed(1)}%</TableCell>
              <TableCell className="text-right">{metric.avgProductsPerDoc.toFixed(1)}</TableCell>
              <TableCell className="text-right">{metric.avgImagesPerDoc.toFixed(1)}</TableCell>
              <TableCell className="text-right">{metric.avgChunksPerProduct.toFixed(1)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default UnifiedProcessingMonitor;

