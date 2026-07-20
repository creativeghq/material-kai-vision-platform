/**
 * Public share lookup for quotes.
 *
 * POST /functions/v1/quote-public-share { token, event?, session_id? }
 *   → { quote: { ... } | null, pdf_url: signed-1h-url | null, not_found?: bool }
 *
 * Anonymous-friendly: the route accepts the project anon key in
 * Authorization: Bearer (Supabase enforces this at the gateway), then uses
 * the service role internally to bypass RLS. Only returns quotes where
 * `public_share_token` matches AND `public_share_enabled` is true. The token
 * is a cryptographically random uuid v4, so guessing is infeasible.
 *
 * Every successful lookup writes a `quote_analytics_events` row
 * (view_context='public') so admins can see who is opening the shared link.
 * Passing event:'download' logs a downloaded event instead of a view — the
 * public page calls this just before it opens the signed PDF URL.
 */

import { createClient } from '@supabase/supabase-js';
import { withApiLogging } from '../_shared/api-logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(withApiLogging('quote-public-share', async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { token, event, session_id, signer_name, signer_email } = await req.json().catch(() => ({}));

  if (!token || typeof token !== 'string' || token.length < 32) {
    return jsonResponse({ error: 'Invalid token' }, 400);
  }

  // Validate the token + that sharing is currently enabled.
  const { data: quote, error } = await supabase
    .from('quotes')
    .select(
      'id, name, quote_number, status, currency, subtotal, vat_rate, vat_amount, ' +
      'grand_total, extras_total, cash_discount_pct, expires_at, created_at, pdf_storage_path, ' +
      'public_share_enabled, customer_company_id, customer_contact_id, workspace_id',
    )
    .eq('public_share_token', token)
    .maybeSingle();

  if (error || !quote || !quote.public_share_enabled) {
    return jsonResponse({ quote: null, pdf_url: null, not_found: true });
  }

  // Fetch items (catalog + custom).
  const { data: rawItems } = await supabase
    .from('quote_items')
    .select(
      'id, product_id, quantity, selected_size, selected_color, unit_price, ' +
      'discounted_price, line_total, custom_product_name, custom_unit, room, ' +
      'dimensions, products ( name, sku )',
    )
    .eq('quote_id', quote.id)
    .order('added_at', { ascending: true });

  const items = (rawItems ?? []).map((it: any) => {
    const product = it.products;
    const isCustom = !product;
    return {
      id: it.id,
      name: isCustom ? (it.custom_product_name || 'Custom Item') : (product?.name || 'Product'),
      sku: isCustom ? null : (product?.sku ?? null),
      quantity: it.quantity,
      selected_size: it.selected_size ?? null,
      selected_color: it.selected_color ?? null,
      room: it.room ?? null,
      dimensions: it.dimensions ?? null,
      unit_price: it.unit_price != null ? Number(it.unit_price) : null,
      discounted_price: it.discounted_price != null ? Number(it.discounted_price) : null,
      line_total: it.line_total != null ? Number(it.line_total) : null,
    };
  });

  // ── Sign & Accept (e-sign + immutable audit trail, Blueprint #242 Phase 2b) ──
  // The client signs the estimate on the public page. We capture signer + IP + UA
  // + a content hash of exactly what was signed, flip the quote to accepted, and
  // return early. The page re-fetches (no event) to render the accepted state.
  if (event === 'accept') {
    if (!signer_name || typeof signer_name !== 'string' || signer_name.trim().length < 2) {
      return jsonResponse({ error: 'A signer name is required to accept.' }, 400);
    }
    const canonical = JSON.stringify({
      id: quote.id,
      grand_total: quote.grand_total,
      subtotal: quote.subtotal,
      items: (rawItems ?? []).map((it: any) => [it.id, it.line_total]),
    });
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
    const version_hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
    const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim()
      || req.headers.get('cf-connecting-ip') || null;

    // link the originating plan, if any
    const { data: plan } = await supabase.from('project_plans').select('id').eq('quote_id', quote.id).maybeSingle();

    const { error: apprErr } = await supabase.from('quote_approvals').insert({
      quote_id: quote.id,
      plan_id: plan?.id ?? null,
      signer_name: signer_name.trim(),
      signer_email: (typeof signer_email === 'string' && signer_email.trim()) ? signer_email.trim() : null,
      ip_address: ip,
      user_agent: req.headers.get('user-agent') ?? null,
      version_hash,
    });
    if (apprErr) return jsonResponse({ error: 'Failed to record approval' }, 500);

    if (quote.status !== 'accepted') {
      await supabase.from('quotes').update({ status: 'accepted', accepted_at: new Date().toISOString() }).eq('id', quote.id);
      if (plan?.id) await supabase.from('project_plans').update({ status: 'approved' }).eq('id', plan.id);
    }
    return jsonResponse({ ok: true, accepted: true, signed_at: new Date().toISOString() });
  }

  // Resolve a friendly bill-to name (no contact details exposed publicly) + the customer's
  // VAT-inclusive display preference (#227 — gross prices for retail/consumer customers).
  let client_name: string | null = null;
  let prices_vat_inclusive = false;
  if (quote.customer_company_id) {
    const { data: c } = await supabase
      .from('crm_companies').select('name, prices_vat_inclusive').eq('id', quote.customer_company_id).maybeSingle();
    client_name = c?.name ?? null;
    prices_vat_inclusive = !!c?.prices_vat_inclusive;
  } else if (quote.customer_contact_id) {
    const { data: c } = await supabase
      .from('crm_contacts').select('name, prices_vat_inclusive').eq('id', quote.customer_contact_id).maybeSingle();
    client_name = c?.name ?? null;
    prices_vat_inclusive = !!c?.prices_vat_inclusive;
  }

  // #177 white-label: render the public quote under the seller workspace's identity
  // (business name + logo + contact) instead of the platform default.
  let seller: any = null;
  if (quote.workspace_id) {
    const { data: fs } = await supabase
      .from('finance_settings')
      .select('business_name, business_logo_path, contact_website, contact_phone, contact_email, business_email, business_phone')
      .eq('workspace_id', quote.workspace_id)
      .maybeSingle();
    if (fs?.business_name) {
      let logo_url: string | null = null;
      if (fs.business_logo_path) {
        const { data: pub } = supabase.storage.from('generation-images').getPublicUrl(fs.business_logo_path);
        logo_url = pub?.publicUrl ?? null;
      }
      seller = {
        name: fs.business_name,
        logo_url,
        website: fs.contact_website ?? null,
        phone: fs.contact_phone ?? fs.business_phone ?? null,
        email: fs.contact_email ?? fs.business_email ?? null,
      };
    }
  }

  // Log the public event (best-effort — never block the response).
  const eventType = event === 'download' ? 'downloaded' : 'viewed';
  const sid = (typeof session_id === 'string' && session_id.length > 0)
    ? session_id
    : crypto.randomUUID();
  supabase
    .from('quote_analytics_events')
    .insert({
      event_type: eventType,
      view_context: 'public',
      quote_id: quote.id,
      user_id: null,
      session_id: sid,
      source_page: `/q/${token.slice(0, 8)}…`,
      metadata: {
        user_agent: req.headers.get('user-agent') ?? null,
        method: eventType === 'downloaded' ? 'public_pdf' : undefined,
      },
    })
    .then(() => {});

  // Fresh 1-hour signed URL for the server-generated PDF (if one exists).
  let pdf_url: string | null = null;
  if (quote.pdf_storage_path) {
    const { data: signed } = await supabase.storage
      .from('pdf-documents')
      .createSignedUrl(quote.pdf_storage_path, 60 * 60);
    pdf_url = signed?.signedUrl ?? null;
  }

  // Has an invoice / retail receipt been issued from this quote yet? (invoices.quote_id)
  // Surface it so the customer can grab the final document straight from the shared quote.
  let issued_document: any = null;
  {
    const { data: inv } = await supabase
      .from('invoices')
      .select('id, internal_number, legal_number, document_type, status, total, currency, issued_at, pdf_storage_path')
      .eq('quote_id', quote.id)
      .neq('status', 'void')
      .neq('status', 'draft')
      .order('issued_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (inv) {
      let doc_pdf_url: string | null = null;
      if (inv.pdf_storage_path) {
        const { data: s } = await supabase.storage.from('pdf-documents').createSignedUrl(inv.pdf_storage_path, 60 * 60);
        doc_pdf_url = s?.signedUrl ?? null;
      }
      issued_document = {
        kind: String(inv.document_type ?? '').startsWith('11') ? 'receipt' : 'invoice',
        number: inv.legal_number ?? inv.internal_number ?? '',
        status: inv.status,
        total: inv.total != null ? Number(inv.total) : null,
        currency: inv.currency ?? 'EUR',
        issued_at: inv.issued_at,
        pdf_url: doc_pdf_url,
      };
    }
  }

  // Pre-invoice (draft invoice auto-created when the quote was accepted). It carries its
  // own pay_token, so once the customer has signed we can offer "Pay now" straight from the
  // shared quote. Same trust level as the quote share token itself — this link is for them.
  // Only surfaced once there is still a balance to collect.
  let payable: any = null;
  {
    const { data: pre } = await supabase
      .from('invoices')
      .select('id, internal_number, currency, total, amount_due, deposit_pct, pay_token, pay_token_expires_at')
      .eq('quote_id', quote.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const notExpired = !pre?.pay_token_expires_at || new Date(pre.pay_token_expires_at) > new Date();
    if (pre?.pay_token && notExpired && Number(pre.amount_due ?? 0) > 0) {
      const total = Number(pre.total ?? 0);
      const due = Number(pre.amount_due ?? 0);
      const pct = pre.deposit_pct != null ? Number(pre.deposit_pct) : null;
      const untouched = due >= total - 0.005;
      payable = {
        pay_token: pre.pay_token,
        number: pre.internal_number ?? '',
        currency: pre.currency ?? 'EUR',
        total,
        amount_due: due,
        deposit_pct: pct,
        deposit_amount: pct && untouched ? Math.round(total * pct) / 100 : null,
      };
    }
  }

  // Latest signature (if accepted) — for the public "Accepted" banner.
  let signed_by: string | null = null;
  let signed_at: string | null = null;
  {
    const { data: appr } = await supabase
      .from('quote_approvals')
      .select('signer_name, signed_at')
      .eq('quote_id', quote.id)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (appr) { signed_by = appr.signer_name; signed_at = appr.signed_at; }
  }

  return jsonResponse({
    quote: {
      id: quote.id,
      name: quote.name,
      quote_number: quote.quote_number,
      status: quote.status,
      signed_by,
      signed_at,
      currency: quote.currency || 'EUR',
      subtotal: quote.subtotal != null ? Number(quote.subtotal) : null,
      vat_rate: quote.vat_rate != null ? Number(quote.vat_rate) : null,
      vat_amount: quote.vat_amount != null ? Number(quote.vat_amount) : null,
      grand_total: quote.grand_total != null ? Number(quote.grand_total) : null,
      extras_total: quote.extras_total != null ? Number(quote.extras_total) : null,
      cash_discount_pct: quote.cash_discount_pct != null ? Number(quote.cash_discount_pct) : 0,
      prices_vat_inclusive,
      expires_at: quote.expires_at,
      created_at: quote.created_at,
      client_name,
      items,
    },
    seller,
    pdf_url,
    issued_document,
    payable,
    not_found: false,
  });
}));

function jsonResponse(body: any, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
