/** Signing a contract is ONE transaction, and the evidence it records is not chosen by the signer. */
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
