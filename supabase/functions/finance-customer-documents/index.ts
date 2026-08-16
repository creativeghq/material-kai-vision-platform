// deno-lint-ignore-file no-explicit-any
// Customer self-service document list. A buyer who has an app account (their auth
// user_id is linked to one or more crm_contacts) can see THEIR OWN issued invoices /
// retail receipts and payment receipts, with fresh signed PDF download links.
// Why an edge function (not direct table reads): the invoices RLS is
// `is_workspace_member(workspace_id)` — a customer is NOT a workspace member, so they
// can't read the table directly. The overview lists come from `my_customer_*` RPCs that
// scope themselves from auth.uid() (the caller's own linked CRM contacts + those contacts'
// companies); the service-role client is used only for PDF signing and `order_detail`,
// which does its own explicit ownership check.
import { createClient } from '@supabase/supabase-js';
import { jsonResponse as json } from '../_shared/http.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { emitFlowEventToWorkspaceRoles } from '../_shared/flow-events.ts';


const isReceiptDoc = (dt: string | null) => String(dt ?? '').startsWith('11');

// ── Paging ──────────────────────────────────────────────────────────────────
// Each of the three lists (orders / invoices / receipts) is paged independently by the client.
// Paging is PRESENTATION ONLY: it never touches the scoping, which the RPCs derive from
// auth.uid() server-side (the caller's own crm_contacts + the companies those contacts link to).
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
  // A caller with no linked CRM contacts owns nothing. For the READ overview that's an
  // empty (linked:false) payload — but the action-gated handlers below (order_detail,
  // reorder) MUST still reach their own 404 ownership gate. Short-circuiting here with a
  // 200 let an unrelated user probe / reorder someone else's order (BOLA). Only the
  // overview may take the early exit.
  if (contactIds.length === 0 && action !== 'order_detail' && action !== 'reorder') {
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

  // ── action: reorder — "Order again": clone an owned order into a NEW DRAFT the business reviews ──
  if (action === 'reorder') {
    if (!orderId) return json({ error: 'order_id required' }, 400);
    const { data: src } = await supabase
      .from('orders')
      .select('id, order_number, workspace_id, order_type, currency, project_id, customer_contact_id, customer_company_id')
      .eq('id', orderId)
      .maybeSingle();
    const owns = src
      && src.order_type === 'sales'
      && ((src.customer_contact_id && contactIds.includes(src.customer_contact_id))
        || (src.customer_company_id && companyIds.includes(src.customer_company_id)));
    if (!owns) return json({ error: 'Not found' }, 404); // 404 (not 403) — no order-id enumeration

    const { data: items } = await supabase
      .from('order_items')
      .select('product_id, description, quantity, unit_price, unit_cost, supplier_company_id, measurement_unit_code, vat_percent, vat_category, net_value, vat_amount, line_total, discount_pct, update_warehouse, sort_order')
      .eq('order_id', orderId)
      .order('sort_order', { ascending: true });
    if (!items || items.length === 0) return json({ ok: false, error: 'This order has no items to reorder.' }, 400);

    const r2 = (n: number) => Math.round(n * 100) / 100;

    // Re-price at TODAY's customer-aware prices (fair to both sides) — default on; opt out with
    // reprice:false to repeat the exact historical prices. Only catalog lines (product_id) can be
    // re-priced; ad-hoc lines keep their price. The customer's discount level/override is applied via
    // the source order's party ids. An unpriced product falls back to the old price (never blocks).
    const reprice = body?.reprice !== false;
    const repriced: Array<{ description: string; old_unit_price: number; new_unit_price: number; changed: boolean }> = [];
    const priced = await Promise.all((items as any[]).map(async (it) => {
      const oldPrice = Number(it.unit_price || 0);
      let unitPrice = oldPrice;
      let discountPct = Number(it.discount_pct || 0);
      let net = Number(it.net_value || 0);
      let vatAmt = Number(it.vat_amount || 0);
      let lineTotal = Number(it.line_total || 0);
      let changed = false;
      if (reprice && it.product_id) {
        // Quantity + unit so a volume break can apply (#332 step 1c). A reorder is precisely
        // where this matters: the customer is repeating a quantity that may cross a threshold,
        // and without these the "re-price at today's prices" promise quietly excluded the one
        // discount that depends on how much they are buying.
        //
        // Together or not at all — `get_product_price_break` coalesces an unconvertible unit
        // back to the raw quantity, so a qty without its unit matches the wrong threshold.
        // Despite its name `order_items.measurement_unit_code` holds our TEXT unit label
        // ('pcs', 'm2'), not the myDATA integer code — verified against the column's live values.
        const lineQty = Number(it.quantity || 0);
        const lineUnit = (it.measurement_unit_code as string | null) || null;
        const breakArgs = lineUnit && lineQty > 0 ? { p_quantity: lineQty, p_unit: lineUnit } : {};
        const { data: pr } = await supabase.rpc('get_product_price_for_workspace', {
          p_workspace_id: src.workspace_id, p_product_id: it.product_id,
          p_company_id: src.customer_company_id, p_contact_id: src.customer_contact_id, p_audience: 'seller',
          ...breakArgs,
        });
        const finalSell = pr && (pr as any).final_sell != null ? Number((pr as any).final_sell) : null;
        if (finalSell != null) {
          changed = Math.abs(finalSell - oldPrice) > 0.005;
          unitPrice = finalSell;
          discountPct = 0; // the current price is already the discounted (final_sell) figure
          net = r2(Number(it.quantity || 0) * finalSell);
          vatAmt = r2(net * Number(it.vat_percent || 0) / 100);
          lineTotal = net;
        }
      }
      repriced.push({ description: it.description, old_unit_price: oldPrice, new_unit_price: unitPrice, changed });
      return { ...it, unit_price: unitPrice, discount_pct: discountPct, net_value: net, vat_amount: vatAmt, line_total: lineTotal };
    }));
    const changedCount = repriced.filter((r) => r.changed).length;

    const subtotal = r2(priced.reduce((a: number, it: any) => a + Number(it.net_value || 0), 0));
    const vat = r2(priced.reduce((a: number, it: any) => a + Number(it.vat_amount || 0), 0));
    const total = r2(subtotal + vat);

    // Preview: return what the reorder WOULD cost at today's prices without creating anything, so the
    // customer can review price changes before committing (nothing is written).
    if (body?.preview === true) {
      return json({
        ok: true, preview: true, total, currency: src.currency, source_order_number: src.order_number ?? null,
        reprice: { applied: reprice, changed: changedCount, lines: repriced },
      });
    }

    // Born as a DRAFT (= Pre-order) so the business confirms/re-prices before it becomes live. The
    // customer never writes a live order into someone else's workspace; identity fields are copied
    // from the SOURCE order (server-side), never taken from the request body.
    const { data: created, error: cErr } = await supabase
      .from('orders')
      .insert({
        workspace_id: src.workspace_id, order_type: 'sales', status: 'draft',
        customer_contact_id: src.customer_contact_id, customer_company_id: src.customer_company_id,
        project_id: src.project_id, currency: src.currency,
        subtotal_net: subtotal, vat_amount: vat, total,
        notes: `Reorder requested by customer${src.order_number ? ` (from order ${src.order_number})` : ''}.`
          + (changedCount > 0 ? ` Prices updated to current for ${changedCount} line(s).` : ''),
      })
      .select('id, order_number')
      .single();
    if (cErr || !created) return json({ ok: false, error: cErr?.message ?? 'Could not create the reorder.' }, 400);

    const rows = priced.map((it: any, i: number) => ({
      order_id: created.id, workspace_id: src.workspace_id,
      product_id: it.product_id ?? null, description: it.description,
      quantity: it.quantity, unit_price: it.unit_price, unit_cost: it.unit_cost ?? null,
      supplier_company_id: it.supplier_company_id ?? null,
      measurement_unit_code: it.measurement_unit_code ?? null,
      vat_percent: it.vat_percent ?? null, vat_category: it.vat_category ?? null,
      net_value: it.net_value ?? 0, vat_amount: it.vat_amount ?? 0, line_total: it.line_total ?? 0,
      discount_pct: it.discount_pct ?? 0, update_warehouse: it.update_warehouse ?? true, sort_order: it.sort_order ?? i,
    }));
    const { error: iErr } = await supabase.from('order_items').insert(rows);
    if (iErr) return json({ ok: false, error: iErr.message }, 400);

    // Tell the business (owners/admins) a customer wants to order again — a draft awaits review.
    await emitFlowEventToWorkspaceRoles(src.workspace_id, ['owner', 'admin'], 'order_created', (uid) => ({
      user_id: uid, type: 'order_created', workspace_id: src.workspace_id,
      order_id: created.id, order_number: created.order_number ?? null, order_type: 'sales', status: 'draft',
      total, currency: src.currency,
      customer_company_id: src.customer_company_id, customer_contact_id: src.customer_contact_id,
      title: `Customer reorder request${created.order_number ? ` #${created.order_number}` : ''}`,
      body: `A customer asked to order again (${total.toFixed(2)} ${src.currency}). A draft order is ready to review.`,
      action_url: `/finance/orders/${created.id}`,
    }));

    return json({
      ok: true, order_id: created.id, order_number: created.order_number ?? null,
      total, currency: src.currency,
      reprice: { applied: reprice, changed: changedCount, lines: repriced },
    });
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
