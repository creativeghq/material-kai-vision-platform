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

/** Blank fields are omitted rather than written (re-save must not wipe the stored key). */
export async function saveRevolutMerchantConfig(workspaceId: string, input: RevolutMerchantInput): Promise<void> {
  const payload: Record<string, unknown> = { workspace_id: workspaceId, updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    payload[key] = value;
  }
  const { error } = await supabase
    .from('workspace_revolut_merchant_config')
    .upsert(payload as never, { onConflict: 'workspace_id' });
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
