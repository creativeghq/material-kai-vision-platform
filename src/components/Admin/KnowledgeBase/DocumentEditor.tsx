import React, { useState, useEffect, useRef } from 'react';
import { Save, Eye, Code, Bold, Italic, Heading1, Heading2, List, ListOrdered, Link, Quote, Minus, Table } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { toast } = useToast();

  // Insert markdown syntax around selection or at cursor
  const insertMarkdown = (before: string, after = '', placeholder = '') => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = ta.value.slice(start, end) || placeholder;
    const newValue = ta.value.slice(0, start) + before + selected + after + ta.value.slice(end);
    setDocument((d) => ({ ...d, content: newValue }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  };

  const insertLine = (prefix: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', start - 1) + 1;
    const newValue = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    setDocument((d) => ({ ...d, content: newValue }));
    requestAnimationFrame(() => { ta.focus(); });
  };

  // Load workspace + categories on mount
  useEffect(() => {
    loadWorkspace();
    loadCategories();
  }, []);

  // Load document only once workspaceId is known (avoids race condition)
  useEffect(() => {
    if (documentId && workspaceId) {
      loadDocument();
    }
  }, [documentId, workspaceId]);

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

        // Fire-and-forget: trigger embedding generation via edge function (non-blocking)
        supabase.functions.invoke('kb-generate-embedding', { body: { doc_id: newDoc.id } })
          .catch(() => { /* embedding stays pending — retry button available in admin */ });

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
      <DialogContent className="w-[95vw] max-w-6xl max-h-[90vh] p-0 gap-0">
        {/* Header */}
        <div
          className="px-3 sm:px-6 py-3 sm:py-4 rounded-t-lg"
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

              <TabsContent value="edit" className="flex-1 flex flex-col m-0 overflow-hidden">
                {/* Markdown toolbar */}
                <div className="border-b px-4 py-1.5 flex flex-wrap gap-0.5 bg-muted/30">
                  {[
                    { icon: Heading1,     title: 'Heading 1',       action: () => insertLine('# ') },
                    { icon: Heading2,     title: 'Heading 2',       action: () => insertLine('## ') },
                    { icon: Bold,         title: 'Bold',             action: () => insertMarkdown('**', '**', 'bold text') },
                    { icon: Italic,       title: 'Italic',           action: () => insertMarkdown('*', '*', 'italic text') },
                    { icon: Quote,        title: 'Blockquote',       action: () => insertLine('> ') },
                    { icon: List,         title: 'Bullet list',      action: () => insertLine('- ') },
                    { icon: ListOrdered,  title: 'Numbered list',    action: () => insertLine('1. ') },
                    { icon: Link,         title: 'Link',             action: () => insertMarkdown('[', '](url)', 'link text') },
                    { icon: Code,         title: 'Code block',       action: () => insertMarkdown('```\n', '\n```', 'code') },
                    { icon: Minus,        title: 'Horizontal rule',  action: () => insertLine('\n---\n') },
                    { icon: Table,        title: 'Table',            action: () => insertLine('| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n') },
                  ].map(({ icon: Icon, title, action }) => (
                    <button
                      key={title}
                      type="button"
                      title={title}
                      onClick={action}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="content">Content *</Label>
                    <textarea
                      ref={textareaRef}
                      id="content"
                      value={document.content}
                      onChange={(e) => setDocument({ ...document, content: e.target.value })}
                      placeholder="Write your document content in Markdown..."
                      className="w-full min-h-[320px] font-mono text-sm rounded-md border border-input bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="summary">Summary</Label>
                    <Textarea
                      id="summary"
                      value={document.summary}
                      onChange={(e) => setDocument({ ...document, summary: e.target.value })}
                      placeholder="Brief summary of the document"
                      rows={3}
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="preview" className="flex-1 overflow-y-auto m-0">
                <div className="p-6 max-w-none space-y-1">
                  {document.title && <h1 className="text-2xl font-semibold text-foreground mb-1">{document.title}</h1>}
                  {document.summary && (
                    <p className="text-sm text-muted-foreground italic border-l-2 border-border pl-4 mb-4">{document.summary}</p>
                  )}
                  {document.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ children }) => <h1 className="text-2xl font-semibold text-foreground mt-6 mb-2">{children}</h1>,
                        h2: ({ children }) => <h2 className="text-xl font-semibold text-foreground mt-5 mb-2">{children}</h2>,
                        h3: ({ children }) => <h3 className="text-lg font-semibold text-foreground mt-4 mb-1.5">{children}</h3>,
                        h4: ({ children }) => <h4 className="text-base font-semibold text-foreground mt-3 mb-1">{children}</h4>,
                        p: ({ children }) => <p className="text-sm text-foreground/80 leading-relaxed my-2">{children}</p>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic text-foreground/80">{children}</em>,
                        a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>,
                        ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1 text-sm text-foreground/80 pl-2">{children}</ul>,
                        ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1 text-sm text-foreground/80 pl-2">{children}</ol>,
                        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
                        blockquote: ({ children }) => <blockquote className="border-l-4 border-primary/30 pl-4 my-3 text-sm text-muted-foreground italic">{children}</blockquote>,
                        code: ({ className, children, ...props }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock
                            ? <code className="block bg-muted rounded-lg p-4 text-sm font-mono text-foreground overflow-x-auto my-3">{children}</code>
                            : <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">{children}</code>;
                        },
                        pre: ({ children }) => <pre className="my-3 overflow-x-auto">{children}</pre>,
                        hr: () => <hr className="my-4 border-border" />,
                        table: ({ children }) => <div className="overflow-x-auto my-3"><table className="w-full text-sm border-collapse">{children}</table></div>,
                        thead: ({ children }) => <thead className="bg-muted">{children}</thead>,
                        th: ({ children }) => <th className="border border-border px-3 py-2 text-left font-semibold text-foreground">{children}</th>,
                        td: ({ children }) => <td className="border border-border px-3 py-2 text-foreground/80">{children}</td>,
                      }}
                    >
                      {document.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No content yet — switch to Edit to start writing.</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>

            {/* Footer Actions */}
            <div
              className="px-3 sm:px-6 py-3 sm:py-4 border-t flex justify-end gap-2"
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

