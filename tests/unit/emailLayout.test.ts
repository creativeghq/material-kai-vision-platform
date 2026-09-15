import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  wrapInLayout,
  renderLayout,
  isFullDocument,
  htmlToPlainText,
  layoutHasContentSlot,
  DEFAULT_LAYOUT_HTML,
  LAYOUT_PREVIEW_SAMPLE,
  LayoutHasNoContentSlot,
} from '../../supabase/functions/_shared/email-layout.ts';

const ROOT = resolve(__dirname, '../..');
const read = (p: string) => readFileSync(resolve(ROOT, p), 'utf8');

const BRAND = {
  brandName: 'Materials Hub',
  brandUrl: 'https://app.materialshub.gr',
  logoUrl: '',
  senderName: 'Materials Hub',
  senderEmail: 'find@mail.materialshub.gr',
  footerNote: 'Some Street 1, Thessaloniki',
};

const wrap = (content: string, over: Partial<Parameters<typeof wrapInLayout>[1]> = {}) =>
  wrapInLayout(content, { kind: 'operator', brand: BRAND, ...over });

describe('email layout — the shell', () => {
  it('is a complete, single document once wrapped', () => {
    const { html, source } = wrap('<p>Hello</p>');
    expect(source).toBe('default');
    expect(html.match(/<!doctype/gi)?.length).toBe(1);
    expect(html.match(/<html\b/gi)?.length).toBe(1);
    expect(html).toContain('<p>Hello</p>');
  });

  it('injects the body raw and every other slot escaped', () => {
    const { html } = wrap('<p>Keep <strong>my</strong> markup</p>', {
      brand: { ...BRAND, brandName: 'Tiles & <Stone>' },
    });
    expect(html).toContain('<strong>my</strong>');
    expect(html).toContain('Tiles &amp; &lt;Stone&gt;');
    expect(html).not.toContain('Tiles & <Stone>');
  });

  it('does not re-substitute a token that appears in the body', () => {
    // A campaign body can carry an unresolved {{firstName}}; a second pass would blank it.
    const { html } = wrap('<p>Hi {{firstName}} — {{content}} is literal here.</p>');
    expect(html).toContain('Hi {{firstName}}');
    expect(html).toContain('{{content}} is literal here.');
  });

  it('refuses a layout with no {{content}} slot rather than sending an empty body', () => {
    expect(() => wrap('<p>Body</p>', { layoutHtml: '<html><body>branding only</body></html>' }))
      .toThrow(LayoutHasNoContentSlot);
    expect(layoutHasContentSlot(DEFAULT_LAYOUT_HTML)).toBe(true);
  });

  it('never double-wraps a body that is already a document, and says so', () => {
    const doc = '<!DOCTYPE html><html><body><p>Already complete</p></body></html>';
    const { html, source } = wrap(doc);
    expect(source).toBe('skipped_full_document');
    expect(html).toBe(doc);
    expect(isFullDocument('<p>fragment</p>')).toBe(false);
    expect(isFullDocument('  <html lang="en">')).toBe(true);
  });

  it('reports an empty body as wrapped by nothing', () => {
    expect(wrap('').source).toBe('none');
    expect(wrap('   ').source).toBe('none');
  });
});

describe('email layout — whose brand', () => {
  it('a tenant sending from its own domain never inherits the operator shell', () => {
    // Same rule as the Resend key (#357 AE-1).
    const operatorShell = '<html><body>OPERATOR CHROME {{content}}</body></html>';
    const tenant = wrapInLayout('<p>Invoice attached</p>', {
      kind: 'workspace',
      brand: { ...BRAND, brandName: 'Keros Hellas' },
      layoutHtml: null,
    });
    expect(tenant.source).toBe('default');
    expect(tenant.html).not.toContain('OPERATOR CHROME');
    expect(tenant.html).toContain('Keros Hellas');

    const own = wrapInLayout('<p>Invoice attached</p>', {
      kind: 'workspace',
      brand: BRAND,
      layoutHtml: operatorShell,
    });
    expect(own.source).toBe('workspace_custom');
  });

  it('only an operator send carries the platform colophon', () => {
    // Assert on the rendered ELEMENT, not the class name: the stylesheet is shared, so
    // `mk-colophon` appears in both and a looser check would pass with the line printed.
    const op = wrap('<p>x</p>').html;
    const ws = wrapInLayout('<p>x</p>', { kind: 'workspace', brand: BRAND }).html;
    expect(op).toContain('class="mk-colophon"');
    expect(ws).not.toContain('class="mk-colophon"');
  });

  it('marks a custom operator layout as custom', () => {
    expect(wrap('<p>x</p>', { layoutHtml: '<html><body>{{content}}</body></html>' }).source)
      .toBe('operator_custom');
  });
});

