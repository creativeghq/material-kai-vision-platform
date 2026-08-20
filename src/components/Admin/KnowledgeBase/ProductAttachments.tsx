import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Link as LinkIcon } from 'lucide-react';
import { HubEmptyState } from '@/components/core/hub';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KBAttachment } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

interface ProductLite {
  id: string;
  name: string | null;
  sku: string | null;
}

interface DocLite {
  id: string;
  title: string;
}

import { TablePagination, TABLE_PAGE_SIZE } from '@/components/core/ui/table-pagination';

const PAGE_SIZE = TABLE_PAGE_SIZE;

// Plain colored word per relationship type (house rule: no pill backgrounds in
// table rows) — only the text tone differs per type.
const RELATIONSHIP_TONE: Record<string, string> = {
  primary: 'text-primary',
  specification: 'text-sky-400',
  certification: 'text-emerald-400',
  supplementary: 'text-amber-400',
  related: 'text-muted-foreground',
};

export const ProductAttachments: React.FC = () => {
  const [attachments, setAttachments] = useState<KBAttachment[]>([]);
  const [documents, setDocuments] = useState<DocLite[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [newAttachment, setNewAttachment] = useState<Partial<KBAttachment>>({
    relationship_type: 'primary',
  });
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [page, setPage] = useState(1);

  const { toast } = useToast();

  const totalPages = Math.max(1, Math.ceil(attachments.length / PAGE_SIZE));
  const pagedAttachments = useMemo(
    () => attachments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [attachments, page],
  );

  // Keep the current page valid as rows are loaded / deleted.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
      loadProducts();
      loadAttachments();
    }
  }, [workspaceId]);

  const docTitleById = useMemo(() => {
    const m = new Map<string, string>();
    documents.forEach((d) => m.set(d.id, d.title));
    return m;
  }, [documents]);

  const productById = useMemo(() => {
    const m = new Map<string, ProductLite>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .limit(1)
        .maybeSingle();

      if (workspaces) {
        setWorkspaceId(workspaces.id);
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      const { data, error } = await supabase
        .from('kb_docs')
        .select('id, title')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments((data as DocLite[]) || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    }
  };

  const loadProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('id, name, sku')
        .eq('workspace_id', workspaceId)
        .order('name', { ascending: true });

      if (error) throw error;
      setProducts((data as ProductLite[]) || []);
    } catch (error) {
      console.error('Failed to load products:', error);
    }
  };

  const loadAttachments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('kb_doc_attachments')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAttachments(data || []);
    } catch (error) {
      console.error('Failed to load attachments:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = () => {
    setNewAttachment({ relationship_type: 'primary' });
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!newAttachment.document_id || !newAttachment.product_id) {
      toast({
        title: 'Validation Error',
        description: 'Document and product are required',
        variant: 'destructive',
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('kb_doc_attachments')
        .insert({
          ...newAttachment,
          workspace_id: workspaceId,
        });

      if (error) throw error;

      toast({ title: 'Success', description: 'Document linked to product' });
      setShowEditor(false);
      loadAttachments();
    } catch (error) {
      console.error('Failed to create attachment:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create link',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (attachment: KBAttachment) => {
    const docLabel = docTitleById.get(attachment.document_id) || 'this document';
    if (!confirm(`Remove the link between "${docLabel}" and its product?`)) return;

    try {
      const { error } = await supabase
        .from('kb_doc_attachments')
        .delete()
        .eq('id', attachment.id);

      if (error) throw error;
      toast({ title: 'Removed', description: 'Link deleted' });
      setAttachments((prev) => prev.filter((a) => a.id !== attachment.id));
    } catch (error) {
      console.error('Failed to delete attachment:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete link',
        variant: 'destructive',
      });
    }
  };

  const getRelationshipBadge = (type: string) => (
    <span className={`text-xs capitalize ${RELATIONSHIP_TONE[type] || RELATIONSHIP_TONE.related}`}>
      {type}
    </span>
  );

  const productLabel = (id: string) => {
    const p = productById.get(id);
    return p?.name || p?.sku || id;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Product Attachments</CardTitle>
            <Button onClick={handleCreate} className="rounded-full">
              <Plus className="h-4 w-4 mr-2" />
              Link document to product
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="text-center py-8">Loading attachments...</div>
          ) : attachments.length === 0 ? (
            <HubEmptyState
              icon={LinkIcon}
              title="No product attachments yet"
              description="Tie a document to the product it describes — a spec sheet, an installation guide, a warranty — and it shows on that product everywhere."
              action={<Button size="sm" onClick={handleCreate}><Plus className="h-4 w-4 mr-2" />Link document to product</Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedAttachments.map((attachment) => (
                  <TableRow key={attachment.id}>
                    <TableCell className="max-w-[320px]">
                      <div className="font-medium truncate">
                        {docTitleById.get(attachment.document_id) || 'Unknown document'}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {attachment.document_id}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[320px]">
                      <div className="font-medium truncate">
                        {productLabel(attachment.product_id)}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono truncate">
                        {attachment.product_id}
                      </div>
                    </TableCell>
                    <TableCell>{getRelationshipBadge(attachment.relationship_type)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(attachment)}
                        aria-label="Delete link"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <TablePagination
            page={page}
            total={attachments.length}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            label="attachments"
          />
        </CardContent>
      </Card>

      {/* Attachment Editor Dialog */}
      <Dialog open={showEditor} onOpenChange={setShowEditor}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Document to Product</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="document">Document *</Label>
              <Select
                value={newAttachment.document_id}
                onValueChange={(value) =>
                  setNewAttachment({ ...newAttachment, document_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select document" />
                </SelectTrigger>
                <SelectContent>
                  {documents.map((doc) => (
                    <SelectItem key={doc.id} value={doc.id}>
                      {doc.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="product">Product *</Label>
              <Select
                value={newAttachment.product_id}
                onValueChange={(value) =>
                  setNewAttachment({ ...newAttachment, product_id: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name || p.sku || p.id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="relationship">Relationship Type</Label>
              <Select
                value={newAttachment.relationship_type}
                onValueChange={(value: any) =>
                  setNewAttachment({ ...newAttachment, relationship_type: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary">Primary</SelectItem>
                  <SelectItem value="supplementary">Supplementary</SelectItem>
                  <SelectItem value="related">Related</SelectItem>
                  <SelectItem value="certification">Certification</SelectItem>
                  <SelectItem value="specification">Specification</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" className="rounded-full" onClick={() => setShowEditor(false)}>
                Cancel
              </Button>
              <Button className="rounded-full" onClick={handleSave}>Create link</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
