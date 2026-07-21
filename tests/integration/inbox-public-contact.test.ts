import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

// Public "Hire me" contact form (PublicProfilePage → HireMeModal → inbox-api `profile_contact`).
// Called with the ANON key only — exactly what a logged-out visitor's browser sends.
//
// This path existed as a direct client insert into profile_contact_requests, which is
// authenticated-only, so every anonymous submission failed with 42501 while the modal rendered
// happily on a public page. It was moved server-side; these assertions pin the properties that
// made the move necessary, so it can't silently regress to "inert form" again.
const suite = hasCreds ? describe : describe.skip;

const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

suite('inbox-api · public profile contact', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let recipient: TestUser;
  const senderEmail = `e2e-contact-${rid}@materialshub.gr`;

  async function contact(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/inbox-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'profile_contact', ...body }),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  beforeAll(async () => {
    svc = serviceClient();
    recipient = await createUser(svc, 'contactrx', rid);
  });

  afterAll(async () => {
    await svc.from('profile_contact_requests').delete().eq('to_user_id', recipient.id).then(() => {}, () => {});
    await svc.from('profile_contact_requests').delete().eq('from_email', senderEmail).then(() => {}, () => {});
    await teardown(svc, { userIds: [recipient.id] });
  });

  it('accepts a contact request from a fully ANONYMOUS caller (the bug this path fixed)', async () => {
    const { body } = await contact({
      to_user_id: recipient.id, from_name: 'E2E Anon', from_email: senderEmail,
      message: 'anonymous hire enquiry', services_requested: ['Design'],
    });
    expect(body?.ok, 'anonymous submission rejected — the public form is inert again').toBe(true);

    const { data } = await svc.from('profile_contact_requests')
      .select('from_name, is_read, services_requested, message')
      .eq('to_user_id', recipient.id).single();
    expect(data!.from_name).toBe('E2E Anon');
    expect(data!.services_requested).toEqual(['Design']);
  });

  it('forces is_read=false even when the sender asks for true', async () => {
    // A sender who could pre-mark their own message read would hide it from the recipient's inbox.
    await contact({
      to_user_id: recipient.id, from_name: 'E2E Sneaky', from_email: `e2e-sneaky-${rid}@materialshub.gr`,
      message: 'hidden', is_read: true,
    });
    const { data } = await svc.from('profile_contact_requests')
      .select('is_read').eq('to_user_id', recipient.id).eq('from_name', 'E2E Sneaky').maybeSingle();
    expect(data?.is_read, 'sender managed to pre-mark the message read').toBe(false);
  });

  it('404s an unknown recipient instead of storing an orphan', async () => {
    const { status } = await contact({
      to_user_id: '00000000-0000-0000-0000-000000000000',
      from_name: 'E2E Ghost', from_email: `e2e-ghost-${rid}@materialshub.gr`, message: 'hi',
    });
    expect(status).toBe(404);
  });

  it('validates required fields and email shape', async () => {
    expect((await contact({ to_user_id: recipient.id, from_name: 'X' })).status).toBe(400);
    expect((await contact({
      to_user_id: recipient.id, from_name: 'X', from_email: 'not-an-email', message: 'hi',
    })).status).toBe(400);
  });

  it('rate-limits a single sender', async () => {
    const email = `e2e-flood-${rid}@materialshub.gr`;
    const send = (n: number) => contact({
      to_user_id: recipient.id, from_name: 'E2E Flood', from_email: email, message: `flood ${n}`,
    });
    // Cap is 3 per sender per 10 minutes; the 4th must be refused.
    for (const n of [1, 2, 3]) expect((await send(n)).body?.ok, `send ${n} should succeed`).toBe(true);
    const fourth = await send(4);
    expect(fourth.status, 'sender flood was NOT rate-limited').toBe(429);
    await svc.from('profile_contact_requests').delete().eq('from_email', email);
  });
});
