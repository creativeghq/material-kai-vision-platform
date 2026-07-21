/**
 * Duplicate Detection Admin Page
 * View & manage detected duplicate product pairs from the backend service.
 * Route: /admin/duplicate-detection
 *
 * CRITICAL: Duplicates are only flagged when products are from the SAME factory/manufacturer.
 */

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { MIVAA_API_URL } from '@/config/mivaa';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import {
  FilterBar,
  applyFiltersToQuery,
  useFilters,
  type FilterGroupDef,
  type FilterValues,
  type RangeValue,
} from '@/components/core/filters';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/core/ui/card';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/core/ui/tooltip';
import {
  AlertTriangle,
  CheckCircle2,
  GitMerge,
  Percent,
  RefreshCw,
  Trash2,
  Eye,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface DuplicatePair {
  id: string;
  workspace_id: string;
  product_id_1: string;
  product_id_2: string;
  overall_similarity_score: number;
  name_similarity: number | null;
  description_similarity: number | null;
  visual_similarity: number | null;
  metadata_similarity: number | null;
  similarity_breakdown: Record<string, unknown> | null;
  is_duplicate: boolean;
  confidence_level: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  detected_at: string | null;
  // Joined
  product1?: { name: string };
  product2?: { name: string };
}

/**
 * `duplicate_detection_cache.status` carries no CHECK constraint; these are the four values
 * the detection service and this page write.
 */
const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'merged', label: 'Merged' },
  { value: 'dismissed', label: 'Dismissed' },
];

const FILTER_GROUPS: FilterGroupDef[] = [
  {
    key: 'general', label: 'Review', icon: CheckCircle2,
    fields: [
      {
        key: 'q', type: 'text', label: 'Search',
        placeholder: 'Search product names…',
        // Client-side: the product names come from a second batched fetch, not the row.
        accessor: (p: any) => [p.product1?.name, p.product2?.name],
      },
      { key: 'status', type: 'multi', label: 'Status', column: 'status', options: STATUS_OPTIONS },
      {
        key: 'confidence_level', type: 'multi', label: 'Confidence',
        column: 'confidence_level',
        options: [
          { value: 'high', label: 'High' },
          { value: 'medium', label: 'Medium' },
          { value: 'low', label: 'Low' },
        ],
      },
    ],
  },
  {
    key: 'similarity', label: 'Similarity', icon: Percent,
    fields: [
      {
        key: 'overall_similarity_score', type: 'range', label: 'Overall similarity',
        description: 'Fraction, not percent — 0.6 is the detector default.',
        column: 'overall_similarity_score', min: 0, max: 1, step: 0.05,
      },
      { key: 'name_similarity', type: 'range', label: 'Name similarity', column: 'name_similarity', min: 0, max: 1, step: 0.05 },
      { key: 'visual_similarity', type: 'range', label: 'Visual similarity', column: 'visual_similarity', min: 0, max: 1, step: 0.05 },
    ],
  },
];

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  reviewed: 'bg-blue-100 text-blue-800 border-blue-200',
  merged: 'bg-green-100 text-green-800 border-green-200',
  dismissed: 'bg-gray-100 text-gray-600 border-gray-200',
};

const CONFIDENCE_COLORS: Record<string, string> = {
  high: 'text-red-600',
  medium: 'text-yellow-600',
  low: 'text-gray-500',
};

function SimilarityBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? 'bg-red-400' : pct >= 60 ? 'bg-yellow-400' : 'bg-green-400';
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden shrink-0">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{pct}%</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>{label}: {pct}%</TooltipContent>
    </Tooltip>
  );
}

