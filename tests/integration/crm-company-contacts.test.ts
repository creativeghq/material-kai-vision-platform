import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

// Adding a contact from a company page. Covers two shipped fixes:
//  1. GET /companies/{id} must return the attachments FLATTENED as `contacts` — the raw
//     nested crm_company_contacts shape made the Contacts tab render "Contacts (0)" even
//     though the join row existed, so the contact looked unassigned.
//  2. POST /companies/{id}/contacts with a `contact` object creates AND attaches atomically —
//     the old two-call client flow stranded an orphan contact when the attach leg failed.
//
// Runs against the deployed crm-api with a real user JWT, so it exercises auth + scope too.
// Editing this file is enough to run it: tests/** is in the deploy workflow's push paths and
// integration-tests gates on the `tests` filter, so a test-only commit still executes here.
const suite = hasCreds ? describe : describe.skip;

suite('crm-api · company contacts', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let A: TestUser;
  let wsA = '', companyA = '';

  // Call the deployed edge function as the signed-in test user.
  async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any }> {
    const { data } = await A.client.auth.getSession();
    const res = await fetch(`${SUPABASE_URL}/functions/v1/crm-api${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session?.access_token}`,
        'Content-Type': 'application/json',
        ...(init?.headers || {}),
      },
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  beforeAll(async () => {
    svc = serviceClient();
    A = await createUser(svc, 'crmcc', rid);
    wsA = await createWorkspace(svc, 'wsCC', rid, A.id);
    await addMember(svc, wsA, A.id, 'owner');
    const c = await svc.from('crm_companies')
      .insert({ name: `E2E CC ${rid}`, workspace_id: wsA, created_by: A.id })
      .select('id').single();
    if (c.error) throw new Error(`seed company: ${c.error.message}`);
    companyA = c.data.id;
  });

  afterAll(async () => {
    // Contacts are workspace-scoped, so the workspace delete in teardown takes them; delete
    // explicitly first so a FK on the join table can never block the workspace drop.
    await svc.from('crm_contacts').delete().eq('workspace_id', wsA).then(() => {}, () => {});
    await teardown(svc, { wsIds: [wsA], userIds: [A?.id] });
  });

  it('creates and attaches a contact in one request', async () => {
    const { status, body } = await api(`/companies/${companyA}/contacts`, {
      method: 'POST',
      body: JSON.stringify({
        contact: { name: `Ada ${rid}`, email: `ada-${rid}@example.com` },
        role: 'Buyer',
        is_primary: true,
      }),
    });
    expect(status).toBe(201);
    expect(body?.data?.company_id).toBe(companyA);
    expect(body?.data?.contact_id).toBeTruthy();

    // The contact must land in the COMPANY's workspace, not the caller's first membership
    // (a test user is auto-joined to a shared workspace at signup, so this is a real fork).
    const { data: contact } = await svc.from('crm_contacts')
      .select('workspace_id, name').eq('id', body.data.contact_id).single();
    expect(contact?.workspace_id).toBe(wsA);
    expect(contact?.name).toBe(`Ada ${rid}`);
  });

  it('returns the attachment flattened as `contacts` on GET (the "Contacts (0)" bug)', async () => {
    const { status, body } = await api(`/companies/${companyA}`);
    expect(status).toBe(200);
    // The page reads company.contacts[].contact_name / relationship_id — assert that exact shape.
    expect(Array.isArray(body?.data?.contacts)).toBe(true);
    expect(body.data.contacts).toHaveLength(1);
    const row = body.data.contacts[0];
    expect(row.contact_name).toBe(`Ada ${rid}`);
    expect(row.contact_email).toBe(`ada-${rid}@example.com`);
    expect(row.relationship_id).toBeTruthy();
    expect(row.role).toBe('Buyer');
    expect(row.is_primary).toBe(true);
    // The raw nested key must be gone — leaving both invites readers to drift apart.
    expect(body.data.crm_company_contacts).toBeUndefined();
  });

  it('rolls the contact back when the attach leg fails (no orphan)', async () => {
    // is_primary is passed straight to a boolean column, so a non-boolean fails the join
    // insert AFTER the contact row is created — exactly the orphan window being closed.
    const orphanName = `Orphan ${rid}`;
    const { status } = await api(`/companies/${companyA}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ contact: { name: orphanName }, is_primary: 'not-a-boolean' }),
    });
    expect(status).toBe(400);

    const { data: leftovers } = await svc.from('crm_contacts').select('id').eq('name', orphanName);
    expect(leftovers ?? []).toHaveLength(0);
  });

  it('rejects a request with neither contact_id nor contact', async () => {
    const { status } = await api(`/companies/${companyA}/contacts`, {
      method: 'POST',
      body: JSON.stringify({ role: 'Buyer' }),
    });
    expect(status).toBe(400);
  });

  it('404s when attaching to a company outside the caller’s workspaces', async () => {
    const B = await createUser(svc, 'crmccB', rid);
    try {
      const wsB = await createWorkspace(svc, 'wsCCB', rid, B.id);
      await addMember(svc, wsB, B.id, 'owner');
      // B attaches to A's company — must not create anything.
      const { data } = await B.client.auth.getSession();
      const res = await fetch(`${SUPABASE_URL}/functions/v1/crm-api/companies/${companyA}/contacts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact: { name: `Mallory ${rid}` } }),
      });
      expect(res.status).toBe(404);
      const { data: leaked } = await svc.from('crm_contacts').select('id').eq('name', `Mallory ${rid}`);
      expect(leaked ?? []).toHaveLength(0);
      await teardown(svc, { wsIds: [wsB], userIds: [B.id] });
    } catch (e) {
      await teardown(svc, { userIds: [B.id] });
      throw e;
    }
  });
});
