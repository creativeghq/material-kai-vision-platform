/**
 * The active workspace's cost codes, loaded once and shared.
 *
 * A cost code picker appears on a bill, an expense, a time entry, a quote line, an order line, a
 * task and a snag — several of them on one screen at a time. Each fetching its own copy would be
 * a query per row, and worse, two pickers could disagree about what exists after an edit. One
 * module-level cache per workspace, with an explicit invalidation the manager calls after it
 * writes, keeps every picker on the same list.
 */
import { useCallback, useEffect, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { costCodesService, costCodeTree, flattenCostCodes, type CostCode } from '@/services/costCodesService';

type Entry = { promise: Promise<CostCode[]>; codes: CostCode[] | null };

const cache = new Map<string, Entry>();
const subscribers = new Set<() => void>();

/**
 * Drop the cached list and tell every mounted picker to reload. Called by the manager after any
 * write — without it a picker keeps offering a code that was just archived.
 */
export function invalidateCostCodes(workspaceId?: string | null): void {
  if (workspaceId) cache.delete(workspaceId);
  else cache.clear();
  for (const notify of subscribers) notify();
}

function load(workspaceId: string): Entry {
  const hit = cache.get(workspaceId);
  if (hit) return hit;
  const entry: Entry = { codes: null, promise: Promise.resolve([]) };
  entry.promise = costCodesService.list(workspaceId).then((codes) => {
    entry.codes = codes;
    return codes;
  }).catch((err) => {
    // A failed load must not be cached as "this workspace has no cost codes" — that is the shape
    // where a picker silently offers nothing and every cost lands uncoded.
    cache.delete(workspaceId);
    throw err;
  });
  cache.set(workspaceId, entry);
  return entry;
}

export interface UseCostCodes {
  codes: CostCode[];
  /** Depth-first with the nesting depth, ready to indent. */
  ordered: Array<{ code: CostCode; depth: number }>;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

export function useCostCodes(): UseCostCodes {
  const { activeWorkspaceId } = useWorkspace();
  const [codes, setCodes] = useState<CostCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(() => {
    if (!activeWorkspaceId) {
      setCodes([]);
      setLoading(false);
      return () => {};
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    load(activeWorkspaceId).promise
      .then((list) => { if (!cancelled) { setCodes(list); setLoading(false); } })
      .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  useEffect(() => run(), [run]);

  useEffect(() => {
    const notify = () => run();
    subscribers.add(notify);
    return () => { subscribers.delete(notify); };
  }, [run]);

  const reload = useCallback(() => {
    invalidateCostCodes(activeWorkspaceId);
  }, [activeWorkspaceId]);

  return {
    codes,
    ordered: flattenCostCodes(costCodeTree(codes)),
    loading,
    error,
    reload,
  };
}
