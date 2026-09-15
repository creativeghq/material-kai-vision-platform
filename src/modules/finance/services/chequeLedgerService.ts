/**
 * The cheque sub-ledger: endorsement, discounting and the chain (#423).
 *
 * Every hand it passes through is a row, because the chain IS the record — a transfer that
 * overwrites its predecessor is a chain with one link.
 */
import { supabase } from '@/integrations/supabase/client';

import type { ChequePortfolio, ChequeAction } from '@/modules/finance/chequeRules';

export type {
  ChequeHolder, ChequeAction, ChequeRow, ChequePortfolio,
} from '@/modules/finance/chequeRules';
export {
  HOLDER_LABEL, ACTION_LABEL, chequeIsSpendable, allowedActions, chequeIsUndated, bounceUnwinds,
} from '@/modules/finance/chequeRules';

export interface ChequeEndorsement {
  id: string;
  cheque_id: string;
  sequence: number;
  action: ChequeAction;
  to_company_id: string | null;
  amount: number | null;
  fee: number | null;
  occurred_on: string;
  notes: string | null;
}

export const chequeLedgerService = {
  async portfolio(workspaceId: string): Promise<ChequePortfolio> {
    const { data, error } = await supabase.rpc('cheque_portfolio' as never, {
      p_workspace: workspaceId,
    } as never);
    if (error) throw error;
    return data as unknown as ChequePortfolio;
  },

  async chain(chequeId: string): Promise<ChequeEndorsement[]> {
    const { data, error } = await supabase
      .from('cheque_endorsements')
      .select('*')
      .eq('cheque_id', chequeId)
      .order('sequence');
    if (error) throw error;
    return (data ?? []) as ChequeEndorsement[];
  },

  /**
   * Move it to the next hand.
   *
   * One RPC, so the holder and the chain cannot disagree — and the server refuses a pledged
   * security rather than trusting the screen to have hidden it.
   */
  async move(input: {
    chequeId: string;
    action: ChequeAction;
    toCompanyId?: string | null;
    bankAccountId?: string | null;
    fee?: number | null;
    /** The supplier bill this endorsement settles. Without it the link is never recorded. */
    settlesBillId?: string | null;
    notes?: string | null;
  }) {
    const { data, error } = await supabase.rpc('endorse_cheque' as never, {
      p_cheque: input.chequeId,
      p_action: input.action,
      p_to_company: input.toCompanyId ?? null,
      p_bank_account: input.bankAccountId ?? null,
      p_fee: input.fee ?? null,
      p_settles_bill: input.settlesBillId ?? null,
      p_notes: input.notes ?? null,
    } as never);
    if (error) throw error;
    return data as unknown as { status: string; holder: string; reason: string };
  },

  /** Commit or release a security. A pledged cheque is out of every selection list. */
  async setPledged(chequeId: string, pledged: boolean, reason?: string) {
    const { error } = await supabase
      .from('cheques')
      .update({ is_pledged: pledged, pledged_reason: pledged ? (reason ?? null) : null })
      .eq('id', chequeId);
    if (error) throw error;
  },
};
