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
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Eye, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ChunksTabProps {
  workspaceId: string;
  onStatsUpdate: () => void;
}

export const ChunksTab: React.FC<ChunksTabProps> = ({ workspaceId, onStatsUpdate }) => {
  const [chunks, setChunks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedChunk, setSelectedChunk] = useState<any | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (workspaceId) {
      loadChunks();
    }
  }, [workspaceId]);

  const loadChunks = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('document_chunks')
        .select('*')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setChunks(data || []);
    } catch (error) {
      console.error('Failed to load chunks:', error);
      toast({
        title: 'Error',
        description: 'Failed to load chunks',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredChunks = chunks.filter((chunk) =>
    chunk.content?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Chunks</CardTitle>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search chunks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-64"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredChunks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No chunks found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Content Preview</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Has Embedding</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredChunks.map((chunk) => (
                  <TableRow key={chunk.id}>
                    <TableCell className="max-w-md truncate">
                      {chunk.content?.substring(0, 100)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{chunk.page_number || 'N/A'}</Badge>
                    </TableCell>
                    <TableCell>
                      {chunk.embedding ? (
                        <Badge>Yes</Badge>
                      ) : (
                        <Badge variant="secondary">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {new Date(chunk.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedChunk(chunk)}
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

      {selectedChunk && (
        <Dialog open={true} onOpenChange={() => setSelectedChunk(null)}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Chunk Details</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold mb-2">Content</h4>
                <p className="text-sm whitespace-pre-wrap bg-muted p-4 rounded-lg">
                  {selectedChunk.content}
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Page Number</h4>
                <Badge>{selectedChunk.page_number || 'N/A'}</Badge>
              </div>
              {selectedChunk.embedding && (
                <div>
                  <h4 className="font-semibold mb-2">Embedding</h4>
                  <p className="text-xs text-muted-foreground">
                    Vector dimension: {selectedChunk.embedding.length}
                  </p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto mt-2">
                    {JSON.stringify(selectedChunk.embedding.slice(0, 10), null, 2)}... (truncated)
                  </pre>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};

