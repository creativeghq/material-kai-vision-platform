/** How an Inbox conversation is read by the assistant. Import-free so the unit tests can run it. */

export const INBOX_HANDOFF_TOOL_NAME = 'hand_off_to_team';
export const HANDOFF_REASON_MAX = 300;

export interface InboxHandoff {
  reason: string;
  /** false = the assistant's reply is NOT sent; a person answers instead. */
  send_reply: boolean;
}

/** The handoff recorded on a system message created at or after `since`, if this turn made one. */
export function handoffSince(
  rows: Array<{ message_type: string; created_at: string; metadata: unknown }>,
  since: string,
): InboxHandoff | null {
  for (const r of rows) {
    if (r.message_type !== 'system' || Date.parse(r.created_at) < Date.parse(since)) continue;
    const h = (r.metadata as { agent_handoff?: InboxHandoff } | null)?.agent_handoff;
    if (h && typeof h.reason === 'string') return { reason: h.reason, send_reply: h.send_reply !== false };
  }
  return null;
}

/** Longest single message the transcript carries; an email thread can paste a whole contract. */
export const TRANSCRIPT_MESSAGE_MAX = 4000;

const QUOTE_HEADER: RegExp[] = [
  /^On\b.{0,240}\bwrote:\s*$/i,
  /^Στις\s.{0,240}έγραψε:\s*$/i,
  /^Le\b.{0,240}a écrit\s*:\s*$/i,
  /^Am\b.{0,240}schrieb.{0,120}:\s*$/i,
  /^El\b.{0,240}escribió:\s*$/i,
  /^Il\b.{0,240}ha scritto:\s*$/i,
];
/** Quotes below this are not `>`-prefixed, so everything after it is the old message. */
const ORIGINAL_MESSAGE = /^-{2,}\s*(Original Message|Αρχικό μήνυμα)\s*-{2,}\s*$/i;
const FORWARDED = /^-{2,}\s*(Forwarded message|Προωθημένο μήνυμα)\b/i;
const OUTLOOK_FROM = /^(From|Από):\s.+/i;
const OUTLOOK_NEXT = /^(Sent|Date|Ημερομηνία|Στάλθηκε|To|Προς|Subject|Θέμα):\s/i;

/**
 * An inbound email without the earlier messages it quotes — those are already in the transcript
 * as their own rows. A forward is left whole: the forwarded part IS the content.
 */
export function stripQuotedEmail(text: string): { text: string; quoted: boolean } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const isHeader = (s: string) => QUOTE_HEADER.some((re) => re.test(s));
  let cut = -1;
  let quoteFrom = -1;
  for (let i = 0; i < lines.length && cut < 0; i++) {
    const line = lines[i].trim();
    const next = (lines[i + 1] ?? '').trim();
    if (FORWARDED.test(line)) return { text: text.trim(), quoted: false };
    if (isHeader(line)) {
      cut = i;
      quoteFrom = i + 1;
    } else if (next && !isHeader(next) && isHeader(`${line} ${next}`)) {
      // Gmail wraps a long "On … <address> wrote:" header over two lines.
      cut = i;
      quoteFrom = i + 2;
    } else if (ORIGINAL_MESSAGE.test(line)
      || (OUTLOOK_FROM.test(line) && lines.slice(i + 1, i + 4).some((l) => OUTLOOK_NEXT.test(l.trim())))) {
      cut = i;
    } else if (line.startsWith('>') && lines.slice(i).every((l) => !l.trim() || l.trim().startsWith('>'))) {
      cut = i;
    }
  }
  if (cut < 0) return { text: text.trim(), quoted: false };
  // Unquoted text after a "wrote:" header is an inline reply — keep the message whole.
  if (quoteFrom >= 0 && lines.slice(quoteFrom).some((l) => l.trim() && !l.trim().startsWith('>'))) {
    return { text: text.trim(), quoted: false };
  }
  const kept = lines.slice(0, cut).join('\n').trim();
  return kept ? { text: kept, quoted: true } : { text: text.trim(), quoted: false };
}

export interface CustomerThreadFacts {
  channel: string;
  /** Who wrote the first message we hold: `us` means this is our own outreach. */
  openedBy: 'us' | 'them' | 'unknown';
  counterparty: 'supplier' | 'customer' | 'unknown';
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  email: 'email',
  social: 'a social-media message',
  sms: 'SMS',
  portal: 'the customer portal chat',
};

/** Server-derived facts about the conversation, for the system prompt — never inside the DATA fence. */
export function formatThreadFacts(f: CustomerThreadFacts): string {
  const opened = f.openedBy === 'us'
    ? 'our team (we contacted them first — this is our own outreach, not an enquiry to us)'
    : f.openedBy === 'them' ? 'them' : 'unknown';
  const party = f.counterparty === 'supplier'
    ? 'one of our SUPPLIERS (we buy from them; they do not buy from us)'
    : f.counterparty === 'customer' ? 'an existing customer (they have bought or been quoted)'
    : 'not on record as a customer or a supplier';
  return [
    '',
    '',
    '[THIS CONVERSATION — facts from our own records, not from the other party]',
    `- Channel: ${CHANNEL_LABEL[f.channel] ?? f.channel}.`,
    `- Started by: ${opened}.`,
    `- The other party is ${party}.`,
  ].join('\n');
}
