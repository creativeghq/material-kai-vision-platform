/**
 * Inbound email → the unified Inbox. Issue #342 §1–§2.
 *
 * Everything the Cloudflare Email Worker is forbidden to do lives here: recipient resolution,
 * tenancy binding, the auth/loop/dupe gates, and the three correlation ladders (workspace,
 * thread, customer). The Worker holds no database credential and resolves nothing — see
 * `cloudflare/email-worker/src/index.ts`.
 *
 * The invariant that matters (#1): `workspace_id` is derived from the RECIPIENT ADDRESS via
 * `user_email_addresses`, never from anything in the message. A sender can assert any From, any
 * Reply-To and any header they like; none of it selects a tenant.
 */

// Mapped in supabase/functions/deno.json, like @supabase/supabase-js. MIME parsing has no
// business being hand-rolled: encoded-words, folded headers, nested multiparts and
// quoted-printable are exactly where a bespoke parser silently loses a customer's order.
import PostalMime from 'postal-mime';
import type { DbClient } from './supabase-client.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles, emitInboxMessageEvent } from './flow-events.ts';
import { inboxAutopilotSettings } from './inbox-autopilot.ts';

/** Private bucket for the raw `.eml`. Registered in `build_storage_reference_set()`. */
export const RAW_EMAIL_BUCKET = 'pdf-documents';
/**
 * Where an INBOUND attachment lands — the PRIVATE bucket (#357 AE-9).
 *
 * It used to be `generation-images`, which is `public: true`. Anyone who can send an email to the
 * inbound address could therefore put a file at a public URL under this platform's domain, with
 * its own chosen `content-type` — usable for malware distribution or for phishing that inherits
 * the domain's reputation. Inbound mail is the one surface where "anyone" is literal.
 *
 * MEASURING IT TURNED UP A SECOND, LOUDER BUG. `generation-images` carries an
 * `allowed_mime_types` allowlist of eight image/video/3D types, so Storage was already refusing
 * `text/html` — the filed attack was mostly blocked. But it was equally refusing
 * `application/pdf`, `application/zip` and everything else a customer actually emails, and
 * `storeAttachments` logged a `console.warn` and moved on. A customer emailing an order as a PDF
 * had the attachment silently dropped, and the message arrived looking like they forgot to
 * attach it.
 *
 * The private bucket fixes both: nothing is publicly addressable, and no MIME allowlist discards
 * real business documents. Reads already mint signed URLs from the recorded
 * `storage_bucket` + `storage_object_path` pair, so existing rows keep resolving from wherever
 * they were written.
 */
export const ATTACHMENT_BUCKET = 'pdf-documents';

/** Cap per attachment. Cloudflare caps the whole message at 25 MiB; this bounds one part. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** How far back the subject+sender heuristic (ladder step 3) is allowed to look. */
const THREAD_HEURISTIC_DAYS = 30;

export type InboundOutcome =
  | 'routed_inbox'
  | 'rejected_unknown_address'
  | 'dropped_inbound_disabled'
  | 'quarantined_auth_fail'
  | 'suppressed_loop'
  | 'duplicate'
  | 'error';

export interface InboundEnvelope {
  from: string | null;
  to: string | null;
  message_id: string | null;
  subject: string | null;
  size: number | null;
  storage_path?: string | null;
}

/** The address row a message was accepted for. */
interface ResolvedAddress {
  id: string;
  user_id: string;
  workspace_id: string;
  full_address: string;
  auto_reply_enabled: boolean;
  agent_ref: string | null;
}

// ── envelope + addressing helpers ───────────────────────────────────────────────────────────
// Pure and Deno-free, so they live next door and are unit-tested directly
// (tests/unit/inboundEmailAddressing.test.ts). Re-exported here so callers see one module.
export {
  bareAddress,
  normalizeSubject,
  parseMessageIdRefs,
  buildOutboundMessageId,
  threadIdFromOurMessageId,
  splitPlusTag,
  threadIdFromTag,
  buildReplyToAddress,
  handleFromIdentity,
  validateChosenLocalPart,
  RESERVED_LOCAL_PARTS,
} from './inbound-email-addressing.ts';
export type { LocalPartRejection } from './inbound-email-addressing.ts';
import {
  bareAddress,
  splitPlusTag,
  threadIdFromTag,
  normalizeSubject,
  parseMessageIdRefs,
  threadIdFromOurMessageId,
  handleFromIdentity,
  validateChosenLocalPart,
} from './inbound-email-addressing.ts';
import type { LocalPartRejection } from './inbound-email-addressing.ts';

