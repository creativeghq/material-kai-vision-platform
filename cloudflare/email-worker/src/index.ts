/** Inbound Email Worker (Cloudflare Email Routing) — issue #342, §1. */

// Minimal ambient shapes for the Email Workers runtime. Declared inline rather than pulling in
// @cloudflare/workers-types, so this directory stays dependency-free (wrangler bundles with
// esbuild and does not typecheck).
interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream<Uint8Array>;
  readonly rawSize: number;
  setReject(reason: string): void;
}

interface R2Object {
  readonly key: string;
  readonly uploaded: Date;
  readonly customMetadata?: Record<string, string>;
}
interface R2ObjectBody extends R2Object {
  arrayBuffer(): Promise<ArrayBuffer>;
}
interface R2Bucket {
  put(key: string, value: Uint8Array, options?: { customMetadata?: Record<string, string> }): Promise<R2Object | null>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
  list(options?: { prefix?: string; limit?: number; include?: string[] }): Promise<{ objects: R2Object[] }>;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

interface Env {
  /** The domain this Worker accepts mail for, e.g. "mail.materialshub.gr". */
  RECEIVING_DOMAIN: string;
  /** Absolute URL of the email-webhooks edge function. */
  WEBHOOK_URL: string;
  /** Shared secret; the edge function fails closed when it is unset on either side. */
  INBOUND_WEBHOOK_SECRET: string;
  SPOOL: R2Bucket;
}

/**
 * Cloudflare Email Routing's own inbound ceiling. Anything larger never reaches this Worker, so
 * this cap refuses nothing the platform could otherwise have received.
 */
const MAX_MESSAGE_BYTES = 25 * 1024 * 1024;

/**
 * A transient platform failure must never become a bounce: Cloudflare turns EVERY setReject() into
 * a permanent 5xx, so the sending server does not retry. A message is spooled to R2 first and only
 * refused when the platform answers that the recipient does not exist.
 */
const SPOOL_PREFIX = 'spool/';
const INLINE_ATTEMPTS = 3;
const INLINE_BACKOFF_MS = [0, 2_000, 6_000];
const SCHEDULED_BATCH = 10;

interface Envelope {
  from: string;
  to: string;
  message_id: string | null;
  subject: string | null;
  size: number;
}

type Outcome =
  | { kind: 'delivered' }
  | { kind: 'no_such_recipient' }
  | { kind: 'retry'; reason: string };

async function callWebhook(
  env: Env,
  action: 'inbound_begin' | 'inbound_stored',
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Presence selects the inbound branch; the VALUE authenticates.
      'x-inbound-secret': env.INBOUND_WEBHOOK_SECRET,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* a non-JSON body is a failure the caller reports by status */
  }
  return { ok: res.ok, status: res.status, body };
}

/** One hand-off to the platform. Only an explicit `accept:false` is final; everything else retries. */
async function deliverOnce(env: Env, envelope: Envelope, bytes: Uint8Array): Promise<Outcome> {
  let begin;
  try {
    begin = await callWebhook(env, 'inbound_begin', { ...envelope });
  } catch (err) {
    return { kind: 'retry', reason: `inbound_begin unreachable: ${String(err)}` };
  }
  if (begin.ok && begin.body.accept === false) return { kind: 'no_such_recipient' };
  if (!begin.ok || begin.body.accept !== true) {
    return { kind: 'retry', reason: `inbound_begin HTTP ${begin.status}` };
  }

  const uploadUrl = String(begin.body.upload_url || '');
  const storagePath = String(begin.body.storage_path || '');
  if (!uploadUrl || !storagePath) return { kind: 'retry', reason: 'inbound_begin gave no upload target' };

  try {
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'message/rfc822' },
      body: bytes,
    });
    if (!put.ok) return { kind: 'retry', reason: `raw upload HTTP ${put.status}` };
  } catch (err) {
    return { kind: 'retry', reason: `raw upload failed: ${String(err)}` };
  }

  try {
    const stored = await callWebhook(env, 'inbound_stored', { ...envelope, storage_path: storagePath });
    if (stored.ok) return { kind: 'delivered' };
    return { kind: 'retry', reason: `inbound_stored HTTP ${stored.status}` };
  } catch (err) {
    return { kind: 'retry', reason: `inbound_stored unreachable: ${String(err)}` };
  }
}

