/**
 * Email Webhooks Handler — two inbound directions, one function (merge rule).
 *
 * 1. **Resend delivery events** (the original surface): bounces, complaints, deliveries, opens,
 *    clicks. Svix-signed; verification is HMAC-SHA256 with RESEND_WEBHOOK_SECRET.
 * 2. **Inbound mail** (#342 §1): the Cloudflare Email Worker calls `inbound_begin` then
 *    `inbound_stored`, authenticated by INBOUND_WEBHOOK_SECRET. Everything tenancy-related —
 *    recipient resolution, the auth/loop/dupe gates, and the workspace/thread/customer
 *    correlation — happens HERE, never in the Worker.
 *
 * Both branches fail closed when their secret is unset.
 */

import { createClient } from '@supabase/supabase-js';
import type { DbClient } from '../_shared/supabase-client.ts';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { resolveSecret } from '../_shared/secrets.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEvent, emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';
import {
  RAW_EMAIL_BUCKET,
  alreadyProcessed,
  bareAddress,
  deliverToInbox,
  isAutomatedSender,
  isPlatformAddress,
  logInbound,
  parseAuthResults,
  parseRawEmail,
  resolveCustomer,
  resolveRecipient,
  workspaceOwner,
  type InboundEnvelope,
} from '../_shared/inbound-email.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature, x-inbound-secret',
};

// Map Resend event types to our internal event_type values
const RESEND_EVENT_MAP: Record<string, string> = {
  'email.sent': 'send',
  'email.delivered': 'delivery',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounce',
  'email.complained': 'complaint',
  'email.opened': 'open',
  'email.clicked': 'click',
};

interface ResendWebhookEvent {
  type: string;
  created_at: string;
  data: {
    email_id: string;
    from: string;
    to: string[];
    subject: string;
    bounce?: {
      message: string;
    };
    click?: {
      link: string;
    };
  };
}

/** Constant-time string compare — avoids a timing side-channel when checking the webhook signature. */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Verify Resend webhook signature (Svix-based HMAC-SHA256).
 * Returns true if the signature is valid.
 */
async function verifyResendSignature(
  rawBody: string,
  svixId: string,
  svixTimestamp: string,
  svixSignature: string,
  secret: string,
): Promise<boolean> {
  try {
    // Svix signs: "{svix-id}.{svix-timestamp}.{body}"
    const toSign = `${svixId}.${svixTimestamp}.${rawBody}`;

    // Secret is prefixed with "whsec_" and is base64-encoded
    const secretBytes = Uint8Array.from(
      atob(secret.replace(/^whsec_/, '')),
      (c) => c.charCodeAt(0),
    );

    const key = await crypto.subtle.importKey(
      'raw',
      secretBytes,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signatureBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(toSign));
    const computedSignature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)));

    // svix-signature may contain multiple space-separated "v1,<base64>" values
    const signatures = svixSignature.split(' ');
    return signatures.some((sig) => {
      const sigValue = sig.replace(/^v1,/, '');
      return timingSafeEqualStr(sigValue, computedSignature);
    });
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