export function DuplicateDetectionPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [pairs, setPairs] = useState<DuplicatePair[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<DuplicatePair | null>(null);
  const [merging, setMerging] = useState(false);
  const [page, setPage] = useState(1);

  // `filtered` only applies the client-side `q` field; status / confidence / the similarity
  // ranges carry `column` and are pushed into the query below.
  const { values, setValues, filtered } = useFilters<DuplicatePair>(pairs, FILTER_GROUPS, {
    initial: { status: ['pending'], overall_similarity_score: { min: 0.6 } },
  });

  const workspaceId =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('current_workspace_id')
      : null;

  const buildQuery = useCallback((v: FilterValues, head: boolean) => {
    const query: any = supabase
      .from('duplicate_detection_cache')
      .select(head ? 'id' : '*', head ? { count: 'exact', head: true } : undefined)
      .eq('workspace_id', workspaceId);
    return applyFiltersToQuery(query, FILTER_GROUPS, v);
  }, [workspaceId]);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);

    const query = buildQuery(values, false)
      .order('overall_similarity_score', { ascending: false })
      // Raised from 200 alongside pagination — a client-side pager over a truncated
      // fetch would hide pairs that look like they're on a later page.
      .limit(1000);

    const { data, error } = await query;

    if (error) {
      toast({ title: 'Error loading duplicates', description: error.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    if (!data || data.length === 0) {
      setPairs([]);
      setLoading(false);
      return;
    }

    // Fetch product names. Batched because `in(...)` goes on the URL — 2000 uuids in one
    // call blows past the request-line limit.
    const allIds = Array.from(new Set(data.flatMap((d: any) => [d.product_id_1, d.product_id_2])));
    const productMap: Record<string, { id: string; name: string }> = {};
    for (let i = 0; i < allIds.length; i += 200) {
      const { data: products } = await supabase
        .from('products')
        .select('id, name')
        .in('id', allIds.slice(i, i + 200));
      for (const p of products ?? []) productMap[p.id] = p;
    }

    const enriched: DuplicatePair[] = data.map((d: any) => ({
      ...d,
      product1: productMap[d.product_id_1],
      product2: productMap[d.product_id_2],
    }));

    setPairs(enriched);
    setLoading(false);
  }, [workspaceId, buildQuery, values, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const previewCount = useCallback(async (v: FilterValues) => {
    const { count } = await buildQuery(v, true);
    return count ?? 0;
  }, [buildQuery]);

  // Reset on any filter change; clamp when a reload shrinks the result set.
  useEffect(() => { setPage(1); }, [values]);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);

  const updateStatus = async (pairId: string, newStatus: string) => {
    const { error } = await supabase
      .from('duplicate_detection_cache')
      .update({ status: newStatus, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
      .eq('id', pairId);

    if (error) {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    } else {
      setPairs((prev) => prev.map((p) => p.id === pairId ? { ...p, status: newStatus } : p));
      toast({ title: 'Status updated' });
    }
  };

  const triggerBatchScan = async () => {
    if (!workspaceId) return;
    setScanning(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = MIVAA_API_URL;
      const res = await fetch(`${apiUrl}/api/duplicates/batch-detect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          workspace_id: workspaceId,
          // The scan reuses whatever floor the operator is currently looking at.
          similarity_threshold: (values.overall_similarity_score as RangeValue | undefined)?.min ?? 0.6,
          limit: 500,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      const result = await res.json();
      toast({
        title: 'Scan complete',
        description: `Found ${result.duplicate_pairs_found} duplicate pair(s).`,
      });
      load();
    } catch (err) {
      toast({
        title: 'Scan failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setScanning(false);
    }
  };

  const handleMerge = async () => {
    if (!mergeTarget || !user) return;
    setMerging(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = MIVAA_API_URL;
      const res = await fetch(`${apiUrl}/api/duplicates/merge`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          target_product_id: mergeTarget.product_id_1,
          source_product_ids: [mergeTarget.product_id_2],
          workspace_id: workspaceId,
          user_id: user.id,
          merge_strategy: 'manual',
          merge_reason: 'Merged via Duplicate Detection admin panel',
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      toast({ title: 'Products merged', description: `${mergeTarget.product2?.name} merged into ${mergeTarget.product1?.name}.` });
      await updateStatus(mergeTarget.id, 'merged');
      setMergeTarget(null);
      load();
    } catch (err) {
      toast({
        title: 'Merge failed',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setMerging(false);
    }
  };

  const stats = {
    total: pairs.length,
    pending: pairs.filter((p) => p.status === 'pending').length,
    highConf: pairs.filter((p) => p.confidence_level === 'high').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <p className="text-sm text-muted-foreground">
          Products flagged as potential duplicates from the same manufacturer.
        </p>
        <Button
          onClick={triggerBatchScan}
          disabled={scanning || !workspaceId}
          className="rounded-full gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning…' : 'Run Scan'}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="dashboard-card p-4 text-center">
          <p className="text-3xl font-light text-primary">{stats.total}</p>
          <p className="text-xs text-muted-foreground mt-1">Total pairs</p>
        </div>
        <div className="dashboard-card p-4 text-center">
          <p className="text-3xl font-light text-yellow-600">{stats.pending}</p>
          <p className="text-xs text-muted-foreground mt-1">Pending review</p>
        </div>
        <div className="dashboard-card p-4 text-center">
          <p className="text-3xl font-light text-red-600">{stats.highConf}</p>
          <p className="text-xs text-muted-foreground mt-1">High confidence</p>
        </div>
      </div>

      <FilterBar
        groups={FILTER_GROUPS}
        values={values}
        onChange={setValues}
        previewCount={previewCount}
        title="Filter duplicate pairs"
        searchPlaceholder="Search product names…"
      />

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 text-center text-muted-foreground">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3" />
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
              <p className="text-muted-foreground">
                {Array.isArray(values.status) && values.status.length === 1 && values.status[0] === 'pending'
                  ? 'No pending duplicates. Run a scan to detect new ones.'
                  : 'No results matching filters.'}
              </p>
            </div>
          ) : (
            <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product A</TableHead>
                  <TableHead>Product B</TableHead>
                  <TableHead>Overall</TableHead>
                  <TableHead className="hidden md:table-cell">Breakdown</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(filtered, page).map((pair) => (
                  <TableRow key={pair.id}>
                    <TableCell className="max-w-[150px]">
                      <button
                        className="text-sm font-medium hover:underline text-left line-clamp-2"
                        onClick={() => navigate(`/compare?ids=${pair.product_id_1}`)}
                      >
                        {pair.product1?.name ?? pair.product_id_1.slice(0, 8) + '…'}
                      </button>
                    </TableCell>
                    <TableCell className="max-w-[150px]">
                      <button
                        className="text-sm font-medium hover:underline text-left line-clamp-2"
                        onClick={() => navigate(`/compare?ids=${pair.product_id_2}`)}
                      >
                        {pair.product2?.name ?? pair.product_id_2.slice(0, 8) + '…'}
                      </button>
                    </TableCell>
                    <TableCell>
                      <span className="text-lg font-semibold text-primary">
                        {Math.round(pair.overall_similarity_score * 100)}%
                      </span>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <div className="space-y-1">
                        <SimilarityBar value={pair.name_similarity} label="Name" />
                        <SimilarityBar value={pair.visual_similarity} label="Visual" />
                        <SimilarityBar value={pair.description_similarity} label="Description" />
                      </div>
                    </TableCell>
                    <TableCell>
                      {pair.confidence_level ? (
                        <span className={`text-sm font-medium capitalize ${CONFIDENCE_COLORS[pair.confidence_level] ?? ''}`}>
                          {pair.confidence_level}
                        </span>
                      ) : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`capitalize text-xs ${STATUS_COLORS[pair.status] ?? ''}`}
                      >
                        {pair.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => navigate(`/compare?ids=${pair.product_id_1},${pair.product_id_2}`)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Compare side-by-side</TooltipContent>
                        </Tooltip>

                        {pair.status === 'pending' && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700"
                                  onClick={() => updateStatus(pair.id, 'reviewed')}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark reviewed</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                  onClick={() => updateStatus(pair.id, 'dismissed')}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Dismiss</TooltipContent>
                            </Tooltip>
                          </>
                        )}

                        {(pair.status === 'pending' || pair.status === 'reviewed') && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-green-600 hover:text-green-700"
                                onClick={() => setMergeTarget(pair)}
                              >
                                <GitMerge className="h-3.5 w-3.5" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Merge products</TooltipContent>
                          </Tooltip>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="pairs" />
            </>
          )}
        </CardContent>
      </Card>

      {/* Merge confirmation dialog */}
      <Dialog open={!!mergeTarget} onOpenChange={(open) => !open && setMergeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Merge Products
            </DialogTitle>
            <DialogDescription>
              This will merge <strong>{mergeTarget?.product2?.name}</strong> into{' '}
              <strong>{mergeTarget?.product1?.name}</strong>. The source product will be
              deleted. This action can be undone via merge history.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2 text-sm">
            <div className="flex justify-between p-3 bg-muted rounded-lg">
              <span className="text-muted-foreground">Keep</span>
              <span className="font-medium">{mergeTarget?.product1?.name}</span>
            </div>
            <div className="flex justify-between p-3 bg-destructive/10 rounded-lg">
              <span className="text-muted-foreground">Remove</span>
              <span className="font-medium">{mergeTarget?.product2?.name}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setMergeTarget(null)}>
              Cancel
            </Button>
            <Button
              className="rounded-full gap-2"
              onClick={handleMerge}
              disabled={merging}
            >
              <GitMerge className="h-4 w-4" />
              {merging ? 'Merging…' : 'Merge'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DuplicateDetectionPage;
