/**
 * Public-sector withholding (#446) — άρθρο 64 §2 ν.4172/2013.
 *
 * 4% on goods, 8% on services, above a €150 floor on the NET value, when the buyer is a φορέας
 * γενικής κυβέρνησης. Derived in SQL and carried as a LEG of `get_order_settlements`, so
 * `settled + withheld` equals what was invoiced — never as a second adjustment applied here.
 */
import { supabase } from '@/integrations/supabase/client';

export type { WithholdingStatus, WithholdingVerdict } from '@/modules/finance/withholdingRules';
export { withholdingNeedsDecision } from '@/modules/finance/withholdingRules';

export const withholdingService = {
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
