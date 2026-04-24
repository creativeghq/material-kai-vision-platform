import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ModuleRow } from './ModuleDefinition';

interface RegistryState {
  rows: ModuleRow[];
  isLoading: boolean;
  fetchedAt: number;
}

const STALE_MS = 60_000;

let cache: RegistryState = { rows: [], isLoading: true, fetchedAt: 0 };
let inflight: Promise<ModuleRow[]> | null = null;
const listeners = new Set<(state: RegistryState) => void>();

function notify() {
  for (const listener of listeners) listener(cache);
}

async function fetchRows(): Promise<ModuleRow[]> {
  const { data, error } = await supabase
    .from('modules')
    .select('slug, name, description, category, price_tier, icon, version, enabled, created_at, updated_at');
  if (error) {
    console.error('[useEnabledModules] fetch failed:', error);
    return [];
  }
  return (data ?? []) as ModuleRow[];
}

async function loadIfStale(force = false): Promise<void> {
  const age = Date.now() - cache.fetchedAt;
  if (!force && age < STALE_MS && cache.fetchedAt > 0) return;
  if (inflight) {
    await inflight;
    return;
  }
  inflight = fetchRows();
  try {
    const rows = await inflight;
    cache = { rows, isLoading: false, fetchedAt: Date.now() };
    notify();
  } finally {
    inflight = null;
  }
}

function subscribe(listener: (state: RegistryState) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function useModuleRegistry(): RegistryState {
  const [state, setState] = useState<RegistryState>(cache);

  useEffect(() => {
    const unsubscribe = subscribe(setState);
    void loadIfStale();
    return unsubscribe;
  }, []);

  return state;
}

export function useEnabledModules(): {
  enabledSlugs: Set<string>;
  isLoading: boolean;
  rows: ModuleRow[];
} {
  const { rows, isLoading } = useModuleRegistry();
  const enabledSlugs = new Set<string>(rows.filter((m) => m.enabled).map((m) => m.slug));
  return { enabledSlugs, isLoading, rows };
}

export function useModule(slug: string): {
  enabled: boolean;
  row: ModuleRow | undefined;
  isLoading: boolean;
} {
  const { rows, isLoading } = useModuleRegistry();
  const row = rows.find((m) => m.slug === slug);
  return { enabled: row?.enabled ?? false, row, isLoading };
}

/**
 * Force a refetch of the module registry. Call this from admin UI after
 * flipping a toggle so the change is reflected immediately without waiting
 * for the staleness window.
 */
export async function refreshModuleRegistry(): Promise<void> {
  await loadIfStale(true);
}
