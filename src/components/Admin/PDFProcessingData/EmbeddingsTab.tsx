import React, { useState, useEffect } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface EmbeddingsTabProps {
  workspaceId: string;
  onStatsUpdate: () => void;
}

export const EmbeddingsTab: React.FC<EmbeddingsTabProps> = ({ workspaceId, onStatsUpdate }) => {
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedEmbedding, setSelectedEmbedding] = useState<any | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (workspaceId) {
      loadEmbeddings();
    }
  }, [workspaceId, typeFilter]);

  const loadEmbeddings = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from('embeddings')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (typeFilter !== 'all') {
        query = query.eq('embedding_type', typeFilter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setEmbeddings(data || []);
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

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Embeddings</CardTitle>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="text">Text</SelectItem>
                <SelectItem value="visual">Visual</SelectItem>
                <SelectItem value="color">Color</SelectItem>
                <SelectItem value="texture">Texture</SelectItem>
                <SelectItem value="application">Application</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
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
                  <TableHead>Type</TableHead>
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
                      <Badge>{emb.embedding_type || 'text'}</Badge>
                    </TableCell>
                    <TableCell>
                      {emb.chunk_id ? 'Chunk' : emb.image_id ? 'Image' : 'Unknown'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{emb.embedding?.length || 0}</Badge>
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
                <h4 className="font-semibold mb-2">Type</h4>
                <Badge>{selectedEmbedding.embedding_type || 'text'}</Badge>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Source</h4>
                <p className="text-sm">
                  {selectedEmbedding.chunk_id
                    ? `Chunk ID: ${selectedEmbedding.chunk_id}`
                    : selectedEmbedding.image_id
                    ? `Image ID: ${selectedEmbedding.image_id}`
                    : 'Unknown'}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Vector Dimension</h4>
                <p className="text-sm">{selectedEmbedding.embedding?.length || 0}</p>
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

