import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { CITABILITY_DIMENSIONS } from '@/components/core/Profile/seo/citabilityDimensions';
import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const SCORER = join(ROOT, 'supabase/functions/_shared/seo/citability.ts');
const HANDLER = join(ROOT, 'supabase/functions/seo-api/handlers/citability.ts');
const src = (p: string) => readFileSync(p, 'utf8');

const PAGE = `<html><head>
<script type="application/ld+json">{"@type":"FAQPage"}</script></head><body>
<h1>Porcelain tiles for bathrooms</h1>
<p>The best porcelain tiles for a bathroom are rectified 60x60 cm slabs with an R10 slip rating,
laid on a 3 mm adhesive bed. We stock 240 designs in Thessaloniki with 48 hours lead time.</p>
<h2>Which porcelain tiles suit a bathroom?</h2>
<table><tr><td>R10</td><td>60x60 cm</td></tr></table>
<p>Tested to <a href="https://www.iso.org/standard/1234.html">ISO 10545</a> and
<a href="https://example.com/datasheet.pdf">the datasheet</a>.
See also <a href="/tiles">our range</a>.</p>
<p>By Maria Papadopoulou, technical lead. <time datetime="2026-08-01">1 Aug 2026</time></p>
</body></html>`;

describe('citability dimensions', () => {
  it('every dimension states what it costs and how to fix it', () => {
    expect(CITABILITY_DIMENSIONS.length).toBeGreaterThanOrEqual(6);
    for (const d of CITABILITY_DIMENSIONS) {
      expect(d.key).toMatch(/^[a-z_]+$/);
      expect(d.label.length).toBeGreaterThan(3);
      expect(d.why.length).toBeGreaterThan(20);
      expect(d.fix.length).toBeGreaterThan(20);
      expect(d.weight).toBeGreaterThan(0);
    }
  });

  it('keys are unique — a duplicate silently overwrites a score', () => {
    const keys = CITABILITY_DIMENSIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('a page nobody has read is not a page that failed', () => {
  it('the scorer returns not_collected with a null score, never 0', () => {
    const s = src(SCORER);
    expect(s).toMatch(/status: 'not_collected',\s*\n\s*score: null,/);
    // The stub branch is the ONLY one allowed to score 0, and it says why.
    expect(s).toContain("status: 'no_data'");
    expect(s).toContain('is a stub, not a weak page');
  });

  it('a failed fetch is persisted as not_collected, not as a zero score', () => {
    const h = src(HANDLER);
    expect(h).toContain('A fetch that FAILED is not a page that scored zero');
    expect(h).toMatch(/score: null, status: 'not_collected'/);
  });

  it('the handler refuses a URL through the SSRF guard before fetching it', () => {
    const h = src(HANDLER);
    expect(h).toContain('assertSafeUrl');
    expect(h.indexOf('assertSafeUrl')).toBeLessThan(h.indexOf('await fetch('));
  });

  it('tenancy comes from the verified JWT and a miss returns 404, not 403', () => {
    const h = src(HANDLER);
    expect(h).toContain('userCanAccessWorkspace(db, auth.userId, site.workspace_id)');
    expect(h).toMatch(/error: 'Not found' \}, 404/);
    expect(h).toContain("authenticate(req, { requireUser: true })");
  });

  it('the page match does not silently restrict itself to embedded pages', () => {
    // Blanked: a guard that reads prose passes on a mention of the term.
    const code = blankComments(src(HANDLER));
    expect(code).not.toMatch(/\bembedding\b/);
    expect(code).toContain('pickPage');
  });
});

describe('the mirror is the same list on both sides', () => {
  it('the generated Deno copy matches the src source', () => {
    const source = src(join(ROOT, 'src/components/core/Profile/seo/citabilityDimensions.ts'));
    const mirror = src(join(ROOT, 'supabase/functions/_shared/seo/citabilityDimensions.generated.ts'));
    for (const d of CITABILITY_DIMENSIONS) {
      expect(source).toContain(`key: '${d.key}'`);
      expect(mirror).toContain(`key: '${d.key}'`);
    }
  });

  it('the scorer imports the mirror rather than declaring its own list', () => {
    const s = src(SCORER);
    expect(s).toContain("from './citabilityDimensions.generated.ts'");
    expect(s).not.toMatch(/export const CITABILITY_DIMENSIONS[^=]*=\s*\[/);
  });
});

describe('the scorer measures the page it was given', () => {
  it('a well-shaped page scores every dimension it satisfies', async () => {
    const mod: any = await import(
      /* @vite-ignore */ '../../supabase/functions/_shared/seo/citability.ts'
    );
    const r = mod.scoreCitability({ html: PAGE, question: 'Which porcelain tiles suit a bathroom?' });
    expect(r.status).toBe('ok');
    const by = Object.fromEntries(r.dimensions.map((d: any) => [d.key, d.score]));
    expect(by.faq_block).toBe(100);
    expect(by.comparison).toBe(100);
    expect(by.author_trust).toBe(100);
    expect(by.question_heading).toBeGreaterThan(50);
    expect(by.entity_facts).toBeGreaterThan(0);
    expect(by.sources_cited).toBeGreaterThan(0);
    expect(r.score).toBeGreaterThan(50);
  });

  it('an unread page yields null, and a stub yields 0 with a reason', async () => {
    const mod: any = await import(
      /* @vite-ignore */ '../../supabase/functions/_shared/seo/citability.ts'
    );
    const unread = mod.scoreCitability({ html: null, question: 'x' });
    expect(unread.status).toBe('not_collected');
    expect(unread.score).toBeNull();

    const stub = mod.scoreCitability({ html: '<html><body><p>Hello.</p></body></html>', question: 'x' });
    expect(stub.status).toBe('no_data');
    expect(stub.score).toBe(0);
    expect(stub.note).toContain('stub');
  });

  it('gaps are the dimensions worth fixing, worst first', async () => {
    const mod: any = await import(
      /* @vite-ignore */ '../../supabase/functions/_shared/seo/citability.ts'
    );
    const bare = `<html><body><h1>Tiles</h1><p>${'We sell very nice tiles for your home. '.repeat(12)}</p></body></html>`;
    const r = mod.scoreCitability({ html: bare, question: 'Which porcelain tiles suit a bathroom?' });
    expect(r.status).toBe('ok');
    expect(r.gaps).toContain('faq_block');
    expect(r.gaps).toContain('comparison');
    expect(r.score).toBeLessThan(40);
  });
});
