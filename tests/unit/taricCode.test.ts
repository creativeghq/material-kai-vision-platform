/**
 * TARIC code normalisation.
 *
 * Every level of the nomenclature is published zero-padded to 10 digits, and the whole design —
 * the primary key, the check constraint, the prefix-walk breadcrumb in `search_taric_codes` —
 * depends on that being the only representation that reaches the database. Anything a human
 * pastes ("6907 21 00 90", "6907.21.00.90", "69072100") has to land on the same string.
 */
import { describe, it, expect } from 'vitest';
import { normalizeTaricInput, formatTaricCode } from '@/lib/taric';

describe('normalizeTaricInput', () => {
  it('pads every valid nomenclature level to 10 digits', () => {
    expect(normalizeTaricInput('69')).toBe('6900000000');        // chapter
    expect(normalizeTaricInput('6907')).toBe('6907000000');      // heading
    expect(normalizeTaricInput('690721')).toBe('6907210000');    // HS subheading
    expect(normalizeTaricInput('69072100')).toBe('6907210000');  // CN
    expect(normalizeTaricInput('6907210090')).toBe('6907210090');// TARIC
  });

  it('ignores the separators customs paperwork prints', () => {
    expect(normalizeTaricInput('6907 21 00 90')).toBe('6907210090');
    expect(normalizeTaricInput('6907.21.00.90')).toBe('6907210090');
    expect(normalizeTaricInput('  6907-21-00-90 ')).toBe('6907210090');
  });

  it('rejects lengths that are not a nomenclature level', () => {
    // 7 digits is not a level — padding it would invent a subheading that does not exist.
    expect(normalizeTaricInput('6907210')).toBeNull();
    expect(normalizeTaricInput('690')).toBeNull();
    expect(normalizeTaricInput('69072100901')).toBeNull();
    expect(normalizeTaricInput('')).toBeNull();
    expect(normalizeTaricInput('not a code')).toBeNull();
  });
});

describe('formatTaricCode', () => {
  it('groups a full code the way a declaration does', () => {
    expect(formatTaricCode('6907210090')).toBe('6907 21 00 90');
  });

  it('leaves anything that is not a full code alone rather than mangling it', () => {
    expect(formatTaricCode('690721')).toBe('690721');
    expect(formatTaricCode(null)).toBe('');
    expect(formatTaricCode(undefined)).toBe('');
  });
});
