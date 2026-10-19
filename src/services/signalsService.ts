/** Signals (#462): saved hiring / technology / intent signals and the corpus reads behind them. */
import { supabase } from '@/integrations/supabase/client';

export type SignalKind = 'hiring' | 'technology' | 'intent';

export const SIGNAL_KIND_MODULE: Record<SignalKind, string> = {
  hiring: 'signals-hiring',
  technology: 'signals-technographics',
  intent: 'signals-intent',
};

export const SIGNAL_KIND_LABEL: Record<SignalKind, string> = {
  hiring: 'Hiring',
  technology: 'Technology',
  intent: 'Intent',
};

export const SIGNAL_FILTER_KEY: Record<SignalKind, 'keywords' | 'technology_slugs' | 'intent_keys'> = {
  hiring: 'keywords',
  technology: 'technology_slugs',
  intent: 'intent_keys',
};

export interface SignalFilter {
  keywords?: string[];
  technology_slugs?: string[];
  intent_keys?: string[];
  crm_only?: boolean;
  location_contains?: string;
  evidence?: 'job_posting' | 'website_html';
}

export interface SavedSignal {
  id: string;
  workspace_id: string;
  kind: SignalKind;
  name: string;
  filter: SignalFilter;
  is_active: boolean;
  notify: boolean;
  last_evaluated_at: string | null;
  last_match_count: number;
  created_at: string;
}

export interface SignalMatch {
  id: string;
  signal_id: string;
  company_domain: string;
  payload: Record<string, unknown>;
  matched_at: string;
  dismissed_at: string | null;
}

export interface SignalCandidate {
  company_domain: string;
  company_name: string | null;
  match_key: string;
  observed_at: string;
  payload: Record<string, unknown>;
}

export interface CorpusCoverage {
  companies: number;
  companies_checked: number;
  companies_with_board: number;
  boards_unsupported: number;
  open_postings: number;
  last_enumerated_at: string | null;
}

export interface SignalSearchResult {
  kind: SignalKind;
  status: 'ok' | 'no_data' | 'not_collected';
  results: SignalCandidate[];
  coverage: CorpusCoverage;
}

export interface SignalsDictionary {
  technologies: Array<{ slug: string; name: string; category: string }>;
  intents: Array<{ key: string; label: string; description: string }>;
}

type SectionStatus = 'ok' | 'not_entitled';

export interface CompanySignalsOverview {
  domain: string | null;
  status: 'ok' | 'no_website' | 'not_collected' | 'pending';
  profile: {
    name: string | null;
    careers_url: string | null;
    ats_check_status: 'pending' | 'found' | 'none' | 'unreadable' | 'unreachable';
    ats_check_error: string | null;
    ats_checked_at: string | null;
    next_check_at: string | null;
  } | null;
  boards: Array<{ provider: string; status: string; last_enumerated_at: string | null; last_job_count: number | null; last_error: string | null }>;
  hiring: { status: SectionStatus; open_roles?: Array<{ title: string; url: string; location: string | null; department: string | null; first_seen_at: string }>; open_count?: number; opened_30d?: number; closed_30d?: number };
  technologies: { status: SectionStatus; items?: Array<{ slug: string; name: string; category: string; evidence: 'job_posting' | 'website_html'; evidence_url: string | null; first_seen_at: string; last_seen_at: string }> };
  intents: { status: SectionStatus; items?: Array<{ intent: string; label: string; matched_text: string | null; evidence_url: string | null; observed_at: string }> };
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export const signalsService = {
  async dictionary(): Promise<SignalsDictionary> {
    const { data, error } = await supabase.rpc('signals_dictionary' as never);
    fail(error);
    return (data ?? { technologies: [], intents: [] }) as unknown as SignalsDictionary;
  },

  async search(workspaceId: string, kind: SignalKind, filter: SignalFilter, days = 30, limit = 100): Promise<SignalSearchResult> {
    const { data, error } = await supabase.rpc('signals_search' as never, {
      p_workspace_id: workspaceId, p_kind: kind, p_filter: filter, p_days: days, p_limit: limit,
    } as never);
    fail(error);
    return data as unknown as SignalSearchResult;
  },

  async companyOverview(workspaceId: string, domainOrUrl: string): Promise<CompanySignalsOverview> {
    const { data, error } = await supabase.rpc('signals_company_overview' as never, {
      p_workspace_id: workspaceId, p_domain: domainOrUrl,
    } as never);
    fail(error);
    return data as unknown as CompanySignalsOverview;
  },

  async list(workspaceId: string): Promise<SavedSignal[]> {
    const { data, error } = await supabase
      .from('signals' as never)
      .select('id, workspace_id, kind, name, filter, is_active, notify, last_evaluated_at, last_match_count, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    fail(error);
    return (data ?? []) as unknown as SavedSignal[];
  },

  async matches(workspaceId: string, opts: { signalId?: string | null; includeDismissed?: boolean } = {}): Promise<SignalMatch[]> {
    let q = supabase
      .from('signal_matches' as never)
      .select('id, signal_id, company_domain, payload, matched_at, dismissed_at')
      .eq('workspace_id', workspaceId)
      .order('matched_at', { ascending: false })
      .limit(200);
    if (opts.signalId) q = q.eq('signal_id', opts.signalId);
    if (!opts.includeDismissed) q = q.is('dismissed_at', null);
    const { data, error } = await q;
    fail(error);
    return (data ?? []) as unknown as SignalMatch[];
  },

  async save(workspaceId: string, input: {
    id?: string | null; kind: SignalKind; name: string; filter: SignalFilter; isActive?: boolean; notify?: boolean;
  }): Promise<string> {
    const { data, error } = await supabase.rpc('signals_save' as never, {
      p_workspace_id: workspaceId, p_signal_id: input.id ?? null, p_kind: input.kind, p_name: input.name,
      p_filter: input.filter, p_is_active: input.isActive ?? true, p_notify: input.notify ?? true,
    } as never);
    fail(error);
    return data as unknown as string;
  },

  async remove(workspaceId: string, signalId: string): Promise<void> {
    const { error } = await supabase.rpc('signals_delete' as never, {
      p_workspace_id: workspaceId, p_signal_id: signalId,
    } as never);
    fail(error);
  },

  async dismissMatch(workspaceId: string, matchId: string, dismissed = true): Promise<void> {
    const { error } = await supabase.rpc('signal_match_dismiss' as never, {
      p_workspace_id: workspaceId, p_match_id: matchId, p_dismissed: dismissed,
    } as never);
    fail(error);
  },
};

export function describeSignalPayload(payload: Record<string, unknown>): { what: string; detail: string; url: string | null } {
  const s = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : '');
  if (s('title')) return { what: s('title'), detail: [s('location'), s('department')].filter(Boolean).join(' · '), url: s('url') || null };
  if (s('technology_name')) {
    return { what: s('technology_name'), detail: s('evidence') === 'website_html' ? 'Seen on their website' : 'Named in a job ad', url: s('evidence_url') || null };
  }
  if (s('intent_label')) return { what: s('intent_label'), detail: s('matched_text'), url: s('evidence_url') || null };
  return { what: '—', detail: '', url: null };
}
