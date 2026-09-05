/**
 * What a catalog card in an Inbox message can be — written ONCE.
 *
 * A member types `/product` or `/service` in the composer, picks from the workspace catalog, and
 * the card goes to the customer in the channel's own rich shape (a WhatsApp interactive card, a
 * table in an email, a card in the thread). The CLIENT needs this list for the slash-command menu
 * and the chips; the EDGE needs it to validate the pick and to label the button on the card.
 * Two runtimes, one declaration — mirrored by `npm run vocab:mirror`
 * (tests/unit/vocabularyMirrors.test.ts holds the copy to this source).
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE — it is byte-mirrored to the edge.
 */

export const INBOX_CARD_KINDS = ['product', 'service'] as const;
export type InboxCardKind = (typeof INBOX_CARD_KINDS)[number];

/** The most cards one message carries — WhatsApp's carousel cap, and plenty for an email. */
export const INBOX_CARD_MAX = 10;

/** The composer's slash commands, each with the kind it opens a picker for. */
export const INBOX_CARD_SLASH_COMMANDS: ReadonlyArray<{
  command: string;
  kind: InboxCardKind;
  label: string;
  hint: string;
}> = [
  { command: 'product', kind: 'product', label: '/product', hint: 'Suggest a product from the catalog' },
  { command: 'service', kind: 'service', label: '/service', hint: 'Suggest one of your services' },
];

/** `/products` and `/services` mean the same thing as the singular; a typo is not a refusal. */
export function inboxCardKindForCommand(token: string): InboxCardKind | null {
  const t = token.trim().toLowerCase().replace(/^\//, '').replace(/s$/, '');
  const hit = INBOX_CARD_SLASH_COMMANDS.find((c) => c.command === t);
  return hit ? hit.kind : null;
}
