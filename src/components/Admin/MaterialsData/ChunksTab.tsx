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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Eye, Loader2, FileText, Code, Globe } from 'lucide-react';
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
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const ChunksTab: React.FC<ChunksTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [chunks, setChunks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedChunk, setSelectedChunk] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  useEffect(() => {
    if (workspaceId) {
      setCurrentPage(1);
      loadChunks(1);
    }
  }, [workspaceId, sourceFilter, jobIdFilter]);

  useEffect(() => {
    if (workspaceId) {
      loadChunks(currentPage);
    }
  }, [currentPage]);

  const loadChunks = async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      let query = supabase
        .from('document_chunks')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId);

      // Apply source filter
      if (sourceFilter !== 'all') {
        query = query.eq('source_type', sourceFilter);
      }

      // Apply job ID filter
      if (jobIdFilter && jobIdFilter.trim()) {
        query = query.eq('source_job_id', jobIdFilter.trim());
      }

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) throw error;
      setChunks(data || []);
      setTotalCount(count || 0);
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
            <CardTitle>All Chunks</CardTitle>
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
          </div>
        </CardHeader>
        <CardContent className="p-0">
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
                  <TableHead>Source</TableHead>
                  <TableHead>Page</TableHead>
                  <TableHead>Has Embedding</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {filteredChunks.map((chunk) => (
                    <TableRow key={chunk.id}>
                      <TableCell>
                        <div className="truncate max-w-[400px]" title={chunk.content?.substring(0, 200)}>
                          {chunk.content?.substring(0, 100)}...
                        </div>
                      </TableCell>
                      <TableCell>{getSourceBadge(chunk.source_type)}</TableCell>
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

          {/* Pagination */}
          {totalCount > ITEMS_PER_PAGE && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>

              {Array.from({ length: Math.ceil(totalCount / ITEMS_PER_PAGE) }, (_, i) => i + 1).map(page => (
                <Button
                  key={page}
                  variant={currentPage === page ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              ))}

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(totalCount / ITEMS_PER_PAGE), p + 1))}
                disabled={currentPage === Math.ceil(totalCount / ITEMS_PER_PAGE)}
              >
                Next
              </Button>
            </div>
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

