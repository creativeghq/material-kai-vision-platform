/**
 * send-quote-email
 *
 * Emails a quote to a recipient. Authorized for the quote OWNER or an admin.
 *
 * POST { quote_id, to?, message? }
 *   - to:      recipient email. If omitted, resolved from the quote's customer
 *              (crm company/contact) and finally the quote owner's profile.
 *   - message: optional free-text note included above the quote summary.
 *
 * Flow:
 *   1. Auth + owner/admin check.
 *   2. Ensure the public share link is enabled (mints a token if needed) so the
 *      email can deep-link to /q/:token — viewable without logging in.
 *   3. Compose inline HTML (no template dependency) + dispatch via email-api.
 *
 * Sender (from:) is resolved by email-api from email_settings.
 */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUBLIC_APP_URL = (Deno.env.get('PUBLIC_APP_URL') || 'https://app.materialshub.gr').replace(/\/$/, '');

interface Body {
  quote_id: string;
  to?: string;
  message?: string;
}

Deno.serve(withApiLogging('send-quote-email', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // --- Authenticate (JWT → user) ---
  const authHeader = req.headers.get('Authorization') || '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return json({ success: false, error: 'Missing Authorization header' }, 401);

  let userId: string | null = null;
  let isAdmin = false;
  try {
    const { data, error } = await supabase.auth.getUser(jwt);
    if (error || !data?.user?.id) return json({ success: false, error: 'Invalid session' }, 401);
    userId = data.user.id;
    const { data: prof } = await supabase
      .from('user_profiles')
      .select('roles!user_profiles_role_id_fkey(name)')
      .eq('user_id', userId)
      .maybeSingle();
    isAdmin = (prof as any)?.roles?.name === 'admin';
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'Auth failed' }, 401);
  }

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON' }, 400);
  }
  if (!body.quote_id) return json({ success: false, error: 'quote_id required' }, 400);

  // --- Load quote + authorize ---
  const { data: quote, error: qErr } = await supabase
    .from('quotes')
    .select(
      'id, user_id, workspace_id, name, quote_number, status, currency, grand_total, expires_at, ' +
      'public_share_enabled, public_share_token, customer_company_id, customer_contact_id',
    )
    .eq('id', body.quote_id)
    .single();
  if (qErr || !quote) return json({ success: false, error: 'Quote not found' }, 404);
  if (!(isAdmin || quote.user_id === userId)) {
    return json({ success: false, error: 'Not authorized for this quote' }, 403);
  }

  // --- Resolve recipient (explicit > customer > owner) ---
  let recipient = (body.to || '').trim();
  let recipientName: string | null = null;
  if (!recipient && quote.customer_company_id) {
    const { data: c } = await supabase
      .from('crm_companies').select('name, email').eq('id', quote.customer_company_id).maybeSingle();
    recipient = c?.email || '';
    recipientName = c?.name ?? null;
  }
  if (!recipient && quote.customer_contact_id) {
    const { data: c } = await supabase
      .from('crm_contacts').select('name, email').eq('id', quote.customer_contact_id).maybeSingle();
    recipient = c?.email || '';
    recipientName = c?.name ?? null;
  }
  if (!recipient) {
    const { data: owner } = await supabase
      .from('user_profiles').select('email, full_name').eq('user_id', quote.user_id).maybeSingle();
    recipient = owner?.email || '';
    recipientName = recipientName || owner?.full_name || null;
  }
  if (!recipient || !/.+@.+\..+/.test(recipient)) {
    return json({ success: false, error: 'No valid recipient email found. Pass one explicitly.' }, 422);
  }

  // --- Ensure a public share link exists ---
  let token = quote.public_share_token as string | null;
  if (!quote.public_share_enabled || !token) {
    token = token || crypto.randomUUID();
    const { error: shareErr } = await supabase
      .from('quotes')
      .update({
        public_share_enabled: true,
        public_share_token: token,
        public_share_created_at: quote.public_share_token ? undefined : new Date().toISOString(),
      })
      .eq('id', quote.id);
    if (shareErr) {
      // Abort before emailing — otherwise the email would carry a /q/{token} link that
      // never resolves because the token was never persisted/enabled.
      console.error('Failed to persist quote share token:', shareErr);
      return json({ success: false, error: 'Failed to enable share link; email not sent.' }, 500);
    }
  }
  const viewUrl = `${PUBLIC_APP_URL}/q/${token}`;

  // --- Compose + dispatch ---
  const title = quote.name || `Quote ${quote.quote_number || ''}`.trim() || 'Your quote';
  const total = quote.grand_total != null
    ? new Intl.NumberFormat('en-US', { style: 'currency', currency: quote.currency || 'EUR' }).format(Number(quote.grand_total))
    : null;
  const subject = `${title}${quote.quote_number ? ` (${quote.quote_number})` : ''}`;
  const html = buildHtml({
    title,
    quoteNumber: quote.quote_number,
    total,
    expiresAt: quote.expires_at,
    message: body.message?.trim() || '',
    recipientName,
    viewUrl,
  });

  try {
    const { data: dispatch, error: dErr } = await supabase.functions.invoke('email-api', {
      body: {
        action: 'send',
        to: recipient,
        subject,
        html,
        emailType: 'transactional',
        tags: { feature: 'quotes', quote_id: quote.id },
        workspace_id: quote.workspace_id ?? undefined,
      },
    });
    if (dErr || !dispatch?.success) {
      return json({ success: false, error: dErr?.message || dispatch?.error || 'email-api dispatch failed' }, 502);
    }
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'send failed' }, 500);
  }

  return json({ success: true, sent_to: recipient, view_url: viewUrl });
}));

function buildHtml(p: {
  title: string;
  quoteNumber?: string | null;
  total: string | null;
  expiresAt?: string | null;
  message: string;
  recipientName: string | null;
  viewUrl: string;
}): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const greeting = p.recipientName ? `Hi ${esc(p.recipientName.split(/\s+/)[0])},` : 'Hello,';
  const expires = p.expiresAt
    ? `<p style="margin:4px 0;color:#6b7280;font-size:13px;">Valid until ${new Date(p.expiresAt).toLocaleDateString()}</p>`
    : '';
  return `
  <div style="font-family:'Open Sans',Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#1a1a2e;">
    <p style="font-size:15px;">${greeting}</p>
    ${p.message ? `<p style="font-size:14px;white-space:pre-wrap;">${esc(p.message)}</p>` : ''}
    <p style="font-size:14px;">Here is your quote${p.quoteNumber ? ` <strong>${esc(p.quoteNumber)}</strong>` : ''}.</p>
    <div style="border:1px solid #e5e7eb;border-radius:12px;padding:18px;margin:18px 0;background:#fafafa;">
      <h2 style="margin:0 0 6px;font-size:18px;font-weight:600;">${esc(p.title)}</h2>
      ${p.total ? `<p style="margin:4px 0;font-size:20px;font-weight:700;">${esc(p.total)}</p>` : ''}
      ${expires}
    </div>
    <a href="${p.viewUrl}" style="display:inline-block;background:#7a2e52;color:#fff;text-decoration:none;padding:12px 22px;border-radius:9999px;font-weight:600;font-size:14px;">View your quote</a>
    <p style="margin-top:20px;font-size:12px;color:#9ca3af;">Or open this link: <a href="${p.viewUrl}" style="color:#7a2e52;">${p.viewUrl}</a></p>
  </div>`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
