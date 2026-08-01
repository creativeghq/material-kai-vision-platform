/**
 * Product fiscal-identity coverage guard.
 *
 * `products` carries a dozen fiscal/catalog columns that decide what an invoice line, a POS
 * sale and a customs declaration say. Three surfaces WRITE them — the warehouse intake form,
 * the stock-item editor, the product modal — and for a long time only the intake form offered
 * the full set while the product modal rendered three. The result was a write-only path: an
 * operator could set an invoicing unit or a TARIC code on intake and then had nowhere to see
 * or correct it, and nothing failed, because a missing form field is not a type error and an
 * unedited column is a perfectly valid NULL.
 *
 * `FISCAL_KEYS` in warehouseService is the single definition of which columns those are. This
 * test fails the build when the editor stops covering it — the same shape of guard as
 * `toolkitCoverage`, for the same reason: two hand-maintained lists that must not drift.
 */
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
