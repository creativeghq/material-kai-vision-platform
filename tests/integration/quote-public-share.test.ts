import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { hasCreds, serviceClient, createUser, createWorkspace, addMember, teardown, runId, SUPABASE_URL, type TestUser } from './_harness';

// Public quote share (`quote-public-share`) — an ANONYMOUS, token-addressed surface that can flip
// a quote to `accepted` with an e-signature. That makes it the highest-consequence public path in
// the platform after payments: the token is the ONLY thing standing between a stranger and a
// legally-meaningful state change on someone else's commercial document.
// Called with the anon key only, exactly as PublicQuotePage does.
const suite = hasCreds ? describe : describe.skip;

const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';

suite('quote-public-share · anonymous token surface', () => {
  const rid = runId();
  let svc: SupabaseClient;
  let owner: TestUser;
  let ws = '', sharedQuote = '', sharedToken = '', disabledQuote = '', disabledToken = '';

  async function share(body: Record<string, unknown>): Promise<{ status: number; body: any }> {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/quote-public-share`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ANON_KEY}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  }

  // public_share_token is a UUID column — a padded string fails at insert with 22P02.
  const newToken = () => crypto.randomUUID();

  // The shared page's money is DERIVED (`get_quote_totals`), not read off the quote row — #358
  // PQ-6, so the page a customer signs cannot show a figure the invoice will disagree with.
  //
  // So the fixture has to seed a real LINE, not a stamped `grand_total`. It used to stamp
  // `grand_total: 1234.56` with no `quote_items` at all, which asserted nothing about the
  // derivation and started failing the moment the function switched to it (`expected +0 to be
  // 1234.56` — the derived total of a quote with no lines is correctly zero).
  //
  // 1 × 1234.56 at vat_rate 0 derives grand_total 1234.56, so the expectations below are unchanged
  // and now actually exercise the path the customer sees.
  const SHARED_TOTAL = 1234.56;

  const seedQuote = async (over: Record<string, unknown>) => {
    const { data, error } = await svc.from('quotes').insert({
      workspace_id: ws, user_id: owner.id, name: `E2E Quote ${rid}`,
      // valid_status CHECK: draft|submitted|quoted|accepted|rejected|expired — 'sent' is not one.
      status: 'quoted', currency: 'EUR', vat_rate: 0,
      ...over,
    }).select('id, public_share_token').single();
    if (error) throw new Error(`seed quote: ${error.message}`);

    // No `line_total`: GENERATED ALWAYS from coalesce(discounted_price, unit_price) * quantity.
    const { error: itemErr } = await svc.from('quote_items').insert({
      quote_id: data.id, quantity: 1, unit_price: SHARED_TOTAL,
      custom_product_name: `E2E line ${rid}`, pricing_status: 'priced',
    });
    if (itemErr) throw new Error(`seed quote item: ${itemErr.message}`);
    return data;
  };

  beforeAll(async () => {
    svc = serviceClient();
    owner = await createUser(svc, 'quoteown', rid);
    ws = await createWorkspace(svc, 'wsQuote', rid, owner.id);
    await addMember(svc, ws, owner.id, 'owner');

    sharedToken = newToken();
    const a = await seedQuote({ public_share_token: sharedToken, public_share_enabled: true });
    sharedQuote = a.id;

    disabledToken = newToken();
    const b = await seedQuote({ public_share_token: disabledToken, public_share_enabled: false });
    disabledQuote = b.id;
  });

  afterAll(async () => {
    await svc.from('quote_items').delete().in('quote_id', [sharedQuote, disabledQuote].filter(Boolean)).then(() => {}, () => {});
    await svc.from('quotes').delete().eq('workspace_id', ws).then(() => {}, () => {});
    await teardown(svc, { wsIds: [ws], userIds: [owner.id] });
  });

  it('rejects a malformed / too-short token before touching the database', async () => {
    for (const token of ['', 'short', 'x'.repeat(31)]) {
      const { status } = await share({ token });
      expect(status, `token "${token}" was not rejected`).toBe(400);
    }
  });

  it('returns not_found for an unknown token — and leaks nothing', async () => {
    const { body } = await share({ token: crypto.randomUUID() });
    expect(body.not_found).toBe(true);
    expect(body.quote).toBeNull();
  });

  it('treats a valid token as not_found once sharing is disabled (revocation works)', async () => {
    const { body } = await share({ token: disabledToken });
    expect(body.not_found, 'a revoked share link still resolved').toBe(true);
    expect(body.quote).toBeNull();
  });

  it('serves the quote for a valid, enabled token', async () => {
    const { body } = await share({ token: sharedToken });
    expect(body.not_found).toBeFalsy();
    expect(body.quote?.id).toBe(sharedQuote);
    expect(Number(body.quote?.grand_total)).toBe(SHARED_TOTAL);
  });

  it('refuses to accept without a real signer name', async () => {
    for (const signer_name of [undefined, '', ' ', 'A']) {
      const { status } = await share({ token: sharedToken, event: 'accept', signer_name });
      expect(status, `signer "${signer_name}" was accepted`).toBe(400);
    }
    const { data } = await svc.from('quotes').select('status').eq('id', sharedQuote).single();
    expect(data!.status, 'quote changed status on a rejected accept').toBe('quoted');
  });

  it('accepts with a signer and flips the quote to accepted', async () => {
    const { body } = await share({
      token: sharedToken, event: 'accept',
      signer_name: 'E2E Signer', signer_email: `e2e-signer-${rid}@materialshub.gr`,
    });
    expect(body.error, `accept failed: ${body.error}`).toBeFalsy();

    const { data } = await svc.from('quotes').select('status').eq('id', sharedQuote).single();
    expect(data!.status, 'accept did not persist').toBe('accepted');
  });

  it('cannot accept a quote whose share was revoked', async () => {
    const { body } = await share({
      token: disabledToken, event: 'accept', signer_name: 'E2E Sneaky',
    });
    expect(body.not_found).toBe(true);
    const { data } = await svc.from('quotes').select('status').eq('id', disabledQuote).single();
    expect(data!.status, 'a revoked link still accepted the quote').toBe('quoted');
  });
});
