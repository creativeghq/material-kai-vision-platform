/**
 * The Search Console → tracked-keyword engine spends money on a schedule.
 *
 * Every keyword it adds is a paid SERP call on every rotation, so the rules that keep
 * it honest — one derivation behind both the screen and the write, a ceiling, a reason
 * whenever it adds nothing, and a delete that cannot be undone by tonight's sweep —
 * are the ones that fail silently when broken: a wrong number here is still a number.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const SERVICE = read('src/services/userWebsitesService.ts');
const CARD = read('src/components/core/Profile/seo/KeywordDiscoveryCard.tsx');
const PANEL = read('src/components/core/Profile/WebsiteRankTrackerPanel.tsx');
const GSC_FN = read('supabase/functions/gsc-api/index.ts');

/** Comments say what the code IS; a rule satisfied only by prose is not satisfied. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (_m, p1) => p1);
}

describe('keyword discovery engine', () => {
  it('untracking is ONE rpc, never a delete that a later sweep can undo', () => {
    const code = blankComments(SERVICE);
    // The delete and the dismissal are one intent. Split across two writes, the first
    // commits, the second fails, and the engine adds the keyword straight back tonight.
    expect(code).toMatch(/removeTrackedKeyword[\s\S]{0,400}seo_untrack_keyword/);
    expect(code).not.toMatch(
      /removeTrackedKeyword[\s\S]{0,400}from\('seo_tracked_keywords'[\s\S]{0,80}\.delete\(\)/,
    );
  });

  it('the engine is never switched on from the client without a stated ceiling', () => {
    const code = blankComments(SERVICE);
    // `setKeywordAutotrack` is the only writer of the flag, and it clamps the limit.
    const writers = code.match(/keyword_autotrack\s*:/g) ?? [];
    expect(writers.length).toBe(1);
    expect(code).toMatch(/keyword_autotrack_limit[\s\S]{0,120}Math\.min\(/);
  });

  it('the promoter and the panel read the SAME derivation', () => {
    // Two queries answering "which queries qualify" is how a screen ends up describing
    // a decision that was made on different numbers.
    expect(blankComments(SERVICE)).toMatch(/seo_keyword_candidates/);
    expect(blankComments(SERVICE)).toMatch(/seo_promote_keyword_candidates/);
    // The card never assembles its own candidate list out of raw gsc rows.
    expect(blankComments(CARD)).not.toMatch(/from\(['"]gsc_performance/);
  });

  it('a promotion that adds nothing shows the reason the RPC gave', () => {
    const code = blankComments(CARD);
    // Silent zero, reader-facing half: "Nothing added" with no cause is the bug.
    expect(code).toMatch(/r\.added\s*>\s*0[\s\S]{0,200}r\.note/);
  });

  it('an unavailable candidate list states WHY instead of rendering empty', () => {
    const code = blankComments(CARD);
    // not_connected / not_collected / no_data are different facts and must not all
    // render as "no opportunities found".
    expect(code).toMatch(/sourceStatusPresentation/);
    expect(code).toMatch(/data\.status\s*!==\s*'ok'/);
  });

  it('the nightly sweep records its own outcome rather than trusting the cron', () => {
    const code = blankComments(GSC_FN);
    expect(code).toMatch(/seo_autotrack_sweep/);
    // The sweep result travels in the cron response; a failure is captured, not thrown
    // away, because the sync itself succeeding says nothing about the sweep.
    expect(code).toMatch(/autotrack/);
    expect(code).toMatch(/catch[\s\S]{0,200}autotrack\s*=/);
  });

  it('the tracked table can tell a chosen keyword from an automatic one', () => {
    const code = blankComments(PANEL);
    // Only `gsc_auto` rows are in reach of automatic retirement, so the table has to
    // show which is which — and be filterable by it.
    expect(code).toMatch(/gsc_auto/);
    expect(code).toMatch(/SOURCE_LABELS/);
  });

  it('a filtered-empty table offers Clear filters, never Add keywords', () => {
    const code = blankComments(PANEL);
    const filtered = code.slice(code.indexOf('sortedRows.length === 0'));
    expect(filtered).toMatch(/variant="filtered"/);
    expect(filtered.slice(0, 800)).toMatch(/Clear filters/);
    expect(filtered.slice(0, 800)).not.toMatch(/Add keywords/);
  });

  it('position sorting never treats "no position" as position zero', () => {
    const code = blankComments(PANEL);
    // An unranked keyword has no position. Sorted as 0 it lands at the top of
    // "best first", which reads as ranking #0 for everything we do not rank for.
    expect(code).toMatch(/POSITIVE_INFINITY/);
    expect(code).not.toMatch(/a\.position\s*\?\?\s*0/);
  });
});
