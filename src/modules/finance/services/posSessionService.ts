/**
 * Cloud vPOS shifts. Open/close a cashier session, record cash-drawer movements,
 * and pull the X (live) / Z (close-out) report. Issued receipts carry pos_session_id so the
 * Z report can total the shift per payment method + per VAT rate with cash reconciliation.
 */
import { supabase } from '@/integrations/supabase/client';

export interface PosSession {
  id: string;
  workspace_id: string;
  branch_code: number;
  opened_at: string;
  opening_float: number;
  status: 'open' | 'closed';
  z_number: number | null;
  closed_at: string | null;
}

export interface PosReport {
  session_id: string;
  status: string;
  z_number: number | null;
  opened_at: string;
  closed_at: string | null;
  opening_float: number;
  receipt_count: number;
  total_sales: number;
  by_payment: Record<string, number>;
  by_vat: { rate: number; net: number; vat: number }[];
  cash_in: number;
  cash_out: number;
  expected_cash: number;
  counted_cash: number | null;
  cash_variance: number | null;
}

export const posSessionService = {
  async getOpen(workspaceId: string, branchCode = 0): Promise<PosSession | null> {
    const { data, error } = await supabase
      .from('pos_sessions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('branch_code', branchCode)
      .eq('status', 'open')
      .maybeSingle();
    if (error) throw error;
    return (data as PosSession) ?? null;
  },

  async open(workspaceId: string, branchCode = 0, openingFloat = 0): Promise<string> {
    const { data, error } = await supabase.rpc('open_pos_session', {
      p_workspace_id: workspaceId, p_branch_code: branchCode, p_opening_float: openingFloat,
    });
    if (error) throw error;
    return data as string;
  },

  async recordCash(sessionId: string, workspaceId: string, direction: 'in' | 'out', amount: number, reason?: string): Promise<void> {
    const { error } = await supabase.from('pos_cash_movements').insert({
      session_id: sessionId, workspace_id: workspaceId, direction, amount, reason: reason ?? null,
    });
    if (error) throw error;
  },

  async report(sessionId: string): Promise<PosReport> {
    const { data, error } = await supabase.rpc('pos_session_report', { p_session_id: sessionId });
    if (error) throw error;
    return data as PosReport;
  },

  async close(sessionId: string, countedCash?: number): Promise<PosReport> {
    const { data, error } = await supabase.rpc('close_pos_session', {
      p_session_id: sessionId, p_counted_cash: countedCash ?? null,
    });
    if (error) throw error;
    return data as PosReport;
  },
};
