/**
 * Who sees what on the product record.
 *
 * `ProductDetailModal` is mounted on a dozen surfaces — the admin catalog, Discover, dashboard
 * widgets, moodboards (client-shareable), quote lines, agent results, the 3D designer — so the
 * viewer can be an operator, a warehouse hand, a sales rep, an invited employee or a project
 * client. It used to gate EVERY internal surface on one capability, `pricing.manage`, which is
 * about pricing rules and says nothing about stock or customs. That is coarse in both
 * directions: the warehouse team could not read back fields they set at intake, and one
 * capability change would have silently moved four unrelated surfaces at once.
 *
 * This test pins the intended matrix against `PERSONA_CAPABILITIES` itself, so it fails if
 * someone widens a persona rather than only if someone edits the modal. Granting
 * `warehouse.manage` to `end_user` — a project client — should be a red build, not a quiet
 * disclosure of stock levels to a customer.
 *
 * NOTE the second axis this cannot test: every gate is ALSO `&& isOwnProduct`, i.e. the product
 * belongs to the viewer's active workspace. Capability alone never unlocks anything here, and
 * the source assertions below check that the conjunction is still written that way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PERSONA_CAPABILITIES, personaCan, type Persona } from '@/auth/capabilities';

const MODAL = join(process.cwd(), 'src/components/features/products/ProductDetailModal.tsx');

/** The gates as the modal defines them, restated here so drift is visible. */
const sees = (p: Persona) => ({
  stock: personaCan(p, 'warehouse.manage'),
  availability: personaCan(p, 'warehouse.manage') || personaCan(p, 'sales.portal'),
  cost: personaCan(p, 'pricing.manage') || personaCan(p, 'sales.team.view'),
  fiscal: personaCan(p, 'pricing.manage') || personaCan(p, 'warehouse.manage') || personaCan(p, 'finance.manage'),
});

describe('product modal — internal surfaces by persona', () => {
  it('the business owner personas see everything', () => {
    for (const p of ['operator', 'dealer', 'architect'] as Persona[]) {
      expect(sees(p), p).toEqual({ stock: true, availability: true, cost: true, fiscal: true });
    }
  });

  it('staff run the warehouse and invoicing, but never see cost', () => {
    // `staff` deliberately has no pricing.manage — "team members run day-to-day but don't
    // administer the node". Cost is margin backwards, so it stays with the owners.
    expect(sees('staff')).toEqual({ stock: true, availability: true, cost: false, fiscal: true });
  });

  it('warehouse staff get stock and the fiscal fields they set at intake — nothing else', () => {
    expect(sees('warehouse_staff')).toEqual({ stock: true, availability: true, cost: false, fiscal: true });
  });

  it('a sales rep learns whether it is in stock, and no more', () => {
    expect(sees('sales')).toEqual({ stock: false, availability: true, cost: false, fiscal: false });
  });

  it('a sales manager additionally carries cost, because margin is their job', () => {
    expect(sees('sales_manager')).toEqual({ stock: false, availability: true, cost: true, fiscal: false });
  });

  it('the accountant sees fiscal identity only — not stock, not cost', () => {
    expect(sees('accountant')).toEqual({ stock: false, availability: false, cost: false, fiscal: true });
  });

  it.each(['end_user', 'employee', 'hr_staff', 'hr_manager', 'marketing_staff', 'realestate_agent'] as Persona[])(
    '%s sees no internal product data at all',
    (persona) => {
      expect(sees(persona)).toEqual({ stock: false, availability: false, cost: false, fiscal: false });
    },
  );

  it('availability does NOT key off quotes.use — project clients hold it', () => {
    // This is the trap the gate was written to avoid: `end_user` can quote, so gating
    // availability on the ability to quote would show stock levels to a customer.
    expect(personaCan('end_user', 'quotes.use')).toBe(true);
    expect(sees('end_user').availability).toBe(false);
  });
});

describe('product modal — the gates are still conjunctions with ownership', () => {
  const src = readFileSync(MODAL, 'utf8');

  it.each(['canSeeStock', 'canSeeAvailability', 'canSeeCost', 'canSeeFiscal'])(
    '%s requires isOwnProduct',
    (gate) => {
      const line = src.split('\n').find((l) => l.includes(`const ${gate} =`));
      expect(line, `${gate} declaration not found — was it renamed?`).toBeTruthy();
      expect(line, `${gate} must be conjoined with isOwnProduct`).toContain('isOwnProduct');
    },
  );

  it('ownership compares the product against the ACTIVE workspace', () => {
    const decl = src.slice(src.indexOf('const isOwnProduct ='), src.indexOf('const canSeeStock'));
    expect(decl).toContain('activeWorkspaceId');
    expect(decl).toContain('workspace_id');
  });

  it('the stock tab is still behind the paid module gate', () => {
    expect(src).toMatch(/ModuleTabGate[\s\S]{0,120}moduleSlug="stock"/);
  });
});
