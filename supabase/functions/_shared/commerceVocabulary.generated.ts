// GENERATED MIRROR of src/modules/commerce/commerceVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

export const COMMERCE_PLATFORMS = ['skroutz', 'shopify', 'woocommerce', 'generic'] as const;
export type CommercePlatform = (typeof COMMERCE_PLATFORMS)[number];

export const SYNC_OUTCOMES = ['created', 'updated', 'skipped_dupe', 'needs_review', 'error'] as const;
export type SyncOutcome = (typeof SYNC_OUTCOMES)[number];

export const DOCUMENT_REQUESTS = ['receipt', 'invoice', 'invoice_39a', 'invoice_vies'] as const;
export type DocumentRequest = (typeof DOCUMENT_REQUESTS)[number];

export function isCommercePlatform(v: unknown): v is CommercePlatform {
  return typeof v === 'string' && (COMMERCE_PLATFORMS as readonly string[]).includes(v);
}

export function isDocumentRequest(v: unknown): v is DocumentRequest {
  return typeof v === 'string' && (DOCUMENT_REQUESTS as readonly string[]).includes(v);
}
