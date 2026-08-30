/**
 * Email API Edge Function
 * Handles email sending, domain management, and analytics via Resend
 *
 * Authentication:
 * - Secret key (apikey header): Full admin access
 * - User JWT (Authorization header): User-specific operations
 */

import { createClient } from '@supabase/supabase-js';
import { renderReactEmailTemplate, renderTemplateWithVariables, generatePlainTextFromReactEmail } from '../_shared/react-email-renderer.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { assertEntitled } from '../_shared/entitlement.ts';
import { authenticate, isAdminAccess, userCanAccessWorkspace, listUserWorkspaceIds, isPlatformOperator } from '../_shared/auth.ts';
import { withApiLogging, HttpError } from '../_shared/api-logger.ts';
import { notConfiguredResponse } from '../_shared/api-provider-errors.ts';
import { resolveWorkspaceEmailSender, checkWorkspaceSendQuota } from '../_shared/email-sender.ts';
import { recordEmailEvent, DOCUMENT_ENTITY_TYPES } from '../_shared/document-events.ts';
import type { DocumentEntityType } from '../_shared/document-events.ts';

/**
 * Which document is this email about?
 *
 * Two accepted spellings, because the callers predate the delivery trail:
 *  - explicit `entityType` / `entityId` on the request body (new callers), and
 *  - the `tags` those callers already send — `{ feature:'invoice_email', invoice_id }`
 *    from finance-send-invoice-email, `{ feature:'quotes', quote_id }` from
 *    send-quote-email — so they gain a trail without being edited.
 *
 * An unrecognised type is dropped rather than passed through: it would violate
 * email_logs_entity_type_check and take down the send itself, which is a far
 * worse outcome than a missing trail.
 */
function resolveEntityLink(body: SendEmailRequest): { entityType: DocumentEntityType | null; entityId: string | null } {
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const known = new Set<string>(DOCUMENT_ENTITY_TYPES);

  let type = body.entityType ?? null;
  let id = body.entityId ?? null;

  if (!type || !id) {
    const tags = body.tags ?? {};
    // Ordered: the first tag that names a document wins. `statement` has no id of
    // its own on the send (it is party-scoped), so it is resolved by the caller.
    const TAG_KEYS: Array<[string, DocumentEntityType]> = [
      ['invoice_id', 'invoice'],
      ['quote_id', 'quote'],
      ['contract_id', 'contract'],
      ['order_id', 'order'],
      ['catalog_id', 'catalog'],
      ['property_id', 'property_listing'],
    ];
    for (const [key, mapped] of TAG_KEYS) {
      if (tags[key]) { type = mapped; id = tags[key]; break; }
    }
  }

  if (!type || !id || !known.has(type) || !UUID_RE.test(id)) return { entityType: null, entityId: null };
  return { entityType: type as DocumentEntityType, entityId: id };
}

const resendApiKey = () => Deno.env.get('RESEND_API_KEY') || '';

interface SendEmailRequest {
  to: string | string[];
  from?: string;
  fromName?: string;
  subject: string;
  html?: string;
  text?: string;
  /** Inbox preview snippet (preheader) — injected as a hidden preheader at the top of the HTML so it
   *  shows after the subject in the recipient's inbox list. Used by marketing campaigns. */
  previewText?: string;
  templateSlug?: string;
  /** Overrides the template's subject_template when a templateSlug is used (variables still rendered).
   *  Marketing campaigns pass the campaign's own subject_line here so it wins over the template subject. */
  subjectOverride?: string;
  variables?: Record<string, string>;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
  tags?: Record<string, string>;
  /**
   * Delivery trail (#delivery-trail): which document this email is about. Set
   * these and the invoice/quote/contract list shows sent → delivered → opened
   * for it. Falls back to the `tags` a caller already sends — see resolveEntityLink.
   */
  entityType?: DocumentEntityType;
  entityId?: string;
  /**
   * The send CLASS, declared rather than inferred from which function happened to call
   * (#229 §6 / #342). `agent_reply` is an Inbox/assistant reply on an email thread: it must
   * never borrow the finance sending identity, and `email_logs` records it so you can query
   * after the fact whether any invoice ever went out on an agent reply path.
   */
  emailType?: 'transactional' | 'marketing' | 'notification' | 'agent_reply';
  /**
   * Extra SMTP headers. Used by the Inbox email channel for RFC 5322 threading
   * (`In-Reply-To` / `References`) and the auto-reply markers an assistant reply carries.
   * Merged UNDER the platform's own headers so a caller cannot overwrite List-Unsubscribe.
   */
  headers?: Record<string, string>;
  /** Resend attachments — base64 content (no data: prefix). */
  attachments?: Array<{ filename: string; content: string }>;
  /** When set, the send uses this workspace's BYOK Resend key + sender (workspace_email_config)
   *  and counts against its platform-controlled daily cap. Omit for platform/system sends. */
  workspace_id?: string;
  /** Marketing sends: require the resolved sender to be the workspace's OWN Resend (BYOK) —
   *  NO platform-key fallback. Returns 503 (code=workspace_sender_required) when the workspace has
   *  no verified BYOK config, so the campaign never goes out from the platform domain. */
  requireWorkspaceSender?: boolean;
  /**
   * WHOSE email this is, for the log row only — never for sender selection or quota.
   *
   * `workspace_id` above means three things at once: which BYOK sender to use, whose daily cap to
   * count against, and who owns the log row. An operator flow emailing a tenant's customer from
   * the PLATFORM sender must not take the first two (that is the deliberate "platform-sent and
   * unmetered" path), and so it was passing none of them — leaving 144 of 146 `email_logs` rows
   * with no workspace. `email_logs_member_select` is
   * `workspace_id IS NOT NULL AND is_workspace_member(workspace_id)`, so those tenants could not
   * see their own customers' order and payment emails at all.
   *
   * Ignored when `workspace_id` is set; that one already carries the attribution.
   */
  attribution_workspace_id?: string;
}

async function sendViaResend(apiKey: string, payload: {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  cc?: string[];
  bcc?: string[];
  reply_to?: string;
  tags?: Array<{ name: string; value: string }>;
  attachments?: Array<{ filename: string; content: string }>;
  /** Custom SMTP headers (e.g. List-Unsubscribe for marketing compliance). */
  headers?: Record<string, string>;
}): Promise<string> {
  if (!apiKey) throw new HttpError(503, 'RESEND_API_KEY is not configured');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();

  if (!res.ok) {
    console.error('Resend API error response:', JSON.stringify({ status: res.status, data }));
    // 502: the upstream provider rejected or failed the send. Not a 500 — the fault is
    // Resend's (or the payload it refused), and a real bug in THIS function should stay
    // distinguishable from an upstream outage in api_usage_logs.
    throw new HttpError(502, data.message || data.name || `Resend API error: ${res.status} - ${JSON.stringify(data)}`);
  }

  return data.id as string;
}

// ── Email#1 marketing compliance: unsubscribe injection + suppression ─────────
async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Build the public one-click unsubscribe URL + List-Unsubscribe headers for a marketing send.
 *  The token is an HMAC of `workspace:lower(email)` under CRON_SECRET (verified by email-unsubscribe).
 *
 *  THROWS when CRON_SECRET is unset. It used to return null — "fail-open on the header,
 *  never block the send" (#387).
 *
 *  That reasoning is right for the wrong category of mail. For a TRANSACTIONAL email,
 *  never blocking the send is correct: the recipient asked for it and a missing header
 *  costs nothing. For a MARKETING send the safe failure is inverted — not sending is
 *  recoverable, sending bulk mail without a working opt-out is not.
 *
 *  What was actually lost was quieter than "no unsubscribe link". The body link fell
 *  back to a generic `${appBase}/unsubscribe`, so the email still LOOKED compliant; what
 *  vanished was the `List-Unsubscribe` / `List-Unsubscribe-Post` header pair, and the
 *  fallback link carried no workspace and no recipient token — so the page it opened
 *  could not tell who had clicked, and could not honour the request without the person
 *  re-entering their details. That is the exact friction one-click exists to remove.
 *
 *  RFC 8058 one-click unsubscribe has been a REQUIREMENT for bulk senders under the
 *  Gmail and Yahoo rules since February 2024, so this cost deliverability as well as
 *  compliance — and deliverability damage is not something a later fix undoes. */
