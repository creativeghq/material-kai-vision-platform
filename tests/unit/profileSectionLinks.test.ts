/**
 * `?section=` deep links — the half of the navigation contract `deepLinkTargets.test.ts` cannot see.
 *
 * That file checks `?tab=<key>` names a pane that renders. It stops there, and four surfaces in
 * this app have since grown a SECOND level: a tab whose body is a side rail, addressed by
 * `?tab=<tab>&section=<id>`.
 *
 *   /profile?tab=schedule&section=calendar          SchedulePanel
 *   /profile?tab=social-accounts&section=whatsapp   SocialHubPanel
 *   /profile?tab=keys&section=email                 WorkspaceKeysTab
 *   /finance?tab=settings&section=banks             finance SettingsTab
 *
 * A wrong `?section=` fails in the worst available way: every rail here validates the id and
 * falls back to its default, so the route resolves, the tab opens, a perfectly good pane renders
 * — and it is the wrong one. Nothing throws, nothing is blank, and the reader has no way to tell
 * they were sent somewhere else. That is not hypothetical: `/finance?tab=settings&section=banks`
 * is what the Revolut reconciler and the bank sync put on their notifications, and `SettingsTab`
 * did not read `?section=` at all until this guard was written, so every one of those landed on
 * **General**.
 *
 * TypeScript cannot see any of it — these are string literals in config files, edge functions and
 * notification rows written months earlier, addressing a component in another module.
 *
 * The rails below are listed EXPLICITLY, and a `?section=` link for a tab that is not listed FAILS
 * rather than passing quietly: an unresolvable destination is a hole in the check, not a pass.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { blankedSource } from '../helpers/sourceIndex';
import { APP_DESTINATIONS } from '@/config/appDestinations';

const ROOT = process.cwd();
const rel = (p: string) => relative(ROOT, p).replace(/\\/g, '/');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const sourceFiles = ['src', 'supabase/functions'].flatMap((r) => walk(join(ROOT, r)));

/**
 * Section ids read out of the rail that owns them, never restated here — this file must not
 * become a fifth copy of a vocabulary that already exists four times.
 *
 * Read from SOURCE rather than imported: every one of these rails renders panes that reach the
 * Supabase client at module load, and the unit tier is hermetic (no env, no network). Importing
 * one takes the whole suite down with "Missing Supabase environment variables", which is a worse
 * failure than the one being guarded against.
 */
function idsFromSource(file: string, re: RegExp): Set<string> {
  const src = blankedSource(join(ROOT, file));
  const m = src.match(re);
  if (!m) return new Set();
  return new Set([...m[1].matchAll(/'([a-z0-9-]+)'/g)].map((x) => x[1]));
}

const RAILS: Record<string, { file: string; ids: Set<string> }> = {
  schedule: {
    file: 'src/components/core/Profile/SchedulePanel.tsx',
    ids: idsFromSource(
      'src/components/core/Profile/SchedulePanel.tsx',
      /export const SCHEDULE_SECTION_IDS: readonly ScheduleSectionId\[\] = \[([\s\S]*?)\n\];/,
    ),
  },
  'social-accounts': {
    file: 'src/modules/social-media/components/SocialHubPanel.tsx',
    ids: idsFromSource(
      'src/modules/social-media/components/SocialHubPanel.tsx',
      /const SECTIONS: Record<SectionId, React\.ComponentType> = \{([\s\S]*?)\n\};/,
    ),
  },
  keys: {
    file: 'src/components/core/Profile/WorkspaceKeysTab.tsx',
    ids: idsFromSource(
      'src/components/core/Profile/WorkspaceKeysTab.tsx',
      /const VALID_SECTIONS: SectionId\[\] = \[([\s\S]*?)\];/,
    ),
  },
  settings: {
    file: 'src/modules/finance/tabs/SettingsTab.tsx',
    ids: idsFromSource(
      'src/modules/finance/tabs/SettingsTab.tsx',
      /const SETTINGS_SECTIONS = \[([\s\S]*?)\n\] as const;/,
    ),
  },
};

interface Site { file: string; line: number }

/** Every `?tab=<tab>...&section=<id>` literal in source, with where it was written. */
function sectionLinks(): Map<string, Site[]> {
  const hits = new Map<string, Site[]>();
  const re = /\?tab=([A-Za-z0-9_-]+)&section=([A-Za-z0-9_-]+)/g;
  for (const file of sourceFiles) {
    blankedSource(file).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(re)) {
        const key = `${m[1]}|${m[2]}`;
        if (!hits.has(key)) hits.set(key, []);
        hits.get(key)!.push({ file: rel(file), line: i + 1 });
      }
    });
  }
  return hits;
}

const show = (sites: Site[]) => sites.map((s) => `${s.file}:${s.line}`).join(', ');

