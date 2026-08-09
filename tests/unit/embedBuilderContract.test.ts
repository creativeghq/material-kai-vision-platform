/**
 * Guard: the embed BUILDER's two rules (#337).
 *
 * The builder asks "what are you after?" and ends in one of two places — a price, or a quote
 * request. Which one it shows is not a presentation choice, it is the whole contract:
 *
 *   1. A PRICE APPEARS ONLY ON AN EXACT MATCH. The server prices exact matches and deliberately
 *      returns near matches WITHOUT a price, because a near match is a suggestion and not an offer.
 *      If the widget renders a number next to a near match — or worse, derives one — it has quoted
 *      a merchant's customer a figure the merchant never agreed to, on the merchant's own page.
 *      That is the money-derivation rule (CLAUDE.md: SQL derives, TypeScript formats) arriving at
 *      the last hop, where it is easiest to break and hardest to notice.
 *
 *   2. NO MATCH IS NOT A DEAD END. "Nothing in the catalogue matches that" must always land on the
 *      quote form. A builder that shows an empty result for an unstocked spec throws away the lead
 *      the feature exists to capture, and would look like a bug rather than a decision.
 *
 * Source-level rather than behavioural: the builder is a custom element and the suite runs on the
 * `node` environment with no DOM, so mounting it would mean adding jsdom for one file. Both rules
 * are fully visible in the text — the same trade `embedShellIntegrity` makes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src/embed/materialkai-builder.ts'), 'utf8');

/** Slice one method body out by name, terminating at the first 2-space-indented brace. */
function method(name: string): string {
  const start = SRC.indexOf(`private ${name}(`);
  expect(start, `${name} not found — was it renamed?`).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n  }', start);
  expect(end, `${name} has no terminator`).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('the embed builder prices only exact matches', () => {
  const renderResult = method('renderResult');

  it('finds the result renderer (guards against a vacuous pass)', () => {
    expect(renderResult).toContain('match_kind');
    expect(renderResult.length).toBeGreaterThan(400);
  });

  it('every formatMoney call sits inside the exact-match branch', () => {
    const exactStart = renderResult.indexOf("match_kind === 'exact'");
    expect(exactStart, 'no exact-match branch').toBeGreaterThan(-1);
    // The branch ends at its early return — everything after it is the near/none path.
    const exactEnd = renderResult.indexOf('return;', exactStart);
    expect(exactEnd, 'the exact branch does not return early').toBeGreaterThan(exactStart);

    const calls = [...renderResult.matchAll(/formatMoney\s*\(/g)].map((m) => m.index!);
    expect(calls.length, 'no price is rendered at all — did the exact branch lose its price?')
      .toBeGreaterThan(0);

    const outside = calls.filter((i) => i < exactStart || i > exactEnd);
    expect(
      outside.length,
      'a price is formatted outside the exact-match branch. Near matches and no-match specs carry '
      + 'no price from the server, so any number here was invented by the widget.',
    ).toBe(0);
  });

  it('the near-match list renders no price field', () => {
    const nearStart = renderResult.indexOf('near_matches');
    expect(nearStart).toBeGreaterThan(-1);
    const near = renderResult.slice(nearStart);
    expect(near, 'near matches must not show a price').not.toMatch(/\.price\b/);
    expect(near).not.toContain('formatMoney');
  });

  it('does no arithmetic on money anywhere in the builder', () => {
    // The server returns a gross price ready to display. Any operator applied to it here is a
    // second derivation — VAT re-added, a discount re-applied, a delta summed.
    const bad = [...SRC.matchAll(/\bprice\s*[*/+-]|[*/+-]\s*\bprice\b/g)].map((m) => m[0]);
    expect(bad, 'money arithmetic in the widget: ' + bad.join(', ')).toEqual([]);
  });
});

describe('the embed builder always offers a way forward', () => {
  it('the non-exact branch mounts the quote form', () => {
    const renderResult = method('renderResult');
    const exactEnd = renderResult.indexOf('return;', renderResult.indexOf("match_kind === 'exact'"));
    const fallback = renderResult.slice(exactEnd);
    expect(
      fallback,
      'a spec that matches nothing must land on the quote form, not an empty result',
    ).toContain('quoteForm()');
  });

  it('the quote form collects a name and an email, and refuses without them', () => {
    const form = method('quoteForm');
    expect(form).toContain("type = 'email'");
    expect(form).toMatch(/name\.value\.trim\(\)/);
    expect(form).toMatch(/email\.value\.trim\(\)/);
  });

  it('an exact match hands the visitor the real product widget', () => {
    // Otherwise the builder would have to re-implement the model viewer, AR and the cart — three
    // things that already exist one element away.
    expect(method('renderResult')).toContain('mountProduct');
    expect(method('mountProduct')).toContain("createElement('materialkai-product')");
  });
});

describe('the embed builder cannot call the API without its key', () => {
  it('every fetch goes through this.url(), which appends action and key', () => {
    const fetches = [...SRC.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
    expect(fetches.length, 'no fetch calls parsed').toBeGreaterThan(1);
    const raw = fetches.filter((arg) => !arg.startsWith('this.url('));
    expect(
      raw,
      'a fetch that does not build its URL through this.url() would omit the embed key and hit an '
      + 'unauthenticated endpoint: ' + raw.join(', '),
    ).toEqual([]);
  });

  it('the key is url-encoded into the query string, not sent as a custom header', () => {
    // A custom header forces a CORS preflight, and the preflight carries no headers — so the
    // key would be unreadable exactly when the browser is deciding whether to allow the call.
    const url = method('url');
    expect(url).toContain('encodeURIComponent(this.apiKey)');
    expect(SRC).not.toContain('x-embed-key');
  });
});
