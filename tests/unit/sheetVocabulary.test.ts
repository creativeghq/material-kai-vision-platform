import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  SHEET_TYPES, SHEET_STATUSES, isSheetType, isSheetStatus,
} from '@/services/moodboards/sheetVocabulary';

/**
 * `SheetType` exists ONCE, and equals the `moodboard_sheet_type` enum (#391).
 *
 * Twelve values, declared in SIX files — the largest duplication in the sweep by
 * copies × values. `presentation-sheet-tool.ts` carried a comment recording that its copy
 * had ALREADY drifted against the tool's own schema once, which is the argument for
 * removing the copies rather than adding another test that compares them.
 *
 * WHY THE PIN IS THE ENUM'S OWN OUTPUT
 * -------------------------------------
 * #391 names the failure mode: a previous guard for this shape "carried its own fourth
 * copy of the list, hand-edited in the same commit as the other three". So the expected
 * values below are `pg_enum` output quoted verbatim, in `enumsortorder`, rather than a
 * tidy array somebody would edit alongside a dropdown.
 */

const ROOT = join(__dirname, '..', '..');

/** `select string_agg(quote_literal(enumlabel), ', ' order by enumsortorder)` on
 *  `moodboard_sheet_type`, 2026-08-27. Verbatim: it is evidence, not a list. */
const MOODBOARD_SHEET_TYPE_ENUM =
  "'material_board', 'color_palette', 'concept_board', 'lighting_plan', 'annotated_render', " +
  "'elevation_render_pair', 'ffe_schedule', 'full_deck', 'area_breakdown', 'plumbing_plan', " +
  "'electrical_plan', 'scope_of_works'";

function labels(agg: string): string[] {
  return [...agg.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe('#391 — the sheet vocabulary matches its Postgres enum', () => {
  it('holds exactly the enum members', () => {
    expect([...SHEET_TYPES].sort()).toEqual(labels(MOODBOARD_SHEET_TYPE_ENUM).sort());
  });

  it('preserves the enum ORDER, not an alphabetical or display order', () => {
    // Kept so the array can be compared to the database directly. A consumer wanting a
    // different order sorts its own copy at the point of display — reordering here would
    // make the next comparison against pg_enum look like a drift.
    expect([...SHEET_TYPES]).toEqual(labels(MOODBOARD_SHEET_TYPE_ENUM));
  });

  it('the label extractor actually reads something', () => {
    // A parser returning [] would make the cases above pass by comparing nothing to
    // nothing — the quiet way a guard stops guarding.
    expect(labels(MOODBOARD_SHEET_TYPE_ENUM)).toHaveLength(12);
    expect(labels('')).toEqual([]);
  });

  it('the guards accept members and reject near-misses', () => {
    for (const t of SHEET_TYPES) expect(isSheetType(t)).toBe(true);
    for (const s of SHEET_STATUSES) expect(isSheetStatus(s)).toBe(true);
    expect(isSheetType('materials_board')).toBe(false);
    expect(isSheetType('')).toBe(false);
    expect(isSheetStatus(null)).toBe(false);
  });
});

describe('#391 — no file re-declares the sheet vocabulary', () => {
  const SOURCE = 'src/services/moodboards/sheetVocabulary.ts';
  const MIRROR = 'supabase/functions/_shared/sheetVocabulary.generated.ts';
  const GENERATED_PROJECTION = 'src/components/features/ai/toolManifest.generated.ts';

  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e === 'node_modules') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it('the twelve values appear in the source and its mirror only', () => {
    // Matched on a RUN of the values rather than a variable name — renaming the constant
    // is exactly how a copy hides. Four consecutive members is enough to be unambiguous
    // and short enough to catch a partial copy, which is the shape that drifts.
    const probe = SHEET_TYPES.slice(0, 4).map((v) => `'${v}'`).join('\\s*,\\s*');
    const asUnion = SHEET_TYPES.slice(0, 4).map((v) => `'${v}'`).join("\\s*\\|\\s*");
    const offenders: string[] = [];

    for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions'))]) {
      const rel = file.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
      if (rel === SOURCE || rel === MIRROR || rel === GENERATED_PROJECTION) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      if (new RegExp(probe).test(src) || new RegExp(asUnion).test(src)) offenders.push(rel);
    }

    expect(
      offenders,
      'these re-declare the sheet vocabulary:\n  ' + offenders.join('\n  ') +
        `\n\nImport from ${SOURCE} (same runtime) or ${MIRROR} (edge).`,
    ).toEqual([]);
  });

  it('the source stays import-free so the mirror can be a byte copy', () => {
    expect(
      /^\s*import\s/m.test(readFileSync(join(ROOT, SOURCE), 'utf8')),
      'sheetVocabulary.ts has grown an import — the generated mirror would fail to load ' +
        'on the edge side, where Deno resolves by URL.',
    ).toBe(false);
  });
});
