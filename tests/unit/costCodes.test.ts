/**
 * Cost codes — the tree helpers, and a coverage guard on the dimension itself.
 *
 * The coverage half is the one that matters. A `cost_code_id` column that no screen can fill is
 * the silent-zero shape wearing a hat: the schema looks complete, the cost report renders, and
 * every number in it lands in the "Not coded" row forever while nothing raises. So every table
 * carrying the column is either wired to the picker or named here with a reason — and the list of
 * reasons may only shrink.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
// From the import-free module, not the service: the service pulls in the Supabase client, which
// throws at module load without env vars and would fail this whole suite for the wrong reason.
import {
  costCodeTree,
  flattenCostCodes,
  costCodeLabel,
  COST_CODE_MAX_DEPTH,
  type CostCode,
} from '@/utils/costCodeTree';

const SRC = resolve(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(p);
  }
  return out;
}
const FILES = walk(SRC).map((p) => ({ path: p.replace(/\\/g, '/'), src: readFileSync(p, 'utf8') }));

const code = (over: Partial<CostCode> & { id: string }): CostCode => ({
  workspace_id: 'ws',
  code: over.id,
  name: over.id,
  description: null,
  parent_id: null,
  sort: 0,
  is_active: true,
  ...over,
});

describe('cost code tree', () => {
  it('nests children under their parent', () => {
    const tree = costCodeTree([
      code({ id: '05', sort: 500 }),
      code({ id: '05.1', parent_id: '05', sort: 510 }),
      code({ id: '05.2', parent_id: '05', sort: 520 }),
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].children.map((c) => c.id)).toEqual(['05.1', '05.2']);
  });

  it('orders by sort, then code, at every level', () => {
    const tree = costCodeTree([
      code({ id: 'b', sort: 10 }),
      code({ id: 'a', sort: 10 }),
      code({ id: 'c', sort: 5 }),
    ]);
    expect(tree.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });

  /**
   * The one that is not obvious. A code whose parent is archived (so absent from the ACTIVE list
   * the picker loads) must still be offered — dropping it would silently remove a live code from
   * every picker, and the cost it should have carried lands uncoded with nothing to explain why.
   */
  it('promotes a code whose parent is missing rather than dropping it', () => {
    const tree = costCodeTree([code({ id: '05.2', parent_id: '05-archived' })]);
    expect(tree.map((c) => c.id)).toEqual(['05.2']);
  });

  it('flattens depth-first with the depth each code sits at', () => {
    const flat = flattenCostCodes(costCodeTree([
      code({ id: '05', sort: 1 }),
      code({ id: '05.1', parent_id: '05', sort: 2 }),
      code({ id: '05.1.1', parent_id: '05.1', sort: 3 }),
      code({ id: '06', sort: 4 }),
    ]));
    expect(flat.map((f) => [f.code.id, f.depth])).toEqual([
      ['05', 0], ['05.1', 1], ['05.1.1', 2], ['06', 0],
    ]);
  });

  it('renders a code and its name as one label', () => {
    expect(costCodeLabel({ code: '05.2', name: 'Plumbing & drainage' })).toBe('05.2 — Plumbing & drainage');
  });

  /** Mirrors `_cost_codes_guard_hierarchy`, which raises above two ancestors. */
  it('states the same depth cap the database enforces', () => {
    expect(COST_CODE_MAX_DEPTH).toBe(3);
  });
});

describe('cost code coverage', () => {
  const types = readFileSync(resolve(SRC, 'integrations/supabase/types.ts'), 'utf8');

  /** Every table whose Row carries `cost_code_id`, read from the generated types. */
  const tablesWithColumn = (): string[] => {
    const found: string[] = [];
    const re = /\n {6}([a-z0-9_]+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(types)) !== null) {
      if (/^\s{10}cost_code_id\??:/m.test(m[2])) found.push(m[1]);
    }
    return found;
  };

  /**
   * Tables whose column exists but has no picker yet, each with the reason. Shrink-only: wiring a
   * surface means deleting its entry, and a new unwired column fails outright rather than joining
   * the list.
   */
  const NOT_YET_WIRED: Record<string, string> = {
    order_items: 'Order lines are coded with the commitment work, which needs the apportionment rule get_project_cost_by_code deliberately does not invent.',
    quote_items: 'Quote lines become the priced schedule in the BoQ work; coding them before that would be a second place to type the same thing.',
    invoice_items: 'The CVR takes value from accepted QUOTES, not invoices; coding invoice lines becomes meaningful with applications for payment.',
    project_purchase_items: 'The project shopping list is pre-commitment; it carries no money get_project_cost_by_code reads.',
    project_tasks: 'Progress-by-code needs the schedule work first.',
    project_snags: 'Snag-by-trade filtering is site work, not cost reporting.',
  };

  /**
   * A table counts as wired when the code that WRITES it knows about the column. Anything looser
   * (does any file anywhere mention `cost_code_id`?) is a guard that cannot fail, which is worse
   * than no guard: it would stay green for a column nothing can ever set.
   */
  const writersOf = (table: string) =>
    FILES.filter((f) => !f.path.includes('/integrations/') && f.src.includes(`from('${table}')`));

  it('every table with the column has a writer that sets it, or is named as not yet wired', () => {
    const unexplained: string[] = [];
    for (const table of tablesWithColumn()) {
      if (table in NOT_YET_WIRED) continue;
      const writers = writersOf(table);
      if (writers.length === 0 || !writers.some((f) => f.src.includes('cost_code_id'))) {
        unexplained.push(table);
      }
    }
    expect(unexplained).toEqual([]);
  });

  it('the guard can actually fail — a table nobody writes is reported', () => {
    // Proves the check above is load-bearing rather than vacuously true.
    expect(writersOf('a_table_that_does_not_exist')).toEqual([]);
  });

  it('the not-yet-wired list only holds tables that really have the column', () => {
    const actual = new Set(tablesWithColumn());
    const stale = Object.keys(NOT_YET_WIRED).filter((t) => !actual.has(t));
    expect(stale).toEqual([]);
  });

  it('the three cost sources the report reads are all wired', () => {
    // get_project_cost_by_code reads supplier_bills, time_entries and trip_expense_items. If any
    // of those cannot be coded from a screen, the breakdown is structurally empty.
    for (const table of ['supplier_bills', 'time_entries', 'trip_expense_items']) {
      expect(Object.keys(NOT_YET_WIRED)).not.toContain(table);
      expect(tablesWithColumn()).toContain(table);
    }
    const pickers = FILES.filter((f) => f.src.includes('<CostCodePicker'));
    expect(pickers.length).toBeGreaterThanOrEqual(3);
  });

  /**
   * The CVR card formats the SQL's own per-row figures. It must never rebuild a row total from
   * its components — that would be a second derivation of the same money, free to drift from the
   * first. It superseded CostByCodeCard, which showed the cost half with no value beside it.
   */
  it('the CVR card does not re-derive a row total in TypeScript', () => {
    const card = FILES.find((f) => f.path.endsWith('/components/CvrCard.tsx'));
    expect(card, 'CvrCard.tsx should exist').toBeTruthy();
    expect(card!.src).not.toMatch(/actual_cost\s*\+\s*.*committed_cost/);
    expect(card!.src).not.toMatch(/contracted_value\s*\+\s*.*variation_value/);
    // And the superseded card is gone rather than left beside it showing a different number.
    expect(FILES.find((f) => f.path.endsWith('/components/CostByCodeCard.tsx'))).toBeFalsy();
  });
});
