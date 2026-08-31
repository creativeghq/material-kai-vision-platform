/**
 * Guards the agent result cards' one interactive claim: a row that IS a record can be opened, and
 * a name that belongs to another record goes to that record.
 *
 * Three failure modes, none of which anything else can see:
 *
 *  1. **A second route table.** The ⌘K palette already declares where every kind opens and which
 *     gates match the guard on that route. Writing those again here would compile, render, and be
 *     wrong the first time a route moves — so the shared kinds must be DERIVED from
 *     `GLOBAL_SEARCH_KINDS`, and this file proves they still are by comparing the two answers.
 *
 *  2. **A link built from a key that is not a record.** `recordKindForIdKey` decides by suffix,
 *     which is what makes it work for tools nobody has written yet — and is exactly why it must
 *     refuse `workspace_id`, `category_id`, `template_id` and friends. A wrong link goes somewhere
 *     REAL and wrong, which is harder to notice than no link at all.
 *
 *  3. **A payload with nothing to link.** The card can only link an id the tool actually selected.
 *     `list_recent_expenses` returned six expenses whose supplier existed only inside a `notes`
 *     sentence, so the canvas showed a Notes column where the chat's prose answer had a Supplier
 *     column — the same data reading as two different answers on the two halves of one screen.
 *     A source scan is the only thing that can see a missing column in a `select` string.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// The catalogue is pure; only the RPC call needs a client, and the unit tier has no secrets.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import {
  RECORD_LINKS,
  recordSpec,
  recordRoute,
  recordListRoute,
  canOpenRecordKind,
  recordKindForIdKey,
  labelKeyForIdKey,
  rowRecordKind,
  rowRecordRef,
  relatedRecordRefs,
} from '@/config/recordLinks';
import { GLOBAL_SEARCH_KINDS } from '@/services/globalSearchService';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const ANY_CTX = { isPlatformOperator: false, isWorkspaceManager: false };
const OPEN_GATE = { can: () => true, isModuleAvailable: () => true, isWorkspaceManager: true };
const SHUT_GATE = { can: () => false, isModuleAvailable: () => false, isWorkspaceManager: false };

describe('record links — one route table, not two', () => {
  it('derives every palette kind from the palette', () => {
    for (const spec of GLOBAL_SEARCH_KINDS) {
      for (const ctx of [ANY_CTX, { isPlatformOperator: true, isWorkspaceManager: true }]) {
        const fromPalette = spec.route(
          { kind: spec.kind, id: 'the-id', title: '', subtitle: null, badge: null, matchRank: 2 },
          ctx,
        );
        expect(
          recordRoute(spec.kind, 'the-id', ctx),
          `${spec.kind} must open exactly where the palette opens it`,
        ).toBe(fromPalette);
      }
    }
  });

  it('carries the same gates as the palette, so neither offers what the other refuses', () => {
    for (const spec of GLOBAL_SEARCH_KINDS) {
      const mine = recordSpec(spec.kind)!;
      expect(mine.requireAnyCapability).toEqual(spec.requireAnyCapability);
      expect(mine.moduleSlug).toBe(spec.moduleSlug);
      expect(mine.requireWorkspaceManager).toBe(spec.requireWorkspaceManager);
    }
  });

  it('gives every kind either a record page or the list it lives in', () => {
    for (const spec of RECORD_LINKS) {
      const target = spec.route ? spec.route('the-id', ANY_CTX) : spec.listRoute;
      expect(target, `${spec.kind} must lead somewhere`).toBeTruthy();
      expect(target!.startsWith('/'), `${spec.kind} must be an in-app path`).toBe(true);
      // A record route must open the RECORD. A kind with no record page says so with a null
      // route and a listRoute instead — silently returning the list from `recordRoute` is the
      // "button whose whole effect is to name a place" bug wearing a link.
      if (spec.route) expect(spec.route('the-id', ANY_CTX)).toContain('the-id');
      else expect(recordRoute(spec.kind, 'the-id', ANY_CTX)).toBeNull();
    }
  });

  it('refuses a kind the persona cannot reach', () => {
    expect(canOpenRecordKind('expense', OPEN_GATE)).toBe(true);
    expect(canOpenRecordKind('expense', SHUT_GATE)).toBe(false);
    expect(canOpenRecordKind('not-a-kind', OPEN_GATE)).toBe(false);
  });

  it('routes the three page-less kinds to a finance/contracts list', () => {
    expect(recordListRoute('expense')).toBe('/finance?tab=doc_expenses');
    expect(recordListRoute('payment')).toBe('/finance?tab=doc_payments');
    expect(recordListRoute('contract')).toBe('/contracts');
  });
});

describe('record links — what an id points at', () => {
  it('resolves every prefixed variant through one suffix', () => {
    for (const key of ['company_id', 'supplier_company_id', 'customer_company_id', 'counterparty_company_id', 'brand_company_id']) {
      expect(recordKindForIdKey(key), key).toBe('company');
    }
    expect(recordKindForIdKey('customer_contact_id')).toBe('contact');
    expect(recordKindForIdKey('covers_order_id')).toBe('order');
    expect(recordKindForIdKey('source_quote_id')).toBe('quote');
    expect(recordKindForIdKey('supplier_bill_id')).toBe('expense');
    expect(recordKindForIdKey('bill_id')).toBe('expense');
    expect(recordKindForIdKey('project_id')).toBe('project');
  });

  it('refuses plumbing, because a wrong link goes somewhere real', () => {
    for (const key of [
      'workspace_id', 'user_id', 'created_by', 'category_id', 'template_id', 'session_id',
      'job_id', 'status_tag_id', 'bank_account_id', 'deal_type_id', 'trip_report_id', 'id',
    ]) {
      expect(recordKindForIdKey(key), `${key} is not a record reference`).toBeNull();
    }
  });

  it('finds the cell that holds the name', () => {
    const expense = { supplier_company_id: 'c1', supplier_name: 'ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ', total: 322.44 };
    expect(labelKeyForIdKey('supplier_company_id', expense)).toBe('supplier_name');

    const invoice = { customer_company_id: 'c1', customer_name: 'ACME' };
    expect(labelKeyForIdKey('customer_company_id', invoice)).toBe('customer_name');

    const bill = { order_id: 'o1', order_number: 'ORD-2026-0001' };
    expect(labelKeyForIdKey('order_id', bill)).toBe('order_number');

    // No sibling name → no name. The chip still renders with the kind's label; inventing a
    // column here would put a uuid on screen as if it were a name.
    expect(labelKeyForIdKey('project_id', { project_id: 'p1' })).toBeNull();
  });
});

describe('record links — what a row IS', () => {
  it('reads the kind off the list key', () => {
    expect(rowRecordKind({}, 'expenses')).toBe('expense');
    expect(rowRecordKind({}, 'orders')).toBe('order');
    expect(rowRecordKind({}, 'companies')).toBe('company');
    expect(rowRecordKind({}, 'somethings')).toBeNull();
  });

  it("lets a row that names its own kind win — that is how the cross-entity search card works", () => {
    expect(rowRecordKind({ kind: 'company' }, 'records', 'record_search_results')).toBe('company');
    expect(rowRecordKind({ kind: 'nonsense' }, 'orders')).toBe('order');
  });

  it('opens the row from its id, however the payload spells it', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    expect(rowRecordRef({ id }, 'expenses')).toEqual({ kind: 'expense', id });
    // crm_kad_results keys the company by `company_id`, not `id`.
    expect(rowRecordRef({ company_id: id, name: 'ACME' }, 'companies')).toEqual({ kind: 'company', id });
    // A non-uuid id is a display code, not a join key.
    expect(rowRecordRef({ id: 'ORD-1' }, 'orders')).toBeNull();
  });

  it('lists the other records a row points at, with their names', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    const refs = relatedRecordRefs({
      id: '99999999-2222-3333-4444-555555555555',
      supplier_company_id: id,
      supplier_name: 'ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ',
      workspace_id: '77777777-2222-3333-4444-555555555555',
    });
    expect(refs).toEqual([{ key: 'supplier_company_id', kind: 'company', id, title: 'ΑΠΟΣΤΟΛΙΔΗΣ ΑΕΒΕ' }]);
  });
});

describe('the tools ship the identity the card links', () => {
  // Anchored on the CHUNK, and read backwards from it — the chunk is what reaches the card, so
  // "the query above the emission selects these columns" is the claim worth holding. Anchoring on
  // `.from('invoices')` instead matches whichever query happens to come first in the file.
  const REQUIRED: Array<{ file: string; chunk: string; columns: string[]; span?: number }> = [
    {
      file: 'supabase/functions/_shared/tools/expense-tools.ts',
      chunk: 'expenses_list',
      columns: ['supplier_company_id', 'supplier_name', 'order_id'],
    },
    {
      file: 'supabase/functions/_shared/tools/finance-tools.ts',
      chunk: 'finance_orders_list',
      columns: ['customer_company_id', 'supplier_company_id'],
    },
    {
      file: 'supabase/functions/_shared/tools/finance-tools.ts',
      chunk: 'finance_payments_list',
      columns: ['counterparty_company_id', 'counterparty_contact_id'],
    },
    {
      file: 'supabase/functions/_shared/tools/finance-tools.ts',
      chunk: 'finance_invoices_list',
      columns: ['customer_company_id', 'customer_contact_id'],
    },
    {
      file: 'supabase/functions/_shared/tools/crm-tools.ts',
      chunk: 'crm_deals_list',
      columns: ['company_id', 'contact_id'],
    },
    {
      file: 'supabase/functions/_shared/tools/expense-tools.ts',
      chunk: 'mydata_expense_documents',
      columns: ['issuer_company_id', 'created_supplier_bill_id'],
      // The row shape is built above a long note about reusing the canonical ΑΦΜ→CRM resolution,
      // so the default look-back does not reach it.
      span: 3200,
    },
    {
      file: 'supabase/functions/_shared/tools/expense-tools.ts',
      chunk: 'mydata_expense_suppliers',
      columns: ['crm_company_id'],
    },
  ];

  for (const { file, chunk, columns, span } of REQUIRED) {
    it(`${chunk} ships what the row links to`, () => {
      const src = read(file);
      const at = src.indexOf(`type: '${chunk}'`);
      expect(at, `${chunk} must still be emitted from ${file}`).toBeGreaterThan(-1);
      const window = src.slice(Math.max(0, at - (span ?? 1600)), at);
      for (const col of columns) {
        expect(window, `the query behind ${chunk} must select ${col}`).toContain(col);
      }
    });
  }

  it('flattens the name onto the row instead of nesting it', () => {
    // A PostgREST embed returns `{customer: {name}}`, and the card's table builder skips
    // non-scalar columns — so an embed puts the name in the payload and takes it off the screen.
    const helper = read('supabase/functions/_shared/tools/record-labels.ts');
    expect(helper).toContain('attachPartyNames');
    for (const file of [
      'supabase/functions/_shared/tools/finance-tools.ts',
      'supabase/functions/_shared/tools/expense-tools.ts',
      'supabase/functions/_shared/tools/crm-tools.ts',
    ]) {
      expect(read(file), `${file} must use the shared name attacher`).toContain('attachPartyNames');
    }
  });
});

describe('the card renders the record layer', () => {
  const CARD = read('src/components/features/ai/AgentResultCard.tsx');

  it('opens the row it is on and links the names it is not', () => {
    expect(CARD, 'the row must be openable').toContain('rowRecordRef');
    expect(CARD, 'a foreign name must be an anchor').toContain('labelKeyForIdKey');
    // target=_blank on the foreign link: following it is LEAVING, and the conversation must
    // still be there afterwards.
    expect(CARD).toMatch(/target="_blank"[\s\S]{0,200}rel="noopener noreferrer"/);
    expect(CARD, 'the peek is the in-place detail').toContain('RecordPeekDialog');
  });

  it('unwraps the single `data` envelope half the tools emit', () => {
    // `{data: {count: 6, expenses: […]}}` rendered as a field LABELLED "Data" with the answer
    // nested inside it — the shape of the JSON showing through as a heading, and on the canvas
    // that was the whole artifact.
    expect(CARD).toMatch(/keys\[0\] === 'data'/);
  });

  it('reads money with its currency instead of beside it', () => {
    expect(CARD).toContain('MONEY_COL_RE');
    expect(CARD).toContain('formatMoney');
    expect(CARD, 'currency is part of the amount, not its own column').toContain("c !== 'currency'");
  });

  it('is handed the reader at every render site', () => {
    // `access` is optional so the card stays renderable outside every provider (its own render
    // test drives it with renderToStaticMarkup). Optional means forgettable, and a card without
    // it silently loses every link — the "offered but not bound" shape, with nothing to see.
    const hub = read('src/components/features/ai/AgentHub.tsx');
    const sites = hub.match(/<AgentResultCard[\s\S]{0,400}?\/>/g) ?? [];
    expect(sites.length, 'AgentHub must still render the card').toBeGreaterThan(0);
    for (const site of sites) {
      expect(site, 'every AgentResultCard must be given `access`').toContain('access={recordLinkAccess}');
    }
    expect(hub).toContain('useRecordLinkAccess()');
  });

  it('keeps status tint and enum-to-prose in one place', () => {
    // Two copies is how a status ends up amber in the table and grey in the dialog you opened
    // from that table.
    expect(CARD).toContain("from '@/utils/recordDisplay'");
    expect(CARD, 'no local status map').not.toMatch(/const STATUS_VARIANT\s*[:=]/);
  });
});

/**
 * The myDATA expenses feed has a route of its own.
 *
 * Asked "only the expenses from myAADE, not the ones added manually", the agent had one expense
 * tool — `list_recent_expenses` over `supplier_bills` — so it answered from the six BOOKED expenses
 * and worked out the origin by reading the `notes` prose. It said two. The inbox held 1,866
 * documents. Nothing failed: a wrong count is a valid number, the tool ran clean, and the sentence
 * read like an answer.
 *
 * Two halves have to hold, and each is silent alone. The tool must exist and be reachable; and its
 * DESCRIPTION must carry the words a person uses for it, because tool selection is the step that
 * actually failed — a perfect tool the router never considers is the same screen as no tool.
 */
