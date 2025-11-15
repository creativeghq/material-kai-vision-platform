import React, { useState, useEffect } from 'react';
import { Link2, Plus, Trash2, Package } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { KBAttachment, KBDocument } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

export const ProductAttachments: React.FC = () => {
  const [attachments, setAttachments] = useState<KBAttachment[]>([]);
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [newAttachment, setNewAttachment] = useState<Partial<KBAttachment>>({
    relationship_type: 'primary',
    relevance_score: 5,
  });
  const [workspaceId, setWorkspaceId] = useState<string>('');

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
      loadAttachments();
    }
  }, [workspaceId]);

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
      }
    } catch (error) {
      console.error('Failed to load workspace:', error);
    }
  };

  const loadDocuments = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('kb_docs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setDocuments(data || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
    } finally {
      setIsLoading(false);
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
    setNewAttachment({
      relationship_type: 'primary',
      relevance_score: 5,
    });
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
      // Save directly to Supabase instead of API Gateway
      const { error } = await supabase
        .from('kb_doc_attachments')
        .insert({
          ...newAttachment,
          workspace_id: workspaceId,
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Product attachment created successfully',
      });
      setShowEditor(false);
      loadAttachments();
    } catch (error) {
      console.error('Failed to create attachment:', error);
      toast({
        title: 'Error',
        description: 'Failed to create attachment',
        variant: 'destructive',
      });
    }
  };

  const getRelationshipBadge = (type: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'outline'> = {
      primary: 'default',
      supplementary: 'secondary',
      related: 'outline',
      certification: 'default',
      specification: 'secondary',
    };
    return <Badge variant={variants[type] || 'outline'}>{type}</Badge>;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Product Attachments</CardTitle>
            <Button onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Link Document to Product
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading attachments...</div>
          ) : attachments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No product attachments found. Link documents to products to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Document</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Relationship</TableHead>
                  <TableHead>Relevance</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attachments.map((attachment) => (
                  <TableRow key={attachment.id}>
                    <TableCell className="font-medium">
                      {attachment.document_id}
                    </TableCell>
                    <TableCell>{attachment.product_name || attachment.product_id}</TableCell>
                    <TableCell>{getRelationshipBadge(attachment.relationship_type)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span
                            key={i}
                            className={
                              i < attachment.relevance_score
                                ? 'text-yellow-500'
                                : 'text-gray-300'
                            }
                          >
                            ★
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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

            <div className="space-y-2">
              <Label htmlFor="relevance">Relevance Score (1-5)</Label>
              <Select
                value={String(newAttachment.relevance_score)}
                onValueChange={(value) =>
                  setNewAttachment({ ...newAttachment, relevance_score: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5].map((score) => (
                    <SelectItem key={score} value={String(score)}>
                      {score} - {'★'.repeat(score)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowEditor(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave}>Create Attachment</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

