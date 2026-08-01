/**
 * email-unsubscribe — PUBLIC one-click opt-out for marketing email (Email#1 compliance).
 *
 * Every marketing send (email-api, emailType='marketing') injects an {{unsubscribeUrl}} pointing
 * here AND sets a `List-Unsubscribe` / `List-Unsubscribe-Post` header pointing here, so Gmail/Apple
 * Mail show a native one-click unsubscribe. The link carries `?w=<workspace>&e=<email>&t=<token>`
 * where the token is an HMAC-SHA256 of `workspace:lower(email)` under CRON_SECRET — no token table.
 *
 *   • GET  → renders a human confirmation page with a POST button (so mail-client link *prefetch*
 *            can't unsubscribe someone by accident).
 *   • POST → RFC 8058 one-click path (mail client posts `List-Unsubscribe=One-Click`) OR the form
 *            button. Verifies the token, records the opt-out, renders a success page.
 *
 * No JWT (public). Registered with verify_jwt = false in config.toml.
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { bootstrapForFunction } from '../_shared/secrets-bootstrap.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { escapeHtml } from '../_shared/html.ts';

function html(status: number, title: string, body: string): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f6f5f0;color:#1c1b19;
display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.card{background:#fff;border:1px solid #e6e3da;border-radius:16px;padding:40px;max-width:440px;text-align:center;box-shadow:0 8px 30px rgba(0,0,0,.06)}
h1{font-size:20px;margin:0 0 12px}p{color:#57534e;line-height:1.5;margin:0 0 24px}
button{background:#6b6a3f;color:#fff;border:0;border-radius:999px;padding:12px 28px;font-size:15px;cursor:pointer}
button:hover{opacity:.9}.muted{font-size:13px;color:#a8a29e}
</style></head><body><div class="card">${body}</div></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

serve(withApiLogging('email-unsubscribe', async (req) => {
  await bootstrapForFunction();
  const url = new URL(req.url);
  const ws = (url.searchParams.get('w') || '').trim();
  const email = (url.searchParams.get('e') || '').trim();
  const token = (url.searchParams.get('t') || '').trim();

  if (!ws || !email || !token) {
    return html(400, 'Invalid link', '<h1>Invalid unsubscribe link</h1><p>This link is missing information. Please use the link from the most recent email.</p>');
  }

  const secret = Deno.env.get('CRON_SECRET') || '';
  if (!secret) {
    return html(503, 'Unavailable', '<h1>Temporarily unavailable</h1><p>Please try again shortly.</p>');
  }
  const expected = await hmacHex(`${ws}:${email.toLowerCase()}`, secret);
  if (!timingSafeEqual(token, expected)) {
    return html(400, 'Invalid link', '<h1>Invalid unsubscribe link</h1><p>This link has expired or is not valid. Please use the link from the most recent email.</p>');
  }

  // GET → confirmation page (a POST form) so link-prefetch can't opt someone out by accident.
  if (req.method === 'GET') {
    const esc = escapeHtml(email);
    return html(200, 'Unsubscribe',
      `<h1>Unsubscribe from marketing emails?</h1>
       <p><strong>${esc}</strong> will stop receiving marketing emails from this sender. Transactional messages (receipts, account notices) are unaffected.</p>
       <form method="POST"><button type="submit">Unsubscribe</button></form>
       <p class="muted" style="margin-top:16px">You can re-subscribe any time by contacting the sender.</p>`);
  }

  if (req.method === 'POST') {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    // `w` and `c` arrive from the query string. A malformed uuid makes Postgres reject the
    // whole statement (22P02) — and the old code discarded the result and rendered the green
    // confirmation on the next line regardless. A recipient was told the opt-out worked and
    // kept receiving marketing mail: the road to a spam complaint and, under CAN-SPAM/GDPR, a
    // compliance incident that nothing would have surfaced (email_unsubscribes had 0 rows).
    // (audit #306 finding 14)
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_RE.test(ws)) {
      console.error('[email-unsubscribe] malformed workspace id:', ws);
      return html(400, 'Invalid link', '<h1>This unsubscribe link is invalid</h1><p>Please use the link from the most recent email, or reply to the sender to be removed.</p>');
    }
    const campaignId = (url.searchParams.get('c') || '').trim();
    // Idempotent — a repeat opt-out is a no-op success.
    const { error: unsubErr } = await supabase.from('email_unsubscribes').upsert(
      {
        workspace_id: ws,
        email: email.toLowerCase(),
        source: (url.searchParams.get('src') || 'link'),
        // A malformed campaign id must not take the whole opt-out down with it — the opt-out
        // matters, the attribution does not.
        campaign_id: UUID_RE.test(campaignId) ? campaignId : null,
        unsubscribed_at: new Date().toISOString(),
      },
      { onConflict: 'workspace_id,email', ignoreDuplicates: false },
    );
    if (unsubErr) {
      console.error('[email-unsubscribe] opt-out NOT recorded:', unsubErr.message, 'ws:', ws);
      return html(500, 'Could not unsubscribe', '<h1>We could not record your request</h1><p>Nothing was changed. Please reply to the sender asking to be removed and they will action it manually.</p>');
    }
    return html(200, 'Unsubscribed', '<h1>You\'re unsubscribed</h1><p>You will no longer receive marketing emails from this sender.</p>');
  }

  return html(405, 'Method not allowed', '<h1>Method not allowed</h1>');
}));
