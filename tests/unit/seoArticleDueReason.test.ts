import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';
import { dueReasonText } from '@/services/seo/dueReason';

const ROOT = join(__dirname, '..', '..');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.endsWith('.generated.ts')) out.push(p);
  }
  return out;
}

const FILES = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase', 'functions'))]
  .map((p) => ({ rel: relative(ROOT, p).replace(/\\/g, '/'), code: blankComments(readFileSync(p, 'utf8')) }));

describe('#401 W1.1 — why an article is due is derived in SQL, once', () => {
  it('every screen that shows is_due also reads why', () => {
    const readers = FILES.filter((f) => f.rel.startsWith('src/') && /from\('seo_article_freshness'/.test(f.code) && /is_due/.test(f.code));
    expect(readers.length).toBeGreaterThan(0);
    const missing = readers.filter((f) => !/due_reason/.test(f.code) && !/select\('\*'\)/.test(f.code)).map((f) => f.rel);
    expect(missing).toEqual([]);
  });

  it('nothing in TypeScript decides due-ness by comparing the due date to now', () => {
    const offenders = FILES
      .filter((f) => /refresh_due_at\)?\s*(<=|>=|<|>)\s*(new Date|Date\.now|now\b)/.test(f.code)
        || /(new Date\(\)|Date\.now\(\))\s*(<=|>=|<|>)\s*[\w.]*refresh_due_at/.test(f.code))
      .map((f) => f.rel);
    expect(offenders).toEqual([]);
  });

  it('names every reason the view can return', () => {
    const base = { age_days: 120, refresh_interval_days: 90, main_query: 'tiles', position_now: 14, position_prev: 6, clicks_now: 3, clicks_prev: 20 };
    expect(dueReasonText({ ...base, due_reason: 'position_drop' })).toContain('from position 6 to 14');
    expect(dueReasonText({ ...base, due_reason: 'clicks_drop' })).toContain('from 20 to 3');
    expect(dueReasonText({ ...base, due_reason: 'not_indexed' })).toContain('indexed');
    expect(dueReasonText({ ...base, due_reason: 'age' })).toContain('120 days old');
    expect(dueReasonText({ ...base, due_reason: 'position_drop', position_now: null })).toContain('Dropped out');
  });
});