// ── address allocation (touches the database, so it stays here) ────────────────────────────

/** The outcome of asking for an address. `taken` is a normal answer, not a failure. */
export type AddressAllocation =
  | { ok: true; id: string; full_address: string; created: boolean }
  | { ok: false; reason: 'taken'; suggested: string }
  | { ok: false; reason: 'invalid'; detail: LocalPartRejection }
  | { ok: false; reason: 'error'; message: string };

/**
 * Get-or-create this user's inbound address. Local parts are GLOBALLY unique because every tenant
 * shares one receiving domain.
 *
 * **No suffixes of any kind.** An auto-generated `basilis.kanonidis2@` is an address its owner has
 * to explain every time they say it out loud, handed to whichever of two identical names signed up
 * second. When the derived handle is taken we allocate NOTHING and return `taken` with the handle
 * we tried, so the user chooses their own (`args.localPart`). Two people with the same full name on
 * one platform is rare enough to be worth one question.
 *
 * No random suffix either: this is an address you print on a business card. What protects it is
 * `setReject()` on unknown recipients, the DKIM gate and per-sender limits — not obscurity.
 */
export async function allocateUserEmailAddress(
  db: DbClient,
  args: { userId: string; workspaceId: string; domain: string; localPart?: string | null },
): Promise<AddressAllocation> {
  const { data: existing } = await db
    .from('user_email_addresses')
    .select('id, full_address')
    .eq('user_id', args.userId)
    .maybeSingle();
  if (existing) {
    const row = existing as { id: string; full_address: string };
    return { ok: true, ...row, created: false };
  }

  let local: string;
  if (args.localPart != null && String(args.localPart).trim() !== '') {
    const checked = validateChosenLocalPart(args.localPart);
    if (!checked.ok) return { ok: false, reason: 'invalid', detail: checked.reason };
    local = checked.localPart;
  } else {
    const { data: profile } = await db
      .from('user_profiles').select('full_name, email').eq('user_id', args.userId).maybeSingle();
    const p = (profile as { full_name?: string; email?: string } | null) ?? null;
    local = handleFromIdentity(p?.full_name ?? null, p?.email ?? null);
    // A derived handle can land on a reserved name — `Ada Support` slugs to `support`. Refuse it
    // the same way a typed one is refused, rather than minting an address that speaks for the
    // platform.
    const checked = validateChosenLocalPart(local);
    if (!checked.ok) return { ok: false, reason: 'taken', suggested: local };
  }

  const full = `${local}@${args.domain}`.toLowerCase();
  const { data, error } = await db
    .from('user_email_addresses')
    .insert({
      user_id: args.userId,
      workspace_id: args.workspaceId,
      local_part: local,
      full_address: full,
    })
    .select('id, full_address')
    .single();

  if (!error && data) {
    const row = data as { id: string; full_address: string };
    return { ok: true, ...row, created: true };
  }

  // 23505 on user_id means a concurrent request already allocated for this user — re-read and
  // return theirs. On full_address it means the handle belongs to someone else.
  if (error && error.code === '23505') {
    const { data: raced } = await db
      .from('user_email_addresses').select('id, full_address')
      .eq('user_id', args.userId).maybeSingle();
    if (raced) return { ok: true, ...(raced as { id: string; full_address: string }), created: false };
    return { ok: false, reason: 'taken', suggested: local };
  }

  console.warn('[inbound-email] address allocation failed:', error?.message);
  return { ok: false, reason: 'error', message: error?.message ?? 'unknown' };
}

// ── gates ───────────────────────────────────────────────────────────────────────────────────

/*
 * `AuthResults`, `parseAuthResults` and `dkimAlignedWith` moved to `_shared/email-auth.ts` and
 * are re-exported here so every import site keeps working.
 *
 * They left because THIS module cannot be unit-tested: it imports `flow-events.ts`, which reads
 * `Deno.env` at module load, so vitest cannot load it at all. The DKIM alignment rule is exactly
 * the logic that most needs a test — it is the difference between "a signature verified" and
 * "the sender is who they say" (#357 AE-5) — and it had none.
 */
