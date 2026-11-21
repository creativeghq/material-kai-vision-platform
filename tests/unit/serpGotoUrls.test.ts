import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { breadcrumbHost, isGotoUrl, normalizeGotoInPlace } from '../../supabase/functions/_shared/seo/serp-goto';
import { stripComments } from '../helpers/stripComments';

const GOTO = 'https://google.com/goto?url=CAESkQEBxCJF18Z88VtUEZ0iMhYjprYYiMrpWgJkKs';
const envelope = (items: unknown[]) => ({ tasks: [{ status_code: 20000, result: [{ items }] }] });

describe('Google GoTo passthrough URLs', () => {
  it('an unresolved result takes its real domain from the breadcrumb, never google.com', () => {
    const item: Record<string, unknown> = {
      type: 'organic', url: GOTO, domain: 'google.com', breadcrumb: 'https://www.panelinios.gr › category › attiki',
    };
    expect(normalizeGotoInPlace(envelope([item]))).toBe(1);
    expect(item).toMatchObject({ domain: 'www.panelinios.gr', url: null, goto_url: GOTO, url_unresolved: true });
  });

  it('no breadcrumb means an unknown domain, not google.com', () => {
    const item: Record<string, unknown> = { type: 'organic', url: GOTO, domain: 'google.com' };
    normalizeGotoInPlace(envelope([item]));
    expect(item.domain).toBeNull();
  });

  it('reaches AI Overview references', () => {
    const ref: Record<string, unknown> = { url: GOTO, domain: 'google.com', breadcrumb: 'https://materialshub.gr › blog' };
    normalizeGotoInPlace(envelope([{ type: 'ai_overview', references: [ref] }]));
    expect(ref.domain).toBe('materialshub.gr');
  });

  it('leaves real URLs and real Google pages alone', () => {
    const item = { type: 'organic', url: 'https://materiahub.gr/x', domain: 'materiahub.gr' };
    expect(normalizeGotoInPlace(envelope([item]))).toBe(0);
    expect(isGotoUrl('https://support.google.com/goto-guide')).toBe(false);
    expect(isGotoUrl('https://www.google.gr/goto?url=abc')).toBe(true);
    expect(breadcrumbHost('https://www.google.com › search')).toBeNull();
  });

  it('every direct SERP read in the edge client is normalized', () => {
    const src = stripComments(readFileSync('supabase/functions/_shared/dataforseo-client.ts', 'utf8'));
    expect(src).toMatch(/if \(endpoint\.startsWith\('\/serp\/'\)\) normalizeGotoInPlace\(json\)/);
  });

  it('the Python twin agrees on the URL shape', () => {
    const py = readFileSync('mivaa-pdf-extractor/app/services/integrations/dataforseo_goto.py', 'utf8');
    expect(py).toContain('google\\.[a-z.]+/goto\\?');
  });
});
