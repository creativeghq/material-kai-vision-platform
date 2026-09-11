/** What a myDATA movement document (9.3, or an invoice carrying transport details) has to say. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  MYDATA_MOVE_PURPOSES, SELECTABLE_MOVE_PURPOSES, MYDATA_MOVE_PURPOSE_OTHER,
  movePurposeLabel, isMydataMovePurpose,
  MYDATA_RECEIVING_NOTE_PURPOSES, MYDATA_RECEIVING_NOTE_PURPOSE_OTHER,
  receivingNotePurposeLabel, selectableReceivingNotePurposes, isReceivingNoteType,
  MYDATA_PACKAGING_TYPES, MYDATA_PACKAGING_TYPE_OTHER, packagingTypeLabel,
  MYDATA_MOVEMENT_DOC_TYPES, isMovementDocType, canBeDeliveryNote,
  MYDATA_SPECIAL_INVOICE_CATEGORIES, MYDATA_INVOICE_VARIATION_TYPES,
  MYDATA_REVERSE_DELIVERY_PURPOSES, MYDATA_ENTITY_TYPES, MYDATA_ENTITY_TYPE_TRANSPORTER,
  MYDATA_ENTITY_TYPE_OTHER, MYDATA_DISPATCH_NOTE_TYPES, isDispatchNoteType,
  MYDATA_THIRD_PARTY_COLLECTION_TYPES, MYDATA_NO_MULTIPLE_MARKS_TYPES,
  acceptsOnDocumentType,
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

describe('myDATA v2.0.2 — a receiving note (ΔΠΠ) says why it was issued', () => {
  it('covers AADE §8.24 codes 1..7 with no gaps, in both languages', () => {
    expect(MYDATA_RECEIVING_NOTE_PURPOSES.map((p) => p.code)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const p of MYDATA_RECEIVING_NOTE_PURPOSES) {
      expect(p.en.trim(), `code ${p.code} has no English name`).not.toBe('');
      expect(p.el.trim(), `code ${p.code} has no Greek name`).not.toBe('');
      expect(receivingNotePurposeLabel(p.code, 'el')).toBe(p.el);
    }
  });

  it('code 5 (ΠΟΣΟΤΙΚΟΣ ΕΛΕΓΧΟΣ) is offered on 10.1 only — AADE accepts it nowhere else', () => {
    expect(selectableReceivingNotePurposes('10.1').map((p) => p.code)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(selectableReceivingNotePurposes('10.2').map((p) => p.code)).toEqual([1, 2, 3, 4, 6, 7]);
  });

  it('a type that is not a receiving note is offered nothing', () => {
    expect(selectableReceivingNotePurposes('9.3')).toHaveLength(0);
    expect(selectableReceivingNotePurposes(null)).toHaveLength(0);
    expect(isReceivingNoteType('10.1')).toBe(true);
    expect(isReceivingNoteType('10.2')).toBe(true);
    expect(isReceivingNoteType('9.3')).toBe(false);
  });

  it('an unknown code reads as itself rather than borrowing a neighbour name', () => {
    expect(receivingNotePurposeLabel(99)).toBe('99');
    expect(receivingNotePurposeLabel(null)).toBe('');
  });

  it('7 is the escape hatch, so nothing has to be approximated', () => {
    expect(MYDATA_RECEIVING_NOTE_PURPOSE_OTHER).toBe(7);
    expect(receivingNotePurposeLabel(7, 'el')).toMatch(/ΛΟΙΠΕΣ/);
  });

  it('the connector REFUSES a 10.x with no purpose, and a purpose the type rejects', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(novus).toMatch(/isReceivingNoteType\(header\.invoiceType\)/);
    expect(novus).toMatch(/header\.receivingNotePurpose/);
    // Refused, never defaulted: the seven codes are different tax facts about the same goods.
    expect(novus).toMatch(/Refusing to transmit a \$\{header\.invoiceType\} receiving note/);
    expect(novus).not.toMatch(/receivingNotePurpose\s*\?\?\s*\d/);
    expect(novus).toMatch(/MYDATA_RECEIVING_NOTE_PURPOSE_OTHER/);
  });
});

describe('myDATA v2.0.2 — packages are declared as a COUNT', () => {
  it('covers AADE §8.23 codes 1..6 in both languages', () => {
    expect(MYDATA_PACKAGING_TYPES.map((p) => p.code)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const p of MYDATA_PACKAGING_TYPES) {
      expect(p.en.trim(), `code ${p.code} has no English name`).not.toBe('');
      expect(p.el.trim(), `code ${p.code} has no Greek name`).not.toBe('');
      expect(packagingTypeLabel(p.code, 'el')).toBe(p.el);
    }
    expect(MYDATA_PACKAGING_TYPE_OTHER).toBe(6);
  });

  it('type 6 (Λοιπά) has to name itself, or the declaration is refused', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(novus).toMatch(/otherPackagingTypeTitle/);
    expect(novus).toMatch(/Refusing to transmit a packaging declaration/);
  });

  it('a package row with no positive quantity declares nothing rather than zero', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    expect(builder).toMatch(/function packagingsFrom/);
    expect(builder).toMatch(/quantity <= 0\) return \[\]/);
    // Stored jsonb is untrusted input (invariant 8) — allowlisted, never spread.
    expect(builder).not.toMatch(/packingsDeclarations:\s*\w+\.packagings\b/);
  });

  it('the declaration reaches the envelope under the shape AADE nests it in', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(novus).toMatch(/packingsDeclarations/);
    expect(novus).toMatch(/packages:/);
  });
});

describe('myDATA v2.0.2 — a document that IS the movement (ΤΔΑ)', () => {
  it('offers isDeliveryNote on the v2.0.2 set, which added 1.4, 3.1, 3.2 and 11.5', () => {
    for (const t of ['1.4', '3.1', '3.2', '11.5']) {
      expect(canBeDeliveryNote(t), `${t} should accept isDeliveryNote from v2.0.2`).toBe(true);
    }
    expect(canBeDeliveryNote('1.1')).toBe(true);
    expect(canBeDeliveryNote('11.1')).toBe(true);
    // A movement document does not carry itself.
    expect(canBeDeliveryNote('9.3')).toBe(false);
    expect(canBeDeliveryNote('10.1')).toBe(false);
    expect(canBeDeliveryNote(null)).toBe(false);
  });

  it('the list governs the PICKER, because AADE enumerates no accepting set', () => {
    // The field table leaves isDeliveryNote's restriction column blank and gives only 1.1 as
    // an example, so this list is inferred — it decides what we offer, never what we refuse.
    // Same arrangement as a withdrawn move purpose: AADE is the authority on the rejection.
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    expect(novus, 'the connector must not refuse on an inferred list')
      .not.toMatch(/canBeDeliveryNote/);
    expect(canBeDeliveryNote('1.1')).toBe(true);
    expect(canBeDeliveryNote('9.3')).toBe(false);
  });
});

describe('a movement transmits as the document it IS, not always as 9.3', () => {
  const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');

  it('the delivery-note builder no longer hardcodes the type', () => {
    // `invoiceType: overrides.invoiceType ?? '9.3'` filed every kind='receipt' note as a
    // Δελτίο Αποστολής, when a quantitative receipt is 10.1/10.2.
    expect(builder).not.toMatch(/invoiceType:\s*overrides\.invoiceType\s*\?\?\s*['"]9\.3['"]/);
    expect(builder).toMatch(/dn\.mydata_document_type/);
    expect(builder).toMatch(/dn\.kind === ['"]receipt['"]/);
  });

  it('covers the whole movement family with a name for each', () => {
    expect(MYDATA_MOVEMENT_DOC_TYPES.map((t) => t.code)).toEqual(['9.1', '9.2', '9.3', '10.1', '10.2']);
    for (const t of MYDATA_MOVEMENT_DOC_TYPES) {
      expect(t.en.trim(), `${t.code} has no English name`).not.toBe('');
      expect(t.el.trim(), `${t.code} has no Greek name`).not.toBe('');
    }
    expect(isMovementDocType('10.2')).toBe(true);
    expect(isMovementDocType('1.1')).toBe(false);
  });

  it('a receiving note is recognised as a movement even though it has no movePurpose', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    // Keying isMovement off movePurpose alone sent every 10.x down the invoice path.
    expect(novus).toMatch(/isMovementDocType\(header\.invoiceType\)/);
    expect(builder).toMatch(/isReceivingNoteType\(mydataType\)/);
  });
});

describe('the customs code we snapshot is the customs code we transmit', () => {
  it('taricNo reaches the Novus envelope from the line snapshot', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    // `commodityCode` was read off `taric_code` by both builders, guarded by a test and
    // documented — and then dropped at the connector, so no line ever carried a tariff code.
    expect(novus).toMatch(/taricNo/);
    expect(novus).toMatch(/l\.commodityCode/);
  });

  it('a movement line carries its customs facts too', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    const dnBuilder = builder.slice(builder.indexOf('buildDeliveryNoteInputFromDb'));
    expect(dnBuilder).toMatch(/commodityCode: it\.taric_code/);
    expect(dnBuilder).toMatch(/countryOfOrigin: it\.country_of_origin/);
  });

  it('a per-line movement purpose reaches the envelope', () => {
    const novus = read('supabase/functions/_shared/fiscal/novus.ts');
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    expect(novus).toMatch(/movePurposeLine/);
    expect(novus).toMatch(/otherMovePurposeLineTitle/);
    expect(builder).toMatch(/movePurposeLine: it\.move_purpose_line/);
  });
});

describe('the v2.0.2 code tables are declared once', () => {
  it('a document-type restriction is answered by the table, not re-typed', () => {
    // §8.19 code 13 is valid only on 11.4 / 14.30; §8.18 restricts all four codes.
    expect(acceptsOnDocumentType({ validFor: [] }, '1.1')).toBe(true);
    const thirteen = MYDATA_SPECIAL_INVOICE_CATEGORIES.find((c) => c.code === 13)!;
    expect(acceptsOnDocumentType(thirteen, '11.4')).toBe(true);
    expect(acceptsOnDocumentType(thirteen, '1.1')).toBe(false);
    const variation1 = MYDATA_INVOICE_VARIATION_TYPES.find((c) => c.code === 1)!;
    expect(acceptsOnDocumentType(variation1, '1.1')).toBe(true);
    expect(acceptsOnDocumentType(variation1, '11.3')).toBe(false);
  });

  it('the two read-only ΦΗΜ special categories are not offered for transmission', () => {
    expect(MYDATA_SPECIAL_INVOICE_CATEGORIES.find((c) => c.code === 8)?.submittable).toBe(false);
    expect(MYDATA_SPECIAL_INVOICE_CATEGORIES.find((c) => c.code === 9)?.submittable).toBe(false);
    expect(MYDATA_SPECIAL_INVOICE_CATEGORIES.filter((c) => c.submittable)).toHaveLength(11);
  });

  it('covers §8.19 1..13, §8.18 1..4, §8.21 1..5 and §8.20 1..6', () => {
    expect(MYDATA_SPECIAL_INVOICE_CATEGORIES.map((c) => c.code)).toEqual(
      Array.from({ length: 13 }, (_, i) => i + 1),
    );
    expect(MYDATA_INVOICE_VARIATION_TYPES.map((c) => c.code)).toEqual([1, 2, 3, 4]);
    expect(MYDATA_REVERSE_DELIVERY_PURPOSES.map((c) => c.code)).toEqual([1, 2, 3, 4, 5]);
    expect(MYDATA_ENTITY_TYPES.map((c) => c.code)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(MYDATA_ENTITY_TYPE_TRANSPORTER).toBe(3);
  });

  it('no consumer keeps its own copy of a v2.0.2 table', () => {
    for (const f of [
      'supabase/functions/_shared/fiscal/novus.ts',
      'supabase/functions/_shared/fiscal/invoice-builder.ts',
    ]) {
      const src = read(f);
      expect(src, `${f} declares its own packaging table`).not.toMatch(/PACKAGING_TYPES\s*(:|=)\s*[[{]/);
      expect(src, `${f} declares its own receiving-note table`).not.toMatch(/RECEIVING_NOTE_PURPOSES\s*(:|=)\s*[[{]/);
    }
  });

  it('the Deno mirror is the generated twin, never a hand-kept copy', () => {
    const source = readFileSync(join(ROOT, 'src/services/fiscal/fiscalVocabulary.ts'), 'utf8');
    const mirror = readFileSync(
      join(ROOT, 'supabase/functions/_shared/fiscal/fiscalVocabulary.generated.ts'),
      'utf8',
    );
    for (const name of [
      'MYDATA_RECEIVING_NOTE_PURPOSES',
      'MYDATA_PACKAGING_TYPES',
      'MYDATA_MOVEMENT_DOC_TYPES',
      'MYDATA_IS_DELIVERY_NOTE_TYPES',
      'MYDATA_SPECIAL_INVOICE_CATEGORIES',
      'MYDATA_INVOICE_VARIATION_TYPES',
    ]) {
      expect(source, `${name} missing from the source`).toContain(name);
      expect(mirror, `${name} missing from the Deno mirror — run npm run vocab:mirror`).toContain(name);
    }
  });
});

describe('the v2.0.2 envelope puts things where AADE looks for them', () => {
  const novus = read('supabase/functions/_shared/fiscal/novus.ts');

  it('the transport block belongs to every movement, not only one with a movePurpose', () => {
    // Gating it on the purpose dropped a receiving note's addresses, shipping branches and
    // transporter — a 10.x states `receivingNotePurpose` and carries no movePurpose at all.
    expect(novus).not.toMatch(/\.\.\.\(header\.movePurpose != null\s*\n?\s*\?\s*\{\s*\n\s*vatPaymentSuspension: false/);
    expect(novus).toMatch(/\.\.\.\(isMovement\s*\n?\s*\?\s*\{\s*\n\s*vatPaymentSuspension: false/);
  });

  it('a correlated entity is {type, entityData} on the HEADER, not a flat party nested inside', () => {
    // Novus types `otherCorrelatedEntities` as EntityType[] on invoiceHeader, and ASP.NET
    // drops unknown members silently — nested as a flat party none of it ever reached AADE.
    expect(novus).toMatch(/entityData:\s*\{/);
    expect(novus).toMatch(/type: e\.type \?\? MYDATA_ENTITY_TYPE_OTHER/);
    const odn = novus.slice(novus.indexOf('otherDeliveryNoteHeader:'));
    const odnBlock = odn.slice(0, odn.indexOf('},'));
    expect(odnBlock, 'otherCorrelatedEntities must not sit inside otherDeliveryNoteHeader')
      .not.toMatch(/otherCorrelatedEntities/);
  });

  it('each v2.0.2 indication is emitted only where AADE accepts it', () => {
    // "Αποδεκτό μόνο για παραστατικά 9.1, 9.2 και 9.3".
    expect(novus).toMatch(/header\.toWeigh && isDispatchNoteType\(header\.invoiceType\)/);
    // "Αποδεκτό μόνο για παραστατικά διακίνησης" — a ΤΔΑ counts.
    expect(novus).toMatch(/header\.nonObligatedRecipient && \(isMovement \|\| header\.isDeliveryNote\)/);
    expect(novus).toMatch(/header\.withoutDigitalTransportTracking && \(isMovement \|\| header\.isDeliveryNote\)/);
    // "Αποδεκτό μόνο για παραστατικά τύπων 8.4 και 8.5".
    expect(novus).toMatch(/MYDATA_THIRD_PARTY_COLLECTION_TYPES\.includes\(header\.invoiceType\)/);
    // "Δεν είναι αποδεκτό για τα παραστατικά των τύπων 1.6, 2.4 και 5.1".
    expect(novus).toMatch(/!MYDATA_NO_MULTIPLE_MARKS_TYPES\.includes\(header\.invoiceType\)/);
  });

  it('the restricted code tables are REFUSED, not silently dropped', () => {
    // Dropping a code the operator stated transmits a document saying less than the one they
    // approved — the worse of the two failures.
    expect(novus).toMatch(/is not an AADE code/);
    expect(novus).toMatch(/AADE publishes it read-only/);
    expect(novus).toMatch(/acceptsOnDocumentType\(row, header\.invoiceType\)/);
  });

  it('isDeliveryNote is refused only where it is provably contradictory', () => {
    // AADE publishes no enumeration of the accepting types, so only "a movement document
    // cannot also BE one" is ours to refuse — the rest is AADE's call, like a withdrawn
    // move purpose. `canBeDeliveryNote` governs the picker, not the transmission.
    expect(novus).toMatch(/header\.isDeliveryNote && isMovementDocType\(header\.invoiceType\)/);
    expect(novus).not.toMatch(/!canBeDeliveryNote\(header\.invoiceType\)/);
  });

  it('the package count is an integer, because AADE types it xs:int', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    expect(builder).toMatch(/!Number\.isInteger\(quantity\) \|\| quantity <= 0/);
  });

  it('toWeigh and the 8.4/8.5 pair are pinned to the types the spec names', () => {
    expect(MYDATA_DISPATCH_NOTE_TYPES).toEqual(['9.1', '9.2', '9.3']);
    expect(isDispatchNoteType('9.3')).toBe(true);
    expect(isDispatchNoteType('10.1')).toBe(false);
    expect(MYDATA_THIRD_PARTY_COLLECTION_TYPES).toEqual(['8.4', '8.5']);
    expect(MYDATA_NO_MULTIPLE_MARKS_TYPES).toEqual(['1.6', '2.4', '5.1']);
    expect(MYDATA_ENTITY_TYPE_OTHER).toBe(6);
  });

  it('the credit-note builder does not read a column credit_note_items has not got', () => {
    const builder = read('supabase/functions/_shared/fiscal/invoice-builder.ts');
    const cn = builder.slice(
      builder.indexOf('buildCreditNoteInputFromDb'),
      builder.indexOf('buildDeliveryNoteInputFromDb'),
    );
    expect(cn, 'credit_note_items has no move_purpose_line — the read is permanently undefined')
      .not.toMatch(/move_purpose_line/);
  });
});

describe('the printed movement says what the transmitted one says', () => {
  it('a ΔΠΠ prints its receiving-note reason, not a blank purpose line', () => {
    const pdf = read('supabase/functions/finance-invoice-pdf/index.ts');
    expect(pdf).toMatch(/inv\.receiving_note_purpose != null/);
    expect(pdf).toMatch(/receivingNotePurposeLabel\(inv\.receiving_note_purpose/);
    expect(pdf).toMatch(/inv\.other_receiving_note_purpose_title/);
  });

  it('the printed document type follows the transmitted one', () => {
    const pdf = read('supabase/functions/finance-invoice-pdf/index.ts');
    expect(pdf).not.toMatch(/document_type:\s*['"]9\.3['"]/);
    expect(pdf).toMatch(/row\.mydata_document_type \?\? \(row\.kind === ['"]receipt['"]/);
  });

  it('both label tables title the whole movement family, so none falls through to INVOICE', () => {
    for (const f of [
      'src/modules/finance/invoice-templates/labels.ts',
      'supabase/functions/finance-invoice-pdf/index.ts',
    ]) {
      const src = read(f);
      expect(src, `${f} does not title 9.1/9.2`).toMatch(/case '9\.1': case '9\.2': case '9\.3'/);
      expect(src, `${f} does not title the ΔΠΠ pair`).toMatch(/case '10\.1': case '10\.2': return L\.receivingNote/);
      expect(src, `${f} has no receivingNote label`).toMatch(/receivingNote:/);
    }
  });
});
