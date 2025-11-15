import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Package,
  Image as ImageIcon,
  Grid3X3,
  Database,
  Eye,
  Trash2,
  RefreshCw,
  Search,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PDFDocument {
  id: string;
  filename: string;
  processing_status: string;
  created_at: string;
  metadata: any;
  products_count: number;
  chunks_count: number;
  images_count: number;
  embeddings_count: number;
}

export const PDFDocumentsList: React.FC = () => {
  const [documents, setDocuments] = useState<PDFDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workspaceId, setWorkspaceId] = useState<string>('');

  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadWorkspace();
  }, []);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
    }
  }, [workspaceId, statusFilter]);

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

      // Query source_documents table
      let query = supabase
        .from('source_documents')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('processing_status', statusFilter);
      }

      const { data: docsData, error: docsError } = await query;

      if (docsError) throw docsError;

      // For each document, get counts
      const documentsWithCounts = await Promise.all(
        (docsData || []).map(async (doc) => {
          // Get products count
          const { count: productsCount } = await supabase
            .from('products')
            .select('*', { count: 'exact', head: true })
            .eq('source_document_id', doc.id);

          // Get chunks count
          const { count: chunksCount } = await supabase
            .from('document_chunks')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', doc.id);

          // Get images count
          const { count: imagesCount } = await supabase
            .from('document_images')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', doc.id);

          // Get embeddings count
          const { count: embeddingsCount } = await supabase
            .from('embeddings')
            .select('*', { count: 'exact', head: true })
            .eq('document_id', doc.id);

          return {
            ...doc,
            products_count: productsCount || 0,
            chunks_count: chunksCount || 0,
            images_count: imagesCount || 0,
            embeddings_count: embeddingsCount || 0,
          };
        })
      );

      setDocuments(documentsWithCounts);
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load PDF documents',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm('Are you sure you want to delete this document? This will also delete all associated products, chunks, images, and embeddings.')) return;

    try {
      const { error } = await supabase
        .from('source_documents')
        .delete()
        .eq('id', docId);

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
        description: 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const handleViewDetails = (docId: string) => {
    navigate(`/admin/pdf-documents/${docId}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      completed: 'default',
      processing: 'secondary',
      failed: 'destructive',
    };
    return variants[status] || 'secondary';
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.filename.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total PDFs</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documents.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Products Extracted</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.reduce((sum, doc) => sum + doc.products_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Images Extracted</CardTitle>
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.reduce((sum, doc) => sum + doc.images_count, 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Embeddings Generated</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {documents.reduce((sum, doc) => sum + doc.embeddings_count, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>PDF Documents</CardTitle>
            <Button onClick={loadDocuments} variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search documents..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredDocuments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No documents found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filename</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Products</TableHead>
                  <TableHead className="text-center">Chunks</TableHead>
                  <TableHead className="text-center">Images</TableHead>
                  <TableHead className="text-center">Embeddings</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.map((doc) => (
                  <TableRow key={doc.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium">{doc.filename}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadge(doc.processing_status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(doc.processing_status)}
                          {doc.processing_status}
                        </span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{doc.products_count}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{doc.chunks_count}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{doc.images_count}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline">{doc.embeddings_count}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {new Date(doc.created_at).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(doc.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(doc.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
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
    </div>
  );
};

