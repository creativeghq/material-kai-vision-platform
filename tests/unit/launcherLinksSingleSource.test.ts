/**
 * The desktop Apps popover and the mobile Apps panel show the SAME tree — hubs, apps, and each
 * app's inner links (sections, create actions, quick-starts, the hub's "Jump to") — and that is
 * only true while both derive it from one place.
 *
 * The derivation is `src/config/launcher-links.ts`. It applies three gates to every link (the
 * workspace's entitlement, the person's capability, workspace-admin), and the failure it prevents
 * is quiet: the desktop used to run all three on a section and only two on a shortcut, and a
 * second surface copying either version by hand would have offered a link that resolves perfectly
 * and lands on an access wall — visible to no typecheck, because a wrong `LauncherSection[]` is a
 * valid `LauncherSection[]`.
 *
 * Three things are pinned here:
 *   1. No file under src/ indexes the LAUNCHER_* tables except the shared derivation. A new
 *      `LAUNCHER_SECTIONS[app.id]` anywhere else is the second copy coming back.
 *   2. Both surfaces read through the hook.
 *   3. The derivation, the URL-ownership rule the mobile panel opens with, and the shared recent
 *      list behave as documented — against the REAL tables, not fixtures.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { blankedSource } from '../helpers/sourceIndex';
import { appLinkSet, hubShortcutSet, type LinkGate } from '@/config/launcher-links';
import { matchAppForLocation } from '@/config/launcher-location';
import { readRecentApps, pushRecentApp } from '@/services/launcherRecent';
import { SIDEBAR_NAV_ITEMS, HUBS } from '@/config/nav-items';
import { LAUNCHER_ACTIONS, LAUNCHER_HUB_SHORTCUTS, LAUNCHER_SHORTCUTS } from '@/config/launcher-sections';
import type { LauncherApp } from '@/hooks/useLauncherApps';

const ROOT = process.cwd();
const rel = (p: string) => relative(ROOT, p).split(sep).join('/');

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

const DERIVATION = 'src/config/launcher-links.ts';
const DEFINITION = 'src/config/launcher-sections.ts';
const SURFACES = ['src/components/core/AppLauncher.tsx', 'src/components/core/MobileAppsMenu.tsx'];
const INDEX_RE = /\bLAUNCHER_(?:SECTIONS|ACTIONS|HUB_SHORTCUTS)\s*\[/g;

describe('launcher links have one derivation', () => {
  it('no file under src/ indexes the LAUNCHER_* tables except the shared derivation', () => {
    const offenders: string[] = [];
    for (const f of walk(join(ROOT, 'src'))) {
      const r = rel(f);
      if (r === DERIVATION || r === DEFINITION) continue;
      const src = blankedSource(f);
      for (const m of src.matchAll(INDEX_RE)) {
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${r}:${line}  ${m[0].trim()}`);
      }
    }
    expect(
      offenders,
      `These read a LAUNCHER_* table directly. Every surface that shows an app's inner links must ` +
        `call appLinkSet / hubShortcutSet (via useLauncherLinks) so the desktop popover and the ` +
        `mobile panel cannot disagree about what is offered:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });

  it('both Apps surfaces read the shared hook', () => {
    for (const f of SURFACES) {
      expect(blankedSource(join(ROOT, f)), `${f} must derive inner links through useLauncherLinks`)
        .toMatch(/\buseLauncherLinks\b/);
    }
  });
});

// ─────────────────────────── the derivation, against the real tables ───────────────────────────

const OPEN: LinkGate = { isModuleAvailable: () => true, can: () => true, isWorkspaceManager: true };

function app(id: string, active = true): LauncherApp {
  const item = SIDEBAR_NAV_ITEMS.find((i) => i.id === id);
  if (!item) throw new Error(`no nav item ${id}`);
  return { id, label: item.label, icon: item.icon, path: item.path, active, moduleSlug: item.moduleSlug, hub: item.hub };
}

describe('appLinkSet', () => {
  it('an inactive app has nothing to expand — no create action, no quick-start', () => {
    const s = appLinkSet(app('finance', false), OPEN);
    expect(s.actions).toEqual([]);
    expect(s.quickStarts).toEqual([]);
    expect(s.hasLinks).toBe(false);
  });

  it('a section behind a separate add-on is withheld from a workspace that does not own it', () => {
    const gate: LinkGate = { ...OPEN, isModuleAvailable: (slug) => slug !== 'real-estate-management' };
    const labels = appLinkSet(app('real-estate'), gate).sections.map((s) => s.label);
    expect(labels).not.toContain('Property Mgmt');
    expect(labels).toContain('Investments');
  });

  it('a section behind a capability is withheld from a person who lacks it', () => {
    const gate: LinkGate = { ...OPEN, can: () => false };
    const labels = appLinkSet(app('seo-websites'), gate).sections.map((s) => s.label);
    expect(labels).toEqual(['Connected websites']);
  });

  it('an agent app with no sections falls back to its toolkit quick-starts, each resolved to a URL', () => {
    const s = appLinkSet(app('interior'), OPEN);
    expect(s.sections).toEqual([]);
    expect(s.quickStarts.length).toBeGreaterThan(0);
    for (const qs of s.quickStarts) {
      expect(qs.to).toMatch(/^\/agent-hub\?capability=interior&quickstart=generation:/);
    }
    expect(s.hasLinks).toBe(true);
  });

  it('create actions come from the table, for an active app', () => {
    expect(appLinkSet(app('crm'), OPEN).actions.map((a) => a.label))
      .toEqual(LAUNCHER_ACTIONS.crm.map((a) => a.label));
  });
});

describe('hubShortcutSet', () => {
  it('every hub resolves to its own set; the catch-all group falls back to the global trio', () => {
    for (const h of HUBS) {
      expect(hubShortcutSet(h.id, OPEN).map((s) => s.to))
        .toEqual(LAUNCHER_HUB_SHORTCUTS[h.id].map((s) => s.to));
    }
    const trio = LAUNCHER_SHORTCUTS.map((s) => s.to);
    expect(hubShortcutSet('more', OPEN).map((s) => s.to)).toEqual(trio);
    expect(hubShortcutSet(null, OPEN).map((s) => s.to)).toEqual(trio);
  });

  it('a shortcut into a capability-guarded route is withheld from a person without the capability', () => {
    const gate: LinkGate = { ...OPEN, can: () => false };
    expect(hubShortcutSet('sales', gate).map((s) => s.label)).not.toContain('Find materials');
    expect(hubShortcutSet('sales', OPEN).map((s) => s.label)).toContain('Find materials');
  });
});

// ─────────────────────────── which app owns a URL ───────────────────────────

const APPS = SIDEBAR_NAV_ITEMS.filter((i) => i.surface === 'app').map(({ id, path }) => ({ id, path }));
const at = (url: string) => {
  const [pathname, search = ''] = url.split('?');
  return matchAppForLocation(APPS, pathname, search ? `?${search}` : '')?.id ?? null;
};

describe('matchAppForLocation', () => {
  it('a query parameter that is part of an app identity decides between siblings on one route', () => {
    expect(at('/crm?tab=pipeline')).toBe('deals');
    expect(at('/crm?tab=contacts')).toBe('crm');
    expect(at('/crm')).toBe('crm');
  });

  it('agent apps sharing /agent-hub are told apart by ?capability=, and bare /agent-hub is nobody', () => {
    expect(at('/agent-hub?capability=interior')).toBe('interior');
    expect(at('/agent-hub?capability=seo-research')).toBe('seo');
    expect(at('/agent-hub')).toBeNull();
  });

  it('a later parameter is configuration: absent is fine, present-and-different is not', () => {
    expect(at('/agent-hub?capability=image-studio&generation_mode=image-edit')).toBe('image-studio');
    expect(at('/agent-hub?capability=image-studio&quickstart=generation:Re-light%20a%20room')).toBe('image-studio');
    expect(at('/profile?tab=social-accounts&section=whatsapp')).toBe('whatsapp');
    expect(at('/profile?tab=social-accounts&section=linkedin')).toBeNull();
  });

  it('matches whole path segments under the app, never a longer word', () => {
    expect(at('/properties/123')).toBe('real-estate');
    expect(at('/financex')).toBeNull();
    expect(at('/')).toBeNull();
    expect(at('/tools/heat-pump')).toBeNull();
  });
});

// ─────────────────────────── the shared recent list ───────────────────────────

describe('recent apps', () => {
  const store = new Map<string, string>();
  const shim = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => store.clear(),
  };
  const g = globalThis as unknown as { localStorage?: unknown };

  beforeEach(() => {
    store.clear();
    g.localStorage = shim;
  });

  it('moves the opened app to the front and keeps four', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'b']) pushRecentApp(id);
    expect(readRecentApps()).toEqual(['b', 'e', 'd', 'c']);
  });

  it('a corrupt or missing store reads as empty and never throws', () => {
    store.set('launcher.recent.v1', '{not json');
    expect(readRecentApps()).toEqual([]);
    store.set('launcher.recent.v1', JSON.stringify([1, 'x', null]));
    expect(readRecentApps()).toEqual(['x']);
    delete g.localStorage;
    expect(readRecentApps()).toEqual([]);
    expect(() => pushRecentApp('x')).not.toThrow();
  });
});
