/**
 * Guard: every launcher app is RANKED for the mobile bottom bar.
 *
 * `BOTTOM_NAV_PRIORITY` decides which entitled destinations get one of the four bar
 * cells. Its own comment says "IDs not listed here fall back after these, in raw
 * SIDEBAR_NAV_ITEMS order — so keep this complete", and nothing enforced it.
 *
 * WHAT THAT COST, measured 2026-08-28, when the list ALSO ordered the old "More"
 * sheet: the `seo-websites` tile ("SEO Module", Profile → Websites) shipped, deployed
 * and passed every gate — and the user could not find it. It was not missing and it
 * was not hidden; it was unranked, so it sank below all 34 ranked items to the very
 * bottom of a scrolling sheet.
 *
 * That sheet is gone — the Apps panel groups by Hub and never reads this list — so an
 * unranked tile can no longer vanish that way. What it still can do is lose a bar
 * slot it was meant to have to a tile someone ranked, silently: the bar looks
 * complete, the gates pass, and the only symptom is a person saying "it used to be
 * at the bottom". Ordering is a judgement call, so this does not check WHERE an id
 * sits — only that somebody made the call. Add new tiles to the list where they belong.
 */

import { describe, expect, it } from 'vitest';
import { BOTTOM_NAV_PRIORITY, SIDEBAR_NAV_ITEMS } from '@/config/nav-items';

describe('mobile nav ordering is complete', () => {
  it('ranks every app-surface nav item', () => {
    const ranked = new Set(BOTTOM_NAV_PRIORITY);
    const unranked = SIDEBAR_NAV_ITEMS
      .filter((i) => i.surface === 'app')
      .map((i) => i.id)
      .filter((id) => !ranked.has(id));

    expect(
      unranked,
      `These app tiles have no place in BOTTOM_NAV_PRIORITY, so on mobile they fall to the ` +
        `BOTTOM of the "More" sheet behind every ranked item — present, reachable, and ` +
        `effectively invisible:\n  ${unranked.join('\n  ')}\n\n` +
        `Add each one to BOTTOM_NAV_PRIORITY in src/config/nav-items.ts, next to the surface ` +
        `it belongs with.`,
    ).toEqual([]);
  });

  it('does not rank ids that no longer exist', () => {
    // A stale id is dead weight that makes the list look more complete than it is.
    const real = new Set(SIDEBAR_NAV_ITEMS.map((i) => i.id));
    const ghosts = BOTTOM_NAV_PRIORITY.filter((id) => !real.has(id));
    expect(
      ghosts,
      `BOTTOM_NAV_PRIORITY ranks ids that are not in SIDEBAR_NAV_ITEMS any more: ${ghosts.join(', ')}`,
    ).toEqual([]);
  });

  it('has no duplicates', () => {
    const seen = new Set<string>();
    const dupes = BOTTOM_NAV_PRIORITY.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
    expect(dupes, `duplicated in BOTTOM_NAV_PRIORITY: ${dupes.join(', ')}`).toEqual([]);
  });
});
