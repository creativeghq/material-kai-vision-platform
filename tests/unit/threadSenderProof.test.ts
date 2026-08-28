/**
 * A share link proves possession of a URL, not identity (#357 AE-12).
 *
 * `/i/:token` authorises by possession, and `token_send_message` posted as the contact the token
 * was bound to. So a forwarded mail, a quoted reply chain, a shared mailbox or a leaked archive
 * handed whoever held it the ability to write into a customer's conversation AS that customer.
 *
 * Reading stays link-only — the link is an invitation, and challenging someone before they can see
 * the conversation they were invited to would make the feature useless; that read is bounded by
 * the 30-day TTL and by the token dying on claim. WRITING now costs a one-time code sent to the
 * address the link was issued for, and the browser then holds a short-lived HMAC proof.
 *
 * The proof primitives are exercised for real here; the wiring is read out of the source, because
 * `inbox-api/index.ts` is a Deno entrypoint that cannot be imported under vitest.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  generateNumericCode,
  maskEmail,
  mintSenderProof,
  verifySenderProof,
  SENDER_PROOF_TTL_HOURS,
} from '../../supabase/functions/_shared/thread-sender-proof';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const SECRET = 'test-secret-value';
const NOW = 1_800_000_000_000;

describe('#357 AE-12 — the sender proof', () => {
  it('round-trips for the token it was minted for', async () => {
    const proof = await mintSenderProof(SECRET, 'tok-abc', NOW);
    expect(await verifySenderProof(SECRET, 'tok-abc', proof, NOW)).toBe(true);
  });

  it('is refused for a DIFFERENT conversation', async () => {
    // A customer may hold links to several threads. A proof for one must not open another.
    const proof = await mintSenderProof(SECRET, 'tok-abc', NOW);
    expect(await verifySenderProof(SECRET, 'tok-other', proof, NOW)).toBe(false);
  });

  it('is refused under a different secret', async () => {
    const proof = await mintSenderProof(SECRET, 'tok-abc', NOW);
    expect(await verifySenderProof('rotated-secret', 'tok-abc', proof, NOW)).toBe(false);
  });

  it('expires, and expiry is checked before the signature', async () => {
    const proof = await mintSenderProof(SECRET, 'tok-abc', NOW);
    const justInside = NOW + SENDER_PROOF_TTL_HOURS * 3_600_000 - 1_000;
    const justOutside = NOW + SENDER_PROOF_TTL_HOURS * 3_600_000 + 1_000;
    expect(await verifySenderProof(SECRET, 'tok-abc', proof, justInside)).toBe(true);
    expect(await verifySenderProof(SECRET, 'tok-abc', proof, justOutside)).toBe(false);
  });

  it('refuses a forged expiry — the timestamp is inside the signature', async () => {
    const proof = await mintSenderProof(SECRET, 'tok-abc', NOW);
    const sig = proof.slice(proof.indexOf('.') + 1);
    const farFuture = Math.floor(NOW / 1000) + 10_000_000;
    expect(await verifySenderProof(SECRET, 'tok-abc', `${farFuture}.${sig}`, NOW)).toBe(false);
  });

  it('refuses missing and malformed proofs rather than throwing', async () => {
    for (const bad of [null, undefined, '', 'nodot', '.abc', 'abc.', 'xyz.sig', '123']) {
      expect(await verifySenderProof(SECRET, 'tok-abc', bad as string | null, NOW), String(bad)).toBe(false);
    }
  });
});

describe('#357 AE-12 — the code and the address', () => {
  it('produces the requested number of digits', () => {
    for (const n of [4, 6, 8]) expect(generateNumericCode(n)).toMatch(new RegExp(`^\\d{${n}}$`));
  });

  it('is not biased toward the low digits', () => {
    // `byte % 10` makes 0–5 more likely than 6–9, which is a smaller keyspace than it looks.
    // 6000 digits: a modulo-biased generator lands ~150 low vs ~100 high per digit, far outside
    // this band; a uniform one sits near 600 each.
    const counts = new Array(10).fill(0);
    for (let i = 0; i < 1000; i++) for (const ch of generateNumericCode(6)) counts[Number(ch)]++;
    for (let d = 0; d < 10; d++) {
      expect(counts[d], `digit ${d}`).toBeGreaterThan(450);
      expect(counts[d], `digit ${d}`).toBeLessThan(780);
    }
  });

  it('masks the address enough to name it without disclosing it', () => {
    // The screen has to say which inbox to open, and must not tell whoever is holding the link
    // what the address is — they may be the person being defended against.
    const masked = maskEmail('maria@kithara.gr');
    expect(masked).toContain('@');
    expect(masked).not.toContain('maria');
    expect(masked).not.toContain('kithara');
    expect(masked.startsWith('m')).toBe(true);
    expect(masked.endsWith('.gr')).toBe(true);
  });

  it('masks a very short local part without exposing all of it', () => {
    expect(maskEmail('jo@x.io')).not.toContain('jo@');
  });

  it('does not throw on a value that is not an address', () => {
    expect(maskEmail('not-an-address')).toBe('•••');
  });
});

describe('#357 AE-12 — the write gate is wired', () => {
  const api = read('supabase/functions/inbox-api/index.ts');
  const sendCase = api.slice(api.indexOf("case 'token_send_message'"), api.indexOf("case 'token_claim'"));

  it('token_send_message refuses without a proof, before it touches the thread', () => {
    expect(sendCase).toMatch(/verifySenderProof\(/);
    expect(sendCase).toContain('sender_verification_required');
    const gate = sendCase.indexOf('sender_verification_required');
    const insert = sendCase.indexOf('insertMessageAndNotify');
    expect(gate).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(-1);
    expect(gate < insert, 'the message is inserted before the sender is verified').toBe(true);
  });

  it('reading is deliberately still link-only', () => {
    // Stated, not assumed: if someone later decides reads need a code too, this test should be
    // the thing that makes them say so out loud.
    const getCase = api.slice(api.indexOf("case 'token_get_thread'"), api.indexOf("case 'token_request_code'"));
    expect(getCase).not.toContain('verifySenderProof');
  });

  it('the code is stored hashed with its token, never in the clear', () => {
    const requestCase = api.slice(api.indexOf("case 'token_request_code'"), api.indexOf("case 'token_verify_code'"));
    expect(requestCase).toMatch(/code_hash: await sha256hex\(`\$\{token\}:\$\{code\}`\)/);
    expect(requestCase, 'the code itself is being written to the table').not.toMatch(/code_plain|code: code/);
  });

  it('a wrong guess costs an attempt even when guesses arrive together', () => {
    // Read-then-write lets N concurrent guesses all read attempts=0, so five parallel requests
    // each cost one attempt out of five. The claim is compare-and-set, the same shape as the
    // campaign recipient claim (#357 AE-4) and receive_order_into_warehouse (#355 WH-3).
    const verifyCase = api.slice(api.indexOf("case 'token_verify_code'"), api.indexOf("case 'token_send_message'"));
    expect(verifyCase).toMatch(/update\(\{ attempts: ch\.attempts \+ 1 \}\)[\s\S]{0,200}\.eq\('attempts', ch\.attempts\)/);
    const bump = verifyCase.indexOf('attempts: ch.attempts + 1');
    const compare = verifyCase.indexOf('sha256hex(');
    expect(bump < compare, 'the attempt is counted after the comparison — a wrong guess is free').toBe(true);
  });

  it('code requests are rate-limited per token', () => {
    // An unthrottled endpoint turns the customer's own inbox into the attack.
    const requestCase = api.slice(api.indexOf("case 'token_request_code'"), api.indexOf("case 'token_verify_code'"));
    expect(requestCase).toMatch(/MAX_CHALLENGES_PER_HOUR/);
    expect(requestCase).toMatch(/HttpError\(429/);
  });

  it('an unusable secret refuses the write instead of waving it through', () => {
    expect(api).toMatch(/async function senderProofSecret[\s\S]{0,400}HttpError\(503/);
  });

  it('a token with no contact cannot be verified, and therefore cannot write', () => {
    expect(api).toMatch(/async function tokenContactAddress[\s\S]{0,900}HttpError\(409/);
  });

  it('both halves are reachable as token actions', () => {
    expect(api).toMatch(/TOKEN_ACTIONS = new Set\(\[[\s\S]{0,300}'token_request_code', 'token_verify_code'/);
  });
});

describe('#357 AE-12 — the page keeps the proof, not the link', () => {
  const page = read('src/pages/PublicInboxThreadPage.tsx');

  it('stores the proof per token in browser storage', () => {
    // A forwarded link carries no localStorage. That is the whole mechanism.
    expect(page).toMatch(/const proofKey = \(token: string\) => `inbox_thread_proof:\$\{token\}`/);
    expect(page).toMatch(/localStorage\.getItem\(proofKey\(token\)\)/);
  });

  it('survives a browser that refuses storage', () => {
    // Private modes throw on access. A reply must still be possible — via a fresh code each time.
    expect(page).toMatch(/try \{[\s\S]{0,200}localStorage\.setItem[\s\S]{0,120}\} catch/);
  });

  it('drops an expired proof rather than sending with it', () => {
    expect(page).toMatch(/exp \* 1000 <= Date\.now\(\)[\s\S]{0,120}removeItem/);
  });

  it('re-verifies when the server says the proof is no longer good', () => {
    expect(page).toMatch(/code === 'sender_verification_required'/);
    expect(page).toMatch(/clearProof\(token\)/);
  });

  it('keeps the draft when it has to stop and verify', () => {
    // Losing what someone just typed, in order to prove who they are, is how a security step
    // becomes the reason they email the company instead.
    expect(page).toMatch(/if \(!proof\) \{ await startVerification\(\); return; \}/);
    const send = page.slice(page.indexOf('const send = useCallback'), page.indexOf('const submitCode'));
    const guard = send.indexOf('if (!proof)');
    const clear = send.indexOf("setDraft('')");
    expect(guard < clear, 'the draft is cleared before the verification detour').toBe(true);
  });
});
