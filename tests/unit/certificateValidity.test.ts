import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { needsAttention, presentValidity } from '../../src/components/features/products/certificateValidity';
import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

describe('SQL decides validity, TypeScript only formats it', () => {
  it('formats each verdict certificate_validity() can return', () => {
    expect(presentValidity('valid')).toEqual({ label: 'Valid', tone: 'success', known: true });
    expect(presentValidity('expiring_soon')).toEqual({ label: 'Expiring soon', tone: 'warning', known: true });
    expect(presentValidity('expired')).toEqual({ label: 'Expired', tone: 'error', known: true });
    expect(presentValidity('no_expiry_stated'))
      .toEqual({ label: 'No expiry stated', tone: 'neutral', known: true });
  });

  it('an unrecognised verdict fails closed to Unknown, not to the friendliest label', () => {
    for (const bogus of ['provisional', 'VALID', '', 'ok']) {
      const out = presentValidity(bogus);
      expect(out.known, `"${bogus}" must not be treated as a known verdict`).toBe(false);
      expect(out.label).toBe('Unknown');
    }
  });

  it('a missing verdict is Unknown rather than Valid', () => {
    expect(presentValidity(null).known).toBe(false);
    expect(presentValidity(undefined).label).toBe('Unknown');
    expect(presentValidity(null).label).not.toBe('Valid');
  });

  it('needsAttention covers exactly the two verdicts a person must act on', () => {
    expect(needsAttention('expired')).toBe(true);
    expect(needsAttention('expiring_soon')).toBe(true);
    expect(needsAttention('valid')).toBe(false);
    expect(needsAttention('no_expiry_stated')).toBe(false);
    expect(needsAttention('anything-else')).toBe(false);
  });
});

describe('the expiry comparison is not re-derived in the client', () => {
  const FILES = [
    'src/components/features/products/certificateValidity.ts',
    'src/components/features/products/ProductCertificates.tsx',
  ];

  it('no file compares valid_until against a date itself', () => {
    for (const f of FILES) {
      const code = blankComments(read(f));
      expect(code, `${f} must read the SQL verdict, not recompute it`)
        .not.toMatch(/valid_until\s*[<>]/);
      expect(code, `${f} must not build its own "today"`)
        .not.toMatch(/new Date\(\)/);
    }
  });

  it('the component asks for the operator calendar day rather than letting SQL default to UTC', () => {
    const code = blankComments(read('src/components/features/products/ProductCertificates.tsx'));
    expect(code).toContain('todayLocalISO');
    expect(code).toContain('p_today');
  });
});
