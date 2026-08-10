/**
 * Embed-readiness guard (#341 join 5).
 *
 * The panel's job is to tell a merchant what a product still needs before the SDK can carry it.
 * Two ways that goes wrong, and neither is visible to a typecheck:
 *
 *   1. IT LIES ABOUT REACH. "Covered by an embed key" has to mean the same thing the endpoint
 *      means, or the panel promises a merchant their product is embeddable and `products-3d-api`
 *      404s it. That rule now lives once, in `embed_scope_covers_product`; the tests below fail if
 *      a second opinion reappears in TypeScript.
 *   2. IT NAGS ABOUT THE IMPOSSIBLE. USDZ cannot be produced by anything in the platform (the
 *      asset pipeline is still open on #321), so counting it would park every product permanently
 *      below 100% for a reason nobody can act on — which is how a checklist gets ignored.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  requirementsOf,
  readinessSummary,
  type ProductEmbedReadiness,
} from '../../src/services/productEmbedReadinessService';

const ROOT = process.cwd();

const base: ProductEmbedReadiness = {
  product_id: 'p1',
  workspace_id: 'w1',
  has_attributes: true,
  attribute_count: 3,
  has_published_price: true,
  has_model: true,
  model_formats: ['glb'],
  has_usdz: false,
  option_group_count: 2,
  option_groups_matching_model: 2,
  covering_key_ids: ['k1'],
};

describe('embed readiness — what it reports', () => {
  it('counts everything actionable, and never USDZ', () => {
    // The demo armchair's exact shape: everything a merchant can do, done. It must read as
    // complete, or the one fully-configured product in the catalogue still looks unfinished.
    const s = readinessSummary(base);
    expect(s.met).toBe(s.total);
    expect(s.blocked).toBe(false);
    expect(requirementsOf(base).some((r) => r.key === 'usdz')).toBe(true); // still SHOWN…
    expect(s.total).toBe(requirementsOf(base).length - 1);                 // …but never COUNTED
  });

  it('treats a missing published price as the one hard gate', () => {
    const r = readinessSummary({ ...base, has_published_price: false });
    expect(r.blocked).toBe(true);
    const price = requirementsOf({ ...base, has_published_price: false }).find((q) => q.key === 'price');
    expect(price?.hardGate).toBe(true);
    // Exactly one hard gate. If a second appears, the panel has started gating what it was
    // explicitly built not to gate — a product with no model still sells as a spec.
    expect(requirementsOf(base).filter((q) => q.hardGate).length).toBe(1);
  });

  it('says an option that targets nothing changes nothing on screen', () => {
    // The silent zero in the visual layer: the option renders, is selectable, is priced, and
    // repaints nothing, because its target names no material in the model.
    const detail = requirementsOf({ ...base, option_groups_matching_model: 1 })
      .find((q) => q.key === 'options')?.detail;
    expect(detail).toMatch(/changes nothing/i);
    // …and stays quiet when they all match, rather than warning about a healthy product.
    expect(requirementsOf(base).find((q) => q.key === 'options')?.detail).not.toMatch(/changes nothing/i);
  });

  it('every unmet requirement explains what stops working', () => {
    const none: ProductEmbedReadiness = {
      ...base,
      has_attributes: false,
      has_published_price: false,
      has_model: false,
      option_group_count: 0,
      option_groups_matching_model: 0,
      covering_key_ids: [],
    };
    for (const q of requirementsOf(none)) {
      // A checklist that only names the gap teaches nothing. Each line has to say which stage
      // stops working, which is the entire reason a merchant would act on it.
      expect(q.consequence.length, `${q.key} has no consequence`).toBeGreaterThan(30);
    }
  });
});

describe('embed readiness — the scope rule is not re-implemented', () => {
  it('the readiness service asks SQL, and decides nothing itself', () => {
    const src = readFileSync(join(ROOT, 'src/services/productEmbedReadinessService.ts'), 'utf8');
    expect(src).toContain('get_product_embed_readiness');
    // Deciding which keys qualify in TypeScript is the drift this derivation exists to prevent.
    expect(src).not.toMatch(/scope_type\s*===/);
    expect(src).not.toMatch(/from\(['"]product_3d_models['"]\)/);
    expect(src).not.toMatch(/from\(['"]product_prices['"]\)/);
  });

  it('the admin catalogue passes workspace_id through, or its own-workspace surfaces vanish', () => {
    // `ProductDetailModal` computes `isOwnProduct` as `product.workspace_id === activeWorkspaceId`
    // and hides the 3D upload card, the configurator AND this readiness panel when it is false.
    // The admin wrapper built its product object field by field and omitted workspace_id, so on
    // the ONE screen where someone manages the catalogue, nothing ever asked for a model — which
    // is a fair part of why the database holds exactly one. Silent: the modal opens and simply
    // renders less.
    const wrapper = readFileSync(join(ROOT, 'src/components/Admin/MaterialsData/ProductDetailModal.tsx'), 'utf8');
    expect(wrapper).toMatch(/workspace_id:\s*product\.workspace_id/);
  });

  it('the embed endpoint gates through the SQL rule rather than its own copy', () => {
    const src = readFileSync(join(ROOT, 'supabase/functions/products-3d-api/index.ts'), 'utf8');
    const gate = src.slice(src.indexOf('async function isProductInScope'));
    const body = gate.slice(0, gate.indexOf('\n}'));
    expect(body, 'isProductInScope must call embed_scope_covers_product').toContain('embed_scope_covers_product');
    // The branches it used to own. If they come back here, the panel and the endpoint can disagree
    // again about whether a merchant's product is reachable.
    expect(body).not.toMatch(/scopeType\s*===\s*['"]products['"]/);
    expect(body).not.toMatch(/scopeType\s*===\s*['"]categories['"]/);
  });
});
