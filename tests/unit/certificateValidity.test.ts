import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { draftFromCandidate, needsAttention, presentValidity } from '../../src/components/features/products/certificateValidity';
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

describe('the certificate write path sets no identity fields from the client', () => {
  const DIALOG = 'src/components/features/products/ProductCertificateDialog.tsx';

  it('never sends workspace_id or created_by — the trigger stamps both from the product', () => {
    const code = blankComments(read(DIALOG));
    expect(code, 'workspace_id is an identity field (invariant 8)').not.toMatch(/workspace_id/);
    expect(code, 'created_by is an identity field (invariant 8)').not.toMatch(/created_by/);
  });

  it('builds an explicit payload rather than spreading the form into the write', () => {
    const code = blankComments(read(DIALOG));
    expect(code, 'a spread form object is the mass-assignment shape')
      .not.toMatch(/\.(insert|update)\(\s*\{\s*\.\.\./);
    expect(code).toMatch(/product_id:\s*productId/);
  });

  it('writes go through the table so RLS applies, not through a service-role edge call', () => {
    const code = blankComments(read(DIALOG));
    expect(code).toMatch(/from\('product_certificates'\)/);
    expect(code).not.toMatch(/functions\.invoke/);
  });
});

describe('an extracted certificate becomes a form, never a recorded fact', () => {
  it('carries the extractor values through verbatim', () => {
    expect(draftFromCandidate({
      standard: 'EN 13501-1', certificate_number: 'FIRE-1', issuer: 'TUV SUD',
      scope: 'Reaction to fire', valid_from: '2024-01-15', valid_until: '2027-01-15',
    })).toEqual({
      standard: 'EN 13501-1', certificate_number: 'FIRE-1', issuer: 'TUV SUD',
      scope: 'Reaction to fire', result: '', valid_from: '2024-01-15',
      valid_until: '2027-01-15', notes: '',
    });
  });

  it('a field the extractor could not read stays BLANK rather than being guessed', () => {
    const d = draftFromCandidate({
      standard: 'ISO 9001', certificate_number: null, issuer: null,
      scope: null, valid_from: null, valid_until: null,
    });
    expect(d.valid_until, 'a guessed expiry on a compliance record is worse than none').toBe('');
    expect(d.valid_from).toBe('');
    expect(d.certificate_number).toBe('');
    expect(d.issuer).toBe('');
  });

  it('never invents a result — the extractor reads a document, it does not award a class', () => {
    expect(draftFromCandidate({
      standard: 'EN 16165', certificate_number: null, issuer: null,
      scope: null, valid_from: null, valid_until: null,
    }).result).toBe('');
  });

  it('a candidate is a DRAFT: it carries no id, so confirming it inserts rather than updates', () => {
    const d = draftFromCandidate({
      standard: 'EN 1234', certificate_number: 'X', issuer: null,
      scope: null, valid_from: null, valid_until: null,
    });
    expect(d.id).toBeUndefined();
  });
});
