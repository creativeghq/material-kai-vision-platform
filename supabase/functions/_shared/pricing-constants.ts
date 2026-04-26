/**
 * Platform Pricing Constants — single source of truth for edge functions.
 *
 * Mirrors:
 * - mivaa-pdf-extractor/app/config/ai_pricing.py → AIPricingConfig.MARKUP_MULTIPLIER
 * - src/components/Admin/OperationsDashboard/constants.ts → MARKUP_MULTIPLIER
 *
 * Any change here MUST be reflected in the two files above.
 */

// Platform markup applied on top of raw provider cost before billing the user.
// Users are billed (raw_cost × MARKUP_MULTIPLIER) → converted to credits at $0.01/credit.
export const MARKUP_MULTIPLIER = 1.50;

// 1 platform credit = $0.01 USD. Multiply USD by this to get credits.
export const CREDITS_PER_USD = 100;