export type { AuthResults } from './email-auth.ts';
export { parseAuthResults, dkimAlignedWith } from './email-auth.ts';
// Also imported: a re-export does not bind the name locally, and the type is used below.
import type { AuthResults } from './email-auth.ts';

/** True when the message must never be auto-replied to (it is itself automated, or it is us). */
export function isAutomatedSender(headers: Map<string, string>, from: string | null): boolean {
  const autoSubmitted = (headers.get('auto-submitted') || '').toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;

  const precedence = (headers.get('precedence') || '').toLowerCase();
  if (['bulk', 'list', 'junk', 'auto_reply'].includes(precedence)) return true;

  if (headers.has('x-auto-response-suppress')) return true;
  if (headers.has('list-unsubscribe') || headers.has('list-id')) return true;

  const addr = bareAddress(from);
  if (!addr) return true; // a null/empty return-path is a bounce
  const local = addr.split('@')[0];
  if (['mailer-daemon', 'postmaster', 'no-reply', 'noreply', 'do-not-reply', 'donotreply'].includes(local)) {
    return true;
  }
  return false;
}

/**
 * Is this sender one of OUR users' platform addresses? Used three ways (#229 §5): never
 * auto-reply to one (the loop guard), attribute the message to that user instead of filing a
 * colleague as a customer, and default the Inbox composer to `internal`.
 */
export async function isPlatformAddress(db: DbClient, address: string | null): Promise<
  { user_id: string; workspace_id: string } | null
> {
  const addr = bareAddress(address);
  if (!addr) return null;
  const { data } = await db
    .from('user_email_addresses')
    .select('user_id, workspace_id')
    .eq('full_address', addr)
    .maybeSingle();
  return (data as { user_id: string; workspace_id: string } | null) ?? null;
}

// ── ladder 2a: which workspace / user ───────────────────────────────────────────────────────

/**
 * Recipient address → the address row. This is the ONLY thing that selects a tenant. An inactive
 * address resolves to null exactly like a nonexistent one, so a disabled mailbox does not confirm
 * it ever existed.
 */
export async function resolveRecipient(db: DbClient, to: string | null): Promise<ResolvedAddress | null> {
  // Match on the BASE address: replies come back to `basilis+t.<threadId>@…`, which is the same
  // mailbox. Looking up the tagged form verbatim would reject every reply to our own mail.
  const { base } = splitPlusTag(to);
  if (!base) return null;
  const { data } = await db
    .from('user_email_addresses')
    .select('id, user_id, workspace_id, full_address, auto_reply_enabled, agent_ref')
    .eq('full_address', base)
    .eq('is_active', true)
    .maybeSingle();
  return (data as ResolvedAddress | null) ?? null;
}

// ── ladder 2c: which customer ───────────────────────────────────────────────────────────────

export interface ResolvedCustomer {
  contactId: string | null;
  companyId: string | null;
  /** A platform colleague rather than a customer — attributed, never filed in CRM. */
  platformUserId: string | null;
  created: boolean;
}

/**
 * Sender → CRM contact, workspace-scoped. Creates the contact on a miss so an order from a new
 * customer is not dropped, and emits `crm_contact_created` so the "new lead" flow runs for it —
 * the same best-effort emit `zernio-webhook-handler` performs for a WhatsApp lead.
 */
export async function resolveCustomer(
  db: DbClient,
  workspaceId: string,
  fromAddress: string | null,
  fromName: string | null,
  createdBy: string | null,
): Promise<ResolvedCustomer> {
  const addr = bareAddress(fromAddress);
  const empty: ResolvedCustomer = { contactId: null, companyId: null, platformUserId: null, created: false };
  if (!addr) return empty;

  // A colleague emailing in is a member, not a customer. Without this every internal email
  // quietly files a teammate as a lead.
  const platform = await isPlatformAddress(db, addr);
  if (platform) return { ...empty, platformUserId: platform.user_id };

  const { data: existing } = await db
    .from('crm_contacts')
    .select('id')
    .eq('workspace_id', workspaceId)
    .ilike('email', addr)
    .limit(1)
    .maybeSingle();

  let contactId = (existing as { id?: string } | null)?.id ?? null;
  let created = false;

  if (!contactId) {
    if (!createdBy) return empty; // crm_contacts.created_by is NOT NULL
    const { data: row } = await db
      .from('crm_contacts')
      .insert({
        workspace_id: workspaceId,
        name: fromName || addr,
        email: addr,
        created_by: createdBy,
        lead_source: 'email',
        lead_status: 'new',
      })
      .select('id')
      .single();
    contactId = (row as { id?: string } | null)?.id ?? null;
    created = Boolean(contactId);

    if (contactId) {
      try {
        await emitFlowEventToWorkspaceRoles(workspaceId, ['owner', 'admin'], 'crm_contact_created', (uid: string) => ({
          type: 'crm_contact_created',
          workspace_id: workspaceId,
          user_id: uid,
          contact_id: contactId,
          contact_name: fromName || addr,
          lead_source: 'email',
          title: 'New email lead',
          body: `${fromName || addr} emailed you.`,
          action_url: `/crm/contacts/${contactId}`,
        }));
      } catch { /* best-effort */ }
    }
  }

  // Company rollup — what makes B2B pricing resolve on the right layer.
  let companyId: string | null = null;
  if (contactId) {
    const { data: link } = await db
      .from('crm_company_contacts')
      .select('company_id')
      .eq('contact_id', contactId)
      .limit(1)
      .maybeSingle();
    companyId = (link as { company_id?: string } | null)?.company_id ?? null;
  }

  return { contactId, companyId, platformUserId: null, created };
}

