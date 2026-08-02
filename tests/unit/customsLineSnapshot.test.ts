/**
 * Customs facts must be SNAPSHOTTED on the document line, never re-read from the product.
 *
 * `products.taric_code` is a current value; a declaration is a historical statement. The EU
 * republishes the nomenclature every month, so a report that joins back to the product would
 * quietly restate a past period each time a code was renumbered — a whole class of wrong that
 * produces no error and no visible symptom until an audit.
 *
 * `invoice_items` already snapshots `unit_cost_snapshot` and `measurement_unit_code` for exactly
 * this reason. These tests pin the same discipline for the customs trio, on the surfaces that
 * consume it.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const INVOICE_BUILDER = 'supabase/functions/_shared/fiscal/invoice-builder.ts';
const FISCAL_TYPES = 'supabase/functions/_shared/fiscal/types.ts';
const CUSTOMS_CARD = 'src/modules/finance/components/OrderCustomsCard.tsx';
const REPORTS_TAB = 'src/modules/finance/tabs/ReportsTab.tsx';

describe('the invoice carries the line’s own commodity code', () => {
  const builder = read(INVOICE_BUILDER);

  it('reads taric_code from the LINE, not from a product lookup', () => {
    expect(builder).toContain('commodityCode: it.taric_code');
    // A join back to products would defeat the snapshot entirely.
    expect(builder).not.toMatch(/from\('products'\)[\s\S]{0,200}taric_code/);
  });

  it('carries country of origin too — a code alone does not determine duty', () => {
    expect(builder).toContain('countryOfOrigin: it.country_of_origin');
  });

  it('the fiscal line type declares both', () => {
    const types = read(FISCAL_TYPES);
    expect(types).toContain('commodityCode?: string;');
    expect(types).toContain('countryOfOrigin?: string;');
  });
});

describe('the order customs preview is derived, not recomputed in TypeScript', () => {
  const card = read(CUSTOMS_CARD);

  it('calls the SQL derivation', () => {
    expect(card).toContain('get_order_customs_preview');
  });

  it('does not re-derive the duty client-side', () => {
    // The €3-per-sub-heading arithmetic lives in one place. A second copy here is exactly the
    // duplicate-derivation shape the platform bans for money.
    expect(card).not.toMatch(/\*\s*3\b/);
    expect(card).not.toMatch(/length\s*\*\s*3/);
  });

  it('reports lines it could not classify or weigh, rather than dropping them', () => {
    // An unclassified line is precisely the one that holds up a clearance.
    expect(card).toContain('unclassified_lines');
    expect(card).toContain('unweighed_lines');
  });
});

describe('the Intrastat return says what it is missing', () => {
  const tab = read(REPORTS_TAB);

  it('offers both directions', () => {
    expect(tab).toContain('intrastat_dispatch');
    expect(tab).toContain('intrastat_arrival');
  });

  it('surfaces in-scope lines with no code or no weight', () => {
    // A statutory return that is quietly short is worse than one that declares its own gaps.
    expect(tab).toContain('intrastatWarning');
    expect(tab).toMatch(/unclassified/);
    expect(tab).toMatch(/unweighed/);
  });

  it('shows the warning in the result, not only as a toast', () => {
    // It has to still be on screen when the CSV is exported.
    expect(tab).toMatch(/\{intrastatWarning && !loading &&/);
  });
});
