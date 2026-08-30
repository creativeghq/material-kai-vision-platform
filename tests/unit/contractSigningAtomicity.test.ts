/**
 * Signing a contract is ONE transaction, and the evidence it records is not chosen by the signer.
 *
 * ── The partial write ────────────────────────────────────────────────────────────────────
 * `contracts-api` signed as two statements over the wire:
 *
 *     insert into contract_signatures (…)      -- the evidence
 *     update contracts set status = 'signed'   -- the stamp
 *
 * The insert commits on its own. A failed stamp — a dropped connection, a transient error — left
 * the contract `sent` with a signature already against it. The counterparty is still looking at a
 * page that offers to sign, so they sign again; and the check meant to stop them was
 * `if (c.status === 'signed')`, reading the very column that failed to be written. Two rows in
 * `contract_signatures` for one legal document, each with its own `signed_content_sha256`, and no
 * way to say which one is THE signature.
 *
 * CLAUDE.md rule 4, both halves: naturally atomic → one RPC, and make the stamp the CLAIM so a
 * lost race aborts rather than double-writing. There is no unique constraint on
 * `contract_signatures(contract_id)` to fall back on — deliberately, the schema notes a future
 * multi-party design — so the claim IS the guard.
 *
 * WATCHED, on the live database inside aborted transactions:
 *   • first sign → ok, status `signed`, one signature row;
 *   • same token again → `already_signed`, and the row count STAYS at one;
 *   • evidence insert forced to fail → status still `sent`, zero signatures (the honest state:
 *     signable again, rather than signed-with-no-evidence);
 *   • a signature offered with no content hash → refused outright, because a signature that
 *     cannot say WHAT was signed is the #356 RC-1 defect.
 *
 * ── The evidence the signer chose ────────────────────────────────────────────────────────
 * `contract_signatures.ip` came from `x-forwarded-for.split(',')[0]` — the LEFTMOST entry, which
 * is whatever the caller put there. So the address recorded against a signature, the one a dispute
 * would rely on, was picked by the person signing. Invariant 10 requires the trusted hop for a
 * QUOTA; evidence deserves it at least as much.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const api = readFileSync(join(ROOT, 'supabase/functions/contracts-api/index.ts'), 'utf8');

describe('signing a contract is one transaction', () => {
  it('is pointed at the real file', () => {
    expect(api).toContain('contract_signatures');
    expect(api, 'the public sign action is what this guards').toMatch(/action === 'sign'/);
  });

  it('signs through the atomic RPC', () => {
    expect(api, 'the sign must go through sign_contract').toMatch(/rpc\('sign_contract'/);
    expect(api, 'and it must pass the content hash it computed').toMatch(/p_content_hash: signedHash/);
  });

  it('never writes the evidence and the stamp as two statements', () => {
    // The precise shape. Either half alone is the defect: an insert that commits before the stamp,
    // or a stamp that can land without evidence.
    expect(api, 'a direct signature insert is the first half of the pair')
      .not.toMatch(/from\('contract_signatures'\)[\s\S]{0,120}\.insert\(/);
    expect(api, "and a direct status flip is the second")
      .not.toMatch(/from\('contracts'\)[\s\S]{0,160}status: 'signed'/);
  });

  it('trusts the RPC verdict rather than the read it made first', () => {
    // The reads above the RPC exist to fail fast and to build the hash. If they were treated as
    // authoritative, two concurrent signers would both pass them.
    expect(api).toMatch(/outcome\?\.reason === 'already_signed'/);
    expect(api, 'a refused claim must not be reported as success').toMatch(/if \(!outcome\?\.ok\)/);
  });
});

describe('signature evidence is not chosen by the signer', () => {
  it('takes the trusted proxy hop', () => {
    expect(api, 'the IP on a signature must come from the trusted hop')
      .toMatch(/getTrustedClientIp\(req\)/);
  });

  it('never reads the leftmost x-forwarded-for entry', () => {
    // `x-forwarded-for.split(',')[0]` is attacker-controlled — the exact defect.
    expect(api, 'the leftmost forwarded-for entry is whatever the caller sent')
      .not.toMatch(/x-forwarded-for'\)\?\.split\(','\)\[0\]/);
  });
});
