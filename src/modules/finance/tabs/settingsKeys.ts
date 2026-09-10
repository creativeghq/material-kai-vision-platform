/**
 * Which finance settings the Settings screen may write.
 *
 * Kept in its own IMPORT-FREE module so a test can load it without a Supabase client — the guard
 * that makes this list load-bearing has to be able to read it.
 */
import type { FinanceSettings } from '@/modules/finance/services/financeService';

/** Every setting this screen may write (#351 D2). */
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
