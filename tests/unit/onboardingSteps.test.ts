/**
 * Start Here — the walkthrough is the one surface a brand-new workspace sees, and every failure
 * it can have is silent: a highlight linking to a route that does not exist, a module slug no
 * page knows (so the tile is "permanently unavailable"), or a setup step in the registry that the
 * page has no branch for — which renders as a heading over an empty panel.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  ONBOARDING_STEPS,
  visibleOnboardingSteps,
  type OnboardingStep,
} from '@/config/onboardingSteps';
import type { Capability } from '@/auth/capabilities';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const PAGE = read('src/pages/StartHere/StartHerePage.tsx');

// ─────────────────────────────── route table ───────────────────────────────

/**
 * Every route the app declares: `App.tsx` plus each module's own registration. A module route is
 * not in App.tsx at all, so checking only the latter would vouch for /warehouse and /properties
 * without ever looking at them.
 */
function declaredRoutes(): Set<string> {
  const routes = new Set<string>();
  for (const m of read('src/App.tsx').matchAll(/path="([^"]+)"/g)) routes.add(m[1]);

  const modulesDir = join(ROOT, 'src/modules');
  for (const dir of readdirSync(modulesDir)) {
    const index = join(modulesDir, dir, 'index.ts');
    if (!existsSync(index)) continue;
    for (const m of readFileSync(index, 'utf8').matchAll(/path: '([^']+)'/g)) routes.add(m[1]);
  }
  return routes;
}

const ROUTES = declaredRoutes();

/** `/crm?tab=pipeline` → `/crm`. The `?tab=` half is deepLinkTargets.test.ts's job. */
const pathOf = (route: string) => route.split('?')[0].split('#')[0].replace(/\/+$/, '') || '/';

const routeExists = (route: string): boolean => {
  const target = pathOf(route);
  if (ROUTES.has(target)) return true;
  // A declared `:param` segment still matches a concrete path of the same shape.
  const segs = target.split('/').filter(Boolean);
  return [...ROUTES].some((pattern) => {
    const ps = pattern.split('/').filter(Boolean);
    if (ps.length !== segs.length) return false;
    return ps.every((p, i) => p.startsWith(':') || p === segs[i]);
  });
};

// ─────────────────────────────── module slugs ───────────────────────────────

const slugsIn = (src: string) =>
  [...src.matchAll(/moduleSlug: '([a-z0-9-]+)'/g)].map((m) => m[1]);

/**
 * The slugs a page-gating surface already knows. Same source `toolModuleGates.test.ts` uses: a
 * slug nothing else gates on is either a typo or a feature with no home, and both read to the
 * user as "this will never be available".
 */
const PAGE_SLUGS = new Set<string>([
  ...slugsIn(read('src/config/nav-items.ts')),
  ...slugsIn(read('src/config/capabilities.ts')),
  ...slugsIn(read('src/config/launcher-sections.ts')),
]);

// ─────────────────────────────── the registry ───────────────────────────────

describe('the Start Here registry is coherent', () => {
  it('has steps, with unique ids', () => {
    expect(ONBOARDING_STEPS.length).toBeGreaterThan(0);
    const ids = ONBOARDING_STEPS.map((s) => s.id);
    expect(new Set(ids).size, `duplicate step id: ${ids.join(', ')}`).toBe(ids.length);
  });

  it('opens with the setup work and ends on the tour', () => {
    const kinds = ONBOARDING_STEPS.map((s) => s.kind);
    const firstTour = kinds.indexOf('tour');
    expect(firstTour, 'there must be at least one tour step').toBeGreaterThan(-1);
    expect(
      kinds.slice(firstTour).every((k) => k === 'tour'),
      'setup steps come first — a form after the tour reads as an afterthought',
    ).toBe(true);
  });

  it('every step carries the copy the page renders', () => {
    for (const step of ONBOARDING_STEPS) {
      expect(step.navLabel.length, `${step.id} needs a rail label`).toBeGreaterThan(0);
      expect(step.title.length, `${step.id} needs a title`).toBeGreaterThan(0);
      expect(step.lede.length, `${step.id} needs a lede`).toBeGreaterThan(20);
    }
  });

  it('a tour step shows places, a setup step shows a form', () => {
    for (const step of ONBOARDING_STEPS) {
      if (step.kind === 'tour') {
        expect(
          step.highlights?.length ?? 0,
          `${step.id} is a tour step with nothing to point at`,
        ).toBeGreaterThanOrEqual(3);
      } else {
        expect(step.highlights, `${step.id} is a setup step and must not carry tiles`).toBeUndefined();
      }
    }
  });
});

