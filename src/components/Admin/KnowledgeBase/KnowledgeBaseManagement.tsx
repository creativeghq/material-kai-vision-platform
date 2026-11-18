import React, { useCallback, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, FileText, FolderTree, Link2, ExternalLink, BookOpen } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent } from '@/components/core/ui/tabs';
import { HubStatGrid, HubStatTile } from '@/components/core/hub/HubStatTile';
import { HubTabNav, type HubTabItem } from '@/components/core/hub/HubTabNav';
import { formatNumber } from '@/utils/decimal';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { supabase } from '@/integrations/supabase/client';

import { DocumentList } from './DocumentList';
import { DocumentEditor } from './DocumentEditor';
import { CategoryManager } from './CategoryManager';
import { ProductAttachments } from './ProductAttachments';
import { SearchInterface } from './SearchInterface';

const KB_TABS: HubTabItem[] = [
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'categories', label: 'Categories', icon: FolderTree },
  { id: 'attachments', label: 'Product Links', icon: Link2 },
];

export const KnowledgeBaseManagement: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const activeTab = KB_TABS.some((t) => t.id === tabParam) ? tabParam! : 'documents';
  const setActiveTab = useCallback((id: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id === 'documents') next.delete('tab');
      else next.set('tab', id);
      return next;
    }, { replace: true });
  }, [setSearchParams]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [newDocCategoryId, setNewDocCategoryId] = useState<string | undefined>(undefined);
  const [docRefreshKey, setDocRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<{ id: string; nonce: number } | null>(null);
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalCategories: 0,
    totalAttachments: 0,
    // Agent searches over the last 30 days, from the operator-only kb_search_analytics RPC.
    // null = the RPC could not be read (not an operator), rendered as "not available".
    kbSearches: null as { searches: number; zero_result: number } | null,
  });

  const { toast } = useToast();

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setIsLoading(true);

      // Load stats directly from Supabase
      const [
        { count: docsCount },
        { count: categoriesCount },
        { count: attachmentsCount },
      ] = await Promise.all([
        supabase.from('kb_docs').select('*', { count: 'exact', head: true }),
        supabase.from('kb_categories').select('*', { count: 'exact', head: true }),
        supabase.from('kb_doc_attachments').select('*', { count: 'exact', head: true }),
      ]);

      // Derived from agent_tool_call_logs (every knowledge_base_search call) — the record the
      // platform actually writes. kb_search_analytics, the table, never had a producer.
      const { data: kbUsage, error: kbUsageError } = await supabase.rpc('kb_search_analytics', { p_days: 30 });
      const kbTotals = !kbUsageError && kbUsage && typeof kbUsage === 'object'
        ? (kbUsage as { totals?: { searches?: number; zero_result?: number } }).totals
        : undefined;

      setStats({
        totalDocs: docsCount || 0,
        totalCategories: categoriesCount || 0,
        totalAttachments: attachmentsCount || 0,
        kbSearches: kbTotals
          ? { searches: kbTotals.searches ?? 0, zero_result: kbTotals.zero_result ?? 0 }
          : null,
      });
    } catch (error) {
      console.error('Failed to load stats:', error);
      toast({
        title: 'Error',
        description: 'Failed to load Knowledge Base statistics',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateDocument = ({ categoryId }: { categoryId?: string }) => {
    setSelectedDocId(null);
    setNewDocCategoryId(categoryId);
    setShowEditor(true);
  };

  const handleEditDocument = (docId: string) => {
    setSelectedDocId(docId);
    setShowEditor(true);
  };

  const handleCloseEditor = () => {
    setShowEditor(false);
    setSelectedDocId(null);
    setDocRefreshKey(k => k + 1);
    loadStats();
  };

  const handleViewCategoryDocuments = (categoryId: string) => {
    setCategoryFilter({ id: categoryId, nonce: Date.now() });
    setActiveTab('documents');
  };

  return (
    <div className="min-h-screen">
      <PageHeader
        icon={BookOpen}
        title="Knowledge Base"
        subtitle="Documentation with AI embeddings, semantic search and product attachments."
        actions={(
          <Button variant="outline" size="sm" className="gap-2" onClick={() => window.open('/knowledge-base', '_blank')}>
            <ExternalLink className="h-4 w-4" />
            View Public KB
          </Button>
        )}
      >
        <HubTabNav items={KB_TABS} activeId={activeTab} onSelect={setActiveTab} aria-label="Knowledge Base sections" />
      </PageHeader>

      <div className="p-3 sm:p-6 space-y-6">
        <HubStatGrid>
          <HubStatTile label="Total Documents" value={isLoading ? '—' : formatNumber(stats.totalDocs)} />
          <HubStatTile label="Categories" value={isLoading ? '—' : formatNumber(stats.totalCategories)} />
          <HubStatTile label="Product Links" value={isLoading ? '—' : formatNumber(stats.totalAttachments)} />
          <HubStatTile
            label="Agent Searches (30 Days)"
            value={isLoading || !stats.kbSearches ? '—' : formatNumber(stats.kbSearches.searches)}
            category={isLoading ? undefined : stats.kbSearches ? `${formatNumber(stats.kbSearches.zero_result)} found nothing` : 'Not available: kb_search_analytics is operator-only'}
          />
        </HubStatGrid>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsContent value="documents" className="space-y-4">
            <DocumentList
              onEdit={handleEditDocument}
              onCreate={handleCreateDocument}
              refreshTrigger={docRefreshKey}
              applyCategoryFilter={categoryFilter}
            />
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <SearchInterface onOpen={handleEditDocument} />
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <CategoryManager onViewDocuments={handleViewCategoryDocuments} />
          </TabsContent>

          <TabsContent value="attachments" className="space-y-4">
            <ProductAttachments />
          </TabsContent>

        </Tabs>
      </div>

      {/* Document Editor Modal */}
      {showEditor && (
        <DocumentEditor
          documentId={selectedDocId}
          initialCategoryId={newDocCategoryId}
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
};

