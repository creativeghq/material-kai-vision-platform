// Reseller applications — the self-serve "become a reseller" flow.
//
// A plain signup is a CONSUMER of the operator. To become a reseller a user must
// supply a business VAT number; the operator verifies it with ΑΑΔΕ and approves,
// which upgrades their workspace (kind='reseller' + CRM mirror).
//
// Backend: reseller_applications table + submit/approve/reject SECURITY DEFINER
// RPCs, and the myaade-rgwspublic2 `verify-reseller-application` action for the
// operator's ΑΑΔΕ check. See the "Reseller onboarding" migrations.

import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// reseller_applications + its RPCs post-date the last `supabase gen types` run, so they're
// absent from the generated Database type. `sb` is a thin untyped handle for those calls;
// results are cast to the exported interfaces below (same pattern as hrService).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type ResellerApplicationStatus =
  | 'pending'
  | 'aade_verified'
  | 'aade_failed'
  | 'approved'
  | 'rejected';

export interface ResellerApplication {
  id: string;
  user_id: string;
  workspace_id: string | null;
  operator_workspace_id: string;
  vat_number: string;
  country_code: string;
  status: ResellerApplicationStatus;
  aade_valid: boolean | null;
  aade_snapshot: Record<string, unknown> | null;
  aade_checked_at: string | null;
  review_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AadeVerifyResult {
  ok: boolean;
  application_id: string;
  status: ResellerApplicationStatus;
  valid_afm: boolean;
  basic_rec: Record<string, unknown> | null;
  activities: Array<Record<string, unknown>>;
  aade_error: string | null;
}

export const resellerApplicationsService = {
  /** Applicant files (or re-files) their own reseller application. */
  async submit(vatNumber: string, countryCode = 'EL'): Promise<string> {
    const { data, error } = await sb.rpc('submit_reseller_application', {
      p_vat: vatNumber,
      p_country: countryCode.toUpperCase(),
    });
    if (error) throw error;
    return data as string;
  },

  /** Operator: list the review queue (RLS returns only the operator's applications). */
  async list(statuses?: ResellerApplicationStatus[]): Promise<ResellerApplication[]> {
    let q = sb
      .from('reseller_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (statuses && statuses.length) q = q.in('status', statuses);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as ResellerApplication[];
  },

  /** Operator: run the ΑΑΔΕ check on an application using the operator's codes. */
  async verifyAade(applicationId: string): Promise<AadeVerifyResult> {
    const { data, error } = await supabase.functions.invoke('myaade-rgwspublic2', {
      body: { action: 'verify-reseller-application', application_id: applicationId },
    });
    if (error) throw await edgeError(error, 'ΑΑΔΕ verification failed');
    return data as AadeVerifyResult;
  },

  /** Operator: approve (requires a passing ΑΑΔΕ check). Returns the reseller workspace id.
   *  `discountPct` = the reseller's discount off our catalog retail (their cost basis / margin room). */
  async approve(applicationId: string, discountPct = 0): Promise<string> {
    const { data, error } = await sb.rpc('approve_reseller_application', {
      p_application_id: applicationId,
      p_discount_pct: discountPct,
    });
    if (error) throw error;
    return data as string;
  },

  /** Operator: reject an application. */
  async reject(applicationId: string, notes?: string): Promise<void> {
    const { error } = await sb.rpc('reject_reseller_application', {
      p_application_id: applicationId,
      p_notes: notes ?? null,
    });
    if (error) throw error;
  },
};
