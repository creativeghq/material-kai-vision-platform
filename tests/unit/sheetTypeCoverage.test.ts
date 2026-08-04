/**
 * Presentation-sheet type coverage guard.
 *
 * A sheet type is declared in SEVEN hand-maintained places across three runtimes.
 * TypeScript catches only two of them (`Record<SheetType, …>` in the frontend
 * service); the rest are separate files with no shared type, so a new sheet type
 * that misses one fails SILENTLY and in a type-specific way:
 *
 *   • miss the edge SHEET_CREDITS  → the create path throws on an undefined cost,
 *                                    or worse, debits NaN/0 credits
 *   • miss INTERACTIVE_TYPES       → the canvas never opens; the user gets an
 *                                    empty PDF instead of an editor
 *   • miss the PDF builder switch  → renders a blank A3 with a title block only
 *   • miss the agent tool enum     → the agent simply cannot create the sheet
 *   • miss the DB enum             → the insert fails at runtime
 *
 * These are exactly the "silent zero" shape CLAUDE.md warns about, so the
 * invariant is a red build instead of prose.
 *
 * The edge/Deno files are read as TEXT, not imported — importing them into
 * Vitest would drag in Deno-only module specifiers.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Constants } from '../../src/integrations/supabase/types';

const ROOT = process.cwd();
// Normalize CRLF — these files are edited on Windows and every block regex below
// anchors on "\n}" / "\n]".
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const CREATE_SHEET = read('supabase/functions/generate-moodboard-sheet-pdf/create-sheet.ts');
const EDGE_TYPES = read('supabase/functions/generate-moodboard-sheet-pdf/types.ts');
const BUILDERS = read('supabase/functions/generate-moodboard-sheet-pdf/builders.ts');
const SHEET_TOOL = read('supabase/functions/_shared/tools/presentation-sheet-tool.ts');
const CANVAS = read('src/components/features/sheets/FixtureSymbolCanvas.tsx');
// Read as TEXT rather than imported: moodboardSheetsService pulls in the
// Supabase client, which throws without env vars in a unit-test process.
const SERVICE = read('src/services/moodboardSheetsService.ts');

/** Parse `X = { key: <number|'string'>, … }` out of a source file. */
function parseRecord(src: string, constName: string): Record<string, string | number> {
  const m = new RegExp(`${constName}[^=]*=\\s*\\{([\\s\\S]*?)\\n\\};`).exec(src);
  if (!m) throw new Error(`Could not locate ${constName}`);
  return Object.fromEntries(
    [...m[1].matchAll(/^\s*([a-z_]+):\s*(?:'([^']*)'|(\d+))/gm)].map((x) => [
      x[1],
      x[2] !== undefined ? x[2] : Number(x[3]),
    ]),
  );
}

const SHEET_TYPE_LABELS = parseRecord(SERVICE, 'SHEET_TYPE_LABELS') as Record<string, string>;
const SHEET_TYPE_CREDITS = parseRecord(SERVICE, 'SHEET_TYPE_CREDITS') as Record<string, number>;

const ALL_TYPES = Object.keys(SHEET_TYPE_LABELS);

/**
 * Pull the string members of an array literal. `anchor` must consume everything
 * up to (but not including) the opening bracket — a lazy `[\s\S]*?` would stop at
 * the `[]` inside a type annotation like `SheetType[]` and capture nothing.
 */
function arrayMembers(src: string, anchor: string): string[] {
  const m = new RegExp(`${anchor}\\[([\\s\\S]*?)\\]`).exec(src);
  if (!m) throw new Error(`Could not locate ${anchor}`);
  return [...m[1].matchAll(/'([a-z_0-9]+)'/g)].map((x) => x[1]);
}

