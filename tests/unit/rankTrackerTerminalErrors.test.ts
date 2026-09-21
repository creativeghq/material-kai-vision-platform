import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

import { blankComments } from '../helpers/stripComments';

const SRC = readFileSync(
  join(__dirname, '..', '..', 'supabase/functions/seo-rank-tracker/index.ts'), 'utf8');

function terminalRe(): RegExp {
  const m = SRC.match(/const TERMINAL_UPSTREAM = (\/.+\/[a-z]*);/);
  if (!m) throw new Error('TERMINAL_UPSTREAM not found');
  const body = m[1].slice(1, m[1].lastIndexOf('/'));
  const flags = m[1].slice(m[1].lastIndexOf('/') + 1);
  return new RegExp(body, flags);
}

describe('the rank tracker retries a flaky SERP, never a refused account', () => {
  const re = terminalRe();

  it('treats a billing or auth refusal as terminal', () => {
    for (const msg of [
      'DataForSEO task status 40200: Payment Required.',
      'dataforseo envelope 40200: Payment Required',
      'perplexity HTTP 401: You exceeded your current quota',
      'HTTP 403 Forbidden',
      'Your credit balance is too low',
      'insufficient funds on the account',
    ]) {
      expect(re.test(msg), msg).toBe(true);
    }
  });

  it('still retries the transient failures the backoff was written for', () => {
    for (const msg of [
      'DataForSEO task status 40106: partial results, some pages could not be retrieved',
      'DataForSEO task status 40101: internal SE server error',
      'upstream returned an empty SERP',
      'network timeout',
      'DataForSEO response status 50000: internal error',
    ]) {
      expect(re.test(msg), msg).toBe(false);
    }
  });

  it('breaks out of the loop rather than sleeping through the backoff', () => {
    const code = blankComments(SRC);
    expect(code).toMatch(/if \(TERMINAL_UPSTREAM\.test\(msg\)\) \{/);
    const after = code.slice(code.indexOf('TERMINAL_UPSTREAM.test(msg)'));
    expect(after.slice(0, 260)).toContain('break;');
  });

  it('keeps three attempts for everything else', () => {
    expect(blankComments(SRC)).toContain('const SERP_ATTEMPTS = 3');
  });
});
