import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';
import { strippedSource, posix } from '../helpers/sourceIndex';

const ROOT = process.cwd();
const EDGE = join(ROOT, 'supabase/functions');
const RESOLVER_RPCS = ['resolve_product_market_price', 'resolve_market_price_from_hits', 'resolve_market_price'];
const BAND_FIELDS = /market_(?:median|min|max)|marketMedian/;

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'vendor', 'coverage', '.deno']);

function walk(dir: string, out: string[] = []): string[] {
  let entries: Dirent[];
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('market price has exactly one derivation', () => {
  const marketplace = join(EDGE, 'marketplace-price-check/index.ts');
  const catalogue = join(EDGE, 'product-market-price/index.ts');

  it('both price surfaces exist', () => {
    expect(existsSync(marketplace)).toBe(true);
    expect(existsSync(catalogue)).toBe(true);
  });

  it('every price surface reads the SQL resolver rather than deriving in TypeScript', () => {
    for (const f of [marketplace, catalogue]) {
      const src = strippedSource(f);
      expect(RESOLVER_RPCS.some((r) => src.includes(r)), `${posix(f)} must call the resolver`).toBe(true);
    }
  });

  it('no edge function sorts prices to build its own median or min/max band', () => {
    const candidates = walk(EDGE).filter(
      (f) => !f.endsWith('.generated.ts') && BAND_FIELDS.test(readFileSync(f, 'utf8')),
    );
    expect(candidates.length, 'the marketplace surface must still be in scope').toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const f of candidates) {
      for (const [i, line] of strippedSource(f).split('\n').entries()) {
        if (/\.sort\s*\(/.test(line) || /Math\.(?:min|max)\s*\(\s*\.\.\./.test(line)) {
          offenders.push(`${posix(f)}:${i + 1}`);
        }
      }
    }
    expect(offenders, 'derive the band in SQL; TypeScript formats').toEqual([]);
  });

  it('every price surface records demand', () => {
    for (const f of [marketplace, catalogue]) {
      expect(strippedSource(f).includes('record_price_demand'), `${posix(f)} must record demand`).toBe(true);
    }
  });

  it('every price surface binds tenancy to the verified JWT before it resolves', () => {
    for (const f of [marketplace, catalogue]) {
      const src = strippedSource(f);
      const gate = src.search(/await\s+userCanAccessWorkspace\s*\(/);
      const resolve = src.search(/rpc\s*\(\s*'resolve_product_market_price'/);
      expect(gate, `${posix(f)} must CALL userCanAccessWorkspace, not merely import it`).toBeGreaterThan(-1);
      expect(resolve, `${posix(f)} must resolve`).toBeGreaterThan(-1);
      expect(gate, `${posix(f)}: membership check must precede the resolve`).toBeLessThan(resolve);
    }
  });

  it('a body product_id is checked against the workspace before it reaches a DEFINER rpc', () => {
    for (const f of [marketplace, catalogue]) {
      const src = strippedSource(f);
      const owns = src.search(/from\s*\(\s*'products'\s*\)/);
      const rpc = src.search(/rpc\s*\(\s*'(?:record_price_demand|resolve_product_market_price)'/);
      expect(owns, `${posix(f)} must verify the product belongs to the workspace`).toBeGreaterThan(-1);
      expect(owns, `${posix(f)}: ownership check must precede the rpc`).toBeLessThan(rpc);
    }
  });

  it('the marketplace cap basis is persisted on every path that produces a median', () => {
    const src = strippedSource(marketplace);
    const upserts = [...src.matchAll(/marketplace_market_reference'\s*\)\s*\.upsert/g)];
    expect(upserts.length, 'exactly one place writes the cap basis create_marketplace_listing reads').toBe(1);
    expect(upserts[0].index!, 'the upsert must sit after the resolver, not inside the scan branch')
      .toBeGreaterThan(src.search(/rpc\s*\(\s*'resolve_product_market_price'/));
  });
});
