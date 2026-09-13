/**
 * Public-sector withholding (#446) — άρθρο 64 §2 ν.4172/2013.
 *
 * 4% on goods, 8% on services, above a €150 floor on the NET value, when the buyer is a φορέας
 * γενικής κυβέρνησης. Derived in SQL and carried as a LEG of `get_order_settlements`, so
 * `settled + withheld` equals what was invoiced — never as a second adjustment applied here.
 */
import { supabase } from '@/integrations/supabase/client';

export type WithholdingStatus = 'withheld' | 'not_withheld' | 'below_floor' | 'unclassified';

export interface WithholdingVerdict {
  status: WithholdingStatus;
  /** NULL when the rule cannot be applied — never 0, which would read as "nothing is withheld". */
  amount: number | null;
  reason: string;
  net?: number;
  rate?: number;
  floor?: number;
  supply_kind?: 'goods' | 'services' | 'mixed' | 'unknown' | null;
  legal_basis?: string;
}

export const withholdingService = {
  /** What άρθρο 64 produces for this invoice. */
  async forInvoice(invoiceId: string): Promise<WithholdingVerdict> {
    const { data, error } = await supabase.rpc('invoice_withholding' as never, {
      p_invoice: invoiceId,
    } as never);
    if (error) throw error;
    return data as unknown as WithholdingVerdict;
  },

  /**
   * Record the derived figure on the document.
   *
   * Written to `invoices.total_withheld_amount`, which is what reaches AADE — so the settlement
   * ledger and the transmitted document read the same number by construction.
   */
  async apply(invoiceId: string, amount: number): Promise<void> {
    const { error } = await supabase
      .from('invoices')
      .update({ total_withheld_amount: amount })
      .eq('id', invoiceId);
    if (error) throw error;
  },

  /** The άρθρο 64 table, for the settings screen. */
  async rates() {
    const { data, error } = await supabase
      .from('withholding_tax_rates')
      .select('*')
      .order('supply_kind');
    if (error) throw error;
    return data ?? [];
  },
};

/**
 * Does this verdict need a human before the document can be issued?
 *
 * Only `unclassified` does. `below_floor` and `not_withheld` are answers — the rule ran and said
 * nothing is withheld. `unclassified` is the absence of an answer, and treating it as zero is how
 * a €400 receivable goes missing.
 */
export function withholdingNeedsDecision(v: WithholdingVerdict | null): boolean {
  return v?.status === 'unclassified';
}
