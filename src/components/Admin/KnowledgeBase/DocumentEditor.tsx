import React, { useState, useEffect } from 'react';
import {
  X,
  Save,
  Upload,
  Sparkles,
  FileText,
  Eye,
  Code,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { KnowledgeBaseService, KBDocument, KBCategory } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

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
  const kbService = KnowledgeBaseService.getInstance();

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
        const result = await kbService.listCategories(workspaces.id);
        setCategories(result.categories || []);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    }
  };

  const loadDocument = async () => {
    if (!documentId || !workspaceId) return;

    try {
      setIsLoading(true);
      const doc = await kbService.getDocument(documentId, workspaceId);
      setDocument(doc);
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
        await kbService.updateDocument(documentId, document);
        toast({
          title: 'Success',
          description: 'Document updated successfully',
        });
      } else {
        await kbService.createDocument(document);
        toast({
          title: 'Success',
          description: 'Document created successfully. Embedding generation in progress...',
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

    try {
      setIsLoading(true);
      const doc = await kbService.createFromPDF(
        file,
        workspaceId,
        document.title || file.name.replace('.pdf', ''),
        document.category_id
      );
      setDocument(doc);
      toast({
        title: 'Success',
        description: 'PDF text extracted successfully',
      });
    } catch (error) {
      console.error('Failed to upload PDF:', error);
      toast({
        title: 'Error',
        description: 'Failed to extract text from PDF',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {documentId ? 'Edit Document' : 'Create New Document'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
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
              <Label htmlFor="pdf">Upload PDF (Optional)</Label>
              <Input
                id="pdf"
                type="file"
                accept=".pdf"
                onChange={handleFileUpload}
              />
              <p className="text-xs text-muted-foreground">
                Upload a PDF to automatically extract text content
              </p>
            </div>
          )}

          {/* Content Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="edit">
                <Code className="h-4 w-4 mr-2" />
                Edit
              </TabsTrigger>
              <TabsTrigger value="preview">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </TabsTrigger>
            </TabsList>

            <TabsContent value="edit" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  value={document.content}
                  onChange={(e) => setDocument({ ...document, content: e.target.value })}
                  placeholder="Enter document content"
                  rows={10}
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

            <TabsContent value="preview">
              <div className="prose max-w-none p-4 border rounded-md">
                <h1>{document.title}</h1>
                {document.summary && (
                  <p className="text-muted-foreground italic">{document.summary}</p>
                )}
                <div className="whitespace-pre-wrap">{document.content}</div>
              </div>
            </TabsContent>
          </Tabs>

          {/* Status and Visibility */}
          <div className="grid grid-cols-2 gap-4">
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
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="published">Published</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>

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
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="workspace">Workspace</SelectItem>
                  <SelectItem value="private">Private</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
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
      </DialogContent>
    </Dialog>
  );
};

