/**
 * A "New" button pre-fills the category the list is filtered to — only when the filter
 * pins exactly one real value. Two picks, "Uncategorized" or no filter mean no default.
 */
import { describe, it, expect } from 'vitest';

import { NONE_VALUE, scopedFilterValue } from '../../src/components/core/filters/types';

describe('scopedFilterValue', () => {
  it('returns the single pick of a multi filter', () => {
    expect(scopedFilterValue({ category_id: ['cat-1'] }, 'category_id')).toBe('cat-1');
  });

  it('returns a single-select value', () => {
    expect(scopedFilterValue({ category_id: 'cat-1' }, 'category_id')).toBe('cat-1');
  });

  it('returns nothing when two categories are picked', () => {
    expect(scopedFilterValue({ category_id: ['cat-1', 'cat-2'] }, 'category_id')).toBeUndefined();
  });

  it('returns nothing for Uncategorized, an empty filter, or no filter', () => {
    expect(scopedFilterValue({ category_id: [NONE_VALUE] }, 'category_id')).toBeUndefined();
    expect(scopedFilterValue({ category_id: [] }, 'category_id')).toBeUndefined();
    expect(scopedFilterValue({}, 'category_id')).toBeUndefined();
  });

  it('ignores non-string filter shapes', () => {
    expect(scopedFilterValue({ category_id: { min: 1 } }, 'category_id')).toBeUndefined();
    expect(scopedFilterValue({ category_id: true }, 'category_id')).toBeUndefined();
  });
});
