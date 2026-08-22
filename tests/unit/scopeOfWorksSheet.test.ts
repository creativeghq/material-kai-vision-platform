/**
 * The Scope of Works sheet — the client-facing "what will happen" half of a proposal.
 *
 * Every other sheet type describes a THING (materials, colours, fixtures, an FF&E schedule). This
 * one describes the DOING, which is the part a client actually signs off on, and it is the piece a
 * Client View was missing.
 *
 * Two invariants, and they are the whole reason this file exists:
 *
 *   1. **It prints only client-visible tasks.** `project_tasks.visibility` already separates what
 *      the team tracks from what the client is shown. Drop that filter and a proposal prints
 *      "chase the supplier" and "check the margin" to the customer — on a document that has
 *      already been sent by the time anybody notices.
 *   2. **It prints no money.** Price lives on the FF&E schedule and the quote. A second surface
 *      that totals money is a second derivation of it, which this codebase treats as a defect
 *      rather than a convenience — and a scope sheet quietly disagreeing with the quote is exactly
 *      the shape `moneyDerivation.test.ts` exists to stop.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (rel: string) => stripComments(readFileSync(join(ROOT, rel), 'utf8'));

const FETCHER = read('supabase/functions/generate-moodboard-sheet-pdf/data-fetcher.ts');
const BUILDERS = read('supabase/functions/generate-moodboard-sheet-pdf/builders.ts');
const INDEX = read('supabase/functions/generate-moodboard-sheet-pdf/index.ts');

/** The body of the scope fetcher, bounded to itself. */
const fetcher = (() => {
  const i = FETCHER.indexOf('export async function fetchProjectScopePhases');
  expect(i, 'fetchProjectScopePhases should exist').toBeGreaterThan(-1);
  const rest = FETCHER.slice(i);
  const end = rest.indexOf('\nexport ', 1);
  return end > 0 ? rest.slice(0, end) : rest;
})();

/** The body of the builder, bounded to itself. */
const builder = (() => {
  const i = BUILDERS.indexOf('export function buildScopeOfWorks');
  expect(i, 'buildScopeOfWorks should exist').toBeGreaterThan(-1);
  const rest = BUILDERS.slice(i);
  const end = rest.indexOf('\nfunction ', 1);
  const end2 = rest.indexOf('\nexport function ', 1);
  const cut = [end, end2].filter((n) => n > 0).sort((a, b) => a - b)[0];
  return cut ? rest.slice(0, cut) : rest;
})();

describe('a client never sees internal work', () => {
  it('the fetcher filters to client_visible tasks', () => {
    expect(
      fetcher,
      'without this filter a proposal prints internal tasks to the customer',
    ).toMatch(/\.eq\('visibility', 'client_visible'\)/);
  });

  it('it reads from project_tasks, so the schedule and the proposal cannot disagree', () => {
    expect(fetcher).toMatch(/from\('project_tasks'\)/);
  });

  it('ownership is proven before the tasks are read', () => {
    // An embedded foreign project_id would otherwise print another tenant's programme.
    const projIdx = fetcher.indexOf("from('projects')");
    const taskIdx = fetcher.indexOf("from('project_tasks')");
    expect(projIdx, 'the project must be read first').toBeGreaterThan(-1);
    expect(projIdx).toBeLessThan(taskIdx);
    expect(fetcher).toMatch(/workspaceIds/);
  });

  it('owners are off by default — a client document does not disclose subcontractors', () => {
    expect(fetcher).toMatch(/showOwners/);
    // Resolved to a name, never an id handed to the renderer.
    expect(fetcher).toMatch(/nameById/);
  });

  it('a failure is loud, because an empty scope on a sent document is worse than no document', () => {
    expect(fetcher).toMatch(/console\.error/);
  });
});

describe('the scope sheet prints no money', () => {
  const MONEY = ['formatMoney', 'price', 'total', 'currency', 'subtotal', 'vat'];

  it('the builder mentions no money concept at all', () => {
    const found = MONEY.filter((m) => new RegExp(`\\b${m}\\b`, 'i').test(builder));
    expect(
      found,
      `A scope sheet that totals money is a second derivation of it, and it will disagree with the `
      + `quote sooner or later. Money belongs on the FF&E schedule and the quote. Found: ${found.join(', ')}`,
    ).toEqual([]);
  });

  it('the fetcher does not read prices either', () => {
    const found = MONEY.filter((m) => new RegExp(`\\b${m}\\b`, 'i').test(fetcher));
    expect(found, `the scope fetcher should not read money: ${found.join(', ')}`).toEqual([]);
  });
});

describe('it is reachable everywhere a sheet is', () => {
  it('renders on its own', () => {
    expect(INDEX).toMatch(/case 'scope_of_works'/);
  });

  it('renders inside a deck and a Client View — both call sites pass the resolver', () => {
    // A Client View IS the proposal. A scope sheet that renders alone but blank inside the deck
    // would be the worst of both: correct in preview, empty in the document actually sent.
    const passes = INDEX.match(/fetchProjectScopePhases\(supabase, pid/g) ?? [];
    expect(passes.length, 'both buildSheetForDeck call sites must resolve the scope').toBe(2);
  });

  it('the empty state explains itself rather than printing a blank page', () => {
    expect(builder).toMatch(/client-visible/i);
  });
});
