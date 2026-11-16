import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { strippedSource } from '../helpers/sourceIndex';

const ROOT = process.cwd();
const src = (p: string) => strippedSource(join(ROOT, p));

const LINE_WRITERS = [
  'src/modules/quotes/services/QuotesService.ts',
  'src/modules/finance/services/ordersService.ts',
  'src/modules/finance/components/NewInvoiceDialog.tsx',
  'src/modules/finance/components/OrdersPanel.tsx',
  'supabase/functions/_shared/tools/quote-tools.ts',
];

describe('a line takes its unit from the variant, not the product', () => {
  it.each(LINE_WRITERS)('%s asks product_sale_unit', (file) => {
    expect(/product_sale_unit|productUomService\.saleUnit/.test(src(file))).toBe(true);
  });

  it.each(LINE_WRITERS)('%s never seeds a line unit from products.metadata.unit', (file) => {
    const offenders = src(file).match(/metadata\??\.unit\b|meta\??\.unit\b|metadata->>'unit'/g) ?? [];
    expect(offenders, `${file} reads the product's own unit for a line`).toEqual([]);
  });

  it('the order resolver does not hardcode the line unit to null', () => {
    expect(src('src/modules/finance/services/ordersService.ts')).not.toMatch(/const unit: string \| null = null;/);
  });

  it('picking a product on an order prices in its unit of sale, not the blank line placeholder', () => {
    expect(src('src/modules/finance/components/OrdersPanel.tsx')).not.toMatch(/unit: line\?\.unit_code \?\? DEFAULT_UNIT/);
  });
});

describe('a saved line shows the unit it was saved in', () => {
  it.each([
    'src/modules/quotes/components/QuoteItemsList.tsx',
    'supabase/functions/generate-quote-pdf/data-fetcher.ts',
  ])('%s prefers custom_unit, and never shows a piece line the series unit', (file) => {
    expect(src(file)).toMatch(/item\.custom_unit\s*\|\|[\s\S]{0,140}piece_type\s*\?\s*'—'\s*:[\s\S]{0,60}metadata\?\.unit/);
  });
});
