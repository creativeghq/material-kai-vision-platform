/**
 * A monitoring number is comparable, or it is not shown (#360 CB-14 / CB-21).
 *
 * CB-14: the price comparison was `((theirs - ours) / ours) * 100` with no currency check at all —
 * `theirs` in `row.current_currency`, `ours` in a `currency` prop that DEFAULTED TO 'USD' on a
 * platform that prices in euro. A GBP price against a EUR list price rendered as a confident red
 * "+12%" with a trend arrow. A wrong number is a valid `number`, so nothing else could catch it.
 *
 * CB-21: the panels' reads were `.catch(() => null)`, and null renders as an empty state. On these
 * screens zero IS an answer — no new mentions, no price movement — so an outage that produces one
 * is indistinguishable from good news, on the surfaces whose entire purpose is noticing change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';
import {
  comparePrices,
  comparisonLabel,
  currencySymbol,
} from '../../src/components/business/price-monitoring/priceComparison';
import { readOrReason, valueOf, failed, reasonOf } from '../../src/components/business/monitoring/readState';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

describe('#360 CB-14 — the comparison refuses to mix currencies', () => {
  it('compares like with like', () => {
    expect(comparePrices({ ours: 100, oursCurrency: 'EUR', theirs: 110, theirsCurrency: 'EUR' }))
      .toEqual({ kind: 'pct', value: 10 });
    expect(comparePrices({ ours: 100, oursCurrency: 'eur', theirs: 90, theirsCurrency: ' EUR ' }))
      .toEqual({ kind: 'pct', value: -10 });
  });

  it('refuses across currencies instead of inventing a percentage', () => {
    const r = comparePrices({ ours: 100, oursCurrency: 'EUR', theirs: 110, theirsCurrency: 'GBP' });
    expect(r).toEqual({ kind: 'incomparable', reason: 'currency', ours: 'EUR', theirs: 'GBP' });
    expect(comparisonLabel(r)).toBe('GBP vs EUR');
  });

  it('an unknown currency is not "probably the same"', () => {
    // That assumption IS the defect — it is what the `currency = 'USD'` default was doing.
    expect(comparePrices({ ours: 100, oursCurrency: null, theirs: 110, theirsCurrency: 'EUR' }).kind).toBe('unknown');
    expect(comparePrices({ ours: 100, oursCurrency: 'EUR', theirs: 110, theirsCurrency: '' }).kind).toBe('unknown');
    expect(comparePrices({ ours: 100, oursCurrency: 'EU', theirs: 110, theirsCurrency: 'EUR' }).kind).toBe('unknown');
  });

  it('a missing or nonsense price says nothing rather than dividing by zero', () => {
    expect(comparePrices({ ours: 0, oursCurrency: 'EUR', theirs: 10, theirsCurrency: 'EUR' }).kind).toBe('unknown');
    expect(comparePrices({ ours: null, oursCurrency: 'EUR', theirs: 10, theirsCurrency: 'EUR' }).kind).toBe('unknown');
    expect(comparePrices({ ours: 10, oursCurrency: 'EUR', theirs: null, theirsCurrency: 'EUR' }).kind).toBe('unknown');
    expect(comparisonLabel({ kind: 'unknown' })).toBeNull();
  });

  it('an unrecognised currency renders as its code, never as dollars', () => {
    expect(currencySymbol('EUR')).toBe('€');
    expect(currencySymbol('GBP')).toBe('£');
    expect(currencySymbol('USD')).toBe('$');
    expect(currencySymbol('SEK')).toBe('SEK ');
    expect(currencySymbol(null)).toBe('');
    expect(currencySymbol('')).toBe('');
  });

  it('the component uses it, and has no currency default any more', () => {
    const src = read('src/components/business/price-monitoring/ProductMonitorTab.tsx');
    expect(src).toMatch(/comparePrices\(\{ ours: currentPrice, oursCurrency: currency, theirs, theirsCurrency \}\)/);
    expect(src, 'the raw percentage is back').not.toMatch(/\(\(p - currentPrice\) \/ currentPrice\) \* 100/);
    expect(src, 'the USD default is back').not.toMatch(/currency = 'USD'/);
    expect(src, 'the dollar fallback symbol is back').not.toMatch(/=== 'GBP' \? '£' : '\$'/);
  });

  it('the incomparable case renders a reason, not a hidden row', () => {
    // Rule 3: a value or a stated reason there is no value — never a quietly missing figure.
    const src = read('src/components/business/price-monitoring/ProductMonitorTab.tsx');
    expect(src).toMatch(/diff\.kind === 'incomparable'/);
    expect(src).toMatch(/comparisonLabel\(diff\)/);
  });
});

describe('#360 CB-21 — a failed read is not an empty result', () => {
  it('keeps the reason instead of collapsing to null', async () => {
    const ok = await readOrReason('x', async () => 42);
    expect(ok).toEqual({ ok: true, value: 42 });

    const bad = await readOrReason('x', async () => { throw new Error('upstream 503'); });
    expect(bad.ok).toBe(false);
    expect(reasonOf(bad)).toBe('upstream 503');
  });

  it('a thrown non-Error still produces a reason', async () => {
    const r = await readOrReason('x', async () => { throw 'nope'; });
    expect(r.ok).toBe(false);
    expect(reasonOf(r)).toBe('nope');
  });

  it('valueOf and failed read the two halves', async () => {
    const ok = await readOrReason('x', async () => 'v');
    const bad = await readOrReason('x', async () => { throw new Error('e'); });
    expect(valueOf(ok)).toBe('v');
    expect(valueOf(bad)).toBeNull();
    expect(failed(ok)).toBe(false);
    expect(failed(bad)).toBe(true);
    // Not-yet-read is neither: no notice, no value.
    expect(failed(null)).toBe(false);
    expect(valueOf(null)).toBeNull();
    expect(reasonOf(null)).toBeUndefined();
  });

  it('the mention panels stopped swallowing their reads', () => {
    const src = read('src/components/business/mention-monitoring/MentionMonitorTab.tsx');
    expect(src).toMatch(/readOrReason\('share of voice'/);
    expect(src).toMatch(/readOrReason\('AI Overview history'/);
    expect(src, 'a read is silently caught to null again')
      .not.toMatch(/shareOfVoice\([^)]*\)\.catch\(\(\) => null\)/);
    expect(src, 'a read is silently caught to null again')
      .not.toMatch(/getSubjectAiOverviewHistory\([^)]*\)\.catch\(\(\) => null\)/);
  });

  it('and they SAY so on screen, with a retry', () => {
    const src = read('src/components/business/mention-monitoring/MentionMonitorTab.tsx');
    const notices = src.match(/<ReadFailureNotice/g) ?? [];
    expect(notices.length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/failed\(sovRead\)/);
    expect(src).toMatch(/failed\(aioRead\)/);
    expect(src).toMatch(/onRetry=\{\(\) => \{ void load\(\); \}\}/);
  });

  it('the notice never renders a zero', () => {
    const notice = read('src/components/business/monitoring/ReadFailureNotice.tsx');
    expect(notice).toMatch(/We could not read/);
    expect(notice).toMatch(/the figure is unknown until the read succeeds/);
  });
});
