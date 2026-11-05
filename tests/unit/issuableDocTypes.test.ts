import { describe, expect, it } from 'vitest';
import { issuableDocTypeCodes } from '@/modules/finance/issuableDocTypes';

const codes = (enabled: string[], series: { doc_code: string; is_active: boolean }[]) =>
  [...issuableDocTypeCodes(enabled, series)].sort();

describe('issuableDocTypeCodes', () => {
  it('offers an enabled type with no series yet, because issuing creates its range', () => {
    expect(codes(['1.1', '2.1'], [])).toEqual(['1.1', '2.1']);
  });

  it('offers an enabled type with at least one active series', () => {
    expect(codes(['1.1'], [
      { doc_code: '1.1', is_active: false },
      { doc_code: '1.1', is_active: true },
    ])).toEqual(['1.1']);
  });

  it('withholds a type whose every series was switched off', () => {
    expect(codes(['1.1', '2.1'], [{ doc_code: '1.1', is_active: false }])).toEqual(['2.1']);
  });

  it('never offers a type that is not enabled, whatever its series', () => {
    expect(codes([], [{ doc_code: '1.1', is_active: true }])).toEqual([]);
  });
});
