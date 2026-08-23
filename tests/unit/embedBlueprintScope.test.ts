/**
 * Publishable blueprints on the embed surface (#382 Phase 1).
 *
 * The three things that make this safe are each one keystroke from being wrong, and every one of
 * them fails SILENTLY — a wrong scope serves a stranger someone else's configurator, and a wrong
 * payload ships the operator's cost basis. None of that raises.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { foldItemPricingForAnon, ANON_BLUEPRINT_ITEM_COLUMNS } from '../../supabase/functions/_shared/blueprint/anon-pricing.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('the anonymous blueprint payload never carries a cost basis', () => {
  it('folds material + labour + margin into one price and zeroes the inputs', () => {
    const folded = foldItemPricingForAnon({
      label: 'Base unit 600',
      material_cost: 100,
      labor_rate: 20,
      margin_pct: 50,
      is_allowance: false,
      allowance_amount: null,
    });
    // (100 + 20) x 1.5 = 180. The visitor sees the number they would be charged; the three
    // figures that produced it — supplier cost, labour rate, margin — do not leave the server.
    expect(folded.material_cost).toBe(180);
    expect(folded.labor_rate).toBe(0);
    expect(folded.margin_pct).toBe(0);
  });

  it('leaves an unpriced line NULL rather than folding it to zero', () => {
    // A schedule line (hinges, legs, doors) is a COUNT the workshop still has to price. Zero would
    // state a price nobody set — the blueprint rule that `material_cost` NULL means "not priced
    // yet", never 0.
    const folded = foldItemPricingForAnon({
      label: 'Hinges', material_cost: null, labor_rate: null, margin_pct: null,
      is_allowance: false, allowance_amount: null, is_schedule: true,
    });
    expect(folded.material_cost).toBeNull();
    expect(folded.labor_rate).toBeNull();
  });

  it('keeps an allowance amount, which is already the customer-facing figure', () => {
    const folded = foldItemPricingForAnon({
      label: 'Worktop allowance', is_allowance: true, allowance_amount: 1200,
      material_cost: 900, labor_rate: 100, margin_pct: 30,
    });
    expect(folded.allowance_amount).toBe(1200);
    // Still no cost basis, even on an allowance line.
    expect(folded.material_cost).toBeNull();
    expect(folded.margin_pct).toBe(0);
  });

  // NOTE: "carries every column the client reads" is NOT asserted here. That guard lives in
  // blueprintComposition.test.ts, where the required set is DERIVED from the client's own
  // `bi.<column>` reads rather than restated — a hardcoded copy here could pass by being updated
  // in lockstep with the bug.
  it('never emits the internal join columns', () => {
    // `blueprint_items` also carries service_id, product_id, notes, sub_blueprint_id and source.
    // A `*` select would ship all five to a stranger.
    for (const forbidden of ['service_id', 'product_id', 'notes', 'sub_blueprint_id', 'source']) {
      expect(ANON_BLUEPRINT_ITEM_COLUMNS).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

});

describe('both anonymous surfaces share one payload shape', () => {
  it('neither endpoint keeps a private copy of the fold or the column list', () => {
    for (const fn of ['public-project-plan', 'products-3d-api']) {
      const src = read(`supabase/functions/${fn}/index.ts`);
      expect(src).toContain("_shared/blueprint/anon-pricing.ts");
      // A local `function foldItemPricingForAnon` is the drift this module was extracted to end.
      expect(src).not.toMatch(/function\s+foldItemPricingForAnon/);
      // ...and so is a hand-written select list that can fall behind the shared one.
      expect(src).not.toMatch(/select\('id, blueprint_id, parent_id/);
    }
  });
});

describe('the scope vocabulary agrees across all the places it is spelled', () => {
  it("'blueprints' is accepted by the edge validator, the frontend union and the DB CHECK", () => {
    const edge = read('supabase/functions/_shared/embed-key.ts');
    expect(edge).toContain("'all' | 'categories' | 'products' | 'blueprints'");
    // The runtime allowlist, not just the type — an unrecognised value is coerced to the most
    // restrictive scope, so a missing entry here silently serves nothing.
    expect(edge).toMatch(/\['all', 'categories', 'products', 'blueprints'\] as const/);

    const service = read('src/services/embedKeysService.ts');
    expect(service).toContain("'all' | 'categories' | 'products' | 'blueprints'");
  });

  it('a blueprint-scoped key is refused products explicitly, not by falling through', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    // The category branch would return nothing anyway — by querying products.category_id against
    // blueprint ids, which is the right answer for the wrong reason.
    expect(api).toMatch(/if \(ctx\.scopeType === 'blueprints'\) return \[\];/);
  });

  it('the blueprint gate asks SQL, and fails closed on error', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    expect(api).toContain('embed_scope_covers_blueprint');
    // Same shape as isProductInScope: an RPC error answers "not in scope" rather than serving.
    const gate = api.slice(api.indexOf('async function isBlueprintInScope'));
    expect(gate.slice(0, 900)).toMatch(/if \(error\)[\s\S]{0,160}return false;/);
  });

  it('serves only published rows, and only this workspace', () => {
    const api = read('supabase/functions/products-3d-api/index.ts');
    const block = api.slice(api.indexOf("if (action === 'blueprint')"));
    const one = block.slice(0, 2000);
    expect(one).toContain("eq('is_embed_published', true)");
    expect(one).toContain("eq('workspace_id', workspaceId)");
    // 404 rather than 403, so an unpublished id and another tenant's id stay indistinguishable.
    expect(one).toContain('404');
  });
});
