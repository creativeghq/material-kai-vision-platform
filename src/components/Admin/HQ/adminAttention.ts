import { useEffect, useState } from 'react';

import { supabase } from '@/integrations/supabase/client';

export interface AdminAttention {
  approvals: {
    registrations: number;
    access: number;
    resellers: number;
    marketplace: number;
    supplier_claims: number;
    freight_quotes: number;
  };
  integrity: { critical: number; warning: number; info: number };
  ingestion: { needs_review: number; audited: number };
  jobs: { failed_24h: number; stale: number };
  providers: { failing: number; unprobed: number; enabled: number };
  generated_at: string;
}

export type ApprovalQueue = keyof AdminAttention['approvals'];

export function approvalsTotal(a: AdminAttention | null): number {
  if (!a) return 0;
  return Object.values(a.approvals).reduce((s, n) => s + n, 0);
}

interface State {
  data: AdminAttention | null;
  error: string | null;
  loading: boolean;
}

const REFRESH_MS = 60_000;

let state: State = { data: null, error: null, loading: false };
let inflight: Promise<void> | null = null;
let fetchedAt = 0;
const listeners = new Set<(s: State) => void>();

function emit(next: Partial<State>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l(state));
}

/** One fetch of `admin_hq_attention()` shared by the sidebar counts and the Overview. */
export function refreshAdminAttention(): Promise<void> {
  if (inflight) return inflight;
  emit({ loading: true });
  inflight = (async () => {
    const { data, error } = await supabase.rpc('admin_hq_attention' as never);
    fetchedAt = Date.now();
    if (error) emit({ error: error.message, loading: false });
    else emit({ data: data as unknown as AdminAttention, error: null, loading: false });
    inflight = null;
  })();
  return inflight;
}

export function useAdminAttention(): State & { refresh: () => Promise<void> } {
  const [s, setS] = useState<State>(state);
  useEffect(() => {
    listeners.add(setS);
    if (Date.now() - fetchedAt > REFRESH_MS / 2) void refreshAdminAttention();
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshAdminAttention();
    }, REFRESH_MS);
    return () => {
      listeners.delete(setS);
      window.clearInterval(t);
    };
  }, []);
  return { ...s, refresh: refreshAdminAttention };
}
