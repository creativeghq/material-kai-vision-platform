/**
 * What a myDATA movement document (9.3, or an invoice carrying transport details) has to say.
 *
 * The platform offered SEVEN move purposes, hand-written in four places — the invoice dialog,
 * the delivery-note dialog, the admin detail page and the transmitter's own label map. All four
 * agreed with each other, and all four were wrong from code 6 onwards:
 *
 *   - `6` was labelled "Movement between premises". AADE 6 is **Φύλαξη / Storage**; the actual
 *     Ενδοδιακίνηση is **8**, which was not offered at all. A transfer between two of the
 *     operator's own warehouses was therefore filed as a storage movement.
 *   - `7` was labelled "Consignment". AADE 7 is **Επεξεργασία / Συναρμολόγηση**.
 *   - `9`–`20` did not exist here at all.
 *
 * Alongside that, three things the envelope could not express and one it could get wrong:
 * `startShippingBranch`/`completeShippingBranch` were HARDCODED to 0 while
 * `finance_branches.branch_code` sat unused; `otherMovePurposeTitle` (mandatory on purpose 19)
 * and `otherCorrelatedEntities` (the drop-ship third party) had nowhere to come from; and an
 * unset purpose silently became **1 = Sale**.
 *
 * Every one of those produces a valid document making a false statement, which is why they are
 * pinned here rather than left to a type or a constraint.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  MYDATA_MOVE_PURPOSES, SELECTABLE_MOVE_PURPOSES, MYDATA_MOVE_PURPOSE_OTHER,
  movePurposeLabel, isMydataMovePurpose,
} from '@/services/fiscal/fiscalVocabulary';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

describe('move purpose is AADE\'s table, not the seven we made up', () => {
  it('covers 1..20 with no gaps', () => {
    expect(MYDATA_MOVE_PURPOSES.map((p) => p.code)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it.each([
    [6, 'Storage'],
    [7, 'Processing / assembly / disassembly'],
    [8, 'Movement between own premises'],
    [19, 'Other transfers'],
    [20, 'Transport / courier'],
  ])('code %i is %s', (code, en) => {
    expect(movePurposeLabel(code)).toBe(en);
  });

  it('the three codes the old list got wrong cannot read the old way', () => {
    // 6 was "Movement between premises" and 7 was "Consignment" in all four copies.
    expect(movePurposeLabel(6)).not.toMatch(/premises/i);
    expect(movePurposeLabel(7)).not.toMatch(/consignment/i);
    // …and the meaning they were reaching for now has its real code.
    expect(movePurposeLabel(8)).toMatch(/premises/i);
  });

  it('every purpose is named in both languages', () => {
    for (const p of MYDATA_MOVE_PURPOSES) {
      expect(p.en.trim(), `code ${p.code} has no English name`).not.toBe('');
      expect(p.el.trim(), `code ${p.code} has no Greek name`).not.toBe('');
      expect(movePurposeLabel(p.code, 'el')).toBe(p.el);
    }
  });

  it('a picker offers only what can still be submitted', () => {
    // 6, 15, 16, 17 and 18 were withdrawn from myDATA v1.0.11. They stay in the table so a
    // HISTORICAL document still renders its real name — they are only kept out of new ones.
    expect(SELECTABLE_MOVE_PURPOSES.map((p) => p.code)).not.toContain(6);
    expect(SELECTABLE_MOVE_PURPOSES.map((p) => p.code)).not.toContain(18);
    expect(movePurposeLabel(6)).toBe('Storage');
    expect(SELECTABLE_MOVE_PURPOSES.length).toBe(MYDATA_MOVE_PURPOSES.filter((p) => p.submittable).length);
  });

  it('an unknown purpose reads as itself rather than borrowing a neighbour\'s name', () => {
    expect(movePurposeLabel(99)).toBe('99');
    expect(movePurposeLabel(null)).toBe('');
    expect(isMydataMovePurpose(21)).toBe(false);
    expect(isMydataMovePurpose(0)).toBe(false);
    expect(isMydataMovePurpose(19)).toBe(true);
  });

  it('19 is the escape hatch, so nothing has to be approximated', () => {
    expect(MYDATA_MOVE_PURPOSE_OTHER).toBe(19);
    expect(MYDATA_MOVE_PURPOSES.find((p) => p.code === 19)?.submittable).toBe(true);
  });

  it('no file keeps its own copy of the list', () => {
    for (const f of [
      'src/modules/finance/components/NewInvoiceDialog.tsx',
      'src/modules/finance/components/NewDeliveryNoteDialog.tsx',
      'src/pages/Admin/InvoiceDetailPage.tsx',
      'supabase/functions/_shared/fiscal/invoice-builder.ts',
    ]) {
      const src = read(f);
      expect(src, `${f} still spells out the purposes`).not.toMatch(/Consignment/i);
      expect(src, `${f} still spells out the purposes`).not.toMatch(/Movement between premises/i);
      expect(src, `${f} declares its own purpose map`).not.toMatch(/MOVE_PURPOSES?\s*(:|=)\s*[[{]/);
    }
  });
});

describe('a movement states its purpose, or is refused', () => {
  const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');

  it('neither builder defaults an unset purpose to "sale"', () => {
    // `dn.move_purpose ? parseInt(...) || 1 : 1` in both. A movement nobody classified was
    // filed as a SALE — a valid code, and the field an audit reads first.
    expect(builder).not.toMatch(/move_purpose\s*\?\s*parseInt/);
    expect(builder).toMatch(/assertMovePurpose\(inv\.move_purpose/);
    expect(builder).toMatch(/assertMovePurpose\(dn\.move_purpose/);
  });

  it('the refusal names the document and points at purpose 19', () => {
    expect(builder).toMatch(/Refusing to transmit \$\{subject\}/);
    expect(builder).toMatch(/19/);
  });

  it('the purpose NAME is printed, not the bare code', () => {
    for (const f of [
      'src/modules/finance/invoice-templates/renderData.ts',
      'supabase/functions/finance-invoice-pdf/index.ts',
    ]) {
      const src = read(f);
      expect(src, `${f} prints the raw code`).not.toMatch(/\$\{L\.purpose\}: \$\{inv\.move_purpose\}/);
      expect(src).toMatch(/movePurposeLabel\(inv\.move_purpose/);
    }
  });
});

describe('the transport block carries what AADE offers', () => {
  const novus = read('supabase/functions/_shared/fiscal/novus.ts');

  it('shipping branches come from the document, not from a hardcoded 0', () => {
    expect(novus).not.toMatch(/startShippingBranch:\s*0\s*,/);
    expect(novus).not.toMatch(/completeShippingBranch:\s*0\s*,/);
    expect(novus).toMatch(/startShippingBranch:\s*header\.loadingBranch/);
    expect(novus).toMatch(/completeShippingBranch:\s*header\.deliveryBranch/);
  });

  it('the free-text purpose title and third-party entities reach the envelope', () => {
    expect(novus).toMatch(/otherMovePurposeTitle/);
    expect(novus).toMatch(/otherCorrelatedEntities/);
  });

  it('a third party is allowlisted out of stored jsonb, never spread into the envelope', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    expect(builder).toMatch(/function correlatedEntitiesFrom/);
    // Stored jsonb is untrusted input (invariant 8): an entry identifying nobody is dropped.
    expect(builder).toMatch(/if \(!vatNumber\) return \[\]/);
    expect(builder).not.toMatch(/otherCorrelatedEntities:\s*\w+\.correlated_entities/);
  });

  it('an incomplete loading or delivery address is refused, not padded', () => {
    // The builders' fallback chain ends in '', and the counterpart block fills a missing
    // postcode with '0' and a missing city with 'NONE' — a plausible-looking placeholder on a
    // registered document is worse than a blank one.
    expect(novus).toMatch(/Refusing to transmit a movement document/);
    expect(novus).toMatch(/header\.movePurpose != null/);
  });
});
