/**
 * An upstream error must reach the agent as words, not as `[object Object]`.
 *
 * Nine tool files each carried `String(parsed).slice(0, 200)`, where `parsed` is the JSON-PARSED
 * response body. `String({ error: 'Thread not found' })` is the literal string `[object Object]`,
 * and that was the whole error the agent got — no status, no message, nothing to act on, and
 * every failure identical to every other failure.
 *
 * The 2026-08-26 tool sweep found it live on seven tools at once: manage_inbox, manage_contracts,
 * manage_job_sites, list_my_job_searches, get_price_summary, seo_domain_intersection and
 * seo_onpage_issues. It had never been reported because those tools had never been called.
 *
 * A wrong error message is worse than a missing one — it looks like the tool told you something.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import { describeUpstreamError } from '../../supabase/functions/_shared/tool-result-shape.ts';

const EDGE = join(__dirname, '..', '..', 'supabase', 'functions');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e.startsWith('.')) continue;
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (e.endsWith('.ts')) out.push(f);
  }
  return out;
}

/**
 * Names that unambiguously mean "the parsed response body" in this codebase.
 *
 * Just `parsed` — this codebase's consistent name for the result of `JSON.parse(text)`, and the
 * exact variable all nine offenders stringified.
 *
 * Deliberately NOT `body`, `data`, `payload` or `errBody`. Those name genuine strings all over
 * the tree (a reply's text, a base64 JWT segment, `await res.text()`), and including them flagged
 * four sites that were every one of them correct. A guard with false positives gets weakened or
 * deleted; a narrow one that only fires on the real shape survives to catch the next instance.
 */
const BODY_VARS = ['parsed'];

/** The helper itself legitimately calls String() on a value it has already proven is not an object. */
const SELF = '_shared/tool-result-shape.ts';

describe('upstream error messages', () => {
  const files = walk(EDGE);

  it('scans the edge tree', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never stringifies a parsed response body directly', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const rel = file.slice(EDGE.length + 1).split('\\').join('/');
      if (rel === SELF) continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const v of BODY_VARS) {
        // `String(parsed)` and `${parsed}` — both render an object as [object Object].
        const patterns = [
          new RegExp(`String\\(\\s*${v}\\s*\\)`),
          new RegExp(`\\$\\{\\s*${v}\\s*\\}`),
        ];
        for (const re of patterns) {
          if (re.test(src)) {
            offenders.push(`${rel}: ${re.source}`);
          }
        }
      }
    }
    expect(
      offenders,
      'Use describeUpstreamError(status, body) from _shared/tool-result-shape.ts. Stringifying a '
      + 'parsed JSON body produces "[object Object]", which tells the agent and the user nothing '
      + 'and makes every failure look identical.\n' + offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('describeUpstreamError', () => {
  it('never returns [object Object]', () => {
    for (const input of [
      { error: 'Thread not found' },
      { message: 'nope' },
      { detail: 'bad request' },
      { error: { message: 'nested' } },
      { unexpected: 'shape' },
      {},
      [1, 2, 3],
    ]) {
      expect(describeUpstreamError(404, input)).not.toContain('[object Object]');
    }
  });

  it('prefers the message the upstream actually sent', () => {
    expect(describeUpstreamError(404, { error: 'Thread not found' })).toBe('404: Thread not found');
    expect(describeUpstreamError(500, { message: 'boom' })).toBe('500: boom');
    expect(describeUpstreamError(400, { error: { message: 'nested' } })).toBe('400: nested');
  });

  it('falls back to compact JSON for a shape it does not know', () => {
    expect(describeUpstreamError(422, { weird: 'thing' })).toBe('422: {"weird":"thing"}');
  });

  it('handles strings, null and a missing status', () => {
    expect(describeUpstreamError(503, 'Service Unavailable')).toBe('503: Service Unavailable');
    expect(describeUpstreamError(500, null)).toBe('500: no response body');
    expect(describeUpstreamError(0, { error: 'x' })).toBe('x');
  });
});
