/**
 * Guards the top-bar search palette against the two failures that made it useless.
 *
 *  1. **Enter ran the wrong thing.** The palette searched only product names and nav labels, so
 *     any other query — a colleague, a customer, an order number — matched nothing and left the
 *     "Smart search materials" action as the sole item. cmdk highlights the first item, so Enter
 *     ran it: a person search silently became a product search and landed the user in the
 *     catalogue. The fix is source ORDER, which is why a test has to hold it: results first,
 *     nav second, the material-search action last. Nothing else in the file expresses that, and
 *     nothing about moving a JSX block back up would fail a typecheck.
 *
 *  2. **A result that cannot be opened.** Each kind's gate has to match the guard on the route it
 *     navigates to, or the palette trades "wrong destination" for "permission wall" — the same
 *     broken process wearing a different hat. `/quotes/manage/:id` is workspace-admin only and
 *     `/finance/**` is `finance.manage`; both were found by reading the router, not by guessing.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The catalogue and the grouping are pure; only the RPC call needs a client, and the unit tier
// has no secrets.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  GLOBAL_SEARCH_KINDS,
  allowedSearchKinds,
  groupHits,
  type GlobalSearchHit,
  type GlobalSearchKind,
} from '@/services/globalSearchService';
import type { Capability } from '@/auth/capabilities';

const ROOT = join(__dirname, '..', '..');
const PALETTE = readFileSync(join(ROOT, 'src/components/core/GlobalSearch.tsx'), 'utf8');

function hit(kind: GlobalSearchKind, matchRank = 2): GlobalSearchHit {
  return { kind, id: `${kind}-id`, title: kind, subtitle: null, badge: null, matchRank };
}

const ALL_CAPS = (cap: Capability) => true;
const NO_CAPS = () => false;
const ALL_MODULES = () => true;

describe('global search — the material-search action is never the default', () => {
  it('renders results, then nav, then the material-search action', () => {
    const results = PALETTE.indexOf('groups.map((group)');
    const nav = PALETTE.indexOf('navGroups.map((group)');
    const smart = PALETTE.indexOf('__smart_search__');

    expect(results, 'the palette must render `groups`').toBeGreaterThan(-1);
    expect(nav, 'the palette must render `navGroups`').toBeGreaterThan(-1);
    expect(smart, 'the palette must still offer the deep material search').toBeGreaterThan(-1);

    // cmdk highlights the FIRST item, so this order IS the Enter target.
    expect(results, 'entity results must render before nav').toBeLessThan(nav);
    expect(nav, 'the material-search action must render last, after every real result').toBeLessThan(smart);
  });

  it('labels the material-search action with where it goes', () => {
    // "Search materials for X" reads like the generic meaning of search. It is not: it navigates
    // away to the product catalogue, so the label has to say so before the user presses Enter.
    expect(PALETTE).toMatch(/Deep material search[\s\S]{0,120}Discover/);
  });

  it('searches more than products', () => {
    // The whole defect in one assertion: the palette must ask for every kind the persona can
    // reach, not just the catalogue.
    expect(PALETTE).toContain('allowedSearchKinds');
    expect(PALETTE).toContain('globalSearch(');
  });
});

describe('global search kind catalogue', () => {
  it('has no duplicate kinds', () => {
    const kinds = GLOBAL_SEARCH_KINDS.map((spec) => spec.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });

  it('every kind has a label, an icon and a route', () => {
    for (const spec of GLOBAL_SEARCH_KINDS) {
      expect(spec.label, `${spec.kind} needs a group heading`).toBeTruthy();
      expect(spec.icon, `${spec.kind} needs an icon`).toBeTruthy();
      expect(
        spec.route(hit(spec.kind), { isPlatformOperator: false, isWorkspaceManager: false }),
        `${spec.kind} must route somewhere`,
      ).toMatch(/^\//);
    }
  });

  it('routes every hit to a path that carries its id', () => {
    for (const spec of GLOBAL_SEARCH_KINDS) {
      for (const ctx of [
        { isPlatformOperator: false, isWorkspaceManager: false },
        { isPlatformOperator: true, isWorkspaceManager: true },
      ]) {
        const path = spec.route(hit(spec.kind), ctx);
        expect(path, `${spec.kind} must open the specific record, not a list`).toContain(`${spec.kind}-id`);
      }
    }
  });

  /**
   * The gate → guard pairing. Each entry is the guard actually on the destination route, read
   * from the router (`src/App.tsx` and the module route tables). Changing a route's guard without
   * changing the search gate is what puts a result behind a wall.
   */
  it('gates each kind exactly as its destination route is guarded', () => {
    const expected: Record<
      GlobalSearchKind,
      { caps?: Capability[]; module?: string; wsManager?: boolean }
    > = {
      // `/u/:id` is public; `/admin/crm/users/:id` is operator-only and the route function only
      // returns it for an operator. Server-side, search_workspace_people self-guards.
      person: {},
      company: { caps: ['crm.view'], module: 'crm' },
      contact: { caps: ['crm.view'], module: 'crm' },
      deal: { caps: ['crm.view'], module: 'deals' },
      // `/discover` guards with `anyOf={PRODUCT_BROWSE_ANY}`.
      product: { caps: ['marketplace.browse', 'moodboards.use', 'quotes.use', 'projects.use'] },
      // `/projects/:id` carries EntitlementGuard only — no CapabilityGuard.
      project: { module: 'projects' },
      // `/moodboard/:id`, `/blueprints/:id` and `/templates/:id` are AuthGuard and nothing else,
      // exactly like their nav items. RLS is what scopes the rows.
      moodboard: {},
      quote: { caps: ['quotes.use'], module: 'quotes' },
      order: { caps: ['finance.manage'], module: 'sales-finance' },
      invoice: { caps: ['finance.manage'], module: 'sales-finance' },
      property: { caps: ['realestate.view'], module: 'real-estate' },
      // `/catalogs/:id` is the one destination with the workspace-admin rung.
      catalog: { module: 'presentation-catalogs', wsManager: true },
      blueprint: {},
      template: {},
      // `/emails/templates/:id/edit` — EntitlementGuard('email') + WorkspaceAdminGuard.
      email_template: { module: 'email', wsManager: true },
      // `/agent-hub` is AuthGuard only; the page already reads `?conversation=`.
      conversation: {},
      inbox_thread: { caps: ['inbox.use'], module: 'inbox' },
    };

    for (const spec of GLOBAL_SEARCH_KINDS) {
      const want = expected[spec.kind];
      expect(want, `${spec.kind} has no recorded destination guard`).toBeTruthy();
      expect([...(spec.requireAnyCapability ?? [])].sort(), `${spec.kind} capability gate`)
        .toEqual([...(want.caps ?? [])].sort());
      expect(spec.moduleSlug ?? undefined, `${spec.kind} module gate`).toBe(want.module);
      expect(spec.requireWorkspaceManager ?? false, `${spec.kind} workspace-admin gate`)
        .toBe(want.wsManager ?? false);
    }
  });

  it('covers every record type that has a page to open, and says why the rest are absent', () => {
    // Not a style check — this list is the answer to "is search complete?", and it drifts the
    // moment someone ships a record page without adding it here.
    expect(GLOBAL_SEARCH_KINDS.map((s) => s.kind).sort()).toEqual(
      [
        'blueprint', 'catalog', 'company', 'contact', 'conversation', 'deal', 'email_template',
        'inbox_thread', 'invoice', 'moodboard', 'order', 'person', 'product', 'project',
        'property', 'quote', 'template',
      ].sort(),
    );
    // Absent ON PURPOSE. Every route in the app was enumerated and diffed against this list;
    // what is left is blocked on the same thing — there is no page that opens ONE of them:
    //   contracts, hr_employees, warehouse_items, flows, campaigns, crm_meetings,
    //   trip_expense_reports, page_watches, tech_radar_subjects, hr_job_postings,
    //   customer_assets, workspace_docs.
    // kb_docs is absent for a different reason: its only reader is the PUBLIC article page
    // (published + public), which is 3 of 677 rows — a kind that would look like coverage and
    // deliver almost none.
  });

  it('offers a persona only the kinds it can open', () => {
    // With no capabilities and no paid modules you still get the kinds whose destination route
    // is AuthGuard and nothing else — RLS is what decides you have no rows, not a gate here.
    expect(
      allowedSearchKinds({ can: NO_CAPS, isModuleAvailable: () => false, isWorkspaceManager: false }),
    ).toEqual(['person', 'moodboard', 'blueprint', 'template', 'conversation']);

    // A capability without the module is still not a surface.
    expect(
      allowedSearchKinds({ can: ALL_CAPS, isModuleAvailable: () => false, isWorkspaceManager: true }),
    ).toEqual(['person', 'product', 'moodboard', 'blueprint', 'template', 'conversation']);

    // Catalogs and email templates are the kinds behind the workspace-admin rung, so a plain
    // member loses exactly those two and keeps everything else.
    expect(
      allowedSearchKinds({ can: ALL_CAPS, isModuleAvailable: ALL_MODULES, isWorkspaceManager: false }),
    ).toEqual(
      GLOBAL_SEARCH_KINDS.map((s) => s.kind).filter(
        (k) => k !== 'catalog' && k !== 'email_template',
      ),
    );

    expect(
      allowedSearchKinds({ can: ALL_CAPS, isModuleAvailable: ALL_MODULES, isWorkspaceManager: true }),
    ).toEqual(GLOBAL_SEARCH_KINDS.map((s) => s.kind));
  });
});

describe('global search grouping', () => {
  it('floats the best match to the top, because the top row is what Enter opens', () => {
    const groups = groupHits([
      hit('product', 2),
      hit('person', 0),
      hit('company', 1),
    ]);
    expect(groups.map((g) => g.spec.kind)).toEqual(['person', 'company', 'product']);
  });

  it('breaks ties in catalogue order so equal matches never shuffle', () => {
    const groups = groupHits([hit('property', 2), hit('company', 2), hit('person', 2)]);
    expect(groups.map((g) => g.spec.kind)).toEqual(['person', 'company', 'property']);
  });

  it('keeps every hit', () => {
    const hits = [hit('person'), hit('person'), hit('company')];
    const total = groupHits(hits).reduce((n, g) => n + g.hits.length, 0);
    expect(total).toBe(hits.length);
  });

  it('drops a kind the catalogue does not know rather than rendering it unroutable', () => {
    expect(groupHits([{ ...hit('person'), kind: 'wormhole' as GlobalSearchKind }])).toEqual([]);
  });
});
