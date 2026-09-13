/**
 * Sample loans (#427).
 *
 * Logged against the CUSTOMER'S RECORD, not a loose notebook — which is the difference between a
 * warm lead and missing inventory.
 */
import { supabase } from '@/integrations/supabase/client';

import type { SampleLoanRow, LoanPosition, LoanStatus } from '@/modules/crm/sampleLoanRules';

export type { LoanStatus, SampleLoanRow, LoanPosition } from '@/modules/crm/sampleLoanRules';
export {
  LOAN_STATUS_LABEL, loanIsUnchaseable, loanIsOverdue, loanIsSettled, describeLoan,
} from '@/modules/crm/sampleLoanRules';

export interface SampleLoanItem {
  id: string;
  loan_id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  returned_quantity: number | null;
}

export const sampleLoanService = {
  async list(workspaceId: string, companyId?: string | null): Promise<SampleLoanRow[]> {
    let q = supabase
      .from('sample_loans')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('loaned_on', { ascending: false });
    if (companyId) q = q.eq('company_id', companyId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as SampleLoanRow[];
  },

  async itemsFor(loanId: string): Promise<SampleLoanItem[]> {
    const { data, error } = await supabase
      .from('sample_loan_items')
      .select('*')
      .eq('loan_id', loanId)
      .order('created_at');
    if (error) throw error;
    return (data ?? []) as SampleLoanItem[];
  },

  /** Who took them, what they took, when they are due back. */
  async lend(input: {
    workspaceId: string;
    companyId?: string | null;
    contactId?: string | null;
    borrowerName?: string | null;
    dueBackOn?: string | null;
    items: { description: string; quantity?: number; product_id?: string | null }[];
    notes?: string | null;
  }) {
    const { data: auth } = await supabase.auth.getUser();
    const { data: loan, error } = await supabase.from('sample_loans').insert({
      workspace_id: input.workspaceId,
      company_id: input.companyId ?? null,
      contact_id: input.contactId ?? null,
      borrower_name: input.borrowerName ?? null,
      due_back_on: input.dueBackOn ?? null,
      notes: input.notes ?? null,
      created_by: auth?.user?.id ?? null,
    }).select('*').single();
    if (error) throw error;

    if (input.items.length > 0) {
      const { error: iErr } = await supabase.from('sample_loan_items').insert(
        input.items.map((i) => ({
          loan_id: (loan as SampleLoanRow).id,
          workspace_id: input.workspaceId,
          product_id: i.product_id ?? null,
          description: i.description,
          quantity: i.quantity ?? 1,
        })),
      );
      if (iErr) throw iErr;
    }
    return loan as SampleLoanRow;
  },

  /**
   * Close a loan.
   *
   * `converted` needs the order it became, and `returned` needs the date — both enforced by a
   * CHECK, because "it came back" with no date is the state a sample disappears in.
   */
  async close(loanId: string, status: LoanStatus, extra?: { returnedOn?: string; orderId?: string }) {
    const { error } = await supabase.from('sample_loans').update({
      status,
      returned_on: status === 'returned' ? (extra?.returnedOn ?? new Date().toISOString().slice(0, 10)) : null,
      converted_order_id: status === 'converted' ? (extra?.orderId ?? null) : null,
    }).eq('id', loanId);
    if (error) throw error;
  },

  /** Where the showroom stands, including the loans nobody can chase. */
  async position(workspaceId: string): Promise<LoanPosition> {
    const { data, error } = await supabase.rpc('sample_loan_position' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as LoanPosition;
  },
};
