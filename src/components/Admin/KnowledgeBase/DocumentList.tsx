import React, { useState, useEffect } from 'react';
import {
  Plus,
  Edit,
  Trash2,
  Eye,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { KBDocument } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';

interface DocumentListProps {
  onEdit: (docId: string) => void;
  onCreate: () => void;
  searchQuery: string;
  refreshTrigger?: number;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  onEdit,
  onCreate,
  searchQuery,
  refreshTrigger,
}) => {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
    }
  }, [workspaceId, statusFilter, refreshTrigger]);

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's workspace
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

      // Query kb_docs table directly
      let query = supabase
        .from('kb_docs')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;

      if (error) {
        // Check if table doesn't exist
        if (error.message.includes('relation') && error.message.includes('does not exist')) {
          toast({
            title: 'Database Setup Required',
            description: 'The Knowledge Base tables need to be created in Supabase. Please contact your administrator.',
            variant: 'destructive',
          });
          setDocuments([]);
          return;
        }
        throw error;
      }

      setDocuments(data || []);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load documents',
        variant: 'destructive',
      });
      setDocuments([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document?')) return;

    try {
      const { error } = await supabase
        .from('kb_docs')
        .delete()
        .eq('id', docId)
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
      loadDocuments();
    } catch (error) {
      console.error('Failed to delete document:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());

  const retryEmbedding = async (doc: KBDocument) => {
    setRetryingIds((s) => new Set(s).add(doc.id));
    try {
      const { data, error } = await supabase.functions.invoke('kb-generate-embedding', {
        body: { doc_id: doc.id },
      });
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error || 'Unknown error');
      }
      await loadDocuments();
      toast({ title: 'Embedding generated', description: `${data.dimensions}D vector saved successfully.` });
    } catch (err) {
      toast({
        title: 'Embedding failed',
        description: err instanceof Error ? err.message : 'Could not generate embedding.',
        variant: 'destructive',
      });
    } finally {
      setRetryingIds((s) => { const n = new Set(s); n.delete(doc.id); return n; });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      draft: 'secondary',
      published: 'default',
      archived: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const getEmbeddingStatusIcon = (status?: string) => {
    if (status === 'success') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    doc.content.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Documents</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Document
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-8">Loading documents...</div>
        ) : filteredDocuments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No documents found. Create your first document to get started.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Embedding</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">{doc.title}</TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getEmbeddingStatusIcon(doc.embedding_status)}
                      <span className="text-xs text-muted-foreground">
                        {doc.embedding_status || 'pending'}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>{doc.view_count}</TableCell>
                  <TableCell>
                    {new Date(doc.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {doc.status === 'published' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="View on public KB"
                          onClick={() => window.open(`/knowledge-base?doc=${doc.id}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4 text-blue-500" />
                        </Button>
                      )}
                      {doc.embedding_status !== 'success' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          title="Retry embedding generation"
                          disabled={retryingIds.has(doc.id)}
                          onClick={() => retryEmbedding(doc)}
                        >
                          <RefreshCw className={`h-4 w-4 text-amber-500 ${retryingIds.has(doc.id) ? 'animate-spin' : ''}`} />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setViewingDoc(doc)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(doc.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>

    {/* Document Viewer */}
    {viewingDoc && (
      <Dialog open={true} onOpenChange={() => setViewingDoc(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{viewingDoc.title}</DialogTitle>
            {viewingDoc.summary && (
              <p className="text-sm text-muted-foreground italic">{viewingDoc.summary}</p>
            )}
          </DialogHeader>
          <div className="flex-1 overflow-y-auto prose max-w-none text-sm">
            <div className="whitespace-pre-wrap font-sans leading-relaxed">
              {viewingDoc.content || 'No content.'}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
};

