/**
 * Inbound-email ADDRESSING — pure functions, no Deno and no database. Issue #342 §1–§2.
 *
 * Split out of `inbound-email.ts` so it can be unit-tested outside Deno, like `transliterate.ts`
 * next to it. That is not cosmetic: every function here was at some point in the build either
 * missing or dead code (`buildOutboundMessageId` was defined and never called; `splitPlusTag` did
 * not exist, so a reply to our own Reply-To resolved to no recipient at all), and none of it is
 * reachable by a source-level grep. It needs real assertions, so it needs to be importable.
 */

import { detectScript, transliterateToLatin } from './transliterate.ts';

// ── envelope helpers ────────────────────────────────────────────────────────────────────────

/** Bare address out of `Name <a@b.c>` / `<a@b.c>` / `a@b.c`, lowercased. */
export function bareAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = String(raw).match(/<([^>]+)>/);
  const addr = (m ? m[1] : String(raw)).trim().toLowerCase();
  return addr.includes('@') ? addr : null;
}

/**
 * Subject with any number of reply/forward prefixes stripped — English and Greek, since a Greek
 * mail client answers with `ΑΠ:` / `ΣΧΕΤ:` and the heuristic would otherwise treat every reply as
 * a new conversation.
 */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = String(subject || '').trim();
  // Repeat: real threads accumulate "Re: Fwd: Re:".
  for (let i = 0; i < 10; i++) {
    const next = s.replace(/^\s*(re|fwd?|aw|απ|σχετ|προωθ)\s*(\[\d+\])?\s*:\s*/i, '');
    if (next === s) break;
    s = next;
  }
  return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Message-IDs out of an In-Reply-To / References header value, newest last. */
export function parseMessageIdRefs(...values: Array<string | null | undefined>): string[] {
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    for (const m of String(v).matchAll(/<([^<>\s]+)>/g)) out.push(m[1]);
  }
  return [...new Set(out)];
}

/**
 * Our own outbound Message-ID carries the thread it belongs to, so a reply threads exactly with
 * no lookup and no heuristic. Format: `inbox.{threadId}.{messageId}@{domain}`.
 */
export function buildOutboundMessageId(threadId: string, messageId: string, domain: string): string {
  return `inbox.${threadId}.${messageId}@${domain}`;
}

/** The thread id inside one of our own Message-IDs, or null when it isn't ours. */
export function threadIdFromOurMessageId(messageId: string): string | null {
  const m = messageId.match(
    /^inbox\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\./i,
  );
  return m ? m[1] : null;
}

const UUID_RE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/**
 * Split `basilis+t.<uuid>@mail.…` into its base address and its tag.
 *
 * Plus-addressing is how a reply threads DETERMINISTICALLY. A custom `Message-ID` header is a
 * request, not a guarantee — an ESP may rewrite it, and then the token we stored never matches
 * anything the customer's client sends back. The recipient address is the one field that survives
 * the whole round trip unaltered, because it is what the mail was routed on.
 *
 * Cloudflare's catch-all accepts any local part, so this needs no extra routing rule.
 */
export function splitPlusTag(address: string | null | undefined): { base: string | null; tag: string | null } {
  const addr = bareAddress(address);
  if (!addr) return { base: null, tag: null };
  const [local, domain] = addr.split('@');
  const plus = local.indexOf('+');
  if (plus < 0) return { base: addr, tag: null };
  return { base: `${local.slice(0, plus)}@${domain}`, tag: local.slice(plus + 1) };
}

/** The thread id inside a `+t.<uuid>` recipient tag, or null. */
export function threadIdFromTag(tag: string | null): string | null {
  if (!tag) return null;
  const m = tag.match(new RegExp(`^t\\.(${UUID_RE})$`, 'i'));
  return m ? m[1] : null;
}

/** `basilis@mail.x` + a thread → `basilis+t.<threadId>@mail.x`, the Reply-To we send replies with. */
export function buildReplyToAddress(fullAddress: string, threadId: string): string {
  const [local, domain] = fullAddress.split('@');
  return `${local}+t.${threadId}@${domain}`;
}

// ── address allocation ──────────────────────────────────────────────────────────────────────

/**
 * A mail-safe local part from a name or an email local part.
 *
 * Greek and Cyrillic names go through the platform's existing ELOT 743 / Transliteration Act
 * mapper first. Without it `Γιάννης Παπαδόπουλος` strips to nothing and the person gets
 * `user4821@…` — an address you cannot print on a business card, handed to exactly the users this
 * platform has most of.
 */
export function handleFromIdentity(fullName: string | null, email: string | null): string {
  const raw = (fullName || '').trim() || (email || '').split('@')[0] || '';
  const source = detectScript(raw) === 'latin' || detectScript(raw) === 'none'
    ? raw
    : (transliterateToLatin(raw) || raw);
  const slug = source
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')   // é → e, ï → i
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .replace(/\.{2,}/g, '.')
    .slice(0, 40)
    .replace(/\.+$/, '');                              // the slice can leave a trailing dot
  // Last resort only. An empty or leading-punctuation local part fails the column's CHECK, and
  // the user would end up with no address at all rather than an ugly one.
  return /^[a-z0-9]/.test(slug) ? slug : `user${Math.floor(Math.random() * 9000 + 1000)}`;
}

/**
 * Local parts nobody may claim on the shared receiving domain.
 *
 * Two different reasons, both load-bearing. The RFC 2142 role names and our operational ones
 * (`postmaster`, `abuse`, `security`) are addresses the outside world assumes belong to whoever
 * runs the domain — handing one to a tenant lets them answer mail meant for us. The rest
 * (`sales`, `support`, `billing`, `info`) would let one workspace's user appear to speak for the
 * platform, because every tenant shares this domain.
 *
 * `no-reply` and friends are also on the sender-side suppression list in `inbound-email.ts`: an
 * address we would never auto-reply TO is not one we should let a person receive ON.
 */
export const RESERVED_LOCAL_PARTS: ReadonlySet<string> = new Set([
  'postmaster', 'abuse', 'hostmaster', 'webmaster', 'security', 'root', 'admin', 'administrator',
  'mailer-daemon', 'daemon', 'no-reply', 'noreply', 'do-not-reply', 'donotreply', 'bounce',
  'info', 'support', 'sales', 'billing', 'accounts', 'help', 'contact', 'marketing', 'notifications',
]);

/** Why a chosen local part was refused — the UI shows these verbatim. */
export type LocalPartRejection = 'empty' | 'shape' | 'plus' | 'reserved';

/**
 * Validate a local part the USER typed, for the collision case where no address is auto-assigned.
 *
 * `+` is rejected ahead of the shape check so the error can say why: plus is the thread delimiter
 * (`basilis+t.<uuid>@…`), so a local part containing one would make every reply to that mailbox
 * resolve to a truncated base address. The column's CHECK would reject it anyway, but with a
 * constraint-violation message that tells the user nothing.
 */
export function validateChosenLocalPart(
  input: string | null | undefined,
): { ok: true; localPart: string } | { ok: false; reason: LocalPartRejection } {
  const local = String(input ?? '').trim().toLowerCase();
  if (!local) return { ok: false, reason: 'empty' };
  if (local.includes('+')) return { ok: false, reason: 'plus' };
  // Mirrors user_email_addresses_local_part_shape exactly — validate here so the caller gets a
  // sentence, not a 23514.
  if (!/^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/.test(local)) return { ok: false, reason: 'shape' };
  if (RESERVED_LOCAL_PARTS.has(local)) return { ok: false, reason: 'reserved' };
  return { ok: true, localPart: local };
}
