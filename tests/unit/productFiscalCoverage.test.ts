/** Product fiscal-identity coverage guard. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const WAREHOUSE_SERVICE = join(ROOT, 'src/services/warehouseService.ts');
const FISCAL_CARD = join(ROOT, 'src/components/business/marketplace/ProductFiscalCard.tsx');

function fiscalKeys(): string[] {
  const src = readFileSync(WAREHOUSE_SERVICE, 'utf8');
  const block = src.match(/const FISCAL_KEYS = \[([\s\S]*?)\] as const;/);
  if (!block) throw new Error('FISCAL_KEYS not found in warehouseService.ts — did it move?');
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/**
 * Columns the card deliberately does not expose, with the reason. Anything NOT listed here has
 * to appear in the editor — the point is that dropping a field becomes a decision, not an
 * oversight.
 */
const INTENTIONALLY_ABSENT: Record<string, string> = {
  // Set by the intake flow from the document's issuer; re-picking a supplier is a catalog
  // relationship change, not a fiscal edit, and it has its own surface.
  supplier_company_id: 'owned by the supplier/brand relationship, not the fiscal editor',
};

describe('product fiscal identity is editable where it is stored', () => {
  const keys = fiscalKeys();
  const card = readFileSync(FISCAL_CARD, 'utf8');

  it('FISCAL_KEYS is non-empty and parsed correctly', () => {
    expect(keys.length).toBeGreaterThan(10);
    expect(keys).toContain('taric_code');
    expect(keys).toContain('measurement_unit_code');
  });

  it.each(fiscalKeys().filter((k) => !(k in INTENTIONALLY_ABSENT)))(
    'ProductFiscalCard writes %s',
    (key) => {
      expect(card).toContain(`${key}:`);
    },
  );

  it('every intentionally-absent key is still a real fiscal key', () => {
    for (const key of Object.keys(INTENTIONALLY_ABSENT)) {
      expect(keys).toContain(key);
    }
  });

  it('customs columns outside FISCAL_KEYS are still covered', () => {
    // country_of_origin is not part of FISCAL_KEYS (it is customs, not invoicing) but has the
    // same write-only failure mode, so it is pinned here explicitly.
    expect(card).toContain('country_of_origin');
  });

  it('a classifier suggestion is never written straight to taric_code', () => {
    // The whole safety property of the classifier: it may propose, only a human may confirm.
    const classifier = readFileSync(
      join(ROOT, 'supabase/functions/taric-classify/index.ts'), 'utf8',
    );
    // The one place taric_code is set from the model path would be an update containing both
    // taric_code and taric_status:'suggested'. That combination must not exist.
    const suggestedWrites = classifier.match(/taric_status: 'suggested'[\s\S]{0,400}?\}\)/g) ?? [];
    for (const block of suggestedWrites) {
      expect(block).not.toMatch(/(^|[^_])taric_code:/);
    }
  });
});

/**
 * Two regressions of the same shape, both introduced by features added AFTER the fiscal card
 * closed the original write-only path. Neither errored; both simply showed nothing.
 */
describe('customs data written by the pipeline is readable on the product page', () => {
  it('the Details tab reads products.attributes', () => {
    // The catch-all renderer walks `allData`. When `attributes` was not spread into it, the
    // normalised product_type / material the classifier perceives had nowhere to appear.
    const modal = readFileSync(join(ROOT, 'src/components/features/products/ProductDetailModal.tsx'), 'utf8');
    const decl = modal.slice(modal.indexOf('const allData = {'), modal.indexOf('};', modal.indexOf('const allData = {')));
    expect(decl).toContain('attributes');
    expect(decl).toContain('product.metadata');
  });

  it('an APPLIED taric code shows where it came from, not just the number', () => {
    // A code applied automatically by a confirmed rule is the case least likely to have been
    // read by a human and most likely to be questioned at a border.
    const card = readFileSync(FISCAL_CARD, 'utf8');
    expect(card).toContain('taric_source');
    expect(card).toMatch(/provenance/);
    // It must not depend on there being a pending suggestion.
    expect(card).toMatch(/provenance && !suggestion/);
  });
});