describe('the myDATA expenses feed is reachable and findable', () => {
  const tools = read('supabase/functions/_shared/tools/expense-tools.ts');
  const chat = read('supabase/functions/agent-chat/index.ts');
  const catalog = read('src/components/features/ai/agentToolsCatalog.ts');
  const hub = read('src/components/features/ai/AgentHub.tsx');

  it('reads the inbox, not just the bills we booked from it', () => {
    expect(tools).toContain("name: 'list_mydata_expenses'");
    // `inbound_documents` used to be touched in exactly one place — a lookup inside pay_expense —
    // so a document nobody had booked could be PAID and never listed.
    const listing = tools.slice(tools.indexOf('createMydataExpensesTool'));
    expect(listing).toContain("from('inbound_documents')");
  });

  it('is bound, not merely defined', () => {
    // `AGENT_CONFIGS[agentId].tools` is the binding; a push site alone reaches nobody.
    expect(chat).toContain("'list_mydata_expenses'");
    expect(chat).toContain('createMydataExpensesTool');
    expect(catalog).toContain("'list_mydata_expenses'");
  });

  it('renders what it returns', () => {
    // Both quick-starts are `run:` — no model turn, so an unregistered chunk is a cheerful "done"
    // over an empty screen.
    for (const chunk of ['mydata_expense_documents', 'mydata_expense_suppliers', 'mydata_inbound_status']) {
      expect(hub, `${chunk} must be in AGENT_RESULT_TITLES`).toContain(chunk);
    }
  });

  it('says the words a person uses, so the router can find it', () => {
    const desc = tools.slice(tools.indexOf("name: 'list_mydata_expenses'"), tools.indexOf("name: 'list_mydata_expenses'") + 1600);
    for (const word of ['myDATA', 'myAADE', 'ΑΑΔΕ']) {
      expect(desc, `the description must name ${word}`).toContain(word);
    }
  });

  it('does not let the booked list answer for the feed', () => {
    // The other half of the miss: `list_recent_expenses` is the tool that WAS chosen, so it has to
    // say what it is not and where the rest lives.
    const desc = tools.slice(tools.indexOf("name: 'list_recent_expenses'"), tools.indexOf("name: 'list_recent_expenses'") + 1200);
    expect(desc).toContain('list_mydata_expenses');
    expect(desc, 'it must say these are the BOOKED ones').toMatch(/RECORDED|booked/);
  });

  it('answers origin from the link, not from the notes prose', () => {
    expect(tools).toContain('stampExpenseSource');
    // `inbound_documents.created_supplier_bill_id` is the joinable fact; `notes` is a sentence.
    const fn = tools.slice(tools.indexOf('async function stampExpenseSource'));
    expect(fn.slice(0, 900)).toContain('created_supplier_bill_id');
  });
});

