// deno-lint-ignore-file no-explicit-any
// Customer self-service document list. A buyer who has an app account (their auth
// user_id is linked to one or more crm_contacts) can see THEIR OWN issued invoices /
// retail receipts and payment receipts, with fresh signed PDF download links.
//
// Why an edge function (not direct table reads): the invoices RLS is
// `is_workspace_member(workspace_id)` — a customer is NOT a workspace member, so they
// can't read the table directly. This runs under service role but scopes STRICTLY to
// documents whose counterparty is one of the caller's own linked CRM contacts.
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
// Paging is PRESENTATION ONLY: it never touches the scoping filters below, which stay derived
// from the caller's own linked CRM contacts and their companies.
//
// Every list is assembled from TWO scoped queries (by contact + by company) that are merged and
// de-duped, so a per-query `.range()` would slice the wrong rows. Instead we read the cheap
// metadata rows up to SCAN_CAP, merge/sort/dedupe in memory — which also gives an exact total and
// keeps the account summary correct regardless of which page is requested — and then sign PDF URLs
// for the requested slice ONLY. Signing is one storage round trip per row, so it's the part that
// must not be done 200-at-a-time.
const SCAN_CAP = 2000;
const MAX_PAGE_SIZE = 500;
const DEFAULT_PAGE_SIZE = 200; // == the previous hard cap, so a caller that sends nothing is unchanged

const clampInt = (v: unknown, min: number, max: number, dflt: number): number => {
  // NB: absent must mean "default", not 0 — `Number(null)` is 0, which would silently clamp to `min`.
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, Math.floor(n)));
};

/** Newest-first by a nullable timestamp column; nulls sort last (matches `nullsFirst: false`). */
const byDateDesc = (key: string) => (a: any, b: any) => {
  const av = a?.[key] ? Date.parse(a[key]) : Number.NEGATIVE_INFINITY;
  const bv = b?.[key] ? Date.parse(b[key]) : Number.NEGATIVE_INFINITY;
  return bv - av;
};

