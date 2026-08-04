/**
 * Voltage-drop parity between the frontend engine and the PDF builder.
 *
 * The calculation exists TWICE and that is a deliberate, uncomfortable
 * compromise: `src/utils/mepCalculations.ts` runs in the browser, and the PDF is
 * rendered by a Deno edge function that cannot import from `src/`. Same shape as
 * the escapeHtml frontend/edge split.
 *
 * Two copies of a derived quantity is precisely what the one-derivation rule in
 * CLAUDE.md exists to prevent, and the failure mode is nasty: the canvas would
 * tell the user 4.2% PASS while the drawing they hand to an electrician says
 * 8.4% OVER, or worse the reverse. Nothing would error.
 *
 * So the constants that drive the two implementations are pinned against each
 * other here. If either side is edited alone, this fails.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RHO_COPPER_70C, DEFAULT_DROP_LIMIT_PCT, voltageDrop } from '../../src/utils/mepCalculations';

const BUILDERS = readFileSync(
  join(process.cwd(), 'supabase/functions/generate-moodboard-sheet-pdf/builders.ts'),
  'utf8',
).replace(/\r\n/g, '\n');

/** The CHECKS block in builders.ts — scoped so we don't match unrelated numbers. */
const CHECKS = (() => {
  const start = BUILDERS.indexOf('// CHECKS —');
  const end = BUILDERS.indexOf('// SCHEDULE —', start);
  expect(start, 'CHECKS block not found in builders.ts').toBeGreaterThan(-1);
  expect(end, 'SCHEDULE block not found after CHECKS').toBeGreaterThan(start);
  return BUILDERS.slice(start, end);
})();

describe('voltage-drop parity: frontend engine vs PDF builder', () => {
  it('uses the same conductor resistivity', () => {
    const m = /\*\s*([\d.]+)\s*\*/.exec(CHECKS.slice(CHECKS.indexOf('const dropV')));
    expect(m, 'no resistivity literal found in the builder').toBeTruthy();
    expect(Number(m![1])).toBe(RHO_COPPER_70C);
  });

  it('uses the same nominal voltages', () => {
    expect(CHECKS).toContain('phases === 3 ? 400 : 230');
  });

  it('uses the same phase factor — √3 for three phase, 2 for single', () => {
    // Dropping the factor-2 return leg on single phase halves every result and
    // passes limits that should fail.
    expect(CHECKS).toMatch(/phases === 3 \? Math\.sqrt\(3\) : 2/);
  });

  it('uses the same conventional limits', () => {
    expect(CHECKS).toMatch(new RegExp(`\\? ${DEFAULT_DROP_LIMIT_PCT.lighting} : ${DEFAULT_DROP_LIMIT_PCT.power}`));
  });

  it('treats the same run kinds as lighting circuits', () => {
    // A switch leg judged against the 5% power limit instead of 3% silently
    // passes a circuit that should have failed.
    expect(CHECKS).toContain("run.kind === 'lighting_circuit' || run.kind === 'switch_leg'");
  });

  it('only computes when the backdrop actually carries a scale', () => {
    // Both sides must refuse to measure an unscaled uploaded plan rather than
    // invent a length.
    expect(CHECKS).toContain("bd?.kind === 'rect'");
    expect(CHECKS).toMatch(/r\.props\?\.current_a && r\.props\?\.csa_mm2/);
  });

  it('the pinned constants reproduce the engine result', () => {
    // Re-derive with the literals the builder uses and confirm the engine agrees,
    // so the pins above are anchored to a real number rather than to text alone.
    const lengthM = 25, currentA = 20, csaMm2 = 2.5;
    const byBuilderConstants = (2 * RHO_COPPER_70C * lengthM * currentA) / csaMm2;
    const engine = voltageDrop({ lengthM, currentA, csaMm2, phases: 1 })!;
    expect(engine.drop_v).toBeCloseTo(byBuilderConstants, 9);
    expect((byBuilderConstants / 230) * 100).toBeCloseTo(engine.drop_percent, 9);
  });
});
