// GENERATED MIRROR of src/services/fiscal/fiscalVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The fiscal-connector value-set, written ONCE (#391).
 *
 * `FiscalCapability` was the same six-line union in `fiscalConnectorService` and
 * `_shared/fiscal/types.ts` — one fact on both sides of the Vite/Deno boundary.
 *
 * THE DATABASE IS THE ENFORCER
 * -----------------------------
 * `workspace_fiscal_bindings_capability_check`. Pinned to the constraint text by
 * `tests/unit/paymentVocabulary.test.ts`.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — byte-mirrored to the edge by
 * `npm run vocab:mirror`.
 */

/**
 * `workspace_fiscal_bindings_capability_check`.
 *
 * A workspace binds each capability to a connector INDEPENDENTLY, which is the whole
 * reason this is a set rather than a single `fiscal_connector_slug` column: a tenant can
 * transmit legal invoices through Novus while numbering them locally. That also means the
 * order here carries no precedence — a binding is per capability, and there is no winner.
 *
 * Contrast `PAYMENT_PROVIDER_SLUGS`, which is multi-select for a different reason: fiscal
 * picks ONE connector per capability, payments offer several methods at once and let the
 * customer choose.
 */
export const FISCAL_CAPABILITIES = [
  'legal_invoice',
  'pre_invoice_notice',
  'pdf_render',
  'tax_submission',
  'numbering',
  'payment_reconciliation',
] as const;
export type FiscalCapability = (typeof FISCAL_CAPABILITIES)[number];

export function isFiscalCapability(v: unknown): v is FiscalCapability {
  return typeof v === 'string' && (FISCAL_CAPABILITIES as readonly string[]).includes(v);
}
