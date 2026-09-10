/** The client does not get to choose the IP we write down. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const FUNCS = join(__dirname, '..', '..', 'supabase', 'functions');

/** Every .ts under supabase/functions, minus vendored deps. */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

const FILES = walk(FUNCS);

/**
 * The shape that is always wrong: taking element [0] of a split `x-forwarded-for`.
 *
 * Deliberately narrow. It does not object to reading the header — `client-ip.ts` reads it, and
 * takes the LAST hop, which is the one our own proxy appended. What is banned is the leftmost.
 */
const LEFTMOST = /x-forwarded-for['"]\s*\)[^;\n]*?\.split\(\s*['"],['"]\s*\)\s*(\?\.)?\[\s*0\s*\]/;

// Comments quote the old code to explain the fix; they are not the code. The stripper is the
// SHARED one — `stripCommentsHelper.test.ts` fails the build on a second copy, and it is right to:
// a hand-rolled stripper that disagrees about, say, a `//` inside a string quietly changes what
// every assertion in the file is reading.

describe('no edge function keys anything on the leftmost x-forwarded-for hop', () => {
  it('sees the real tree', () => {
    expect(FILES.length, 'the walk found no edge-function sources').toBeGreaterThan(100);
    expect(FILES.some((f) => f.endsWith('client-ip.ts'))).toBe(true);
    expect(FILES.some((f) => f.includes('hr-kiosk'))).toBe(true);
  });

  it('the shared helper exists and prefers cf-connecting-ip', () => {
    const src = readFileSync(join(FUNCS, '_shared', 'client-ip.ts'), 'utf8');
    expect(src, 'the helper no longer prefers the un-forgeable Cloudflare header')
      .toMatch(/cf-connecting-ip/);
    const body = stripComments(src);
    // It must take the LAST hop, never [0].
    expect(body, 'the helper itself reads the leftmost hop').not.toMatch(LEFTMOST);
    expect(body, 'the helper no longer takes the last (proxy-appended) hop')
      .toMatch(/hops\[hops\.length - 1\]/);
  });

  it('no file takes the leftmost hop', () => {
    const offenders = FILES
      .filter((f) => LEFTMOST.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(FUNCS.length + 1).replace(/\\/g, '/'));
    expect(
      offenders,
      `these read the client-controlled leftmost x-forwarded-for entry. Use `
        + `getTrustedClientIp(req) from _shared/client-ip.ts — and if the value feeds a NOT NULL `
        + `column, map its 'unknown' result to your sentinel rather than writing a new resolver.`,
    ).toEqual([]);
  });

  it('the four fixed in this pass are actually on the helper', () => {
    // Named explicitly: a regex that stops matching (a refactor, a formatting change) would let
    // the sweep silently pass on an empty set. These four must be positively wired.
    for (const rel of [
      'hr-kiosk/index.ts',
      '_shared/api-logger.ts',
      'catalog-access/index.ts',
      'inbox-api/index.ts',
    ]) {
      const src = readFileSync(join(FUNCS, rel), 'utf8');
      expect(src, `${rel} no longer imports the shared trusted-hop helper`)
        .toMatch(/getTrustedClientIp/);
    }
  });

  it("hr-kiosk's rate limit is keyed on the trusted value", () => {
    // The one of the four that is a genuine invariant-10 quota, so it gets its own assertion:
    // the limiter must count against what getTrustedClientIp returned.
    const src = stripComments(readFileSync(join(FUNCS, 'hr-kiosk', 'index.ts'), 'utf8'));
    expect(src).toMatch(/const ip = getTrustedClientIp\(req\)/);
    expect(src, 'the per-IP attempt count no longer filters on that ip').toMatch(/\.eq\('ip', ip\)/);
  });
});
