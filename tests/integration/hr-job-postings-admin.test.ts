import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, grantModule, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

// The ADMIN write path for job postings (`hr-api` → create/update-job-posting), with a real user
// JWT so auth + entitlement + hr.manage are all exercised.
//
// Written because the public careers suite seeded its postings with service-role SQL, which
// bypasses the edge function entirely — so `normalizeJobPostingFields` (the compensation /
// apply_config sanitiser that a public page renders) had never executed even once in a test.
const suite = hasCreds ? describe : describe.skip;

suite('hr-api · job posting write path', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser, B: TestUser;
  let wsA = '', wsB = '';

  async function hr(body: Record<string, unknown>, as: TestUser = A): Promise<{ status: number; body: any }> {
    const { data } = await as.client.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/hr-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session?.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace_id: as === A ? wsA : wsB, ...body }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'hrjobA', rid);
    B = await createUser(svc, 'hrjobB', rid);
    wsA = await createWorkspace(svc, 'wsJobA', rid, A.id);
    wsB = await createWorkspace(svc, 'wsJobB', rid, B.id);
    await addMember(svc, wsA, A.id, 'owner');
    await addMember(svc, wsB, B.id, 'owner');
    await grantModule(svc, wsA, 'hr');
    await grantModule(svc, wsB, 'hr');
  });

  afterAll(async () => {
    for (const ws of [wsA, wsB]) {
      await svc.from('hr_job_postings').delete().eq('workspace_id', ws).then(() => {}, () => {});
      await svc.from('workspace_module_entitlements').delete().eq('workspace_id', ws).then(() => {}, () => {});
    }
    await teardown(svc, { wsIds: [wsA, wsB], userIds: [A.id, B.id] });
  });

  it('creates a posting and auto-derives its public slug', async () => {
    const { status, body } = await hr({ action: 'create-job-posting', title: `E2E Manager ${rid}`, status: 'draft' });
    expect(status).toBe(201);
    expect(body.posting.slug).toMatch(/^[a-z0-9-]+$/);
    expect(body.posting.status).toBe('draft');
    // A draft has never been published.
    expect(body.posting.published_at).toBeNull();
  });

  it('normalises compensation bands and drops junk rows', async () => {
    const { body } = await hr({
      action: 'create-job-posting', title: `E2E Comp ${rid}`, status: 'draft',
      compensation: [
        { region: 'United Kingdom', currency: 'gbp', min: '90000', max: '122000', equity: 1, bonus: 0, note: ' senior band ' },
        { region: '', currency: 'EUR', min: 1, max: 2 },        // no region → dropped
        { region: 'Nowhere', currency: 'EUR' },                  // no amounts and no note → dropped
      ],
    });
    const comp = body.posting.compensation;
    expect(comp).toHaveLength(1);
    expect(comp[0]).toMatchObject({
      region: 'United Kingdom', currency: 'GBP', min: 90000, max: 122000,
      equity: true, bonus: false, note: 'senior band',
    });
  });

  it('rejects a non-array compensation and an invalid location_type', async () => {
    const bad = await hr({ action: 'create-job-posting', title: `E2E Bad ${rid}`, compensation: { region: 'X' } });
    expect(bad.status).toBe(400);
    const badLoc = await hr({ action: 'create-job-posting', title: `E2E Bad2 ${rid}`, location_type: 'moon' });
    expect(badLoc.status).toBe(400);
  });

  it('allowlists apply_config — unknown keys are never persisted', async () => {
    const { body } = await hr({
      action: 'create-job-posting', title: `E2E Cfg ${rid}`, status: 'draft',
      apply_config: { require_resume: false, ask_links: true, is_admin: true, evil: 'yes' },
    });
    expect(body.posting.apply_config).toEqual({ require_resume: false, ask_links: true });
  });

  it('ignores body-supplied columns outside the allowlist (mass assignment)', async () => {
    const { body } = await hr({
      action: 'create-job-posting', title: `E2E Mass ${rid}`, status: 'draft',
      workspace_id_spoof: wsB, published_at: '2000-01-01T00:00:00Z', created_by: B.id,
    });
    // published_at is derived from the status transition, never taken from the body.
    expect(body.posting.published_at).toBeNull();
    expect(body.posting.workspace_id).toBe(wsA);
    expect(body.posting.created_by).not.toBe(B.id);
  });

  it('stamps published_at on draft→open, and does NOT re-stamp on later edits', async () => {
    const created = await hr({ action: 'create-job-posting', title: `E2E Pub ${rid}`, status: 'draft' });
    const id = created.body.posting.id;

    const opened = await hr({ action: 'update-job-posting', job_posting_id: id, status: 'open' });
    const firstPublished = opened.body.posting.published_at;
    expect(firstPublished).toBeTruthy();

    // Editing an already-open posting must not move it back to the top of the careers board.
    const edited = await hr({ action: 'update-job-posting', job_posting_id: id, status: 'open', title: `E2E Pub ${rid} (typo fixed)` });
    expect(edited.body.posting.published_at).toBe(firstPublished);
  });

  it('refuses to touch another workspace’s posting', async () => {
    const mine = await hr({ action: 'create-job-posting', title: `E2E Mine ${rid}`, status: 'draft' });
    const id = mine.body.posting.id;
    // B is a legitimate HR manager — in their OWN workspace. This id is not theirs.
    const stolen = await hr({ action: 'update-job-posting', job_posting_id: id, title: 'HIJACKED' }, B);
    expect(stolen.status).toBe(404);
    const { data } = await svc.from('hr_job_postings').select('title, workspace_id').eq('id', id).single();
    expect(data!.title).not.toBe('HIJACKED');
    expect(data!.workspace_id).toBe(wsA);
  });

  it('402s when the workspace is not entitled to the HR module', async () => {
    await svc.from('workspace_module_entitlements').delete().eq('workspace_id', wsB).eq('module_slug', 'hr');
    const { status } = await hr({ action: 'create-job-posting', title: `E2E NoEnt ${rid}` }, B);
    expect(status).toBe(402);
    await grantModule(svc, wsB, 'hr'); // restore for teardown symmetry
  });
});
