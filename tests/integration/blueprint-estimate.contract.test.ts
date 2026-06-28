import { describe, it, expect } from 'vitest';
import { SUPABASE_URL } from './_harness';
import { computeLinePricing, evaluateFormula, round2 } from '../../supabase/functions/_shared/blueprint/formula';

// Money-path contract for the Blueprint estimator. The deployed public-project-plan fn
// returns each platform-starter WITH its full item list, and prices it server-side using the
// SAME shared formula module this test imports. We re-run that exact computation over the live
// payload to assert two contracts at once:
//   1. the edge fn is deployed and returns the full pricing schema, and
//   2. the seeded blueprint data stays compatible with the pricing engine (no field drift that
//      would make a starter unpriceable / produce NaN / negative prices).
// Public endpoint → no auth, no Turnstile (the `estimate` action needs a token; `starters`
// does not), no quota burn. Runs in `npm run test:integration`.
describe('contract · public blueprint estimator (money path)', () => {
  it('every platform starter stays priceable by the shared formula engine', async () => {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/public-project-plan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'starters' }),
    });
    expect(res.ok, `starters → ${res.status}`).toBe(true);
    const json = await res.json();
    expect(Array.isArray(json.starters)).toBe(true);
    expect(json.starters.length).toBeGreaterThan(0);

    for (const bp of json.starters) {
      expect(Array.isArray(bp.items), `${bp.title}: items missing`).toBe(true);

      const dims: Record<string, number> = {};
      for (const d of bp.dimensions_schema ?? []) dims[d.key] = Number(d.default ?? 0);

      const tasks = (bp.items as any[]).filter((i) => i.kind === 'task');
      expect(tasks.length, `${bp.title}: a starter must have at least one task`).toBeGreaterThan(0);

      let subtotal = 0;
      for (const t of tasks) {
        let qty = 1;
        if (t.quantity_formula && String(t.quantity_formula).trim()) {
          const ev = evaluateFormula(t.quantity_formula, dims);
          qty = ev.ok ? ev.value : Number(t.default_quantity ?? 1);
        } else {
          qty = Number(t.default_quantity ?? 1);
        }
        expect(Number.isFinite(qty), `${bp.title}/${t.label}: non-finite quantity`).toBe(true);

        const { unit_price, line_total } = computeLinePricing({
          is_allowance: t.is_allowance,
          allowance_amount: t.allowance_amount,
          material_cost: t.material_cost,
          labor_rate: t.labor_rate,
          margin_pct: t.margin_pct,
          quantity: round2(qty),
          is_selected: true,
        });
        expect(Number.isFinite(unit_price), `${bp.title}/${t.label}: non-finite unit_price`).toBe(true);
        expect(unit_price, `${bp.title}/${t.label}: negative unit_price`).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(line_total)).toBe(true);
        subtotal += line_total;
      }
      expect(Number.isFinite(subtotal)).toBe(true);
      expect(subtotal, `${bp.title}: subtotal should be > 0`).toBeGreaterThan(0);
    }
  });
});
