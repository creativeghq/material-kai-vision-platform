import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent } from '@/components/core/ui/tabs';
import { Package, Grid3X3, Image as ImageIcon, Filter, Sparkles, Tags } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { formatNumber } from '@/utils/decimal';
import { ProductsTab } from './ProductsTab';
import { ChunksTab } from './ChunksTab';
import { ImagesTab } from './ImagesTab';
import MaterialCategoriesTab from '@/components/Admin/DataImport/MaterialCategoriesTab';
import { mivaaApi } from '@/services/mivaaApiClient';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import AIDataPage from '@/pages/Admin/AIDataPage';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MATERIALS_TABS: HubTabItem[] = [
  { id: 'products', label: 'Products', icon: Package },
  { id: 'chunks', label: 'Chunks', icon: Grid3X3 },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'categories', label: 'Categories', icon: Tags },
  { id: 'ai-review', label: 'AI Review', icon: Sparkles },
];
type TabValue = string;
const isTab = (v: string | null): v is TabValue => MATERIALS_TABS.some((t) => t.id === v);

export const MaterialsDataPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { activeWorkspaceId } = useWorkspace();
  const workspaceId = activeWorkspaceId ?? '';
  // Only a link opens one job's data (`?jobId=` from the job monitor); there is no typed filter.
  const jobIdFilter = searchParams.get('jobId') || '';
  // `?productId=` — several places link here to open ONE product (AsyncJobQueueMonitor's
  // per-product row, the mention dashboard's "Open"). The param was never read, so every
  // one of those links silently showed the entire catalog instead.
  const productIdFilter = searchParams.get('productId') || '';
  // source_job_id is a uuid column: a typed product name sent as `eq` is a 22P02 on every tab.
  const jobIdTyped = jobIdFilter.trim();
  const jobIdInvalid = jobIdTyped !== '' && !UUID_RE.test(jobIdTyped);
  const appliedJobId = jobIdInvalid ? '' : jobIdTyped;
  const tabParam = searchParams.get('tab');
  const activeTab: TabValue = isTab(tabParam) ? tabParam : 'products';
  const handleTabChange = (val: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (val === 'products') params.delete('tab');
      else params.set('tab', val);
      if (val !== 'ai-review') params.delete('view');
      return params;
    }, { replace: true });
  };
  const clearRecordFilters = () => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete('jobId');
      params.delete('productId');
      return params;
    });
  };
  const [stats, setStats] = useState({
    products: 0,
    chunks: 0,
    images: 0,
    embeddings: 0,
  });

  useEffect(() => {
    if (activeWorkspaceId) void loadStats(activeWorkspaceId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkspaceId]);

  const loadStats = async (wsId: string) => {
    if (!wsId) return;
    try {
      const response = await mivaaApi.request<{ statistics?: Record<string, any> }>(
        `/api/rag/workspace-stats?workspace_id=${encodeURIComponent(wsId)}`,
        { method: 'GET' },
      );

      const statsData = response.data?.statistics;
      if (!response.success || !statsData) {
        throw new Error(response.error || 'Failed to fetch workspace stats');
      }

      setStats({
        products: statsData.products || 0,
        chunks: statsData.chunks || 0,
        images: statsData.images || 0,
        embeddings: statsData.embeddings?.total || 0, // total includes text + image embeddings from VECS
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
            .select('id', { count: 'exact', head: true })
            .eq('workspace_id', wsId),
          supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId),
          supabase
            .from('document_images')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId),
          // `embeddings` does not exist. VECS is the single source of truth for vectors, and the
          // canonical O(1) "does this have an embedding" check is the boolean presence flag on the
          // source row — never a round trip to VECS (CLAUDE.md). Counting SLIG-present images is
          // the same proxy PDFDocumentDetails already uses for this figure. (audit #270)
          supabase
            .from('document_images')
            .select('*', { count: 'exact', head: true })
            .eq('workspace_id', wsId)
            .eq('has_slig_embedding', true),
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
      <PageHeader icon={Package} title="Materials Data" subtitle="Products, chunks and images from every ingestion source, the category taxonomy, and the AI review of them.">
        <HubTabNav items={MATERIALS_TABS} activeId={activeTab} onSelect={handleTabChange} aria-label="Materials Data sections" />
      </PageHeader>

      <div className="p-3 sm:p-6 space-y-6">
        <HubStatGrid>
          <HubStatTile label="Products" value={formatNumber(stats.products)} />
          <HubStatTile label="Chunks" value={formatNumber(stats.chunks)} />
          <HubStatTile label="Images" value={formatNumber(stats.images)} />
          <HubStatTile label="Embeddings" value={formatNumber(stats.embeddings)} />
        </HubStatGrid>

        {appliedJobId && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Filter className="h-4 w-4" />
            Showing one ingestion job
            <Button variant="ghost" size="sm" onClick={clearRecordFilters}>Show all</Button>
          </div>
        )}

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">

          <TabsContent value="products" className="mt-0">
            <ProductsTab workspaceId={workspaceId} jobIdFilter={appliedJobId} productIdFilter={productIdFilter} onStatsUpdate={() => { void loadStats(workspaceId); }} />
          </TabsContent>

          <TabsContent value="chunks" className="mt-0">
            <ChunksTab workspaceId={workspaceId} jobIdFilter={appliedJobId} onStatsUpdate={() => { void loadStats(workspaceId); }} />
          </TabsContent>

          <TabsContent value="images" className="mt-0">
            <ImagesTab workspaceId={workspaceId} jobIdFilter={appliedJobId} onStatsUpdate={() => { void loadStats(workspaceId); }} />
          </TabsContent>

          <TabsContent value="categories" className="mt-0">
            <MaterialCategoriesTab />
          </TabsContent>

          <TabsContent value="ai-review" className="mt-0">
            <AIDataPage embedded tabParam="view" />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

