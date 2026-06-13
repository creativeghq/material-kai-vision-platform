/**
 * #212 — module entitlement layer (the third gate, alongside tenancy + role/capability).
 *
 * A feature is usable only if its **module** is available to the ACTIVE workspace:
 *   available = workspace is root (operator) OR the module is a free baseline tier
 *               OR the workspace has been granted (purchased) an entitlement for it.
 *
 * Resolved server-side by `get_workspace_module_access` (member-guarded), so it's RLS-proof and
 * the same authority the backend uses. Consume via `isModuleAvailable(slug)`; gate on `loading`
 * before trusting it so paid surfaces don't flash for a frame.
 */
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

export function useEntitlements(): EntitlementsApi {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const [rows, setRows] = useState<ModuleAccessRow[]>([]);
  const [planLevel, setPlanLevel] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeWorkspaceId) { setRows([]); setPlanLevel(0); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [access, plan] = await Promise.all([
        supabase.rpc('get_workspace_module_access', { p_workspace_id: activeWorkspaceId }),
        supabase.rpc('workspace_plan_level', { p_workspace_id: activeWorkspaceId }),
      ]);
      if (cancelled) return;
      if (access.error) {
        // Fail OPEN on a transient error — never strip a paid surface from a paying tenant
        // because of a network blip. (The API/route remains the real boundary.)
        console.error('[useEntitlements] access fetch failed:', access.error.message || access.error);
        setRows([]);
      } else {
        setRows((access.data ?? []) as ModuleAccessRow[]);
      }
      setPlanLevel(typeof plan.data === 'number' ? plan.data : 0);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId]);

  return useMemo(() => {
    const available = new Set(rows.filter((r) => r.available).map((r) => r.slug));
    const tierBySlug = new Map(rows.map((r) => [r.slug, r.tier]));
    // While loading (or on error → empty rows), don't hide anything: callers should gate on
    // `loading`, and an empty set must not read as "everything is locked".
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
