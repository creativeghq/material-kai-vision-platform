import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Eye, Loader2, FileText, Code, Globe, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SmartPagination } from '@/components/ui/smart-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EmbeddingsTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const EmbeddingsTab: React.FC<EmbeddingsTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedEmbedding, setSelectedEmbedding] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (workspaceId) {
      setCurrentPage(1);
      loadEmbeddings(1);
    }
  }, [workspaceId, typeFilter, sourceFilter, jobIdFilter]);

  useEffect(() => {
    if (workspaceId) {
      loadEmbeddings(currentPage);
    }
  }, [currentPage]);

  const loadEmbeddings = async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Query text embeddings from document_chunks
      let textQuery = supabase
        .from('document_chunks')
        .select('id, chunk_text, text_embedding, created_at, document_id, documents!inner(workspace_id)', { count: 'exact' })
        .eq('documents.workspace_id', workspaceId)
        .not('text_embedding', 'is', null);

      // Note: job_id filtering removed as documents table doesn't have job_id column
      // If needed, this should be added to the documents table schema

      const { data: textData, error: textError, count: textCount } = await textQuery
        .order('created_at', { ascending: false })
        .range(from, to);

      if (textError) {
        console.error('Error loading embeddings:', textError);
        throw textError;
      }

      // Transform to unified format
      const transformedData = (textData || []).map(chunk => ({
        id: chunk.id,
        source_type: 'text',
        model_name: 'voyage-3.5',
        embedding_dimension: 1024,
        created_at: chunk.created_at,
        source_id: chunk.id,
        source_text: chunk.chunk_text?.substring(0, 200) + '...',
        workspace_id: workspaceId,
        source_job_id: null // documents table doesn't have job_id
      }));

      setEmbeddings(transformedData);
      setTotalCount(textCount || 0);
    } catch (error) {
      console.error('Failed to load embeddings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load embeddings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return <Badge variant="outline">Unknown</Badge>;

    const badges = {
      pdf_processing: { label: 'PDF', icon: FileText, color: 'bg-blue-100 text-blue-700' },
      xml_import: { label: 'XML', icon: Code, color: 'bg-green-100 text-green-700' },
      web_scraping: { label: 'Web', icon: Globe, color: 'bg-purple-100 text-purple-700' },
    };

    const badge = badges[sourceType as keyof typeof badges];
    if (!badge) return <Badge variant="outline">{sourceType}</Badge>;

    const Icon = badge.icon;
    return (
      <Badge className={`${badge.color} flex items-center gap-1`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </Badge>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                All Embeddings
              </CardTitle>
              <CardDescription>
                View vector embeddings generated from text and images
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Sources</SelectItem>
                  <SelectItem value="pdf_processing">PDF Processing</SelectItem>
                  <SelectItem value="xml_import">XML Import</SelectItem>
                  <SelectItem value="web_scraping">Web Scraping</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[250px]">
                  <SelectValue placeholder="Filter by model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Models</SelectItem>
                  <SelectItem value="voyage-3.5">voyage-3.5 (Text)</SelectItem>
                  <SelectItem value="clip">CLIP (Images)</SelectItem>
                  <SelectItem value="siglip">SigLIP (Images)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : embeddings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No embeddings found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Dimension</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {embeddings.map((emb) => (
                  <TableRow key={emb.id}>
                    <TableCell>
                      <Badge>{emb.model_name || 'text'}</Badge>
                    </TableCell>
                    <TableCell>
                      {getSourceBadge(emb.source_type)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{emb.embedding_dimension || 0}</Badge>
                    </TableCell>
                    <TableCell>
                      {new Date(emb.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEmbedding(emb)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="mt-6">
              <SmartPagination
                currentPage={currentPage}
                totalPages={Math.ceil(totalCount / ITEMS_PER_PAGE)}
                onPageChange={setCurrentPage}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {selectedEmbedding && (
        <Dialog open={true} onOpenChange={() => setSelectedEmbedding(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Embedding Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Model</h4>
                <Badge>{selectedEmbedding.model_name || 'text'}</Badge>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Source</h4>
                <p className="text-sm">
                  {selectedEmbedding.chunk_id
                    ? `Chunk ID: ${selectedEmbedding.chunk_id}`
                    : 'Unknown'}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Vector Dimension</h4>
                <p className="text-sm">{selectedEmbedding.dimensions || selectedEmbedding.embedding?.length || 0}</p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Embedding Vector (first 20 values)</h4>
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(selectedEmbedding.embedding?.slice(0, 20), null, 2)}
                  {selectedEmbedding.embedding?.length > 20 && '\n... (truncated)'}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

