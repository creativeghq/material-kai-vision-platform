import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  NOISE_PATTERNS,
  isNoiseMessage,
  describeConsoleArg,
  rebuildConsoleMessage,
} from '../../src/utils/sentryConsoleMessage';

const main = readFileSync(join(process.cwd(), 'src/main.tsx'), 'utf8');

describe('a console event carries its reason in the title', () => {
  it('names a PostgREST failure by code and message (the real KAI-VZ payload)', () => {
    const rebuilt = rebuildConsoleMessage([
      'Product search failed:',
      {
        code: 'PGRST201',
        message: "Could not embed because more than one relationship was found for 'products'",
        details: '[Array]',
        hint: 'Try changing ...',
      },
    ]);
    expect(rebuilt).toBe(
      "Product search failed: PGRST201 Could not embed because more than one relationship was found for 'products'",
    );
  });

  it('never leaves an object as [object Object]', () => {
    for (const arg of [{ message: 'boom' }, new Error('boom'), { error: 'boom' }, { a: 1 }, [1, 2]]) {
      expect(describeConsoleArg(arg)).not.toContain('[object Object]');
    }
  });

  it('survives a circular object rather than throwing inside beforeSend', () => {
    const circular: Record<string, unknown> = { n: 1 };
    circular.self = circular;
    expect(() => describeConsoleArg(circular)).not.toThrow();
  });

  it('returns null when there is nothing to rebuild', () => {
    expect(rebuildConsoleMessage(undefined)).toBeNull();
    expect(rebuildConsoleMessage([])).toBeNull();
  });
});

describe('the noise list is one list, applied to the rebuilt title too', () => {
  it('recognises a transport failure once the reason is back in the title', () => {
    const rebuilt = rebuildConsoleMessage([
      '[dashboard] count(orders) failed:',
      { code: '', message: 'TypeError: Failed to fetch' },
    ]);
    expect(rebuilt).toContain('Failed to fetch');
    expect(
      isNoiseMessage(rebuilt!),
      'Three dashboard issues were filed for one mobile network drop: the SDK filter reads the '
      + 'TITLE, which said "[object Object]" while "Failed to fetch" sat in the payload. '
      + 'Rebuilding the title without re-filtering keeps all three.',
    ).toBe(true);
  });

  it('does not swallow a real failure', () => {
    expect(isNoiseMessage('Product search failed: PGRST201 Could not embed')).toBe(false);
  });

  it('is the same list Sentry.init is given', () => {
    expect(
      main,
      '`ignoreErrors` must spread NOISE_PATTERNS. A second copy drifts, and the two halves of '
      + 'this filter — the SDK matching the original title and beforeSend matching the rebuilt '
      + 'one — would then disagree about what counts as noise.',
    ).toMatch(/ignoreErrors:\s*\[\.\.\.NOISE_PATTERNS\]/);
    expect(NOISE_PATTERNS.length).toBeGreaterThan(0);
  });

  it('rebuilds the title before deciding, not after', () => {
    const before = main.indexOf('rebuildConsoleMessage((event.extra');
    const decide = main.indexOf('isNoiseMessage(rebuilt)');
    expect(before).toBeGreaterThan(-1);
    expect(
      decide,
      'The noise check must read the REBUILT message. Checking event.message first is the '
      + 'defect this replaces — that string is "[object Object]" and matches nothing.',
    ).toBeGreaterThan(before);
  });
});
