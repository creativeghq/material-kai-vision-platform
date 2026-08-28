import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

/**
 * A campaign recipient is CLAIMED, not merely marked (#357 AE-4).
 *
 * `campaign-processor` selected `status='pending'` rows and then wrote `status='sending'`
 * unconditionally. Two concurrent runs — a retry, an overlapping cron tick, a manual trigger —
 * both read the same pending set and both sent. For marketing mail a double send is a compliance
 * problem, not untidiness.
 *
 * The fix is the `receive_order_into_warehouse` pattern from #355: make the write itself the
 * claim, so a repeat is a no-op by construction rather than by hoping nobody retries.
 */

const ROOT = join(__dirname, '..', '..');
const src = stripComments(
  readFileSync(join(ROOT, 'supabase/functions/campaign-processor/index.ts'), 'utf8').replace(/\r\n/g, '\n'),
);

describe('#357 AE-4 — the send cannot happen twice', () => {
  it('the claim is conditional on the row still being pending', () => {
    // Without `.eq('status', 'pending')` the UPDATE always succeeds and claims nothing.
    const claim = src.slice(src.indexOf("update({ status: 'sending' })"), src.indexOf('const rv ='));
    expect(claim).toContain(".eq('status', 'pending')");
  });

  it('it reads the result back and skips when it lost the race', () => {
    // An UPDATE that matched no row returns no row. Not checking that is the same as not
    // claiming at all.
    const claim = src.slice(src.indexOf("update({ status: 'sending' })"), src.indexOf('const rv ='));
    expect(claim).toMatch(/\.select\('id'\)/);
    expect(claim).toMatch(/if \(!claimed\) continue;/);
  });

  it('a failed claim does not fall through to a send', () => {
    const claim = src.slice(src.indexOf("update({ status: 'sending' })"), src.indexOf('const rv ='));
    expect(claim).toMatch(/if \(claimErr\)[\s\S]{0,200}continue;/);
  });

  it('completion waits for in-flight rows, not just pending ones', () => {
    // A row claimed by another worker is `sending`, not `pending` — so "no pending" was not
    // "finished". A second run declared the campaign sent and fired `campaign_sent` while the
    // first was still delivering, telling the owner a count that is short.
    const done = src.slice(src.indexOf('if (!recipients || recipients.length === 0) {'), src.indexOf("const finalStatus"));
    expect(done).toContain("eq('status', 'sending')");
    expect(done).toMatch(/inFlight[\s\S]{0,120}continue;/);
  });

  it('the in-flight check runs BEFORE the campaign is marked sent', () => {
    const inFlight = src.indexOf("eq('status', 'sending')");
    const markSent = src.indexOf('const finalStatus');
    expect(inFlight).toBeGreaterThan(-1);
    expect(inFlight < markSent, 'the campaign is marked complete before the in-flight check').toBe(true);
  });
});
