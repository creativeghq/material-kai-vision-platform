/**
 * The markup viewer has to be openable, and the rules it depends on have to hold in the code that
 * calls it.
 *
 * The reachability half is here because I already made this exact mistake once in this feature
 * set: the tender workspace shipped as a screen that could render a comparison and could never be
 * filled, because four of its nine service methods had no caller. Nothing failed — the component
 * existed, it typechecked, and it was unreachable. A dialog nobody can open is the same defect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const DIALOG = stripComments(read('src/modules/projects/components/DrawingMarkupDialog.tsx'));
const REGISTER = stripComments(read('src/modules/projects/components/tabs/DocumentsTab.tsx'));
const SERVICE = stripComments(read('src/modules/projects/services/drawingMarkupsService.ts'));
const LIB = stripComments(read('src/modules/projects/lib/drawingMarkup.ts'));

describe('the viewer is reachable', () => {
  it('the drawings register imports it and renders it', () => {
    expect(REGISTER).toContain("from '../DrawingMarkupDialog'");
    expect(REGISTER).toContain('<DrawingMarkupDialog');
  });

  it('something actually opens it', () => {
    // A rendered `{markup && <Dialog/>}` with nothing ever setting `markup` is the unreachable
    // shape wearing a component's clothes.
    expect(REGISTER).toContain('openMarkup');
    expect(REGISTER).toMatch(/onClick=\{\(\) => void openMarkup\(/);
    expect(REGISTER).toContain('setMarkup({');
  });

  it('is offered on drawings, not on every document in the register', () => {
    // A cloud round a paragraph of a specification is a comment on a document, and the measuring
    // half of the viewer means nothing there.
    expect(REGISTER).toContain("d.kind === 'drawing'");
  });

  it('mints the signed URL at open time rather than storing one', () => {
    // Storage convention 7: a persisted signed URL is a link that works today and 404s in a week.
    expect(REGISTER).toContain('projectDocumentsService.downloadUrl(rev)');
    expect(REGISTER).not.toMatch(/file_url/);
  });

  it('every service method has a caller — no method the screen cannot reach', () => {
    // This is the tender-workspace failure exactly: five of nine methods called, four unreachable,
    // and nothing anywhere said so. Read from the SERVICE so a method added later is covered
    // without anybody remembering to extend a list here.
    const declared = [...SERVICE.matchAll(/^ {2}async (\w+)\(/gm)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(5);
    const uncalled = declared.filter((m) => !DIALOG.includes(`.${m}(`));
    expect(uncalled, `no caller in the viewer for: ${uncalled.join(', ')}`).toEqual([]);
  });
});

describe('coordinates are normalised, never pixels', () => {
  it('the dialog converts through the shared helpers rather than storing client coordinates', () => {
    expect(DIALOG).toContain('toNormalised(');
    // `clientX` raw into geometry is the bug: the same markup then lands somewhere else on the
    // sheet for anybody whose canvas is a different width.
    expect(DIALOG).not.toMatch(/points:\s*\[\s*\{\s*x:\s*e\.client/);
    expect(DIALOG).toContain('e.clientX - box.left');
  });

  it('the page aspect is stored with the markup so any render can redraw it', () => {
    expect(DIALOG).toContain('page_aspect: pageAspect');
    expect(SERVICE).toContain('page_aspect');
  });
});

describe('an uncalibrated sheet measures nothing', () => {
  it('the scale is set from a drawn line, never read off the title block', () => {
    expect(DIALOG).toContain('calibrationFactor(');
    // The title-block scanner exists and is deliberately not consulted here: a sheet printed
    // "1:50" survives being photocopied at 90%, and the drawing does not.
    expect(DIALOG).not.toMatch(/scanTitleBlock|title_block/);
  });

  it('a refused calibration is not stored as a factor', () => {
    // `calibrationFactor` returns null on a zero-length drag or a zero known length, and that null
    // has to STOP the write — a stored 0 or Infinity makes every measurement on the sheet nonsense
    // while the drawing still looks calibrated.
    expect(DIALOG).toMatch(/if \(f == null\)/);
    expect(DIALOG).toContain('That cannot set a scale');
  });

  it('a measure with no scale saves null, not zero', () => {
    expect(DIALOG).toContain('measured_value: measured');
    // The one-character version of this bug: `?? 0` turns "we never established this length" into
    // a quantity somebody orders.
    expect(DIALOG).not.toMatch(/measured_value:\s*measured\s*\?\?\s*0/);
    // And the helper it comes from must not coalesce either.
    expect(LIB).toMatch(/export function measuredLength\(/);
    expect(LIB).not.toMatch(/return\s+0;/);
  });

  it('says "not measured" on screen and in the export', () => {
    // The export is where an unmeasured length quietly becomes whatever the reader assumes.
    const occurrences = DIALOG.split('not measured').length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });
});

describe('a markup becomes an RFI exactly once', () => {
  it('goes through the RPC that creates and stamps together', () => {
    expect(SERVICE).toContain("rpc('raise_rfi_from_markup'");
    // A client-side insert into project_requests followed by an update of the markup is the
    // create-then-stamp pair — and here the first half mints a REGISTER NUMBER, so doing it twice
    // puts two numbered questions to the architect about one detail.
    expect(SERVICE).not.toMatch(/from\('project_requests'\)/);
    expect(SERVICE).not.toMatch(/update\(\s*\{[^}]*request_id/);
  });

  it('offers the button only while no RFI exists for that markup', () => {
    expect(DIALOG).toContain('!selectedMarkup.request_id');
    expect(DIALOG).toContain('RFI raised');
  });
});

describe('the export carries the markup', () => {
  it('composites onto a COPY of the page, not the live canvas', () => {
    // Painting onto the on-screen canvas would leave a second set of clouds behind after every
    // export, compounding each time.
    expect(DIALOG).toContain("document.createElement('canvas')");
    expect(DIALOG).toContain('ctx.drawImage(canvas, 0, 0)');
    expect(DIALOG).toContain('paintMarkups(ctx,');
  });

  it('renders the pdf.js worker from a real URL', () => {
    // Without a workerSrc, pdf.js parses on the main thread and locks the tab on a large A1 sheet.
    expect(DIALOG).toContain('GlobalWorkerOptions.workerSrc');
    expect(DIALOG).toContain("pdfjs-dist/build/pdf.worker.min.mjs?url");
  });

  it('names a render failure rather than showing an empty frame', () => {
    // A blank sheet reads as "this drawing has nothing on it", which is the wrong conclusion to
    // hand somebody standing on site.
    expect(DIALOG).toContain('setRenderError(');
    expect(DIALOG).toContain('This drawing could not be rendered.');
  });
});
