/**
 * The trade portal, both sides (#441).
 *
 * The customer's side goes through the edge function and carries only a TOKEN — never a company
 * id, which would be a body-supplied identity. The operator's side reads and writes the account
 * through RLS as an ordinary member.
 */
import { supabase } from '@/integrations/supabase/client';

import type {
  PortalIdentity, Statement, PortalStock, PortalUserRow, PortalRole, StockVisibility,
} from '@/modules/crm/tradePortalRules';

export type {
  PortalRole, StockVisibility, StockBand, GateCode, ApprovalStatus,
  PortalIdentity, OpenItem, Statement, StockPoolBand, PortalStock, SpendGate, PortalUserRow,
} from '@/modules/crm/tradePortalRules';
export {
  ROLE_LABEL, VISIBILITY_LABEL, BAND_LABEL, APPROVAL_LABEL,
  canManageColleagues, mayBuy, isUncapped, gateBlocks, gateBecomesRequest, showsExactQuantity,
  bandsAreEnough, STATEMENT_IS_ONE_DERIVATION, PASSWORDLESS_IS_THE_POINT, DRAFT_UNTIL_WE_CONFIRM,
  statementBalance, type OpenBalance,
} from '@/modules/crm/tradePortalRules';

export interface HistoryLine {
  product_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  ordered_at: string | null;
}

export interface ApprovalRow {
  id: string;
  amount: number;
  limit_at_request: number | null;
  status: 'pending' | 'approved' | 'declined' | 'expired';
  created_at: string;
  requested_by: string;
  order_id: string | null;
}

export interface PortalAccount {
  id: string;
  company_id: string;
  is_enabled: boolean;
  stock_visibility: StockVisibility;
  approval_threshold: number | null;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('trade-portal', { body });
  if (error) throw error;
  return data as T;
}

export const tradePortalService = {
  /* ── The customer's side. The token is the only identity. ── */

  resolve: (token: string) => call<PortalIdentity>({ action: 'resolve', token }),

  statement: (token: string) => call<Statement>({ action: 'statement', token }),

  stock: (token: string, productId: string) =>
    call<PortalStock>({ action: 'stock', token, product_id: productId }),

  history: (token: string) =>
    call<{ ok: boolean; rows: HistoryLine[] }>({ action: 'history', token }),

  approvals: (token: string) =>
    call<{ ok: boolean; rows: ApprovalRow[] }>({ action: 'approvals', token }),

  placeOrder: (token: string, lines: Array<{
    product_id?: string | null; description?: string; quantity: number; unit_price?: number;
  }>, notes?: string) =>
    call<{ ok: boolean; order_id: string; needs_approval: boolean; code?: string; reason: string }>(
      { action: 'place_order', token, lines, notes },
    ),

  /** Their OWN administrator decides their colleagues' requests. Not us. */
  decide: (token: string, approvalId: string, decision: 'approved' | 'declined', reason?: string) =>
    call<{ ok: boolean; status: string }>({ action: 'decide', token, approval_id: approvalId, decision, reason }),

  /* ── The operator's side. ── */

  async account(workspaceId: string, companyId: string): Promise<PortalAccount | null> {
    const { data, error } = await supabase
      .from('trade_portal_accounts')
      .select('id, company_id, is_enabled, stock_visibility, approval_threshold')
      .eq('workspace_id', workspaceId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as PortalAccount | null;
  },

  async openAccount(workspaceId: string, companyId: string): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('trade_portal_accounts').insert({
      workspace_id: workspaceId, company_id: companyId, created_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  async setPolicy(accountId: string, patch: {
    stock_visibility?: StockVisibility; approval_threshold?: number | null; is_enabled?: boolean;
  }): Promise<void> {
    const { error } = await supabase.from('trade_portal_accounts')
      .update({ ...patch, updated_at: new Date().toISOString() }).eq('id', accountId);
    if (error) throw error;
  },

  async users(accountId: string): Promise<PortalUserRow[]> {
    const { data, error } = await supabase
      .from('trade_portal_users')
      .select('id, email, display_name, role, spend_limit_per_order, is_active')
      .eq('account_id', accountId)
      .order('email');
    if (error) throw error;
    return (data ?? []) as unknown as PortalUserRow[];
  },

  async addUser(input: {
    accountId: string; email: string; displayName?: string | null;
    role?: PortalRole; spendLimit?: number | null;
  }): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('trade_portal_users').insert({
      account_id: input.accountId,
      email: input.email,
      display_name: input.displayName ?? null,
      role: input.role ?? 'buyer',
      spend_limit_per_order: input.spendLimit ?? null,
      invited_by: auth?.user?.id ?? null,
    });
    if (error) throw error;
  },

  async setUserCap(portalUserId: string, role: PortalRole, spendLimit: number | null): Promise<void> {
    const { error } = await supabase.from('trade_portal_users')
      .update({ role, spend_limit_per_order: spendLimit, updated_at: new Date().toISOString() })
      .eq('id', portalUserId);
    if (error) throw error;
  },

  /** Minting is OUR act, so it needs a member — the link is what reaches the recipient. */
  mintLink: (portalUserId: string) =>
    call<{ ok: boolean; token: string; expires_at: string }>(
      { action: 'mint_link', portal_user_id: portalUserId },
    ),
};
