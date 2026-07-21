// deno-lint-ignore-file no-explicit-any
// Customer self-service document list. A buyer who has an app account (their auth
// user_id is linked to one or more crm_contacts) can see THEIR OWN issued invoices /
// retail receipts and payment receipts, with fresh signed PDF download links.
//
// Why an edge function (not direct table reads): the invoices RLS is
// `is_workspace_member(workspace_id)` — a customer is NOT a workspace member, so they
// can't read the table directly. The overview lists come from `my_customer_*` RPCs that
// scope themselves from auth.uid() (the caller's own linked CRM contacts + those contacts'
// companies); the service-role client is used only for PDF signing and `order_detail`,
// which does its own explicit ownership check.
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

const isReceiptDoc = (dt: string | null) => String(dt ?? '').startsWith('11');

// ── Paging ──────────────────────────────────────────────────────────────────
// Each of the three lists (orders / invoices / receipts) is paged independently by the client.
// Paging is PRESENTATION ONLY: it never touches the scoping, which the RPCs derive from
// auth.uid() server-side (the caller's own crm_contacts + the companies those contacts link to).
//
// The lists come from `my_customer_*` RPCs that do the contact-OR-company union in SQL, so
// LIMIT/OFFSET are exact and there is no scan cap: we fetch exactly one page of metadata rows
// (`total_count` rides along on every row) and sign PDF URLs for that page ONLY. Signing is one
// storage round trip per row, so it's the part that must not be done 200-at-a-time.
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 200; // == the previous hard cap, so a caller that sends nothing is unchanged
const MAX_OFFSET = 1_000_000; // sanity bound only — the union is no longer capped

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  // NB: absent must mean "default", not 0 — `Number(null)` is 0, which would silently clamp to `min`.
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

/** `total_count` is identical on every row of an RPC page; 0 rows ⇒ nothing matched. */
const totalOf = (rows: any[] | null): number => Number(rows?.[0]?.total_count ?? 0);