const inboundJson = (body: Record<string, unknown>, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/**
 * Inbound branch (#342 §1). Two actions, called in order by the Cloudflare Email Worker:
 *
 *   `inbound_begin`  — does this recipient exist? If so, hand back a signed upload URL scoped to
 *                      one object path. This is what lets the Worker `setReject()` an unknown
 *                      address at SMTP time WITHOUT knowing which addresses exist: it asks, we
 *                      decide, it relays a boolean.
 *   `inbound_stored` — the raw `.eml` is in storage; parse it, run the gates, correlate, deliver.
 *
 * The Worker never receives a database credential, so the worst a leaked shared secret buys is
 * "upload an email and ask whether an address exists" — not database access.
 */
async function handleInbound(
  req: Request,
  suppliedSecret: string,
  db: DbClient,
): Promise<Response> {
  // Fail CLOSED. An unset secret must never fall through to processing unauthenticated mail
  // (invariant 6, mirrors stripe-webhooks and the Svix branch below).
  //
  // resolveSecret, NOT Deno.env.get: the Supabase edge runtime throws on Deno.env.set, so
  // secrets-bootstrap cannot put a platform_secrets value into env and a DB-configured secret
  // read through env is undefined for ever. The resolver queries the table directly and still
  // prefers a real deployment env var when one exists.
  const expected = (await resolveSecret(db, 'INBOUND_WEBHOOK_SECRET')).value || '';
  if (!expected) {
    console.error('INBOUND_WEBHOOK_SECRET not set — refusing to process inbound mail');
    return inboundJson({ error: 'Inbound email is not configured' }, 503);
  }
  if (!timingSafeEqualStr(suppliedSecret, expected)) {
    return inboundJson({ error: 'Invalid inbound secret' }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return inboundJson({ error: 'Invalid JSON body' }, 400);
  }

  const action = String(payload.action || '');
  const envelope: InboundEnvelope = {
    from: (payload.from as string) ?? null,
    to: (payload.to as string) ?? null,
    message_id: (payload.message_id as string) ?? null,
    subject: (payload.subject as string) ?? null,
    size: (payload.size as number) ?? null,
    storage_path: (payload.storage_path as string) ?? null,
  };

  // ── inbound_begin ────────────────────────────────────────────────────────────────────────
  if (action === 'inbound_begin') {
    const address = await resolveRecipient(db, envelope.to);
    if (!address) {
      await logInbound(db, { envelope, outcome: 'rejected_unknown_address' });
      // Uninformative on purpose — a descriptive refusal is an address-enumeration oracle.
      return inboundJson({ accept: false });
    }

    const now = new Date();
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
    // Timestamp-prefixed so a spoofed duplicate Message-ID can never overwrite a stored message.
    const storagePath = `inbound-email/${yyyy}/${mm}/${now.getTime()}-${crypto.randomUUID()}.eml`;

    const { data, error } = await db.storage
      .from(RAW_EMAIL_BUCKET)
      .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
      await logInbound(db, {
        workspaceId: address.workspace_id, envelope, matchedAddressId: address.id,
        outcome: 'error', error: `signed upload url failed: ${error?.message ?? 'unknown'}`,
      });
      return inboundJson({ error: 'Could not allocate storage' }, 503);
    }

    return inboundJson({ accept: true, upload_url: data.signedUrl, storage_path: storagePath });
  }

  // ── inbound_stored ───────────────────────────────────────────────────────────────────────
  if (action !== 'inbound_stored') {
    return inboundJson({ error: `unknown action: ${action}` }, 400);
  }
  if (!envelope.storage_path) {
    return inboundJson({ error: 'storage_path is required' }, 400);
  }

  // Cloudflare retries; a duplicate must not double-post into the thread.
  if (await alreadyProcessed(db, envelope.message_id)) {
    await logInbound(db, { envelope, outcome: 'duplicate' });
    return inboundJson({ ok: true, outcome: 'duplicate' });
  }

  // Re-resolve the recipient rather than trusting anything carried over from inbound_begin —
  // the tenant binding is derived here, on every call (invariant 1).
  const address = await resolveRecipient(db, envelope.to);
  if (!address) {
    await logInbound(db, { envelope, outcome: 'rejected_unknown_address' });
    return inboundJson({ ok: true, outcome: 'rejected_unknown_address' });
  }

  const { data: blob, error: dlErr } = await db.storage
    .from(RAW_EMAIL_BUCKET)
    .download(envelope.storage_path);
  if (dlErr || !blob) {
    await logInbound(db, {
      workspaceId: address.workspace_id, envelope, matchedAddressId: address.id,
      outcome: 'error', error: `download failed: ${dlErr?.message ?? 'no body'}`,
    });
    // 5xx so the Worker rejects and the sending server retries.
    return inboundJson({ error: 'Could not read the stored message' }, 503);
  }

  const parsed = await parseRawEmail(await blob.arrayBuffer());
  const auth = parseAuthResults(parsed.headers.get('authentication-results'));
  const fromAddress = parsed.from.address || bareAddress(envelope.from) || '';
  const toAddress = bareAddress(envelope.to) || address.full_address;

  const logBase = {
    workspaceId: address.workspace_id,
    envelope: { ...envelope, message_id: parsed.messageId ?? envelope.message_id },
    matchedAddressId: address.id,
    auth,
  };

  // Spoofing gate. DMARC fail means the sender is not who they claim, so the message is stored
  // and visible but never auto-replied to. DKIM pass alone is enough — forwarding breaks SPF,
  // and "use my own address" is a forwarding flow by design.
  const dmarcFailed = auth.dmarc === 'fail' && auth.dkim !== 'pass';
  if (dmarcFailed) {
    await logInbound(db, { ...logBase, outcome: 'quarantined_auth_fail' });
    return inboundJson({ ok: true, outcome: 'quarantined_auth_fail' });
  }

  // Loop gate: never auto-reply to an autoresponder, a mailing list, a bounce, or ourselves.
  const platformSender = await isPlatformAddress(db, fromAddress);
  const automated = isAutomatedSender(parsed.headers, fromAddress);
  const autoReplyAllowed = !automated && !platformSender;

  const owner = await workspaceOwner(db, address.workspace_id);
  const customer = await resolveCustomer(
    db, address.workspace_id, fromAddress, parsed.from.name, owner ?? address.user_id,
  );

  try {
    const { threadId } = await deliverToInbox(db, {
      address, parsed, customer, toAddress, fromAddress,
      storagePath: envelope.storage_path, autoReplyAllowed,
    });

    await logInbound(db, { ...logBase, outcome: 'routed_inbox', threadId });

    // Hand off to the single agent/intake chokepoint, exactly as zernio-webhook-handler does.
    // Best-effort: a failure here leaves a delivered thread for a human, never loses the mail.
    if (autoReplyAllowed) {
      await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/inbox-api`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'internal_agent_reply', thread_id: threadId }),
      }).catch(() => {});
    }

    return inboundJson({ ok: true, outcome: 'routed_inbox', thread_id: threadId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logInbound(db, { ...logBase, outcome: 'error', error: msg });
    // 5xx so the Worker rejects and the sender retries rather than believing it was delivered.
    return inboundJson({ error: msg }, 503);
  }
}

Deno.serve(withApiLogging('email-webhooks', async (req) => {
  await bootstrapForFunction();
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    // Branch discriminator. The header's PRESENCE selects inbound; its VALUE authenticates
    // (verified inside, before anything is parsed). Checked ahead of the Svix branch because
    // that one reads and signature-checks the body for a different sender entirely.
    const inboundSecret = req.headers.get('x-inbound-secret');
    if (inboundSecret !== null) {
      return await handleInbound(req, inboundSecret, supabaseClient);
    }

    // Read raw body (needed for signature verification)
    const rawBody = await req.text();

    // Verify Resend webhook signature if secret is configured
    const webhookSecret = Deno.env.get('RESEND_WEBHOOK_SECRET');
    if (webhookSecret) {
      const svixId = req.headers.get('svix-id') ?? '';
      const svixTimestamp = req.headers.get('svix-timestamp') ?? '';
      const svixSignature = req.headers.get('svix-signature') ?? '';

      if (!svixId || !svixTimestamp || !svixSignature) {
        console.warn('Missing Svix headers — rejecting webhook');
        return new Response(JSON.stringify({ error: 'Missing webhook signature headers' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const tsAge = Math.abs(Date.now() / 1000 - Number(svixTimestamp));
      if (isNaN(tsAge) || tsAge > 300) {
        console.warn(`Svix timestamp too old or invalid: age=${tsAge}s`);
        return new Response(JSON.stringify({ error: 'Webhook timestamp expired' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const valid = await verifyResendSignature(rawBody, svixId, svixTimestamp, svixSignature, webhookSecret);
      if (!valid) {
        console.warn('Invalid webhook signature');
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Fail CLOSED — an unset secret must never fall through to processing an unsigned
      // webhook. Mirrors stripe-webhooks.
      console.error('RESEND_WEBHOOK_SECRET not set — refusing to process unsigned webhook');
      return new Response(
        JSON.stringify({ error: 'Webhook signature verification not configured' }),
        { status: 503, headers: { 'Content-Type': 'application/json' } },
      );
    }

    let event: ResendWebhookEvent;
    try {
      event = JSON.parse(rawBody);
    } catch {
      // Malformed body is a permanent error — return 400 so Resend does NOT retry.
      return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const eventType = RESEND_EVENT_MAP[event.type];

    if (!eventType) {
      console.log(`Unhandled Resend event type: ${event.type}`);
      return new Response(JSON.stringify({ success: true, message: 'Event type not tracked' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const messageId = event.data.email_id;

    // Find the email log entry by Resend's email ID
    const { data: emailLog, error: logError } = await supabaseClient
      .from('email_logs')
      .select('id, workspace_id, to_email, tags')
      .eq('message_id', messageId)
      .single();

    if (logError || !emailLog) {
      console.warn('Email log not found for message ID:', messageId);
      // Return 200 so Resend doesn't retry — this can happen for emails sent outside the platform
      return new Response(JSON.stringify({ success: true, message: 'Email log not found' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build event record
    const eventRecord: Record<string, unknown> = {
      email_log_id: emailLog.id,
      message_id: messageId,
      event_type: eventType,
      timestamp: event.created_at,
      raw_event: event,
    };

    if (event.type === 'email.bounced' && event.data.bounce) {
      eventRecord.bounce_type = 'Permanent';
      eventRecord.diagnostic_code = event.data.bounce.message;
    }

    // Insert event record
    const { error: insertError } = await supabaseClient.from('email_events').insert(eventRecord);
    if (insertError) {
      // Transient DB fault — return 500 so Resend retries (4xx is treated as permanent).
      console.error('Failed to insert email_events row:', insertError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to persist email event' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // The DB trigger automatically updates email_logs status based on email_events inserts.
    // For delivery events we also update delivered_at directly as a safety net.
    if (event.type === 'email.delivered') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'delivered', delivered_at: event.created_at })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.bounced') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'bounced' })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.complained') {
      await supabaseClient
        .from('email_logs')
        .update({ status: 'complained' })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.opened') {
      await supabaseClient
        .from('email_logs')
        .update({ opened_at: event.created_at })
        .eq('id', emailLog.id);
    } else if (event.type === 'email.clicked') {
      await supabaseClient
        .from('email_logs')
        .update({ clicked_at: event.created_at })
        .eq('id', emailLog.id);
    }

    // Email#1 — a spam complaint or a PERMANENT (hard) bounce is a mandatory opt-out. Add the address
    // to this workspace's suppression list so no future marketing send reaches it. A transient/soft
    // bounce (full mailbox, temporary MTA defer) must NOT permanently suppress — those recover, and
    // over-suppressing silently deletes a valid address from all marketing with no path back. Resend's
    // bounce payload carries `type` ∈ Permanent | Transient | Undetermined; only Permanent suppresses.
    // Idempotent; never overwrites an earlier link-based opt-out. Best-effort.
    const bounceType = String((event.data as any)?.bounce?.type ?? '').toLowerCase();
    const isHardBounce = event.type === 'email.bounced' && bounceType === 'permanent';
    if (event.type === 'email.complained' || isHardBounce) {
      try {
        const wsId = (emailLog as any).workspace_id ?? null;
        const toEmail = (emailLog as any).to_email ?? (event.data.to?.[0] ?? null);
        if (wsId && toEmail) {
          await supabaseClient.from('email_unsubscribes').upsert({
            workspace_id: wsId,
            email: String(toEmail).toLowerCase(),
            source: event.type === 'email.complained' ? 'complaint' : 'bounce',
            unsubscribed_at: new Date().toISOString(),
          }, { onConflict: 'workspace_id,email', ignoreDuplicates: true });
        }
      } catch (e) { console.error('suppression upsert failed:', e); }
    }

    // Flows — surface actionable reputation events (bounce / spam complaint) as workspace-scoped
    // triggers so an operator can auto-suppress the contact or alert. Opens/clicks are intentionally
    // NOT emitted (high-volume; the campaign dashboard already aggregates them). Best-effort.
    if (event.type === 'email.bounced' || event.type === 'email.complained') {
      try {
        const tags = (emailLog as any).tags ?? {};
        const wsId = (emailLog as any).workspace_id ?? null;
        const toEmail = (emailLog as any).to_email ?? (event.data.to?.[0] ?? null);
        const isBounce = event.type === 'email.bounced';
        const eventType = isBounce ? 'email_bounced' : 'email_complained';
        const payload = {
          type: eventType,
          workspace_id: wsId,
          email_log_id: (emailLog as any).id,
          email: toEmail,
          campaign_id: tags.campaign_id ?? null,
          recipient_id: tags.recipient_id ?? null,
          reason: isBounce ? (event.data.bounce?.message ?? null) : 'marked as spam',
          title: isBounce ? `Email bounced: ${toEmail ?? 'recipient'}` : `Spam complaint: ${toEmail ?? 'recipient'}`,
          body: isBounce
            ? `${toEmail ?? 'A recipient'} bounced${event.data.bounce?.message ? ` (${event.data.bounce.message})` : ''}.`
            : `${toEmail ?? 'A recipient'} marked a campaign email as spam.`,
          action_url: '/email-marketing?tab=campaigns',
        };
        // Fan out per owner/admin so each event carries a CONCRETE user_id. The seeded
        // default flow ends in `create_notification`, which needs one — a workspace_id
        // alone produces a notification addressed to nobody. Without this fan-out a hard
        // bounce or a spam complaint on an invoice/quote email notifies nobody and the send
        // looks successful forever.
        if (wsId) {
          await emitFlowEventToWorkspaceRoles(wsId, ['owner', 'admin'], eventType,
            (recipientUserId) => ({ ...payload, user_id: recipientUserId }));
        } else {
          // No workspace on the log (transactional send outside a tenant) — emit unaddressed
          // so a custom flow can still filter on it.
          await emitFlowEvent(eventType, payload);
        }
      } catch { /* best-effort — never fail the webhook on a flow emit */ }
    }

    // Engagement events. HIGH-VOLUME: every open/click fires a metered flow run, so operators
    // should pair the trigger with a Filter node (e.g. a specific campaign_id). Still surfaced
    // because they enable drip / re-engagement automations. Best-effort.
    if (event.type === 'email.opened' || event.type === 'email.clicked') {
      try {
        const tags = (emailLog as any).tags ?? {};
        const isClick = event.type === 'email.clicked';
        await emitFlowEvent(isClick ? 'email_clicked' : 'email_opened', {
          type: isClick ? 'email_clicked' : 'email_opened',
          workspace_id: (emailLog as any).workspace_id ?? null,
          email_log_id: (emailLog as any).id,
          email: (emailLog as any).to_email ?? (event.data.to?.[0] ?? null),
          campaign_id: tags.campaign_id ?? null,
          recipient_id: tags.recipient_id ?? null,
          link: isClick ? (event.data.click?.link ?? null) : null,
          title: isClick ? 'Campaign link clicked' : 'Campaign email opened',
          body: `${(emailLog as any).to_email ?? 'A recipient'} ${isClick ? 'clicked a link in' : 'opened'} a campaign email.`,
          action_url: '/email-marketing?tab=campaigns',
        });
      } catch { /* best-effort */ }
    }

    return new Response(JSON.stringify({ success: true, event_type: eventType }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error processing Resend webhook:', error);
    // Parse/shape errors are handled inline above with explicit 400s. Anything reaching
    // here is an unexpected (likely transient) server-side fault — return 500 so Resend
    // retries rather than treating it as a permanent 4xx and giving up.
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
