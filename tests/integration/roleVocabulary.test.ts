// The role vocabulary lives in FIVE places that must agree: the TypeScript catalog
// (src/auth/workspaceRoles.ts), `workspace_members_role_check`, `workspace_invites_role_check`, and
// the allowlists inside `create_workspace_invite` / `set_workspace_member_role`. The unit test
// (tests/unit/workspaceRoles.test.ts) can only see the TypeScript side, which is exactly how two
// real bugs survived it:
//
//   • `sales` / `realestate_agent` / `employee` were invitable but NOT storable, so every one of
//     those invites threw a CHECK violation at redemption. Three personas unreachable for months.
//   • `workspace_members` accepted `finance` as a second name for `accountant` — a value absent from
//     the catalog with no resolvePersona branch, so a member stored with it resolved to `staff`.
//
// Both are DB-side drift, invisible to a test that reads only TypeScript. This suite PROBES the live
// database: it does not parse constraint text, it tries the operation and checks what happens, so it
// fails the same way production would.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser,
} from './_harness';
import {
  WORKSPACE_INVITE_ROLES, WORKSPACE_MEMBER_ROLES,
} from '../../src/auth/workspaceRoles';
import { ROLES } from '../../src/auth/roles';

const suite = hasCreds ? describe : describe.skip;

/** Values the account tier (`public.roles`) is allowed to contain — genuine platform tiers only. */
const ALLOWED_ACCOUNT_TIERS = new Set(['user', 'supplier', 'architect', 'admin', 'super_admin']);

