import React, { useState, useEffect } from 'react';
import {
  Search,
  FileText,
  FolderTree,
  Link2,
  BarChart3,
  Brain,
  ExternalLink,
} from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { GlobalAdminHeader } from '../GlobalAdminHeader';
import { supabase } from '@/integrations/supabase/client';

import { DocumentList } from './DocumentList';
import { DocumentEditor } from './DocumentEditor';
import { CategoryManager } from './CategoryManager';
import { ProductAttachments } from './ProductAttachments';
import { SearchInterface } from './SearchInterface';
import { KnowledgeBaseService } from '@/services/knowledgeBaseService';

export const KnowledgeBaseManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('documents');
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [docRefreshKey, setDocRefreshKey] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState<{ id: string; nonce: number } | null>(null);
  const [stats, setStats] = useState({
    totalDocs: 0,
    totalCategories: 0,
    totalAttachments: 0,
    totalSearches: 0,
  });

  const { toast } = useToast();
  const kbService = KnowledgeBaseService.getInstance();

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
        { count: searchesCount },
      ] = await Promise.all([
        supabase.from('kb_docs').select('*', { count: 'exact', head: true }),
        supabase.from('kb_categories').select('*', { count: 'exact', head: true }),
        supabase.from('kb_doc_attachments').select('*', { count: 'exact', head: true }),
        supabase.from('kb_search_analytics').select('*', { count: 'exact', head: true }),
      ]);

      setStats({
        totalDocs: docsCount || 0,
        totalCategories: categoriesCount || 0,
        totalAttachments: attachmentsCount || 0,
        totalSearches: searchesCount || 0,
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

  const handleCreateDocument = () => {
    setSelectedDocId(null);
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
      <GlobalAdminHeader
        title="Knowledge Base & Documentation"
        description="Manage documentation with AI embeddings, semantic search, and product attachments"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Knowledge Base' },
        ]}
      />

      <div className="p-3 sm:p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Documents</p>
                <p className="text-lg font-semibold">{stats.totalDocs}</p>
              </div>
            </div>
          </div>

          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <FolderTree className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Categories</p>
                <p className="text-lg font-semibold">{stats.totalCategories}</p>
              </div>
            </div>
          </div>

          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <Link2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Product Links</p>
                <p className="text-lg font-semibold">{stats.totalAttachments}</p>
              </div>
            </div>
          </div>

          <div className="dashboard-card rounded-2xl border-0 shadow-sm p-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-xl bg-primary/10">
                <BarChart3 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Searches</p>
                <p className="text-lg font-semibold">{stats.totalSearches}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - Tabs without Card wrapper to match platform design */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="flex items-center justify-between mb-6">
            <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
              <TabsTrigger value="documents" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Documents
              </TabsTrigger>
              <TabsTrigger value="search" className="flex items-center gap-2">
                <Search className="h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger value="categories" className="flex items-center gap-2">
                <FolderTree className="h-4 w-4" />
                Categories
              </TabsTrigger>
              <TabsTrigger value="attachments" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Product Links
              </TabsTrigger>
            </TabsList>
            <Button
              variant="outline"
              className="rounded-full gap-2"
              onClick={() => window.open('/knowledge-base', '_blank')}
            >
              <ExternalLink className="h-4 w-4" />
              View public KB
            </Button>
          </div>

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
          onClose={handleCloseEditor}
        />
      )}
    </div>
  );
};

