/** Guard (#492): the cited-instead page is scored only when a probe cited it, and every hop is SSRF-checked. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const handler = stripComments(readFileSync(join(ROOT, 'supabase', 'functions', 'seo-api', 'handlers', 'citability.ts'), 'utf8'));
const panel = stripComments(readFileSync(join(ROOT, 'src', 'components', 'core', 'Profile', 'WebsiteAiVisibilityPanel.tsx'), 'utf8'));

describe('cited-instead comparison', () => {
  it('refuses a rival URL no probe of this site cited, before fetching it', () => {
    const fn = handler.slice(handler.indexOf('async function scoreRival'));
    const check = fn.indexOf(".contains('cited_urls', [rivalUrl])");
    const fetchAt = fn.indexOf('readPage(rivalUrl)');
    expect(check).toBeGreaterThan(-1);
    expect(fetchAt).toBeGreaterThan(check);
    expect(fn.slice(0, fetchAt)).toMatch(/tracked_mentions\.website_id', websiteId/);
  });

  it('follows redirects by hand, re-checking every hop', () => {
    const fn = handler.slice(handler.indexOf('async function readPage'), handler.indexOf('async function scoreRival'));
    expect(fn).not.toMatch(/redirect:\s*'follow'/);
    expect(fn).toMatch(/redirect:\s*'manual'/);
    const loop = fn.indexOf('for (let hop');
    expect(loop).toBeGreaterThan(-1);
    expect(fn.indexOf('assertSafeUrl(next)')).toBeGreaterThan(loop);
  });

  it('records where a tracked question came from', () => {
    expect(panel).toMatch(/custom_probes: \[\.\.\.probes, \{ key: `\$\{source\}_/);
    expect(panel).toMatch(/source: form\.sources\[prompt\] \?\? 'manual'/);
  });
});