async function buildUnsubscribe(
  workspaceId: string, email: string, fromEmail: string, campaignId?: string | null,
): Promise<{ url: string; headers: Record<string, string> }> {
  const secret = Deno.env.get('CRON_SECRET') || '';
  if (!secret) {
    throw new HttpError(
      503,
      'Cannot send marketing email: CRON_SECRET is unset, so the one-click unsubscribe ' +
      'token cannot be signed. Refusing rather than sending bulk mail with no working ' +
      'opt-out (RFC 8058).',
    );
  }
  const token = await hmacHex(`${workspaceId}:${email.toLowerCase()}`, secret);
  const base = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-unsubscribe`;
  const qs = `w=${encodeURIComponent(workspaceId)}&e=${encodeURIComponent(email)}&t=${token}` +
    (campaignId ? `&c=${encodeURIComponent(campaignId)}` : '');
  const url = `${base}?${qs}`;
  return {
    url,
    headers: {
      'List-Unsubscribe': `<mailto:${fromEmail}?subject=unsubscribe>, <${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * Map a Resend `last_event` (from GET /emails/{id}) onto the timestamp/status columns shared
 * by campaign_recipients + email_logs. `last_event` is the LATEST event only, so a click implies the
 * prior open+delivery — we backfill those. Existing timestamps are preserved (COALESCE-style) by the
 * caller. Returns null for events that don't change our stored state.
 */
type StatsPatch = { status?: string; delivered_at?: string; opened_at?: string; clicked_at?: string; bounced_at?: string; complained_at?: string };
function mapResendEventToPatch(lastEvent: string, nowISO: string): StatsPatch | null {
  switch (lastEvent) {
    case 'delivered':       return { status: 'sent', delivered_at: nowISO };
    case 'opened':          return { status: 'sent', delivered_at: nowISO, opened_at: nowISO };
    case 'clicked':         return { status: 'sent', delivered_at: nowISO, opened_at: nowISO, clicked_at: nowISO };
    case 'bounced':         return { status: 'bounced', bounced_at: nowISO };
    case 'complained':      return { status: 'complained', complained_at: nowISO };
    case 'failed':
    case 'suppressed':
    case 'canceled':        return { status: 'failed' };
    case 'sent':            return { status: 'sent' };
    default:                return null; // queued / scheduled / delivery_delayed → no terminal change
  }
}

// ── Resend Audience/Contacts sync ───────────────────────────────────────
// deno-lint-ignore no-explicit-any
type AnyClient = any;
const RESEND = 'https://api.resend.com';
const CONTACT_SYNC_CAP = 300; // max NEW contacts pushed per run (Resend rate-limit + edge time budget)

/** Resolve which Resend key to use for CONTACTS ops: the workspace's own BYOK, or — only for the
 *  operator ROOT workspace — the platform key. A non-root workspace without BYOK is NOT allowed
 *  (we must never sync a tenant's CRM into the shared platform audience). */
async function resolveContactsKey(supabase: AnyClient, workspaceId: string): Promise<{ apiKey: string | null; allowed: boolean }> {
  // The root exemption lives in the resolver now (#357 AE-1) — it was duplicated here and in the
  // send gate, and two copies of "who may use the platform key" is exactly the rule that must
  // never disagree with itself.
  const sender = await resolveWorkspaceEmailSender(supabase, workspaceId);
  if (sender.source === 'unconfigured') return { apiKey: null, allowed: false };
  return { apiKey: sender.apiKey || null, allowed: true };
}

/** Get-or-create the workspace's Resend audience id (validated; recreated if stale). Persists it on
 *  workspace_email_config (upsert — a root workspace may have no row yet). */
async function ensureAudience(supabase: AnyClient, workspaceId: string, apiKey: string): Promise<string> {
  const { data: cfg } = await supabase
    .from('workspace_email_config').select('resend_audience_id').eq('workspace_id', workspaceId).maybeSingle();
  let audienceId: string | null = cfg?.resend_audience_id || null;
  if (audienceId) {
    const check = await fetch(`${RESEND}/audiences/${audienceId}`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
    if (check.ok) return audienceId;
    audienceId = null; // stale (deleted in Resend) → recreate
  }
  const res = await fetch(`${RESEND}/audiences`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: `Materials Hub — ${workspaceId.slice(0, 8)}` }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.id) throw new HttpError(502, `Resend audience create failed: ${data?.message || res.status}`);
  audienceId = data.id as string;
  await supabase.from('workspace_email_config').upsert(
    { workspace_id: workspaceId, resend_audience_id: audienceId, updated_at: new Date().toISOString() },
    { onConflict: 'workspace_id' },
  );
  return audienceId;
}

async function listAudienceContacts(audienceId: string, apiKey: string): Promise<any[]> {
  const res = await fetch(`${RESEND}/audiences/${audienceId}/contacts`, { headers: { 'Authorization': `Bearer ${apiKey}` } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new HttpError(502, `Resend contacts list failed: ${data?.message || res.status}`);
  return (data?.data ?? []) as any[];
}

function splitName(name: string | null): { first?: string; last?: string } {
  const n = (name ?? '').trim();
  if (!n) return {};
  const parts = n.split(/\s+/);
  return { first: parts[0], last: parts.length > 1 ? parts.slice(1).join(' ') : undefined };
}

/** Push CRM contacts (workspace-scoped, with an email) into the Resend audience — additive only
 *  (never deletes; never re-adds an existing/unsubscribed contact). Returns a summary + stamps
 *  contacts_last_synced_at / count / error on workspace_email_config. */
async function syncCrmContactsToResend(supabase: AnyClient, workspaceId: string): Promise<{ audience_id: string; added: number; already: number; total_crm: number; capped: boolean }> {
  const { apiKey, allowed } = await resolveContactsKey(supabase, workspaceId);
  if (!allowed || !apiKey) throw new HttpError(503, 'workspace_sender_required');
  const audienceId = await ensureAudience(supabase, workspaceId, apiKey);

  const existing = new Set<string>();
  for (const c of await listAudienceContacts(audienceId, apiKey)) {
    if (c?.email) existing.add(String(c.email).trim().toLowerCase());
  }

  const { data: crm } = await supabase
    .from('crm_contacts').select('email, name')
    .eq('workspace_id', workspaceId).not('email', 'is', null).neq('email', '').limit(5000);

  const seen = new Set<string>();
  let added = 0, already = 0, capped = false;
  for (const c of crm ?? []) {
    const email = String(c.email).trim().toLowerCase();
    if (!email || seen.has(email)) continue;
    seen.add(email);
    if (existing.has(email)) { already++; continue; }
    if (added >= CONTACT_SYNC_CAP) { capped = true; break; }
    const { first, last } = splitName(c.name);
    const r = await fetch(`${RESEND}/audiences/${audienceId}/contacts`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, first_name: first, last_name: last, unsubscribed: false }),
    });
    if (r.ok) added++; else already++; // already-exists / transient → count as skipped, don't fail the run
  }

  await supabase.from('workspace_email_config').update({
    contacts_last_synced_at: new Date().toISOString(),
    contacts_last_sync_count: added,
    contacts_last_sync_error: null,
  }).eq('workspace_id', workspaceId);

  return { audience_id: audienceId, added, already, total_crm: seen.size, capped };
}

Deno.serve(withApiLogging('email-api', async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const auth = await authenticate(req);
    if (!auth.success) {
      throw new HttpError(401, auth.error || 'Unauthorized');
    }

    const user = auth.user;

    const url = new URL(req.url);
    const path = url.pathname.split('/').pop();
    const requestBody = req.method === 'POST' ? await req.json() : {};
    const action = requestBody.action || path;

    switch (action) {
      case 'send': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

        // Gate freeform send: a regular authenticated user must NOT be able to send arbitrary
        // email (any to/subject/html) from the platform's verified domain — that's spam/phishing
        // + domain-reputation risk. Server-to-server callers (Flows, quote/alert dispatchers) use
        // the admin secret → isAdminAccess; interactive callers must be an operator.
        if (!isAdminAccess(auth)) {
          const opAuth = await authenticate(req, { allowedRoles: ['admin', 'super_admin', 'owner'] });
          if (!opAuth.success) {
            return new Response(
              JSON.stringify({ success: false, error: 'Email send requires operator privileges' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }

        const body: SendEmailRequest = requestBody;

        // Reject a malformed recipient BEFORE any provider work. A `to` of the literal string
        // "null" is what a flow template renders when its recipient variable is absent (the
        // seeded Order-Dispatched flow does this whenever the customer has no email on file).
        // Handing that to Resend is a guaranteed rejection that surfaced as a 500 — an
        // our-fault status for what is really a bad request — and left the row stuck at
        // `queued` forever, retried on every re-run. 400 is the honest code, and api-logger
        // deliberately skips Sentry for 4xx so this stops looking like an outage.
        const addrOf = (raw: string) => {
          const m = raw.match(/<([^>]+)>\s*$/);   // accept "Name <a@b.com>" as well as "a@b.com"
          return (m ? m[1] : raw).trim();
        };
        const toList = (Array.isArray(body.to) ? body.to : [body.to])
          .map((t) => String(t ?? '').trim())
          .filter(Boolean);
        const toValid = toList.length > 0
          && toList.every((t) => /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(addrOf(t)));
        if (!toValid) {
          throw new HttpError(400, `Invalid recipient address: ${JSON.stringify(body.to ?? null)}`);
        }

        // body.workspace_id selects WHOSE Resend key + verified sender
        // domain is used. Without binding it to the caller, a workspace-A owner could
        // send from workspace B's verified domain — billed to B's key, counted against
        // B's quota, stamped to B. Require membership when a workspace_id is supplied
        // (server-to-server admin-secret callers are exempt — trusted system sends).
        // Attribution is bound to the caller on exactly the same terms as the sender. It is a
        // weaker capability — it names an owner rather than spending one's quota — but an
        // unbound one would let anyone drop a row into a stranger's email history.
        const attributionWorkspaceId = body.workspace_id ?? body.attribution_workspace_id ?? null;
        if (!isAdminAccess(auth) && attributionWorkspaceId) {
          if (!(await userCanAccessWorkspace(supabaseClient, auth.userId, attributionWorkspaceId))) {
            return new Response(
              JSON.stringify({ success: false, error: 'Not authorized for the requested workspace sender' }),
              { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }

        // Fixture tenants never reach a provider. tests/integration/_harness.ts runs against
        // PRODUCTION on purpose — that is how the suite covers real RLS — and on 2026-07-28 a
        // test flipping a delivery note to `issued` fired the seeded Order-Dispatched flow and
        // produced 134 attempted sends from the production domain.
        //
        // The recipient-validity guard above closed that specific case, because the address
        // rendered as the literal "null". The next one will not be malformed; it will be a valid
        // address belonging to a real person. This is the guard that does not depend on the
        // payload being obviously wrong.
        //
        // Reported as a 200 with `skipped`, not an error: the caller is a flow node doing exactly
        // what it should, and failing it would make every fixture-tenant test red for a reason
        // that is not a defect. (#292 item 1)
        if (body.workspace_id) {
          const { data: ws } = await supabaseClient
            .from('workspaces').select('is_fixture').eq('id', body.workspace_id).maybeSingle();
          if (ws?.is_fixture) {
            console.log(`[email-api] fixture workspace ${body.workspace_id} — send suppressed`);
            return new Response(
              JSON.stringify({
                success: true, skipped: 'fixture_workspace',
                detail: 'Workspace is flagged is_fixture; no message was sent to a provider.',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }

        // Resolve the Resend key + sender: the workspace's own BYOK config wins when set,
        // otherwise the platform key + global email_settings sender.
        const sender = await resolveWorkspaceEmailSender(supabaseClient, body.workspace_id);

        /**
         * BYOK gate, now for EVERY send rather than the ones that opted in (#357 AE-1).
         *
         * `resolveWorkspaceEmailSender` returns `source: 'unconfigured'` for a TENANT workspace
         * with incomplete BYOK — it no longer silently hands back the operator's key. The root
         * exemption moved in there too: it was written out twice in this file (here and in
         * `resolveContactsKey`), which is two copies of a rule that must not disagree.
         *
         * `requireWorkspaceSender` is now implied for every send with a workspace. It is still
         * accepted, and still means something narrower: STRICTLY the workspace's own key, which
         * excludes the operator's root workspace sending on the platform default.
         */
        if (sender.source === 'unconfigured') {
          return new Response(
            JSON.stringify({
              success: false,
              error: sender.reason
                ?? 'This workspace must configure its own Resend account (API key + verified sender) before sending email.',
              code: 'workspace_sender_required',
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        if (body.requireWorkspaceSender && sender.source !== 'workspace') {
          // Reached only by the operator's root workspace now — everything else is already
          // refused above. Kept because "this document must go out on the tenant's OWN domain"
          // is a real, narrower requirement for statements and purchase sheets.
          return new Response(
            JSON.stringify({
              success: false,
              error: "This send requires the workspace's own verified Resend sender.",
              code: 'workspace_sender_required',
            }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Pre-flight: require a Resend API key. Without this, sendViaResend()
        // throws deep inside the send pipeline and surfaces as an opaque 500.
        // Returning 503 with code='provider_not_configured' lets the frontend
        // surface a meaningful "ask your admin to set this" message.
        if (!sender.apiKey) {
          return notConfiguredResponse(
            {
              provider: 'Resend',
              envVarHint: 'Set RESEND_API_KEY on the host, paste it',
              settingsPath: '/admin/modules/email/settings → Keys (or your workspace email settings)',
            },
            corsHeaders,
          );
        }

        // Enforce the platform-controlled per-workspace daily send cap (no-op for system sends
        // that carry no workspace_id).
        const quota = await checkWorkspaceSendQuota(supabaseClient, body.workspace_id);
        if (!quota.allowed) {
          return new Response(
            JSON.stringify({
              success: false,
              error: `Daily email limit reached for this workspace (${quota.used}/${quota.limit}). Try again tomorrow.`,
              code: 'workspace_email_quota_exceeded',
              used: quota.used,
              limit: quota.limit,
            }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // ── Email#1: opt-out enforcement + compliance merge-vars ────────────────────
        // The suppression check used to be nested inside `if (body.emailType === 'marketing')`,
        // and `emailType` is CLIENT-SUPPLIED with a 'transactional' default — so omitting the
        // field skipped suppression entirely, and so did setting it. The one path the comment
        // claimed to close ("the freeform / multi-`to` bypass") is precisely the path that
        // declares itself transactional: SendEmailDialog sends free-text operator-composed mail
        // to a CRM contact as `transactional`, and so did the meeting-invite sender and the
        // real-estate buyer digest. (#366 BU-2)
        //
        // Suppression is now the DEFAULT and exemption is the allowlist below.
        let unsubHeaders: Record<string, string> | undefined;

        // Which sends may skip an opt-out, and it is NOT a caller-declared class.
        //
        // Two conditions, both required. The feature names a specific document-or-account send;
        // and the request must be server-to-server (`isAdminAccess` = service-role/admin-secret
        // bearer, which is how one edge function invokes another). That second half is what
        // makes this unforgeable rather than another honour system: a browser session holds a
        // user JWT and authenticates at `level: 'user'`, so nothing a page can send — tags
        // included — buys the exemption. The freeform CRM composer and the meeting invite are
        // browser sends, which is exactly why they are the two that were bypassing.
        //
        // What is NOT here is the point of the list. `buyer_digest` is a periodic push to a
        // saved search; `email_marketing` / `presentation_catalogs` / `automations` are
        // campaigns. Those are marketing whatever the caller calls them.
        const TRANSACTIONAL_FEATURES = new Set([
          'invoice_email',        // finance-send-invoice-email — a fiscal document
          'finance_statement',    // finance-send-statement — an account statement
          'finance_digest',       // finance-digest-aggregate — to the workspace's OWN staff
          'quotes',               // send-quote-email — a quote the customer asked for
          'contracts',            // contracts-api — a contract to sign
          'purchase_orders',      // generate-purchase-sheet-pdf — a PO to a supplier
          'crm_meeting_reminder', // crm-meeting-reminders — a meeting they already accepted
          'inbox_email_reply',    // inbox-api — a reply on a thread they wrote to
          'role_upgrade_requests',// role-upgrade-requests — an account notice
          'vendor_report',        // _shared/real-estate — to a property's own vendor
          // A one-time code the person just asked for, in order to reply. Suppressing it would
          // silently break the reply they are in the middle of (#357 AE-12).
          'inbox_thread_verification', // inbox-api — sender verification for a /i/:token link
        ]);
        const sendFeature = typeof body.tags?.feature === 'string' ? body.tags.feature : null;
        const suppressionExempt = isAdminAccess(auth)
          && sendFeature !== null
          && TRANSACTIONAL_FEATURES.has(sendFeature);

        // The suppression list is workspace-scoped, so it needs a workspace to scope to.
        // `attributionWorkspaceId` (already ownership-verified above) rather than
        // `body.workspace_id` alone: an operator flow mailing a tenant's customer from the
        // PLATFORM sender deliberately carries no `workspace_id`, and that customer's opt-out
        // still has to hold.
        if (!suppressionExempt && attributionWorkspaceId) {
          const recipients = [
            ...(Array.isArray(body.to) ? body.to : [body.to]),
            ...(body.cc ?? []),
            ...(body.bcc ?? []),
          ].filter((a): a is string => typeof a === 'string' && a.trim().length > 0);
          const lowered = [...new Set(recipients.map((a) => a.trim().toLowerCase()))];

          if (lowered.length > 0) {
            const { data: supp, error: suppError } = await supabaseClient
              .from('email_unsubscribes').select('email')
              .eq('workspace_id', attributionWorkspaceId)
              .in('email', lowered);
            // FAIL CLOSED. The old code destructured `{ data }` only, so a failed lookup left
            // `supp` undefined, `if (supp)` false, and the send went out — a compliance control
            // that switches itself off exactly when it cannot do its job. Refuse instead.
            if (suppError) {
              return new Response(
                JSON.stringify({
                  success: false,
                  error: 'Could not check the unsubscribe list; the send was refused rather than risk mailing an opted-out recipient.',
                  code: 'suppression_check_failed',
                }),
                { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
              );
            }
            const blocked = new Set((supp ?? []).map((r: { email: string }) => String(r.email).toLowerCase()));
            if (blocked.size > 0) {
              const keep = (a: string) => !blocked.has(a.trim().toLowerCase());
              const remainingTo = (Array.isArray(body.to) ? body.to : [body.to]).filter((a) => typeof a === 'string' && keep(a));
              // Every addressee opted out — nothing left to send to.
              if (remainingTo.length === 0) {
                return new Response(
                  JSON.stringify({ success: false, suppressed: true, code: 'recipient_unsubscribed' }),
                  { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
                );
              }
              // Partial: drop the opted-out addressees and send to the rest. Dropping is the
              // whole point — refusing the batch would punish the recipients who never opted out.
              body.to = remainingTo.length === 1 ? remainingTo[0] : remainingTo;
              if (body.cc) body.cc = body.cc.filter(keep);
              if (body.bcc) body.bcc = body.bcc.filter(keep);
            }
          }
        }

        if (body.emailType === 'marketing') {
          // Compliance is per-(workspace, recipient): the suppression list is workspace-scoped and the
          // unsubscribe token is minted for ONE address. So a marketing send MUST carry a workspace_id
          // and target exactly one recipient — otherwise the opt-out link would be minted for the wrong
          // person. Bulk marketing is fanned out one-recipient-per-send by campaign-processor, so this
          // never blocks that path.
          // Read AFTER the suppression filter above, which may have rewritten body.to. Minting the
          // opt-out token from a stale address would hand the recipient a link that unsubscribes
          // someone else.
          const primaryTo = Array.isArray(body.to) ? body.to[0] : body.to;
          if (!body.workspace_id) {
            throw new HttpError(400, 'A marketing email requires workspace_id (for suppression + a workspace-scoped unsubscribe link).');
          }
          if (Array.isArray(body.to) && body.to.length > 1) {
            throw new HttpError(400, 'A marketing email must target a single recipient — use campaign_recipients for bulk sends.');
          }
          if (!primaryTo) throw new HttpError(400, 'No recipient for the marketing send.');
          const fromForUnsub = body.from || sender.fromEmail || '';
          if (!fromForUnsub) {
            // The second silent path (#387), and it produced the identical outcome: no
            // from-address meant `built` was null, so the headers vanished and the body
            // link degraded to the anonymous fallback. `List-Unsubscribe` needs a
            // mailto, so there is nothing to build — and a marketing send with no
            // sender address should not be going out regardless.
            throw new HttpError(
              400,
              'Cannot send marketing email without a from-address: the List-Unsubscribe ' +
              'mailto cannot be built, and a bulk send needs a working opt-out.',
            );
          }
          const built = await buildUnsubscribe(
            body.workspace_id,
            String(primaryTo),
            fromForUnsub,
            (body.tags?.campaign_id as string | undefined) ?? null,
          );
          const appBase = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/+$/, '');
          const sysVars: Record<string, string> = {
            // No `|| ${appBase}/unsubscribe` fallback any more. A link that carries
            // neither workspace nor recipient token cannot identify who clicked, so it
            // reads as compliance while being unable to honour the request.
            unsubscribeUrl: built.url,
            companyName: sender.fromName || body.fromName || 'Materials Hub',
            currentYear: String(new Date().getFullYear()),
            platformUrl: appBase,
          };
          // System-computed compliance placeholders WIN over caller-supplied variables — a stale/forged
          // caller unsubscribeUrl must never replace the real HMAC opt-out link (which the header also uses).
          body.variables = { ...(body.variables || {}), ...sysVars };
          unsubHeaders = built.headers;
        }

        let htmlBody = body.html;
        let textBody = body.text;
        let subject = body.subject;
        let templateId: string | undefined;

        if (body.templateSlug) {
          const { data: template, error: templateError } = await supabaseClient
            .from('email_templates')
            .select('*')
            .eq('slug', body.templateSlug)
            .eq('is_active', true)
            .single();

          if (templateError || !template) {
            throw new HttpError(404, `Template not found: ${body.templateSlug}`);
          }

          templateId = template.id;
          const variables = body.variables || {};
          // NB: schema columns are subject_template / html_template / text_template
          // (this used to reference template.subject / .html_content / .text_content
          // which silently fell through to the caller-supplied html — confusing the
          // first send-email path that doesn't pre-render a fallback).
          // subjectOverride (campaign subject_line) wins over the template's own subject when supplied.
          subject = renderTemplateWithVariables(body.subjectOverride || template.subject_template || body.subject, variables);

          // react_code is executed via import() in the edge worker
          // (arbitrary JS + all platform secrets). Only ever run it for platform-authored
          // SYSTEM templates — never tenant-authored ones. The DB trigger already blocks
          // non-operators from writing react_code/is_system; this is defense-in-depth.
          if (template.react_code && template.is_system === true) {
            try {
              htmlBody = await renderReactEmailTemplate(template.react_code, variables);
              if (!textBody) {
                textBody = generatePlainTextFromReactEmail(htmlBody);
              }
            } catch (error) {
              console.error('Error rendering React Email template, falling back to HTML:', error);
              if (template.html_template) {
                htmlBody = renderTemplateWithVariables(template.html_template, variables);
              } else {
                throw new Error('Failed to render email template');
              }
            }
          } else if (template.html_template) {
            htmlBody = renderTemplateWithVariables(template.html_template, variables);
            if (template.text_template) {
              textBody = renderTemplateWithVariables(template.text_template, variables);
            }
          } else {
            throw new HttpError(400, 'Template has no content');
          }
        }

        if (!htmlBody && !textBody) {
          throw new HttpError(400, 'Either html or text body must be provided');
        }

        // Inbox preview (preheader): a hidden span at the very top of the HTML becomes the grey
        // preview line after the subject in most mail clients. Rendered through the same var pass so
        // {{firstName}} etc. work in the preview too.
        if (body.previewText && htmlBody) {
          const pv = renderTemplateWithVariables(body.previewText, body.variables || {})
            .replace(/</g, '&lt;').replace(/>/g, '&gt;');
          htmlBody = `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0">${pv}</div>` + htmlBody;
        }

        // Sender comes from the resolved BYOK/platform config (see resolveWorkspaceEmailSender).
        // We deliberately do NOT fall back to a bogus `noreply@example.com` — that domain is
        // unverified, so Resend rejects it (and a silent fallback masks a real misconfiguration).
        // If neither the request nor the resolved config supplies a real sender, fail loudly.
        const fromEmail = body.from || sender.fromEmail;
        if (!fromEmail) {
          // 503, matching `workspace_sender_required` above: the platform is not configured
          // to send, which is an operator problem to fix — not a malformed request and not a
          // crash in this handler.
          throw new HttpError(
            503,
            'No sender address configured. Set a workspace sender (workspace_email_config) or ' +
            '`default_from_email` in email_settings, or pass `from` in the request.',
          );
        }
        const fromName = body.fromName || sender.fromName;
        const fromAddress = fromName ? `${fromName} <${fromEmail}>` : fromEmail;
        // Reply-To default: the caller's explicit replyTo wins; otherwise the resolved sender's
        // configured Reply-To (workspace BYOK reply_to, or the platform default_reply_to). This
        // makes the workspace's Reply-To apply to every send automatically.
        const replyTo = body.replyTo || sender.replyTo || undefined;
        const toAddresses = Array.isArray(body.to) ? body.to : [body.to];

        // Delivery trail: accept the document link either as first-class fields
        // or from the `tags` the existing senders already pass (finance-send-invoice-email
        // sends `{ feature:'invoice_email', invoice_id }`), so those keep working
        // unchanged. Validated against the registry — an unknown type would fail
        // the email_logs CHECK and take the whole send down with it.
        const { entityType, entityId } = resolveEntityLink(body);

        // Get domain for tracking
        const domain = fromEmail.split('@')[1];
        const { data: domainData } = await supabaseClient
          .from('email_domains')
          .select('id')
          .eq('domain', domain)
          .single();

        // Create email log
        const { data: logData, error: logError } = await supabaseClient
          .from('email_logs')
          .insert({
            template_id: templateId,
            domain_id: domainData?.id,
            from_email: fromEmail,
            from_name: fromName,
            to_email: toAddresses[0],
            cc_emails: body.cc,
            bcc_emails: body.bcc,
            reply_to: replyTo,
            subject,
            html_body: htmlBody,
            text_body: textBody,
            status: 'queued',
            email_type: body.emailType || 'transactional',
            tags: body.tags || {},
            variables: body.variables || {},
            workspace_id: attributionWorkspaceId,
            // Delivery trail: which document this email is about. Real columns,
            // not a `tags` jsonb probe — the webhook fans provider events to
            // document_events off this pair, and a list page joins on it.
            // Both or neither (CHECK email_logs_entity_pair_check).
            entity_type: entityType,
            entity_id: entityId,
            // Server-to-server callers (Flows send_email, send-quote-email, price/
            // mention alerts, …) authenticate with the secret key and carry no user,
            // so auth.user is null. created_by is nullable for exactly these system
            // sends — guard it so the whole send doesn't 500 on `null.id`.
            created_by: user?.id ?? null,
          })
          .select()
          .single();

        // Guard BOTH the error and a null row: a successful insert whose RETURNING
        // row is hidden by RLS yields logData=null with no error. Without this guard
        // the code would send the email and then 500 on `logData.id` (reading 'id'
        // of null) — emailing the recipient but reporting failure to the caller.
        if (logError || !logData) {
          throw new HttpError(500, `Failed to create email log: ${logError?.message ?? 'insert returned no row (check email_logs RLS)'}`);
        }

        // Send via Resend
        const tags = Object.entries(body.tags || {}).map(([name, value]) => ({ name, value }));
        if (!tags.some(t => t.name === 'type')) {
          tags.push({ name: 'type', value: body.emailType || 'transactional' });
        }

        // The row was inserted as 'queued' a few lines up. If the send throws — no
        // RESEND_API_KEY, a Resend 4xx/5xx, a network fault — that row has to reach a
        // TERMINAL state here, because nothing else will ever touch it: there is no
        // drainer, no retry and no reaper for email_logs. Before this catch existed a
        // failed send left `status='queued'`, `error_message` NULL and
        // `updated_at == created_at` forever, and the caller's 500 was the only trace.
        // Two "Your order DN-2026-000x has shipped" mails sat like that for 16 days —
        // the customer was never told and nothing anywhere said so (audit 2026-08-13).
        // Explicit failure marker over an ambiguous empty state, per pipeline convention §1.
        let messageId: string;
        try {
          messageId = await sendViaResend(sender.apiKey, {
            from: fromAddress,
            to: toAddresses,
            subject,
            html: htmlBody,
            text: textBody,
            cc: body.cc,
            bcc: body.bcc,
            reply_to: replyTo,
            tags,
            attachments: body.attachments,
            // Caller headers first so the platform's own (List-Unsubscribe) always win a clash.
            headers: { ...(body.headers || {}), ...(unsubHeaders || {}) },
          });
        } catch (sendErr) {
          const reason = sendErr instanceof Error ? sendErr.message : String(sendErr);
          // Best-effort: a failure to record the failure must not mask the send failure.
          const { error: markErr } = await supabaseClient
            .from('email_logs')
            .update({ status: 'failed', error_message: reason })
            .eq('id', logData.id);
          if (markErr) {
            console.error(
              `[email-api] send failed AND could not mark log ${logData.id} failed: ${markErr.message}`,
            );
          }
          throw sendErr;
        }

        // Update log with Resend message ID
        await supabaseClient
          .from('email_logs')
          .update({ message_id: messageId, status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', logData.id);

        // Open the delivery trail. This is the ONLY event we can record ourselves —
        // delivered/opened/clicked/bounced all arrive later from the webhook. Without
        // it a document that was emailed but whose webhook never fired would read
        // 'not_sent', which is the silent-zero shape this platform keeps hitting:
        // the operator would re-send an invoice the customer already has.
        if (entityType && entityId) {
          await recordEmailEvent(supabaseClient, 'sent', {
            entityType,
            entityId,
            workspaceId: attributionWorkspaceId,
            // A send with no resolvable workspace still needs SOME tenancy or the
            // row is unreadable by anyone (document_events_scope_ck / RLS). Fall
            // back to the sender only when there is no workspace — setting both
            // would leave the trail readable to someone later removed from it.
            ownerUserId: attributionWorkspaceId ? null : (user?.id ?? null),
            actorEmail: toAddresses[0],
            actorUserId: user?.id ?? null,
            emailLogId: logData.id,
            metadata: { subject, email_type: body.emailType || 'transactional' },
          });
        }

        return new Response(
          JSON.stringify({ success: true, messageId, logId: logData.id }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync-campaign-stats': {
        // Pull delivery/open/click/bounce status for a workspace's campaign from its OWN
        // Resend account (GET /emails/{id}). Marketing sends go out under the tenant's Resend, so
        // their events never reach our webhook — this on-demand poll backfills the stats.
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
        const campaignId = String(requestBody.campaign_id ?? '');
        const wsId = String(requestBody.workspace_id ?? '');
        if (!campaignId || !wsId) throw new HttpError(400, 'campaign_id and workspace_id are required');

        // Tenancy: caller must belong to the workspace (admin-secret server callers exempt). 404 on
        // mismatch to avoid id enumeration.
        if (!isAdminAccess(auth)) {
          if (!auth.userId || !(await userCanAccessWorkspace(supabaseClient, auth.userId, wsId))) {
            throw new HttpError(404, 'not found');
          }
        }
        // Paid add-on (email-marketing, EUR 9/mo, its own Stripe product). The nav tile is
        // hidden without it, but this endpoint is reachable directly — nav is UX, the API
        // boundary is the security line. assertEntitled fails CLOSED.
        {
          const ent = await assertEntitled(supabaseClient, wsId, 'email-marketing');
          if (!ent.ok) return ent.response;
        }

        // The campaign must belong to the workspace.
        const { data: campaign } = await supabaseClient
          .from('campaigns').select('id, workspace_id').eq('id', campaignId).maybeSingle();
        if (!campaign || campaign.workspace_id !== wsId) throw new HttpError(404, 'not found');

        // Poll the workspace's OWN Resend. The operator ROOT workspace is exempt from BYOK — it
        // polls the platform Resend key (its campaigns went out under it).
        const statsSender = await resolveWorkspaceEmailSender(supabaseClient, wsId);
        if (statsSender.source !== 'workspace') {
          const { data: ws } = await supabaseClient.from('workspaces').select('is_root').eq('id', wsId).maybeSingle();
          if (ws?.is_root !== true) {
            return new Response(
              JSON.stringify({ success: false, code: 'workspace_sender_required', error: 'Configure your workspace Resend account to sync stats.' }),
              { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }
        if (!statsSender.apiKey) {
          return new Response(
            JSON.stringify({ success: false, code: 'provider_not_configured', error: 'No Resend API key configured.' }),
            { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        // Poll Resend once per dispatched recipient (GET /emails/{id}). That's rate-limited + costs
        // edge time, so it's capped per call — but the cap must NOT be silent: we count the total
        // dispatched and report whether coverage was partial so the UI can prompt another sync.
        const STATS_POLL_CAP = 300;
        const { count: totalDispatched } = await supabaseClient
          .from('campaign_recipients')
          .select('id', { count: 'exact', head: true })
          .eq('campaign_id', campaignId)
          .not('email_log_id', 'is', null);
        // Prioritize recipients whose outcome isn't terminal yet (no delivery/bounce/complaint), so
        // repeated syncs sweep forward through a large list instead of re-polling the same recent 300.
        const { data: recips } = await supabaseClient
          .from('campaign_recipients')
          .select('id, email_log_id, delivered_at, opened_at, clicked_at, bounced_at, complained_at')
          .eq('campaign_id', campaignId)
          .not('email_log_id', 'is', null)
          .is('delivered_at', null).is('bounced_at', null).is('complained_at', null)
          .order('sent_at', { ascending: false, nullsFirst: false })
          .limit(STATS_POLL_CAP);
        const logIds = [...new Set((recips ?? []).map((r: any) => r.email_log_id).filter(Boolean))];
        const { data: logs } = logIds.length
          ? await supabaseClient.from('email_logs').select('id, message_id').in('id', logIds)
          : { data: [] as any[] };
        const msgByLog = new Map((logs ?? []).map((l: any) => [l.id, l.message_id]));

        const nowISO = new Date().toISOString();
        let updated = 0;
        const byStatus: Record<string, number> = {};
        for (const r of recips ?? []) {
          const messageId = msgByLog.get(r.email_log_id);
          if (!messageId) continue;
          let ev = '';
          try {
            const res = await fetch(`https://api.resend.com/emails/${messageId}`, {
              headers: { 'Authorization': `Bearer ${statsSender.apiKey}` },
            });
            if (!res.ok) continue;
            const data = await res.json();
            ev = String(data?.last_event ?? '');
          } catch (_) { continue; }
          const patch = mapResendEventToPatch(ev, nowISO);
          if (!patch) continue;
          // Preserve existing timestamps (first-seen wins) so repeated syncs don't shift them.
          const recipPatch: Record<string, unknown> = { ...patch };
          for (const k of ['delivered_at', 'opened_at', 'clicked_at', 'bounced_at', 'complained_at'] as const) {
            if ((recipPatch as any)[k] && (r as any)[k]) (recipPatch as any)[k] = (r as any)[k];
          }
          // `updated++` and the per-status tally below report these as applied, so a discarded
          // result meant the sync claimed work it never did (#347 audit).
          const { error: recipErr } = await supabaseClient.from('campaign_recipients').update(recipPatch).eq('id', r.id);
          if (recipErr) { console.error('[email-api] recipient status update failed', r.id, recipErr); continue; }
          // Mirror to email_logs so the admin analytics surface reflects it too.
          const { error: logErr } = await supabaseClient.from('email_logs').update(patch).eq('id', r.email_log_id);
          if (logErr) console.error('[email-api] email_logs mirror failed', r.email_log_id, logErr);
          updated++;
          byStatus[ev] = (byStatus[ev] ?? 0) + 1;
        }

        // `capped` = there were more unresolved recipients than one call polls; the UI should offer
        // "Sync again" to continue. `synced === STATS_POLL_CAP` is the signal we hit the ceiling.
        const capped = (recips ?? []).length >= STATS_POLL_CAP;
        return new Response(
          JSON.stringify({
            success: true, updated, synced: (recips ?? []).length, by_status: byStatus,
            total_dispatched: totalDispatched ?? null, capped,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      case 'resend-contacts': {
        // List the workspace's Resend audience contacts + sync settings. Ensures the audience exists.
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
        const wsId = String(requestBody.workspace_id ?? '');
        if (!wsId) throw new HttpError(400, 'workspace_id is required');
        if (!isAdminAccess(auth)) {
          if (!auth.userId || !(await userCanAccessWorkspace(supabaseClient, auth.userId, wsId))) throw new HttpError(404, 'not found');
        }
        // Paid add-on (email-marketing, EUR 9/mo, its own Stripe product). The nav tile is
        // hidden without it, but this endpoint is reachable directly — nav is UX, the API
        // boundary is the security line. assertEntitled fails CLOSED.
        {
          const ent = await assertEntitled(supabaseClient, wsId, 'email-marketing');
          if (!ent.ok) return ent.response;
        }
        const { apiKey, allowed } = await resolveContactsKey(supabaseClient, wsId);
        const { data: cfg } = await supabaseClient
          .from('workspace_email_config')
          .select('contacts_auto_sync, contacts_last_synced_at, contacts_last_sync_count, contacts_last_sync_error, resend_audience_id')
          .eq('workspace_id', wsId).maybeSingle();
        if (!allowed || !apiKey) {
          // Not configured to sync (non-root tenant without BYOK). Return settings so the UI can
          // render the "configure Resend" state instead of erroring.
          return new Response(
            JSON.stringify({ success: true, allowed: false, contacts: [], auto_sync: cfg?.contacts_auto_sync ?? false, last_synced_at: cfg?.contacts_last_synced_at ?? null, last_sync_count: cfg?.contacts_last_sync_count ?? null }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
        const audienceId = await ensureAudience(supabaseClient, wsId, apiKey);
        const contacts = (await listAudienceContacts(audienceId, apiKey)).map((c: any) => ({
          id: c.id, email: c.email, first_name: c.first_name ?? null, last_name: c.last_name ?? null,
          unsubscribed: !!c.unsubscribed, created_at: c.created_at ?? null,
        }));
        return new Response(
          JSON.stringify({
            success: true, allowed: true, audience_id: audienceId, contacts,
            auto_sync: cfg?.contacts_auto_sync ?? false,
            last_synced_at: cfg?.contacts_last_synced_at ?? null,
            last_sync_count: cfg?.contacts_last_sync_count ?? null,
            last_sync_error: cfg?.contacts_last_sync_error ?? null,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      case 'sync-resend-contacts': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
        const wsId = String(requestBody.workspace_id ?? '');
        if (!wsId) throw new HttpError(400, 'workspace_id is required');
        if (!isAdminAccess(auth)) {
          if (!auth.userId || !(await userCanAccessWorkspace(supabaseClient, auth.userId, wsId))) throw new HttpError(404, 'not found');
        }
        // Paid add-on (email-marketing, EUR 9/mo, its own Stripe product). The nav tile is
        // hidden without it, but this endpoint is reachable directly — nav is UX, the API
        // boundary is the security line. assertEntitled fails CLOSED.
        {
          const ent = await assertEntitled(supabaseClient, wsId, 'email-marketing');
          if (!ent.ok) return ent.response;
        }
        try {
          const summary = await syncCrmContactsToResend(supabaseClient, wsId);
          return new Response(JSON.stringify({ success: true, ...summary }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } catch (e) {
          if (e instanceof HttpError && e.status === 503) {
            return new Response(
              JSON.stringify({ success: false, code: 'workspace_sender_required', error: 'Configure your workspace Resend account to sync contacts.' }),
              { status: 503, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          // Persist the error so the UI's "last sync" can surface it.
          await supabaseClient.from('workspace_email_config').update({ contacts_last_sync_error: (e as Error).message?.slice(0, 500) ?? 'sync failed' }).eq('workspace_id', wsId);
          throw e;
        }
      }

      case 'set-resend-contact-sync': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');
        const wsId = String(requestBody.workspace_id ?? '');
        if (!wsId) throw new HttpError(400, 'workspace_id is required');
        if (typeof requestBody.auto_sync !== 'boolean') throw new HttpError(400, 'auto_sync (boolean) is required');
        if (!isAdminAccess(auth)) {
          if (!auth.userId || !(await userCanAccessWorkspace(supabaseClient, auth.userId, wsId))) throw new HttpError(404, 'not found');
        }
        // Paid add-on (email-marketing, EUR 9/mo, its own Stripe product). The nav tile is
        // hidden without it, but this endpoint is reachable directly — nav is UX, the API
        // boundary is the security line. assertEntitled fails CLOSED.
        {
          const ent = await assertEntitled(supabaseClient, wsId, 'email-marketing');
          if (!ent.ok) return ent.response;
        }
        const { error: cfgErr } = await supabaseClient.from('workspace_email_config').upsert(
          { workspace_id: wsId, contacts_auto_sync: requestBody.auto_sync, updated_at: new Date().toISOString() },
          { onConflict: 'workspace_id' },
        );
        // The response below echoes the new value back as if it were stored (#347 audit).
        if (cfgErr) throw new HttpError(500, `Could not save the auto-sync setting: ${cfgErr.message}`);
        return new Response(JSON.stringify({ success: true, auto_sync: requestBody.auto_sync }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      case 'domains': {
        if (req.method !== 'GET' && req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

        const { data, error } = await supabaseClient
          .from('email_domains')
          .select('*')
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false });

        if (error) throw new Error(`Failed to fetch domains: ${error.message}`);

        return new Response(
          JSON.stringify({ success: true, domains: data }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'add-domain': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

        // `email_domains` is the PLATFORM's Resend registry — no workspace_id, and these routes
        // call Resend with the platform RESEND_API_KEY. `allowedRoles: ['admin','super_admin',
        // 'owner']` is NOT a platform gate: authenticate() matches allowedRoles against
        // workspace_members.role too, so any tenant's workspace owner passed and could add or
        // verify a domain on our own sending account — a domain-reputation and phishing
        // surface, and the same shape that had to be fixed in platform-secrets-admin.
        if (!isAdminAccess(auth) && !(await isPlatformOperator(supabaseClient, auth.userId))) {
          throw new HttpError(403, 'Platform operator access required');
        }

        const { domain } = requestBody;
        if (!domain) throw new HttpError(400, 'Domain is required');

        const { data, error } = await supabaseClient
          .from('email_domains')
          .insert({
            domain,
            verification_status: 'pending',
            created_by: user?.id ?? null,
          })
          .select()
          .single();

        if (error) throw new Error(`Failed to add domain: ${error.message}`);

        return new Response(
          JSON.stringify({
            success: true,
            domain: data,
            message: 'Domain added. Publish the DNS records shown at resend.com/domains, then use Check verification here — the status is read from Resend, never asserted.',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      /**
       * ASK RESEND. Never assert (#357 AE-11).
       *
       * This used to be `mark-domain-verified`: a button that wrote
       * `verification_status: 'verified'` because the operator said they had done the DNS work in
       * the Resend dashboard. Not a spoofing vector — Resend enforces verification at send time,
       * so a self-asserted flag cannot make an unverified domain deliverable — but the two states
       * diverge silently, and the screen then says Verified while every send fails upstream with
       * an opaque error.
       *
       * FAIL CLOSED, in the specific sense that matters here: when the provider cannot be reached,
       * the stored row is left EXACTLY as it was. Writing anything — 'pending', a fresh
       * provider_checked_at — would restate an unverified claim as a freshly confirmed one, which
       * is worse than the stale claim it replaced.
       */
      case 'verify-domain': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

        // `email_domains` is the PLATFORM's Resend registry — no workspace_id, and these routes
        // call Resend with the platform RESEND_API_KEY. `allowedRoles: ['admin','super_admin',
        // 'owner']` is NOT a platform gate: authenticate() matches allowedRoles against
        // workspace_members.role too, so any tenant's workspace owner passed and could add or
        // verify a domain on our own sending account — a domain-reputation and phishing
        // surface, and the same shape that had to be fixed in platform-secrets-admin.
        if (!isAdminAccess(auth) && !(await isPlatformOperator(supabaseClient, auth.userId))) {
          throw new HttpError(403, 'Platform operator access required');
        }

        const { domain } = requestBody;
        if (!domain) throw new HttpError(400, 'Domain is required');

        const resendKey = Deno.env.get('RESEND_API_KEY') || '';
        if (!resendKey) throw new HttpError(503, 'RESEND_API_KEY is not configured, so the domain status cannot be checked.');

        const listRes = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${resendKey}` },
        });
        const listJson = await listRes.json().catch(() => ({}));
        if (!listRes.ok) {
          throw new HttpError(502, listJson?.message || `Resend API error: ${listRes.status}`);
        }

        const known: Array<{ id: string; name: string; status: string }> = listJson?.data || [];
        const match = known.find((d) => String(d.name).toLowerCase() === String(domain).toLowerCase());
        // Resend not holding the domain at all is an ANSWER, not a failure: it means the DNS side
        // was never started. It is recorded, so the screen can say that rather than "pending".
        const providerStatus = match ? String(match.status) : 'not_found';
        const verified = providerStatus === 'verified';
        const localStatus = verified ? 'verified' : providerStatus === 'failure' ? 'failed' : 'pending';

        const { error } = await supabaseClient
          .from('email_domains')
          .update({
            verification_status: localStatus,
            is_verified: verified,
            verified_at: verified ? new Date().toISOString() : null,
            provider_status: providerStatus,
            provider_checked_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('domain', domain);

        if (error) throw new Error(`Failed to update domain: ${error.message}`);

        return new Response(
          JSON.stringify({
            success: true,
            verified,
            verification_status: localStatus,
            provider_status: providerStatus,
            message: verified
              ? `Resend reports ${domain} as verified.`
              : providerStatus === 'not_found'
                ? `Resend does not hold ${domain}. Add it at resend.com/domains and publish the DNS records it shows.`
                : `Resend reports ${domain} as "${providerStatus}". Finish the DNS records at resend.com/domains, then check again.`,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // The 'logs' action was removed. It ran
      // `select('*')` on email_logs with the SERVICE-ROLE client, no workspace
      // filter and no admin gate, so any signed-in user could read every
      // tenant's rendered email bodies (html_body, text_body, to_email,
      // bcc_emails, variables). It had no caller: the frontend reads email_logs
      // directly via emailService.getEmailLogs(), under RLS, which is correct.
      // Do not reintroduce it without `.in('workspace_id', await listUserWorkspaceIds(...))`.

      case 'analytics': {
        let fromDate: string | null = null;
        let toDate: string | null = null;

        if (req.method === 'GET') {
          fromDate = url.searchParams.get('fromDate');
          toDate = url.searchParams.get('toDate');
        } else if (req.method === 'POST') {
          const dateRange = requestBody.dateRange;
          if (dateRange) {
            fromDate = dateRange.start || null;
            toDate = dateRange.end || null;
          }
        }

        // DERIVED FROM email_logs, not from the `email_analytics` table.
        // `email_analytics` has ZERO writers — no code, no trigger, no cron (repo grep: the
        // generated types, this read, and reset-platform's truncate; pg_trigger and
        // pg_proc: nothing). So every rate here read 0% forever while email_logs actually
        // held 134 `failed` / 2 `queued` / 1 `delivered`. An operator watching this
        // dashboard would conclude email was healthy DURING A TOTAL OUTAGE — the exact
        // silent-zero shape the platform has probes for.
        // Deriving live rather than adding a writer, per the one-derivation rule: a cached
        // copy is a second source that can drift, and email_logs already carries every
        // metric as a timestamp column.
        // Also scoped to the caller's workspaces — this ran service-role and unfiltered,
        // the same shape as the `logs` action that was removed for leaking cross-tenant.
        let query = supabaseClient
          .from('email_logs')
          .select('created_at, sent_at, delivered_at, opened_at, clicked_at, bounced_at, complained_at');
        if (!isAdminAccess(auth)) {
          const wsIds = auth.userId ? await listUserWorkspaceIds(supabaseClient, auth.userId) : [];
          if (wsIds.length === 0) {
            return new Response(
              JSON.stringify({
                success: true, totalSent: 0, totalDelivered: 0, totalBounced: 0, totalComplained: 0,
                totalOpened: 0, totalClicked: 0, deliveryRate: 0, bounceRate: 0, complaintRate: 0,
                openRate: 0, clickRate: 0, dailyData: [],
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
          query = query.in('workspace_id', wsIds);
        }
        if (fromDate) query = query.gte('created_at', fromDate);
        if (toDate) query = query.lte('created_at', toDate);

        const { data, error } = await query.limit(50_000);
        if (error) throw new Error(`Failed to fetch analytics: ${error.message}`);

        type LogRow = {
          created_at: string | null; sent_at: string | null; delivered_at: string | null;
          opened_at: string | null; clicked_at: string | null; bounced_at: string | null;
          complained_at: string | null;
        };
        const rows = (data || []) as LogRow[];

        // A row that reached the provider counts as sent even if the send timestamp is
        // missing — otherwise a failed send vanishes from the denominator and the bounce
        // rate flatters itself.
        const totals = rows.reduce(
          (acc, r) => ({
            totalSent: acc.totalSent + 1,
            totalDelivered: acc.totalDelivered + (r.delivered_at ? 1 : 0),
            totalBounced: acc.totalBounced + (r.bounced_at ? 1 : 0),
            totalComplained: acc.totalComplained + (r.complained_at ? 1 : 0),
            totalOpened: acc.totalOpened + (r.opened_at ? 1 : 0),
            totalClicked: acc.totalClicked + (r.clicked_at ? 1 : 0),
          }),
          { totalSent: 0, totalDelivered: 0, totalBounced: 0, totalComplained: 0, totalOpened: 0, totalClicked: 0 }
        );

        // Per-day series, same field names the previous `email_analytics` rows used so the
        // dashboard's chart binding is unchanged.
        const byDay = new Map<string, { date: string; total_sent: number; total_delivered: number; total_bounced: number; total_complained: number; total_opened: number; total_clicked: number }>();
        for (const r of rows) {
          const day = (r.created_at ?? '').slice(0, 10);
          if (!day) continue;
          const e = byDay.get(day) ?? { date: day, total_sent: 0, total_delivered: 0, total_bounced: 0, total_complained: 0, total_opened: 0, total_clicked: 0 };
          e.total_sent += 1;
          if (r.delivered_at) e.total_delivered += 1;
          if (r.bounced_at) e.total_bounced += 1;
          if (r.complained_at) e.total_complained += 1;
          if (r.opened_at) e.total_opened += 1;
          if (r.clicked_at) e.total_clicked += 1;
          byDay.set(day, e);
        }
        const dailySeries = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

        const deliveryRate = totals.totalSent > 0 ? (totals.totalDelivered / totals.totalSent) * 100 : 0;
        const bounceRate = totals.totalSent > 0 ? (totals.totalBounced / totals.totalSent) * 100 : 0;
        const complaintRate = totals.totalSent > 0 ? (totals.totalComplained / totals.totalSent) * 100 : 0;
        const openRate = totals.totalDelivered > 0 ? (totals.totalOpened / totals.totalDelivered) * 100 : 0;
        const clickRate = totals.totalOpened > 0 ? (totals.totalClicked / totals.totalOpened) * 100 : 0;

        return new Response(
          JSON.stringify({
            success: true,
            totalSent: totals.totalSent,
            totalDelivered: totals.totalDelivered,
            totalBounced: totals.totalBounced,
            totalComplained: totals.totalComplained,
            totalOpened: totals.totalOpened,
            totalClicked: totals.totalClicked,
            deliveryRate: parseFloat(deliveryRate.toFixed(2)),
            bounceRate: parseFloat(bounceRate.toFixed(2)),
            complaintRate: parseFloat(complaintRate.toFixed(2)),
            openRate: parseFloat(openRate.toFixed(2)),
            clickRate: parseFloat(clickRate.toFixed(2)),
            dailyData: dailySeries,
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      case 'sync-domains': {
        if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed');

        // `email_domains` is the PLATFORM's Resend registry — no workspace_id, and these routes
        // call Resend with the platform RESEND_API_KEY. `allowedRoles: ['admin','super_admin',
        // 'owner']` is NOT a platform gate: authenticate() matches allowedRoles against
        // workspace_members.role too, so any tenant's workspace owner passed and could add or
        // verify a domain on our own sending account — a domain-reputation and phishing
        // surface, and the same shape that had to be fixed in platform-secrets-admin.
        if (!isAdminAccess(auth) && !(await isPlatformOperator(supabaseClient, auth.userId))) {
          throw new HttpError(403, 'Platform operator access required');
        }

        const apiKey = () => Deno.env.get('RESEND_API_KEY') || '';
        if (!apiKey()) throw new HttpError(503, 'RESEND_API_KEY is not configured');

        // Fetch domains from Resend
        const resendRes = await fetch('https://api.resend.com/domains', {
          headers: { 'Authorization': `Bearer ${apiKey()}` },
        });
        const resendData = await resendRes.json();

        if (!resendRes.ok) {
          // 502 for the same reason as the send path: an upstream failure is not a bug here.
          throw new HttpError(502, resendData.message || `Resend API error: ${resendRes.status}`);
        }

        const resendDomains: Array<{ id: string; name: string; status: string }> = resendData.data || [];
        let added = 0;
        let updated = 0;

        for (const rd of resendDomains) {
          const verificationStatus = rd.status === 'verified' ? 'verified' : rd.status === 'failed' ? 'failed' : 'pending';

          const { data: existing } = await supabaseClient
            .from('email_domains')
            .select('id, verification_status')
            .eq('domain', rd.name)
            .single();

          if (existing) {
            // Update status if changed
            // Provenance is stamped on every pass, not only when the verdict changed: "Resend
            // still says verified, asked a minute ago" and "nobody has asked since March" are
            // different facts, and only one of them is reassuring.
            const nowIso = new Date().toISOString();
            await supabaseClient
              .from('email_domains')
              .update({
                verification_status: verificationStatus,
                is_verified: verificationStatus === 'verified',
                provider_status: rd.status,
                provider_checked_at: nowIso,
                updated_at: nowIso,
              })
              .eq('id', existing.id);
            if (existing.verification_status !== verificationStatus) updated++;
          } else {
            // Insert new domain
            await supabaseClient
              .from('email_domains')
              .insert({
                domain: rd.name,
                verification_status: verificationStatus,
                is_verified: verificationStatus === 'verified',
                provider_status: rd.status,
                provider_checked_at: new Date().toISOString(),
                created_by: user?.id ?? null,
              });
            added++;
          }
        }

        return new Response(
          JSON.stringify({ success: true, added, updated, total: resendDomains.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      default:
        throw new HttpError(404, 'Invalid endpoint');
    }
  } catch (error) {
    // Typed client errors carry their own status and skip Sentry via the wrapper.
    if (error instanceof HttpError) throw error;
    console.error('Error:', error);
    // Top-level capture is handled by withApiLogging (returns 5xx → Sentry).
    const errMsg = error instanceof Error ? error.message : String(error);
    // Map a couple of legacy string-thrown client errors; everything else is a genuine
    // (likely transient/server) fault → 500 so it surfaces in Sentry and the client
    // knows it can retry, rather than being mislabeled as a permanent 4xx.
    const statusCode = errMsg.includes('Unauthorized') ? 401 : errMsg.includes('not allowed') ? 405 : 500;
    return new Response(
      JSON.stringify({ success: false, error: errMsg }),
      { status: statusCode, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}));