// ── ladder 2b: which thread ─────────────────────────────────────────────────────────────────

/**
 * Four steps, exact first. Steps 1–2 are deterministic; step 3 is the only fuzzy one and is
 * fenced hard (still `open`, same recipient AND sender, within 30 days) so a stale conversation
 * can never absorb a new one.
 */
export async function resolveThread(
  db: DbClient,
  opts: {
    workspaceId: string;
    toAddress: string;
    fromAddress: string;
    inReplyTo: string | null;
    references: string | null;
    subject: string | null;
  },
): Promise<{ threadId: string | null; matchedBy: 'reply_tag' | 'token' | 'message_id' | 'heuristic' | null }> {
  const refs = parseMessageIdRefs(opts.inReplyTo, opts.references);

  // 0. The recipient tag. We sent `Reply-To: basilis+t.<threadId>@…`, so a reply carries the
  //    thread in the field mail is ROUTED on — the one part of the round trip no intermediary
  //    rewrites. Still workspace-checked: the tag is attacker-supplied like anything else.
  const tagThread = threadIdFromTag(splitPlusTag(opts.toAddress).tag);
  if (tagThread) {
    const { data } = await db
      .from('inbox_threads').select('id')
      .eq('id', tagThread).eq('workspace_id', opts.workspaceId).maybeSingle();
    if ((data as { id?: string } | null)?.id) return { threadId: tagThread, matchedBy: 'reply_tag' };
  }

  // 1. Our own Message-ID token, when the ESP passed our header through unaltered.
  for (const ref of refs) {
    const threadId = threadIdFromOurMessageId(ref);
    if (!threadId) continue;
    const { data } = await db
      .from('inbox_threads')
      .select('id')
      .eq('id', threadId)
      .eq('workspace_id', opts.workspaceId)  // never cross a tenant on a sender-supplied id
      .maybeSingle();
    if ((data as { id?: string } | null)?.id) return { threadId, matchedBy: 'token' };
  }

  // 2. A Message-ID we stored — covers replies to mail we did not originate (the customer
  //    forwarded us into an existing chain) and our own sends before the token existed.
  if (refs.length) {
    const { data } = await db
      .from('inbox_messages')
      .select('thread_id, inbox_threads!inner(workspace_id)')
      .in('metadata->>email_message_id', refs)
      .eq('inbox_threads.workspace_id', opts.workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const threadId = (data as { thread_id?: string } | null)?.thread_id ?? null;
    if (threadId) return { threadId, matchedBy: 'message_id' };
  }

  // 3. Heuristic. Same pair of addresses, same normalized subject, still open, still recent.
  const norm = normalizeSubject(opts.subject);
  if (norm) {
    const since = new Date(Date.now() - THREAD_HEURISTIC_DAYS * 86400_000).toISOString();
    const { data } = await db
      .from('inbox_threads')
      .select('id, subject, metadata, last_message_at')
      .eq('workspace_id', opts.workspaceId)
      .eq('channel', 'email')
      .eq('status', 'open')
      .gte('last_message_at', since)
      .order('last_message_at', { ascending: false })
      .limit(50);
    for (const t of (data || []) as Array<{ id: string; subject: string | null; metadata: Record<string, unknown> }>) {
      const meta = (t.metadata || {}) as { email_to?: string; email_from?: string };
      // Compare the BASE mailbox: metadata stores the untagged address, while opts.toAddress may
      // carry a +t.<threadId> tag that step 0 already tried and failed on.
      if ((meta.email_to || '').toLowerCase() !== (splitPlusTag(opts.toAddress).base || '')) continue;
      if ((meta.email_from || '').toLowerCase() !== opts.fromAddress) continue;
      if (normalizeSubject(t.subject) !== norm) continue;
      return { threadId: t.id, matchedBy: 'heuristic' };
    }
  }

  // 4. New conversation.
  return { threadId: null, matchedBy: null };
}

// ── parsing + persistence ───────────────────────────────────────────────────────────────────

export interface ParsedInbound {
  headers: Map<string, string>;
  from: { address: string | null; name: string | null };
  subject: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  text: string | null;
  html: string | null;
  attachments: Array<{ filename: string; mimeType: string; base64: string; size: number }>;
}

/** Raw RFC822 → the fields the Inbox needs. No interpretation beyond decoding. */
export async function parseRawEmail(raw: ArrayBuffer): Promise<ParsedInbound> {
  const email = await PostalMime.parse(raw, { attachmentEncoding: 'base64' });

  const headers = new Map<string, string>();
  for (const h of (email.headers || []) as Array<{ key: string; value: string }>) {
    // postal-mime returns headers in reverse order; first write wins so we keep the topmost
    // (most recently added by the receiving infrastructure) copy of a repeated header.
    if (!headers.has(h.key.toLowerCase())) headers.set(h.key.toLowerCase(), h.value);
  }

  const attachments = ((email.attachments || []) as Array<{
    filename?: string; mimeType?: string; content?: string; disposition?: string;
  }>)
    .map((a, i) => {
      const base64 = typeof a.content === 'string' ? a.content : '';
      // base64 → bytes, without decoding it.
      const size = Math.floor((base64.length * 3) / 4);
      return {
        filename: a.filename || `attachment-${i + 1}`,
        mimeType: a.mimeType || 'application/octet-stream',
        base64,
        size,
      };
    })
    .filter((a) => a.base64 && a.size <= MAX_ATTACHMENT_BYTES);

  return {
    headers,
    from: {
      address: bareAddress(email.from?.address ?? null),
      name: email.from?.name || null,
    },
    subject: email.subject || null,
    messageId: email.messageId ? parseMessageIdRefs(email.messageId)[0] || email.messageId : null,
    inReplyTo: email.inReplyTo || null,
    references: email.references || null,
    text: email.text || null,
    html: email.html || null,
    attachments,
  };
}

/** First active owner/admin of a workspace — the fallback author for rows that need one. */
export async function workspaceOwner(db: DbClient, workspaceId: string): Promise<string | null> {
  const { data } = await db
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin'])
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();
  return (data as { user_id?: string } | null)?.user_id ?? null;
}

/**
 * Store attachments under the prefix #209 already protects (`inbox/{thread_id}/`), so they need
 * no new `build_storage_reference_set()` branch and are prefix-deleted with the thread.
 * Returns `inbox_messages.attachments` entries — a path pair, never a persisted URL.
 */
export async function storeAttachments(
  db: DbClient,
  threadId: string,
  attachments: ParsedInbound['attachments'],
): Promise<Array<Record<string, unknown>>> {
  const out: Array<Record<string, unknown>> = [];
  for (const [i, att] of attachments.entries()) {
    const safeName = att.filename.replace(/[^\w.\-]+/g, '_').slice(0, 120);
    const path = `inbox/${threadId}/${Date.now()}-${i}-${safeName}`;
    const bytes = Uint8Array.from(atob(att.base64), (c) => c.charCodeAt(0));
    const { error } = await db.storage
      .from(ATTACHMENT_BUCKET)
      .upload(path, bytes, { contentType: att.mimeType, upsert: false });
    if (error) {
      /**
       * AN EXPLICIT FAILURE MARKER, not a silent skip (pipeline convention 1, #357 AE-9).
       *
       * This used to `continue`, so a failed upload produced a message with one fewer attachment
       * and nothing anywhere saying so — the reader cannot tell "they didn't attach anything"
       * from "we lost it". That is how the mime-allowlist rejection above went unnoticed: every
       * PDF a customer emailed vanished into a console.warn.
       *
       * The row is still recorded, with no path and a reason, so the Inbox can say "an
       * attachment could not be stored" instead of showing nothing at all.
       */
      console.error(`[inbound-email] attachment "${att.filename}" (${att.mimeType}) failed to store:`, error.message);
      out.push({
        storage_bucket: null,
        storage_object_path: null,
        name: att.filename,
        content_type: att.mimeType,
        size: att.size,
        store_failed: true,
        store_error: error.message,
      });
      continue;
    }
    out.push({
      storage_bucket: ATTACHMENT_BUCKET,
      storage_object_path: path,
      name: att.filename,
      content_type: att.mimeType,
      size: att.size,
    });
  }
  return out;
}

/** Append an outcome row. Envelope + verdict only — never a body (PII stays in the raw .eml). */
export async function logInbound(
  db: DbClient,
  row: {
    workspaceId?: string | null;
    envelope: InboundEnvelope;
    matchedAddressId?: string | null;
    auth?: AuthResults | null;
    outcome: InboundOutcome;
    threadId?: string | null;
    error?: string | null;
  },
): Promise<void> {
  try {
    await db.from('agent_email_inbound_log').insert({
      workspace_id: row.workspaceId ?? null,
      message_id: row.envelope.message_id,
      from_addr: bareAddress(row.envelope.from),
      to_addr: bareAddress(row.envelope.to),
      matched_address_id: row.matchedAddressId ?? null,
      spf: row.auth?.spf ?? null,
      dkim: row.auth?.dkim ?? null,
      dmarc: row.auth?.dmarc ?? null,
      outcome: row.outcome,
      thread_id: row.threadId ?? null,
      storage_path: row.envelope.storage_path ?? null,
      size_bytes: row.envelope.size ?? null,
      error: row.error ?? null,
    });
  } catch (e) {
    console.error('[inbound-email] failed to write the inbound log:', e);
  }
}

/** Already seen this Message-ID? Cloudflare retries, and a duplicate must not double-post. */
export async function alreadyProcessed(db: DbClient, messageId: string | null): Promise<boolean> {
  if (!messageId) return false;
  const { data } = await db
    .from('agent_email_inbound_log')
    .select('id')
    .eq('message_id', messageId)
    .eq('outcome', 'routed_inbox')
    .limit(1)
    .maybeSingle();
  return Boolean((data as { id?: string } | null)?.id);
}

/**
 * Find-or-create the email thread and post the message. Mirrors the WhatsApp inbound shape in
 * `zernio-webhook-handler` — customer participant (contact-only, never an app account) plus an
 * assign-on-first-message owner participant.
 */
export async function deliverToInbox(
  db: DbClient,
  args: {
    address: ResolvedAddress;
    parsed: ParsedInbound;
    customer: ResolvedCustomer;
    toAddress: string;
    fromAddress: string;
    storagePath: string | null;
    autoReplyAllowed: boolean;
  },
): Promise<{ threadId: string; created: boolean }> {
  const { address, parsed, customer } = args;
  const workspaceId = address.workspace_id;

  const found = await resolveThread(db, {
    workspaceId,
    toAddress: args.toAddress,
    fromAddress: args.fromAddress,
    inReplyTo: parsed.inReplyTo,
    references: parsed.references,
    subject: parsed.subject,
  });

  const meta = {
    // The untagged mailbox. Storing the tagged form would make the heuristic compare a value that
    // differs on every reply, and would leak a thread id into a field used for matching.
    email_to: splitPlusTag(args.toAddress).base ?? args.toAddress,
    email_from: args.fromAddress,
    email_address_id: address.id,
    raw_storage_bucket: RAW_EMAIL_BUCKET,
    raw_storage_path: args.storagePath,
  };

  let threadId = found.threadId;
  let created = false;
  let customerParticipantId: string | null = null;

  if (!threadId) {
    // Auto-engage the assistant only when the workspace has explicitly turned it ON and the
    // message is not itself automated — the same rule, from the same place, the WhatsApp path
    // applies. This was `auto_respond !== false`: unset meant yes. See _shared/inbox-autopilot.ts.
    const { autoRespond: workspaceWantsAutopilot } = await inboxAutopilotSettings(db, workspaceId);
    const autoRespond = workspaceWantsAutopilot && args.autoReplyAllowed;

    const { data: thread, error } = await db
      .from('inbox_threads')
      .insert({
        workspace_id: workspaceId,
        thread_type: 'customer',
        channel: 'email',
        subject: parsed.subject || args.fromAddress,
        status: 'open',
        metadata: meta,
        agent_state: autoRespond ? 'active' : 'off',
        agent_id: autoRespond ? (address.agent_ref || 'kai') : null,
        last_message_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    // Throw so the Worker sees a failure and the sending server retries, rather than losing it.
    if (error) throw new Error(`inbox_threads insert failed: ${error.message}`);
    threadId = (thread as { id: string }).id;
    created = true;

    if (autoRespond) {
      await db.from('inbox_participants').insert({
        thread_id: threadId, participant_type: 'agent',
        agent_id: address.agent_ref || 'kai', thread_role: 'agent',
      });
      await db.from('inbox_messages').insert({
        thread_id: threadId, message_type: 'system',
        body: 'The AI assistant is responding to new messages on this conversation.',
      });
    }

    if (customer.contactId) {
      const { data: cust, error: custErr } = await db
        .from('inbox_participants')
        .insert({
          thread_id: threadId, participant_type: 'customer',
          contact_id: customer.contactId, thread_role: 'participant',
        })
        .select('id')
        .single();
      if (custErr) throw new Error(`inbox_participants (customer) insert failed: ${custErr.message}`);
      customerParticipantId = (cust as { id: string }).id;
    }

    // The address owner is the thread owner — mail addressed to a person lands on that person.
    const owner = customer.platformUserId && customer.platformUserId !== address.user_id
      ? address.user_id
      : address.user_id;
    const { error: ownerErr } = await db.from('inbox_participants').insert({
      thread_id: threadId, participant_type: 'member', user_id: owner,
      workspace_id: workspaceId, thread_role: 'owner', added_by: owner,
    });
    if (ownerErr) throw new Error(`inbox_participants (owner) insert failed: ${ownerErr.message}`);

    await emitFlowEvent('inbox.thread_assigned', {
      user_id: owner, type: 'inbox_assigned', workspace_id: workspaceId,
      title: 'You were assigned an email conversation',
      body: parsed.subject || args.fromAddress,
      action_url: `/inbox?thread=${threadId}`, thread_id: threadId,
    }).catch(() => {});
  } else {
    await db.from('inbox_threads')
      .update({ metadata: meta, status: 'open', last_message_at: new Date().toISOString() })
      .eq('id', threadId);
    if (customer.contactId) {
      const { data: cp } = await db
        .from('inbox_participants').select('id')
        .eq('thread_id', threadId).eq('contact_id', customer.contactId)
        .limit(1).maybeSingle();
      customerParticipantId = (cp as { id?: string } | null)?.id ?? null;
    }
  }

  const attachments = await storeAttachments(db, threadId, parsed.attachments);

  const { error: msgErr } = await db.from('inbox_messages').insert({
    thread_id: threadId,
    sender_participant_id: customerParticipantId,
    // Store the plain-text body. The HTML is kept in metadata and rendered through
    // react-markdown / escapeHtml on the client — inbound HTML is a stranger's markup and is
    // never handed to dangerouslySetInnerHTML (invariant 11).
    body: parsed.text || null,
    attachments,
    message_type: 'text',
    metadata: {
      channel: 'email',
      direction: 'incoming',
      email_message_id: parsed.messageId,
      email_in_reply_to: parsed.inReplyTo,
      email_subject: parsed.subject,
      email_from: args.fromAddress,
      email_to: args.toAddress,
      email_html: parsed.html,
      thread_matched_by: found.matchedBy,
    },
  });
  if (msgErr) throw new Error(`inbox_messages insert failed: ${msgErr.message}`);

  // Notify every member participant through Flows — never a hardcoded notification insert.
  const { data: members } = await db
    .from('inbox_participants').select('user_id')
    .eq('thread_id', threadId).eq('participant_type', 'member').eq('status', 'active')
    .not('user_id', 'is', null);
  const preview = (parsed.text || parsed.subject || '[no content]').replace(/\s+/g, ' ').slice(0, 200);
  await emitInboxMessageEvent({
    userIds: ((members || []) as Array<{ user_id: string }>).map((m) => m.user_id),
    threadId,
    workspaceId,
    title: `Email · ${parsed.from.name || args.fromAddress}`,
    body: preview,
  });

  return { threadId, created };
}
