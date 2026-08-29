/**
 * Which finance settings the Settings screen may write.
 *
 * Kept in its own IMPORT-FREE module so a test can load it without a Supabase client — the guard
 * that makes this list load-bearing has to be able to read it.
 */
import type { FinanceSettings } from '@/modules/finance/services/financeService';

/**
 * Every setting this screen may write (#351 D2).
 *
 * This used to be an object literal spelled out inside `save()`, and the five DIGEST fields were
 * not in it — while the Digest panel had working controls for all five, wired to `onPatch`, behind
 * a "Save digest settings" button that calls this very function. So the toggle flipped, the save
 * reported success, and `setSettings(updated)` then overwrote local state with the server row, so
 * the toggle visibly flipped BACK.
 *
 * `finance-digest-aggregate` gates on exactly those fields, so the cron ran nightly and found
 * nothing. Measured before the fix: 3 workspaces, `digest_enabled` true on 0, recipients on 0,
 * `digest_last_sent_at` NULL on all. The feature had never sent once, and nothing ever errored —
 * the `ops.silent_zero` shape CLAUDE.md names.
 *
 * A hand-kept payload inside the function is what failed, so the list is named and OUTSIDE it, and
 * a guard test asserts every key this file edits appears here. A new control with no save is now a
 * red build rather than a switch that does nothing.
 */
export const EDITABLE_SETTING_KEYS = [
  'statements_enabled',
  'statement_email_subject',
  'statement_email_body',
  'default_payment_terms_days',
  'default_vat_rate',
  'default_markup_pct',
  'auto_statement_enabled',
  'auto_statement_frequency',
  'auto_statement_interval_days',
  'auto_statement_day_of_week',
  'auto_statement_day_of_month',
  'auto_statement_hour_utc',
  'auto_statement_only_outstanding',
  'auto_statement_min_balance',
  'auto_statement_side',
  'risk_block_inactive_vat',
  'risk_block_unvalidated_vat',
  'risk_warn_over_credit_limit',
  'risk_block_over_credit_limit',
  'min_order_value',
  'default_credit_limit',
  'risk_block_min_order',
  'risk_block_unpaid_invoice',
  'negative_margin_policy',
  'sales_can_see_cost',
  'trip_expense_reimbursement_mode',
  // The five that were missing. The Digest panel has edited them all along.
  'digest_enabled',
  'digest_frequency',
  'digest_day_of_week',
  'digest_hour_utc',
  'digest_recipients',
] as const satisfies ReadonlyArray<keyof FinanceSettings>;
