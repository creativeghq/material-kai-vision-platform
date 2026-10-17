/** The quote has ONE document: the server PDF. Preview and Download both show it (#470). */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const src = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const BUTTONS = 'src/modules/quotes/components/QuoteDownloadButtons.tsx';
const PREVIEW = 'src/modules/quotes/pages/QuotePreviewPage.tsx';
const SERVICE = 'src/modules/quotes/services/QuotePDFService.ts';
const RENDERER = 'supabase/functions/generate-quote-pdf/index.ts';
const PUBLIC_SHARE = 'supabase/functions/quote-public-share/index.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe('quote Download / Preview use the server PDF', () => {
  it('no quote module screenshots the page into a PDF', () => {
    const offenders = walk(join(ROOT, 'src/modules/quotes'))
      .filter((f) => /html2canvas|jspdf/i.test(stripComments(readFileSync(f, 'utf8'))))
      .map((f) => relative(ROOT, f).split('\\').join('/'));
    expect(offenders).toEqual([]);
  });

  it('Download saves the generate-quote-pdf output', () => {
    expect(src(BUTTONS)).toMatch(/quotePDFService\.savePDF\(/);
    expect(src(BUTTONS)).not.toMatch(/QuoteDocument|toDataURL|addImage/);
    const service = src(SERVICE);
    const save = service.slice(service.indexOf('async savePDF('));
    expect(save).toMatch(/this\.generatePDF\(quoteId\)/);
    expect(service).toMatch(/functions\.invoke\('generate-quote-pdf'/);
  });

  it('Preview embeds the same server PDF, not an HTML re-render', () => {
    const preview = src(PREVIEW);
    expect(preview).toMatch(/quotePDFService\.generatePDF\(/);
    expect(preview).toMatch(/<iframe[^>]*src=\{pdfUrl\}/);
    expect(preview).not.toMatch(/QuoteDocument|window\.print/);
  });

  it('the public share download asks the renderer instead of serving a stale stored file', () => {
    const share = src(PUBLIC_SHARE);
    expect(share).toMatch(/if \(event === 'download'\) \{\s*try \{\s*await fetch\(`\$\{SUPABASE_URL\}\/functions\/v1\/generate-quote-pdf`/);
    expect(share).not.toMatch(/regenerate:\s*true/);
  });
});

describe('generate-quote-pdf serves the quote to whoever may read it', () => {
  const fn = src(RENDERER);
  const quotePath = fn.slice(fn.indexOf("quoteId = body.quote_id"));

  it('authorises through RLS as the caller, so the quote customer is let in', () => {
    expect(quotePath).toMatch(/auth\.supabaseAsUser\.from\('quotes'\)\.select\('id'\)\.eq\('id', quoteId\)/);
    expect(quotePath).not.toMatch(/from\('workspace_members'\)/);
    expect(quotePath).toMatch(/error: 'Quote not found' \}, 404\)/);
  });

  it('only the seller may force a re-render', () => {
    expect(quotePath).toMatch(/const forceRender = body\.regenerate === true && isSeller;/);
  });

  it('a stored PDF is reused while the quote is unchanged, and the owner is notified only on change', () => {
    const cached = quotePath.indexOf('previousPath === storagePath');
    const emit = quotePath.indexOf("emitFlowEvent('quote_pdf_generated'");
    expect(cached).toBeGreaterThan(-1);
    expect(emit).toBeGreaterThan(cached);
    expect(quotePath.slice(emit - 120, emit)).toMatch(/if \(storagePath !== previousPath && ownerRow\.user_id\)/);
    expect(quotePath).toMatch(/quote-\$\{quoteData\.quote_number \|\| quoteId\}-\$\{fingerprint\}\.pdf/);
  });
});
