/**
 * DataForSEO spend gate — invariant 10 for the SEO agent toolkit (#365 `AD-13`, `AD-14`).
 *
 * THE BUG THIS EXISTS TO STOP. Roughly fifty SEO agent tools reach DataForSEO through MIVAA using
 * `x-cron-secret` — the OPERATOR's credential. Four separate audits walked that chain looking for
 * the layer that debits the caller before the money is spent (#352 `A18` at the tool wrappers,
 * #361 `EG-4` in `seo-api`, the MIVAA route review, and `AD-13` in the raw client) and every one
 * of them found nothing. DataForSEO was not even present in `ai_model_pricing`, so there was no
 * price to charge — while `seo_site_crawl_start` accepted `max_pages` up to 1000 and a dozen Labs
 * tools accepted `limit` up to 1000.
 *
 * Nothing failed. Ungated spend is a successful call: the tool works, the card renders, the answer
 * is correct, and the bill lands on the operator. It was found by looking, not by breaking.
 *
 * WHY A TEST AND NOT A CONVENTION. The gate lives in three dispatchers inside one file. Adding a
 * fifty-first tool means adding a call to one of them — fine — but adding a new *dispatcher*, or a
 * bare `fetch` to the SEO gateway, silently reopens the hole in exactly the way the previous four
 * audits had to find by hand. This test is the thing that notices.
 *
 * SCOPE. Edge side only. MIVAA is a separate repository (and is EMPTY in CI), so a green run says
 * nothing about what its `/seo-agent/*` routes do with the request once it arrives.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TOOLS = join(ROOT, 'supabase', 'functions', '_shared', 'tools', 'seo-agent-tools.ts');
const GATE = join(ROOT, 'supabase', 'functions', '_shared', 'tools', 'dataforseo-spend-gate.ts');
const RAW_CLIENT = join(ROOT, 'supabase', 'functions', '_shared', 'dataforseo-client.ts');

const toolsSrc = readFileSync(TOOLS, 'utf8');
const gateSrc = readFileSync(GATE, 'utf8');
const rawSrc = readFileSync(RAW_CLIENT, 'utf8');

/**
 * Every top-level `async function` in the tools file, as `{ name, body }`.
 *
 * Deliberately crude: the dispatchers are module-scoped `async function` declarations, and a body
 * that reads to the next top-level declaration is enough to answer "does this function gate before
 * it fetches". A parser would be more precise and would also be a second thing to keep working.
 */
function topLevelAsyncFunctions(src: string): Array<{ name: string; body: string }> {
  const out: Array<{ name: string; body: string }> = [];
  const re = /^async function (\w+)\s*\(/gm;
  let m: RegExpExecArray | null;
  const starts: Array<{ name: string; at: number }> = [];
  while ((m = re.exec(src)) !== null) starts.push({ name: m[1], at: m.index });
  for (let i = 0; i < starts.length; i++) {
    const end = i + 1 < starts.length ? starts[i + 1].at : src.length;
    out.push({ name: starts[i].name, body: src.slice(starts[i].at, end) });
  }
  return out;
}

/** Functions that issue a network call to the paid SEO backend. */
function dispatchers(): Array<{ name: string; body: string }> {
  return topLevelAsyncFunctions(toolsSrc).filter((f) => /await fetch\(/.test(f.body));
}

describe('DataForSEO spend gate', () => {
  it('the tools file has dispatchers to check (the scan itself still finds something)', () => {
    // A rename or a refactor that empties this list would make every assertion below vacuous —
    // the silent-zero shape applied to a guard test. Pin the floor.
    expect(dispatchers().length).toBeGreaterThanOrEqual(3);
  });

  it('every dispatcher opens a spend gate BEFORE its fetch', () => {
    for (const fn of dispatchers()) {
      const gateAt = fn.body.indexOf('openSpendGate(');
      const fetchAt = fn.body.indexOf('await fetch(');
      expect(gateAt, `${fn.name} issues a paid SEO call without opening a spend gate`).toBeGreaterThan(-1);
      expect(gateAt, `${fn.name} fetches before it gates — the money is spent either way`).toBeLessThan(fetchAt);
    }
  });

  it('every dispatcher refuses when the gate says no', () => {
    for (const fn of dispatchers()) {
      expect(
        /if \(!gate\.ok\) return/.test(fn.body),
        `${fn.name} opens a gate and ignores the answer — a debit nobody reads is a log line, not a debit`,
      ).toBe(true);
    }
  });

  it('every dispatcher settles the reservation on both the success and the failure path', () => {
    for (const fn of dispatchers()) {
      const settles = fn.body.match(/gate\.settle\(/g) ?? [];
      // At minimum: one settle for the answer, one for the non-2xx / throw path. Leaving a reserve
      // unsettled on failure turns an outage into a standing charge.
      expect(
        settles.length,
        `${fn.name} settles ${settles.length} time(s); a reserve that is never settled is a charge for nothing`,
      ).toBeGreaterThanOrEqual(2);
    }
  });

  it('HTTP 200 is not treated as success — the per-task status is checked', () => {
    // DataForSEO answers 200 for a failed task and puts the verdict in `status_code`, so an
    // unchecked body reads as a successful call that happened to return nothing (#365 AD-14).
    expect(toolsSrc).toContain('dataForSeoTaskError');
    expect(gateSrc).toContain('export function dataForSeoTaskError');
    // The raw client (used by seo-api/handlers/research.ts) needs its own check.
    expect(rawSrc).toMatch(/taskStatusError\(/);
    expect(rawSrc, 'a deterministic task error must not be retried — that pays twice for one refusal')
      .toContain('NonRetryableError');
  });

  it('the billing unit stays in step with the ai_model_pricing row', () => {
    // `dataforseo-request` is priced at $0.001/unit so that `units = cost_usd * 1000`. If either
    // half moves without the other, every DataForSEO charge is off by a factor of ten or more —
    // a wrong number, therefore invisible to typecheck and to every integrity probe.
    expect(gateSrc).toContain("export const DATAFORSEO_SERVICE = 'dataforseo-request'");
    expect(gateSrc).toMatch(/const USD_PER_UNIT = 0\.001;/);
  });

  it('no ceiling is zero — a zero reserve is a free call wearing a gate', () => {
    const ceilings = [...gateSrc.matchAll(/units:\s*(\d+)\s*\}/g)].map((m) => Number(m[1]));
    expect(ceilings.length, 'no ceilings found — the table was renamed and this check went blind').toBeGreaterThan(0);
    for (const c of ceilings) expect(c).toBeGreaterThan(0);
    expect(gateSrc).toMatch(/const DEFAULT_CEILING_UNITS = (\d+);/);
    expect(Number(/const DEFAULT_CEILING_UNITS = (\d+);/.exec(gateSrc)![1])).toBeGreaterThan(0);
  });

  it('a response with no reported cost keeps the reserve rather than settling to free', () => {
    // Settling an unknown cost to 0 refunds everything and bills nothing — the `ops.silent_zero`
    // shape, introduced by the very code meant to meter the spend.
    expect(gateSrc).toMatch(/if \(!known\)/);
    expect(gateSrc).toContain('reported no cost_usd');
  });
});
