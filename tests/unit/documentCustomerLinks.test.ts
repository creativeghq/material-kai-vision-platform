import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import { DOCUMENT_ENTITY_TYPES } from '../../src/services/documentDeliveryTypes';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
}

const SRC = walk('src').map((f) => [f, read(f)] as const);

const PUBLIC_ROUTE: Record<string, string> = {
  invoice: '/pay/:token',
  quote: '/q/:token',
  contract: '/sign/:token',
  statement: '/statement/:token',
  catalog: '/c/:slug',
  moodboard_sheet: '/sheets/share/:token',
  client_view: '/cv/:token',
  property_listing: '/p/:token',
  moodboard: '/board/:id',
  storefront: '/store/:slug',
  order: '/d/:token',
  credit_note: '/d/:token',
  delivery_note: '/d/:token',
};

describe('#527 — every document a workspace sends has an online view', () => {
  it('names a public route for every document type, and no type that does not exist', () => {
    expect(Object.keys(PUBLIC_ROUTE).sort()).toEqual([...DOCUMENT_ENTITY_TYPES].sort());
  });

  it.each(Object.entries(PUBLIC_ROUTE))('%s → %s is a declared route', (_type, route) => {
    const quoted = new RegExp(`(?:path=|path:\\s*)["']${route.replace(/[/:]/g, (c) => `\\${c}`)}["']`);
    expect(SRC.some(([, src]) => quoted.test(src)), `no route declares ${route}`).toBe(true);
  });
});

describe('#527 — every finance document a customer is sent offers its link', () => {
  const kinds = [...read('src/modules/finance/services/customerLinks.ts')
    .match(/export type ShareableDocumentKind = ([^;]+);/)![1]
    .matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
  const edge = read('supabase/functions/public-document/index.ts');
  const finance = SRC.filter(([f]) => f.startsWith('src/modules/finance/') || f.startsWith('src/pages/Admin/'));

  it('reads the kinds', () => {
    expect(kinds).toEqual(expect.arrayContaining(['invoice', 'credit_note', 'delivery_note', 'order']));
  });

  it.each(kinds.map((k) => [k]))('%s resolves on the public page', (kind) => {
    const resolved = kind === 'order' ? ['sales_order', 'purchase_order'] : [kind];
    for (const k of resolved) expect(edge, `public-document has no '${k}' branch`).toMatch(new RegExp(`kind === '${k}'`));
  });

  it.each(kinds.map((k) => [k]))('%s has a menu or panel that offers the customer link', (kind) => {
    const offers = new RegExp(
      `customerLinkHandlers\\(\\s*'${kind}'|customerLinkMenuActions\\(\\s*'${kind}'|<CustomerLinkPanel[^>]*kind="${kind}"`,
    );
    expect(finance.some(([, src]) => offers.test(src)), `no surface offers a ${kind} customer link`).toBe(true);
  });
});
