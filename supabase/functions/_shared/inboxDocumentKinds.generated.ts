// GENERATED MIRROR of src/modules/messaging/inboxDocumentKinds.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/** What kind of business document an inbox attachment is — written ONCE. */

export const INBOX_DOCUMENT_KINDS = [
  'invoice',
  'receipt',
  'credit_note',
  'delivery_note',
  'quote',
  'order_confirmation',
  'purchase_order',
  'contract',
  'statement',
  'price_list',
  'specification',
  'drawing',
  'photo',
  'other',
  'unknown',
] as const;

export type InboxDocumentKind = (typeof INBOX_DOCUMENT_KINDS)[number];

export const INBOX_DOCUMENT_KIND_LABELS: Record<InboxDocumentKind, string> = {
  invoice: 'Invoice',
  receipt: 'Receipt',
  credit_note: 'Credit note',
  delivery_note: 'Delivery note',
  quote: 'Quote',
  order_confirmation: 'Order confirmation',
  purchase_order: 'Purchase order',
  contract: 'Contract',
  statement: 'Statement',
  price_list: 'Price list',
  specification: 'Specification',
  drawing: 'Drawing',
  photo: 'Photo',
  other: 'Document',
  unknown: 'Unrecognised document',
};

/**
 * The kinds that are a COST to the business when they arrive from a supplier: these get the
 * "Add as expense" link. A quote or a price list is information, not a liability, and offering
 * to book it as an expense is how a duplicate cost gets made.
 */
export const INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE: readonly InboxDocumentKind[] = [
  'invoice',
  'receipt',
  'credit_note',
];

/**
 * Below this the tag says so — a 0.4 "invoice" is a guess and reads as a fact otherwise. Same
 * cut the classifier is told to explain itself under.
 */
export const INBOX_DOCUMENT_KIND_LOW_CONFIDENCE = 0.6;

/** Every attachment envelope status the enrichment can leave on the row. */
export const INBOX_ATTACHMENT_ENRICHMENT_STATUSES = ['ok', 'failed', 'skipped'] as const;
export type InboxAttachmentEnrichmentStatus = (typeof INBOX_ATTACHMENT_ENRICHMENT_STATUSES)[number];
