/**
 * The AADE myDATA aggregate book (Συνοπτικό Βιβλίο) — a READ-ONLY MIRROR.
 *
 * Everything this service returns comes from AADE and from nowhere else. It is not
 * merged with, reconciled against, or written back into any platform finance table:
 * the point is to have an independent second opinion to hold our own numbers up to.
 * The moment it is folded into `invoices` / `supplier_bills` / `inbound_documents`
 * it stops being able to disagree with them, which is the only thing it is for.
 *
 * Collected by the `finance-mydata-book` edge function. See that file for why the
 * book feed alone is not the whole book.
 */
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

/**
 * Why a figure is or is not there. SQL decides this, never the client — a tile and a
 * report reading the same RPC then cannot disagree about whether a number is real.
 *
 *   ok                AADE answered and there were figures
 *   no_data           AADE answered and that month was genuinely empty
 *   collector_failed  the last refresh could not reach AADE — UNKNOWN, not zero
 *   not_collected     nobody has ever asked AADE about this month
 *   not_connected     this workspace has no ΑΑΔΕ credentials configured
 */
export type BookStatus = 'ok' | 'no_data' | 'collector_failed' | 'not_collected' | 'not_connected';

/** True only for the two statuses that carry real figures. Anything else must render
 *  its reason instead of its numbers — an unrecognised status fails closed to "unknown". */
export const hasFigures = (status: BookStatus | string): boolean => status === 'ok' || status === 'no_data';

export interface BookMonthRow {
  month: string;
  direction: 'income' | 'expense';
  net_value: number | null;
  vat_amount: number | null;
  withheld_amount: number | null;
  other_taxes_amount: number | null;
  stamp_duty_amount: number | null;
  fees_amount: number | null;
  deductions_amount: number | null;
  third_party_amount: number | null;
  gross_value: number | null;
  doc_count: number | null;
  status: BookStatus;
  fetched_at: string | null;
  /** Υπόλοιπο Εσ-Εξ — income net less expense net, on the income row only, and only
   *  when both directions are actually known. Derived in SQL. */
  balance: number | null;
}

export interface BookSyncState {
  last_attempt_at: string | null;
  last_success_at: string | null;
  covered_from: string | null;
  covered_to: string | null;
  last_status: 'not_collected' | 'ok' | 'collector_failed' | 'not_connected';
  source_errors: Record<string, unknown> | null;
  /** AADE's own retry-after, in seconds, when the last attempt was rate-limited. */
  retry_after_s: number | null;
  updated_at: string | null;
}

export const mydataBookService = {
  /** AADE's book for a date range, one row per month per direction. */
  async getBook(workspaceId: string, from: string, to: string): Promise<BookMonthRow[]> {
    const { data, error } = await supabase.rpc('get_mydata_book_aggregate', {
      p_workspace_id: workspaceId, p_from: from, p_to: to,
    });
    if (error) throw error;
    return (data ?? []) as BookMonthRow[];
  },

  /**
   * When the mirror was last confirmed against AADE, and what happened last time.
   *
   * Read separately from the figures on purpose: a failed refresh leaves the last good
   * numbers in place, so the screen shows real figures AND says they are stale. Without
   * this the two are indistinguishable.
   */
  async getSyncState(workspaceId: string): Promise<BookSyncState | null> {
    const { data, error } = await supabase
      .from('mydata_book_sync_state')
      .select('last_attempt_at, last_success_at, covered_from, covered_to, last_status, source_errors, retry_after_s, updated_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (error) throw error;
    return (data as BookSyncState | null) ?? null;
  },

  /** Pull the window again from AADE. Returns the per-workspace outcome, including a
   *  `retry_after_s` when AADE rate-limited us — which it does readily. */
  async refresh(range: { dateFrom: string; dateTo: string }): Promise<{
    ok: boolean;
    skipped?: string;
    workspaces?: { workspaceId: string; error?: string; retry_after_s?: number | null; unknown_subtypes?: string[] }[];
  }> {
    const { data, error } = await supabase.functions.invoke('finance-mydata-book', {
      body: { date_from: range.dateFrom, date_to: range.dateTo },
    });
    if (error) throw await edgeError(error);
    return data;
  },
};
