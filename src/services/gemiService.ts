import { supabase } from '@/integrations/supabase/client';
import { parseEdgeError } from '@/utils/edgeError';

/**
 * ΓΕΜΗ (GEMI) OpenData client — Greek Commercial Registry enrichment.
 *
 * Backed by the `mygemi-opendata` edge function. Unlike ΑΑΔΕ ([[aadeService]]), ΓΕΜΗ is
 * public open data behind a single operator app-key, so there is NO per-workspace credential
 * and a lookup fires no external notification — any authenticated user may call it.
 */
export interface GemiNormalized {
  ar_gemi: string | null;         // Αριθμός ΓΕΜΗ — the GEMI registry number
  afm: string | null;
  name_el: string | null;         // registered name (Greek)
  name_en: string | null;         // official Latin-character name (ΓΕΜΗ-provided)
  title_el: string | null;        // distinctive title (Greek)
  title_en: string | null;        // distinctive title (Latin)
  legal_form: string | null;
  status: string | null;
  gemi_office: string | null;
  city: string | null;
  street: string | null;
  street_number: string | null;
  zip: string | null;
  incorporation_date: string | null;
  is_branch: boolean | null;
  auto_registered: boolean | null;
  activities: Array<{ code: string | null; description: string | null; type: string | null }>;
}

export interface GemiLookupResult {
  ok: true;
  source: 'gemi' | 'cache';
  checked_at: string;
  gemi: GemiNormalized;
  raw?: unknown;
}

export interface GemiLookupError {
  ok?: false;
  error: string;
  message?: string;
  http_status?: number;
}

export const gemiService = {
  /**
   * Look up a Greek business in ΓΕΜΗ by ΑΦΜ. If `companyId` is supplied, the server caches the
   * raw record + `gemi_number`/`gemi_legal_form`/`gemi_status` onto `crm_companies` (90-day TTL,
   * owner/admin only). Returns the normalized record for the UI to adopt.
   */
  async lookup(args: {
    afm: string;
    companyId?: string;
    workspaceId?: string;
    reason?: 'own_business' | 'crm_enrichment' | 'invoice_counterparty';
  }): Promise<GemiLookupResult | GemiLookupError> {
    const { data, error } = await supabase.functions.invoke('mygemi-opendata', {
      body: {
        afm: args.afm,
        company_id: args.companyId,
        workspace_id: args.workspaceId,
        reason: args.reason,
      },
    });
    // Keep the MACHINE code, not just a sentence: a caller must be able to tell "this ΑΦΜ has no
    // ΓΕΜΗ record" — the normal answer for sole traders, free professionals and foreign VATs that
    // happen to be 9 digits — apart from a real ΓΕΜΗ outage. `invoke` turns the 404 into `error`,
    // so collapsing it to a bare string here is what made a not-found read as a failure.
    if (error) {
      const parsed = await parseEdgeError(error, 'ΓΕΜΗ lookup failed');
      return { error: parsed.code ?? parsed.message, message: parsed.message, http_status: parsed.status };
    }
    if (data?.error) return data as GemiLookupError;
    return data as GemiLookupResult;
  },

  /** Whether the platform ΓΕΜΗ key is configured (admin-only). */
  async credsStatus(): Promise<{ configured: boolean; source: string } | null> {
    const { data, error } = await supabase.functions.invoke('mygemi-opendata', {
      body: { action: 'creds-status' },
    });
    if (error || !data || data.error) return null;
    return data;
  },
};
