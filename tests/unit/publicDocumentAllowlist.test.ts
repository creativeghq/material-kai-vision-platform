import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { blankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');
const code = (p: string) => blankComments(read(p));

const RENDER = 'src/modules/finance/invoice-templates/renderData.ts';
const EDGE = 'supabase/functions/public-document/index.ts';

function edgeList(name: string): string[] {
  const m = code(EDGE).match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\] as const`));
  if (!m) throw new Error(`${name} not found in ${EDGE}`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

function reads(variable: string): string[] {
  const re = new RegExp(`\\b${variable}\\??\\.([a-z_]+)`, 'g');
  return [...new Set([...code(RENDER).matchAll(re)].map((m) => m[1]))];
}

/** Fields the builder reads that the edge delivers under their own key, not inside the projection. */
const DELIVERED_SEPARATELY = new Set(['counterparty_snapshot']);

describe('public-document returns every field the shared builder reads', () => {
  it.each([
    ['inv', 'DOC_FIELDS'],
    ['fs', 'SETTINGS_FIELDS'],
    ['branch', 'BRANCH_FIELDS'],
    ['addressUnit', 'ADDRESS_UNIT_FIELDS'],
  ])('%s.* ⊆ %s', (variable, list) => {
    const allowed = new Set(edgeList(list));
    const missing = reads(variable).filter((f) => !allowed.has(f) && !DELIVERED_SEPARATELY.has(f));
    expect(missing).toEqual([]);
  });

  it('item fields ⊆ ITEM_FIELDS', () => {
    const allowed = new Set(edgeList('ITEM_FIELDS'));
    // `it.qty` is the BUILT row's field (InvoiceLineRow), not a column.
    const missing = reads('it').filter((f) => f !== 'qty' && !allowed.has(f));
    expect(missing).toEqual([]);
  });

  it('never returns credentials or cost', () => {
    const lists = ['DOC_FIELDS', 'ITEM_FIELDS', 'SETTINGS_FIELDS', 'PARTY_FIELDS'].flatMap(edgeList);
    const forbidden = lists.filter((f) => /key|secret|token|password|credential|cost|markup|api_/.test(f));
    expect(forbidden).toEqual([]);
  });

  it('every response object goes through pick()', () => {
    const src = code(EDGE);
    const ret = src.slice(src.indexOf('  return {\n    kind,'));
    for (const key of ['document', 'items', 'settings', 'customer', 'self_bill_supplier', 'address_unit', 'branch']) {
      expect(ret).toMatch(new RegExp(`${key}: [^\\n]*pick\\(`));
    }
  });
});

describe('every shareable finance document has a public view and a menu entry', () => {
  const KINDS = [
    ['invoice', 'invoices', 'pay_token'],
    ['credit_note', 'credit_notes', 'share_token'],
    ['delivery_note', 'delivery_notes', 'share_token'],
    ['order', 'orders', 'share_token'],
  ] as const;

  it.each(KINDS)('%s resolves in public-document', (_kind, table, column) => {
    expect(code(EDGE)).toMatch(new RegExp(`from\\('${table}'\\)\\.select\\([^)]*\\)\\.eq\\('${column}', token\\)`));
  });

  it.each(KINDS)('%s is offered in the app', (kind) => {
    const sources = [
      'src/modules/finance/components/InvoiceActionsMenu.tsx',
      'src/modules/finance/pages/DocumentsPage.tsx',
      'src/modules/finance/components/OrdersPanel.tsx',
    ].map(code).join('\n');
    expect(sources).toMatch(new RegExp(`customerLink(Handlers|MenuActions)\\('${kind}'`));
  });
});
