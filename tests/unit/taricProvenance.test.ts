/**
 * A classification says where it came from, and a write that failed is not a success
 * (#360 CB-17) — plus the paid monitoring actions latch (#360 CB-20).
 *
 * CB-17 reads "the client can mark a classification confirmed/manual". Most of that is correct by
 * design and is recorded here so nobody "fixes" it later: a TARIC code is the DECLARER'S
 * responsibility, so a workspace member typing one and marking it confirmed is the feature. It is
 * NOT the `vat_validated` shape from #353 CRM-7, which asserts that a third party verified
 * something.
 *
 * Two things were genuinely wrong, and both are about the audit trail rather than the code:
 * accepting a classifier suggestion was recorded as `manual` — an approval written as an
 * authorship — and every write in `taric-classify` discarded its result while the function
 * returned the status it had meant to store.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const classify = read('supabase/functions/taric-classify/index.ts');
const service = read('src/services/taricService.ts');

describe('#360 CB-17 — approving is not authoring', () => {
  it('accepting a suggestion records classifier_confirmed', () => {
    // `taric_source` is what tells a later reader whether to re-run the classifier or leave a
    // human's decision alone. `manual` made an approval indistinguishable from an authorship.
    const fn = service.slice(service.indexOf('async confirmSuggestion'), service.indexOf('async rejectSuggestion'));
    expect(fn).toMatch(/taric_source: 'classifier_confirmed'/);
    expect(fn, 'an accepted suggestion is recorded as manual again').not.toMatch(/taric_source: 'manual'/);
  });

  it('a code typed by a person is still manual', () => {
    // The distinction only means something if both halves exist.
    const card = read('src/components/business/marketplace/ProductFiscalCard.tsx');
    expect(card).toMatch(/taric_status: 'confirmed', taric_source: 'manual'/);
  });

  it('rejecting clears back to pending rather than inventing a state', () => {
    const fn = service.slice(service.indexOf('async rejectSuggestion'));
    expect(fn).toMatch(/taric_status: 'pending'/);
    expect(fn).toMatch(/taric_code_suggested: null/);
  });
});

describe('#360 CB-17 — a classification write is checked', () => {
  it('there is one writer, and it reads the error', () => {
    expect(classify).toMatch(/async function writeClassification/);
    expect(classify).toMatch(/if \(error\) throw new Error\(`classification not stored/);
  });

  it('no bare product update survives', () => {
    // A discarded `.update()` plus a returned `status: 'confirmed'` is a caller told the product
    // was classified and a product that never was.
    //
    // Scanned OUTSIDE the helper: `writeClassification` contains the one legitimate
    // `.update()` in the file, and a negative match over the whole source flags the fix itself.
    const helperStart = classify.indexOf('async function writeClassification');
    expect(helperStart).toBeGreaterThan(-1);
    const helperEnd = classify.indexOf('\n}', helperStart);
    const outsideHelper = classify.slice(0, helperStart) + classify.slice(helperEnd);
    expect(outsideHelper, 'a bare update is back')
      .not.toMatch(/await supabase\.from\('products'\)\.update\(/);
  });

  it('the batch still survives one product failing', () => {
    expect(classify).toMatch(/results\.push\(\{ product_id: product\.id, error:/);
    expect(classify).toMatch(/taric_status: 'failed'/);
  });

  it('the failure MARKER is the one best-effort write, and says why', () => {
    // A throw there would abandon the batch to protect a marker — the recovery path must not be
    // the thing that breaks recovery.
    const raw = readFileSync(join(ROOT, 'supabase/functions/taric-classify/index.ts'), 'utf8');
    expect(raw).toMatch(/Best-effort ON PURPOSE/);
    expect(classify).toMatch(/could not even record the failure for/);
  });
});

describe('#360 CB-20 — a paid action runs once per click', () => {
  it('price discovery latches synchronously', () => {
    // The run spends Perplexity and Firecrawl credits, and the toast reports how many — a
    // duplicate is money, not noise.
    const src = read('src/components/business/price-monitoring/ProductMonitorTab.tsx');
    expect(src).toMatch(/const discovering = useRef\(false\)/);
    expect(src).toMatch(/if \(discovering\.current\) return;/);
    expect(src).toMatch(/discovering\.current = false;/);
  });

  it('both paid mention actions latch', () => {
    const src = read('src/components/business/mention-monitoring/MentionMonitorTab.tsx');
    for (const ref of ['refreshingNow', 'probingNow']) {
      expect(src, ref).toMatch(new RegExp(`const ${ref} = useRef\\(false\\)`));
      expect(src, ref).toMatch(new RegExp(`if \\(${ref}\\.current\\) return;`));
      expect(src, ref).toMatch(new RegExp(`${ref}\\.current = false;`));
    }
  });

  it('the latch is taken before the first await, and released in finally', () => {
    const src = read('src/components/business/mention-monitoring/MentionMonitorTab.tsx');
    const fn = src.slice(src.indexOf('const handleRefresh'), src.indexOf('const handleProbeLlm'));
    const take = fn.indexOf('refreshingNow.current = true');
    const firstAwait = fn.indexOf('await refreshSubject');
    const release = fn.indexOf('refreshingNow.current = false');
    expect(take).toBeGreaterThan(-1);
    expect(take < firstAwait, 'the latch is taken after the call has already gone out').toBe(true);
    expect(release > firstAwait, 'the latch is released before the work finishes').toBe(true);
  });
});
