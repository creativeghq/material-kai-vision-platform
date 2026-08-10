/**
 * Inbound Email Worker (Cloudflare Email Routing) — issue #342, §1.
 *
 * Mail for the receiving domain arrives here, gets stored as a raw `.eml` in private Supabase
 * Storage, and is handed to the `email-webhooks` edge function for routing.
 *
 * ── THE ONE RULE ────────────────────────────────────────────────────────────────────────────
 * This Worker resolves NO TENANCY. It never looks up a workspace, a user, an address row or a
 * thread, and it holds no database credential. A Cloudflare Worker lives outside this repo's
 * enforcement — no semgrep ruleset, no `check_security_invariants()`, no typecheck, no review
 * path — so every tenancy decision stays in the edge function, where invariant 1 is actually
 * enforced. `tests/security/inbound-email-isolation.test.ts` greps this file and fails the build
 * if `workspace_id` or a `user_email_addresses` lookup ever appears in it.
 *
 * Unknown recipients still get `setReject()` at SMTP time — but the Worker does not decide that.
 * It ASKS (`inbound_begin`) and relays the verdict. Knowing which addresses exist is a tenancy
 * fact; relaying a boolean is not.
 *
 * It also holds no service-role key. `inbound_begin` returns a short-lived signed upload URL
 * scoped to one object path, so the Worker's blast radius is "can upload one email" rather than
 * "full database access".
 *
 * Flow per message:
 *   1. recipient domain check          → setReject on anything else (cheap, no network)
 *   2. size cap                        → setReject (Cloudflare's own ceiling is 25 MiB)
 *   3. POST inbound_begin              → { accept, upload_url, storage_path } | { accept: false }
 *   4. PUT the raw stream to upload_url
 *   5. POST inbound_stored             → the edge function parses, gates and routes it
 */

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

interface Env {
  /** The domain this Worker accepts mail for, e.g. "mail.materialshub.gr". */
  RECEIVING_DOMAIN: string;
  /** Absolute URL of the email-webhooks edge function. */
  WEBHOOK_URL: string;
  /** Shared secret; the edge function fails closed when it is unset on either side. */
  INBOUND_WEBHOOK_SECRET: string;
}

/**
 * Cap below Cloudflare's 25 MiB inbound ceiling. Rejecting at SMTP time is cheaper than storing
 * a message we would refuse later, and the sender gets a real error instead of silence.
 */
const MAX_MESSAGE_BYTES = 20 * 1024 * 1024;

/** Envelope facts only — no interpretation, no lookup. */
function envelope(message: ForwardableEmailMessage) {
  return {
    from: message.from,
    to: message.to,
    message_id: message.headers.get('message-id'),
    subject: message.headers.get('subject'),
    size: message.rawSize,
  };
}

async function callWebhook(
  env: Env,
  action: 'inbound_begin' | 'inbound_stored',
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> }> {
  const res = await fetch(env.WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // Presence of this header is what selects the inbound branch; its VALUE is what
      // authenticates. The edge function verifies before parsing anything.
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

    const env_ = envelope(message);

    // 3. Ask. The edge function decides whether this recipient exists and hands back a signed
    //    upload URL for exactly one object path.
    let begin;
    try {
      begin = await callWebhook(env, 'inbound_begin', env_);
    } catch (err) {
      // The platform is unreachable. A 4xx SMTP rejection asks the sending server to retry
      // later, which is what we want — never silently drop a customer's order.
      console.error('inbound_begin failed', err);
      message.setReject('Temporary failure, please retry');
      return;
    }

    if (!begin.ok || begin.body.accept !== true) {
      // Unknown recipient (or the platform refused it). Permanent, uninformative on purpose —
      // a descriptive bounce is an address-enumeration oracle.
      message.setReject('Mailbox unavailable');
      return;
    }

    const uploadUrl = String(begin.body.upload_url || '');
    const storagePath = String(begin.body.storage_path || '');
    if (!uploadUrl || !storagePath) {
      console.error('inbound_begin accepted without an upload target');
      message.setReject('Temporary failure, please retry');
      return;
    }

    // 4. Stream the raw MIME straight through. Never buffered here: a 20 MiB message would
    //    otherwise sit in Worker memory, and the bytes are of no interest to this Worker.
    const put = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': 'message/rfc822' },
      body: message.raw,
      // Required for a streaming request body.
      duplex: 'half',
    } as RequestInit);

    if (!put.ok) {
      console.error('raw .eml upload failed', put.status);
      message.setReject('Temporary failure, please retry');
      return;
    }

    // 5. Commit. Everything after this — MIME parsing, auth results, loop and dupe gates,
    //    workspace/thread/customer correlation — happens in the edge function.
    const stored = await callWebhook(env, 'inbound_stored', { ...env_, storage_path: storagePath });
    if (!stored.ok) {
      // The message IS stored, so the bytes are not lost; but nothing has routed it. Reject so
      // the sender retries rather than believing it was delivered. The orphaned object falls out
      // of the storage reference set and the cleanup cron reclaims it.
      console.error('inbound_stored failed', stored.status);
      message.setReject('Temporary failure, please retry');
    }
  },
};
