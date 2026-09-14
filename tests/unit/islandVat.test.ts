/**
 * Island VAT follows the DESTINATION, and an unclassifiable one refuses (#443).
 *
 * ν.5246/2025, live since 1/1/2026. A Dodecanese builder buying for a mainland job pays 24%; an
 * Athens customer taking delivery on Leros pays 17%. A wrong VAT rate is a valid percentage — no
 * typecheck, no CHECK constraint and no downstream probe can see it, and it reaches AADE that way.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { vatVerdictBlocks, type VatDestinationVerdict } from '@/modules/finance/islandVatRules';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const dialog = read('src/modules/finance/components/NewInvoiceDialog.tsx');
const notice = read('src/modules/finance/components/DeliveryVatNotice.tsx');
const service = read('src/modules/finance/services/islandVatService.ts');

const v = (over: Partial<VatDestinationVerdict>): VatDestinationVerdict =>
  ({ status: 'standard', reduced: false, reason: '', ...over });

describe('an undecidable destination blocks; every decided one does not', () => {
  it('only `unclassified` blocks', () => {
    expect(vatVerdictBlocks(v({ status: 'unclassified', reduced: null }))).toBe(true);
    for (const s of ['reduced', 'standard', 'not_applicable', 'already_reduced', 'no_reduced_equivalent'] as const) {
      expect(vatVerdictBlocks(v({ status: s })), `${s} should not block`).toBe(false);
    }
  });

  it('a missing verdict does not block by itself', () => {
    // The component blocks on a FAILED READ separately; a verdict that has not arrived yet is
    // not the same thing as one that came back undecidable.
    expect(vatVerdictBlocks(null)).toBe(false);
  });
});

describe('the rate is never computed in the client', () => {
  it('nothing multiplies a rate down', () => {
    // The island rates are STATUTORY figures, not a percentage off: 13 * 0.7 is 9.1 and the law
    // says 9. Any arithmetic here would be a second, wrong ladder.
    for (const [name, src] of [['service', service], ['notice', notice]] as const) {
      expect(src, `${name} derives a reduced rate itself`).not.toMatch(/\*\s*0\.7|0\.7\s*\*/);
      expect(src, `${name} rounds a derived rate`).not.toMatch(/Math\.round\([^)]*rate/i);
    }
  });

  it('the verdict comes from the SQL derivation', () => {
    expect(service).toContain('vat_category_for_destination');
    // `invoice_delivery_vat` has no TypeScript reader on purpose: the invoice-level verdict is
    // consumed by the nightly integrity probe, in SQL. A second door onto one derivation is how
    // two answers start.
    expect(service).not.toContain('invoice_delivery_vat');
  });
});

describe('the invoice builder acts on it', () => {
  it('the notice is rendered beside the delivery address', () => {
    expect(dialog).toContain('DeliveryVatNotice');
  });

  it('an undecidable destination stops the document being created', () => {
    // The same treatment a buyer-risk hard block gets. Letting it through is how a Leros
    // delivery quietly goes out at 24%.
    expect(dialog).toContain('vatDestinationBlocked');
    expect(dialog).toMatch(/disabled=\{busy \|\| buyerRisk\.hardBlocked \|\| vatDestinationBlocked/);
  });

  it('a failed check is treated as undecidable, not as mainland', () => {
    expect(notice).toMatch(/not a statement that the mainland rate applies/);
  });
});
