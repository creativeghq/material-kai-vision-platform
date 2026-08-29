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
 *  6. `issue_credit_note` caps CUMULATIVE credit at the invoice total (#351 B4). It used to check
 *     the request in front of it and nothing else, so crediting 6 of 10 and reopening the form —
 *     which defaulted back to all 10 — produced EUR 198.40 of transmitted legal documents against
 *     a EUR 124 invoice.
 *  7. `pos_issue_receipt` is idempotent on its client token (#351 C1). A retry after a dropped
 *     connection returned a SECOND receipt with its own legal number, its own payment and its own
 *     stock movement.
 *  8. `bill_time_entries_to_invoice` / `bill_trip_expenses_to_invoice` are ONE transaction and
 *     apply the filters their callers' doc comments always claimed (#351 S4/S2/S3). The TypeScript
 *     they replaced wrote the invoice, its lines and the source stamps as three separate calls, so
 *     a failure on the last one left the work billed and still marked unbilled.
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
    // Seeded as `quoted` and accepted at the END, which is the real lifecycle and now the only
    // one that works: #358 PQ-12 latched the child tables of a decided quote
    // (`user_can_write_quote` → status not in accepted/rejected), so inserting a line under an
    // already-accepted quote raises "issue a revision instead of editing it". Creating the quote
    // accepted and then adding lines was never a state the application could produce.
    const q = await svc.from('quotes').insert({
      workspace_id: ws, user_id: A.id, status: 'quoted', vat_rate: 24,
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

    // Now decide it. `quote_items.pricing_status` defaults to 'priced', so the
    // `_reject_accept_with_unpriced_lines` gate passes; the flip also materialises an order via
    // `quote_accepted_create_order`, which is what acceptance does in production and what the
    // teardown below already cleans up.
    const acc = await svc.from('quotes')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', quoteId);
    if (acc.error) throw new Error(`accept quote: ${acc.error.message}`);
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

  // ── 6. cumulative credit cannot exceed the invoice (#351 B4) ───────────────
  it('issue_credit_note refuses to credit more than the invoice is worth, cumulatively', async () => {
    const inv = await svc.from('invoices').insert({
      workspace_id: ws, internal_number: `INV-B4-${rid}`, invoice_kind: 'full',
      customer_contact_id: contact, status: 'draft', currency: 'EUR',
      subtotal_net: 100, vat_rate: 24, vat_amount: 24, total: 124,
      payment_terms_days: 30, created_by: A.id, issued_at: new Date().toISOString(),
    }).select('id').single();
    if (inv.error) throw new Error(`seed invoice: ${inv.error.message}`);
    // Lines go on while it is still a draft — `invoice_items_immutability_guard` closes the door
    // the moment it is issued.
    const item = await svc.from('invoice_items').insert({
      invoice_id: inv.data.id, description: 'widget', quantity: 10, unit_price: 10,
      net_value: 100, vat_amount: 24, line_total: 124,
    }).select('id').single();
    if (item.error) throw new Error(`seed item: ${item.error.message}`);
    await svc.from('invoices').update({ status: 'issued' }).eq('id', inv.data.id);

    const line = (qty: number, net: number, vat: number) => [{
      source_invoice_item_id: item.data.id, description: 'widget',
      quantity: qty, unit_price: 10, net_value: net, vat_amount: vat,
    }];

    // Credit 6 of 10 → 74.40.
    const first = await A.client.rpc('issue_credit_note', {
      p_invoice_id: inv.data.id, p_lines: line(6, 60, 14.40), p_reason: 'partial return', p_correlated: true,
    });
    expect(first.error).toBeNull();

    // The form reopens and offers all 10 again. THIS is the finding: it used to succeed, leaving
    // 198.40 of credit against a 124 invoice.
    const second = await A.client.rpc('issue_credit_note', {
      p_invoice_id: inv.data.id, p_lines: line(10, 100, 24), p_reason: 'second full return', p_correlated: true,
    });
    expect(second.error).not.toBeNull();
    expect(second.error!.message).toContain('credit_exceeds_invoice');

    // …and the remaining 4 still credit, so the cap is a cap and not a one-note-per-invoice rule.
    const rest = await A.client.rpc('issue_credit_note', {
      p_invoice_id: inv.data.id, p_lines: line(4, 40, 9.60), p_reason: 'rest', p_correlated: true,
    });
    expect(rest.error).toBeNull();

    const { data: after } = await svc.from('invoices')
      .select('amount_credited, status').eq('id', inv.data.id).single();
    expect(Number(after!.amount_credited)).toBe(124);
    expect(after!.status).toBe('credit_noted');
  });

  // ── 7. a retried POS sale is the same sale (#351 C1) ───────────────────────
  it('pos_issue_receipt returns the SAME receipt for a repeated client token', async () => {
    const token = `probe-${rid}`;
    const args = {
      p_workspace_id: ws, p_session_id: posSession, p_doc_code: '11.1', p_branch_code: 0,
      p_items: [
        { product_id: null, description: 'A', quantity: 3, unit_price: 9.99, vat_rate: 24, vat_category: 1 },
        { product_id: null, description: 'B', quantity: 1, unit_price: 7.77, vat_rate: 6, vat_category: 3 },
      ],
      p_vat_inclusive: true, p_currency: 'EUR', p_payment_method_code: 3,
      p_customer_company_id: null, p_customer_contact_id: null,
      p_has_shipping: false, p_vehicle_number: null, p_ship_to: null, p_move_purpose: null,
      p_client_token: token,
    };
    const before = await svc.from('invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);

    const one = await A.client.rpc('pos_issue_receipt', args);
    const two = await A.client.rpc('pos_issue_receipt', args);
    expect(one.error).toBeNull();
    expect(two.error).toBeNull();
    const r1 = Array.isArray(one.data) ? one.data[0] : one.data;
    const r2 = Array.isArray(two.data) ? two.data[0] : two.data;

    // Same document, same legal number — and the replayed answer is derived from what was STORED,
    // so the register can print from it exactly as it prints a first issue.
    expect(r2.invoice_id).toBe(r1.invoice_id);
    expect(r2.internal_number).toBe(r1.internal_number);
    expect(Number(r2.net)).toBe(Number(r1.net));
    expect(Number(r2.vat)).toBe(Number(r1.vat));
    expect(r2.by_rate).toEqual(r1.by_rate);

    const after = await svc.from('invoices').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
    expect((after.count ?? 0) - (before.count ?? 0)).toBe(1);

    // A different basket with its own token is a different sale — the token must not swallow the
    // next customer.
    const three = await A.client.rpc('pos_issue_receipt', { ...args, p_client_token: `${token}-b` });
    expect(three.error).toBeNull();
    const r3 = Array.isArray(three.data) ? three.data[0] : three.data;
    expect(r3.invoice_id).not.toBe(r1.invoice_id);
  });

  // ── 8. billing logged work is one transaction, and filtered (#351 S4/S2/S3) ─
  it('bill_time_entries_to_invoice bills only billable, unbilled, same-customer entries — once', async () => {
    const co = await svc.from('crm_companies').insert({ workspace_id: ws, name: `S4 co ${rid}` }).select('id').single();
    const other = await svc.from('crm_companies').insert({ workspace_id: ws, name: `S4 other ${rid}` }).select('id').single();
    if (co.error || other.error) throw new Error('seed companies');

    const entry = async (minutes: number, billable: boolean, company: string) => {
      const r = await svc.from('time_entries').insert({
        workspace_id: ws, user_id: A.id, work_date: new Date().toISOString().slice(0, 10),
        minutes, hourly_rate: 50, description: 'work', is_billable: billable,
        customer_company_id: company,
      }).select('id').single();
      if (r.error) throw new Error(`seed entry: ${r.error.message}`);
      return r.data.id as string;
    };
    const billable = await entry(90, true, co.data.id);
    const notBillable = await entry(60, false, co.data.id);
    const elsewhere = await entry(60, true, other.data.id);

    // An entry logged against another customer stops the whole call rather than being billed to
    // whoever the operator happened to select.
    const wrong = await A.client.rpc('bill_time_entries_to_invoice', {
      p_workspace_id: ws, p_customer_company_id: co.data.id, p_customer_contact_id: null,
      p_entry_ids: [billable, elsewhere], p_vat_rate: 24,
    });
    expect(wrong.error).not.toBeNull();
    expect(wrong.error!.message).toContain('attributed_to_another_customer');

    const ok = await A.client.rpc('bill_time_entries_to_invoice', {
      p_workspace_id: ws, p_customer_company_id: co.data.id, p_customer_contact_id: null,
      p_entry_ids: [billable, notBillable], p_vat_rate: 24,
    });
    expect(ok.error).toBeNull();

    // 1.5h x 50 = 75 — the non-billable hour is not in it, and its row is untouched.
    const { data: created } = await svc.from('invoices')
      .select('subtotal_net, vat_amount, total').eq('id', ok.data as string).single();
    expect(Number(created!.subtotal_net)).toBe(75);
    expect(Number(created!.vat_amount)).toBe(18);
    const { data: lines } = await svc.from('invoice_items').select('id').eq('invoice_id', ok.data as string);
    expect(lines).toHaveLength(1);
    const { data: untouched } = await svc.from('time_entries')
      .select('billed_invoice_id').eq('id', notBillable).single();
    expect(untouched!.billed_invoice_id).toBeNull();

    // The retry — the actual finding. The stamp is inside the same transaction, so there is
    // nothing left unbilled for a second invoice to pick up.
    const retry = await A.client.rpc('bill_time_entries_to_invoice', {
      p_workspace_id: ws, p_customer_company_id: co.data.id, p_customer_contact_id: null,
      p_entry_ids: [billable, notBillable], p_vat_rate: 24,
    });
    expect(retry.error).not.toBeNull();
  });
});
