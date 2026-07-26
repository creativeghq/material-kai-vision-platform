import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

// Customer "Order again" (finance-customer-documents · action=reorder). This is a CROSS-WORKSPACE
// write — a customer creating a draft order inside the issuing business's workspace — so the whole
// point is the ownership gate: only the user linked (via crm_contacts.user_id) to the order's
// customer may reorder it, and the copy lands as a DRAFT the business reviews.
const suite = hasCreds ? describe : describe.skip;

suite('customer reorder · finance-customer-documents', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let BIZ: TestUser;   // the business (owns the workspace + the order)
  let CUST: TestUser;  // the customer (linked to the order via a crm_contact)
  let OTHER: TestUser; // an unrelated user — must NOT be able to reorder
  let wsBiz = '', contactId = '', srcOrder = '', srcPriced = '', pricedProduct = '';

  beforeAll(async () => {
    svc = serviceClient();
    BIZ = await createUser(svc, 'reorderBiz', rid);
    CUST = await createUser(svc, 'reorderCust', rid);
    OTHER = await createUser(svc, 'reorderOther', rid);
    wsBiz = await createWorkspace(svc, 'wsReorder', rid, BIZ.id);
    await addMember(svc, wsBiz, BIZ.id, 'owner');

    // Link the customer's app account to a CRM contact in the business's workspace.
    const { data: c } = await svc.from('crm_contacts')
      .insert({ workspace_id: wsBiz, name: `Customer ${rid}`, user_id: CUST.id }).select('id').single();
    contactId = c!.id;

    // A fulfilled sales order addressed to that contact, with two ad-hoc lines.
    const { data: o } = await svc.from('orders')
      .insert({ workspace_id: wsBiz, order_type: 'sales', status: 'fulfilled', customer_contact_id: contactId, created_by: BIZ.id, currency: 'EUR', subtotal_net: 30, vat_amount: 7.2, total: 37.2 })
      .select('id').single();
    srcOrder = o!.id;
    await svc.from('order_items').insert([
      { order_id: srcOrder, workspace_id: wsBiz, description: 'Widget A', quantity: 2, unit_price: 10, net_value: 20, vat_amount: 4.8, line_total: 20, sort_order: 0 },
      { order_id: srcOrder, workspace_id: wsBiz, description: 'Widget B', quantity: 1, unit_price: 10, net_value: 10, vat_amount: 2.4, line_total: 10, sort_order: 1 },
    ]);

    // A catalog product whose CURRENT list price (20) differs from the historical order line (10) —
    // so re-pricing has something to change.
    const { data: pr } = await svc.from('products').insert({ workspace_id: wsBiz, name: `Priced ${rid}` }).select('id').single();
    pricedProduct = pr!.id;
    await svc.from('product_prices').insert({ workspace_id: wsBiz, product_id: pricedProduct, list_price: 20, currency: 'EUR' });
    const { data: op } = await svc.from('orders')
      .insert({ workspace_id: wsBiz, order_type: 'sales', status: 'fulfilled', customer_contact_id: contactId, created_by: BIZ.id, currency: 'EUR', subtotal_net: 10, vat_amount: 2.4, total: 12.4 })
      .select('id').single();
    srcPriced = op!.id;
    await svc.from('order_items').insert({ order_id: srcPriced, workspace_id: wsBiz, product_id: pricedProduct, description: 'Priced item', quantity: 1, unit_price: 10, vat_percent: 24, net_value: 10, vat_amount: 2.4, line_total: 10, sort_order: 0 });
  });

  afterAll(async () => {
    await svc.from('order_items').delete().eq('workspace_id', wsBiz).then(() => {}, () => {});
    await svc.from('orders').delete().eq('workspace_id', wsBiz).then(() => {}, () => {});
    await svc.from('product_prices').delete().eq('workspace_id', wsBiz).then(() => {}, () => {});
    await svc.from('products').delete().eq('workspace_id', wsBiz).then(() => {}, () => {});
    await svc.from('crm_contacts').delete().eq('workspace_id', wsBiz).then(() => {}, () => {});
    await teardown(svc, { wsIds: [wsBiz], userIds: [BIZ.id, CUST.id, OTHER.id] });
  });

  it('the linked customer can reorder → a new DRAFT lands in the business workspace with the same lines', async () => {
    const { data, error } = await CUST.client.functions.invoke('finance-customer-documents', {
      body: { action: 'reorder', order_id: srcOrder },
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.order_id).toBeTruthy();
    expect(data.order_id).not.toBe(srcOrder);

    const { data: dup } = await svc.from('orders')
      .select('workspace_id, order_type, status, customer_contact_id, total, notes').eq('id', data.order_id).single();
    expect(dup!.workspace_id).toBe(wsBiz);
    expect(dup!.order_type).toBe('sales');
    expect(dup!.status).toBe('draft');                 // a request the business reviews, not a live order
    expect(dup!.customer_contact_id).toBe(contactId);
    expect(Number(dup!.total)).toBe(37.2);
    expect(String(dup!.notes)).toMatch(/reorder/i);

    const { data: dupItems } = await svc.from('order_items').select('description, quantity').eq('order_id', data.order_id).order('sort_order');
    expect(dupItems).toHaveLength(2);
    expect(dupItems!.map((i: any) => i.description)).toEqual(['Widget A', 'Widget B']);
  });

  it('preview reports the price change WITHOUT creating an order', async () => {
    const before = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('workspace_id', wsBiz);
    const { data, error } = await CUST.client.functions.invoke('finance-customer-documents', {
      body: { action: 'reorder', order_id: srcPriced, preview: true },
    });
    expect(error).toBeNull();
    expect(data?.preview).toBe(true);
    expect(data?.reprice?.changed).toBe(1);            // list price 20 vs historical 10
    const line = (data.reprice.lines as any[])[0];
    expect(Number(line.old_unit_price)).toBe(10);
    expect(Number(line.new_unit_price)).toBe(20);
    expect(Number(data.total)).toBe(24.8);             // 20 net + 24% VAT
    const after = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('workspace_id', wsBiz);
    expect(after.count).toBe(before.count);            // preview wrote nothing
  });

  it('reorder re-prices catalog lines at the current price', async () => {
    const { data, error } = await CUST.client.functions.invoke('finance-customer-documents', {
      body: { action: 'reorder', order_id: srcPriced },
    });
    expect(error).toBeNull();
    expect(data?.ok).toBe(true);
    expect(data?.reprice?.changed).toBe(1);
    const { data: items } = await svc.from('order_items').select('unit_price, net_value, line_total').eq('order_id', data.order_id);
    expect(Number(items![0].unit_price)).toBe(20);     // re-priced from 10 → current 20
    expect(Number(items![0].line_total)).toBe(20);
  });

  it('an unrelated user cannot reorder someone else\'s order (404, nothing created)', async () => {
    const before = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('workspace_id', wsBiz);
    const { error } = await OTHER.client.functions.invoke('finance-customer-documents', {
      body: { action: 'reorder', order_id: srcOrder },
    });
    expect(error).not.toBeNull(); // 404 Not found — no order-id enumeration
    const after = await svc.from('orders').select('id', { count: 'exact', head: true }).eq('workspace_id', wsBiz);
    expect(after.count).toBe(before.count); // no draft was created
  });
});
