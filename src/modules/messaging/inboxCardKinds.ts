/** What a catalog card in an Inbox message can be — written ONCE. */

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
