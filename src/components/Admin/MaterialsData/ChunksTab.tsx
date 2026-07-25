import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/core/ui/table';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Eye, Loader2, FileText, Code, Globe, Grid3X3 } from 'lucide-react';
import { FilterBar, applyFiltersToQuery, type FilterValues } from '@/components/core/filters';
import { buildMaterialsDataFilters } from './materialsDataFilters';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { SmartPagination } from '@/components/core/ui/smart-pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';

interface ChunksTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const ChunksTab: React.FC<ChunksTabProps> = ({ workspaceId, jobIdFilter, onStatsUpdate }) => {
  const [chunks, setChunks] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  const groups = useMemo(() => buildMaterialsDataFilters('chunks', { jobIdFilter }), [jobIdFilter]);
  const [filterValues, setFilterValues] = useState<FilterValues>(
    () => (jobIdFilter?.trim() ? { source_job_id: jobIdFilter.trim() } : {}),
  );

  // The `?jobId=` deep link lives on the page above; mirror it into the values bag so it
  // shows up as a removable chip instead of an invisible predicate.
  useEffect(() => {
    setFilterValues((v) => ({ ...v, source_job_id: jobIdFilter?.trim() || undefined }));
  }, [jobIdFilter]);

  const buildQuery = useCallback((values: FilterValues, head: boolean) => {
    const query: any = supabase
      .from('document_chunks')
      .select(head ? 'id' : '*', { count: 'exact', head })
      .eq('workspace_id', workspaceId);
    return applyFiltersToQuery(query, groups, values);
  }, [workspaceId, groups]);

  const loadChunks = useCallback(async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data, error, count } = await buildQuery(filterValues, false)
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
  }, [buildQuery, filterValues, toast]);

  useEffect(() => { setCurrentPage(1); }, [filterValues]);

  // Debounced so typing in the search box doesn't fire a query per keystroke; the cleanup
  // also collapses the extra render caused by the page reset above into one fetch.
  useEffect(() => {
    if (!workspaceId) return;
    const timer = setTimeout(() => { void loadChunks(currentPage); }, 250);
    return () => clearTimeout(timer);
  }, [workspaceId, currentPage, loadChunks]);

  const previewCount = useCallback(async (values: FilterValues) => {
    const { count } = await buildQuery(values, true);
    return count ?? 0;
  }, [buildQuery]);

  const getSourceBadge = (sourceType: string | null | undefined) => {
    if (!sourceType) return <span className="text-xs text-muted-foreground">Unknown</span>;

    const badges = {
      pdf_processing: { label: 'PDF', icon: FileText, color: 'text-blue-600 dark:text-blue-400' },
      xml_import: { label: 'XML', icon: Code, color: 'text-emerald-600 dark:text-emerald-400' },
      web_scraping: { label: 'Web', icon: Globe, color: 'text-purple-600 dark:text-purple-400' },
    };

    const badge = badges[sourceType as keyof typeof badges];
    if (!badge) return <span className="text-xs text-muted-foreground capitalize">{sourceType}</span>;

    const Icon = badge.icon;
    return (
      <span className={`inline-flex items-center gap-1 text-xs ${badge.color}`}>
        <Icon className="h-3 w-3" />
        {badge.label}
      </span>
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Grid3X3 className="h-5 w-5" />
                All Chunks
              </CardTitle>
              <CardDescription>
                View and manage text chunks extracted from documents
              </CardDescription>
            </div>
            <FilterBar
              groups={groups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter chunks"
              searchPlaceholder="Search chunk content…"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : chunks.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No chunks found
            </div>
          ) : (
            <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Content Preview</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Has Embedding</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chunks.map((chunk) => (
                    <TableRow key={chunk.id}>
                      <TableCell className="font-medium">
                        {chunk.content?.substring(0, 100)}...
                      </TableCell>
                      <TableCell>{getSourceBadge(chunk.source_type)}</TableCell>
                      <TableCell>
                        {chunk.text_embedding ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400">Yes</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No</span>
                        )}
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
              {selectedChunk.text_embedding && (
                <div>
                  <h4 className="font-semibold mb-2">Embedding</h4>
                  <p className="text-xs text-muted-foreground">
                    Vector dimension: {selectedChunk.text_embedding.length}
                  </p>
                  <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto mt-2">
                    {JSON.stringify(selectedChunk.text_embedding.slice(0, 10), null, 2)}... (truncated)
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

