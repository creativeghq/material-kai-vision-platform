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

/**
 * What a credit actually SELLS for, in USD.
 *
 * Not the same number as 1/CREDITS_PER_USD, and the gap is the whole business: credits are
 * *accounted* at $0.01 and *sold* at $0.085–$0.0999 depending on pack size, so `raw x 1.5`
 * converted at $0.01 bills the tenant an effective 12.75x raw cost.
 *
 * That is correct for our own compute and indefensible for telecom resale — a WhatsApp template
 * costing Meta $0.06 would bill $0.77 against a rate card anyone can look up. `billing_mode =
 * passthrough` divides by THIS instead, so the tenant pays roughly cost x 1.5 in real money.
 *
 * Deliberately the cheapest pack (Premium, 1000 for $84.99). Using the average would under-price
 * every passthrough call made by a Starter-pack tenant; using the floor means the margin is the
 * floor too, and every other buyer pays more.
 */
export const CREDIT_SALE_PRICE_USD = 0.085;
