import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

const suite = hasCreds ? describe : describe.skip;

suite('inbound document attachments', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let OWNER: TestUser;
  let OUTSIDER: TestUser;
  let ws = '';
  let seq = 0;

  const doc = async (net: number, vat: number, docType = '1.1') => {
    seq += 1;
    const { data, error } = await svc.from('inbound_documents').insert({
      workspace_id: ws, source: 'mydata', status: 'new', doc_type: docType, currency: 'EUR',
      total_net: net, total_vat: vat, total_gross: net + vat, series: 'T', aa: String(seq),
      issuer_name: `Supplier ${rid}`, source_ref: { mark: `4${rid}${seq}` },
    }).select('id').single();
    if (error) throw error;
    return data!.id as string;
  };

  const purchaseOrder = async (net: number, vat: number) => {
    const { data, error } = await svc.from('orders').insert({
      workspace_id: ws, order_type: 'purchase', status: 'confirmed', currency: 'EUR',
      subtotal_net: net, vat_amount: vat, total: net + vat,
    }).select('id').single();
    if (error) throw error;
    return data!.id as string;
  };

  const payOrder = async (orderId: string, amount: number) => {
    const { data, error } = await svc.from('payments').insert({
      workspace_id: ws, direction: 'out', amount, currency: 'EUR', method: 'bank_transfer', paid_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    const { error: allocErr } = await svc.from('payment_allocations').insert({
      payment_id: data!.id, order_id: orderId, amount, amount_doc_currency: amount,
    });
    if (allocErr) throw allocErr;
  };

  const feedLine = async (amount: number) => {
    seq += 1;
    const tx = `tx-${rid}-${seq}`;
    const { data, error } = await svc.from('revolut_bank_transactions').insert({
      workspace_id: ws, revolut_account_id: 'acct', provider: 'revolut', provider_ref: `${tx}:leg`, transaction_id: tx,
      state: 'completed', type: 'transfer', direction: 'out', amount, currency: 'EUR', legs_total: 1,
      match_status: 'unmatched', booked_at: new Date().toISOString(),
    }).select('id').single();
    if (error) throw error;
    return data!.id as string;
  };

  const bill = async (id: string) => {
    const { data } = await svc.from('supplier_bills').select('status, amount_due').eq('id', id).single();
    return { status: data!.status as string, due: Number(data!.amount_due) };
  };

  const lineStatus = async (id: string) => {
    const { data } = await svc.from('revolut_bank_transactions').select('match_status, reconciled_payment_id').eq('id', id).single();
    return data!;
  };

  const attachOrder = async (docId: string, orderId: string, net?: number) => {
    const { data, error } = await OWNER.client.rpc('attach_order_to_inbound_doc', { p_doc_id: docId, p_order_id: orderId, p_net_amount: net ?? null });
    if (error) throw new Error(error.message);
    return data as Record<string, any>;
  };

  const attachLine = async (docId: string, lineId: string, amount?: number) => {
    const { data, error } = await OWNER.client.rpc('attach_payment_to_inbound_doc', { p_doc_id: docId, p_feed_row_id: lineId, p_amount: amount ?? null });
    if (error) throw new Error(error.message);
    return data as Record<string, any>;
  };

  beforeAll(async () => {
    svc = serviceClient();
    OWNER = await createUser(svc, 'attachOwner', rid);
    OUTSIDER = await createUser(svc, 'attachOutsider', rid);
    ws = await createWorkspace(svc, 'wsAttach', rid, OWNER.id);
    await addMember(svc, ws, OWNER.id, 'owner');
  });

  afterAll(async () => {
    const { data: pays } = await svc.from('payments').select('id').eq('workspace_id', ws);
    const ids = (pays ?? []).map((p) => p.id);
    if (ids.length) await svc.from('payment_allocations').delete().in('payment_id', ids).then(() => {}, () => {});
    await svc.from('revolut_bank_transactions').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('payments').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('inbound_documents').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('supplier_bills').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await svc.from('orders').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await teardown(svc, { wsIds: [ws], userIds: [OWNER.id, OUTSIDER.id] });
  });

  it('a euro document becomes an expense, though a euro document stores no FX rate', async () => {
    const id = await doc(100, 24);
    const { data, error } = await OWNER.client.rpc('inbound_doc_to_supplier_bill', { p_doc_id: id });
    expect(error, error?.message).toBeNull();
    expect(data).toBeTruthy();
  });

  it('a shipping document never becomes an expense, even carrying the invoice amount', async () => {
    for (const [net, vat] of [[0, 0], [100, 24]]) {
      const id = await doc(net, vat, '9.3');
      const direct = await OWNER.client.rpc('inbound_doc_to_supplier_bill', { p_doc_id: id });
      expect(direct.error?.message).toMatch(/shipping document/);
      await expect(attachLine(id, await feedLine(10))).rejects.toThrow(/shipping document/);
    }
  });

  it('an order paid first settles the invoice attached to it later', async () => {
    const orderId = await purchaseOrder(100, 24);
    await payOrder(orderId, 124);
    const out = await attachOrder(await doc(100, 24), orderId);
    expect(Number(out.carried_from_order)).toBe(124);
    expect(await bill(out.supplier_bill_id)).toEqual({ status: 'paid', due: 0 });
  });

  it('an invoice attached first is settled by paying the order later', async () => {
    const orderId = await purchaseOrder(50, 12);
    const out = await attachOrder(await doc(50, 12), orderId);
    expect((await bill(out.supplier_bill_id)).status).toBe('received');
    await payOrder(orderId, 62);
    expect(await bill(out.supplier_bill_id)).toEqual({ status: 'paid', due: 0 });
    const { data } = await OWNER.client.rpc('get_order_settlements', { p_order_ids: [orderId] });
    expect(data![0].payment_status).toBe('paid');
  });

  it('removing the order hands its money back, and the invoice owes again', async () => {
    const orderId = await purchaseOrder(10, 2.4);
    await payOrder(orderId, 12.4);
    const docId = await doc(10, 2.4);
    const out = await attachOrder(docId, orderId);
    const { error } = await OWNER.client.rpc('detach_order_from_inbound_doc', { p_doc_id: docId, p_order_id: orderId });
    expect(error, error?.message).toBeNull();
    expect(await bill(out.supplier_bill_id)).toEqual({ status: 'received', due: 12.4 });
    const { data } = await OWNER.client.rpc('get_order_settlements', { p_order_ids: [orderId] });
    expect(data![0].payment_status).toBe('paid');
  });

  it('one transfer pays several invoices, and the line says how far it has got', async () => {
    const line = await feedLine(300);
    const first = await attachLine(await doc(100, 24), line);
    expect(Number(first.applied)).toBe(124);
    expect(first.line_status).toBe('partial');
    const second = await attachLine(await doc(141.94, 34.06), line);
    expect(Number(second.applied)).toBe(176);
    expect(second.line_status).toBe('matched');
    expect(await bill(first.supplier_bill_id)).toEqual({ status: 'paid', due: 0 });
    expect(await bill(second.supplier_bill_id)).toEqual({ status: 'paid', due: 0 });
  });

  it('pressing attach twice allocates once', async () => {
    const line = await feedLine(50);
    const docId = await doc(100, 24);
    const first = await attachLine(docId, line, 20);
    const again = await attachLine(docId, line, 20);
    expect(again.already_attached).toBe(true);
    expect(again.allocation_id).toBe(first.allocation_id);
    expect((await bill(first.supplier_bill_id)).due).toBe(104);
  });

  it('removing the last payment returns the bank line to the queue and removes the payment', async () => {
    const line = await feedLine(20);
    const out = await attachLine(await doc(100, 24), line);
    const { error } = await OWNER.client.rpc('detach_payment_from_inbound_doc', { p_allocation_id: out.allocation_id });
    expect(error, error?.message).toBeNull();
    const after = await lineStatus(line);
    expect(after.match_status).toBe('unmatched');
    expect(after.reconciled_payment_id).toBeNull();
    const { data: pay } = await svc.from('payments').select('id').eq('id', out.payment_id).maybeSingle();
    expect(pay).toBeNull();
  });

  it('one invoice over two orders settles each order for its own share', async () => {
    const paidFirst = await purchaseOrder(600, 144);
    const second = await purchaseOrder(400, 96);
    await payOrder(paidFirst, 744);
    const docId = await doc(1000, 240);
    const out = await attachOrder(docId, paidFirst);
    await attachOrder(docId, second, 400);

    const read = async () => {
      const { data } = await OWNER.client.rpc('get_order_settlements', { p_order_ids: [paidFirst, second] });
      return Object.fromEntries((data ?? []).map((r: any) => [r.order_id, r.payment_status]));
    };
    expect(await read()).toEqual({ [paidFirst]: 'paid', [second]: 'unpaid' });

    await attachLine(docId, await feedLine(496));
    expect(await read()).toEqual({ [paidFirst]: 'paid', [second]: 'paid' });
    expect(await bill(out.supplier_bill_id)).toEqual({ status: 'paid', due: 0 });
  });

  it('a transfer between our own pockets cannot settle anything', async () => {
    const line = await feedLine(40);
    const { data: row } = await svc.from('revolut_bank_transactions').select('transaction_id').eq('id', line).single();
    await svc.from('revolut_bank_transactions').update({ legs_total: 2 }).eq('id', line);
    await svc.from('revolut_bank_transactions').insert({
      workspace_id: ws, revolut_account_id: 'acct2', provider: 'revolut', provider_ref: `${row!.transaction_id}:in`, transaction_id: row!.transaction_id,
      state: 'completed', type: 'transfer', direction: 'in', amount: 40, currency: 'EUR', legs_total: 2, match_status: 'unmatched',
    });
    await expect(attachLine(await doc(100, 24), line)).rejects.toThrow(/your own accounts/);
  });

  it('a stranger gets not-found, for a document or a bank line', async () => {
    const docId = await doc(100, 24);
    const attach = await OUTSIDER.client.rpc('attach_payment_to_inbound_doc', { p_doc_id: docId, p_feed_row_id: await feedLine(10) });
    expect(attach.error?.message).toMatch(/not found/);
    const suggest = await OUTSIDER.client.rpc('suggest_payments_for_inbound_doc', { p_doc_id: docId });
    expect(suggest.error?.message).toMatch(/not found/);
  });
});
