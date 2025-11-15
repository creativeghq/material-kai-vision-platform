import React, { useState, useEffect } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  FileText,
  Upload,
  FolderTree,
  Link2,
  History,
  MessageSquare,
  BarChart3,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
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
    loadStats();
  };

  return (
    <div className="min-h-screen bg-background">
      <GlobalAdminHeader
        title="Knowledge Base & Documentation"
        description="Manage documentation with AI embeddings, semantic search, and product attachments"
        breadcrumbs={[
          { label: 'Admin', path: '/admin' },
          { label: 'Knowledge Base' },
        ]}
      />

      <div className="container mx-auto p-6 space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Documents</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalDocs}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Categories</CardTitle>
              <FolderTree className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalCategories}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Product Links</CardTitle>
              <Link2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalAttachments}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Searches</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalSearches}</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="documents">
              <FileText className="h-4 w-4 mr-2" />
              Documents
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </TabsTrigger>
            <TabsTrigger value="categories">
              <FolderTree className="h-4 w-4 mr-2" />
              Categories
            </TabsTrigger>
            <TabsTrigger value="attachments">
              <Link2 className="h-4 w-4 mr-2" />
              Product Links
            </TabsTrigger>
            <TabsTrigger value="analytics">
              <BarChart3 className="h-4 w-4 mr-2" />
              Analytics
            </TabsTrigger>
          </TabsList>

          <TabsContent value="documents" className="space-y-4">
            <DocumentList
              onEdit={handleEditDocument}
              onCreate={handleCreateDocument}
              searchQuery={searchQuery}
            />
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <SearchInterface />
          </TabsContent>

          <TabsContent value="categories" className="space-y-4">
            <CategoryManager />
          </TabsContent>

          <TabsContent value="attachments" className="space-y-4">
            <ProductAttachments />
          </TabsContent>

          <TabsContent value="analytics" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Search Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">Analytics coming soon...</p>
              </CardContent>
            </Card>
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

