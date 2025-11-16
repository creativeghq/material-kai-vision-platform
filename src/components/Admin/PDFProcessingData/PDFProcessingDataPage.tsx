import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Grid3X3, Image as ImageIcon, Database } from 'lucide-react';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { ProductsTab } from './ProductsTab';
import { ChunksTab } from './ChunksTab';
import { ImagesTab } from './ImagesTab';
import { EmbeddingsTab } from './EmbeddingsTab';
import { supabase } from '@/integrations/supabase/client';

export const PDFProcessingDataPage: React.FC = () => {
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [stats, setStats] = useState({
    products: 0,
    chunks: 0,
    images: 0,
    embeddings: 0,
  });

  useEffect(() => {
    loadWorkspaceAndStats();
  }, []);

  const loadWorkspaceAndStats = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get workspace with most images (the active one)
      const { data: workspaces, error } = await supabase
        .from('workspaces')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Failed to load workspace:', error);
        return;
      }

      if (workspaces && workspaces.length > 0) {
        const wsId = workspaces[0].id;
        console.log('[PDFProcessingDataPage] Loading workspace:', wsId);
        setWorkspaceId(wsId);
        await loadStats(wsId);
      } else {
        console.error('[PDFProcessingDataPage] No workspaces found!');
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadStats = async (wsId: string) => {
    try {
      const [
        { count: productsCount },
        { count: chunksCount },
        { count: imagesCount },
        { count: embeddingsCount },
      ] = await Promise.all([
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', wsId),
        supabase
          .from('document_chunks')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', wsId),
        supabase
          .from('document_images')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', wsId),
        supabase
          .from('embeddings')
          .select('*', { count: 'exact', head: true })
          .eq('workspace_id', wsId),
      ]);

      setStats({
        products: productsCount || 0,
        chunks: chunksCount || 0,
        images: imagesCount || 0,
        embeddings: embeddingsCount || 0,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="PDF Processing Data"
        description="View all products, chunks, images, and embeddings generated from PDF processing"
        badge="Extraction Data"
      />

      <div className="p-6">
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="products" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Products ({stats.products})
            </TabsTrigger>
            <TabsTrigger value="chunks" className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4" />
              Chunks ({stats.chunks})
            </TabsTrigger>
            <TabsTrigger value="images" className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4" />
              Images ({stats.images})
            </TabsTrigger>
            <TabsTrigger value="embeddings" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Embeddings ({stats.embeddings})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <ProductsTab workspaceId={workspaceId} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="chunks">
            <ChunksTab workspaceId={workspaceId} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="images">
            <ImagesTab workspaceId={workspaceId} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="embeddings">
            <EmbeddingsTab workspaceId={workspaceId} onStatsUpdate={loadStats} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

