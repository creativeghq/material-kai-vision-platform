import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Package, Grid3X3, Image as ImageIcon, Database, Filter, Link2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { AdminStatCard } from '../AdminStatCard';
import { ProductsTab } from './ProductsTab';
import { ChunksTab } from './ChunksTab';
import { ImagesTab } from './ImagesTab';
import { EmbeddingsTab } from './EmbeddingsTab';
import { RelationsTab } from './RelationsTab';
import { supabase } from '@/integrations/supabase/client';

export const MaterialsDataPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [jobIdFilter, setJobIdFilter] = useState<string>(searchParams.get('jobId') || '');
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
      // ✅ NEW: Use MIVAA API endpoint that counts VECS embeddings
      const MIVAA_API_URL = import.meta.env.VITE_MIVAA_API_URL || 'https://v1api.materialshub.gr';
      const response = await fetch(
        `${MIVAA_API_URL}/api/rag/workspace-stats?workspace_id=${wsId}`,
      );

      if (!response.ok) {
        throw new Error('Failed to fetch workspace stats');
      }

      const result = await response.json();
      const statsData = result.statistics;

      setStats({
        products: statsData.products || 0,
        chunks: statsData.chunks || 0,
        images: statsData.images || 0,
        embeddings: statsData.embeddings?.total || 0, // ✅ NEW: Total includes text + image embeddings from VECS
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
      // Fallback to direct Supabase queries if API fails
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
      } catch (fallbackError) {
        console.error('Fallback stats loading also failed:', fallbackError);
      }
    }
  };

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader
        title="Materials Data"
        description="View all products, chunks, images, and embeddings from PDF, XML, and Web Scraping sources"
        badge="All Sources"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Materials Data' },
        ]}
      />

      <div className="p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatCard
            title="Products"
            value={stats.products}
            icon={Package}
          />
          <AdminStatCard
            title="Chunks"
            value={stats.chunks}
            icon={Grid3X3}
          />
          <AdminStatCard
            title="Images"
            value={stats.images}
            icon={ImageIcon}
          />
          <AdminStatCard
            title="Embeddings"
            value={stats.embeddings}
            icon={Database}
          />
        </div>

        {/* Job ID Filter */}
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by Job ID (optional)"
              value={jobIdFilter}
              onChange={(e) => setJobIdFilter(e.target.value)}
              className="max-w-md"
            />
            {jobIdFilter && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setJobIdFilter('');
                  setSearchParams({});
                }}
              >
                Clear Filter
              </Button>
            )}
          </div>
        </Card>

        {/* Main Content */}
        <Tabs defaultValue="products" className="w-full">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
            <TabsTrigger value="products" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Package className="h-4 w-4 mr-2" />
              Products
            </TabsTrigger>
            <TabsTrigger value="chunks" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Grid3X3 className="h-4 w-4 mr-2" />
              Chunks
            </TabsTrigger>
            <TabsTrigger value="images" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <ImageIcon className="h-4 w-4 mr-2" />
              Images
            </TabsTrigger>
            <TabsTrigger value="embeddings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Database className="h-4 w-4 mr-2" />
              Embeddings
            </TabsTrigger>
            <TabsTrigger value="relations" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Link2 className="h-4 w-4 mr-2" />
              Relations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="products" className="mt-6">
            <ProductsTab workspaceId={workspaceId} jobIdFilter={jobIdFilter} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="chunks" className="mt-6">
            <ChunksTab workspaceId={workspaceId} jobIdFilter={jobIdFilter} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="images" className="mt-6">
            <ImagesTab workspaceId={workspaceId} jobIdFilter={jobIdFilter} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="embeddings" className="mt-6">
            <EmbeddingsTab workspaceId={workspaceId} jobIdFilter={jobIdFilter} onStatsUpdate={loadStats} />
          </TabsContent>

          <TabsContent value="relations" className="mt-6">
            <RelationsTab workspaceId={workspaceId} jobIdFilter={jobIdFilter} onStatsUpdate={loadStats} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

