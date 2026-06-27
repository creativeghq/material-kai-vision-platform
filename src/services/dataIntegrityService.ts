// Client for the platform-wide Data Integrity framework.
// Reads go straight through Supabase (admin-only RLS via is_platform_admin); all mutations
// (run / heal / ignore / toggle) route through the `data-integrity-runner` edge function,
// which holds the service-role privileges and re-checks the admin role.
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

export type IntegritySeverity = 'info' | 'warning' | 'critical';
export type FindingStatus = 'open' | 'healed' | 'ignored';

export interface IntegrityCheck {
  key: string;
  domain: string;
  title: string;
  description: string | null;
  severity: IntegritySeverity;
  can_autoheal: boolean;
  autoheal_enabled: boolean;
  is_enabled: boolean;
  sort_order: number;
}

export interface IntegrityFinding {
  id: string;
  check_key: string;
  domain: string;
  severity: IntegritySeverity;
  workspace_id: string | null;
  entity_table: string | null;
  entity_id: string | null;
  detail: Record<string, unknown>;
  status: FindingStatus;
  first_seen_at: string;
  last_seen_at: string;
  healed_at: string | null;
  run_id: string | null;
}

export interface IntegrityRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  triggered_by: string;
  domains: string[] | null;
  autoheal: boolean;
  checks_run: number;
  findings_open: number;
  findings_healed: number;
  error: string | null;
}

async function invoke<T = { ok: boolean }>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('data-integrity-runner', { body });
  if (error) throw new Error((data as { error?: string } | null)?.error ?? (await edgeErrorMessage(error)));
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as T;
}

export const dataIntegrityService = {
  async listChecks(): Promise<IntegrityCheck[]> {
    const { data, error } = await supabase.from('data_integrity_checks').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []) as IntegrityCheck[];
  },

  async listFindings(opts: { status?: FindingStatus; domain?: string } = {}): Promise<IntegrityFinding[]> {
    let q = supabase.from('data_integrity_findings').select('*').order('last_seen_at', { ascending: false });
    if (opts.status) q = q.eq('status', opts.status);
    if (opts.domain) q = q.eq('domain', opts.domain);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as IntegrityFinding[];
  },

  async listRuns(limit = 10): Promise<IntegrityRun[]> {
    const { data, error } = await supabase.from('data_integrity_runs').select('*')
      .order('started_at', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []) as IntegrityRun[];
  },

  run: (opts: { autoheal?: boolean; domains?: string[] | null } = {}) =>
    invoke<{ ok: boolean; run_id: string }>({ action: 'run', autoheal: opts.autoheal ?? false, domains: opts.domains ?? null }),
  healCheck: (key: string) => invoke<{ ok: boolean; healed: number }>({ action: 'heal_check', key }),
  ignoreFinding: (findingId: string) => invoke({ action: 'ignore_finding', findingId }),
  reopenFinding: (findingId: string) => invoke({ action: 'reopen_finding', findingId }),
  setAutoheal: (key: string, enabled: boolean) => invoke({ action: 'set_autoheal', key, enabled }),
  toggleCheck: (key: string, enabled: boolean) => invoke({ action: 'toggle_check', key, enabled }),
};
