/**
 * Fiscal measurement-unit twin-parity guard (#347, defect 15).
 *
 * AADE codes exactly six measurement units (`mydata_reference` category `measurement_unit`:
 * pieces, kg, litres, metres, m², m³). Our catalogue deliberately offers more — a tile order is
 * placed in boxes and pallets, a survey line is priced by the hour — and those carry
 * `mydataCode: null` with a comment saying they must be converted before transmission.
 *
 * Nothing enforced that. `buildNovusPayload` passed `measurementUnitLabel: it.unit ?? 'ΤΜΧ'`
 * straight through, so 'pallet' could be filed as the measurement unit of an AADE-registered
 * legal document. It now refuses, which needs the uncoded set inside the Deno runtime —
 * and an edge function cannot import from `src/`.
 *
 * So there are two copies, held equal here rather than by convention. This is the same
 * arrangement `escapeHtml` uses across its three runtimes ([escapeHtmlParity.test.ts]) and it
 * exists for the same reason: the last time a value like this was hand-copied without a test,
 * the copies drifted to three different strengths.
 *
 * If a unit is added to `src/lib/units.ts`, this test tells you which side to update. Adding a
 * CODED unit means AADE published a new code — update `mydata_reference` too.
 */
import { describe, it, expect } from 'vitest';

import { UNITS, unitFromMydataCode as clientUnitFromMydataCode } from '@/lib/units';
import {
  UNCODED_MYDATA_UNITS, isUncodedMydataUnit,
  MYDATA_UNIT_BY_CODE, unitFromMydataCode as edgeUnitFromMydataCode,
} from '../../supabase/functions/_shared/fiscal/types';
import { buildNovusPayload } from '../../supabase/functions/_shared/fiscal/novus';

/** Minimal input — the guard runs before anything else reads issuer/counterpart/summary. */
const payloadWithUnit = (unit: string) => () => buildNovusPayload({
  issuer: {}, counterpart: {}, header: {}, summary: {},
  lines: [{
    lineNumber: 1, description: 'Porcelain tile 60×60', quantity: 2, measurementUnitLabel: unit,
    unitPrice: 10, netValue: 20, vatCategory: 1, vatPercent: 24, vatAmount: 4.8,
  }],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any);

/** The six units AADE actually codes. Mirrors `mydata_reference` category `measurement_unit`. */
const EXPECTED_CODED = ['pcs', 'kg', 'lt', 'm', 'm2', 'm3'];

describe('fiscal measurement units — edge twin matches src/lib/units.ts', () => {
  const codedKeys = UNITS.filter((u) => u.mydataCode != null).map((u) => u.key).sort();
  const uncodedKeys = UNITS.filter((u) => u.mydataCode == null).map((u) => u.key).sort();

  it('src/lib/units.ts still codes exactly the six AADE units', () => {
    // A seventh coded unit means AADE published one — `mydata_reference` needs the row too,
    // or the transmission will carry a code the provider rejects.
    expect(codedKeys).toEqual([...EXPECTED_CODED].sort());
  });

  it('the edge uncoded set equals the mydataCode === null entries', () => {
    expect([...UNCODED_MYDATA_UNITS].sort()).toEqual(uncodedKeys);
  });

  it('refuses every uncoded unit', () => {
    for (const key of uncodedKeys) {
      expect(isUncodedMydataUnit(key), `${key} has no AADE code and must be refused`).toBe(true);
    }
  });

  it('never refuses a coded unit', () => {
    for (const key of codedKeys) {
      expect(isUncodedMydataUnit(key), `${key} is AADE-coded and must transmit`).toBe(false);
    }
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    // Stored rows are not guaranteed to be trimmed or lowercased.
    expect(isUncodedMydataUnit(' Pallet ')).toBe(true);
    expect(isUncodedMydataUnit('BOX')).toBe(true);
  });

  it('buildNovusPayload REFUSES a pallet line, naming the line and the unit', () => {
    // The guard, watched firing — not just the helper it calls.
    expect(payloadWithUnit('pallet')).toThrow(/no AADE measurement_unit code/);
    expect(payloadWithUnit('pallet')).toThrow(/1 \(pallet\)/);
  });

  it('buildNovusPayload lets a coded unit through', () => {
    expect(payloadWithUnit('m2')).not.toThrow();
  });

  /**
   * The other direction of the same twin. `UNCODED_MYDATA_UNITS` stops an uncoded unit going OUT
   * to AADE; this map is what lets the intake queue writer honour a coded unit coming IN, which
   * it could not do before because an edge function cannot import `src/lib/units.ts`.
   *
   * Watched failing: drop the `4: 'm'` entry and the first case here goes red. Before this
   * existed, the same absence produced a worktop billed in metres being filed as 4.1 pieces —
   * a valid number that nothing downstream could question.
   */
  it('the edge code→unit map is the inverse of the mydataCode field', () => {
    const fromUnits = Object.fromEntries(
      UNITS.filter((u) => u.mydataCode != null).map((u) => [u.mydataCode!, u.key]),
    );
    expect(MYDATA_UNIT_BY_CODE).toEqual(fromUnits);
  });

  it('both runtimes resolve every code — and every non-code — identically', () => {
    for (const code of [1, 2, 3, 4, 5, 6, 7, 0, -1, 99]) {
      expect(edgeUnitFromMydataCode(code), `code ${code}`).toBe(clientUnitFromMydataCode(code));
    }
    for (const absent of [null, undefined]) {
      expect(edgeUnitFromMydataCode(absent)).toBe(clientUnitFromMydataCode(absent));
    }
  });

  it('a stated code always resolves to a unit AADE will accept back', () => {
    // Round trip: anything the map produces must be transmittable, or intake would create stock
    // in a unit its own invoices cannot carry.
    for (const key of Object.values(MYDATA_UNIT_BY_CODE)) {
      expect(isUncodedMydataUnit(key), `${key} came from an AADE code and must transmit`).toBe(false);
    }
  });

  it('does not refuse unknown or alias units', () => {
    // Deliberate: historical rows carry 'sqm', 'm²', 'τεμ', 'item' and friends, which normalise
    // to a coded unit. Refusing anything merely unrecognised would block transmissions that are
    // valid today. The set names the units we KNOW have no code.
    for (const alias of ['sqm', 'm²', 'τεμ', 'item', '', null, undefined]) {
      expect(isUncodedMydataUnit(alias)).toBe(false);
    }
  });
});