async function deliverWithRetries(env: Env, envelope: Envelope, bytes: Uint8Array): Promise<Outcome> {
  let last: Outcome = { kind: 'retry', reason: 'not attempted' };
  for (let i = 0; i < INLINE_ATTEMPTS; i++) {
    if (INLINE_BACKOFF_MS[i]) await new Promise((r) => setTimeout(r, INLINE_BACKOFF_MS[i]));
    last = await deliverOnce(env, envelope, bytes);
    if (last.kind !== 'retry') return last;
    console.warn(`delivery attempt ${i + 1} failed: ${last.reason}`);
  }
  return last;
}

function envelopeToMetadata(e: Envelope): Record<string, string> {
  return {
    from: e.from,
    to: e.to,
    message_id: e.message_id ?? '',
    subject: encodeURIComponent((e.subject ?? '').slice(0, 300)),
    size: String(e.size),
  };
}

function envelopeFromMetadata(m: Record<string, string>): Envelope {
  let subject: string | null = null;
  try {
    subject = m.subject ? decodeURIComponent(m.subject) : null;
  } catch {
    subject = null;
  }
  return {
    from: m.from ?? '',
    to: m.to ?? '',
    message_id: m.message_id || null,
    subject,
    size: Number(m.size) || 0,
  };
}

export default {
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    // 1. Domain. The only thing this Worker is allowed to know about our addressing.
    const recipient = (message.to || '').toLowerCase().trim();
    const domain = recipient.split('@')[1] || '';
    if (!env.RECEIVING_DOMAIN || domain !== env.RECEIVING_DOMAIN.toLowerCase()) {
      message.setReject('Mailbox unavailable');
      return;
    }

    // 2. Size.
    if (message.rawSize > MAX_MESSAGE_BYTES) {
      message.setReject('Message too large');
      return;
    }

    const envelope: Envelope = {
      from: message.from,
      to: message.to,
      message_id: message.headers.get('message-id'),
      subject: message.headers.get('subject'),
      size: message.rawSize,
    };

    // 3. Read once. The raw stream cannot be replayed, and every retry needs the bytes.
    const bytes = new Uint8Array(await new Response(message.raw).arrayBuffer());

    // 4. Spool before anything can fail. From here on, a platform outage delays mail; it never loses it.
    const spoolKey = `${SPOOL_PREFIX}${Date.now()}-${crypto.randomUUID()}.eml`;
    let spooled = false;
    try {
      await env.SPOOL.put(spoolKey, bytes, { customMetadata: envelopeToMetadata(envelope) });
      spooled = true;
    } catch (err) {
      console.error('spool write failed', err);
    }

    // 5. Hand off. Parsing, auth/loop/dupe gates and tenancy all happen in email-webhooks.
    const outcome = await deliverWithRetries(env, envelope, bytes);

    if (outcome.kind === 'no_such_recipient') {
      if (spooled) await env.SPOOL.delete(spoolKey);
      // Uninformative on purpose — a descriptive bounce is an address-enumeration oracle.
      message.setReject('Mailbox unavailable');
      return;
    }
    if (outcome.kind === 'delivered') {
      if (spooled) await env.SPOOL.delete(spoolKey);
      return;
    }

    // Still failing. Accept the message: the spool and the scheduled handler own it now.
    if (spooled) {
      console.warn(`spooled for retry: ${spoolKey} (${outcome.reason})`);
      return;
    }
    // Neither the platform nor R2 could take it — the only case left where refusing beats a silent drop.
    console.error(`could not spool or deliver: ${outcome.reason}`);
    message.setReject('Temporary failure, please retry');
  },

  /** Re-delivers spooled messages, oldest first. A message leaves the spool only once the platform has it. */
  async scheduled(_event: unknown, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil((async () => {
      const listed = await env.SPOOL.list({ prefix: SPOOL_PREFIX, limit: 100, include: ['customMetadata'] });
      const batch = listed.objects
        .sort((a, b) => a.uploaded.getTime() - b.uploaded.getTime())
        .slice(0, SCHEDULED_BATCH);
      for (const item of batch) {
        const obj = await env.SPOOL.get(item.key);
        if (!obj) continue;
        const envelope = envelopeFromMetadata(obj.customMetadata ?? {});
        const bytes = new Uint8Array(await obj.arrayBuffer());
        const outcome = await deliverOnce(env, envelope, bytes);
        if (outcome.kind === 'retry') {
          console.warn(`spool retry failed for ${item.key}: ${outcome.reason}`);
          continue;
        }
        // An unknown recipient here was accepted earlier while the platform was down; it is logged
        // by email-webhooks as rejected_unknown_address and has nowhere else to go.
        await env.SPOOL.delete(item.key);
      }
    })());
  },
};
