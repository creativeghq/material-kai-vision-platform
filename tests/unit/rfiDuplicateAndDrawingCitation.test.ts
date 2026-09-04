/**
 * "Has this already been asked?" and "which sheet is it about?"
 *
 * Two halves of the same job. An RFI register earns its keep by being the place a question is
 * asked ONCE and answered ONCE; the failure it exists to prevent is two people hitting the same
 * gap in the information a week apart, both writing to the architect, and the job ending up with
 * two answers that do not agree. Nothing about that failure looks wrong on screen — both entries
 * are valid, both were raised in good faith, and the register happily holds them side by side.
 *
 * The rules below are the ones that are silent when broken:
 *
 *  - The check is ADVISORY. A duplicate check that BLOCKS eventually suppresses a real question,
 *    and an unasked RFI costs a great deal more than a duplicate one.
 *  - It cannot cost the write. If the lookup throws, the person still gets to raise the request.
 *  - The citation points at a REVISION. Pointing at the document would silently re-aim every open
 *    RFI at whatever was issued since, with nobody having edited a thing.
 *  - A superseded citation is SAID. An answer given against a superseded sheet may be an answer
 *    about the wrong drawing, and the reader can only know that if the register says so.
 *  - The ranking rule lives in SQL, once. A threshold restated in TypeScript is a second opinion
 *    about what "similar" means, and the two drift.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const SERVICE_SRC = read('src/modules/projects/services/projectRequestsService.ts');
const TAB_SRC = read('src/modules/projects/components/tabs/RequestsTab.tsx');
const SERVICE = stripComments(SERVICE_SRC);
const TAB = stripComments(TAB_SRC);

describe('the duplicate check is advisory', () => {
  it('never throws — a failed lookup cannot stop somebody raising the question', () => {
    // The whole body of findSimilar, so the catch is proven to wrap the RPC rather than sitting
    // somewhere else in the file.
    const start = SERVICE.indexOf('async findSimilar(');
    expect(start).toBeGreaterThan(-1);
    const body = SERVICE.slice(start, SERVICE.indexOf('\n  },', start));
    expect(body).toContain('rpc(\'find_similar_project_requests\'');
    expect(body).toMatch(/catch\s*\{\s*return \[\];\s*\}/);
  });

  it('an empty title asks nothing at all', () => {
    const start = SERVICE.indexOf('async findSimilar(');
    const body = SERVICE.slice(start, SERVICE.indexOf('\n  },', start));
    expect(body).toContain("if (!title.trim()) return [];");
  });

  it('the panel cannot disable the save button', () => {
    // The failure this guards is a one-word change — `disabled={saving || similar.length > 0}` —
    // that turns an advisory panel into a block nobody can get past.
    const disabled = TAB.match(/disabled=\{[^}]*\}/g) ?? [];
    expect(disabled.length).toBeGreaterThan(0);
    for (const d of disabled) {
      expect(d).not.toContain('similar');
      expect(d).not.toContain('dismissed');
    }
  });

  it('offers a way past it, because the next question may be a different one', () => {
    expect(TAB).toContain('setDismissed(true)');
  });

  it('does not restate the similarity threshold in TypeScript', () => {
    // `find_similar_project_requests` decides what counts as similar. A number here would be a
    // second opinion, and the offer and any later report would stop agreeing.
    expect(SERVICE).not.toMatch(/score\s*[<>]=?\s*0\./);
    expect(TAB).not.toMatch(/\.score\s*[<>]=?\s*0\./);
  });

  it('waits for enough of a title to mean something, and debounces', () => {
    // Ranking against two characters returns five unrelated hits, which teaches people to ignore
    // the panel — the one outcome that makes the whole feature worthless.
    expect(TAB).toContain('q.length < 6');
    expect(TAB).toContain('setTimeout(');
    expect(TAB).toContain('clearTimeout(t)');
  });
});

describe('the drawing citation', () => {
  it('names a revision, not a document', () => {
    expect(SERVICE).toContain('drawing_revision_id');
    // The picker's values are revision ids: every option is rendered from a document's revisions.
    expect(TAB).toContain('(d.revisions || []).map((rev) => (');
    expect(TAB).toContain('<option key={rev.id} value={rev.id}>');
  });

  it('offers superseded issues too — the sheet on site is regularly not the latest', () => {
    const start = TAB.indexOf('(d.revisions || []).map((rev) => (');
    const options = TAB.slice(start, start + 400);
    // A filter to current-only would quietly make it impossible to cite the drawing somebody is
    // actually holding, which is the case that produces the RFI in the first place.
    expect(options).not.toContain('is_current)');
    expect(options).toContain('rev.is_current ?');
  });

  it('says so when the cited issue has been superseded since', () => {
    expect(SERVICE).toContain('is_current: boolean');
    expect(TAB).toContain('!r.drawing.is_current');
    expect(TAB).toContain('superseded since');
  });

  it('the superseded warning is a light/dark pair, not one set of classes', () => {
    // `text-amber-400` alone is pale by design and measures ~1.2:1 on the light themes' cream.
    const warnings = TAB.match(/text-amber-\d00[^"']*/g) ?? [];
    expect(warnings.length).toBeGreaterThan(0);
    for (const w of warnings) expect(w).toContain('dark:text-amber-');
  });

  it('reads the sheet with the request, not once per row', () => {
    expect(SERVICE).toContain('drawing:project_document_revisions(');
    expect(SERVICE).toContain('document:project_documents(drawing_number, title)');
  });

  it('the picker is hidden when the register has no drawings', () => {
    // An empty picker is a control that teaches people it does nothing.
    expect(TAB).toContain('docs.length > 0 &&');
  });
});
