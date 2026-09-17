import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';

const ROOT = process.cwd();
const FN = join(ROOT, 'supabase/functions/public-price/index.ts');
const ENDPOINTS = join(ROOT, 'scripts/edge-endpoints.json');
const CONFIG = join(ROOT, 'supabase/config.toml');

describe('the open price API', () => {
  it('exists', () => {
    expect(existsSync(FN)).toBe(true);
  });

  it('is registered as keyless, in the registry and in config.toml', () => {
    const reg = JSON.parse(readFileSync(ENDPOINTS, 'utf8')) as Array<{ name: string; security?: string[] }>;
    const entry = reg.find((e) => e.name === 'public-price');
    expect(entry, 'public-price must be in scripts/edge-endpoints.json').toBeTruthy();
    expect(entry!.security, 'it is open by design').toContain('public');
    expect(readFileSync(CONFIG, 'utf8')).toContain('[functions.public-price]');
  });

  it('does not require an API key, and only examines a kai_ bearer', () => {
    const src = strippedSource(FN);
    expect(src.includes('kai_'), 'only a kai_ bearer is treated as a key').toBe(true);
    expect(src.includes('let apiKeyId: string | null = null'), 'an absent key must not be a 401').toBe(true);
  });

  it('never accepts an internal product id', () => {
    const src = strippedSource(FN);
    for (const read of ['input.product_id', 'body.product_id', 'p_product_id: productId']) {
      expect(src.includes(read), 'keying on a catalogue id turns this into an enumeration oracle').toBe(false);
    }
    expect(src.includes('p_query: query'), 'the subject comes from the market text').toBe(true);
  });

  it('refuses an unrecognised basis instead of silently defaulting', () => {
    const src = strippedSource(FN);
    expect(src.includes('BASES.includes')).toBe(true);
    expect(src.includes('basis must be one of'),
      'a typo returning a different figure than asked for is the silent-wrong-number shape').toBe(true);
  });

  it('offers exactly the bases the SQL resolver implements', () => {
    const m = readFileSync(FN, 'utf8').match(/const BASES = \[([^\]]+)\]/);
    expect(m, 'BASES declaration not found - was it renamed?').toBeTruthy();
    const offered = [...m![1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    expect(offered).toEqual(['highest', 'lowest', 'median', 'verified_in_stock']);
  });

  it('rate-limits before it resolves, and quotas on a hash rather than the address', () => {
    const src = strippedSource(FN);
    const limit = src.indexOf("'check_price_rate_limit'");
    const resolve = src.indexOf("'resolve_query_market_price'");
    expect(limit, 'must call check_price_rate_limit').toBeGreaterThan(-1);
    expect(resolve, 'must resolve').toBeGreaterThan(-1);
    expect(limit, 'a limit applied after the work is not a limit').toBeLessThan(resolve);
    expect(src.includes('SHA-256'), 'the quota key is a hash').toBe(true);
    expect(src.includes('p_ip_hash: ipHash'), 'the raw IP must never reach the database').toBe(true);
  });

  it('fails closed when the rate limiter cannot answer', () => {
    const src = strippedSource(FN);
    expect(src.includes('error: rateError'), 'the limiter error must be captured, not discarded').toBe(true);
    expect(src.includes('if (rateError || !rate)'),
      'a keyless endpoint that lets requests through when the limiter is down is an open door').toBe(true);
    const failClosed = src.indexOf('if (rateError || !rate)');
    const resolve = src.indexOf("'resolve_query_market_price'");
    expect(failClosed).toBeLessThan(resolve);
  });

  it('records which side asked, because that is what sets the refresh cadence', () => {
    const src = strippedSource(FN);
    expect(src.includes("'record_price_demand'")).toBe(true);
    expect(src.includes("'public'"), 'keyless demand must be recorded as public').toBe(true);
    expect(src.includes("'partner_api'"), 'keyed demand must be recorded as partner_api').toBe(true);
  });

  it('never triggers a paid scan on an open request', () => {
    const src = strippedSource(FN);
    for (const paid of ['market-check', 'MIVAA_GATEWAY_URL', 'debit_credits', 'fetch(']) {
      expect(src.includes(paid), paid + ' would let an anonymous caller spend money').toBe(false);
    }
  });
});
