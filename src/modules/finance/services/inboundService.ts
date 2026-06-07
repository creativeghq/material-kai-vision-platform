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

  async dismiss(docId: string): Promise<void> {
    const { error } = await supabase.from('inbound_documents').update({ status: 'dismissed', updated_at: new Date().toISOString() }).eq('id', docId);
    if (error) throw error;
  },
};
