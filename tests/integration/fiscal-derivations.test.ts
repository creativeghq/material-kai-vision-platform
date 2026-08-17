import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

/**
 * The fiscal derivation chain: quote → invoice → receipt → settlement.
 *
 * Every assertion here FAILS ON THE CODE AS IT SHIPPED, which is the point (#263: "every
 * audit/pentest finding gets a regression test that fails on the old code"). These are all SQL
 * functions, so nothing else in the suite can see them — `moneyDerivation.test.ts` scans repo
 * files and this project's SQL lives only in `pg_proc`, which is exactly how the upsell bug
 * survived a green build for months.
 *
 * What each test locks down, and what it looked like before (#271, #287):
 *
 *  1. `get_quote_totals` folds accepted upsells into the taxable base.
 *  2. `issue_invoice_from_quote` invoices the DERIVED total, not the cached `quotes.grand_total`
 *     that nothing recomputes when an upsell is accepted — the customer saw a Final including
 *     their extras and would have been invoiced the figure from before they accepted.
 *  3. `pos_issue_receipt` is ONE transaction. The old three-round-trip sequence raised on every
 *     sale (an `issued` invoice cannot take line inserts) AFTER committing a legal ΑΑΔΕ number,
 *     so every POS sale gapped the legal series. Its header must also equal Σ its lines — myDATA
 *     rejects a document whose lines do not foot.
 *  4. `get_order_settlements` must not add a USD allocation to a EUR order. It used to sum
 *     `amount` with no currency check, producing a figure in no currency at all.
 *  5. `amount_paid` is CASH; credit-note relief lands in `amount_credited`; `amount_due` nets
 *     both — so a credit-noted invoice neither reads as "paid in cash" nor reappears in aging.
 */
const suite = hasCreds ? describe : describe.skip;

