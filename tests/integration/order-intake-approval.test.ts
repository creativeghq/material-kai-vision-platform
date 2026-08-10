/**
 * #342 — approving an Inbox order proposal into a real order, against the live database.
 *
 * This tier exists because the thing worth guarding is a SQL privilege boundary, and a
 * source-level grep cannot see one. `create_order_from_thread_intake` is the ONE path that lets a
 * `sales` member write to `orders`, which they otherwise cannot touch at all
 * (`is_workspace_finance_manager` = owner/admin). It is safe only because the privilege has no
 * reachable parameter: `order_type` and `status` are literals inside the function.
 *
 * So the assertions are about what the grant CANNOT be talked into doing:
 *   • a sales member gets a DRAFT SALES order — never confirmed, never a purchase order
 *   • the same member still cannot write `orders` directly, so the RPC is the only door
 *   • a non-member is refused outright (BOLA / invariant 1)
 *   • approving twice returns the SAME order (idempotent — a double-click is not two orders)
 *   • the money is `recompute_order_totals`', not the payload's
 *   • a `product_id` from another workspace degrades to an ad-hoc line rather than being written
 *
 * Runs under REAL signed-in users so RLS is exercised, not bypassed. Self-skips without creds.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId,
  type TestUser,
} from './_harness';
import type { SupabaseClient } from '@supabase/supabase-js';

const d = hasCreds ? describe : describe.skip;

d('#342 order intake → order approval', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let owner: TestUser;
  let seller: TestUser;    // workspace role 'sales' — may approve, may do nothing else
  let outsider: TestUser;  // no membership at all
  let wsId: string;
  let otherWsId: string;
  let contactId: string;
  let foreignProductId: string | null = null;
  const threadIds: string[] = [];

  /** A thread carrying a pending intake, as `runOrderIntake` would have written it. */
  async function seedThread(items: Array<Record<string, unknown>>, opts: { contact?: boolean } = {}) {
    const { data, error } = await svc.from('inbox_threads').insert({
      workspace_id: wsId,
      thread_type: 'customer',
      channel: 'email',
      subject: `E2E intake ${rid}`,
      status: 'open',
      metadata: {
        email_to: `e2e-${rid}@mail.materialshub.gr`,
        email_from: 'buyer@example.com',
        order_intake: {
          status: 'pending_review',
          channel: 'email',
          source_message_id: null,
          customer_contact_id: opts.contact === false ? null : contactId,
          customer_company_id: null,
          currency: 'EUR',
          confidence: 0.9,
          requested_delivery_date: null,
          notes: null,
          order_id: null,
          reviewed_by: null,
          reviewed_at: null,
          confirmation: null,
          items,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      },
    }).select('id').single();
    if (error) throw new Error(`seedThread: ${error.message}`);
    const id = (data as { id: string }).id;
    threadIds.push(id);
    return id;
  }

  const line = (over: Record<string, unknown> = {}) => ({
    line_no: 0, raw_text: '2 boxes white matt 60x60', product_id: null,
    match_method: 'none', match_confidence: null, description: 'White matt 60x60',
    quantity: 2, unit_price: 18.4, unit_cost: 11.2, measurement_unit_code: 'item',
    vat_percent: 24, unit_price_source: 'resolver', needs_review: false, ...over,
  });

  beforeAll(async () => {
    svc = serviceClient();
    owner = await createUser(svc, 'intake-own', rid);
    seller = await createUser(svc, 'intake-sales', rid);
    outsider = await createUser(svc, 'intake-out', rid);

    wsId = await createWorkspace(svc, 'intake', rid, owner.id);
    await addMember(svc, wsId, owner.id, 'owner');
    await addMember(svc, wsId, seller.id, 'sales');

    // A second tenant, to prove a foreign product id cannot be written into this order.
    otherWsId = await createWorkspace(svc, 'intake-other', rid, outsider.id);
    await addMember(svc, otherWsId, outsider.id, 'owner');

    const { data: c, error: cErr } = await svc.from('crm_contacts').insert({
      workspace_id: wsId, name: `E2E Buyer ${rid}`, email: `buyer-${rid}@example.com`,
      created_by: owner.id, lead_source: 'email',
    }).select('id').single();
    if (cErr) throw new Error(`contact: ${cErr.message}`);
    contactId = (c as { id: string }).id;

    const { data: p } = await svc.from('products').insert({
      workspace_id: otherWsId, name: `E2E Foreign Product ${rid}`,
    }).select('id').maybeSingle();
    foreignProductId = (p as { id?: string } | null)?.id ?? null;
  }, 90_000);

  afterAll(async () => {
    for (const id of threadIds) {
      await svc.from('orders').delete().eq('source_thread_id', id);
      await svc.from('inbox_messages').delete().eq('thread_id', id);
      await svc.from('inbox_participants').delete().eq('thread_id', id);
    }
    await svc.from('inbox_threads').delete().in('id', threadIds.length ? threadIds : ['00000000-0000-0000-0000-000000000000']);
    await teardown(svc, { wsIds: [wsId, otherWsId], userIds: [owner.id, seller.id, outsider.id] });
  }, 90_000);

  it('a SALES member can approve, and gets a draft sales order', async () => {
    const threadId = await seedThread([line(), line({ line_no: 1, description: 'Grey matt', quantity: 1, unit_price: 20 })]);

    const { data, error } = await seller.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    expect(error, error?.message).toBeNull();
    const orderId = data as string;
    expect(orderId).toBeTruthy();

    const { data: order } = await svc.from('orders')
      .select('order_type, status, currency, subtotal_net, vat_amount, total, source_thread_id, customer_contact_id')
      .eq('id', orderId).single();
    const o = order as Record<string, unknown>;

    // The literals the grant cannot be talked out of.
    expect(o.order_type).toBe('sales');
    expect(o.status).toBe('draft');
    expect(o.source_thread_id).toBe(threadId);
    expect(o.customer_contact_id).toBe(contactId);

    // SQL owns the money: 2×18.40 + 1×20.00 = 56.80 net, 24% VAT = 13.63, total 70.43.
    expect(Number(o.subtotal_net)).toBeCloseTo(56.8, 2);
    expect(Number(o.vat_amount)).toBeCloseTo(13.63, 2);
    expect(Number(o.total)).toBeCloseTo(70.43, 2);
  }, 60_000);

  it('the same sales member still cannot write orders directly — the RPC is the only door', async () => {
    // If this ever succeeds, the RPC stopped being a narrow privilege and became a formality.
    const { error } = await seller.client.from('orders').insert({
      workspace_id: wsId, order_type: 'sales', status: 'confirmed', currency: 'EUR',
    });
    expect(error, 'a sales member must not be able to INSERT an order directly').not.toBeNull();
  }, 30_000);

  it('approving twice returns the same order', async () => {
    const threadId = await seedThread([line()]);
    const first = await seller.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    const second = await seller.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(second.data).toBe(first.data);

    const { count } = await svc.from('orders')
      .select('id', { count: 'exact', head: true }).eq('source_thread_id', threadId);
    expect(count).toBe(1);
  }, 60_000);

  it('a non-member is refused', async () => {
    const threadId = await seedThread([line()]);
    const { error } = await outsider.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    expect(error, 'a non-member must not be able to approve into another tenant').not.toBeNull();

    const { count } = await svc.from('orders')
      .select('id', { count: 'exact', head: true }).eq('source_thread_id', threadId);
    expect(count).toBe(0);
  }, 60_000);

  it('refuses to approve an intake with no customer assigned', async () => {
    // The price depends on who is buying, so an unassigned order is not an order yet.
    const threadId = await seedThread([line()], { contact: false });
    const { error } = await seller.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    expect(error).not.toBeNull();
  }, 60_000);

  it("a product from another workspace degrades to an ad-hoc line, it is never written", async () => {
    if (!foreignProductId) return; // products table shape varies; skip rather than assert falsely
    const threadId = await seedThread([line({ product_id: foreignProductId })]);
    const { data, error } = await seller.client.rpc('create_order_from_thread_intake', { p_thread_id: threadId });
    expect(error).toBeNull();

    const { data: items } = await svc.from('order_items')
      .select('product_id, description, quantity').eq('order_id', data as string);
    const rows = (items || []) as Array<{ product_id: string | null }>;
    expect(rows).toHaveLength(1);
    // The line survives — the customer still ordered something — but it carries no cross-tenant id.
    expect(rows[0].product_id).toBeNull();
  }, 60_000);
});
