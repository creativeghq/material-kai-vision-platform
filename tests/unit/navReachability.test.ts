/**
 * "No inert UI" for navigation: a capability-gated nav entry that NO persona can see is dead
 * weight — it ships, it looks wired, and nobody can reach it.
 *
 * This is not hypothetical. The `sales` entry (`requireCapability: 'sales.portal'`) was
 * unreachable for everyone: only the `sales`/`sales_manager` personas hold `sales.portal`, and the
 * scoped-role branch in `filterNavItems` returned `dashboard | quotes` for exactly those personas,
 * excluding `sales` itself. Reps reached /sales only via the Index redirect.
 */
import { describe, it, expect } from 'vitest';
import { SIDEBAR_NAV_ITEMS, filterNavItems, type NavGateContext } from '@/config/nav-items';
import { PERSONA_CAPABILITIES, personaCan, type Persona } from '@/auth/capabilities';

const PERSONAS = Object.keys(PERSONA_CAPABILITIES) as Persona[];

/** Mirrors how usePermissions derives the nav flags from the resolved persona. */
function ctxFor(persona: Persona, opts: { isFactory?: boolean } = {}): NavGateContext {
  return {
    isFactory: opts.isFactory ?? false,
    isAdmin: persona === 'operator',
    isPlatformOperator: persona === 'operator',
    isAccountant: persona === 'accountant',
    isSalesRep: persona === 'sales' || persona === 'sales_manager',
    isRealEstateAgent: persona === 'realestate_agent',
    // Entitlement is a per-workspace purchase, not a permission — assume everything is bought so
    // this test only measures the CAPABILITY gates.
    isModuleAvailable: () => true,
    can: (c) => personaCan(persona, c),
  };
}

/** Every persona, plus a factory-flagged variant for the `requireRole: 'factory'` entries. */
const ALL_CONTEXTS: NavGateContext[] = [
  ...PERSONAS.map((p) => ctxFor(p)),
  ctxFor('dealer', { isFactory: true }),
  ctxFor('operator', { isFactory: true }),
];

describe('sidebar nav reachability', () => {
  it('every nav item is visible to at least one persona', () => {
    const reachable = new Set(
      ALL_CONTEXTS.flatMap((ctx) => filterNavItems(SIDEBAR_NAV_ITEMS, ctx).map((i) => i.id)),
    );
    const orphans = SIDEBAR_NAV_ITEMS.filter((i) => !reachable.has(i.id)).map((i) => i.id);
    expect(orphans, `nav entries no persona can reach: ${orphans.join(', ')}`).toEqual([]);
  });

  it('a persona holding a nav item’s capability can actually see that item', () => {
    // The failure this catches: a scoped-role branch (accountant / sales rep / estate agent) that
    // returns an allowlist NOT containing the very surface that persona exists to use.
    const broken: string[] = [];
    for (const item of SIDEBAR_NAV_ITEMS) {
      const cap = item.requireCapability;
      if (!cap) continue;
      const holders = PERSONAS.filter((p) => personaCan(p, cap));
      if (holders.length === 0) continue; // covered by the orphan test above
      const anyHolderSeesIt = holders.some((p) =>
        filterNavItems(SIDEBAR_NAV_ITEMS, ctxFor(p)).some((i) => i.id === item.id));
      if (!anyHolderSeesIt) broken.push(`${item.id} (${cap}: ${holders.join('/')})`);
    }
    expect(broken, `capability granted but the nav entry is still filtered out: ${broken.join(', ')}`)
      .toEqual([]);
  });

  it('the Sales portal is reachable by both sales personas', () => {
    for (const persona of ['sales', 'sales_manager'] as const) {
      const ids = filterNavItems(SIDEBAR_NAV_ITEMS, ctxFor(persona)).map((i) => i.id);
      expect(ids, `${persona} cannot see the Sales entry`).toContain('sales');
    }
  });

  it('scoped personas stay scoped — the Sales portal is not leaked sideways', () => {
    for (const persona of ['accountant', 'employee', 'realestate_agent', 'end_user'] as const) {
      const ids = filterNavItems(SIDEBAR_NAV_ITEMS, ctxFor(persona)).map((i) => i.id);
      expect(ids, `${persona} should not see the Sales entry`).not.toContain('sales');
    }
  });

  it('entitlement gates every moduleSlug entry — including the scoped-persona subsets (#212)', () => {
    // The regression this pins: the accountant / sales-rep / estate-agent early returns used to
    // BYPASS the entitlement gate, so Finance/Quotes/Real-Estate showed in workspaces that never
    // bought those modules. With nothing entitled, no moduleSlug entry may render for ANY persona.
    const nothingEntitled = (ctx: NavGateContext): NavGateContext =>
      ({ ...ctx, isModuleAvailable: () => false });
    for (const ctx of ALL_CONTEXTS) {
      const leaked = filterNavItems(SIDEBAR_NAV_ITEMS, nothingEntitled(ctx))
        .filter((i) => i.moduleSlug)
        .map((i) => i.id);
      expect(leaked, `module-gated entries visible without entitlement: ${leaked.join(', ')}`)
        .toEqual([]);
    }
  });
});