describe('email layout — compliance slots', () => {
  it('shows an opt-out only when one was minted', () => {
    expect(wrap('<p>x</p>').html).not.toContain('Unsubscribe');
    const marketing = wrap('<p>x</p>', { unsubscribeUrl: 'https://app.materialshub.gr/u/tok' }).html;
    expect(marketing).toContain('Unsubscribe');
    expect(marketing).toContain('https://app.materialshub.gr/u/tok');
  });

  it('puts the preheader inside <body>, before the visible content', () => {
    const { html } = wrap('<p>Visible</p>', { preheader: 'The inbox preview line' });
    const bodyAt = html.indexOf('<body');
    const preAt = html.indexOf('The inbox preview line');
    const contentAt = html.indexOf('<p>Visible</p>');
    // Prepended, it landed before <!doctype> — invalid, and silently dropped by clients.
    expect(preAt).toBeGreaterThan(bodyAt);
    expect(preAt).toBeLessThan(contentAt);
  });

  it('escapes a preheader so it cannot inject markup', () => {
    const { html } = wrap('<p>x</p>', { preheader: '</div><script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('drops a slot nothing supplied rather than leaving the token in the mail', () => {
    expect(renderLayout('a{{content}}b{{nope}}c', { content: 'X' })).toBe('aXbc');
  });
});

describe('email layout — the plain-text alternative', () => {
  it('never leaks the shell CSS into the text part', () => {
    const wrapped = wrap('<p>Hello there</p>').html;
    const text = htmlToPlainText(wrapped);
    expect(text).not.toContain('mk-content');
    expect(text).not.toContain('prefers-color-scheme');
    expect(text).toContain('Hello there');
  });

  it('keeps paragraph and list structure readable', () => {
    const text = htmlToPlainText('<p>One</p><p>Two</p><ul><li>A</li><li>B</li></ul>');
    expect(text).toBe('One\n\nTwo\n\n• A\n\n• B');
  });

  it('decodes entities the body carries', () => {
    expect(htmlToPlainText('<p>Tiles &amp; Stone &euro;10</p>')).toContain('Tiles & Stone');
  });
});

describe('email layout — one source, applied at the send chokepoint', () => {
  const layoutSrc = read('supabase/functions/_shared/email-layout.ts');
  const apiSrc = read('supabase/functions/email-api/index.ts');
  const senderSrc = read('supabase/functions/_shared/email-sender.ts');

  it('is declared exactly once in the repo', () => {
    const copies = ['src', 'supabase/functions', 'api']
      .flatMap(dir => grepFiles(dir))
      .filter(f => !f.endsWith('email-layout.ts') && !f.includes('tests'))
      .filter(f => read(f).includes('mk-content'));
    expect(copies).toEqual([]);
  });

  it('wraps inside email-api, not at the 22 call sites', () => {
    expect(apiSrc).toContain('wrapInLayout(');
    expect(apiSrc.match(/wrapInLayout\(/g)?.length).toBe(2); // the send + the operator preview
  });

  it('wraps every send, not only the template path', () => {
    // 112 of the last 113 sends carried raw HTML and no template.
    const wrapAt = apiSrc.indexOf('wrapInLayout(');
    const templateAt = apiSrc.indexOf('if (body.templateSlug)');
    expect(templateAt).toBeGreaterThan(-1);
    expect(wrapAt).toBeGreaterThan(templateAt);
  });

  it('derives the text alternative BEFORE the shell goes on', () => {
    // Run over the wrapped document, the <style> block lands in the recipient's text part.
    const textAt = apiSrc.indexOf('htmlToPlainText(htmlBody)');
    const wrapAt = apiSrc.indexOf('wrapInLayout(');
    expect(textAt).toBeGreaterThan(-1);
    expect(textAt).toBeLessThan(wrapAt);
  });

  it('records which shell dressed each send', () => {
    expect(apiSrc).toContain('layout_source: layoutSource');
  });

  it('resolves the layout with the sender identity, so it cannot be fetched per call site', () => {
    expect(senderSrc).toContain('layoutHtml');
    expect(senderSrc).toContain('brand');
    // The tenant branch must not read the operator's email_settings layout.
    const unconfigured = senderSrc.indexOf("source: 'unconfigured'");
    expect(unconfigured).toBeGreaterThan(-1);
  });
});

describe('email layout — the specimen', () => {
  it('exercises every element the shell styles', () => {
    for (const tag of ['<h1>', '<h2>', '<p>', '<ul>', '<li>', '<table', '<th>', '<td>', '<blockquote>', '<hr>', '<code>', 'mk-btn']) {
      expect(LAYOUT_PREVIEW_SAMPLE).toContain(tag);
    }
  });

  it('is a fragment, so the preview goes through the same wrap a real send does', () => {
    expect(isFullDocument(LAYOUT_PREVIEW_SAMPLE)).toBe(false);
  });
});

function grepFiles(dir: string): string[] {
  const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
  const out: string[] = [];
  const walk = (d: string) => {
    let entries: string[];
    try { entries = readdirSync(resolve(ROOT, d)); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.git' || e === 'dist') continue;
      const rel = `${d}/${e}`;
      const st = statSync(resolve(ROOT, rel));
      if (st.isDirectory()) walk(rel);
      else if (/\.(ts|tsx|js|jsx)$/.test(e)) out.push(rel);
    }
  };
  walk(dir);
  return out;
}