Deno.serve(withApiLogging('finance-customer-documents', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  // Any authenticated user — this is a customer-facing surface, not admin-gated.
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // The `my_customer_*` RPCs scope themselves from auth.uid(), so they MUST run as the caller —
  // under service role auth.uid() is NULL and every list would come back empty. Storage signing
  // and the order_detail reads stay on the service-role client above (the customer is not a
  // workspace member, so those tables are not readable under their own RLS).
  const asUser = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Optional action: 'overview' (default — summary + orders + documents) or
  // 'order_detail' (line items for a single owned order).
  let action = 'overview';
  let orderId: string | null = null;
  let body: any = null;
  if (req.method === 'POST') {
    try { body = await req.json(); action = body?.action ?? 'overview'; orderId = body?.order_id ?? null; } catch { /* no body */ }
  }

  // Page size + per-list offsets, from the body (POST) or the query string (GET). These are
  // clamped numbers and are used ONLY to slice already-scoped results — never as a filter.
  const qp = new URL(req.url).searchParams;
  const pageSize = clampInt(body?.limit ?? qp.get('limit'), 1, MAX_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const offsets = {
    orders: clampInt(body?.orders_offset ?? qp.get('orders_offset'), 0, MAX_OFFSET, 0),
    invoices: clampInt(body?.invoices_offset ?? qp.get('invoices_offset'), 0, MAX_OFFSET, 0),
    receipts: clampInt(body?.receipts_offset ?? qp.get('receipts_offset'), 0, MAX_OFFSET, 0),
  };

  // 1. The caller's own CRM contacts (the only documents they may see).
  const { data: contacts } = await supabase
    .from('crm_contacts')
    .select('id')
    .eq('user_id', auth.userId);
  const contactIds = (contacts ?? []).map((c: any) => c.id);
  if (contactIds.length === 0) {
    return json({ ok: true, invoices: [], receipts: [], linked: false });
  }

  // 1b. The businesses those contacts belong to (crm_company_contacts). Same link that
  // drives the billing rollup — so a person attached to a business also SEES that
  // business's documents (they're its representative), not only their personal ones.
  const { data: links } = await supabase
    .from('crm_company_contacts')
    .select('company_id')
    .in('contact_id', contactIds);
  const companyIds = [...new Set((links ?? []).map((l: any) => l.company_id).filter(Boolean))];

  // ── action: order_detail — line items for a single order the caller owns ──
  if (action === 'order_detail') {
    if (!orderId) return json({ error: 'order_id required' }, 400);
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, order_type, status, payment_status, total, subtotal_net, vat_amount, currency, notes, created_at, customer_contact_id, customer_company_id')
      .eq('id', orderId)
      .maybeSingle();
    const owns = order
      && order.order_type === 'sales'
      && ((order.customer_contact_id && contactIds.includes(order.customer_contact_id))
        || (order.customer_company_id && companyIds.includes(order.customer_company_id)));
    if (!owns) return json({ error: 'Not found' }, 404);
    const { data: items } = await supabase
      .from('order_items')
      .select('id, description, quantity, unit_price, net_value, vat_amount, line_total, quantity_delivered, sort_order')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true });
    return json({ ok: true, order, items: items ?? [] });
  }

  const sign = async (path: string | null): Promise<string | null> => {
    if (!path) return null;
    const { data } = await supabase.storage.from('pdf-documents').createSignedUrl(path, 60 * 60 * 24 * 7);
    return data?.signedUrl ?? null;
  };

  // 2. Issued documents (invoices + retail receipts) addressed to the caller's contact
  //    OR their linked business. The RPC unions both in SQL and takes no identity argument,
  //    so there is nothing a caller could forge — and the page is exact.
  const { data: invRows } = await asUser.rpc('my_customer_invoices', {
    p_limit: pageSize,
    p_offset: offsets.invoices,
  });

  const invoices = await Promise.all(((invRows ?? []) as any[]).map(async (r: any) => ({
    id: r.id,
    kind: isReceiptDoc(r.document_type) ? 'receipt' : 'invoice',
    number: r.legal_number ?? r.internal_number ?? '',
    document_type: r.document_type,
    status: r.status,
    total: Number(r.total ?? 0),
    amount_due: Number(r.amount_due ?? 0),
    currency: r.currency ?? 'EUR',
    issued_at: r.issued_at,
    due_at: r.due_at,
    pdf_url: await sign(r.pdf_storage_path),
  })));

  // 3. Payment receipts (απόδειξη είσπραξης) for money the caller (or their business) paid.
  const { data: payRows } = await asUser.rpc('my_customer_payments', {
    p_limit: pageSize,
    p_offset: offsets.receipts,
  });

  const receipts = await Promise.all(((payRows ?? []) as any[]).map(async (r: any) => ({
    id: r.id,
    number: r.receipt_number ?? `PR-${String(r.id).slice(0, 8).toUpperCase()}`,
    amount: Number(r.amount ?? 0),
    currency: r.currency ?? 'EUR',
    method: r.method,
    paid_at: r.paid_at,
    pdf_url: await sign(r.pdf_storage_path),
  })));

  // 4. Sales orders placed by the caller (or their business) — status + payment state.
  const { data: orderRows } = await asUser.rpc('my_customer_orders', {
    p_limit: pageSize,
    p_offset: offsets.orders,
  });
  const orders = ((orderRows ?? []) as any[]).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    payment_status: o.payment_status,
    total: Number(o.total ?? 0),
    currency: o.currency ?? 'EUR',
    created_at: o.created_at,
  }));

  // 5. Account summary — billed / paid / outstanding per currency. Aggregated in SQL over the
  //    WHOLE account (all pages), so "total spent" doesn't change when the customer turns a page.
  //    `paid = billed − outstanding`, so a payment receipt is never double-counted against its invoice.
  const { data: summaryRows } = await asUser.rpc('my_customer_account_summary');
  const summary = ((summaryRows ?? []) as any[]).map((c: any) => ({
    currency: c.currency ?? 'EUR',
    billed: Math.round(Number(c.billed ?? 0) * 100) / 100,
    paid: Math.round(Number(c.paid ?? 0) * 100) / 100,
    outstanding: Math.round(Number(c.outstanding ?? 0) * 100) / 100,
    doc_count: Number(c.doc_count ?? 0),
    order_count: Number(c.order_count ?? 0),
  }));

  return json({
    ok: true, linked: true, summary, orders, invoices, receipts,
    paging: {
      limit: pageSize,
      orders: { offset: offsets.orders, total: totalOf(orderRows as any[]) },
      invoices: { offset: offsets.invoices, total: totalOf(invRows as any[]) },
      receipts: { offset: offsets.receipts, total: totalOf(payRows as any[]) },
    },
  });
}));
