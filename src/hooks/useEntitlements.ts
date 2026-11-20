/** Module entitlement layer (the third gate, alongside tenancy + role/capability). */
import { useEffect, useMemo, useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';

interface ModuleAccessRow { slug: string; available: boolean; tier: string | null }

export const PLAN_NAMES = ['Free', 'Pro', 'Enterprise'] as const;

export interface EntitlementsApi {
  loading: boolean;
  /** Is this module available to the active workspace (free, entitled, or operator-root)? */
  isModuleAvailable: (slug: string) => boolean;
  /** Set of available module slugs for the active workspace. */
  availableSlugs: Set<string>;
  /** Price tier of a module ('free' | 'pro' | … | null when unknown). */
  tierOf: (slug: string) => string | null;
  /** The active workspace's plan level (0=Free,1=Pro,2=Enterprise) from its owner's subscription. */
  planLevel: number;
  /** Friendly plan name for the active workspace. */
  planName: string;
}

interface Snapshot { rows: ModuleAccessRow[]; planLevel: number; fetchedAt: number }

// One read per workspace shared by every mounted hook (28 call sites each fired both RPCs).
const STALE_MS = 60_000;
const cache = new Map<string, Snapshot>();
const inflight = new Map<string, Promise<Snapshot>>();
const listeners = new Set<() => void>();
const NO_ROWS: ModuleAccessRow[] = [];

async function fetchSnapshot(workspaceId: string): Promise<Snapshot> {
  const [access, plan] = await Promise.all([
    supabase.rpc('get_workspace_module_access', { p_workspace_id: workspaceId }),
    supabase.rpc('workspace_plan_level', { p_workspace_id: workspaceId }),
  ]);
  if (access.error) {
    // Fail OPEN and uncached: a network blip must never strip a paid surface (the API is the boundary).
    console.error('[useEntitlements] access fetch failed:', access.error.message || access.error);
    return { rows: [], planLevel: typeof plan.data === 'number' ? plan.data : 0, fetchedAt: 0 };
  }
  return {
    rows: (access.data ?? []) as ModuleAccessRow[],
    planLevel: typeof plan.data === 'number' ? plan.data : 0,
    fetchedAt: Date.now(),
  };
}

function load(workspaceId: string, force = false): Promise<Snapshot> {
  const hit = cache.get(workspaceId);
  if (!force && hit && hit.fetchedAt > 0 && Date.now() - hit.fetchedAt < STALE_MS) return Promise.resolve(hit);
  const running = inflight.get(workspaceId);
  if (running && !force) return running;
  const p = fetchSnapshot(workspaceId)
    .catch((): Snapshot => ({ rows: [], planLevel: 0, fetchedAt: 0 }))
    .then((snap) => {
      cache.set(workspaceId, snap);
      for (const l of listeners) l();
      return snap;
    })
    .finally(() => { if (inflight.get(workspaceId) === p) inflight.delete(workspaceId); });
  inflight.set(workspaceId, p);
  return p;
}

/** Re-read entitlements after activating/deactivating a module so every gate sees it at once. */
export function refreshEntitlements(workspaceId?: string): Promise<unknown> {
  if (workspaceId) return load(workspaceId, true);
  const ids = [...cache.keys()];
  cache.clear();
  return Promise.all(ids.map((id) => load(id, true)));
}

export function useEntitlements(): EntitlementsApi {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const [, setTick] = useState(0);

  useEffect(() => {
    const onChange = () => setTick((n) => n + 1);
    listeners.add(onChange);
    return () => { listeners.delete(onChange); };
  }, []);

  useEffect(() => {
    if (activeWorkspaceId) void load(activeWorkspaceId);
  }, [activeWorkspaceId]);

  const snap = activeWorkspaceId ? cache.get(activeWorkspaceId) : undefined;
  const loading = !!activeWorkspaceId && !snap;
  const rows = snap?.rows ?? NO_ROWS;
  const planLevel = snap?.planLevel ?? 0;

  return useMemo(() => {
    const available = new Set(rows.filter((r) => r.available).map((r) => r.slug));
    const tierBySlug = new Map(rows.map((r) => [r.slug, r.tier]));
    // While loading or on error (empty rows) hide nothing: an empty set is not "everything locked".
    const ready = !loading && rows.length > 0;
    return {
      loading: loading || wsLoading,
      availableSlugs: available,
      isModuleAvailable: (slug: string) => (ready ? available.has(slug) : true),
      tierOf: (slug: string) => tierBySlug.get(slug) ?? null,
      planLevel,
      planName: PLAN_NAMES[planLevel] ?? 'Free',
    };
  }, [rows, loading, wsLoading, planLevel]);
}
