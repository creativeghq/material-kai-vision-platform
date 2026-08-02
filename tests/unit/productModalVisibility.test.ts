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

/**
 * The modal must survive `product === null`.
 *
 * Every caller mounts it unconditionally — `product={selectedProduct}` alongside
 * `isOpen={!!selectedProduct}` — so the component body runs with a null product on EVERY render of
 * the dashboard (LatestWidgets), Discover, quote lines, moodboards and the agent product strip.
 * `if (!product) return null` is what makes that safe.
 *
 * The persona gates above sit ABOVE that guard, reading the prop through an
 * `as unknown as {...}` cast that erased the `| null`. tsc stayed silent, and all five surfaces
 * threw "Cannot read properties of null (reading 'workspace_id')" into the error boundary on load.
 *
 * Rule: at the TOP LEVEL of the component body, nothing above the guard may touch `product` except
 * a null check or an optional-chained read (`product?.id`, which is how the hook dep arrays cite
 * it). Reads nested inside a hook or callback are exempt — those carry their own guards and do not
 * run during the null render.
 */
describe('product modal — null product is a render, not a crash', () => {
  const src = readFileSync(MODAL, 'utf8');
  const GUARD = 'if (!product) return null;';
  const BODY_OPEN = '}) => {';

  /** Comments and string/template literals blanked in place, so prose mentioning "product" and
   *  braces inside literals cannot trip the scan. Length is preserved to keep line numbers honest. */
  const blankNoise = (s: string): string => {
    const out = s.split('');
    let state: 'code' | 'line' | 'block' | "'" | '"' | '`' = 'code';
    for (let i = 0; i < s.length; i++) {
      const c = s[i], d = s[i + 1];
      const blank = () => { if (c !== '\n') out[i] = ' '; };
      if (state === 'code') {
        if (c === '/' && d === '/') { state = 'line'; out[i] = out[i + 1] = ' '; i++; }
        else if (c === '/' && d === '*') { state = 'block'; out[i] = out[i + 1] = ' '; i++; }
        else if (c === "'" || c === '"' || c === '`') { state = c; out[i] = ' '; }
      } else if (state === 'line') {
        if (c === '\n') state = 'code'; else blank();
      } else if (state === 'block') {
        blank();
        if (c === '*' && d === '/') { out[i + 1] = ' '; state = 'code'; i++; }
      } else {
        if (c === '\\') { out[i] = ' '; if (d !== '\n') out[i + 1] = ' '; i++; }
        else { blank(); if (c === state) state = 'code'; }
      }
    }
    return out.join('');
  };

  it('the guard runs before any top-level use of the prop', () => {
    const bodyOpen = src.indexOf(BODY_OPEN, src.indexOf('export const ProductDetailModal'));
    const guardAt = src.indexOf(GUARD);
    expect(bodyOpen, 'component signature not found — was it renamed?').toBeGreaterThan(-1);
    expect(guardAt, `"${GUARD}" not found — the null guard must stay verbatim`).toBeGreaterThan(bodyOpen);

    const start = bodyOpen + BODY_OPEN.length;
    const region = blankNoise(src.slice(start, guardAt));

    // Brace depth 0 == a statement in the component body itself, not inside a hook or callback.
    const depthAt = (upTo: number): number => {
      let depth = 0;
      for (const ch of region.slice(0, upTo)) {
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
      }
      return depth;
    };

    const offenders: string[] = [];
    for (const m of region.matchAll(/\bproduct\b/g)) {
      const at = m.index!;
      if (depthAt(at) !== 0) continue;                            // nested — carries its own guard
      const after = region.slice(at + 'product'.length, at + 'product'.length + 2);
      const before = region.slice(Math.max(0, at - 1), at);
      if (after.startsWith('?.') || before === '!') continue;      // optional read / null check
      offenders.push(`line ${src.slice(0, start + at).split('\n').length}`);
    }

    expect(
      offenders,
      `top-level dereference of a possibly-null \`product\` above "${GUARD}" at ${offenders.join(', ')} — ` +
        'move it below the guard (see the "Who sees what" block)',
    ).toEqual([]);
  });
});
