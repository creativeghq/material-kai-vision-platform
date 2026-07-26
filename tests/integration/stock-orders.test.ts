import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, grantModule, teardown, runId, type TestUser } from './_harness';

// Stock ↔ Orders pure-SQL invariants (shipped 2026-07-26). Like money-paths, these are SECURITY
// DEFINER functions + triggers where being silently wrong loses stock/money: neither the route-load
// smoke nor the plpgsql lint says anything about whether the DECREMENT ARITHMETIC and the RESERVATION
// LIFECYCLE are right. We drive the fixtures with the service client (triggers fire regardless of
// caller); issue_delivery_note is called with the OWNER JWT because it calls assert_workspace_member.
const suite = hasCreds ? describe : describe.skip;

suite('stock ↔ orders · reservation + unified delivery', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser;
  let ws = '', whId = '';

  // create a catalog product; returns its id
  async function makeProduct(label: string, sku?: string): Promise<string> {
    const { data, error } = await svc.from('products')
      .insert({ workspace_id: ws, name: `E2E ${label} ${rid}`, sku: sku ?? null }).select('id').single();
    if (error) throw new Error(`makeProduct(${label}): ${error.message}`);
    return data.id;
  }
  // create a stock row for a product in the default warehouse with a given on-hand
  async function makeStock(productId: string, onHand: number): Promise<string> {
    const { data, error } = await svc.from('warehouse_items')
      .insert({ workspace_id: ws, warehouse_id: whId, product_id: productId, name: `stock ${rid}`, unit: 'pcs', qty_on_hand: onHand, qty_reserved: 0 })
      .select('id').single();
    if (error) throw new Error(`makeStock: ${error.message}`);
    return data.id;
  }
  // draft sales order → add a line → flip to confirmed (fires the reserve trigger)
  async function makeConfirmedOrder(productId: string, qty: number, updateWarehouse = true): Promise<{ oId: string; oiId: string }> {
    const { data: o } = await svc.from('orders')
      .insert({ workspace_id: ws, order_type: 'sales', status: 'draft', created_by: A.id }).select('id').single();
    const { data: oi } = await svc.from('order_items')
      .insert({ order_id: o!.id, workspace_id: ws, product_id: productId, description: 'line', quantity: qty, unit_price: 0, net_value: 0, line_total: 0, sort_order: 0, update_warehouse: updateWarehouse })
      .select('id').single();
    await svc.from('orders').update({ status: 'confirmed' }).eq('id', o!.id);
    return { oId: o!.id, oiId: oi!.id };
  }
  async function qtys(itemId: string): Promise<{ on_hand: number; reserved: number }> {
    const { data } = await svc.from('warehouse_items').select('qty_on_hand, qty_reserved').eq('id', itemId).single();
    return { on_hand: Number(data!.qty_on_hand), reserved: Number(data!.qty_reserved) };
  }
  async function outMoves(itemId: string): Promise<number> {
    const { data } = await svc.from('stock_movements').select('direction, quantity').eq('item_id', itemId);
    return (data ?? []).filter((m: any) => m.direction === 'out').reduce((a: number, m: any) => a + Number(m.quantity), 0);
  }
  async function allocStatuses(oiId: string): Promise<Array<{ status: string; quantity: number }>> {
    const { data } = await svc.from('stock_allocations').select('status, quantity').eq('demand_type', 'order_item').eq('demand_id', oiId);
    return (data ?? []).map((r: any) => ({ status: r.status, quantity: Number(r.quantity) }));
  }

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'stockA', rid);
    ws = await createWorkspace(svc, 'wsStock', rid, A.id);
    await addMember(svc, ws, A.id, 'owner');
    await grantModule(svc, ws, 'stock'); // record_stock_movement / import_opening_stock require the entitlement
    const { data: w } = await svc.from('warehouses').insert({ workspace_id: ws, name: 'Main', is_default: true }).select('id').single();
    whId = w!.id;
  });

  afterAll(async () => {
    await svc.from('stock_movements').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('stock_allocations').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('delivery_notes').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('order_items').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('orders').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('warehouse_items').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('warehouses').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('products').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await teardown(svc, { wsIds: [ws], userIds: [A.id] });
  });

  it('auto-reserves free stock when a sales order is confirmed', async () => {
    const p = await makeProduct('reserve');
    const wi = await makeStock(p, 100);
    const { oId } = await makeConfirmedOrder(p, 10);
    expect(oId).toBeTruthy();
    const q = await qtys(wi);
    expect(q.on_hand).toBe(100);       // reservation holds, does not decrement on-hand
    expect(q.reserved).toBe(10);
  });

  it('caps the reservation at available free stock', async () => {
    const p = await makeProduct('cap');
    const wi = await makeStock(p, 3);
    await makeConfirmedOrder(p, 10);   // wants 10, only 3 free
    expect((await qtys(wi)).reserved).toBe(3);
  });

  it('delivering moves stock exactly once, releases the hold, and is idempotent', async () => {
    const p = await makeProduct('deliver');
    const wi = await makeStock(p, 100);
    const { oId, oiId } = await makeConfirmedOrder(p, 10);
    expect((await qtys(wi)).reserved).toBe(10);

    const { data: st1, error } = await A.client.rpc('deliver_order_line', { p_order: oId, p_item: oiId, p_qty: 10 });
    expect(error).toBeNull();
    expect(st1).toBe('fulfilled');

    let q = await qtys(wi);
    expect(q.on_hand).toBe(90);        // moved once
    expect(q.reserved).toBe(0);        // hold released
    expect(await outMoves(wi)).toBe(10);
    expect((await allocStatuses(oiId)).every((a) => a.status === 'dispatched')).toBe(true);

    // Re-delivering the SAME quantity is a no-op (delta 0) — the core anti-double-decrement guarantee.
    await A.client.rpc('deliver_order_line', { p_order: oId, p_item: oiId, p_qty: 10 });
    q = await qtys(wi);
    expect(q.on_hand).toBe(90);
    expect(await outMoves(wi)).toBe(10);
  });

  it('a dispatch note fulfilling an already-delivered order does not double-decrement', async () => {
    const p = await makeProduct('dispatch-after');
    const wi = await makeStock(p, 50);
    const { oId, oiId } = await makeConfirmedOrder(p, 10);
    // ship via the order UI first
    await A.client.rpc('deliver_order_line', { p_order: oId, p_item: oiId, p_qty: 10 });
    expect((await qtys(wi)).on_hand).toBe(40);

    // now cut + issue a dispatch note linked to the SAME order
    const { data: dn } = await svc.from('delivery_notes')
      .insert({ workspace_id: ws, kind: 'dispatch', order_id: oId, status: 'draft', branch_code: 0 }).select('id').single();
    await svc.from('delivery_note_items').insert({ delivery_note_id: dn!.id, product_id: p, warehouse_item_id: wi, description: 'line', quantity: 10 });
    const { error } = await A.client.rpc('issue_delivery_note', { p_id: dn!.id });
    expect(error).toBeNull();

    expect((await qtys(wi)).on_hand).toBe(40); // STILL 40 — the line was already delivered, so no second move
    const { data: issued } = await svc.from('delivery_notes').select('status').eq('id', dn!.id).single();
    expect(issued!.status).toBe('issued');
  });

  it('shipping via the dispatch note first also moves stock exactly once', async () => {
    const p = await makeProduct('dispatch-first');
    const wi = await makeStock(p, 50);
    const { oId, oiId } = await makeConfirmedOrder(p, 10);

    const { data: dn } = await svc.from('delivery_notes')
      .insert({ workspace_id: ws, kind: 'dispatch', order_id: oId, status: 'draft', branch_code: 0 }).select('id').single();
    await svc.from('delivery_note_items').insert({ delivery_note_id: dn!.id, product_id: p, warehouse_item_id: wi, description: 'line', quantity: 10 });
    await A.client.rpc('issue_delivery_note', { p_id: dn!.id });

    let q = await qtys(wi);
    expect(q.on_hand).toBe(40);
    expect(q.reserved).toBe(0);
    // order line is now marked delivered → the Orders UI setting delivered=10 is a no-op
    await A.client.rpc('deliver_order_line', { p_order: oId, p_item: oiId, p_qty: 10 });
    expect((await qtys(wi)).on_hand).toBe(40);
  });

  it('a line flagged update_warehouse=false never touches stock', async () => {
    const p = await makeProduct('nowh');
    const wi = await makeStock(p, 50);
    const { oId, oiId } = await makeConfirmedOrder(p, 10, /* updateWarehouse */ false);
    expect((await qtys(wi)).reserved).toBe(0);         // not reserved
    await A.client.rpc('deliver_order_line', { p_order: oId, p_item: oiId, p_qty: 10 });
    expect((await qtys(wi)).on_hand).toBe(50);          // not decremented
  });

  it('cancelling an order releases its reservation', async () => {
    const p = await makeProduct('cancel');
    const wi = await makeStock(p, 50);
    const { oId } = await makeConfirmedOrder(p, 10);
    expect((await qtys(wi)).reserved).toBe(10);
    await svc.from('orders').update({ status: 'cancelled' }).eq('id', oId);
    expect((await qtys(wi)).reserved).toBe(0);
  });

  it('opening-balance import creates rows, matches SKUs, and re-import reconciles (no double-count)', async () => {
    // plain SKU (no catalog product) → creates an unlinked stock row
    const r1: any = await A.client.rpc('import_opening_stock', {
      p_workspace_id: ws, p_warehouse_id: whId,
      p_lines: [{ sku: `OPEN-${rid}`, qty: 25, name: 'Opening item' }],
    });
    expect(r1.error).toBeNull();
    let { data: row } = await svc.from('warehouse_items').select('id, qty_on_hand, product_id')
      .eq('workspace_id', ws).eq('warehouse_id', whId).eq('sku', `OPEN-${rid}`).single();
    expect(Number(row!.qty_on_hand)).toBe(25);
    expect(row!.product_id).toBeNull();

    // re-import the same sheet → 'adjust' sets the on-hand, it does NOT accumulate
    await A.client.rpc('import_opening_stock', { p_workspace_id: ws, p_warehouse_id: whId, p_lines: [{ sku: `OPEN-${rid}`, qty: 25 }] });
    ({ data: row } = await svc.from('warehouse_items').select('id, qty_on_hand, product_id')
      .eq('workspace_id', ws).eq('warehouse_id', whId).eq('sku', `OPEN-${rid}`).single());
    expect(Number(row!.qty_on_hand)).toBe(25);

    // a SKU that matches a catalog product links the stock row to it
    const matchSku = `MATCH-${rid}`;
    const pid = await makeProduct('match', matchSku);
    await A.client.rpc('import_opening_stock', { p_workspace_id: ws, p_warehouse_id: whId, p_lines: [{ sku: matchSku, qty: 7 }] });
    const { data: linked } = await svc.from('warehouse_items').select('qty_on_hand, product_id')
      .eq('workspace_id', ws).eq('warehouse_id', whId).eq('product_id', pid).single();
    expect(Number(linked!.qty_on_hand)).toBe(7);
    expect(linked!.product_id).toBe(pid);
  });
});
