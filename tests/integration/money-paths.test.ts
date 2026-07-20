import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

// The money RPCs. Nothing covered these: they are pure SQL, so neither the route-load smoke
// (which only catches white-screens) nor the plpgsql lint (which only catches broken refs) says
// anything about whether the ARITHMETIC and the TENANCY GUARDS are right — and these are the
// paths where being silently wrong costs real money.
//
// record_payment_fx is called with a REAL user JWT (it reads auth.uid() and calls
// assert_workspace_member). The credit RPCs are service-role-by-design, so those run on the
// service client — that IS their production caller.
const suite = hasCreds ? describe : describe.skip;

suite('money paths · payments + credits', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser, B: TestUser;
  let wsA = '', wsB = '', orderB = '', bankB = '';

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'moneyA', rid);
    B = await createUser(svc, 'moneyB', rid);
    wsA = await createWorkspace(svc, 'wsMoneyA', rid, A.id);
    wsB = await createWorkspace(svc, 'wsMoneyB', rid, B.id);
    await addMember(svc, wsA, A.id, 'owner');
    await addMember(svc, wsB, B.id, 'owner');

    // Fixtures owned by B — used to prove A can't reach across the tenant boundary.
    const o = await svc.from('orders').insert({ workspace_id: wsB, created_by: B.id }).select('id').maybeSingle();
    orderB = o.data?.id ?? '';
    const acct = await svc.from('finance_bank_accounts')
      .insert({ workspace_id: wsB, name: `E2E Bank ${rid}` }).select('id').maybeSingle();
    bankB = acct.data?.id ?? '';
  });

  afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      await svc.from('payments').delete().eq('workspace_id', ws).then(() => {}, () => {});
      await svc.from('orders').delete().eq('workspace_id', ws).then(() => {}, () => {});
      await svc.from('finance_bank_accounts').delete().eq('workspace_id', ws).then(() => {}, () => {});
    }
    for (const u of [A.id, B.id]) {
      await svc.from('credit_transactions').delete().eq('user_id', u).then(() => {}, () => {});
      await svc.from('user_credits').delete().eq('user_id', u).then(() => {}, () => {});
    }
    await teardown(svc, { wsIds: [wsA, wsB], userIds: [A.id, B.id] });
  });

  // ── record_payment_fx ──────────────────────────────────────────────────────
  const pay = (as: TestUser, args: Record<string, unknown>) =>
    as.client.rpc('record_payment_fx', {
      p_workspace_id: wsA, p_direction: 'in', p_amount: 100, p_currency: 'EUR',
      p_fx_rate_to_base: 1, p_method: 'bank', p_paid_at: new Date().toISOString(),
      p_counterparty_contact_id: null, p_counterparty_company_id: null,
      p_reference: `E2E ${rid}`, p_notes: null, p_allocations: null,
      p_category_id: null, p_bank_account_id: null, p_order_id: null,
      ...args,
    });

  it('records a payment for a workspace the caller belongs to', async () => {
    const { data, error } = await pay(A, {});
    expect(error).toBeNull();
    expect(data).toBeTruthy();
    const { data: row } = await svc.from('payments').select('workspace_id, amount, created_by')
      .eq('workspace_id', wsA).eq('reference', `E2E ${rid}`).maybeSingle();
    expect(row!.workspace_id).toBe(wsA);
    expect(Number(row!.amount)).toBe(100);
    // created_by comes from auth.uid(), never the body.
    expect(row!.created_by).toBe(A.id);
  });

  it('refuses to record a payment into a workspace the caller is not a member of', async () => {
    const { error } = await pay(A, { p_workspace_id: wsB });
    expect(error, 'cross-tenant payment was ACCEPTED').toBeTruthy();
    const { count } = await svc.from('payments').select('*', { count: 'exact', head: true }).eq('workspace_id', wsB);
    expect(count).toBe(0);
  });

  it('rejects non-positive amounts', async () => {
    for (const amt of [0, -50]) {
      const { error } = await pay(A, { p_amount: amt });
      expect(error, `amount ${amt} was accepted`).toBeTruthy();
    }
  });

  it('rejects an invalid direction', async () => {
    const { error } = await pay(A, { p_direction: 'sideways' });
    expect(error).toBeTruthy();
  });

  it('refuses allocations that exceed the payment amount (over-allocation corrupts AR)', async () => {
    const { error } = await pay(A, {
      p_amount: 100,
      p_allocations: [{ target_type: 'invoice', target_id: crypto.randomUUID(), amount_doc: 150 }],
    });
    expect(error, 'over-allocation was accepted').toBeTruthy();
  });

  it('refuses another workspace’s order / bank account even when the workspace is mine', async () => {
    if (orderB) {
      const { error } = await pay(A, { p_order_id: orderB });
      expect(error, 'accepted an order belonging to another workspace').toBeTruthy();
    }
    if (bankB) {
      const { error } = await pay(A, { p_bank_account_id: bankB });
      expect(error, 'accepted a bank account belonging to another workspace').toBeTruthy();
    }
  });

  // ── credits ────────────────────────────────────────────────────────────────
  const balance = async (userId: string): Promise<number> => {
    const { data } = await svc.from('user_credits').select('balance').eq('user_id', userId).maybeSingle();
    return Number(data?.balance ?? 0);
  };
  const debit = (userId: string, amount: number) =>
    svc.rpc('debit_credits', {
      p_user_id: userId, p_amount: amount, p_operation_type: 'e2e_test',
      p_description: `E2E ${rid}`, p_metadata: {}, p_workspace_id: null,
    });

  it('debits credits, writes a ledger row, and refunds symmetrically', async () => {
    await svc.from('user_credits').upsert({ user_id: A.id, balance: 100 }, { onConflict: 'user_id' });

    const { data: deb } = await debit(A.id, 30);
    expect((deb as any)?.[0]?.success ?? (deb as any)?.success).toBe(true);
    expect(await balance(A.id)).toBe(70);

    const { count } = await svc.from('credit_transactions')
      .select('*', { count: 'exact', head: true }).eq('user_id', A.id).eq('operation_type', 'e2e_test');
    expect(count, 'debit wrote no ledger row — balance and ledger would drift').toBeGreaterThan(0);

    await svc.rpc('refund_credits', {
      p_user_id: A.id, p_amount: 30, p_operation_type: 'e2e_test',
      p_description: `E2E refund ${rid}`, p_metadata: {}, p_workspace_id: null,
    });
    expect(await balance(A.id), 'refund did not restore the balance').toBe(100);
  });

  it('never lets a debit push the balance negative', async () => {
    await svc.from('user_credits').upsert({ user_id: B.id, balance: 10 }, { onConflict: 'user_id' });
    const { data } = await debit(B.id, 999);
    const ok = (data as any)?.[0]?.success ?? (data as any)?.success;
    expect(ok, 'overdraft was allowed').toBe(false);
    expect(await balance(B.id), 'failed debit still moved the balance').toBe(10);
  });

  it('keeps the ledger and the cached balance in agreement', async () => {
    // The same invariant the credits.pool_ledger_drift integrity check enforces for pools —
    // asserted here for the personal wallet, at write time rather than a day later by cron.
    const { data: txns } = await svc.from('credit_transactions').select('amount').eq('user_id', A.id);
    const ledger = (txns ?? []).reduce((s, t: any) => s + Number(t.amount), 0);
    const cached = await balance(A.id);
    // Seeded balance (100) is not a transaction, so compare the DELTA the ledger accounts for.
    expect(cached - 100).toBe(ledger);
  });
});
