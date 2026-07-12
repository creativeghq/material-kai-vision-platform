/**
 * #196 — Supplier→Factory access requests. A supplier (business workspace) requests access to a
 * factory's catalog; the operator (root-workspace admin) approves/rejects. An approved request is
 * the grant — products from granted factories are read via get_accessible_factory_products (a
 * dedicated SECURITY DEFINER path, so core products RLS is untouched).
 */
import { supabase } from '@/integrations/supabase/client';

export type FactoryAccessStatus = 'pending' | 'approved' | 'rejected' | 'revoked';

export interface FactoryAccessRequest {
  id: string;
  requester_workspace_id: string;
  requester_user_id: string;
  factory_user_id: string;
  status: FactoryAccessStatus;
  message: string | null;
  rejection_reason: string | null;
  decided_at: string | null;
  created_at: string;
  // Hydrated client-side:
  requester_workspace_name?: string | null;
  factory_name?: string | null;
}

export interface FactoryOption {
  user_id: string;
  name: string;
}

async function hydrate(rows: FactoryAccessRequest[]): Promise<FactoryAccessRequest[]> {
  if (rows.length === 0) return rows;
  const wsIds = [...new Set(rows.map((r) => r.requester_workspace_id))];
  const facIds = [...new Set(rows.map((r) => r.factory_user_id))];
  const [{ data: ws }, { data: facs }] = await Promise.all([
    supabase.from('workspaces').select('id, name').in('id', wsIds),
    supabase.from('user_profiles').select('user_id, full_name, factory_claimed_name').in('user_id', facIds),
  ]);
  const wsName = new Map((ws ?? []).map((w: any) => [w.id, w.name]));
  const facName = new Map((facs ?? []).map((f: any) => [f.user_id, f.factory_claimed_name || f.full_name]));
  return rows.map((r) => ({
    ...r,
    requester_workspace_name: (wsName.get(r.requester_workspace_id) as string | undefined) ?? null,
    factory_name: (facName.get(r.factory_user_id) as string | undefined) ?? null,
  }));
}

export const factoryAccessService = {
  /** Operator review queue — RLS returns all rows to a root-workspace admin. */
  async listForReview(): Promise<FactoryAccessRequest[]> {
    const { data, error } = await supabase
      .from('factory_access_requests')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return hydrate((data ?? []) as FactoryAccessRequest[]);
  },

  async review(requestId: string, decision: 'approved' | 'rejected' | 'revoked', reason?: string): Promise<void> {
    const { error } = await supabase.rpc('review_factory_access_request', {
      p_request_id: requestId, p_decision: decision, p_reason: reason ?? null,
    });
    if (error) throw error;
  },

  /** A supplier's own requests, for the requesting workspace. */
  async listMine(workspaceId: string): Promise<FactoryAccessRequest[]> {
    const { data, error } = await supabase
      .from('factory_access_requests')
      .select('*')
      .eq('requester_workspace_id', workspaceId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return hydrate((data ?? []) as FactoryAccessRequest[]);
  },

  async requestAccess(workspaceId: string, factoryUserId: string, message?: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');
    const { error } = await supabase.from('factory_access_requests').insert({
      requester_workspace_id: workspaceId,
      requester_user_id: user.id,
      factory_user_id: factoryUserId,
      message: message?.trim() || null,
    });
    if (error) throw error;
  },

  /** Withdraw an own pending request. */
  async withdraw(requestId: string): Promise<void> {
    const { error } = await supabase
      .from('factory_access_requests')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    if (error) throw error;
  },

  /** Verified factories a supplier can request access to. */
  async listFactories(): Promise<FactoryOption[]> {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, factory_claimed_name')
      .eq('factory_verified', true)
      .eq('professional_type', 'supplier');
    if (error) throw error;
    return (data ?? []).map((f: any) => ({ user_id: f.user_id, name: f.factory_claimed_name || f.full_name || 'Brand' }));
  },

  /** Products from factories this workspace has been granted access to. */
  async accessibleProducts(workspaceId: string, limit = 100, offset = 0): Promise<any[]> {
    const { data, error } = await supabase.rpc('get_accessible_factory_products', {
      p_workspace_id: workspaceId, p_limit: limit, p_offset: offset,
    });
    if (error) throw error;
    return data ?? [];
  },
};
