/** myDATA document-family vocabulary guard. */
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { MYDATA_TYPE_FAMILY } from '@/modules/finance/mydataDocumentTypes';
import AADE from '@/lib/mydataInvoiceTypes.generated.json';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/modules/finance', 'src/modules/myaade', 'src/components/business'];
/** The one file allowed to hold the family→label map. */
const CANONICAL = 'src/modules/finance/mydataDocumentTypes.ts';

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** AADE's own enumeration, committed by `npm run mydata:invoice-types` and re-checked below. */
const SPEC = join(ROOT, 'src/modules/myaade/AadeSpec/xsd/SimpleTypes-v2.0.1.xsd');
const HAVE_SPEC = existsSync(SPEC);
const AADE_FAMILIES = { codes: AADE.codes as string[], families: AADE.families as string[] };

describe('myDATA family labels', () => {
  it('finds AADE’s enumeration, and the map (guards against a vacuous pass)', () => {
    expect(AADE_FAMILIES.codes.length).toBeGreaterThan(40);
    expect(AADE_FAMILIES.codes).toContain('16.1');
    expect(Object.keys(MYDATA_TYPE_FAMILY).length).toBeGreaterThan(5);
  });

  it('describes family 6 as self-delivery / self-supply, never self-billing', () => {
    const six = MYDATA_TYPE_FAMILY['6'];
    expect(six, 'family 6 must have a label').toBeTruthy();
    expect(six.toLowerCase()).toMatch(/self-(delivery|supply)/);
    expect(six.toLowerCase()).not.toContain('self-billing');
  });

  /**
   * Self-billing is a header flag, not a document family. A family label claiming otherwise
   * sends the operator to the wrong myDATA type — the original defect.
   */
  it('never labels any family "self-billing"', () => {
    const offenders = Object.entries(MYDATA_TYPE_FAMILY)
      .filter(([, label]) => /self[-\s]?billing|self[-\s]?pricing|αυτοτιμολ/i.test(label));
    expect(offenders, 'self-billing is invoices.self_pricing, not a document family').toEqual([]);
  });

  it('names every family AADE enumerates, not the income half only', () => {
    const missing = AADE_FAMILIES.families.filter((f) => !MYDATA_TYPE_FAMILY[f]);
    expect(missing, `no label for AADE families ${missing.join(', ')}`).toEqual([]);
  });

  it('and invents none AADE does not have', () => {
    const extra = Object.keys(MYDATA_TYPE_FAMILY).filter((f) => !AADE_FAMILIES.families.includes(f));
    expect(extra, `families AADE does not enumerate: ${extra.join(', ')}`).toEqual([]);
  });

  it.skipIf(!HAVE_SPEC)('and the committed copy still matches the XSD it came from', () => {
    const xsd = readFileSync(SPEC, 'utf8');
    const at = xsd.indexOf('InvoiceType');
    const block = xsd.slice(at, at + 12_000);
    const codes = [...block.slice(0, block.indexOf('</xs:restriction>'))
      .matchAll(/<xs:enumeration value="([0-9.]+)"/g)].map((m) => m[1]);
    expect(AADE_FAMILIES.codes, 'run npm run mydata:invoice-types').toEqual(codes);
  });

  it('names the expense half as expense', () => {
    expect(MYDATA_TYPE_FAMILY['16']).toMatch(/rent/i);
    expect(MYDATA_TYPE_FAMILY['15']).toMatch(/expense/i);
    expect(MYDATA_TYPE_FAMILY['17'], '17.2-17.6 are not payroll').not.toMatch(/payroll/i);
  });
});

describe('the family→label map has exactly one copy', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('finds sources to scan', () => {
    expect(files.length).toBeGreaterThan(10);
  });

  /**
   * A myDATA family map is recognisable by mapping BOTH '6' and '11' to string labels in the
   * same literal — that pairing does not occur in any other finance vocabulary.
   */
  it('has no second hardcoded family map', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const rel = relative(ROOT, f).replace(/\\/g, '/');
      if (rel === CANONICAL) continue;
      const src = stripComments(readFileSync(f, 'utf8'));
      if (/'6'\s*:\s*['"`]/.test(src) && /'11'\s*:\s*['"`]/.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      `import MYDATA_TYPE_FAMILY from ${CANONICAL} instead of re-declaring the labels`,
    ).toEqual([]);
  });

  it('and the module holding it stays import-free, so this test can load it', () => {
    // It used to be read back out of the source with a regex, because the module that held it
    // pulled the Supabase client and threw without env vars.
    const src = readFileSync(join(ROOT, CANONICAL), 'utf8');
    expect(src, `${CANONICAL} must import nothing`).not.toMatch(/^\s*import\s/m);
  });
});

describe('invoiceDetailType is the third-party-sales line marker, not a self-billing flag', () => {
  const dialog = readFileSync(
    join(ROOT, 'src/modules/finance/components/NewInvoiceDialog.tsx'),
    'utf8',
  );

  /**
   * Appendix Par.11 ("Remarks") allows exactly two values — 1 = Third Party Sales Clearance,
   * 2 = Fee from Third Party Sales — and both are the line kinds inside a 1.5 document. The
   * Novus dev doc calls the field a "self-billing remark", which is what made #278 list it as
   * self-billing work; taking that gloss at face value would have put this control next to the
   * self-pricing checkbox on every document type, where myDATA rejects it.
   */
  it('offers exactly the two Appendix Par.11 values', () => {
    const block = stripComments(dialog).match(/const INVOICE_DETAIL_TYPES[\s\S]*?\];/)?.[0];
    expect(block, 'INVOICE_DETAIL_TYPES not found').toBeTruthy();
    const codes = [...block!.matchAll(/\['(\d+)',/g)].map((m) => m[1]);
    expect(codes).toEqual(['1', '2']);
    expect(block!.toLowerCase()).toContain('clearance');
    expect(block!.toLowerCase()).toContain('fee');
  });

  it('is gated to document type 1.5 only', () => {
    const block = stripComments(dialog).match(/const DETAIL_TYPE_DOC_CODES[\s\S]*?\);/)?.[0];
    expect(block, 'DETAIL_TYPE_DOC_CODES not found').toBeTruthy();
    const codes = [...block!.matchAll(/'([\d.]+)'/g)].map((m) => m[1]);
    expect(codes).toEqual(['1.5']);
  });
});
