/**
 * Guard: a signed contract's terms are settled, and its signature says WHAT was signed
 * (#356 `RC-1`, `RC-2`).
 *
 * Three facts only mattered together, which is why each had survived on its own:
 *   1. `update` had no status gate — `value`, `body_markdown`, dates and counterparty stayed
 *      editable after signature.
 *   2. The PDF re-rendered from live data onto a fixed path with `upsert: true`.
 *   3. `contract_signatures` recorded who and when, and nothing about what.
 *
 * So a buyer signs at €300,000, someone edits `value` to €330,000 and regenerates, and the new
 * file carries the OLD signature block against the NEW terms at the SAME URL. The previously
 * signed artifact no longer exists anywhere. Two people downloading "the signed contract" weeks
 * apart get different commercial terms under identical signature metadata, and the system
 * cannot answer which one was agreed to.
 *
 * The hash logic is exercised for real here rather than asserted over source text — it is
 * ordinary pure code and a canonicalisation that silently changes is the failure that matters.
 * The wiring (gates, immutable path) is checked against source, because it lives inside a Deno
 * handler this suite cannot invoke.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import {
  canonicalContractText,
  contractContentHash,
  SIGNED_FIELDS,
} from '../../supabase/functions/_shared/contract-hash.ts';

const FUNCS = join(__dirname, '..', '..', 'supabase', 'functions');
const read = (rel: string) => stripComments(readFileSync(join(FUNCS, rel), 'utf8'));

const BASE = {
  contract_type: 'memorandum_of_sale',
  title: 'Memorandum of Sale',
  body_markdown: 'The parties agree as follows.',
  currency: 'EUR',
  value: 300000,
  effective_date: '2026-08-01',
  expiry_date: null,
  counterparty_name: 'A. Buyer',
  counterparty_email: 'buyer@example.com',
};

describe('the content hash answers "what was signed?"', () => {
  it('changes when a term changes', async () => {
    const signed = await contractContentHash(BASE);
    const edited = await contractContentHash({ ...BASE, value: 330000 });
    expect(edited, 'the €300,000 → €330,000 edit produced the same hash — the exact scenario RC-1 describes')
      .not.toBe(signed);
  });

  it.each(SIGNED_FIELDS)('changes when %s changes', async (field) => {
    const before = await contractContentHash(BASE);
    const after = await contractContentHash({ ...BASE, [field]: 'something-else-entirely' });
    expect(after, `${field} is in SIGNED_FIELDS but editing it does not move the hash`).not.toBe(before);
  });

  it('does NOT change when the lifecycle moves', async () => {
    // Signing itself sets status/signed_at, and the PDF render reads the row afterwards. If
    // those were hashed, every signature would fail to verify the instant it was taken.
    const signed = await contractContentHash(BASE);
    const afterSigning = await contractContentHash({
      ...BASE,
      status: 'signed',
      signed_at: '2026-08-17T10:00:00Z',
      sign_token: null,
      updated_at: '2026-08-17T10:00:00Z',
      signed_pdf_path: 'contract-output/x/signed-abc.pdf',
    });
    expect(afterSigning, 'lifecycle columns leaked into the hash — every signature would self-invalidate')
      .toBe(signed);
  });

  it('treats equivalent numeric spellings as the same amount', async () => {
    // `value` is numeric in Postgres and arrives as a number or a string depending on the
    // client. A hash that moved on that would cry wolf until somebody deleted the check.
    const a = await contractContentHash({ ...BASE, value: 300000 });
    const b = await contractContentHash({ ...BASE, value: '300000' });
    const c = await contractContentHash({ ...BASE, value: '300000.00' });
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it('does not depend on key order', async () => {
    const reversed = Object.fromEntries(Object.entries(BASE).reverse());
    expect(await contractContentHash(reversed)).toBe(await contractContentHash(BASE));
  });

  it('distinguishes a null field from an empty string only where it should', async () => {
    // Both mean "no value recorded"; treating them differently would make a no-op UI save
    // invalidate a signature.
    const withNull = await contractContentHash({ ...BASE, expiry_date: null });
    const withEmpty = await contractContentHash({ ...BASE, expiry_date: '' });
    expect(withEmpty).toBe(withNull);
  });

  it('is a lowercase hex sha-256', async () => {
    expect(await contractContentHash(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('canonical text names every signed field exactly once', () => {
    const text = canonicalContractText(BASE);
    for (const f of SIGNED_FIELDS) {
      expect(text.split('\n').filter((l) => l.startsWith(`${f}=`)), `${f} appears more than once`)
        .toHaveLength(1);
    }
  });
});

describe('RC-1 — a signed contract cannot be rewritten', () => {
  const api = read('contracts-api/index.ts');

  it('update refuses once the terms are settled', () => {
    expect(api, 'the immutable-status list is gone').toContain('IMMUTABLE_STATUSES');
    expect(api, "'signed' is no longer treated as settled").toMatch(/IMMUTABLE_STATUSES = \[[^\]]*'signed'/);
  });

  it('the status test is part of the WHERE clause, not a read-then-write', () => {
    // A check performed first leaves a window in which the counterparty signs between the read
    // and the update — which is precisely the case this exists to stop.
    expect(api, 'the update no longer excludes settled statuses in the query itself')
      .toMatch(/for \(const st of IMMUTABLE_STATUSES\) uq = uq\.neq\('status', st\)/);
  });

  it('the signature records the content it was given', () => {
    // The COLUMN write moved into `public.sign_contract` when signing became one transaction (the
    // insert and the status stamp were two statements, so a failed stamp left a signature on a
    // contract still open for signing). This assertion moved with it rather than being dropped:
    // what has to stay true is that the hash is computed from the shared canonicalisation HERE —
    // the one canonicalisation, per contract-hash.ts — and handed to the writer.
    expect(api, 'the hash is no longer computed from the shared canonicalisation')
      .toContain('contractContentHash');
    expect(api, 'the computed hash is no longer passed to the writer')
      .toMatch(/p_content_hash: signedHash/);
    // And the writer must be the atomic one, not a direct insert that could commit alone.
    expect(api, 'signing must go through the RPC that writes evidence and stamp together')
      .toMatch(/rpc\('sign_contract'/);
    // The RPC itself refuses an empty hash (`content_hash_required`), which is a stronger
    // guarantee than any source check here — a signature that cannot say WHAT was signed is
    // exactly the RC-1 defect, and it is now rejected by the database rather than by convention.
  });

  it('the sign path selects every field the hash covers', () => {
    // Hashing a column that was never selected hashes `undefined` and binds to nothing.
    const sel = api.slice(api.indexOf(".from('contracts')"), api.indexOf("eq('sign_token'"));
    for (const f of ['value', 'currency', 'contract_type', 'counterparty_email']) {
      expect(sel, `${f} is hashed but not selected on the sign path`).toContain(f);
    }
  });

  it('the editable list and the signed list are the same list', () => {
    expect(api, 'WRITABLE forked from SIGNED_FIELDS — the hash can now miss an editable field')
      .toMatch(/const WRITABLE = SIGNED_FIELDS/);
  });
});

describe('RC-1 — the signed PDF is written once', () => {
  const pdf = read('generate-contract-pdf/index.ts');

  it('no longer overwrites a single fixed path for every render', () => {
    expect(
      pdf,
      'the contract PDF is back to one fixed path with upsert — regenerating destroys the '
        + 'signed artifact and rewrites whatever link was already sent out',
    ).not.toMatch(/contract-output\/\$\{contractId\}\.pdf/);
  });

  it('returns the existing object for an already-signed contract instead of re-rendering over it', () => {
    expect(pdf, 'the immutable branch is gone').toContain('existingSignedPath');
    expect(pdf, 'the signed upload no longer refuses to overwrite').toMatch(/upsert: false/);
  });

  it('records the path, and treats failing to record it as an error', () => {
    // An unrecorded path is unreferenced by build_storage_reference_set(), which makes the
    // evidence reapable by storage-orphan-cleanup-cron.
    expect(pdf).toContain('signed_pdf_path');
    expect(pdf, 'recording the signed path became best-effort')
      .toMatch(/Could not record the signed PDF path/);
  });

  it('states on the document whether the terms still match the signature', () => {
    expect(pdf, 'the verification line is gone — an edited contract renders as a signed one again')
      .toMatch(/terms above have CHANGED/);
    expect(pdf, 'a signature with no recorded binding is no longer distinguished')
      .toMatch(/not recorded/);
  });
});

describe('RC-2 — lifecycle transitions are state-gated', () => {
  const api = read('contracts-api/index.ts');

  it('send cannot reopen a settled contract for signature', () => {
    expect(api, 'send no longer excludes settled statuses — a signed contract can be re-signed')
      .toMatch(/for \(const st of IMMUTABLE_STATUSES\) sq = sq\.neq\('status', st\)/);
  });

  it('void cannot erase a concluded agreement', () => {
    expect(api, 'void no longer excludes settled statuses')
      .toMatch(/for \(const st of IMMUTABLE_STATUSES\) vq = vq\.neq\('status', st\)/);
  });
});
