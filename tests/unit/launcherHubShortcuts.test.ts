/**
 * The App Launcher's "Jump to" rail follows the Hub selected on the left. Two ways that goes wrong,
 * and neither is visible to TypeScript — a `LauncherSection[]` is a valid `LauncherSection[]` in
 * both cases:
 *
 *   • A hub with no set of its own silently falls back to the global trio, so the rail is stable
 *     again for exactly that hub and nobody notices which one. Adding a Hub to `HUBS` is the moment
 *     it happens, and adding a Hub is a one-line change in a different file.
 *   • A shortcut that repeats something the CENTRE column already offers. The centre renders every
 *     app in the hub with all of its sections and create actions, so a rail entry pointing at one of
 *     those is a second copy of a link that is already on screen, three inches to the left. That is
 *     the duplication the promoted-apps rule in AppLauncher exists to avoid, and the rail's whole
 *     justification is offering what the cards cannot reach.
 *
 * `?tab=` values are resolved against the real page by deepLinkTargets.test.ts — this file does not
 * repeat that. What neither can tell you is whether a destination is USEFUL; that stays a judgement
 * call made when the entry is written.
 */
import { describe, it, expect } from 'vitest';
import { HUBS, SIDEBAR_NAV_ITEMS, type HubId } from '@/config/nav-items';
import {
  LAUNCHER_HUB_SHORTCUTS, LAUNCHER_SHORTCUTS, LAUNCHER_SECTIONS, LAUNCHER_ACTIONS,
} from '@/config/launcher-sections';

/** Every destination the centre column can already reach for a hub: the app cards + their chips. */
function centreDestinations(hub: HubId): Map<string, string> {
  const found = new Map<string, string>();
  for (const item of SIDEBAR_NAV_ITEMS) {
    if (item.hub !== hub) continue;
    found.set(item.path, `the ${item.label} card`);
    for (const s of LAUNCHER_SECTIONS[item.id] ?? []) found.set(s.to, `${item.label} → ${s.label}`);
    for (const a of LAUNCHER_ACTIONS[item.id] ?? []) found.set(a.to, `${item.label} → ${a.label}`);
  }
  return found;
}

describe('launcher hub shortcuts', () => {
  it('every hub has its own set — none falls back to the global trio', () => {
    const missing = HUBS.filter((h) => !(LAUNCHER_HUB_SHORTCUTS[h.id]?.length > 0)).map((h) => h.id);
    expect(missing, `hubs with no "Jump to" set of their own: ${missing.join(', ')}`).toEqual([]);
  });

  it('no shortcut repeats a link the centre column already shows for that hub', () => {
    const dupes: string[] = [];
    for (const hub of HUBS) {
      const centre = centreDestinations(hub.id);
      for (const sc of LAUNCHER_HUB_SHORTCUTS[hub.id] ?? []) {
        const owner = centre.get(sc.to);
        if (owner) dupes.push(`${hub.id}: "${sc.label}" (${sc.to}) is already ${owner}`);
      }
    }
    expect(dupes, dupes.join('\n')).toEqual([]);
  });

  it('a hub never lists the same destination twice', () => {
    for (const hub of HUBS) {
      const tos = (LAUNCHER_HUB_SHORTCUTS[hub.id] ?? []).map((s) => s.to);
      expect(new Set(tos).size, `${hub.id} repeats a destination: ${tos.join(', ')}`).toBe(tos.length);
    }
  });

  it('every shortcut points at an absolute in-app path', () => {
    const all = [...Object.values(LAUNCHER_HUB_SHORTCUTS).flat(), ...LAUNCHER_SHORTCUTS];
    const bad = all.filter((s) => !s.to.startsWith('/')).map((s) => `${s.label} → ${s.to}`);
    expect(bad, `not in-app routes: ${bad.join(', ')}`).toEqual([]);
  });
});
