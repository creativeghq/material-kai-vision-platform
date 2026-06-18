import React, { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
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
  Globe,
  Lock,
  Unlock,
  Database,
  Filter,
  X,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
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
import {
  KbFilterModal,
  EMPTY_KB_FILTERS,
  countActiveFilters,
  applyKbFiltersToQuery,
  type KbDocFilters,
} from './KbFilterModal';

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
  const [filters, setFilters] = useState<KbDocFilters>(EMPTY_KB_FILTERS);
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // category_id → access_level — used to mirror the kb_block_locked_doc_delete
  // trigger client-side so the delete button can be disabled BEFORE the user
  // gets a SQL error toast. Source of truth is still the DB trigger.
  const [categoryAccess, setCategoryAccess] = useState<Map<string, string>>(new Map());
  const [categoryLocked, setCategoryLocked] = useState<Map<string, boolean>>(new Map());

  // Pagination
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Embedding backfill
  const [embedBacklog, setEmbedBacklog] = useState(0);
  const [backfilling, setBackfilling] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
  }, []);

  // Reset to first page whenever the result set changes (filters / search).
  useEffect(() => {
    setPage(1);
  }, [filters, searchQuery]);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
      loadCategoryAccessMap();
      loadEmbedBacklog();
    }
  }, [workspaceId, filters, refreshTrigger, page, searchQuery]);

  const loadCategoryAccessMap = async () => {
    const { data } = await supabase
      .from('kb_categories')
      .select('id, access_level, is_locked')
      .eq('workspace_id', workspaceId);
    const m = new Map<string, string>();
    const lk = new Map<string, boolean>();
    (data ?? []).forEach((c: any) => { m.set(c.id, c.access_level); lk.set(c.id, c.is_locked === true); });
    setCategoryAccess(m);
    setCategoryLocked(lk);
  };

  const loadEmbedBacklog = async () => {
    const { count } = await supabase
      .from('kb_docs')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .is('text_embedding', null)
      .in('embedding_status', ['pending', 'failed']);
    setEmbedBacklog(count || 0);
  };

  // Mirrors the SQL `kb_is_doc_protected(uuid)` function — keep these in sync.
  const isDocLocked = (doc: KBDocument): boolean => {
    // Per-doc override wins over the derived state.
    if (doc.is_locked === true) return true;
    if (doc.is_locked === false) return false;
    const cat = doc.category_id ? categoryAccess.get(doc.category_id) : undefined;
    if (cat === 'agent') return true;
    if (doc.category_id && categoryLocked.get(doc.category_id)) return true;
    const autoSynced = (doc.metadata as Record<string, unknown> | undefined)?.auto_synced;
    return autoSynced === true || autoSynced === 'true';
  };

  const loadWorkspace = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's workspace
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
      setIsLoading(true);

      // Query kb_docs table directly, paginated (20/page). Search + filters
      // are applied server-side so they work across the whole set, not just
      // the current page.
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let query: any = supabase
        .from('kb_docs')
        .select('*', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false });

      query = applyKbFiltersToQuery(query, filters);

      const q = searchQuery.trim();
      if (q) {
        const esc = q.replace(/[%,()]/g, ' ');
        query = query.or(`title.ilike.%${esc}%,content.ilike.%${esc}%`);
      }

      query = query.range(from, to);

      const { data, error, count } = await query;

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
      setTotalCount(count || 0);
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
    const doc = documents.find((d) => d.id === docId);
    if (doc && isDocLocked(doc)) {
      toast({
        title: 'Locked',
        description: 'This document is locked because it lives in an agent-readable internal category or is auto-synced. Delete is intentionally disabled.',
        variant: 'destructive',
      });
      return;
    }
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

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    // Strip locked docs out of the delete set — the DB trigger would reject
    // the whole batch otherwise, killing the unlocked ones too.
    const lockedInBatch = documents.filter((d) => selectedIds.has(d.id) && isDocLocked(d));
    const deletable = Array.from(selectedIds).filter((id) => {
      const d = documents.find((x) => x.id === id);
      return d && !isDocLocked(d);
    });
    if (deletable.length === 0) {
      toast({
        title: 'All selected docs are locked',
        description: 'None of the selected documents can be deleted — they all live in agent-readable internal categories or are auto-synced.',
        variant: 'destructive',
      });
      return;
    }
    const confirmMsg = lockedInBatch.length > 0
      ? `Delete ${deletable.length} document${deletable.length === 1 ? '' : 's'}? ${lockedInBatch.length} locked doc${lockedInBatch.length === 1 ? '' : 's'} in the selection will be skipped. This cannot be undone.`
      : `Delete ${deletable.length} selected document${deletable.length === 1 ? '' : 's'}? This cannot be undone.`;
    if (!confirm(confirmMsg)) return;

    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from('kb_docs')
        .delete()
        .in('id', deletable)
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      toast({ title: 'Deleted', description: `${deletable.length} document${deletable.length === 1 ? '' : 's'} deleted${lockedInBatch.length > 0 ? ` · ${lockedInBatch.length} locked skipped` : ''}.` });
      setSelectedIds(new Set());
      loadDocuments();
    } catch (error) {
      console.error('Bulk delete failed:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Bulk delete failed',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleDeleteAllMatching = async (matchFilters: KbDocFilters, matchCount: number) => {
    setBulkBusy(true);
    try {
      // First fetch the candidate IDs + the fields needed to evaluate isDocLocked,
      // so we can strip locked rows out of the batch — otherwise the DB trigger
      // rejects the whole DELETE and zero rows get removed.
      let selectQ: any = supabase
        .from('kb_docs')
        .select('id, category_id, metadata')
        .eq('workspace_id', workspaceId);
      selectQ = applyKbFiltersToQuery(selectQ, matchFilters);
      const { data: candidates, error: selErr } = await selectQ;
      if (selErr) throw selErr;
      const deletable = (candidates ?? []).filter((d: any) => !isDocLocked(d as KBDocument));
      const skipped = (candidates ?? []).length - deletable.length;
      if (deletable.length === 0) {
        toast({
          title: 'All matching docs are locked',
          description: `${matchCount} doc${matchCount === 1 ? '' : 's'} matched the filters but every one is locked (agent-readable or auto-synced).`,
          variant: 'destructive',
        });
        return;
      }
      const { error } = await supabase
        .from('kb_docs')
        .delete()
        .in('id', deletable.map((d: any) => d.id))
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      toast({
        title: 'Deleted',
        description: `${deletable.length} document${deletable.length === 1 ? '' : 's'} matching the filters deleted${skipped > 0 ? ` · ${skipped} locked skipped` : ''}.`,
      });
      setSelectedIds(new Set());
      loadDocuments();
    } catch (error) {
      console.error('Delete-all-matching failed:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Delete failed',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const handleBulkUpdate = async (patch: { visibility?: 'public' | 'private'; status?: 'draft' | 'published' | 'archived' }) => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      const { error } = await supabase
        .from('kb_docs')
        .update(patch)
        .in('id', Array.from(selectedIds))
        .eq('workspace_id', workspaceId);

      if (error) throw error;

      const label = patch.visibility ? `visibility → ${patch.visibility}` : `status → ${patch.status}`;
      toast({ title: 'Updated', description: `${selectedIds.size} document${selectedIds.size === 1 ? '' : 's'} set to ${label}.` });
      setSelectedIds(new Set());
      loadDocuments();
    } catch (error) {
      console.error('Bulk update failed:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Bulk update failed',
        variant: 'destructive',
      });
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleSelectAll = (checked: boolean, ids: string[]) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) ids.forEach((id) => next.add(id));
      else ids.forEach((id) => next.delete(id));
      return next;
    });
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
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

  // One-click lock / unlock from the row. Sets an explicit per-doc override
  // (is_locked = true/false), which wins over category-derived lock state.
  const toggleLock = async (doc: KBDocument) => {
    const next = !isDocLocked(doc);
    try {
      const { error } = await supabase
        .from('kb_docs')
        .update({ is_locked: next })
        .eq('id', doc.id)
        .eq('workspace_id', workspaceId);
      if (error) throw error;
      toast({ title: next ? 'Locked' : 'Unlocked', description: `"${doc.title}" is now ${next ? 'locked (protected from deletion)' : 'unlocked'}.` });
      loadDocuments();
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : 'Could not change lock state.', variant: 'destructive' });
    }
  };

  // Kick the embedding backfill on demand (the pg_cron drains it automatically,
  // but this lets an admin push a batch immediately and see progress).
  const runBackfill = async () => {
    setBackfilling(true);
    try {
      const { data, error } = await supabase.functions.invoke('kb-embedding-backfill', {
        body: { workspace_id: workspaceId, limit: 25 },
      });
      if (error) throw error;
      toast({
        title: 'Embedding backfill ran',
        description: `Embedded ${data?.succeeded ?? 0} doc(s)${data?.failed ? `, ${data.failed} failed` : ''}. ${data?.remaining ?? 0} remaining (the drain cron handles the rest).`,
      });
      await loadEmbedBacklog();
      await loadDocuments();
    } catch (err) {
      toast({ title: 'Backfill failed', description: err instanceof Error ? err.message : 'Could not run backfill.', variant: 'destructive' });
    } finally {
      setBackfilling(false);
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

  // Search + filters are applied server-side (see loadDocuments), so the
  // current page is already the filtered set.
  const filteredDocuments = documents;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const activeFilterCount = useMemo(() => countActiveFilters(filters), [filters]);
  const filteredIds = useMemo(() => filteredDocuments.map((d) => d.id), [filteredDocuments]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  const getVisibilityBadge = (visibility?: string) =>
    visibility === 'private' ? (
      <Badge variant="outline" className="gap-1"><Lock className="h-3 w-3" />Private</Badge>
    ) : (
      <Badge variant="secondary" className="gap-1"><Globe className="h-3 w-3" />Public</Badge>
    );

  return (
    <>
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Documents</CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full gap-2"
              onClick={() => setFilterModalOpen(true)}
            >
              <Filter className="h-4 w-4" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="rounded-full ml-1">{activeFilterCount}</Badge>
              )}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full"
                onClick={() => setFilters(EMPTY_KB_FILTERS)}
                title="Clear all filters"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {embedBacklog > 0 && (
              <Button
                variant="outline"
                className="rounded-full gap-2"
                disabled={backfilling}
                onClick={runBackfill}
                title="Generate embeddings for docs that are pending or failed, so agents can retrieve them"
              >
                <Database className={`h-4 w-4 ${backfilling ? 'animate-pulse' : 'text-amber-500'}`} />
                {backfilling ? 'Embedding…' : `Backfill embeddings (${embedBacklog})`}
              </Button>
            )}
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4 mr-2" />
              New Document
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {selectedIds.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-y bg-muted/40">
            <span className="text-sm font-medium">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <Select disabled={bulkBusy} onValueChange={(v) => handleBulkUpdate({ visibility: v as 'public' | 'private' })}>
              <SelectTrigger className="w-[170px] h-8 rounded-full">
                <SelectValue placeholder="Set visibility…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="public">🌍 Public</SelectItem>
                <SelectItem value="private">🔒 Private</SelectItem>
              </SelectContent>
            </Select>
            <Select disabled={bulkBusy} onValueChange={(v) => handleBulkUpdate({ status: v as 'draft' | 'published' | 'archived' })}>
              <SelectTrigger className="w-[150px] h-8 rounded-full">
                <SelectValue placeholder="Set status…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button variant="destructive" size="sm" disabled={bulkBusy} onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </Button>
          </div>
        )}
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
                <TableHead className="w-10">
                  <Checkbox
                    checked={allFilteredSelected ? true : someFilteredSelected ? 'indeterminate' : false}
                    onCheckedChange={(checked) => toggleSelectAll(checked === true, filteredIds)}
                    aria-label="Select all"
                  />
                </TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Visibility</TableHead>
                <TableHead>Embedding</TableHead>
                <TableHead>Views</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredDocuments.map((doc) => (
                <TableRow key={doc.id} data-state={selectedIds.has(doc.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(doc.id)}
                      onCheckedChange={(checked) => toggleSelectOne(doc.id, checked === true)}
                      aria-label={`Select ${doc.title}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-1.5">
                      {isDocLocked(doc) && (
                        <Lock className="h-3.5 w-3.5 text-amber-500" aria-label="Locked — agent-readable or auto-synced" />
                      )}
                      {doc.title}
                    </span>
                  </TableCell>
                  <TableCell>{getStatusBadge(doc.status)}</TableCell>
                  <TableCell>{getVisibilityBadge(doc.visibility)}</TableCell>
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
                      <Button
                        variant="ghost"
                        size="sm"
                        title={doc.embedding_status === 'success' ? 'Re-generate embedding (force refresh)' : 'Generate embedding'}
                        disabled={retryingIds.has(doc.id)}
                        onClick={() => retryEmbedding(doc)}
                      >
                        <RefreshCw className={`h-4 w-4 ${doc.embedding_status === 'success' ? 'text-muted-foreground' : 'text-amber-500'} ${retryingIds.has(doc.id) ? 'animate-spin' : ''}`} />
                      </Button>
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
                        title={isDocLocked(doc) ? 'Unlock (allow deletion)' : 'Lock (protect from deletion)'}
                        onClick={() => toggleLock(doc)}
                      >
                        {isDocLocked(doc)
                          ? <Unlock className="h-4 w-4 text-amber-500" />
                          : <Lock className="h-4 w-4 text-muted-foreground" />}
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
                        disabled={isDocLocked(doc)}
                        title={isDocLocked(doc) ? 'Locked — agent-readable or auto-synced doc' : 'Delete'}
                        onClick={() => handleDelete(doc.id)}
                      >
                        <Trash2 className={`h-4 w-4 ${isDocLocked(doc) ? 'opacity-30' : ''}`} />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {totalCount > 0 && (
          <div className="flex items-center justify-between px-6 py-3 border-t">
            <span className="text-sm text-muted-foreground">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page <= 1 || isLoading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {page} / {totalPages}</span>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={page >= totalPages || isLoading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>

    <KbFilterModal
      open={filterModalOpen}
      onClose={() => setFilterModalOpen(false)}
      workspaceId={workspaceId}
      initialFilters={filters}
      onApply={(next) => setFilters(next)}
      onDeleteAllMatching={handleDeleteAllMatching}
    />

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
          <div className="flex-1 overflow-y-auto text-sm">
            {viewingDoc.content_markdown || viewingDoc.content ? (
              <div className="prose prose-sm dark:prose-invert max-w-none leading-relaxed">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {viewingDoc.content_markdown || viewingDoc.content || ''}
                </ReactMarkdown>
              </div>
            ) : (
              <p className="text-muted-foreground">No content.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    )}
    </>
  );
};

