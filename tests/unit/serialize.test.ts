import { describe, expect, it } from 'vitest';

import { csvField, toCsv, toXml, xmlName, xmlText } from '../../supabase/functions/_shared/serialize.ts';

describe('CSV is not HTML', () => {
  it('quotes a field containing the record separators', () => {
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
  });

  it('neutralises a spreadsheet FORMULA, which an HTML escaper would not', () => {
    for (const evil of ['=1+1', '+1', '-1', '@SUM(A1)']) {
      expect(csvField(evil).startsWith("'"), `${evil} must not be read as a formula`).toBe(true);
    }
  });

  it('leaves ordinary text alone', () => {
    expect(csvField('EN 13501-1')).toBe('EN 13501-1');
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('emits a header even when there are no rows, so the shape is still readable', () => {
    expect(toCsv(['sku', 'name'], [])).toBe('sku,name\r\n');
  });

  it('writes one record per row, in header order', () => {
    const out = toCsv(['sku', 'name'], [{ name: 'Tile, matte', sku: 'A1' }]);
    expect(out).toBe('sku,name\r\nA1,"Tile, matte"\r\n');
  });
});

describe('XML is not HTML either', () => {
  it('escapes all five predefined entities', () => {
    expect(xmlText(`<a href='x' & "y">`))
      .toBe('&lt;a href=&apos;x&apos; &amp; &quot;y&quot;&gt;');
  });

  it('drops control characters XML 1.0 cannot carry', () => {
    const withControls = `a${String.fromCharCode(0)}b${String.fromCharCode(8)}c`;
    expect(xmlText(withControls)).toBe('abc');
  });

  it('makes a legal element name from an arbitrary column', () => {
    expect(xmlName('country of origin')).toBe('country_of_origin');
    expect(xmlName('123abc'), 'a name may not start with a digit').toBe('_123abc');
  });

  it('nests rows under the item element with escaped values', () => {
    const out = toXml('catalogue', 'product', ['name'], [{ name: 'A & B' }]);
    expect(out).toContain('<product>');
    expect(out).toContain('<name>A &amp; B</name>');
    expect(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
  });
});
