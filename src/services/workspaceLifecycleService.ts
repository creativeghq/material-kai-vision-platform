import { supabase } from '@/integrations/supabase/client';

/**
 * Account lifecycle (#333). The platform never deletes — an account is *disabled*.
 *
 * Disabling is not reversible in the way people expect, which is why the UI says so plainly:
 * the customers move to the operator immediately, and re-enabling does not bring them back.
 * Everything else is preserved — the fiscal documents in particular stay with the account,
 * readable, because its people still need them.
 */

export interface DisableResult {
  ok: boolean;
  already_disabled?: boolean;
  workspace_id?: string;
  rehomed_to?: string;
  companies_rehomed?: number;
  contacts_rehomed?: number;
}

export const workspaceLifecycleService = {
  /** Owner of the workspace, or the platform operator. Never the operator's own workspace. */
  async disable(workspaceId: string, reason?: string): Promise<DisableResult> {
    const { data, error } = await supabase.rpc('disable_workspace', {
      p_workspace_id: workspaceId,
      p_reason: reason ?? null,
    });
    if (error) throw new Error(error.message);
    return data as DisableResult;
  },

  /** Operator only. Does NOT return the re-homed customers — see the RPC comment. */
  async enable(workspaceId: string): Promise<{ ok: boolean; note?: string }> {
    const { data, error } = await supabase.rpc('enable_workspace', { p_workspace_id: workspaceId });
    if (error) throw new Error(error.message);
    return data as { ok: boolean; note?: string };
  },

  async status(workspaceId: string): Promise<{
    status: string; disabled_at: string | null; disabled_reason: string | null;
  } | null> {
    const { data } = await supabase
      .from('workspaces')
      .select('status, disabled_at, disabled_reason')
      .eq('id', workspaceId)
      .maybeSingle();
    return (data as { status: string; disabled_at: string | null; disabled_reason: string | null }) ?? null;
  },
};
