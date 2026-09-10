/**
 * Per-workspace Revolut Business BYOK configuration client (#315).
 *
 * Same asymmetry as vivaConfigService, for the same reason:
 *   - WRITES of the non-secret fields (client_id, environment, enabled) go straight to
 *     `workspace_revolut_config` (RLS: is_workspace_finance_manager).
 *   - READS go through `get_workspace_revolut_config_status` — the table has NO select
 *     policy for `authenticated`, so the private key and tokens can never reach the browser.
 *   - Everything involving key material or the Revolut API goes through the `revolut-api`
 *     edge function (keypair minting, OAuth exchange, webhook registration, sync, mapping).
 */
import { supabase } from '@/integrations/supabase/client';

export type RevolutEnvironment = 'sandbox' | 'production';

export interface RevolutConfigStatus {
  configured: boolean;
  enabled: boolean;
  environment: RevolutEnvironment;
  has_client_id: boolean;
  has_keypair: boolean;
  public_key: string | null;
  oauth_redirect_uri: string | null;
  revtag: string | null;
  connected: boolean;
  webhook_ready: boolean;
  client_id_hint: string | null;
  connected_at: string | null;
  sync_watermark: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  updated_at: string | null;
}

const EMPTY: RevolutConfigStatus = {
  configured: false,
  enabled: false,
  environment: 'sandbox',
  has_client_id: false,
  has_keypair: false,
  public_key: null,
  oauth_redirect_uri: null,
  revtag: null,
  connected: false,
  webhook_ready: false,
  client_id_hint: null,
  connected_at: null,
  sync_watermark: null,
  last_sync_at: null,
  last_sync_error: null,
  updated_at: null,
};

export async function getRevolutStatus(workspaceId: string): Promise<RevolutConfigStatus> {
  const { data, error } = await supabase.rpc('get_workspace_revolut_config_status', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY;
  return { ...EMPTY, ...(row as Partial<RevolutConfigStatus>) };
}

export interface RevolutConfigInput {
  client_id?: string;
  environment?: RevolutEnvironment;
  enabled?: boolean;
  revtag?: string;
}

/**
 * Save the non-secret fields. Blank means "leave the stored value alone".
 *
 * THIS IS AN RPC AND NOT AN UPSERT, and the difference is why the Revolut connection kept
 * losing its client_id.
 *
 * The table has three policies — insert, update, delete — and deliberately NO select policy, so a
 * stored private key can never reach the browser. `INSERT ... ON CONFLICT DO UPDATE` cannot run
 * without reading the conflicting row, so with no select policy every save against an existing row
 * failed with `new row violates row-level security policy` — while a plain UPDATE and a plain
 * INSERT both worked, which is why this never looked like a policy problem. The row is created by
 * `revolut-api?action=init` under the service role, so the browser's FIRST save already took the
 * conflict path. The client_id was never once stored.
 *
 * The RPC also fixes what the upsert let through: the policy authorises the ROW, not the columns,
 * so a finance manager could PATCH `private_key` or `refresh_token` straight through PostgREST.
 * `save_workspace_revolut_config` takes one explicit parameter per field the UI owns (invariant 8).
 */
export async function saveRevolutConfig(workspaceId: string, input: RevolutConfigInput): Promise<void> {
  const blank = (v: string | undefined) => (v === undefined || v.trim() === '' ? null : v);
  const { error } = await supabase.rpc('save_workspace_revolut_config', {
    p_workspace_id: workspaceId,
    p_client_id: blank(input.client_id),
    p_environment: input.environment ?? null,
    p_enabled: input.enabled ?? null,
    p_revtag: blank(input.revtag),
  });
  if (error) throw new Error(error.message);
}

export interface RevolutAccountInfo {
  id: string;
  name?: string;
  balance: number;
  currency: string;
  state: string;
}

export interface RevolutBankAccountRow {
  id: string;
  name: string;
  currency: string | null;
  revolut_account_id: string | null;
}

/** One call surface for every `revolut-api` action; throws with the server's message. */
export async function callRevolutApi<T = Record<string, unknown>>(
  action: string,
  workspaceId: string,
  extra: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('revolut-api', {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) {
    // FunctionsHttpError carries the response; surface the server's error body if present.
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      const body = await ctx.json().catch(() => null) as { error?: string } | null;
      if (body?.error) throw new Error(body.error);
    }
    throw new Error(error.message);
  }
  /**
   * An APPLICATION failure inside a 200 is still a failure (#359 CM-23).
   *
   * `revolut-api` answers 200 with `{ ok: false, error }` on paths where the HTTP call itself
   * worked and the operation did not — a sync that could not reach Revolut, a config that is not
   * connected. `supabase.functions.invoke` reports no `error` for those, so every caller showed a
   * success toast over a failed operation and the operator learned nothing.
   */
  const body = data as { ok?: boolean; success?: boolean; error?: string } | null;
  if (body && (body.ok === false || body.success === false)) {
    throw new Error(body.error || 'The request did not complete.');
  }
  return data as T;
}

/** The redirect URI we register with Revolut — the module's callback route on this app. */
export function revolutRedirectUri(): string {
  return `${window.location.origin}/revolut/callback`;
}