describe('every place the walkthrough names is a place that exists', () => {
  const allHighlights = ONBOARDING_STEPS.flatMap((s) =>
    (s.highlights ?? []).map((h) => ({ step: s.id, ...h })),
  );

  it('finds highlights to check', () => {
    expect(allHighlights.length).toBeGreaterThan(10);
  });

  it('resolves the route table — a broken scan would vouch for every link here', () => {
    expect(ROUTES.has('/'), 'route scan found no "/"').toBe(true);
    expect(ROUTES.has('/agent-hub')).toBe(true);
    expect(ROUTES.has('/warehouse'), 'module routes were not scanned').toBe(true);
    expect(ROUTES.has('/properties'), 'module routes were not scanned').toBe(true);
  });

  it('every highlight points at a declared route', () => {
    const broken = allHighlights
      .filter((h) => !routeExists(h.route))
      .map((h) => `${h.step} → ${h.label}: ${h.route}`);
    expect(
      broken,
      `A Start Here tile links nowhere. This is the first screen a new workspace sees.\n${broken.join('\n')}`,
    ).toEqual([]);
  });

  it('every highlight names a module some page also gates on', () => {
    const unknown = allHighlights
      .filter((h) => h.moduleSlug && !PAGE_SLUGS.has(h.moduleSlug))
      .map((h) => `${h.step} → ${h.label}: '${h.moduleSlug}'`);
    expect(
      unknown,
      `A module slug no page-gating surface knows renders the tile as permanently unavailable.\n${unknown.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * What the nav gates each destination on, read out of nav-items rather than restated here: a
   * tile offered to a member whose guard then refuses is the "offered but not bound" failure.
   */
  const navGates = (): Map<string, { admin: boolean; capability?: string; anyCapability: boolean }> => {
    const nav = read('src/config/nav-items.ts');
    const out = new Map<string, { admin: boolean; capability?: string; anyCapability: boolean }>();
    // Nav items are written both inline and expanded, so a regex spanning to `},` runs straight
    // through the next item and mis-attributes its gates. Match braces instead.
    const items: string[] = [];
    for (const m of nav.matchAll(/\bid: '[a-z0-9-]+',/g)) {
      const open = nav.lastIndexOf('{', m.index!);
      if (open < 0) continue;
      let depth = 0;
      for (let i = open; i < nav.length; i += 1) {
        if (nav[i] === '{') depth += 1;
        else if (nav[i] === '}') {
          depth -= 1;
          if (depth === 0) { items.push(nav.slice(open, i + 1)); break; }
        }
      }
    }
    for (const body of items) {
      const path = /path: '([^']+)'/.exec(body)?.[1];
      if (!path) continue;
      const key = pathOf(path);
      const prev = out.get(key);
      const gate = {
        admin: /requireRole: 'admin'/.test(body),
        capability: /requireCapability: '([a-z.]+)'/.exec(body)?.[1],
        anyCapability: /requireAnyCapability:/.test(body),
      };
      // Two nav items can share a path; keep the LOOSER gate so the test never demands more
      // than some real nav entry demands.
      if (!prev) out.set(key, gate);
      else out.set(key, {
        admin: prev.admin && gate.admin,
        capability: prev.capability === gate.capability ? gate.capability : undefined,
        anyCapability: prev.anyCapability && gate.anyCapability,
      });
    }
    return out;
  };

  const NAV_GATES = navGates();

  it('resolves the nav gate table', () => {
    expect(NAV_GATES.size, 'nav scan found no items').toBeGreaterThan(20);
    expect(NAV_GATES.get('/market-trends')?.admin, '/market-trends is admin-gated in nav').toBe(true);
    expect(NAV_GATES.get('/finance')?.capability).toBe('finance.manage');
  });

  it('carries the admin gate the nav puts on the same route', () => {
    const ungated = allHighlights
      .filter((h) => NAV_GATES.get(pathOf(h.route))?.admin && !h.requireAdmin)
      .map((h) => `${h.step} → ${h.label}: ${h.route}`);
    expect(
      ungated,
      `The nav hides these from a non-admin; Start Here offers them anyway.\n${ungated.join('\n')}`,
    ).toEqual([]);
  });

  it('carries the capability gate the nav puts on the same route', () => {
    const ungated = allHighlights
      .filter((h) => {
        const gate = NAV_GATES.get(pathOf(h.route));
        if (!gate) return false;
        if (gate.capability && h.requireCapability !== gate.capability) return true;
        return gate.anyCapability && !h.requireAnyCapability;
      })
      .map((h) => {
        const gate = NAV_GATES.get(pathOf(h.route))!;
        return `${h.step} → ${h.label}: nav needs ${gate.capability ?? 'any-of'}, tile has ${h.requireCapability ?? 'nothing'}`;
      });
    expect(
      ungated,
      'A tile offers a destination whose CapabilityGuard will refuse the member who clicks it — '
      + 'an invited employee being walked into Finance is the case this catches.\n'
      + ungated.join('\n'),
    ).toEqual([]);
  });

  it('the page actually applies all three gates', () => {
    expect(PAGE, 'admin gate').toContain('h.requireAdmin');
    expect(PAGE, 'admin source').toContain('useFactoryRole');
    expect(PAGE, 'capability gate').toContain('can(h.requireCapability)');
    expect(PAGE, 'OR-gate').toContain('h.requireAnyCapability.some(can)');
    expect(PAGE, 'module gate').toContain('isModuleAvailable(item.moduleSlug)');
  });

  it('never repeats a tile inside one step', () => {
    for (const step of ONBOARDING_STEPS) {
      const labels = (step.highlights ?? []).map((h) => h.label);
      expect(new Set(labels).size, `${step.id} lists a tile twice: ${labels.join(', ')}`)
        .toBe(labels.length);
    }
  });
});

// ───────────────────── the page renders what the registry declares ─────────────────────

describe('the page has a branch for everything the registry declares', () => {
  const setupIds = ONBOARDING_STEPS.filter((s) => s.kind === 'setup').map((s) => s.id);

  it('every setup step has its own body', () => {
    const missing = setupIds.filter((id) => !PAGE.includes(`stepId === '${id}'`));
    expect(
      missing,
      'A setup step with no branch in SetupBody renders as a heading over an empty panel — the '
      + 'same shape as a tool chunk with no entry in AGENT_RESULT_TITLES.\n'
      + missing.join('\n'),
    ).toEqual([]);
  });

  it('SetupBody names no step the registry does not declare', () => {
    const branched = [...PAGE.matchAll(/stepId === '([a-z0-9-]+)'/g)].map((m) => m[1]);
    const orphans = branched.filter((id) => !setupIds.includes(id));
    expect(orphans, `dead branch for a step that no longer exists: ${orphans.join(', ')}`).toEqual([]);
  });

  it('tour coverage is structural — the page never names a tour step', () => {
    const tourIds = ONBOARDING_STEPS.filter((s) => s.kind === 'tour').map((s) => s.id);
    const named = tourIds.filter((id) => PAGE.includes(`'${id}'`));
    expect(
      named,
      `The page special-cases a tour step (${named.join(', ')}). Tour steps must render from `
      + 'the registry alone, or adding one silently renders nothing.',
    ).toEqual([]);
  });

  it('mounts the platform’s real settings components rather than a second copy', () => {
    // Two forms writing finance_settings.business_* is how the company profile drifted last time.
    expect(PAGE).toContain('<BusinessIdentityCard');
    expect(PAGE).toContain('<AadeCredentialsCard');
    expect(PAGE).toContain('<ModulesActivationTab');
    expect(PAGE).toContain('<TeamPanel');
    expect(
      /from '@supabase|supabase\s*\.\s*from\(/.test(PAGE),
      'the wizard must not write settings tables itself — the mounted cards own their saves',
    ).toBe(false);
  });

  it('a tile for a module the workspace lacks goes to Modules, not to a blank page', () => {
    expect(
      PAGE.includes("'/profile?tab=modules'"),
      'an unavailable highlight must redirect to Profile → Modules',
    ).toBe(true);
  });
});

// ───────────────────────────── who sees what ─────────────────────────────

describe('a member only gets the steps they could act on', () => {
  const all = (): boolean => true;
  const none = (): boolean => false;

  it('an owner/admin with finance gets every step', () => {
    const steps = visibleOnboardingSteps({ isWorkspaceManager: true, can: all });
    expect(steps.map((s) => s.id)).toEqual(ONBOARDING_STEPS.map((s) => s.id));
  });

  it('a plain member is never shown the workspace setup forms', () => {
    const steps = visibleOnboardingSteps({ isWorkspaceManager: false, can: all });
    const setup = steps.filter((s) => s.kind === 'setup');
    expect(
      setup.map((s) => s.id),
      'an invited teammate must not be walked into the VAT number form',
    ).toEqual([]);
    expect(steps.length, 'they must still get the tour').toBeGreaterThan(0);
  });

  it('a capability gate on a step is honoured', () => {
    const gated = ONBOARDING_STEPS.filter((s) => s.requireCapability);
    expect(gated.length, 'at least one step should be capability-gated').toBeGreaterThan(0);
    const steps = visibleOnboardingSteps({ isWorkspaceManager: true, can: none });
    for (const step of gated) {
      expect(
        steps.some((s) => s.id === step.id),
        `${step.id} requires ${step.requireCapability} and was shown anyway`,
      ).toBe(false);
    }
  });

  it('every capability a step names is one the app actually defines', () => {
    const capSrc = read('src/auth/capabilities.ts');
    const declared = new Set(
      [...capSrc.slice(capSrc.indexOf('export type Capability')).matchAll(/\| '([a-z.]+)'/g)]
        .map((m) => m[1]),
    );
    const unknown = ONBOARDING_STEPS
      .map((s) => s.requireCapability)
      .filter((c): c is Capability => !!c)
      .filter((c) => !declared.has(c));
    expect(unknown, `capability not declared: ${unknown.join(', ')}`).toEqual([]);
  });
});

// ───────────────────────────── the way back in ─────────────────────────────

describe('Start Here stays reachable after the first run', () => {
  it('the profile menu links to it', () => {
    const sidebar = read('src/components/core/Sidebar.tsx');
    expect(
      sidebar.includes("navigate('/start-here')"),
      'the profile dropdown is the only way back to the walkthrough',
    ).toBe(true);
    expect(sidebar).toContain('Start Here');
  });

  it('the route is declared', () => {
    expect(ROUTES.has('/start-here')).toBe(true);
  });

  it('the dashboard is the only surface that auto-opens it', () => {
    expect(read('src/pages/Index.tsx')).toContain('useOnboardingAutoOpen');
    const offenders: string[] = [];
    for (const f of ['src/App.tsx', 'src/components/core/AuthGuard.tsx', 'src/components/core/Layout.tsx']) {
      if (read(f).includes('useOnboardingAutoOpen')) offenders.push(f);
    }
    expect(
      offenders,
      `A global redirect to the walkthrough hijacks every deep link.\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});

/** Keeps the type import load-bearing so a rename of the interface fails here too. */
const _typeCheck: OnboardingStep = ONBOARDING_STEPS[0];
void _typeCheck;
