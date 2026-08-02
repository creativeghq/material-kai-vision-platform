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
import { Eye, Loader2, FileText, Code, Globe, Database } from 'lucide-react';
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

// The workspace scope is a join onto documents, so it can't collapse into the filter groups.
const SELECT_COLUMNS = `
  id,
  content,
  text_embedding,
  created_at,
  document_id,
  source_type,
  embedding_model,
  embedding_dimension,
  documents!inner(workspace_id)
`;

interface EmbeddingsTabProps {
  workspaceId: string;
  jobIdFilter?: string;
  onStatsUpdate: () => void;
}

export const EmbeddingsTab: React.FC<EmbeddingsTabProps> = ({ workspaceId, jobIdFilter}) => {
  const [embeddings, setEmbeddings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEmbedding, setSelectedEmbedding] = useState<any | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const { toast } = useToast();

  const ITEMS_PER_PAGE = 20;

  const groups = useMemo(() => buildMaterialsDataFilters('embeddings', { jobIdFilter }), [jobIdFilter]);
  const [filterValues, setFilterValues] = useState<FilterValues>(
    () => (jobIdFilter?.trim() ? { source_job_id: jobIdFilter.trim() } : {}),
  );

  // The `?jobId=` deep link lives on the page above; mirror it into the values bag so it
  // shows up as a removable chip instead of an invisible predicate. Before this the tab
  // rendered source/job/model Selects whose values were never applied to the query.
  useEffect(() => {
    setFilterValues((v) => ({ ...v, source_job_id: jobIdFilter?.trim() || undefined }));
  }, [jobIdFilter]);

  const buildQuery = useCallback((values: FilterValues, head: boolean) => {
    const query: any = supabase
      .from('document_chunks')
      .select(head ? 'id, documents!inner(workspace_id)' : SELECT_COLUMNS, { count: 'exact', head })
      .eq('documents.workspace_id', workspaceId)
      .not('text_embedding', 'is', null);
    return applyFiltersToQuery(query, groups, values);
  }, [workspaceId, groups]);

  const loadEmbeddings = useCallback(async (page: number) => {
    try {
      setIsLoading(true);

      const from = (page - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      const { data: textData, error: textError, count: textCount } = await buildQuery(filterValues, false)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (textError) {
        console.error('Error loading text embeddings:', textError);
        throw textError;
      }

      // Provenance comes off the row now — the previous hardcoded 'voyage-4' / 1024 would
      // have contradicted the model + dimension filters this tab exposes.
      const transformedData = (textData || []).map((chunk: any) => ({
        id: chunk.id,
        source_type: chunk.source_type,
        model_name: chunk.embedding_model,
        embedding_dimension: chunk.embedding_dimension,
        created_at: chunk.created_at,
        source_id: chunk.id,
        source_text: chunk.content?.substring(0, 200) + '...',
        workspace_id: workspaceId,
        embedding: chunk.text_embedding,
        chunk_id: chunk.id,
      }));

      setEmbeddings(transformedData);
      setTotalCount(textCount || 0);
    } catch (error: any) {
      console.error('Failed to load embeddings:', error);
      toast({
        title: 'Error',
        description: error?.message || 'Failed to load embeddings',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, filterValues, workspaceId, toast]);

  useEffect(() => { setCurrentPage(1); }, [filterValues]);

  // Debounced so typing in the search box doesn't fire a query per keystroke; the cleanup
  // also collapses the extra render caused by the page reset above into one fetch.
  useEffect(() => {
    if (!workspaceId) return;
    const timer = setTimeout(() => { void loadEmbeddings(currentPage); }, 250);
    return () => clearTimeout(timer);
  }, [workspaceId, currentPage, loadEmbeddings]);

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
                <Database className="h-4 w-4" />
                All Embeddings
              </CardTitle>
              <CardDescription>
                View vector embeddings generated from text and images
              </CardDescription>
            </div>
            <FilterBar
              groups={groups}
              values={filterValues}
              onChange={setFilterValues}
              previewCount={previewCount}
              title="Filter embeddings"
              searchPlaceholder="Search source text…"
            />
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
                      <Badge>{emb.model_name || 'unknown'}</Badge>
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
                <Badge>{selectedEmbedding.model_name || 'unknown'}</Badge>
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

