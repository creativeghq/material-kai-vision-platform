import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeValue } from '@/components/features/products/productSpecDisplay';
import { blankComments } from '../helpers/stripComments';

describe('describeValue lists', () => {
  it('reads a list of numbers as distinct sorted values', () => {
    expect(describeValue([500, 600, 600, 800, 700, 900])).toBe('500, 600, 700, 800, 900');
    expect(describeValue(['0,5', '0,25', '0,5'])).toBe('0,25, 0,5');
  });

  it('keeps the order of a list of words', () => {
    expect(describeValue(['white', 'anthracite', 'white'])).toBe('white, anthracite, white');
  });
});

describe('product modal detected text', () => {
  const src = blankComments(
    readFileSync(join(process.cwd(), 'src/components/features/products/ProductDetailModal.tsx'), 'utf8'),
  );

  it('has no card of its own', () => {
    expect(src).not.toMatch(/Detected Text/);
    expect(src).not.toMatch(/ScanText/);
  });
});
