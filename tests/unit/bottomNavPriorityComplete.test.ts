/** Guard: every launcher app is RANKED for the mobile bottom bar. */

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
