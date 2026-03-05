import React, { useEffect, useState } from 'react';
import { BookOpen, ChevronRight, ArrowLeft, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { KBCategory, KBDocument } from '@/services/knowledgeBaseService';

export const PublicKnowledgeBasePage: React.FC = () => {
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<KBCategory | null>(null);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDocs, setLoadingDocs] = useState(false);

  useEffect(() => {
    loadPublicCategories();
  }, []);

  const loadPublicCategories = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('kb_categories')
        .select('*')
        .eq('access_level', 'public')
        .order('sort_order', { ascending: true });

      if (error) throw error;
      setCategories(data || []);
    } catch (error) {
      console.error('Failed to load public categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryDocuments = async (category: KBCategory) => {
    setSelectedCategory(category);
    setLoadingDocs(true);
    try {
      const { data, error } = await supabase
        .from('kb_docs')
        .select('id, title, summary, status, visibility, view_count, created_at, updated_at, workspace_id, content, category_id, created_by, updated_by, embedding_status, embedding_generated_at, embedding_model')
        .eq('category_id', category.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setLoadingDocs(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'hsl(var(--background))' }}>
        <p className="text-muted-foreground">Loading knowledge base...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'hsl(var(--background))' }}>
      {/* Header */}
      <div className="border-b" style={{ background: 'hsl(var(--primary))' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3 text-primary-foreground">
            <BookOpen className="h-8 w-8" />
            <div>
              <h1 className="text-3xl">Knowledge Base</h1>
              <p className="text-primary-foreground/70 text-sm mt-1">
                Browse our public guides and documentation
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {selectedCategory ? (
          <>
            {/* Back button + category header */}
            <div className="mb-6">
              <Button
                variant="ghost"
                onClick={() => { setSelectedCategory(null); setDocuments([]); }}
                className="mb-4 -ml-2 rounded-full"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                All Categories
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-4xl">{selectedCategory.icon}</span>
                <div>
                  <h2 className="text-2xl font-medium">{selectedCategory.name}</h2>
                  {selectedCategory.description && (
                    <p className="text-muted-foreground mt-1">{selectedCategory.description}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Documents */}
            {loadingDocs ? (
              <p className="text-muted-foreground">Loading documents...</p>
            ) : documents.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No published documents in this category yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {documents.map((doc) => (
                  <Card key={doc.id} className="dashboard-card hover:shadow-md transition-shadow">
                    <CardContent className="p-5">
                      <h3 className="font-medium text-lg">{doc.title}</h3>
                      {doc.summary && (
                        <p className="text-muted-foreground text-sm mt-1 line-clamp-2">{doc.summary}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-3">
                        {new Date(doc.created_at).toLocaleDateString()}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-xl font-medium mb-6">Browse Categories</h2>
            {categories.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">
                <BookOpen className="h-16 w-16 mx-auto mb-4 opacity-20" />
                <p className="text-lg">No public categories available yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {categories.map((category) => (
                  <Card
                    key={category.id}
                    className="dashboard-card cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => loadCategoryDocuments(category)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <span className="text-3xl">{category.icon}</span>
                          <div>
                            <h3 className="font-medium">{category.name}</h3>
                            {category.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {category.description}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-2">
                              {category.document_count || 0} documents
                            </p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
