// GENERATED MIRROR of src/modules/messaging/inboxCardKinds.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * What a catalog card in an Inbox message can be — written ONCE.
 *
 * A member picks a product or a service from the workspace catalog and the card goes to the
 * customer in the channel's own rich shape (a WhatsApp interactive card, a table in an email, a
 * card in the thread). The CLIENT needs these to build a pick and render the card; the EDGE
 * validates the pick against the same list, prices it, and labels the card's button from it.
 * Two runtimes, one declaration — mirrored by `npm run vocab:mirror`
 * (tests/unit/vocabularyMirrors.test.ts holds the copy to this source).
 *
 * Only the closed value-sets live here. The composer's slash commands and their UI copy are in
 * `src/pages/Inbox/inboxSlashCommands.ts`, because no edge function reads them.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge.
 */

export const INBOX_CARD_KINDS = ['product', 'service'] as const;
export type InboxCardKind = (typeof INBOX_CARD_KINDS)[number];

export function isInboxCardKind(v: unknown): v is InboxCardKind {
  return typeof v === 'string' && (INBOX_CARD_KINDS as readonly string[]).includes(v);
}

/**
 * Whether the card's price includes VAT. A consumer is quoted gross, a business buyer net — the
 * same split the invoice makes between a retail receipt (11.x) and a wholesale invoice (1.x).
 */
export const INBOX_PRICE_BASES = ['net', 'gross'] as const;
export type InboxPriceBasis = (typeof INBOX_PRICE_BASES)[number];

/** The most cards one message carries. */
export const INBOX_CARD_MAX = 10;

/** The button under a card, in the chat, the email and the WhatsApp card alike. ≤ 20 chars (Meta). */
export const INBOX_CARD_BUTTON_LABEL: Record<InboxCardKind, string> = {
  product: 'View product',
  service: 'View service',
};
