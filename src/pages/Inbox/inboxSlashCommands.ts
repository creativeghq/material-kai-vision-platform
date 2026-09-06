/**
 * The composer's slash commands — `/product`, `/service` — and how a typed token maps to one.
 *
 * Client-only: the picker, its labels and hints are UI. The value-set they resolve to
 * (`INBOX_CARD_KINDS`) is the mirrored vocabulary; this file is the composer's use of it.
 */

import type { InboxCardKind } from '@/modules/messaging/inboxCardKinds';

export interface InboxSlashCommand {
  command: string;
  kind: InboxCardKind;
  label: string;
  hint: string;
}

export const INBOX_SLASH_COMMANDS: readonly InboxSlashCommand[] = [
  { command: 'product', kind: 'product', label: '/product', hint: 'Suggest a product from the catalog' },
  { command: 'service', kind: 'service', label: '/service', hint: 'Suggest one of your services' },
];

/**
 * The commands a partial token matches, in menu order. `/pro` → product; `/serv` → service;
 * `/products` and `/services` → the same as the singular (a typo is not a refusal); `/` → both.
 *
 * Matched against the command AND its plural, never by stripping a trailing `s` from the query —
 * that turned `/s` into the empty query, which matched everything and "Enter picks the first"
 * opened the PRODUCT picker for someone starting to type /service.
 */
export function slashCommandMatches(query: string): InboxSlashCommand[] {
  const q = query.trim().toLowerCase();
  return INBOX_SLASH_COMMANDS.filter((c) => c.command.startsWith(q) || `${c.command}s`.startsWith(q));
}

/**
 * The slash token under the caret, if the text up to the caret ends in one at the start of a
 * line. Returns where it starts and ends so the composer can remove exactly that token when a
 * command is chosen — wherever in the draft it was typed.
 */
export function slashTokenAtCaret(value: string, caret: number): { query: string; start: number; end: number } | null {
  const before = value.slice(0, caret);
  const m = /(^|\n)\/([a-z]*)$/i.exec(before);
  if (!m) return null;
  const start = m.index + m[1].length;
  return { query: m[2], start, end: caret };
}
