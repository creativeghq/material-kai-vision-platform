import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

// Cross-workspace isolation on crm_companies — the exact table + RLS path of the recurring
// cross-tenant leak class (latest: SupplierProductsTab, commit 06db9eb5). Two real users in
// two distinct workspaces; we assert each user's signed-in client sees ONLY its own rows.
// We deliberately do NOT assert "every visible row is in wsA": signup auto-joins a shared
// workspace, so a user legitimately sees more than wsA. The leak signature is CONTAINMENT —
// seeing the OTHER tenant's row — so we assert positive (sees own) + negative (never theirs).
const suite = hasCreds ? describe : describe.skip;

suite('tenancy isolation · crm_companies', () => {
  const rid = runId();
  let svc: SupabaseClient; // built in beforeAll — a skipped suite must not construct it (no key)
  let A: TestUser, B: TestUser;
  let wsA = '', wsB = '', companyA = '', companyB = '';

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'tenA', rid);
    B = await createUser(svc, 'tenB', rid);
    wsA = await createWorkspace(svc, 'wsA', rid, A.id);
    wsB = await createWorkspace(svc, 'wsB', rid, B.id);
    await addMember(svc, wsA, A.id);
    await addMember(svc, wsB, B.id);
    const ca = await svc.from('crm_companies').insert({ name: `A-${rid}`, workspace_id: wsA, created_by: A.id }).select('id').single();
    const cb = await svc.from('crm_companies').insert({ name: `B-${rid}`, workspace_id: wsB, created_by: B.id }).select('id').single();
    if (ca.error || cb.error) throw new Error(`seed companies: ${ca.error?.message} ${cb.error?.message}`);
    companyA = ca.data.id;
    companyB = cb.data.id;
  });

  afterAll(async () => {
    await teardown(svc, { wsIds: [wsA, wsB], userIds: [A?.id, B?.id] });
  });

  // Guards against a false PASS: if the rows didn't actually get created, "B can't see A"
  // would pass for the wrong reason. Service role (RLS-bypassing) must see both.
  it('both seeded companies exist (service-role baseline)', async () => {
    const { data, error } = await svc.from('crm_companies').select('id').in('id', [companyA, companyB]);
    expect(error).toBeNull();
    expect((data || []).map((r) => r.id).sort()).toEqual([companyA, companyB].sort());
  });

  it('user A sees its own company and NOT user B’s', async () => {
    const { data, error } = await A.client.from('crm_companies').select('id');
    expect(error).toBeNull();
    const ids = (data || []).map((r) => r.id);
    expect(ids).toContain(companyA);
    expect(ids).not.toContain(companyB);
  });

  it('user B sees its own company and NOT user A’s', async () => {
    const { data, error } = await B.client.from('crm_companies').select('id');
    expect(error).toBeNull();
    const ids = (data || []).map((r) => r.id);
    expect(ids).toContain(companyB);
    expect(ids).not.toContain(companyA);
  });

  it('user B cannot read user A’s company even by direct id', async () => {
    const { data, error } = await B.client.from('crm_companies').select('id,name').eq('id', companyA);
    expect(error).toBeNull();
    expect(data).toEqual([]); // RLS filters it out — not a 403, an empty set
  });

  it('user B cannot UPDATE user A’s company (cross-tenant write is a no-op)', async () => {
    const { data } = await B.client.from('crm_companies').update({ name: 'hijacked' }).eq('id', companyA).select('id');
    expect(data || []).toEqual([]); // 0 rows matched under B's RLS
    const { data: check } = await svc.from('crm_companies').select('name').eq('id', companyA).single();
    expect(check?.name).toBe(`A-${rid}`); // untouched
  });
});