suite('fiscal derivations · quote → invoice → receipt → settlement', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser;
  let ws = '';
  let contact = '';
  let upsellId = '';
  // `uq_pos_session_open` permits ONE open session per (workspace, branch), so the POS tests
  // share this one rather than each opening their own — which is also how a real register works.
  let posSession = '';

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'fiscal', rid);
    ws = await createWorkspace(svc, 'wsFiscal', rid, A.id);
    await addMember(svc, ws, A.id, 'owner');

    const c = await svc.from('crm_contacts')
      .insert({ workspace_id: ws, name: `Fiscal E2E ${rid}`, first_name: 'Fiscal', last_name: `E2E ${rid}`, created_by: A.id })
      .select('id').single();
    if (c.error) throw new Error(`seed contact: ${c.error.message}`);
    contact = c.data.id;

    // `upsells` is a global catalogue (no workspace_id), so this row is torn down by id below.
    const u = await svc.from('upsells')
      .insert({ name: `E2E upsell ${rid}`, price: 200, is_active: true })
      .select('id').single();
    if (u.error) throw new Error(`seed upsell: ${u.error.message}`);
    upsellId = u.data.id;

    const s = await svc.from('pos_sessions')
      .insert({ workspace_id: ws, branch_code: 0, opened_by: A.id }).select('id').single();
    if (s.error) throw new Error(`seed pos session: ${s.error.message}`);
    posSession = s.data.id;
  });

  afterAll(async () => {
    // invoice_items_immutability_guard rejects line DML while the parent is `issued`, so drop the
    // documents back to draft before deleting. Without this the teardown fails and leaves fixtures.
    const { data: invs } = await svc.from('invoices').select('id').eq('workspace_id', ws);
    for (const inv of invs ?? []) {
      await svc.from('invoices').update({ status: 'draft', fiscal_status: null }).eq('id', inv.id).then(() => {}, () => {});
      await svc.from('invoice_items').delete().eq('invoice_id', inv.id).then(() => {}, () => {});
    }
    await svc.from('invoices').delete().eq('workspace_id', ws).then(() => {}, () => {});
    const { data: qs } = await svc.from('quotes').select('id').eq('workspace_id', ws);
    for (const q of qs ?? []) {
      await svc.from('quote_upsells').delete().eq('quote_id', q.id).then(() => {}, () => {});
      await svc.from('quote_items').delete().eq('quote_id', q.id).then(() => {}, () => {});
    }
    await svc.from('quotes').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('payment_allocations').delete().eq('order_id', null).then(() => {}, () => {});
    await svc.from('payments').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('orders').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('pos_sessions').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('crm_contacts').delete().eq('workspace_id', ws).then(() => {}, () => {});
    if (upsellId) await svc.from('upsells').delete().eq('id', upsellId).then(() => {}, () => {});
    await teardown(svc, { wsIds: [ws], userIds: [A.id] });
  });

  /** A quote whose STORED totals are deliberately stale — the state after an upsell is accepted. */
  async function seedQuoteWithAcceptedUpsell() {
    const q = await svc.from('quotes').insert({
      workspace_id: ws, user_id: A.id, status: 'accepted', vat_rate: 24,
      // Stored columns describe the quote BEFORE the upsell was accepted — that staleness is the
      // POINT of the fixture, and `get_quote_totals` is what must see past it.
      //
      // `extras_total` is NOT seeded: it stopped being a stored column in #358 PQ-6 and is now
      // derived from the accepted `quote_upsells` row below (price 200). Seeding it was what broke
      // this fixture — PostgREST answers "Could not find the 'extras_total' column of 'quotes' in
      // the schema cache", which throws before a single assertion runs.
      subtotal: 1000, vat_amount: 240, grand_total: 1240,
      cash_discount_pct: 0, paid_upfront: false, currency: 'EUR',
      customer_contact_id: contact,
    }).select('id').single();
    if (q.error) throw new Error(`seed quote: ${q.error.message}`);
    const quoteId = q.data.id;

    // No `line_total`: it is GENERATED ALWAYS from coalesce(discounted_price, unit_price) *
    // quantity, and Postgres rejects any non-DEFAULT write to it. 2 × 500 derives the same 1000.
    const li = await svc.from('quote_items').insert({
      quote_id: quoteId, quantity: 2, unit_price: 500,
      custom_product_name: `E2E line ${rid}`,
    });
    // Checked, like every other seed here. Unchecked, this insert failed silently and the suite
    // went on to assert derived totals against a quote with no lines on it — which reads as a
    // broken derivation rather than a broken fixture.
    if (li.error) throw new Error(`seed quote item: ${li.error.message}`);
    const up = await svc.from('quote_upsells').insert({
      quote_id: quoteId, upsell_id: upsellId, customer_accepted: true,
    });
    if (up.error) throw new Error(`seed quote upsell: ${up.error.message}`);
    return quoteId;
  }

  // ── 1. the derivation itself ────────────────────────────────────────────────
  it('get_quote_totals folds an accepted upsell into the taxable base', async () => {
    const quoteId = await seedQuoteWithAcceptedUpsell();
    const { data, error } = await svc.rpc('get_quote_totals', { p_quote_ids: [quoteId] });
    expect(error).toBeNull();
    const t = Array.isArray(data) ? data[0] : data;

    expect(Number(t.extras_total)).toBe(200);
    // 1000 net + 200 accepted extras = 1200 taxable, 24% = 288, total 1488.
    expect(Number(t.taxable_base)).toBe(1200);
    expect(Number(t.vat_amount)).toBe(288);
    expect(Number(t.grand_total)).toBe(1488);
    // The stale stored figure the invoice used to copy. Kept as an explicit contrast so a future
    // reader knows the 1240 is the BUG, not an alternative answer.
    expect(Number(t.grand_total)).not.toBe(1240);
  });

  // ── 2. the money path reads the derivation, not the cache ──────────────────
  it('issue_invoice_from_quote charges the derived total and puts the upsell on a line', async () => {
    const quoteId = await seedQuoteWithAcceptedUpsell();
    const { data: invoiceId, error } = await A.client.rpc('issue_invoice_from_quote', { p_quote_id: quoteId });
    expect(error).toBeNull();
    expect(invoiceId).toBeTruthy();

    const { data: inv } = await svc.from('invoices')
      .select('subtotal_net, vat_amount, total, cash_discount_pct').eq('id', invoiceId).single();

    // Was 900 / 240 / 1240 — subtotal re-derived off the stale `quotes.subtotal` (excluding
    // extras), vat_amount and total copied straight from the stale stored columns.
    expect(Number(inv!.total)).toBe(1488);
    expect(Number(inv!.vat_amount)).toBe(288);
    expect(Number(inv!.subtotal_net)).toBe(1200);

    const { data: lines } = await svc.from('invoice_items')
      .select('description, line_total').eq('invoice_id', invoiceId);

    // The upsell must appear as a real line: a customer cannot be charged for something the
    // fiscal document does not mention.
    expect(lines).toHaveLength(2);
    expect(lines!.some((l) => l.description?.includes('E2E upsell'))).toBe(true);

    // And the lines must foot to the header net, by construction.
    const sumLines = lines!.reduce((s, l) => s + Number(l.line_total), 0);
    expect(Number(sumLines.toFixed(2))).toBe(Number(inv!.subtotal_net));
  });

  // ── 3. POS: atomic, and lines foot ─────────────────────────────────────────
  it('pos_issue_receipt writes header + lines in one transaction, and the header is the sum of the lines', async () => {
    // Mixed-rate, VAT-inclusive basket chosen so per-line and per-bucket rounding DISAGREE:
    // 3 x 9.99 @24% is 24.18 rounded per line and 24.17 rounded per rate-bucket. The old code
    // stored one and printed the other.
    const { data, error } = await A.client.rpc('pos_issue_receipt', {
      p_workspace_id: ws, p_session_id: posSession, p_doc_code: '11.1', p_branch_code: 0,
      p_items: [
        { product_id: null, description: 'A', quantity: 3, unit_price: 9.99, vat_rate: 24, vat_category: 1 },
        { product_id: null, description: 'B', quantity: 1, unit_price: 7.77, vat_rate: 6, vat_category: 3 },
      ],
      p_vat_inclusive: true, p_currency: 'EUR', p_payment_method_code: 3,
      p_customer_company_id: null, p_customer_contact_id: null,
      p_has_shipping: false, p_vehicle_number: null, p_ship_to: null, p_move_purpose: null,
    });
    expect(error).toBeNull();
    const r = Array.isArray(data) ? data[0] : data;
    expect(Number(r.net)).toBe(31.51);
    expect(Number(r.vat)).toBe(6.24);
    expect(Number(r.total)).toBe(37.75);
    // Mixed basket: the single NOT NULL header rate is the dominant one by net, not the last one
    // the keypad happened to show.
    expect(Number(r.dominant_rate)).toBe(24);

    const { data: inv } = await svc.from('invoices')
      .select('status, subtotal_net, vat_amount, total').eq('id', r.invoice_id).single();
    // The document is `issued` AND has lines. Before, it could only ever be one or the other.
    expect(inv!.status).toBe('issued');

    const { data: lines } = await svc.from('invoice_items')
      .select('net_value, vat_amount').eq('invoice_id', r.invoice_id);
    expect(lines).toHaveLength(2);

    const sumNet = Number(lines!.reduce((s, l) => s + Number(l.net_value), 0).toFixed(2));
    const sumVat = Number(lines!.reduce((s, l) => s + Number(l.vat_amount), 0).toFixed(2));
    expect(sumNet).toBe(Number(inv!.subtotal_net));
    expect(sumVat).toBe(Number(inv!.vat_amount));
    expect(Number((sumNet + sumVat).toFixed(2))).toBe(Number(inv!.total));
  });

  it('pos_issue_receipt burns no legal number when the write fails', async () => {
    const before = await svc.from('invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);

    // product_id references nothing → the invoice_items insert violates its FK, AFTER the legal
    // number has been allocated and the header written. Both must roll back with it.
    const { error } = await A.client.rpc('pos_issue_receipt', {
      p_workspace_id: ws, p_session_id: posSession, p_doc_code: '11.1', p_branch_code: 0,
      p_items: [{
        product_id: '00000000-0000-0000-0000-0000000000ff',
        description: 'boom', quantity: 1, unit_price: 10, vat_rate: 24,
      }],
      p_vat_inclusive: true, p_currency: 'EUR', p_payment_method_code: 3,
      p_customer_company_id: null, p_customer_contact_id: null,
      p_has_shipping: false, p_vehicle_number: null, p_ship_to: null, p_move_purpose: null,
    });
    expect(error).not.toBeNull();

    const after = await svc.from('invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
    expect(after.count).toBe(before.count);
  });

  // ── 4. settlement does not add currencies together ─────────────────────────
  it('get_order_settlements ignores an allocation denominated in another currency', async () => {
    const o = await svc.from('orders').insert({
      workspace_id: ws, order_type: 'sales', currency: 'EUR', total: 1000,
      status: 'confirmed', created_by: A.id,
    }).select('id').single();
    if (o.error) throw new Error(`seed order: ${o.error.message}`);

    const p = await svc.from('payments').insert({
      workspace_id: ws, direction: 'in', amount: 400, currency: 'USD',
      method: 'bank_transfer', paid_at: new Date().toISOString(), created_by: A.id,
    }).select('id').single();
    if (p.error) throw new Error(`seed payment: ${p.error.message}`);

    await svc.from('payment_allocations').insert({
      payment_id: p.data.id, order_id: o.data.id, amount: 400, amount_doc_currency: 400, fx_rate: 1,
    });

    const { data } = await svc.rpc('get_order_settlements', { p_order_ids: [o.data.id] });
    const st = Array.isArray(data) ? data[0] : data;
    // USD 400 against a EUR order used to read as 400 settled. It is not 400 of anything the
    // order is denominated in, so it is excluded and reported by the integrity probe instead.
    expect(Number(st.settled)).toBe(0);
    expect(Number(st.outstanding)).toBe(1000);
    expect(st.payment_status).toBe('unpaid');

    // Re-denominate the same payment and it IS counted — proving the exclusion is about currency,
    // not about the allocation being unreachable.
    await svc.from('payments').update({ currency: 'EUR' }).eq('id', p.data.id);
    const { data: data2 } = await svc.rpc('get_order_settlements', { p_order_ids: [o.data.id] });
    const st2 = Array.isArray(data2) ? data2[0] : data2;
    expect(Number(st2.settled)).toBe(400);
    expect(st2.payment_status).toBe('partial');
  });

  // ── 5. cash and credit-note relief are different numbers ───────────────────
  it('amount_paid is cash only, amount_credited holds relief, and amount_due nets both', async () => {
    const inv = await svc.from('invoices').insert({
      workspace_id: ws, internal_number: `INV-E2E-${rid}`, invoice_kind: 'full',
      customer_contact_id: contact, status: 'issued', currency: 'EUR',
      subtotal_net: 1000, vat_rate: 24, vat_amount: 240, total: 1240,
      payment_terms_days: 30, created_by: A.id,
    }).select('id').single();
    if (inv.error) throw new Error(`seed invoice: ${inv.error.message}`);

    // Fully relieved by a credit note, no cash at all.
    await svc.from('invoices').update({ amount_paid: 0, amount_credited: 1240 }).eq('id', inv.data.id);
    const { data: credited } = await svc.from('invoices')
      .select('amount_paid, amount_credited, amount_due').eq('id', inv.data.id).single();

    // The whole point: nothing was PAID, and nothing is still OWED. Before, amount_paid summed
    // credit-note allocations too, so this invoice reported 1240 of cash that never arrived.
    expect(Number(credited!.amount_paid)).toBe(0);
    expect(Number(credited!.amount_credited)).toBe(1240);
    expect(Number(credited!.amount_due)).toBe(0);

    // …and it must not resurface in AR aging as outstanding, which is what a naive
    // "amount_paid = cash" change would have caused (amount_due is a GENERATED column).
    const { data: aging } = await svc.from('vw_ar_aging')
      .select('id').eq('id', inv.data.id).gt('amount_due', 0);
    expect(aging ?? []).toHaveLength(0);
  });
});