describe('a myDATA document is its own kind of record', () => {
  it('is peekable, has no page, and lives in the supplier inbox', () => {
    const spec = recordSpec('inbound_document')!;
    expect(spec, 'inbound_document must be registered').toBeTruthy();
    expect(spec.peekable).toBe(true);
    // Collapsing it into `expense` is exactly what produced "2" for a 1,866-document feed.
    expect(spec.route, 'a received document has no page of its own').toBeNull();
    expect(spec.listRoute).toBe('/finance?tab=expense_suppliers');
  });

  it('opens the row from a prefixed id key', () => {
    const id = '11111111-2222-3333-4444-555555555555';
    // `inbound_issuers_summary` names a company's id `crm_company_id`; requiring `id`/`company_id`
    // left every one of those rows dead.
    expect(rowRecordRef({ crm_company_id: id, issuer_name: 'ACME' }, 'suppliers')).toEqual({ kind: 'company', id });
    // ...but only for the row's OWN kind: an expense's supplier is a company, not the expense.
    expect(rowRecordRef({ supplier_company_id: id, total: 10 }, 'expenses')).toBeNull();
  });

  it('keys documents on the chunk, never on the word "documents"', () => {
    // `my_hr_documents` also returns a list called `documents`, and a wrong link goes somewhere
    // real and wrong.
    expect(rowRecordKind({}, 'documents')).toBeNull();
    expect(rowRecordKind({}, 'documents', 'mydata_expense_documents')).toBe('inbound_document');
  });
});
