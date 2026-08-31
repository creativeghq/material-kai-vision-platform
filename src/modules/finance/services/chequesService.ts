/** Cheques — post-dated cheques in (from customers) / out (to suppliers). */
import { supabase } from '@/integrations/supabase/client';

/** The parent a cheque settles, embedded so its job can be derived on read. */
type ChequeJobBearer = { project_id: string | null; projects?: { name: string | null } | { name: string | null }[] | null } | null;

export interface Cheque {
  id: string;
  workspace_id: string;
  direction: 'in' | 'out';
  cheque_number: string | null;
  bank: string | null;
  amount: number;
  currency: string;
  due_date: string | null;
  status: 'pending' | 'cleared' | 'bounced' | 'cancelled';
  counterparty_company_id: string | null;
  counterparty_contact_id: string | null;
  invoice_id: string | null;
  supplier_bill_id: string | null;
  bank_account_id: string | null;
  payment_id: string | null;
  notes: string | null;
  created_at: string;
  /** Embedded parents — read-only, for `chequeJob`. Never written. */
  invoices?: ChequeJobBearer | ChequeJobBearer[];
  supplier_bills?: ChequeJobBearer | ChequeJobBearer[];
}

export const chequesService = {
  async list(workspaceId: string): Promise<Cheque[]> {
    const { data, error } = await supabase
      .from('cheques')
      // The job is DERIVED from the document this cheque settles (#378 L5) — `cheques` carries no
      // `project_id` and must not, because that would be a second copy of what the parent holds.
      // `chequeJob` picks the parent by DIRECTION; see documentJob.ts for why that is not a
      // precedence.
      .select('*, invoices(project_id, projects(name)), supplier_bills(project_id, projects(name))')
      .eq('workspace_id', workspaceId)
      .order('due_date', { ascending: true, nullsFirst: false });
    if (error) throw error;
    return (data ?? []) as Cheque[];
  },

  async create(workspaceId: string, input: {
    direction: 'in' | 'out'; chequeNumber?: string; bank?: string; amount: number;
    currency?: string; dueDate?: string; notes?: string;
    /** Optional counterparty + settlement target, so clearing settles the right document. */
    counterpartyCompanyId?: string | null;
    counterpartyContactId?: string | null;
    invoiceId?: string | null;
    supplierBillId?: string | null;
    bankAccountId?: string | null;
  }): Promise<string> {
    const { data, error } = await supabase.from('cheques').insert({
      workspace_id: workspaceId,
      direction: input.direction,
      cheque_number: input.chequeNumber || null,
      bank: input.bank || null,
      amount: input.amount,
      currency: input.currency || 'EUR',
      due_date: input.dueDate || null,
      notes: input.notes || null,
      counterparty_company_id: input.counterpartyCompanyId || null,
      counterparty_contact_id: input.counterpartyContactId || null,
      invoice_id: input.invoiceId || null,
      supplier_bill_id: input.supplierBillId || null,
      bank_account_id: input.bankAccountId || null,
    } as any).select('id').single();
    if (error) throw error;
    return (data as any).id;
  },

  /**
   * Set a cheque's status via the RPC — clearing it books a `cheque` payment (settling the linked
   * invoice/bill, or moving cash on-account when unlinked); reverting a cleared cheque deletes that
   * payment so cash + the settled document unwind. Never a bare column flip.
   */
  async setStatus(id: string, status: Cheque['status']): Promise<void> {
    const { error } = await supabase.rpc('set_cheque_status', { p_cheque_id: id, p_status: status });
    if (error) throw error;
  },
};
