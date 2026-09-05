/**
 * Agent data coverage — the baseline is held to the source.
 *
 * THE DEFECT THIS EXISTS TO CATCH (2026-09-05, conversation 9225f61f): the platform derived the
 * answer to "which keywords does our site rank for" in SQL — `get_website_rank_summary`, 129
 * keywords checked 35 minutes earlier — and no agent tool read it, so the agent answered from a
 * third-party index seven weeks stale. `agent_data_coverage()` then listed 16 website RPCs with
 * 4 exposed, and ~50 more across finance, deals, projects, stock and real estate.
 *
 * The full check needs the database (`scripts/audit-agent-data-coverage.mjs`), which CI cannot
 * reach. What CI CAN hold is the committed baseline against the tool sources:
 *   - the `exposed` list equals what the tools read today (a stale baseline is a lie about coverage);
 *   - a gap that a tool now reads has left the gap list (shrink-only — closed gaps do not linger);
 *   - every remaining gap carries a decision, not "unreviewed";
 *   - the family that started this is exposed and stays exposed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { scanExposedRpcs } from '../../scripts/audit-agent-data-coverage.mjs';

const ROOT = join(__dirname, '..', '..');
const baseline = JSON.parse(readFileSync(join(ROOT, '.github/agent-data-coverage-baseline.json'), 'utf8')) as {
  exposed: string[];
  known_gaps: Array<{ rpc: string; scope_arg: string; reason: string }>;
};

describe('agent data coverage baseline', () => {
  const exposed = scanExposedRpcs();

  it('scans a real tool surface', () => {
    // A zero here would make every assertion below vacuously pass.
    expect(exposed.length).toBeGreaterThan(30);
  });

  it('the baseline exposed set is what the tool sources read today', () => {
    expect(
      exposed,
      'the tools read a different set of RPCs than the baseline records — run: node scripts/audit-agent-data-coverage.mjs --write-baseline (needs the service key; or --sql and paste)',
    ).toEqual(baseline.exposed);
  });

  it('a gap that a tool now reads has been removed from the baseline (shrink-only)', () => {
    const exposedSet = new Set(exposed);
    const closed = baseline.known_gaps.filter((g) => exposedSet.has(g.rpc)).map((g) => g.rpc);
    expect(closed, 'these RPCs are read by a tool now — delete them from known_gaps').toEqual([]);
  });

  it('every known gap carries a decision, not "unreviewed"', () => {
    const undecided = baseline.known_gaps
      .filter((g) => !g.reason || !g.reason.trim() || /^unreviewed/i.test(g.reason))
      .map((g) => g.rpc);
    expect(undecided, 'decide each one: build the tool ("todo: …" is fine) or say why it needs none').toEqual([]);
  });

  it('the first-party SEO family that started this stays exposed', () => {
    for (const rpc of [
      'get_website_rank_summary', 'get_gsc_summary', 'get_website_health', 'get_website_crawl_report',
      'get_website_ai_visibility', 'get_website_cannibalisation', 'get_website_search_metrics',
    ]) {
      expect(exposed, `${rpc} lost its tool`).toContain(rpc);
    }
  });
});
