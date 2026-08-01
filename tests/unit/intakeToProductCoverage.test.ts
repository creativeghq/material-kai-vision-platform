/**
 * Intake → product record coverage.
 *
 * `ReceiveToWarehouseDialog` is the widest write surface in the platform: one supplier line
 * becomes a catalog product, a price, a stock row and a set of fiscal codes. Every gap found by
 * hand on the product modal has been the same shape — a field this form collects that nothing
 * ever displays again. Fiscal identity was the first batch, weight and the per-receipt
 * dimensions the second.
 *
 * So the contract is pinned here rather than re-audited by eye: every field on `LineRow` must
 * either name the surface that shows it back, or be explicitly listed as form-only state. A new
 * field added to intake fails this test until someone says where it surfaces — which is the
 * question that keeps getting skipped.
 *
 * Note what this canNOT check: whether the surface actually renders the value at runtime. It
 * checks that a decision was recorded and that the named file still exists and still mentions
 * the underlying column. That is enough to catch the failure mode we keep hitting (nobody
 * thought about it) without pretending to be an integration test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const INTAKE = join(ROOT, 'src/modules/finance/components/ReceiveToWarehouseDialog.tsx');

const FISCAL_CARD = 'src/components/business/marketplace/ProductFiscalCard.tsx';
const STOCK_PANEL = 'src/components/business/marketplace/ProductStockPanel.tsx';
const COST_CARD = 'src/components/business/marketplace/ProductCostCard.tsx';
const PRICING_CARD = 'src/components/business/marketplace/ProductPricingCard.tsx';
const PRICE_PANEL = 'src/components/features/pricing/ProductPricePanel.tsx';
const MODAL = 'src/components/features/products/ProductDetailModal.tsx';

/**
 * Where each intake field is read back, and the token that proves the surface still handles it.
 * `null` file = form-only state with no persisted value behind it.
 */
const COVERAGE: Record<string, { file: string | null; token?: string; why?: string }> = {
  // ── Form-only state: controls, not data ───────────────────────────────────────────────
  include: { file: null, why: 'per-line checkbox — is this line received at all' },
  expanded: { file: null, why: 'accordion open/closed' },
  mode: { file: null, why: 'destination picker (skip / new / existing item)' },
  match: { file: null, why: 'chosen catalog product — becomes the product identity itself' },
  visualMatches: { file: null, why: 'transient image-search suggestions' },
  matching: { file: null, why: 'loading flag' },
  unitReason: { file: null, why: 'tooltip explaining the unit guess' },
  uploading: { file: null, why: 'loading flag' },

  // ── Product identity ──────────────────────────────────────────────────────────────────
  name: { file: MODAL, token: 'product.name' },
  sku: { file: MODAL, token: 'product.sku' },
  supplierCode: { file: COST_CARD, token: 'external_sku' },
  images: { file: MODAL, token: 'loadedImages' },

  // ── Catalog metadata. These land in products.metadata, which the Details tab walks
  //    exhaustively — unknown keys get their own card and orphan leaves are dumped under
  //    "Every remaining field", so a new metadata key can never go missing. ─────────────
  manufacturer: { file: MODAL, token: 'factory_name' },
  finish: { file: MODAL, token: 'allData?.finish' },
  series: { file: MODAL, token: 'collection' },
  color: { file: MODAL, token: 'consumedKeys' },
  grade: { file: MODAL, token: 'consumedKeys' },
  width: { file: STOCK_PANEL, token: 'width_mm' },
  length: { file: STOCK_PANEL, token: 'length_mm' },
  thickness: { file: STOCK_PANEL, token: 'thickness_mm' },
  weight: { file: STOCK_PANEL, token: 'weight_kg' },

  // ── Money ─────────────────────────────────────────────────────────────────────────────
  salePrice: { file: PRICE_PANEL, token: 'list_price' },
  markup: { file: FISCAL_CARD, token: 'markup_percent' },
  defaultDiscount: { file: PRICING_CARD, token: 'discount_percent' },

  // ── Fiscal identity — the full set is separately guarded by productFiscalCoverage ─────
  itemType: { file: FISCAL_CARD, token: 'item_type' },
  categoryId: { file: FISCAL_CARD, token: 'category_id' },
  barcode: { file: FISCAL_CARD, token: 'barcode' },
  cpv: { file: FISCAL_CARD, token: 'cpv_code' },
  taric: { file: FISCAL_CARD, token: 'taric_code' },
  vatCategory: { file: FISCAL_CARD, token: 'mydata_vat_category' },
  incomeCatWholesale: { file: FISCAL_CARD, token: 'mydata_income_classification_category' },
  incomeTypeWholesale: { file: FISCAL_CARD, token: 'mydata_income_classification_type' },
  incomeCatRetail: { file: FISCAL_CARD, token: 'mydata_income_classification_category_retail' },
  incomeTypeRetail: { file: FISCAL_CARD, token: 'mydata_income_classification_type_retail' },
  pricesIncludeVat: { file: FISCAL_CARD, token: 'prices_include_vat' },
  warranty: { file: FISCAL_CARD, token: 'warranty' },
  productUrl: { file: FISCAL_CARD, token: 'product_url' },
  notes: { file: FISCAL_CARD, token: 'notes' },

  // ── Stock row ─────────────────────────────────────────────────────────────────────────
  unit: { file: STOCK_PANEL, token: 'unitSuffix' },
  qty: { file: STOCK_PANEL, token: 'qty_on_hand' },
  location: { file: STOCK_PANEL, token: 'location' },
  reorderPoint: { file: STOCK_PANEL, token: 'reorder_point' },
  serialNumber: { file: STOCK_PANEL, token: 'serial_number' },
};

function intakeFields(): string[] {
  const src = readFileSync(INTAKE, 'utf8');
  const block = src.match(/interface LineRow \{([\s\S]*?)\n\}/);
  if (!block) throw new Error('LineRow interface not found — was it renamed?');
  return [...block[1].matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
}

describe('every field the warehouse intake collects is readable again', () => {
  const fields = intakeFields();

  it('parses the intake form (guards against an empty read)', () => {
    expect(fields.length).toBeGreaterThan(30);
    expect(fields).toContain('taric');
  });

  it.each(fields)('%s has a declared display surface', (field) => {
    expect(
      COVERAGE[field],
      `intake collects "${field}" but nothing declares where it is shown again. Add it to ` +
      `COVERAGE with the surface that displays it, or with file:null and a reason if it is ` +
      `form-only state. A field that is written and never read is the bug this test exists for.`,
    ).toBeDefined();
  });

  it.each(Object.entries(COVERAGE).filter(([, c]) => c.file))(
    '%s is still handled by its declared surface',
    (field, cov) => {
      const path = join(ROOT, cov.file as string);
      expect(existsSync(path), `${cov.file} is gone — ${field} lost its display surface`).toBe(true);
      if (cov.token) {
        expect(
          readFileSync(path, 'utf8'),
          `${cov.file} no longer mentions "${cov.token}" — did ${field} stop being displayed?`,
        ).toContain(cov.token);
      }
    },
  );

  it('form-only entries carry a reason', () => {
    for (const [field, cov] of Object.entries(COVERAGE)) {
      if (cov.file === null) {
        expect(cov.why, `${field} is marked form-only with no reason`).toBeTruthy();
      }
    }
  });

  it('COVERAGE has no entries for fields the form no longer has', () => {
    const stale = Object.keys(COVERAGE).filter((k) => !fields.includes(k)).sort();
    expect(stale, `COVERAGE lists field(s) the intake form dropped: ${stale.join(', ')}`).toEqual([]);
  });
});
