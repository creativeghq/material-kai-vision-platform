/**
 * #206 — received (inbound) myDATA documents: the expenses Inbox. The live pull is
 * wired in the finance-inbound-sync poller (activates with per-tenant AADE creds); this
 * client reads what's been pulled and turns a doc into a supplier bill / warehouse intake.
 */
import { supabase } from '@/integrations/supabase/client';

export interface InboundDocument {
  id: string;
  workspace_id: string;
  mark: string;
  issuer_vat: string | null;
  issuer_name: string | null;
  issue_date: string | null;
  doc_type: string | null;
  currency: string;
  total_net: number | null;
  total_vat: number | null;
  total_gross: number | null;
  status: 'new' | 'classified' | 'received' | 'dismissed';
  created_supplier_bill_id: string | null;
  created_at: string;
}

export const inboundService = {
  async list(workspaceId: string): Promise<InboundDocument[]> {
    const { data, error } = await supabase
      .from('inbound_documents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as InboundDocument[];
  },

  async toSupplierBill(docId: string): Promise<string> {
    const { data, error } = await supabase.rpc('inbound_doc_to_supplier_bill', { p_doc_id: docId });
    if (error) throw error;
    return data as string;
  },

  /** Manually trigger the myDATA RequestDocs pull (finance-manager). */
  async syncNow(): Promise<any> {
    const { data, error } = await supabase.functions.invoke('finance-inbound-sync', { body: {} });
    if (error) throw error;
    return data;
  },

  async dismiss(docId: string): Promise<void> {
    const { error } = await supabase.from('inbound_documents').update({ status: 'dismissed', updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) throw error;
  },

  /** Per-workspace myDATA received-docs credentials (manager-only; not exposed to accountants). */
  async getCreds(workspaceId: string): Promise<{ aade_user_id: string | null; subscription_key: string | null; base_url: string | null; enabled: boolean } | null> {
    const { data } = await supabase
      .from('workspace_inbound_credentials')
      .select('aade_user_id, subscription_key, base_url, enabled')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    return (data as any) ?? null;
  },

  async saveCreds(workspaceId: string, input: { aadeUserId: string; subscriptionKey: string; baseUrl?: string; enabled: boolean }): Promise<void> {
    const { error } = await supabase.from('workspace_inbound_credentials').upsert({
      workspace_id: workspaceId,
      aade_user_id: input.aadeUserId || null,
      subscription_key: input.subscriptionKey || null,
      base_url: input.baseUrl || null,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id' });
    if (error) throw error;
  },
};
