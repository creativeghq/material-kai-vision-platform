/**
 * The drawing register — its vocabularies, and the rules the scanner must not break.
 *
 * The vocabulary half exists because `scan-drawing-title-block` snaps a model's free text onto the
 * same lists the register's pickers offer. A model asked for an issue status answers
 * "FOR CONSTRUCTION", "Construction Issue" and "Issued for Construction" for one thing, and a
 * register that stores all three cannot be filtered — so `snapToVocabulary` is the join, and it
 * has to be right in both directions: it must place the obvious variants, and it must refuse to
 * place something it does not recognise rather than guessing.
 *
 * The scanner half guards the two rules that are invisible when broken: a defaulted issue date
 * shows a late drawing as on time, and a scanner that writes turns a whole drawing set into
 * register rows nobody checked.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  DOCUMENT_KINDS, DRAWING_PURPOSES, DISCIPLINES, BUILDABLE_PURPOSES,
  isDocumentKind, isDrawingPurpose, snapToVocabulary,
} from '@/modules/projects/drawingVocabulary';

const ROOT = process.cwd();
const EDGE = readFileSync(
  resolve(ROOT, 'supabase/functions/scan-drawing-title-block/index.ts'), 'utf8',
);

describe('drawing vocabularies', () => {
  it('accepts its own members and rejects a plausible near-miss', () => {
    expect(isDocumentKind('drawing')).toBe(true);
    expect(isDocumentKind('blueprint')).toBe(false);
    expect(isDrawingPurpose('for_construction')).toBe(true);
    expect(isDrawingPurpose('construction')).toBe(false);
  });

  it('marks only the two purposes somebody may build from', () => {
    expect([...BUILDABLE_PURPOSES].sort()).toEqual(['as_built', 'for_construction']);
    for (const p of BUILDABLE_PURPOSES) expect(DRAWING_PURPOSES).toContain(p);
  });

  it('snaps the spellings a title block actually uses', () => {
    expect(snapToVocabulary('FOR CONSTRUCTION', DRAWING_PURPOSES)).toBe('for_construction');
    expect(snapToVocabulary('Issued for Construction', DRAWING_PURPOSES)).toBe('for_construction');
    expect(snapToVocabulary('for-tender', DRAWING_PURPOSES)).toBe('for_tender');
    expect(snapToVocabulary('As Built', DRAWING_PURPOSES)).toBe('as_built');
    expect(snapToVocabulary('STRUCTURAL', DISCIPLINES)).toBe('structural');
    expect(snapToVocabulary('Structural Engineering', DISCIPLINES)).toBe('structural');
  });

  /**
   * The important half. An unrecognised value must come back null so the edge function can report
   * it as unmapped — defaulting to `other` would quietly discard what the sheet printed, and the
   * operator would see a blank that looks like a title block which omitted the field.
   */
  it('returns null rather than guessing', () => {
    expect(snapToVocabulary('Geotechnical', DISCIPLINES)).toBeNull();
    expect(snapToVocabulary('Stage 3 Coordination', DRAWING_PURPOSES)).toBeNull();
    expect(snapToVocabulary('', DISCIPLINES)).toBeNull();
    expect(snapToVocabulary(null, DISCIPLINES)).toBeNull();
    expect(snapToVocabulary(42, DISCIPLINES)).toBeNull();
  });

  it('refuses a fragment too short to mean anything', () => {
    // Without the floor, a title block reading just "FOR" lands on `for_information` purely
    // because it sorts first — a confidently wrong issue status, which is the one field that
    // decides whether somebody may build from the sheet.
    expect(snapToVocabulary('FOR', DRAWING_PURPOSES)).toBeNull();
    expect(snapToVocabulary('AS', DRAWING_PURPOSES)).toBeNull();
  });

  it('resolves a combined discipline deterministically rather than dropping it', () => {
    // M&E sheets are common enough that pushing them into the unmapped bucket on every set would
    // be worse than picking the first member. Pinned so a change here is deliberate.
    expect(snapToVocabulary('Mechanical & Electrical', DISCIPLINES)).toBe('mechanical');
  });

  it('never maps one purpose onto another by substring', () => {
    // `for_information` and `for_tender` share the `for_` prefix; a sloppy contains() check that
    // matched on the prefix would file every tender issue as information.
    expect(snapToVocabulary('for_information', DRAWING_PURPOSES)).toBe('for_information');
    expect(snapToVocabulary('for_tender', DRAWING_PURPOSES)).toBe('for_tender');
  });
});

