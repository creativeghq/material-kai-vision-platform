import { supabase } from '@/integrations/supabase/client';

/**
 * Shared workspace credits — the pooled wallet an owner funds and members draw from,
 * with optional per-member monthly caps. Backed by the workspace_credits* tables and the
 * debit_workspace_credits / get_workspace_member_credit_status / set_workspace_member_credit_limit RPCs.
 */

export interface WorkspaceCreditStatus {
  has_pool: boolean;
  pool_balance: number;
  monthly_limit: number | null;
  spent_this_month: number;
  remaining_allowance: number | null;
}

export interface WorkspaceMemberCredit {
  user_id: string;
  role: string;
  name: string | null;
  email: string | null;
  monthly_limit: number | null;
  spent_this_month: number;
}

export interface WorkspaceCreditTransaction {
  id: string;
  actor_user_id: string | null;
  amount: number;
  balance_after: number;
  transaction_type: string;
  operation_type: string | null;
  description: string | null;
  created_at: string;
}

const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};

export const workspaceCreditsService = {
  /** Pool balance + the caller's own allowance status for a workspace. */
  async getStatus(workspaceId: string): Promise<WorkspaceCreditStatus> {
    const { data, error } = await supabase.rpc('get_workspace_member_credit_status', {
      p_workspace_id: workspaceId,
    });
    if (error) throw error;
    return data as WorkspaceCreditStatus;
  },

  /** Recent pool ledger rows (RLS: admins see all, members see their own + top-ups). */
  async getTransactions(workspaceId: string, limit = 30): Promise<WorkspaceCreditTransaction[]> {
    const { data, error } = await supabase
      .from('workspace_credit_transactions')
      .select('id, actor_user_id, amount, balance_after, transaction_type, operation_type, description, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as WorkspaceCreditTransaction[];
  },

  /**
   * Per-member view for the owner: role, profile, monthly cap, and month-to-date spend.
   * Joined in JS (workspace_members has no FK to user_profiles for PostgREST embedding).
   */
  async getMemberUsage(workspaceId: string): Promise<WorkspaceMemberCredit[]> {
    const [{ data: members, error: mErr }, { data: limits }, { data: txns }] = await Promise.all([
      supabase.from('workspace_members').select('user_id, role').eq('workspace_id', workspaceId),
      supabase.from('workspace_member_credit_limits').select('user_id, monthly_limit').eq('workspace_id', workspaceId),
      supabase
        .from('workspace_credit_transactions')
        .select('actor_user_id, amount')
        .eq('workspace_id', workspaceId)
        .lt('amount', 0)
        .gte('created_at', monthStart()),
    ]);
    if (mErr) throw mErr;

    const ids = (members ?? []).map((m) => m.user_id).filter(Boolean);
    let profiles: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase
        .from('user_profiles')
        .select('user_id, full_name, email')
        .in('user_id', ids);
      profiles = Object.fromEntries((profs ?? []).map((p) => [p.user_id, { full_name: p.full_name, email: p.email }]));
    }
    const limitByUser = Object.fromEntries((limits ?? []).map((l) => [l.user_id, l.monthly_limit]));
    const spentByUser: Record<string, number> = {};
    for (const t of txns ?? []) {
      if (!t.actor_user_id) continue;
      spentByUser[t.actor_user_id] = (spentByUser[t.actor_user_id] ?? 0) + -Number(t.amount);
    }

    return (members ?? []).map((m) => ({
      user_id: m.user_id,
      role: m.role,
      name: profiles[m.user_id]?.full_name ?? null,
      email: profiles[m.user_id]?.email ?? null,
      monthly_limit: (limitByUser[m.user_id] as number | null) ?? null,
      spent_this_month: spentByUser[m.user_id] ?? 0,
    }));
  },

  /** Owner/admin sets (or clears with null) a member's monthly cap. */
  async setMemberLimit(workspaceId: string, userId: string, monthlyLimit: number | null): Promise<void> {
    const { data, error } = await supabase.rpc('set_workspace_member_credit_limit', {
      p_workspace_id: workspaceId,
      p_user_id: userId,
      p_monthly_limit: monthlyLimit,
    });
    if (error) throw error;
    const res = data as { success?: boolean; error?: string };
    if (!res?.success) throw new Error(res?.error ?? 'Failed to set limit');
  },
};
