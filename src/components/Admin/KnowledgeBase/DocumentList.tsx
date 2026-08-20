import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Plus, Edit, Trash2, Eye, CheckCircle, XCircle, Clock, RefreshCw, ExternalLink, Globe, Lock, Unlock, Database, FileText } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
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
import { TablePagination, TABLE_PAGE_SIZE, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { KBDocument } from '@/services/knowledgeBaseService';
import { supabase } from '@/integrations/supabase/client';
import { edgeError, edgeErrorMessage } from '@/utils/edgeError';
import { FilterBar, applyFiltersToQuery, countActive, type FilterValues } from '@/components/core/filters';
import { statusTone } from '@/utils/statusTone';
import { buildKbDocFilters, type KbFilterCategory } from './kbDocFilters';
import { formatDate } from '@/utils/datetime';
import { HubEmptyState } from '@/components/core/hub';

interface DocumentListProps {
  onEdit: (docId: string) => void;
  onCreate: () => void;
  refreshTrigger?: number;
  /**
   * When set (with a changing `nonce`), seed the filters to show only this
   * category — used when the user clicks a category on the Categories tab.
   */
  applyCategoryFilter?: { id: string; nonce: number } | null;
}

export const DocumentList: React.FC<DocumentListProps> = ({
  onEdit,
  onCreate,
  refreshTrigger,
  applyCategoryFilter,
}) => {
  const [documents, setDocuments] = useState<KBDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [values, setValues] = useState<FilterValues>({});
  const [workspaceId, setWorkspaceId] = useState<string>('');
  const [categories, setCategories] = useState<KbFilterCategory[]>([]);
  const [viewingDoc, setViewingDoc] = useState<KBDocument | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  // category_id → access_level — used to mirror the kb_block_locked_doc_delete
  // trigger client-side so the delete button can be disabled BEFORE the user
  // gets a SQL error toast. Source of truth is still the DB trigger.
  const [categoryAccess, setCategoryAccess] = useState<Map<string, string>>(new Map());
  const [categoryLocked, setCategoryLocked] = useState<Map<string, boolean>>(new Map());

  // Pagination — server-side (range + exact count), so `page` drives the query.
  const PAGE_SIZE = TABLE_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Embedding backfill
  const [embedBacklog, setEmbedBacklog] = useState(0);
  const [backfilling, setBackfilling] = useState(false);

  const { toast } = useToast();

  useEffect(() => {
    loadWorkspace();
  }, []);

  const filterGroups = useMemo(() => buildKbDocFilters(categories), [categories]);

  // Seed a single-category filter when the user clicks a category on the
  // Categories tab. Keyed on `nonce` so re-clicking the same category re-applies.
  useEffect(() => {
    if (applyCategoryFilter?.id) {
      setValues({ category_id: [applyCategoryFilter.id] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyCategoryFilter?.nonce]);

  // Reset to first page whenever the result set changes.
  useEffect(() => {
    setPage(1);
  }, [values]);

  useEffect(() => {
    if (workspaceId) {
      loadDocuments();
      loadCategoryAccessMap();
      loadEmbedBacklog();
    }
  }, [workspaceId, values, refreshTrigger, page]);

  const loadCategoryAccessMap = async () => {
    const { data } = await supabase
      .from('kb_categories')
      .select('id, name, icon, access_level, is_locked, sort_order')
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    const m = new Map<string, string>();
    const lk = new Map<string, boolean>();
    (data ?? []).forEach((c: any) => { m.set(c.id, c.access_level); lk.set(c.id, c.is_locked === true); });
    setCategoryAccess(m);
    setCategoryLocked(lk);
    setCategories((data ?? []).map((c: any) => ({ id: c.id, name: c.name, icon: c.icon })));
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

      query = applyFiltersToQuery(query, filterGroups, values).range(from, to);

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
      // A delete can drop the row count below the current page — re-clamp so the
      // next query lands on a page that still has rows.
      setPage((p) => clampPage(p, count || 0, PAGE_SIZE));
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

  // Destructive bulk action scoped to the CURRENT filter set — not the current page.
  // `totalCount` is the exact server count for exactly these filters, so it is the number
  // shown on the button and the number confirmed against.
  const handleDeleteAllMatching = async () => {
    const matchCount = totalCount;
    if (matchCount === 0) return;
    if (countActive(filterGroups, values) === 0) {
      toast({
        title: 'Refusing to delete',
        description: 'Pick at least one filter — deleting all documents requires explicit filters.',
        variant: 'destructive',
      });
      return;
    }
    if (!window.confirm(
      `Delete ${matchCount} document${matchCount === 1 ? '' : 's'} matching the current filters? This cannot be undone.`,
    )) return;

    setBulkBusy(true);
    try {
      // First fetch the candidate IDs + the fields needed to evaluate isDocLocked,
      // so we can strip locked rows out of the batch — otherwise the DB trigger
      // rejects the whole DELETE and zero rows get removed.
      let selectQ: any = supabase
        .from('kb_docs')
        .select('id, category_id, metadata')
        .eq('workspace_id', workspaceId);
      selectQ = applyFiltersToQuery(selectQ, filterGroups, values);
      const { data: candidates, error: selErr } = await selectQ;
      if (selErr) throw selErr;
      // The operator confirmed against `totalCount` (the exact server count). If the candidate
      // fetch came back short — PostgREST's `db-max-rows` cap, a filter the count and the select
      // disagree on — the delete silently covers less than what was confirmed, and the operator
      // reads "done". Say so instead. (#365 AD-39)
      const fetched = (candidates ?? []).length;
      if (fetched < matchCount) {
        toast({
          title: 'Refusing to delete a partial set',
          description:
            `${matchCount} document(s) matched but only ${fetched} could be read back, so this ` +
            'would delete part of what you confirmed. Narrow the filters and try again.',
          variant: 'destructive',
        });
        return;
      }
      const deletable = (candidates ?? []).filter((d: any) => !isDocLocked(d as KBDocument));
      const skipped = fetched - deletable.length;
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

    // `status: 'published'` and `visibility: 'public'` are the two settings that make a document
    // internet-readable — `kb_docs_public_read` grants anon SELECT on published + public rows in a
    // public category. Both were applied the instant the dropdown changed, so a mis-click
    // published every selected document with no confirmation and no undo. (#365 AD-38)
    const goesPublic = patch.status === 'published' || patch.visibility === 'public';
    if (goesPublic) {
      const n = selectedIds.size;
      const what = patch.status === 'published' ? 'Publish' : 'Make public';
      const ok = window.confirm(
        `${what} ${n} document${n === 1 ? '' : 's'}?\n\n` +
        'A document that is both published and public, in a public category, is readable by ' +
        'anyone on the internet without signing in.',
      );
      if (!ok) return;
    }

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
        throw new Error(
          error
            ? await edgeErrorMessage(error, data?.error || 'Unknown error')
            : data?.error || 'Unknown error',
        );
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
      if (error) throw await edgeError(error);
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

  const getStatusBadge = (status: string) => (
    <span className={`text-xs capitalize ${statusTone(status)}`}>{status}</span>
  );

  const getEmbeddingStatusIcon = (status?: string) => {
    if (status === 'success') return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />;
    return <Clock className="h-4 w-4 text-yellow-500" />;
  };

  // Search + filters are applied server-side (see loadDocuments), so the
  // current page is already the filtered set.
  const filteredDocuments = documents;

  const activeFilterCount = useMemo(() => countActive(filterGroups, values), [filterGroups, values]);

  // Live match count for the modal's Apply button — a head-only count so the preview never
  // pulls rows. Same defs as the list query, so the number is exact.
  const previewCount = useCallback(async (draft: FilterValues) => {
    if (!workspaceId) return 0;
    let q: any = supabase
      .from('kb_docs')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);
    q = applyFiltersToQuery(q, filterGroups, draft);
    const { count } = await q;
    return count ?? 0;
  }, [workspaceId, filterGroups]);

  const filteredIds = useMemo(() => filteredDocuments.map((d) => d.id), [filteredDocuments]);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id));
  const someFilteredSelected = filteredIds.some((id) => selectedIds.has(id));

  const getVisibilityBadge = (visibility?: string) =>
    visibility === 'private' ? (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize"><Lock className="h-3 w-3" />Private</span>
    ) : (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground capitalize"><Globe className="h-3 w-3" />Public</span>
    );

  return (
    <>
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <CardTitle>Documents</CardTitle>
          <div className="flex items-center gap-2">
            {embedBacklog > 0 && (
              <Button
                variant="outline"
                className="gap-2"
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
              New document
            </Button>
          </div>
        </div>
        <FilterBar
          groups={filterGroups}
          values={values}
          onChange={setValues}
          previewCount={previewCount}
          title="Filter documents"
          searchPlaceholder="Search title or content…"
        >
          {activeFilterCount > 0 && (
            <Button
              variant="destructive"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              disabled={bulkBusy || totalCount === 0}
              onClick={handleDeleteAllMatching}
              title="Delete every document matching the current filters"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {bulkBusy ? 'Deleting…' : `Delete ${totalCount} matching`}
            </Button>
          )}
        </FilterBar>
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
          <HubEmptyState
            icon={FileText}
            title="No documents yet"
            description="Knowledge-base documents are what the assistant reads before it answers, and what a customer sees on the public help pages."
            action={<Button size="sm" onClick={onCreate}><Plus /> New document</Button>}
          />
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
                    {formatDate(doc.created_at)}
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
        <TablePagination
          page={page}
          total={totalCount}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          label="documents"
        />
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

