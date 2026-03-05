import React, { useState, useEffect } from 'react';
import { Save, Eye, Code } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { KBDocument, KBCategory, KnowledgeBaseService } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

const knowledgeBaseService = KnowledgeBaseService.getInstance();

interface DocumentEditorProps {
  documentId: string | null;
  onClose: () => void;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  documentId,
  onClose,
}) => {
  const [document, setDocument] = useState<Partial<KBDocument>>({
    title: '',
    content: '',
    content_markdown: '',
    summary: '',
    status: 'draft',
    visibility: 'workspace',
    seo_keywords: [],
  });
  const [categories, setCategories] = useState<KBCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [activeTab, setActiveTab] = useState('edit');

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
    loadCategories();
    if (documentId) {
      loadDocument();
    }
  }, [documentId]);

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (workspaces) {
        setWorkspaceId(workspaces.id);
        setDocument((prev) => ({ ...prev, workspace_id: workspaces.id }));
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadCategories = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .single();

      if (workspaces) {
        // Load categories directly from Supabase
        const { data, error } = await supabase
          .from('kb_categories')
          .select('*')
          .eq('workspace_id', workspaces.id)
          .order('sort_order', { ascending: true });

        if (error) throw error;
        setCategories(data || []);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadDocument = async () => {
    if (!documentId || !workspaceId) return;

    try {
      setIsLoading(true);
      // Load document directly from Supabase
      const { data, error } = await supabase
        .from('kb_docs')
        .select('*')
        .eq('id', documentId)
        .eq('workspace_id', workspaceId)
        .single();

      if (error) throw error;
      setDocument(data);
    } catch (error) {
      console.error('Failed to load document:', error);
      toast({
        title: 'Error',
        description: 'Failed to load document',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!document.title || !document.content) {
      toast({
        title: 'Validation Error',
        description: 'Title and content are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsSaving(true);

      if (documentId) {
        // Update directly in Supabase — embedding already generated on create
        const { error } = await supabase
          .from('kb_docs')
          .update({
            title: document.title,
            content: document.content,
            content_markdown: document.content_markdown,
            summary: document.summary,
            category_id: document.category_id,
            seo_keywords: document.seo_keywords,
            status: document.status,
            visibility: document.visibility,
            metadata: document.metadata,
            updated_at: new Date().toISOString(),
          })
          .eq('id', documentId)
          .eq('workspace_id', workspaceId);

        if (error) throw error;

        toast({
          title: 'Success',
          description: 'Document updated successfully',
        });
      } else {
        // Create directly in Supabase — instant, no MIVAA dependency
        const { data: newDoc, error: createError } = await supabase
          .from('kb_docs')
          .insert({
            title: document.title,
            content: document.content,
            content_markdown: document.content_markdown,
            summary: document.summary,
            category_id: document.category_id,
            seo_keywords: document.seo_keywords,
            status: document.status,
            visibility: document.visibility,
            metadata: document.metadata,
            workspace_id: workspaceId,
            embedding_status: 'pending',
          })
          .select('id')
          .single();

        if (createError) throw createError;

        // Fire-and-forget: trigger embedding generation via MIVAA (non-blocking)
        // Uses the update endpoint which regenerates embeddings when content is provided
        knowledgeBaseService.updateDocument(newDoc.id, {
          content: document.content,
          workspace_id: workspaceId,
        }).catch(() => { /* MIVAA unavailable — embedding stays pending */ });

        toast({
          title: 'Success',
          description: 'Document created successfully',
        });
      }

      onClose();
    } catch (error) {
      console.error('Failed to save document:', error);
      toast({
        title: 'Error',
        description: 'Failed to save document',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !workspaceId) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: 'Invalid File',
        description: 'Please upload a PDF file',
        variant: 'destructive',
      });
      return;
    }

    // PDF upload feature requires MIVAA API backend
    toast({
      title: 'Feature Not Available',
      description: 'PDF upload feature requires backend API configuration',
      variant: 'destructive',
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] p-0 gap-0">
        {/* Header */}
        <div
          className="px-6 py-4 rounded-t-lg"
          style={{
            background: 'var(--glass-bg)',
            backdropFilter: 'var(--glass-blur)',
            border: '1px solid var(--glass-border)',
          }}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold">
              {documentId ? 'Edit Document' : 'Create New Document'}
            </DialogTitle>
          </DialogHeader>
        </div>

        {/* Content */}
        <div className="flex h-[calc(90vh-120px)]">
          {/* Left Sidebar - Settings */}
          <div
            className="w-80 p-6 space-y-6 overflow-y-auto border-r"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'var(--glass-blur)',
            }}
          >
            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Document Settings</h3>

              {/* Title */}
              <div className="space-y-2">
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={document.title}
                  onChange={(e) => setDocument({ ...document, title: e.target.value })}
                  placeholder="Enter document title"
                />
              </div>

              {/* Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select
                  value={document.category_id}
                  onValueChange={(value) => setDocument({ ...document, category_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>
                        {cat.icon} {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* PDF Upload */}
              {!documentId && (
                <div className="space-y-2">
                  <Label htmlFor="pdf">Upload PDF</Label>
                  <Input
                    id="pdf"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-extract text from PDF
                  </p>
                </div>
              )}

              {/* Status */}
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={document.status}
                  onValueChange={(value: any) => setDocument({ ...document, status: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">📝 Draft</SelectItem>
                    <SelectItem value="published">✅ Published</SelectItem>
                    <SelectItem value="archived">📦 Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Visibility */}
              <div className="space-y-2">
                <Label htmlFor="visibility">Visibility</Label>
                <Select
                  value={document.visibility}
                  onValueChange={(value: any) => setDocument({ ...document, visibility: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">🌍 Public</SelectItem>
                    <SelectItem value="workspace">👥 Workspace</SelectItem>
                    <SelectItem value="private">🔒 Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Right Main Content Area */}
          <div className="flex-1 flex flex-col">
            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
              <div className="border-b px-6 py-2">
                <TabsList className="w-full h-auto flex-wrap justify-start gap-2 p-2">
                  <TabsTrigger value="edit" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <Code className="h-4 w-4 mr-2" />
                    Edit
                  </TabsTrigger>
                  <TabsTrigger value="preview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="edit" className="flex-1 p-6 space-y-4 overflow-y-auto m-0">
                <div className="space-y-2">
                  <Label htmlFor="content">Content *</Label>
                  <Textarea
                    id="content"
                    value={document.content}
                    onChange={(e) => setDocument({ ...document, content: e.target.value })}
                    placeholder="Enter document content..."
                    className="min-h-[300px] font-mono"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="summary">Summary</Label>
                  <Textarea
                    id="summary"
                    value={document.summary}
                    onChange={(e) => setDocument({ ...document, summary: e.target.value })}
                    placeholder="Brief summary of the document"
                    rows={3}
                  />
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 p-6 overflow-y-auto m-0">
                <div className="prose max-w-none">
                  <h1>{document.title || 'Untitled Document'}</h1>
                  {document.summary && (
                    <p className="text-muted-foreground italic">{document.summary}</p>
                  )}
                  <div className="whitespace-pre-wrap">{document.content || 'No content yet...'}</div>
                </div>
              </TabsContent>
            </Tabs>

            {/* Footer Actions */}
            <div
              className="px-6 py-4 border-t flex justify-end gap-2"
              style={{
                background: 'var(--glass-bg)',
                backdropFilter: 'var(--glass-blur)',
              }}
            >
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

