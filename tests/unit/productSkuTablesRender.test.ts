import { describe, it, expect } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SkuTableCard } from '@/components/features/products/SkuTableCard';
import { toSkuTable } from '@/components/features/products/productSkuTable';

const HEADERS = ['Item code', 'Colour', 'Size (cm)', 'Pieces per box', 'Status', 'Availability'];

function table(rowCount: number) {
  const rows = Array.from({ length: rowCount }, (_, i) => [
    `80${String(1000 + i)}`,
    i % 2 ? 'grey' : 'white',
    i % 3 ? '60x120' : '30x60',
    i === 0 ? null : 4,
    i === 1 ? 'Discontinued' : 'Active',
    i === 2 ? 'Made to order' : 'Standard range',
  ]);
  const t = toSkuTable({
    id: 't',
    headers: HEADERS,
    table_data: { rows },
    extractor: 'cereuro-prep',
    metadata: { title: 'Colours, sizes and item codes', source: 'Catalogue 2026. No prices.' },
  });
  if (!t) throw new Error('table did not parse');
  return t;
}

const render = (rows: number) =>
  renderToStaticMarkup(createElement(SkuTableCard, { table: table(rows), hexByName: { white: '#EEEEEE' } }));

describe('the item table card', () => {
  it('shows the title, the source, every header and the counts', () => {
    const html = render(5);
    expect(html).toContain('Colours, sizes and item codes');
    expect(html).toContain('Catalogue 2026. No prices.');
    for (const h of HEADERS) expect(html).toContain(h);
    expect(html).toContain('5 items');
    expect(html).toContain('1 discontinued');
    expect(html).toContain('1 made to order');
  });

  it('draws a swatch only for a colour that has a hex, and a dash for an absent value', () => {
    const html = render(5);
    expect(html).toContain('background-color:#EEEEEE');
    expect(html.match(/background-color:/g)).toHaveLength(3);
    expect(html).toContain('—');
  });

  it('writes a single item in the singular and renders markup in a cell as text', () => {
    const one = toSkuTable({ id: 'x', headers: ['Item code'], table_data: { rows: [['<img src=x onerror=alert(1)>']] }, extractor: 'cereuro-prep', metadata: { title: 'T' } });
    if (!one) throw new Error('table did not parse');
    const html = renderToStaticMarkup(createElement(SkuTableCard, { table: one, hexByName: {} }));
    expect(html).toContain('1 item<');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('shows the filters only on a long table, and folds past 30 rows', () => {
    expect(render(5)).not.toContain('Search this table');
    const long = render(45);
    expect(long).toContain('Search this table');
    expect(long).toContain('Show all 45 items');
    expect(long).toContain('80' + '1029');
    expect(long).not.toContain('80' + '1030');
  });
});