Deno.serve(withApiLogging('finance-customer-documents', async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  // Any authenticated user — this is a customer-facing surface, not admin-gated.
  const auth = await authenticate(req, { requireUser: true });
  if (!auth.success || !auth.userId) return json({ error: auth.error ?? 'Unauthorized' }, 401);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
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
    orders: clampInt(body?.orders_offset ?? qp.get('orders_offset'), 0, SCAN_CAP, 0),
    invoices: clampInt(body?.invoices_offset ?? qp.get('invoices_offset'), 0, SCAN_CAP, 0),
    receipts: clampInt(body?.receipts_offset ?? qp.get('receipts_offset'), 0, SCAN_CAP, 0),
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

  const dedupeById = (rows: any[]): any[] => {
    const seen = new Set<string>();
    return rows.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  };

  // 2. Issued documents (invoices + retail receipts) addressed to the caller's contact
  //    OR their linked business. Two explicit IN-queries merged + de-duped — avoids the
  //    PostgREST or()/in() ambiguity entirely, so each filter is trivially correct.
  const fetchInvoices = (col: 'customer_contact_id' | 'customer_company_id', ids: string[]) =>
    supabase
      .from('invoices')
      .select('id, internal_number, legal_number, document_type, status, total, currency, issued_at, due_at, amount_due, pdf_storage_path')
      .in(col, ids)
      .neq('status', 'draft')
      .neq('status', 'void')
      .order('issued_at', { ascending: false, nullsFirst: false })
      .limit(SCAN_CAP);
  const invResults = await Promise.all([
    fetchInvoices('customer_contact_id', contactIds),
    companyIds.length ? fetchInvoices('customer_company_id', companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  // Merged across both scoped queries → re-sort, because each was only ordered within itself.
  const invAll = dedupeById(invResults.flatMap((r: any) => r.data ?? [])).sort(byDateDesc('issued_at'));
  const invRows = invAll.slice(offsets.invoices, offsets.invoices + pageSize);

  const invoices = await Promise.all((invRows ?? []).map(async (r: any) => ({
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
  const fetchPayments = (col: 'counterparty_contact_id' | 'counterparty_company_id', ids: string[]) =>
    supabase
      .from('payments')
      .select('id, receipt_number, amount, currency, method, paid_at, pdf_storage_path')
      .in(col, ids)
      .eq('direction', 'in')
      .order('paid_at', { ascending: false })
      .limit(SCAN_CAP);
  const payResults = await Promise.all([
    fetchPayments('counterparty_contact_id', contactIds),
    companyIds.length ? fetchPayments('counterparty_company_id', companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const payAll = dedupeById(payResults.flatMap((r: any) => r.data ?? [])).sort(byDateDesc('paid_at'));
  const payRows = payAll.slice(offsets.receipts, offsets.receipts + pageSize);

  const receipts = await Promise.all((payRows ?? []).map(async (r: any) => ({
    id: r.id,
    number: r.receipt_number ?? `PR-${String(r.id).slice(0, 8).toUpperCase()}`,
    amount: Number(r.amount ?? 0),
    currency: r.currency ?? 'EUR',
    method: r.method,
    paid_at: r.paid_at,
    pdf_url: await sign(r.pdf_storage_path),
  })));

  // 4. Sales orders placed by the caller (or their business) — status + payment state.
  const fetchOrders = (col: 'customer_contact_id' | 'customer_company_id', ids: string[]) =>
    supabase
      .from('orders')
      .select('id, order_number, status, payment_status, total, currency, created_at')
      .in(col, ids)
      .eq('order_type', 'sales')
      .order('created_at', { ascending: false })
      .limit(SCAN_CAP);
  const orderResults = await Promise.all([
    fetchOrders('customer_contact_id', contactIds),
    companyIds.length ? fetchOrders('customer_company_id', companyIds) : Promise.resolve({ data: [] as any[] }),
  ]);
  const orderAll = dedupeById(orderResults.flatMap((r: any) => r.data ?? [])).sort(byDateDesc('created_at'));
  const orders = orderAll.slice(offsets.orders, offsets.orders + pageSize).map((o: any) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    payment_status: o.payment_status,
    total: Number(o.total ?? 0),
    currency: o.currency ?? 'EUR',
    created_at: o.created_at,
  }));

  // 5. Account summary — billed / paid / outstanding per currency (derived from the
  //    issued documents above so the math is internally consistent and never double-counts
  //    a payment receipt against its invoice). `paid = billed − outstanding`.
  const byCurrency = new Map<string, { currency: string; billed: number; paid: number; outstanding: number; doc_count: number; order_count: number }>();
  const bump = (cur: string): { currency: string; billed: number; paid: number; outstanding: number; doc_count: number; order_count: number } => {
    const k = cur || 'EUR';
    let cell = byCurrency.get(k);
    if (!cell) { cell = { currency: k, billed: 0, paid: 0, outstanding: 0, doc_count: 0, order_count: 0 }; byCurrency.set(k, cell); }
    return cell;
  };
  //    Computed over the FULL scoped sets, not the requested page — otherwise "total spent" would
  //    change every time the customer turned a page.
  for (const inv of invAll) {
    const c = bump(inv.currency ?? 'EUR');
    c.billed += Number(inv.total ?? 0);
    c.outstanding += Number(inv.amount_due ?? 0);
    c.doc_count += 1;
  }
  for (const o of orderAll) bump(o.currency ?? 'EUR').order_count += 1;
  const summary = Array.from(byCurrency.values()).map((c) => ({
    ...c,
    billed: Math.round(c.billed * 100) / 100,
    outstanding: Math.round(c.outstanding * 100) / 100,
    paid: Math.round((c.billed - c.outstanding) * 100) / 100,
  }));

  // `truncated` = a list hit SCAN_CAP, so its total is a floor rather than the real count.
  const truncated = [invResults, payResults, orderResults]
    .some((rs) => rs.some((r: any) => (r.data ?? []).length >= SCAN_CAP));

  return json({
    ok: true, linked: true, summary, orders, invoices, receipts,
    paging: {
      limit: pageSize,
      scan_cap: SCAN_CAP,
      truncated,
      orders: { offset: offsets.orders, total: orderAll.length },
      invoices: { offset: offsets.invoices, total: invAll.length },
      receipts: { offset: offsets.receipts, total: payAll.length },
    },
  });
}));
