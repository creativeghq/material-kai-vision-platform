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
 *   3. Compose the built-in HTML, or render the workspace's assigned quote template when it
 *      has one (Email Marketing → Templates → Use for → Quote emails), + dispatch via email-api.
 *
 * Sender (from:) is resolved by email-api from email_settings.
 */
import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';
import { escapeHtml } from '../_shared/html.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { resolveDocumentEmailTemplate, withAllVars } from '../_shared/document-email-template.ts';

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
    .select('id, user_id, workspace_id, name, quote_number, status, currency, grand_total, expires_at, public_share_enabled, public_share_token, customer_company_id, customer_contact_id')
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

  // Optional per-workspace override of the body. Null (the default) sends the built-in HTML
  // above unchanged. The share link is minted BEFORE this either way, so a template can address
  // `{{view_url}}` — and the assignment guard refuses a quote template that omits it, because a
  // quote email whose only job is to open the quote is useless without the link.
  const templateSlug = await resolveDocumentEmailTemplate(supabase, quote.workspace_id, 'quote');
  const { data: qfs } = quote.workspace_id
    ? await supabase.from('finance_settings').select('business_name').eq('workspace_id', quote.workspace_id).maybeSingle()
    : { data: null };
  const templateVars = templateSlug
    ? withAllVars('quote', {
        quote_title: title,
        quote_number: quote.quote_number,
        customer_name: recipientName,
        sender_name: (qfs as { business_name?: string } | null)?.business_name ?? '',
        total,
        currency: quote.currency || 'EUR',
        expires_at: quote.expires_at,
        view_url: viewUrl,
        message: body.message?.trim() || '',
      })
    : undefined;

  try {
    const { data: dispatch, error: dErr } = await supabase.functions.invoke('email-api', {
      body: {
        action: 'send',
        to: recipient,
        subject,
        html,
        ...(templateSlug ? { templateSlug, variables: templateVars } : {}),
        emailType: 'transactional',
        tags: { feature: 'quotes', quote_id: quote.id },
        workspace_id: quote.workspace_id ?? undefined,
        // A quote is tenant business mail to the tenant's customer — it MUST go from the
        // workspace's own BYOK Resend, never the shared platform domain. email-api 503s
        // (code=workspace_sender_required) when the workspace hasn't configured its sender;
        // the operator's root workspace is exempt (sends from the platform default).
        requireWorkspaceSender: true,
      },
    });
    if (dErr || !dispatch?.success) {
      return json({ success: false, error: dErr?.message || dispatch?.error || 'email-api dispatch failed' }, 502);
    }
  } catch (err) {
    return json({ success: false, error: err instanceof Error ? err.message : 'send failed' }, 500);
  }

  // Flows — a quote was emailed to its customer (enables "3 days after sending, follow up"
  // style automations). Best-effort; never affect the send result.
  try {
    await emitFlowEvent('quote_sent', {
      type: 'quote_sent',
      workspace_id: quote.workspace_id ?? null,
      user_id: quote.user_id,
      quote_id: quote.id,
      quote_number: quote.quote_number ?? null,
      quote_name: quote.name ?? null,
      grand_total: quote.grand_total ?? null,
      currency: quote.currency ?? null,
      customer_email: recipient,
      customer_name: recipientName,
      view_url: viewUrl,
      title: `Quote sent: ${quote.quote_number || quote.name || quote.id}`,
      body: `Quote ${quote.quote_number || quote.name || ''} was emailed to ${recipientName || recipient}.`,
      action_url: `/quotes/${quote.id}`,
    });
  } catch { /* best-effort */ }

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
  const esc = escapeHtml; // was a local `& < >`-only escaper (attribute-unsafe); now the shared full escaper
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
