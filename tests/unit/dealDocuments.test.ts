/**
 * A deal and the paper it was won on (#378 C3).
 *
 * `crm_deals` linked to a project and a property; nothing linked a document to a DEAL. The
 * pipeline's weighted forecast and the invoiced revenue were two unrelated numbers, so forecast
 * accuracy was unmeasurable and a won deal had to be re-typed as a quote.
 *
 * Three invariants, each protecting a different way of getting it wrong:
 *
 *   1. The LIST is one SQL derivation. Three client-side selects would be a second answer to
 *      "what did this deal produce", and the two would drift the moment a fourth document type
 *      appeared — the shape `get_party_work` and `get_order_settlements` exist to prevent.
 *   2. Attaching is restricted to the deal's OWN party, and to documents on no deal yet.
 *      Without the party filter a stranger's invoice can be pulled into this pipeline; without
 *      the null filter, one deal silently steals a document from another.
 *   3. This panel attaches; it never CREATES. Raising a quote has its own form, its own pricing
 *      and its own numbering — a "New quote" button here would be a fourth way to make one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const SERVICE = 'src/services/dealsService.ts';
const CARD = 'src/modules/crm/components/DealDocumentsCard.tsx';

describe('the deal document list is one derivation', () => {
  it('the service reads get_deal_documents rather than querying three tables', () => {
    const src = read(SERVICE);
    const body = src.slice(src.indexOf('async documents('), src.indexOf('async setDocumentDeal('));
    expect(body, 'the list must come from the SQL derivation').toContain('get_deal_documents');
    for (const t of ['quotes', 'orders', 'invoices']) {
      expect(body, `documents() should not select from ${t} — that is a second answer`)
        .not.toMatch(new RegExp(`from\\('${t}'\\)`));
    }
  });

  it('the card renders the derived rows and does not re-total them from its own query', () => {
    const src = read(CARD);
    expect(src).toContain('dealsService.documents');
  });
});

describe('what may be attached', () => {
  const src = read(CARD);
  // The candidate search is the only place this component reads the document tables.
  const picker = src.slice(src.indexOf('const openPicker'), src.indexOf('const attach ='));

  it('offers only documents that are on NO deal yet', () => {
    // Without this, attaching here silently detaches the document from another deal.
    const nullFilters = picker.match(/\.is\('deal_id', null\)/g) ?? [];
    expect(nullFilters.length, 'each of quotes/orders/invoices must filter deal_id IS NULL').toBe(3);
  });

  it('restricts candidates to the deal\'s own party', () => {
    // A stranger's invoice attached to this deal puts someone else's money in this pipeline.
    expect(picker).toMatch(/customer_company_id/);
    expect(picker).toMatch(/customer_contact_id/);
  });

  it('scopes every candidate query to the workspace', () => {
    const wsFilters = picker.match(/\.eq\('workspace_id', workspaceId\)/g) ?? [];
    expect(wsFilters.length).toBe(3);
  });
});

describe('the panel attaches, it does not create', () => {
  const src = read(CARD);

  it('never calls a create path for a quote, order or invoice', () => {
    for (const forbidden of ['createQuote', 'ordersService.create', 'createInvoice', 'generate_order_from_quote']) {
      expect(src, `${forbidden} would make this a fourth way to raise a document`).not.toContain(forbidden);
    }
  });

  it('writes deal_id on the DOCUMENT, never a document id onto the deal', () => {
    const svc = read(SERVICE);
    // Bounded to the method. An unbounded slice runs to end-of-file and picks up every other
    // deal method, several of which legitimately query crm_deals — the assertion below would then
    // be about the whole service rather than this one write.
    const from = svc.indexOf('async setDocumentDeal(');
    const rest = svc.slice(from);
    const to = rest.indexOf('\n  async ', 1);
    const body = to > 0 ? rest.slice(0, to) : rest;
    expect(body).toMatch(/\.update\(\{ deal_id: dealId \}\)/);
    // One deal produces several quotes, is served by more than one order and billed by more than
    // one invoice; a single crm_deals.quote_id would have to pick one and be wrong about the rest.
    expect(body, 'the link belongs on the document side').not.toMatch(/from\('crm_deals'\)/);
  });

  it('can detach as well as attach — a link that cannot be removed is a mistake made permanent', () => {
    const svc = read(SERVICE);
    expect(svc).toMatch(/dealId: string \| null/);
    expect(src).toContain('setDocumentDeal');
    expect(src).toMatch(/detach/);
  });
});