suite('role vocabulary · TypeScript catalog vs. the live database', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let owner: TestUser, subject: TestUser;
  let ws = '';

  beforeAll(async () => {
    svc = serviceClient();
    owner = await createUser(svc, 'rolesown', rid);
    subject = await createUser(svc, 'rolessub', rid);
    ws = await createWorkspace(svc, 'roles', rid, owner.id);
    await addMember(svc, ws, owner.id, 'owner');
  });

  afterAll(async () => {
    await teardown(svc, { wsIds: [ws], userIds: [owner?.id, subject?.id] });
  });

  // ── workspace_members_role_check ─────────────────────────────────────────────
  // Service role bypasses RLS but NOT check constraints, so this reads the constraint honestly.

  it('every role in the TS catalog is storable in workspace_members', async () => {
    const rejected: string[] = [];
    for (const role of WORKSPACE_MEMBER_ROLES) {
      const { error } = await svc.from('workspace_members')
        .insert({ workspace_id: ws, user_id: subject.id, role, status: 'active' });
      if (error) rejected.push(`${role} (${error.message})`);
      await svc.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', subject.id);
    }
    expect(rejected, `catalog roles the DB refuses to store: ${rejected.join(', ')}`).toEqual([]);
  });

  it('the constraint actually constrains — a role outside the catalog is refused', async () => {
    // Guards against a false PASS above: if the CHECK were dropped, every insert would succeed and
    // the catalog/DB comparison would be meaningless.
    const { error } = await svc.from('workspace_members')
      .insert({ workspace_id: ws, user_id: subject.id, role: `bogus_${rid}`, status: 'active' });
    await svc.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', subject.id);
    expect(error, 'workspace_members accepted an unknown role — the CHECK constraint is missing').not.toBeNull();
  });

  it('the DB stores NOTHING the TS catalog does not know about', async () => {
    // The `finance` bug: a value the constraint allowed but the catalog never listed, so it had no
    // persona branch and silently resolved to `staff`. Probing a fixed suspect list is the only way
    // to check this direction without reading pg_constraint (unavailable over PostgREST).
    const RETIRED_OR_NEVER_VALID = ['finance', 'staff', 'sales_rep', 'hr_staff', 'manager', 'user'];
    const accepted: string[] = [];
    for (const role of RETIRED_OR_NEVER_VALID) {
      if ((WORKSPACE_MEMBER_ROLES as readonly string[]).includes(role)) continue;
      const { error } = await svc.from('workspace_members')
        .insert({ workspace_id: ws, user_id: subject.id, role, status: 'active' });
      if (!error) accepted.push(role);
      await svc.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', subject.id);
    }
    expect(accepted, `DB accepts roles absent from the catalog (no persona branch → silent 'staff'): ${accepted.join(', ')}`)
      .toEqual([]);
  });

  // ── create_workspace_invite: the allowlist that diverged from the CHECK ──────

  it('create_workspace_invite accepts every invitable role', async () => {
    const rejected: string[] = [];
    for (const role of WORKSPACE_INVITE_ROLES) {
      const { data, error } = await owner.client.rpc('create_workspace_invite', {
        p_workspace_id: ws, p_role: role, p_email: null, p_invitee_name: null,
      });
      if (error || !data) rejected.push(`${role} (${error?.message ?? 'no code returned'})`);
    }
    expect(rejected, `invitable roles the RPC refuses: ${rejected.join(', ')}`).toEqual([]);
  });

  it('create_workspace_invite refuses a role outside the catalog', async () => {
    const { error } = await owner.client.rpc('create_workspace_invite', {
      p_workspace_id: ws, p_role: `bogus_${rid}`, p_email: null, p_invitee_name: null,
    });
    expect(error, 'the RPC minted an invite for an unknown role').not.toBeNull();
  });

  // ── set_workspace_member_role ────────────────────────────────────────────────

  it('set_workspace_member_role accepts every invitable role', async () => {
    await addMember(svc, ws, subject.id, 'member');
    const rejected: string[] = [];
    for (const role of WORKSPACE_INVITE_ROLES) {
      const { data, error } = await owner.client.rpc('set_workspace_member_role', {
        p_workspace_id: ws, p_user_id: subject.id, p_role: role,
      });
      if (error || data !== true) rejected.push(`${role} (${error?.message ?? `returned ${data}`})`);
    }
    await svc.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', subject.id);
    expect(rejected, `roles set_workspace_member_role refuses: ${rejected.join(', ')}`).toEqual([]);
  });

  // ── the full round trip, once ────────────────────────────────────────────────

  it('an invite for a new team role actually lands as that role', async () => {
    // The end-to-end path that was broken: mint → redeem → the INSERT into workspace_members. A role
    // can pass every list above and still fail here if the two vocabularies disagree.
    const { data: code, error: mintErr } = await owner.client.rpc('create_workspace_invite', {
      p_workspace_id: ws, p_role: 'hr_manager', p_email: null, p_invitee_name: null,
    });
    expect(mintErr).toBeNull();
    expect(code).toBeTruthy();

    const { data: result, error: redeemErr } = await subject.client.rpc('redeem_workspace_invite', {
      p_code: code as string,
    });
    expect(redeemErr).toBeNull();
    expect((result as { ok?: boolean })?.ok, `redeem failed: ${JSON.stringify(result)}`).toBe(true);

    const { data: member } = await svc.from('workspace_members')
      .select('role').eq('workspace_id', ws).eq('user_id', subject.id).maybeSingle();
    expect(member?.role).toBe('hr_manager');

    await svc.from('workspace_members').delete().eq('workspace_id', ws).eq('user_id', subject.id);
  });

  // ── public.roles: the account tier must stay free of functional roles ────────

  it('public.roles contains only genuine platform tiers', async () => {
    const { data, error } = await svc.from('roles').select('name');
    expect(error).toBeNull();
    const names = (data ?? []).map((r: { name: string }) => r.name);
    expect(names.length, 'roles table came back empty — false pass').toBeGreaterThan(0);

    const intruders = names.filter((n) => !ALLOWED_ACCOUNT_TIERS.has(n));
    expect(intruders, `functional roles in the GLOBAL account tier (a tier applies in EVERY workspace): ${intruders.join(', ')}`)
      .toEqual([]);
  });

  it('no workspace team role is also an account tier', async () => {
    const { data } = await svc.from('roles').select('name');
    const tierNames = new Set((data ?? []).map((r: { name: string }) => r.name));
    const overlap = (WORKSPACE_INVITE_ROLES as readonly string[]).filter((r) => tierNames.has(r));
    expect(overlap, `assignable from BOTH Profile → Team and /admin/crm → Users: ${overlap.join(', ')}`)
      .toEqual([]);
  });

  it('the TS ROLES constant matches the account tiers in the database', async () => {
    const { data } = await svc.from('roles').select('name');
    const dbNames = (data ?? []).map((r: { name: string }) => r.name);
    const tsValues = new Set(Object.values(ROLES) as string[]);
    const missing = dbNames.filter((n) => !tsValues.has(n));
    expect(missing, `rows in public.roles with no ROLES entry: ${missing.join(', ')}`).toEqual([]);
  });
});