describe('the title-block scanner', () => {
  it('forces the tool rather than parsing free-form JSON', () => {
    // Invariant 9: a reader whose output prefills a register entry must call the tool.
    expect(EDGE).toContain('tool_choice');
    expect(EDGE).toMatch(/tool_choice:\s*\{\s*type:\s*'tool'/);
    expect(EDGE).not.toMatch(/JSON\.parse\(.*content/);
  });

  it('debits before the model call, through the helper whose result cannot be dropped', () => {
    const debitAt = EDGE.indexOf('debitOrRefuse');
    const callAt = EDGE.indexOf('callClaudeMessages');
    expect(debitAt).toBeGreaterThan(-1);
    expect(callAt).toBeGreaterThan(-1);
    // Order is the assertion: a debit after the call is not a debit, it is a log line.
    expect(debitAt).toBeLessThan(callAt);
  });

  it('derives the workspace from the project row, never from the body', () => {
    // Invariant 1. A body-supplied workspace_id checked against the caller would still let
    // somebody scan against a project they do not own by naming a workspace they do.
    expect(EDGE).toMatch(/from\('projects'\)[\s\S]{0,120}workspace_id/);
    expect(EDGE).toContain('userCanAccessWorkspace');
    expect(EDGE).not.toMatch(/const\s*\{[^}]*workspace_id[^}]*\}\s*=\s*body/);
  });

  it('loads its prompt from the database with no code fallback', () => {
    expect(EDGE).toContain("loadPrompt(admin, 'extraction', 'drawing_title_block')");
    // A `||` or `??` beside the prompt would be exactly the invisible fallback the rule bans.
    expect(EDGE).not.toMatch(/loadPrompt\([^)]*\)\s*(\|\||\?\?)/);
  });

  it('never defaults the issue date', () => {
    // Invariant 1b: a drawing stamped with today because nobody could read it shows as issued on
    // time. `safeISODate` returns null and the header says so.
    expect(EDGE).toContain('safeISODate');
    expect(EDGE).not.toContain('todayLocalISO');
    expect(EDGE).not.toMatch(/issued_at[^\n]*new Date\(\)/);
  });

  it('writes nothing — it prefills and returns', () => {
    // A scanner that also created register entries would file a whole drawing set off a model's
    // reading, and a wrong drawing number is invisible until somebody builds from the wrong sheet.
    expect(EDGE).not.toMatch(/\.insert\(/);
    expect(EDGE).not.toMatch(/\.upsert\(/);
    expect(EDGE).not.toMatch(/from\('project_documents'\)/);
  });

  it('snaps the two controlled fields and reports what it could not place', () => {
    expect(EDGE).toContain('snapToVocabulary(raw.discipline, DISCIPLINES)');
    expect(EDGE).toContain('snapToVocabulary(raw.purpose, DRAWING_PURPOSES)');
    expect(EDGE).toContain('unmapped');
  });

  it('reads the vocabularies from the generated mirror, not a second copy', () => {
    expect(EDGE).toContain("from '../_shared/drawingVocabulary.generated.ts'");
    // A local re-declaration is how the offered list and the snapped-to list start to differ.
    expect(EDGE).not.toMatch(/const\s+(DISCIPLINES|DRAWING_PURPOSES)\s*=/);
  });
});

describe('the register UI', () => {
  const TAB = readFileSync(
    resolve(ROOT, 'src/modules/projects/components/tabs/DocumentsTab.tsx'), 'utf8',
  );

  it('offers exactly the vocabularies, never a hand-written list', () => {
    expect(TAB).toContain('DOCUMENT_KINDS.map');
    expect(TAB).toContain('DISCIPLINES.map');
    expect(TAB).toContain('DRAWING_PURPOSES.map');
    for (const literal of ['For Construction', 'As Built', 'Architectural']) {
      expect(TAB).not.toContain(`value="${literal}"`);
    }
  });

  it('separates the issue date from the upload date', () => {
    // `created_at` is when the file reached us; `issued_at` is what the sheet says. A register
    // that shows only the first cannot tell you a drawing arrived eight days late.
    expect(TAB).toContain('r.issued_at ?? r.created_at');
  });

  it('says when a current revision is not one you may build from', () => {
    expect(TAB).toContain('BUILDABLE_PURPOSES.includes');
  });
});
