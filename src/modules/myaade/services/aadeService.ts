import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

export interface AadeBasicRec {
  afm: string | null;
  doy: string | null;
  doy_descr: string | null;
  i_ni_flag_descr: string | null;
  deactivation_flag: string | null;
  deactivation_flag_descr: string | null;
  firm_flag_descr: string | null;
  onomasia: string | null;
  commer_title: string | null;
  legal_status_descr: string | null;
  postal_address: string | null;
  postal_address_no: string | null;
  postal_zip_code: string | null;
  postal_area_description: string | null;
  regist_date: string | null;
  stop_date: string | null;
  normal_vat_system_flag: string | null;
}

export interface AadeFirmActivity {
  code: string | null;
  description: string | null;
  kind: number | null;
  kind_description: string | null;
}

export interface AadeLookupResult {
  ok: true;
  source: 'aade' | 'cache';
  checked_at: string;
  valid_afm: boolean;
  basic_rec: AadeBasicRec;
  activities: AadeFirmActivity[];
  secret_sources?: { username: string; password: string; afm_called_by: string };
}

export interface AadeLookupError {
  ok?: false;
  error: string;
  message?: string;
  code?: string | null;
  http_status?: number;
}

export const aadeService = {
  /**
   * Look up a Greek business by ΑΦΜ. If `companyId` is supplied, the server caches the result
   * on `crm_companies` and mirrors structured fields (commercial_title, kad_primary, tax_office, …).
   *
   * NOTE: every live call writes an audit entry into the looked-up ΑΦΜ's TAXISnet inbox AND into
   * our internal `aade_lookup_log`. Pass `reason` so the audit records WHY the lookup happened
   * ('own_business' | 'crm_enrichment' | 'invoice_counterparty'). Looking up a counterparty's ΑΦΜ
   * is legitimate in the context of a real business relationship (e.g. before invoicing them).
   */
  async lookup(args: {
    afm: string;
    companyId?: string;
    reason?: 'own_business' | 'crm_enrichment' | 'invoice_counterparty';
    workspaceId?: string;
  }): Promise<AadeLookupResult | AadeLookupError> {
    const { data, error } = await supabase.functions.invoke('myaade-rgwspublic2', {
      body: {
        afm: args.afm,
        company_id: args.companyId,
        reason: args.reason,
        workspace_id: args.workspaceId,
      },
    });
    if (error) return { error: await edgeErrorMessage(error) };
    if (data?.error) return data as AadeLookupError;
    return data as AadeLookupResult;
  },

  /** Per-workspace ΑΑΔΕ Special Access Codes STATUS (finance-manager only). Never returns the
   *  password to the browser — only whether one is set (`has_password`). */
  async getCreds(workspaceId: string): Promise<{ username: string | null; afm_called_by: string | null; enabled: boolean; has_password: boolean } | null> {
    const { data, error } = await supabase.rpc('get_aade_creds_status', { p_workspace_id: workspaceId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      username: row.username ?? null,
      afm_called_by: row.afm_called_by ?? null,
      enabled: row.enabled ?? true,
      has_password: !!row.has_password,
    };
  },

  /** Save this workspace's Special Access Codes. The password is only written when a new value
   *  is provided — saving with a blank password preserves the stored one (the masked form never
   *  wipes a stored secret). */
  async saveCreds(workspaceId: string, input: { username: string; password?: string; afmCalledBy?: string | null; enabled: boolean }): Promise<void> {
    const payload: Record<string, any> = {
      workspace_id: workspaceId,
      username: input.username || null,
      afm_called_by: input.afmCalledBy || null,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    };
    if (input.password && input.password.trim()) {
      payload.password = input.password.trim();
    }
    const { error } = await supabase.from('workspace_aade_credentials').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
  },
};
