/**
 * Per-workspace Revolut MERCHANT (checkout) BYOK config client (#315).
 * Same asymmetry as viva/banking configs: writes direct under RLS, reads via a
 * self-guarding status RPC — the secret API key never reaches the browser.
 */
import { supabase } from '@/integrations/supabase/client';

export type RevolutMerchantEnvironment = 'sandbox' | 'production';

export interface RevolutMerchantStatus {
  configured: boolean;
  enabled: boolean;
  environment: RevolutMerchantEnvironment;
  has_secret_key: boolean;
  webhook_ready: boolean;
  updated_at: string | null;
}

const EMPTY: RevolutMerchantStatus = {
  configured: false,
  enabled: false,
  environment: 'sandbox',
  has_secret_key: false,
  webhook_ready: false,
  updated_at: null,
};

export async function getRevolutMerchantStatus(workspaceId: string): Promise<RevolutMerchantStatus> {
  const { data, error } = await supabase.rpc('get_workspace_revolut_merchant_status', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return row ? { ...EMPTY, ...(row as Partial<RevolutMerchantStatus>) } : EMPTY;
}

export interface RevolutMerchantInput {
  secret_key?: string;
  environment?: RevolutMerchantEnvironment;
  enabled?: boolean;
}

/**
 * Blank means "leave the stored key alone". An RPC, not an upsert — see
 * `save_workspace_revolut_config` for why.
 *
 * Short version: this table has no SELECT policy, and `INSERT ... ON CONFLICT DO UPDATE` cannot
 * run without reading the conflicting row, so the save is refused with `new row violates row-level
 * security policy` the moment a row exists. It had not bitten yet only because nobody has rotated
 * these credentials since the row was created.
 */
export async function saveRevolutMerchantConfig(workspaceId: string, input: RevolutMerchantInput): Promise<void> {
  const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : v);
  const { error } = await supabase.rpc('save_workspace_revolut_merchant_config', {
    p_workspace_id: workspaceId,
    p_secret_key: blank(input.secret_key),
    p_environment: input.environment ?? null,
    p_enabled: input.enabled ?? null,
  });
  if (error) throw new Error(error.message);
}

/** Register the settlement webhook with the tenant's own key (edge does the API call). */
export async function activateRevolutMerchantWebhook(workspaceId: string): Promise<void> {
  // Plain function name — the edge function routes on the Revolut-Signature header
  // (deliveries are signed; browser calls are not), so no query-string is needed.
  const { data, error } = await supabase.functions.invoke('revolut-merchant-webhooks', {
    body: { workspace_id: workspaceId },
  });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message);
  }
  if (!(data as { ok?: boolean })?.ok) throw new Error('webhook registration failed');
}