describe('presentation sheet type coverage', () => {
  it('every sheet type exists in the DB enum', () => {
    const dbEnum = Constants.public.Enums.moodboard_sheet_type as readonly string[];
    expect([...ALL_TYPES].sort()).toEqual([...dbEnum].sort());
  });

  it('the edge SheetType union matches the frontend union', () => {
    // Scope to the SheetType declaration — the file holds other unions too.
    const decl = /export type SheetType =([\s\S]*?);/.exec(EDGE_TYPES);
    expect(decl, 'SheetType union not found in edge types.ts').toBeTruthy();
    const edgeUnion = [...decl![1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(edgeUnion.sort()).toEqual([...ALL_TYPES].sort());
  });

  it('frontend SHEET_TYPE_CREDITS and edge SHEET_CREDITS agree on every type and price', () => {
    // Same keys AND same values — a mismatched price means the UI quotes one
    // cost and the ledger debits another.
    expect(parseRecord(CREATE_SHEET, 'SHEET_CREDITS')).toEqual(SHEET_TYPE_CREDITS);
  });

  it('every sheet type has a credit cost and a label', () => {
    for (const t of ALL_TYPES) {
      expect(SHEET_TYPE_LABELS[t], `${t} has no label`).toBeTruthy();
      expect(SHEET_TYPE_CREDITS[t], `${t} has no credit cost`).toBeGreaterThan(0);
    }
  });

  it('every sheet type is rendered by the PDF builder dispatch', () => {
    // Two dispatches: builders.ts renders a single sheet, index.ts additionally
    // handles full_deck (which composes other sheets rather than drawing itself).
    const EDGE_INDEX = read('supabase/functions/generate-moodboard-sheet-pdf/index.ts');
    const rendered = [...`${BUILDERS}\n${EDGE_INDEX}`.matchAll(/case '([a-z_]+)':/g)].map((m) => m[1]);
    const missing = ALL_TYPES.filter((t) => !rendered.includes(t));
    expect(missing, `sheet types with no builder branch — these render a blank page`).toEqual([]);
  });

  it('every sheet type is creatable by the agent tool', () => {
    const toolEnum = arrayMembers(SHEET_TOOL, 'sheet_type: z\\.enum\\(');
    const missing = ALL_TYPES.filter((t) => !toolEnum.includes(t));
    expect(missing, 'sheet types the agent cannot create').toEqual([]);
  });

  it('interactive types agree between the frontend set and the edge list', () => {
    const edgeInteractive = arrayMembers(CREATE_SHEET, 'INTERACTIVE_TYPES[^=]*=\\s*');
    const feSrc = read('src/components/business/moodboard/MoodboardSheetsTab.tsx');
    const feInteractive = arrayMembers(feSrc, 'INTERACTIVE_SHEET_TYPES[^=]*=[^[]*');
    expect(feInteractive.length).toBeGreaterThan(0);
    expect(feInteractive.sort()).toEqual(edgeInteractive.sort());
  });
});

describe('symbol-plan glyph coverage', () => {
  // The canvas palette and the PDF drawer are two hand-written switch statements
  // over the same string keys. Drift means the user places a symbol that renders
  // as the default circle in the PDF — visible only by opening the file.
  const DRAWERS: Array<[defs: string, drawer: string]> = [
    ['LIGHTING_FIXTURE_DEFS', 'drawFixtureSymbol'],
    ['PLUMBING_FIXTURE_DEFS', 'drawPlumbingSymbol'],
    ['ELECTRICAL_FIXTURE_DEFS', 'drawElectricalSymbol'],
  ];

  it.each(DRAWERS)('%s is fully drawn by %s', (defsName, drawerName) => {
    const defsBlock = new RegExp(`${defsName}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`).exec(CANVAS);
    expect(defsBlock, `${defsName} not found`).toBeTruthy();
    const types = [...defsBlock![1].matchAll(/type:\s*'([a-z_0-9]+)'/g)].map((m) => m[1]);
    expect(types.length).toBeGreaterThan(0);

    const drawerBlock = new RegExp(`function ${drawerName}\\(([\\s\\S]*?)\\n\\}\\n`).exec(BUILDERS);
    expect(drawerBlock, `${drawerName} not found`).toBeTruthy();
    const drawn = [...drawerBlock![1].matchAll(/case '([a-z_0-9]+)':/g)].map((m) => m[1]);

    const missing = types.filter((t) => !drawn.includes(t));
    expect(missing, `${defsName} entries with no ${drawerName} branch`).toEqual([]);
  });

  // A symbol's product_id is what produces the SCHEDULE (quantity take-off) on
  // the rendered sheet. If any leg of that chain is missing the plan still
  // renders — just silently without a bill of materials, which looks like "this
  // plan has no products" rather than "the feature is broken".
  it('the product link survives end to end: canvas → tool schema → PDF schedule', () => {
    expect(CANVAS, 'FixtureSymbol lost product_id').toMatch(/product_id\?:\s*string/);
    expect(SHEET_TOOL, 'agent tool cannot set a symbol product_id').toMatch(/product_id:\s*z\.string\(\)/);
    expect(BUILDERS, 'symbol plan no longer renders a SCHEDULE').toContain("'SCHEDULE'");
    // The take-off must count placed symbols, not just list resolved chips —
    // otherwise a product placed 8 times reads as quantity 1.
    expect(BUILDERS, 'schedule does not count symbols per product').toMatch(/counts\.set\(s\.product_id/);
  });

  // Runs are persisted by the canvas, drawn by the builder, and settable by the
  // agent. Break any link and the plan still renders — just without its
  // pipework, which reads as "nothing was drawn" rather than "this is broken".
  it('runs survive end to end: canvas save → PDF polyline → agent schema', () => {
    expect(CANVAS, 'runs are not persisted with the sheet').toMatch(/data:\s*\{\s*backdrop,\s*symbols,\s*legend,\s*runs\s*\}/);
    expect(BUILDERS, 'symbol plan does not draw runs').toContain('payload.runs');
    expect(BUILDERS, 'no SERVICES key for the run colours').toContain("'SERVICES'");
    expect(SHEET_TOOL, 'agent cannot define runs').toMatch(/runs:\s*z\.array/);
  });

  it('runs are drawn beneath symbols, not over them', () => {
    // A cable drawn on top of the fixture it feeds hides the glyph.
    const runsAt = BUILDERS.indexOf('for (const run of payload.runs');
    const symbolsAt = BUILDERS.indexOf('for (const s of payload.symbols');
    expect(runsAt).toBeGreaterThan(-1);
    expect(symbolsAt).toBeGreaterThan(-1);
    expect(runsAt, 'runs must be drawn before symbols').toBeLessThan(symbolsAt);
  });

  it('symbols carry a stable id, so a run can reference which ones it connects', () => {
    expect(CANVAS).toMatch(/export function newSymbolId/);
    expect(CANVAS, 'legacy symbols must be backfilled with ids on load').toMatch(/export function ensureSymbolIds/);
    // Index-keyed rendering is what made identity unstable in the first place.
    expect(CANVAS, 'symbols are still keyed by array index').not.toMatch(/key=\{idx\}\s*\n\s*symbol=/);
  });

  it('every placeable symbol type is accepted by the agent tool schema', () => {
    const toolSymbols = arrayMembers(SHEET_TOOL, 'symbols: z\\.array\\(z\\.object\\(\\{\\s*type: z\\.enum\\(');
    const allDefs = [...CANVAS.matchAll(/type:\s*'([a-z_0-9]+)'/g)].map((m) => m[1]);
    const missing = allDefs.filter((t) => !toolSymbols.includes(t));
    expect(missing, 'symbols the canvas offers but the agent cannot place').toEqual([]);
  });
});
