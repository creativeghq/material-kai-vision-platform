import { supabase } from '@/integrations/supabase/client';
import type { CommercePlatform, SyncOutcome } from '@/modules/commerce/commerceVocabulary';
import { WOO_UNSAFE_SECRET } from '@/modules/commerce/webhookSecret';

export interface StoreConnection {
  id: string;
  platform: CommercePlatform;
  name: string;
  store_url: string | null;
  enabled: boolean;
  api_version: string | null;
  has_credentials: boolean;
  has_webhook_secret: boolean;
  auto_issue_document: boolean;
  auto_send_document_back: boolean;
  auto_decrement_stock: boolean;
  auto_upsert_customer: boolean;
  default_warehouse_id: string | null;
  income_category_id: string | null;
  expense_category_id: string | null;
  default_doc_code_receipt: string;
  default_doc_code_invoice: string;
  vat_number_key: string | null;
  invoice_request_key: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreSyncLogRow {
  id: string;
  connection_id: string | null;
  platform: string | null;
  external_order_id: string | null;
  event_type: string | null;
  outcome: SyncOutcome;
  order_id: string | null;
  invoice_id: string | null;
  message: string | null;
  created_at: string;
}

export interface ConnectionPolicyPatch {
  name?: string;
  store_url?: string | null;
  enabled?: boolean;
  api_version?: string | null;
  auto_issue_document?: boolean;
  auto_send_document_back?: boolean;
  auto_decrement_stock?: boolean;
  auto_upsert_customer?: boolean;
  default_warehouse_id?: string | null;
  income_category_id?: string | null;
  expense_category_id?: string | null;
  default_doc_code_receipt?: string;
  default_doc_code_invoice?: string;
  vat_number_key?: string | null;
  invoice_request_key?: string | null;
}

export function webhookUrl(connectionId: string): string {
  const base = (import.meta.env?.VITE_SUPABASE_URL as string | undefined) ?? '';
  return `${base.replace(/\/$/, '')}/functions/v1/store-orders-webhook?connection=${encodeURIComponent(connectionId)}`;
}

export const storeConnectionsService = {
  async list(workspaceId: string): Promise<StoreConnection[]> {
    const { data, error } = await supabase.rpc('list_store_connections', { p_workspace_id: workspaceId });
    if (error) throw error;
    return (data ?? []) as StoreConnection[];
  },

  async create(workspaceId: string, input: {
    platform: CommercePlatform;
    name: string;
    store_url?: string | null;
    credentials?: Record<string, string>;
    webhook_secret?: string | null;
  }): Promise<void> {
    if (input.webhook_secret && WOO_UNSAFE_SECRET.test(input.webhook_secret)) {
      throw new Error('A webhook secret cannot contain & \' " < or >. WooCommerce decodes those before signing, so every delivery would fail its signature check.');
    }
    const { error } = await supabase.from('store_connections').insert({
      workspace_id: workspaceId,
      platform: input.platform,
      name: input.name,
      store_url: input.store_url ?? null,
      credentials: input.credentials ?? {},
      webhook_secret: input.webhook_secret ?? null,
    });
    if (error) throw error;
  },

  async updatePolicy(id: string, patch: ConnectionPolicyPatch): Promise<void> {
    const { error } = await supabase.from('store_connections').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
  },

  async setCredentials(id: string, credentials: Record<string, string>, webhookSecret?: string | null): Promise<void> {
    if (webhookSecret && WOO_UNSAFE_SECRET.test(webhookSecret)) {
      throw new Error('A webhook secret cannot contain & \' " < or >. WooCommerce decodes those before signing, so every delivery would fail its signature check.');
    }
    const patch: Record<string, unknown> = { credentials, updated_at: new Date().toISOString() };
    if (webhookSecret !== undefined) patch.webhook_secret = webhookSecret;
    const { error } = await supabase.from('store_connections').update(patch).eq('id', id);
    if (error) throw error;
  },

  async remove(id: string): Promise<void> {
    const { error } = await supabase.from('store_connections').delete().eq('id', id);
    if (error) throw error;
  },

  async syncLog(workspaceId: string, limit = 50): Promise<StoreSyncLogRow[]> {
    const { data, error } = await supabase
      .from('store_order_sync_log')
      .select('id, connection_id, platform, external_order_id, event_type, outcome, order_id, invoice_id, message, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as StoreSyncLogRow[];
  },
};
