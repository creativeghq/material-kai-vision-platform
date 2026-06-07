/**
 * #177 — master requests: a child workspace submits a procurement quote to its parent
 * node; the parent prices it or escalates upward. All writes go through SECURITY DEFINER
 * RPCs (the table is RLS write-locked); reads are visible to requester + target members.
 */
import { supabase } from '@/integrations/supabase/client';

export interface MasterRequest {
  id: string;
  quote_id: string;
  requester_workspace_id: string;
  parent_workspace_id: string;
  status: 'new' | 'in_review' | 'priced' | 'escalated' | 'cancelled';
  note: string | null;
  amount: number | null;
  currency: string | null;
  priced_at: string | null;
  escalated_from: string | null;
  created_at: string;
  requester?: { name: string | null } | null;
  quote?: { name: string | null; quote_number: string | null } | null;
}

export const masterRequestsService = {
  /** Child action — route an accepted/draft procurement quote to the parent node. */
  async submit(quoteId: string): Promise<string> {
    const { data, error } = await supabase.rpc('submit_procurement_request', { p_quote_id: quoteId });
    if (error) throw error;
    return data as string;
  },

  /** Parent inbox — requests targeting this workspace. */
  async listInbox(parentWorkspaceId: string): Promise<MasterRequest[]> {
    const { data, error } = await supabase
      .from('master_requests')
      .select('*, requester:workspaces!master_requests_requester_workspace_id_fkey(name), quote:quotes(name, quote_number)')
      .eq('parent_workspace_id', parentWorkspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as any;
  },

  /** Requester view — requests this workspace has sent upward. */
  async listMine(requesterWorkspaceId: string): Promise<MasterRequest[]> {
    const { data, error } = await supabase
      .from('master_requests')
      .select('*, quote:quotes(name, quote_number)')
      .eq('requester_workspace_id', requesterWorkspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as any;
  },

  async returnPriced(id: string, note?: string): Promise<void> {
    const { error } = await supabase.rpc('return_priced_request', { p_request_id: id, p_note: note ?? null });
    if (error) throw error;
  },

  async escalate(id: string): Promise<string> {
    const { data, error } = await supabase.rpc('escalate_request', { p_request_id: id });
    if (error) throw error;
    return data as string;
  },
};
