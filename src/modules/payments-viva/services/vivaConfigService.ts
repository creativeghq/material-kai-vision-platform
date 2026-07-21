/**
 * #273 — per-workspace Viva BYOK configuration client.
 *
 * Asymmetric by design, and deliberately so:
 *   - WRITES go straight to `workspace_viva_config` (RLS: is_workspace_finance_manager).
 *   - READS go through `get_workspace_viva_config_status`, which returns booleans and
 *     non-secret fields only. The table has NO select policy for `authenticated`, so a
 *     stored client_secret / api_key can never come back down to the browser.
 */
import { supabase } from '@/integrations/supabase/client';

export type VivaEnvironment = 'demo' | 'production';
export type VivaMethod = 'card' | 'bank_reference';

export interface VivaConfigStatus {
  configured: boolean;
  enabled: boolean;
  environment: VivaEnvironment;
  source_code: string;
  methods: VivaMethod[];
  has_client_id: boolean;
  has_client_secret: boolean;
  has_merchant_id: boolean;
  has_api_key: boolean;
  merchant_id_hint: string | null;
  webhook_verified_at: string | null;
  updated_at: string | null;
}

const EMPTY: VivaConfigStatus = {
  configured: false,
  enabled: false,
  environment: 'demo',
  source_code: 'Default',
  methods: ['card'],
  has_client_id: false,
  has_client_secret: false,
  has_merchant_id: false,
  has_api_key: false,
  merchant_id_hint: null,
  webhook_verified_at: null,
  updated_at: null,
};

export async function getVivaStatus(workspaceId: string): Promise<VivaConfigStatus> {
  const { data, error } = await supabase.rpc('get_workspace_viva_config_status', {
    p_workspace_id: workspaceId,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return EMPTY;
  return {
    ...EMPTY,
    ...row,
    methods: Array.isArray(row.methods) ? row.methods : ['card'],
  } as VivaConfigStatus;
}

export interface VivaConfigInput {
  client_id?: string;
  client_secret?: string;
  merchant_id?: string;
  api_key?: string;
  source_code?: string;
  environment?: VivaEnvironment;
  enabled?: boolean;
  methods?: VivaMethod[];
}

/**
 * Upsert the workspace's Viva credentials. Blank fields are omitted rather than written,
 * so re-saving the form without retyping a secret does not wipe the stored one.
 */
export async function saveVivaConfig(workspaceId: string, input: VivaConfigInput): Promise<void> {
  const payload: Record<string, unknown> = { workspace_id: workspaceId, updated_at: new Date().toISOString() };
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    payload[key] = value;
  }
  // No .select() — the table intentionally has no SELECT policy for authenticated.
  const { error } = await supabase
    .from('workspace_viva_config')
    .upsert(payload as never, { onConflict: 'workspace_id' });
  if (error) throw new Error(error.message);
}

/**
 * The URL the tenant must paste into their own Viva banking app.
 *
 * Viva has NO API to register merchant-level webhooks, so this is an unavoidable manual
 * step. The `workspace_id` query param is what lets our endpoint answer the GET
 * verification handshake with THIS merchant's key.
 */
export function vivaWebhookUrl(workspaceId: string): string {
  // Use the var the whole app resolves the project URL from — Vite injects
  // `process.env.SUPABASE_URL`. `import.meta.env.VITE_SUPABASE_URL` is NEVER populated
  // in this project (it silently left a `<your-project>` placeholder in the Stripe
  // panel's webhook URL until that was fixed).
  const base = ((process.env.SUPABASE_URL as string | undefined) || '').replace(/\/$/, '');
  const host = base || 'https://<your-project>.supabase.co';
  return `${host}/functions/v1/viva-webhooks?workspace_id=${workspaceId}`;
}