describe('?section= deep links', () => {
  it('the rails were actually found — an empty id set would vouch for everything', () => {
    for (const [tab, rail] of Object.entries(RAILS)) {
      expect(rail.ids.size, `no section ids parsed out of ${rail.file} for ?tab=${tab} — the scan is broken, not the links`)
        .toBeGreaterThan(1);
    }
  });

  it('finds section links at all', () => {
    expect(sectionLinks().size, 'no ?tab=…&section=… links found — the scan is broken').toBeGreaterThan(3);
  });

  it('every link addresses a tab whose rail this guard can resolve', () => {
    const unknown = [...sectionLinks().entries()]
      .filter(([k]) => !RAILS[k.split('|')[0]])
      .map(([k, sites]) => `?tab=${k.split('|')[0]} has a ?section= but no rail is registered here — ${show(sites)}`);
    expect(unknown, `section links this guard cannot check:\n${unknown.join('\n')}`).toEqual([]);
  });

  it('every ?section= names a section its rail actually offers', () => {
    const offenders: string[] = [];
    for (const [k, sites] of sectionLinks()) {
      const [tab, id] = k.split('|');
      const rail = RAILS[tab];
      if (!rail) continue; // reported above
      if (!rail.ids.has(id)) {
        offenders.push(
          `?tab=${tab}&section=${id} — ${rel(rail.file)} offers: ${[...rail.ids].sort().join(', ')} (${show(sites)})`,
        );
      }
    }
    expect(
      offenders,
      'These links land on the rail\'s DEFAULT section instead. Nothing throws and nothing is ' +
        'blank — the reader is simply somewhere else:\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The rail that reads `?section=` has to be the rail the link's TAB renders. A link spelling
   * `?tab=keys&section=calendar` would pass the check above if `calendar` happened to be a keys
   * section — this pins the pairing for the one merge that moved sections between tabs.
   */
  it('the Schedule rail carries exactly the three surfaces that merged into it', () => {
    expect([...RAILS.schedule.ids].sort()).toEqual(['appointments', 'availability', 'calendar']);

    // The fallback has to BE one of them, or an unknown ?section= normalises the URL to a pane
    // that does not exist and the rail renders `undefined`.
    const src = blankedSource(join(ROOT, RAILS.schedule.file));
    const def = src.match(/DEFAULT_SCHEDULE_SECTION: ScheduleSectionId = '([a-z-]+)'/);
    expect(def, 'SchedulePanel has no default section').toBeTruthy();
    expect(RAILS.schedule.ids.has(def![1])).toBe(true);

    // …and every id must have a pane bound to it. A rail row with no component renders nothing
    // at all, which is the same blank body the retired tabs used to produce.
    const bound = src.match(/const SECTIONS: Record<ScheduleSectionId, React\.ComponentType> = \{([\s\S]*?)\n\};/);
    expect(bound, 'SchedulePanel has no SECTIONS map').toBeTruthy();
    for (const id of RAILS.schedule.ids) {
      expect(bound![1].includes(`${id}:`), `no pane is bound to the '${id}' section`).toBe(true);
    }
  });

  /**
   * Appointments and Calendar were TABS. Their `?tab=` value is gone, so a stored notification
   * `action_url` — or a bookmark — now names a tab that renders nothing: Radix has no unknown-tab
   * branch, so the page loads with the strip drawn and an empty body. UserProfilePage has to
   * redirect them, and the redirect has to point at a section that exists.
   */
  it('every retired profile tab redirects to a section that exists', () => {
    const src = blankedSource(join(ROOT, 'src/pages/UserProfilePage.tsx'));
    const block = src.match(/const RETIRED_TABS: Record<string, string> = \{([\s\S]*?)\n\};/);
    expect(block, 'RETIRED_TABS is gone — old notification links now land on a blank pane').toBeTruthy();

    const entries = [...block![1].matchAll(/(\w+):\s*'([^']+)'/g)].map((m) => [m[1], m[2]] as const);
    const named = new Set(entries.map(([tab]) => tab));
    for (const tab of ['appointments', 'calendar']) {
      expect(named.has(tab), `?tab=${tab} was retired by the Schedule merge but nothing redirects it`).toBe(true);
    }

    for (const [tab, url] of entries) {
      const m = url.match(/\?tab=([A-Za-z0-9_-]+)(?:&section=([A-Za-z0-9_-]+))?/);
      if (!m || !m[2]) continue; // a filter-bag redirect (inbox) — covered by deepLinkTargets
      const rail = RAILS[m[1]];
      expect(rail, `${tab} redirects into ?tab=${m[1]}, which has no rail`).toBeTruthy();
      expect(rail.ids.has(m[2]), `${tab} redirects to section '${m[2]}', which ${rel(rail.file)} does not offer`).toBe(true);
    }
  });

  /**
   * A registered destination is a promise the app keeps. `agentReplyDestinations.test.ts` checks
   * the route and the `?tab=`; this adds the section, so "Profile → Calendar" in an agent reply
   * cannot quietly become a link to Appointments.
   */
  it('every app destination naming a section names one that exists', () => {
    const offenders: string[] = [];
    for (const d of APP_DESTINATIONS) {
      const m = d.route.match(/\?tab=([A-Za-z0-9_-]+)&section=([A-Za-z0-9_-]+)/);
      if (!m) continue;
      const rail = RAILS[m[1]];
      if (!rail) { offenders.push(`${d.id} → ${d.route} (no rail registered for ?tab=${m[1]})`); continue; }
      if (!rail.ids.has(m[2])) offenders.push(`${d.id} → ${d.route} (${rel(rail.file)} offers ${[...rail.ids].sort().join(', ')})`);
    }
    expect(offenders, `destinations pointing at a section that does not exist:\n${offenders.join('\n')}`).toEqual([]);
  });
});
