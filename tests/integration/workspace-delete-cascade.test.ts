import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, type TestUser } from './_harness';

// Deleting a workspace must actually delete it. `_reject_write_to_disabled_workspace` guards nine
// finance tables against writes to a disabled tenant, and it fires on DELETE too — including the
// ON DELETE CASCADE that `delete from workspaces` triggers. Postgres removes the parent row FIRST,
// so by the time the child trigger ran `is_workspace_writable()` found no workspace and coalesced
// the missing row to false: "already deleted" was indistinguishable from "disabled" and the guard
// aborted its own cascade. Any workspace holding a single order became undeletable — offboarding
// and erasure included, not just the CI fixtures where it surfaced (40 leaked in one day).
//
// The failure was invisible from every angle that was being watched: the suites' own teardown
// warns but never fails, and the nightly reaper returns `workspaces_blocked` in a jsonb nobody
// reads while pg_cron records "succeeded". So assert the WORLD — that the row is gone — rather
// than that the delete call returned no error, which is exactly what it did all along.
const suite = hasCreds ? describe : describe.skip;

suite('workspace delete · cascade past the disabled-workspace guard', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let owner: TestUser;
  let ws = '';

  beforeAll(async () => {
    svc = serviceClient();
    owner = await createUser(svc, 'wsdel', rid);
    ws = await createWorkspace(svc, 'wsDelete', rid, owner.id);
    await addMember(svc, ws, owner.id, 'owner');
  });

  // Only reached if the test itself failed before deleting; the ids are already gone otherwise.
  afterAll(async () => {
    await teardown(svc, { wsIds: [ws].filter(Boolean), userIds: [owner?.id].filter(Boolean) as string[] });
  });

  it('deletes a workspace that holds a guarded finance row', async () => {
    const { error: orderErr } = await svc.from('orders').insert({
      workspace_id: ws,
      created_by: owner.id,
      order_type: 'sales',
      status: 'draft',
    });
    expect(orderErr, `seeding the guarded row failed: ${orderErr?.message}`).toBeNull();

    const { error: delErr } = await svc.from('workspaces').delete().eq('id', ws);
    expect(delErr, `delete reported: ${delErr?.message}`).toBeNull();

    // The assertion that matters. The delete above reported success for months while the row
    // survived, so a clean error is not evidence of anything.
    const { data: survivors } = await svc.from('workspaces').select('id').eq('id', ws);
    expect(survivors ?? [], 'the workspace survived its own delete').toHaveLength(0);

    const { data: orphans } = await svc.from('orders').select('id').eq('workspace_id', ws);
    expect(orphans ?? [], 'orders outlived the workspace').toHaveLength(0);

    ws = ''; // already gone — keep teardown from re-reporting it
  });
});
