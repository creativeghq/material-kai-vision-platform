/** A deterministic provider failure must carry the reason it happened. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { describeAnthropicFailure } from '../../supabase/functions/_shared/tools/anthropic-failure.ts';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) =>
  stripComments(readFileSync(join(ROOT, 'supabase/functions/_shared/tools', p), 'utf8'));

const ANTHROPIC_400 = JSON.stringify({
  type: 'error',
  error: { type: 'invalid_request_error', message: 'max_tokens: 8000 > 4096, which is the maximum' },
});

describe('a non-retryable provider failure states its cause', () => {
  it('a 400 carries the upstream message, not just the number', () => {
    const msg = describeAnthropicFailure(400, ANTHROPIC_400, 'Web search', false);
    expect(msg).toContain('400');
    expect(msg, 'the reason is the only useful part of a deterministic failure')
      .toContain('max_tokens');
    expect(msg).toContain('invalid_request_error');
  });

  it('a non-JSON body still reaches the caller', () => {
    const msg = describeAnthropicFailure(422, 'Unprocessable Entity: bad tool schema', 'Web search', false);
    expect(msg).toContain('bad tool schema');
  });

  it('an empty body says so rather than implying there was no error', () => {
    const msg = describeAnthropicFailure(404, '   ', 'Web search', false);
    expect(msg).toMatch(/no detail/i);
  });

  it('a transient failure keeps the wait-and-retry guidance and does not leak prose', () => {
    // 529 means the upstream was busy. The body is noise here — the actionable content is
    // "this is not your query, try again" — and that guidance is what stops the agent
    // rerouting to a background lane it does not need.
    const msg = describeAnthropicFailure(529, ANTHROPIC_400, 'Web search', true);
    expect(msg).toMatch(/overloaded/i);
    expect(msg).toMatch(/temporary/i);
    expect(msg, 'a transient failure must not blame the query').not.toContain('max_tokens');
  });

  it('is truncated — a provider body reaches a model context', () => {
    const long = JSON.stringify({ error: { type: 'invalid_request_error', message: 'x'.repeat(5000) } });
    expect(describeAnthropicFailure(400, long, 'Web search', false).length).toBeLessThan(600);
  });

  it('both web-search call sites use it instead of rebuilding the string', () => {
    for (const file of ['b2b-tools.ts', 'web-research-tools.ts']) {
      const src = read(file);
      expect(src, `${file} no longer calls the shared describer`)
        .toContain('describeAnthropicFailure(');
      expect(
        src,
        `${file} rebuilt the bare "Web search failed: <status>" string — that is the form that `
        + 'recorded seven 400s with no cause',
      ).not.toMatch(/`Web search failed: \$\{response\.status\}`/);
    }
  });
});
