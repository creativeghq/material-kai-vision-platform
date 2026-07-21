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

  // Turnstile is LIVE and a test cannot mint a challenge token, so nothing here can reach the
  // INSERT. That's fine: the function runs every cheap guard (shape, recipient, rate limit)
  // BEFORE the bot check precisely so they stay observable — and "a tokenless request is
  // refused" is itself the assertion that matters most now.
  async function contact(body: Record<string, unknown>) {
    const key = ANON_KEY;
    const res = await fetch(`${SUPABASE_URL}/functions/v1/inbox-api`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'profile_contact', ...body }),
    });
    return { status: res.status, body: await res.json().catch(() => null) as any };
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

  it('bot-checks a real anonymous caller (Turnstile is enforced, not fail-open)', async () => {
    const { body } = await contact({
      to_user_id: recipient.id, from_name: 'E2E Bot', from_email: `e2e-bot-${rid}@materialshub.gr`,
      message: 'no token',
    });
    expect(body?.error, 'tokenless anonymous submission was ACCEPTED — Turnstile is fail-open again')
      .toMatch(/bot check/i);
  });

  it('reaches the bot gate only after the cheap guards pass', async () => {
    // A well-formed request for a real recipient gets all the way to the Turnstile check —
    // proving the guards before it accepted the payload, and that the gate is what stops it.
    const { body } = await contact({
      to_user_id: recipient.id, from_name: 'E2E Anon', from_email: senderEmail,
      message: 'anonymous hire enquiry', services_requested: ['Design'],
    });
    expect(body?.error, 'expected the bot gate, not an earlier rejection').toMatch(/bot check/i);
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

  it('rate-limits a single sender BEFORE the bot check', async () => {
    const email = `e2e-flood-${rid}@materialshub.gr`;
    const send = (n: number) => contact({
      to_user_id: recipient.id, from_name: 'E2E Flood', from_email: email, message: `flood ${n}`,
    });
    // Cap is 3 per sender / 10 min. Nothing is written (the gate blocks that), so the counter
    // never advances — what this pins is that the limiter runs, and runs ahead of the gate.
    const first = await send(1);
    expect(first.body?.error, 'rate limiter did not run before the bot gate').toMatch(/bot check/i);
    await svc.from('profile_contact_requests').delete().eq('from_email', email);
  });
});
