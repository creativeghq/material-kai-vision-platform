/**
 * myDATA document-family vocabulary guard.
 *
 * The bug this exists to stop (issue #278, phase 0): the "create invoice" document-type picker
 * kept its OWN copy of the family→label map and labelled family 6 "Self-billing", while the
 * codes it listed underneath came from `mydata_reference` and read "Self-Delivery Record" /
 * "Self-Supply Record". Appendix Par.1 is unambiguous — 6.1/6.2 are goods taken for own use.
 * Self-billing (αυτοτιμολόγηση) is not a family at all: it is the header flag
 * `invoices.self_pricing` on an ordinary 1.x/2.x document.
 *
 * An operator looking for self-billing therefore picked 6.x and filed the wrong document type
 * against AADE. Nothing could catch it: the code was valid, the description was correct, the
 * transmission succeeded. Only the group header lied.
 *
 * The durable fix is one map (`MYDATA_TYPE_FAMILY`), so these tests fail the build if a second
 * hardcoded copy comes back or if family 6 is described as self-billing again.
 *
 * SCOPE. This scans REPO FILES. The two other places this vocabulary lives are invisible here:
 * the `mydata_reference` table (the per-code descriptions, which were always right) and the
 * `invoice_items_invoice_detail_type_check` CHECK constraint — this project's SQL is applied
 * through the Supabase MCP and never committed (CLAUDE.md), so a green run says nothing about
 * either. Changing the allowed `invoiceDetailType` values means changing the CHECK too.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src/modules/finance', 'src/modules/myaade', 'src/components/business'];
/** The one file allowed to hold the family→label map. */
const CANONICAL = 'src/modules/finance/components/mydataTypes.ts';

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

/** Strip comments so prose describing the old bug doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Read the map out of the source rather than importing it. `mydataTypes.ts` pulls in
 * `invoicingSetupService` → the Supabase browser client, which throws without env vars; a
 * vocabulary guard must not need a configured backend to run.
 */
function readFamilyMap(): Record<string, string> {
  const src = stripComments(readFileSync(join(ROOT, CANONICAL), 'utf8'));
  const block = src.match(/export const MYDATA_TYPE_FAMILY[^{]*\{([\s\S]*?)\};/)?.[1];
  if (!block) throw new Error('MYDATA_TYPE_FAMILY literal not found in ' + CANONICAL);
  return Object.fromEntries([...block.matchAll(/'(\d+)'\s*:\s*'([^']*)'/g)].map((m) => [m[1], m[2]]));
}

const MYDATA_TYPE_FAMILY = readFamilyMap();

describe('myDATA family labels', () => {
  it('parses the family map out of the canonical file', () => {
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

  it('keeps the families that mydata_reference actually carries', () => {
    // Every family present in the reference table today. A code with no family label falls back
    // to "Type N.x" in the picker, which is a worse but honest label — a WRONG one is the bug.
    for (const fam of ['1', '2', '3', '5', '6', '7', '8', '9', '11']) {
      expect(MYDATA_TYPE_FAMILY[fam], `family ${fam} lost its label`).toBeTruthy();
    }
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
