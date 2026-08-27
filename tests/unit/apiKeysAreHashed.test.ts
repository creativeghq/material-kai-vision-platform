import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';

/**
 * Partner and embed API keys are stored hashed, verified in ONE place, and never read
 * back (#390).
 *
 * `api_keys.api_key` held the credential in directly usable form — 36 characters,
 * `kai_` prefix, not a digest. That is not one bug: it changes the severity of every
 * other defect touching the table, because any cross-tenant read, column-projection
 * slip, log line or backup that includes the column hands over a WORKING credential
 * rather than metadata. A client-callable `getAllApiKeys()` did `select('*')` with no
 * filter, so a global admin dumped every partner's plaintext key into a browser.
 *
 * Two things the issue did not have, both found while fixing it:
 *
 *   * `generateSecureKey` built the key from `Math.random()`. It is named "secure" and
 *     is not a CSPRNG, so the live keys were PREDICTABLE as well as plaintext — which
 *     is why hashing them is necessary but not sufficient and they need rotating.
 *   * `material_kai_keys` (the embed key system) has the identical design and is read
 *     by three more edge functions. It holds zero rows, which is the argument for
 *     fixing it now rather than later.
 *
 * WHY VERIFICATION IS IN SQL
 * The comparison happens in Python (MIVAA), in four Deno edge functions and in the
 * browser. Five implementations of "hash the presented key the same way" is five
 * chances to disagree about encoding, and disagreeing here is a total auth failure —
 * or worse, a silent mismatch on one runtime only.
 */

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
    const full = join(dir, entry);
    let s;
    try {
      s = statSync(full);
    } catch {
      continue;
    }
    if (s.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|py)$/.test(entry)) out.push(full);
  }
  return out;
}

// Comments are prose: the fixes here QUOTE what they replaced, and reading that back as
// code is how a sweep produces a finding nobody can act on. The stripper is imported
// rather than written again — there were ten hand-rolled copies across 41 test files and
// thirty of them ate real code, which is the failure mode where a guard reports green
// because it has stopped seeing the source it guards.
//
// It is a JS/TS scanner. The one Python file read below is checked for the PRESENCE of
// an RPC name, so the only false positive available is that name appearing in a
// docstring — which would still mean somebody had documented it.

const SOURCE_DIRS = ['src', 'supabase/functions', 'api', 'mivaa-pdf-extractor/app'];

function sourceFiles(): string[] {
  return SOURCE_DIRS.flatMap((d) => walk(join(ROOT, d)));
}

describe('#390 — API keys are hashed, not stored in usable form', () => {
  it('nothing filters either key table by a plaintext key column', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = stripComments(readFileSync(file, 'utf8'));
      // `.eq('api_key', <something>)` is the shape that only works against plaintext.
      if (/\.eq\(\s*['"]api_key['"]\s*,/.test(src)) {
        offenders.push(file.replace(ROOT, '').replace(/\\/g, '/'));
      }
    }
    expect(
      offenders,
      `these compare a presented key against a stored column, which only works if the ` +
        `column is plaintext (#390). Use the verify_api_key / verify_embed_key RPC:\n  ` +
        offenders.join('\n  '),
    ).toEqual([]);
  });

  it('no client method selects * from a key table', () => {
    const gateway = readFileSync(
      join(ROOT, 'src/services/apiGateway/apiGatewayService.ts'),
      'utf8',
    );
    const stripped = stripComments(gateway);
    expect(
      /from\('api_keys'\)[\s\S]{0,80}?\.select\('\*'\)/.test(stripped),
      "apiGatewayService selects '*' from api_keys again — that returned the credential " +
        'itself, so a global admin listing keys dumped every partner secret into a browser',
    ).toBe(false);
    expect(stripped).toContain('API_KEY_LIST_COLUMNS');
  });

  it('the weak client-side generator stays gone', () => {
    const gateway = stripComments(
      readFileSync(join(ROOT, 'src/services/apiGateway/apiGatewayService.ts'), 'utf8'),
    );
    expect(
      gateway.includes('generateSecureKey'),
      'generateSecureKey is back. It was named "secure" and built the key from ' +
        'Math.random(), which is not a CSPRNG — the keys it issued are predictable. ' +
        'Generation belongs in create_api_key, which uses gen_random_bytes.',
    ).toBe(false);
    expect(
      gateway.includes('Math.random()'),
      'Math.random() is being used in the API-key service again',
    ).toBe(false);
  });

  it('key creation goes through the SQL function that returns the plaintext once', () => {
    const gateway = stripComments(
      readFileSync(join(ROOT, 'src/services/apiGateway/apiGatewayService.ts'), 'utf8'),
    );
    expect(gateway).toContain("rpc('create_api_key'");
    expect(
      /\.insert\(\s*\{[\s\S]{0,200}api_key:/.test(gateway),
      'a key is being inserted with a plaintext api_key column again',
    ).toBe(false);
  });

  it('no UI reads a key back after creation', () => {
    for (const rel of [
      'src/components/Admin/ApiGatewayAdmin.tsx',
      'src/components/core/Profile/SubscriptionTab.tsx',
    ]) {
      const src = stripComments(readFileSync(join(ROOT, rel), 'utf8'));
      expect(
        /key\.api_key/.test(src),
        `${rel} reads key.api_key — the list returns a prefix now, and a key that can ` +
          'be re-read on demand is a plaintext key with extra steps',
      ).toBe(false);
    }
  });

  it('every runtime that authenticates a key uses the shared verifier', () => {
    const checks: Array<[string, string]> = [
      ['supabase/functions/_shared/auth.ts', 'verify_api_key'],
      ['supabase/functions/_shared/embed-key.ts', 'verify_embed_key'],
      ['mivaa-pdf-extractor/app/api/price_lookup_routes.py', 'verify_api_key'],
    ];
    for (const [rel, rpc] of checks) {
      let src: string;
      try {
        src = readFileSync(join(ROOT, rel), 'utf8');
      } catch {
        // MIVAA is a submodule and is EMPTY in CI — skipping is correct there, and
        // asserting on an absent file would be a test that passes for the wrong reason.
        if (rel.startsWith('mivaa-')) continue;
        throw new Error(`${rel} is missing`);
      }
      expect(
        stripComments(src).includes(rpc),
        `${rel} no longer calls ${rpc} — it is verifying keys some other way, and five ` +
          'hand-written hash comparisons is five chances to disagree about encoding',
      ).toBe(true);
    }
  });
});
