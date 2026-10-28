import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const MODAL = 'src/components/features/products/ProductDetailModal.tsx';
const src = blankComments(readFileSync(join(process.cwd(), MODAL), 'utf8').replace(/\r\n/g, '\n'));

describe('product modal values', () => {
  it('has no private value formatter beside displayValue', () => {
    expect(src).not.toMatch(/const\s+(titleCaseDisplay|prettyValue)\s*=/);
  });

  it('never leaves casing to the CSS capitalize class', () => {
    expect(src).not.toMatch(/\bcapitalize\b/);
  });

  it('prints no data value raw', () => {
    for (const raw of ['{value}', '{r.value}', '{hit.value}', '{renderValue(value)}']) {
      expect(src, `${raw} is shown without displayValue`).not.toContain(raw);
    }
  });

  it('prints a bare {str} only for a hex colour', () => {
    const hits = [...src.matchAll(/\{str\}/g)];
    for (const m of hits) {
      const before = src.slice(Math.max(0, (m.index ?? 0) - 700), m.index);
      expect(before, 'a bare {str} outside a HEX_RE branch').toMatch(/HEX_RE\.test\(str\)/);
    }
  });
});
