import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser,
} from './_harness';
import { WORKSPACE_ROLE_CAPABILITIES } from '../../src/auth/roleCapabilities';

const suite = hasCreds ? describe : describe.skip;

suite('workspace capabilities · TS table vs. the live database', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let owner: TestUser, warehouse: TestUser, client: TestUser;
  let ws = '';

  beforeAll(async () => {
    svc = serviceClient();
    owner = await createUser(svc, 'capown', rid);
    warehouse = await createUser(svc, 'capwh', rid);
    client = await createUser(svc, 'capcli', rid);
    ws = await createWorkspace(svc, 'caps', rid, owner.id);
    await addMember(svc, ws, owner.id, 'owner');
    await addMember(svc, ws, warehouse.id, 'warehouse');
    await addMember(svc, ws, client.id, 'client');
  });

  afterAll(async () => {
    await teardown(svc, { wsIds: [ws], userIds: [owner?.id, warehouse?.id, client?.id] });
  });

  it('workspace_role_capability_matrix() is exactly src/auth/roleCapabilities.ts — the deploy's sync-capability-matrix job keeps them equal', async () => {
    const { data, error } = await svc.rpc('workspace_role_capability_matrix');
    expect(error).toBeNull();
    const live = new Set((data as Array<{ role: string; capability: string }>).map((r) => `${r.role}:${r.capability}`));
    const ts = new Set(Object.entries(WORKSPACE_ROLE_CAPABILITIES).flatMap(([r, caps]) => caps.map((c) => `${r}:${c}`)));
    expect([...ts].filter((k) => !live.has(k)), 'in TS, missing from SQL').toEqual([]);
    expect([...live].filter((k) => !ts.has(k)), 'in SQL, missing from TS').toEqual([]);
  });

  it('has_workspace_capability answers by the caller\'s role in that workspace', async () => {
    const ask = async (u: TestUser, cap: string) => {
      const { data, error } = await u.client.rpc('has_workspace_capability', { p_workspace_id: ws, p_capability: cap });
      expect(error).toBeNull();
      return data as boolean;
    };
    expect(await ask(owner, 'finance.manage')).toBe(true);
    expect(await ask(warehouse, 'warehouse.manage')).toBe(true);
    expect(await ask(warehouse, 'finance.manage')).toBe(false);
    expect(await ask(client, 'crm.view')).toBe(false);
  });

  it('row policies follow the role: staff read the business, a client reads none of it', async () => {
    const seeded = await svc.from('crm_companies').insert({ name: `Cap-${rid}`, workspace_id: ws, created_by: owner.id }).select('id').single();
    expect(seeded.error).toBeNull();
    const id = seeded.data!.id as string;
    const sees = async (u: TestUser) => ((await u.client.from('crm_companies').select('id').eq('id', id)).data ?? []).length;
    expect(await sees(owner)).toBe(1);
    expect(await sees(warehouse), 'workspace.read — a warehouse login still reads the parties it ships to').toBe(1);
    expect(await sees(client), 'a client is an outsider: membership alone must not open the CRM').toBe(0);

    const write = await warehouse.client.from('crm_companies').update({ name: `Renamed-${rid}` }).eq('id', id).select('id');
    expect(write.data ?? [], 'crm writes need crm.view or finance.operate').toEqual([]);
  });

  it('finance writes are finance.operate, and tenant RPCs refuse an outsider', async () => {
    const finance = async (u: TestUser) =>
      (await u.client.rpc('is_workspace_finance_manager', { p_workspace_id: ws })).data as boolean;
    expect(await finance(owner)).toBe(true);
    expect(await finance(warehouse)).toBe(false);
    const { error } = await client.client.rpc('assert_workspace_member', { p_workspace_id: ws });
    expect(error?.code, 'a client membership must not pass the tenant-RPC assert').toBe('42501');
  });
});
