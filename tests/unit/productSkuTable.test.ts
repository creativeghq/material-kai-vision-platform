import { describe, it, expect } from 'vitest';
import {
  NO_FILTER, colourHexIndex, distinctValues, filterRows, formatCell, isDisplayableTable, isFiltering, summarise, toSkuTable,
} from '@/components/features/products/productSkuTable';

const HEADERS = ['Item code', 'Colour', 'Size (cm)', 'Pieces per box', 'Status', 'Availability'];
const ROWS = [
  ['8001', 'white', '60x120', 2, 'Active', 'Standard range'],
  ['8002', 'grey', '60x120', 2, 'Discontinued', 'Standard range'],
  ['8003', 'white', '30x60', null, 'Active', 'Made to order'],
  ['8004', 'grey', '30x60', 4, 'Discontinued', 'Made to order'],
];
const raw = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  headers: HEADERS,
  table_data: { rows: ROWS },
  extractor: 'cereuro-prep',
  metadata: { title: 'Colours, sizes and item codes', source: 'Catalogue 2026' },
  ...over,
});

describe('product item tables', () => {
  it('shows prepared tables and not raw OCR fragments', () => {
    expect(isDisplayableTable(raw())).toBe(true);
    expect(isDisplayableTable(raw({ extractor: 'paddleocr-vl', metadata: {} }))).toBe(false);
    expect(toSkuTable(raw({ extractor: 'paddleocr-vl', metadata: {} }))).toBeNull();
    expect(isDisplayableTable(raw({ extractor: 'pymupdf-text', metadata: {} }))).toBe(true);
  });

  it('keeps a titled table whatever produced it', () => {
    expect(toSkuTable(raw({ extractor: 'paddleocr-vl' }))?.title).toBe('Colours, sizes and item codes');
  });

  it('refuses a table with no headers or no rows', () => {
    expect(toSkuTable(raw({ headers: [] }))).toBeNull();
    expect(toSkuTable(raw({ table_data: { rows: [] } }))).toBeNull();
    expect(toSkuTable(raw({ table_data: null }))).toBeNull();
  });

  it('pads a short row to the header width and reads roles and numeric columns', () => {
    const t = toSkuTable(raw({ table_data: { rows: [['8001', 'white']] } }));
    expect(t?.rows[0]).toEqual(['8001', 'white', null, null, null, null]);
    const full = toSkuTable(raw());
    expect(full?.columns.map(c => c.role)).toEqual(['text', 'colour', 'size', 'text', 'status', 'availability']);
    expect(full?.columns[3].numeric).toBe(true);
    expect(full?.columns[0].numeric).toBe(false);
  });

  it('counts discontinued and made-to-order items', () => {
    const t = toSkuTable(raw());
    expect(t && summarise(t)).toEqual({ total: 4, discontinued: 2, madeToOrder: 2 });
  });

  it('filters by column and by free text', () => {
    const t = toSkuTable(raw());
    expect(t).not.toBeNull();
    if (!t) return;
    expect(filterRows(t, { ...NO_FILTER, colour: 'grey' })).toHaveLength(2);
    expect(filterRows(t, { ...NO_FILTER, colour: 'grey', status: 'Active' })).toHaveLength(0);
    expect(filterRows(t, { ...NO_FILTER, query: '8003' })).toHaveLength(1);
    expect(filterRows(t, { ...NO_FILTER, query: '30X60' })).toHaveLength(2);
    expect(distinctValues(t, 'size')).toEqual(['60x120', '30x60']);
  });

  it('writes an absent value as a dash, never as zero', () => {
    expect(formatCell(null)).toBe('—');
    expect(formatCell(0)).toBe('0');
    expect(formatCell(1008)).toBe('1,008');
  });

  it('indexes swatch colours by both the English and the catalogue name, valid hex only', () => {
    const idx = colourHexIndex([
      { name: 'white', catalogue_name: 'BIANCO', hex: '#FFFFFF' },
      { name: 'grey', hex: 'grey' },
      { name: 'dark', hex: '#333' },
    ]);
    expect(idx).toEqual({ white: '#FFFFFF', bianco: '#FFFFFF' });
    expect(colourHexIndex(undefined)).toEqual({});
  });

  it('turns an odd cell into text instead of letting it crash the modal', () => {
    const t = toSkuTable(raw({ table_data: { rows: [['8001', { a: 1 }, [1, 2], Number.NaN, 7, 'Active', 'Standard range']] } }));
    expect(t?.rows[0]).toEqual(['8001', '{"a":1}', '[1,2]', null, 7, 'Active', 'Standard range'].slice(0, 6));
  });

  it('withholds price-like columns from a viewer without cost access, and shows them to one with', () => {
    const withPrice = raw({ headers: [...HEADERS, 'Net price (EUR)'], table_data: { rows: ROWS.map(r => [...r, 12.5]) } });
    expect(toSkuTable(withPrice)?.columns.map(c => c.header)).toEqual(HEADERS);
    expect(toSkuTable(withPrice, true)?.columns.map(c => c.header)).toContain('Net price (EUR)');
    expect(toSkuTable(raw({ headers: ['Net weight (kg)'], table_data: { rows: [[3]] } }))?.columns).toHaveLength(1);
    expect(toSkuTable(raw({ headers: ['Price'], table_data: { rows: [[3]] } }))).toBeNull();
  });

  it('counts status and availability whatever the case or spacing', () => {
    const t = toSkuTable(raw({ table_data: { rows: [['1', 'a', 's', 1, ' DISCONTINUED ', 'made to order'], ['2', 'a', 's', 1, 'Active', 'Standard range']] } }));
    expect(t && summarise(t)).toEqual({ total: 2, discontinued: 1, madeToOrder: 1 });
  });

  it('names a blank header and treats a whitespace-only search as no search', () => {
    expect(toSkuTable(raw({ headers: ['Item code', ' '], table_data: { rows: [['1', 'x']] } }))?.columns[1].header).toBe('Column 2');
    expect(isFiltering({ ...NO_FILTER, query: '   ' })).toBe(false);
    expect(isFiltering({ ...NO_FILTER, size: '60x120' })).toBe(true);
  });

  it('finds a number by what the viewer sees', () => {
    const t = toSkuTable(raw({ table_data: { rows: [['1', 'a', 's', 1008, 'Active', 'Standard range']] } }));
    expect(t && filterRows(t, { ...NO_FILTER, query: '1,008' })).toHaveLength(1);
    expect(t && filterRows(t, { ...NO_FILTER, query: '1008' })).toHaveLength(1);
  });
});
