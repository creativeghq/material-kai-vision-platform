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

describe('#357 AE-16 — a throttle is not a dead address', () => {
  /**
   * Only `workspace_email_quota_exceeded` was treated as retryable. Every OTHER 429 — a provider
   * throttle, an upstream Resend limit — fell through to a throw, and the catch marked the
   * recipient FAILED. Failed is terminal: it leaves the pending queue for good, so transient
   * throttling permanently dropped people from a campaign, and the campaign then completed as
   * `partial_failure` with a count that reads like bad addresses.
   */
  it('any 429 re-queues rather than failing the recipient', () => {
    const block = src.slice(src.indexOf("emailResponse.status === 429 && result?.code"), src.indexOf('} catch (error)'));
    // A second, code-less 429 branch must exist after the daily-cap one.
    expect(block).toMatch(/else if \(emailResponse\.status === 429\)/);
    const generic = block.slice(block.indexOf('else if (emailResponse.status === 429)'));
    expect(generic).toContain("update({ status: 'pending' })");
  });

  it('a 5xx re-queues too — the upstream is unwell, not the address', () => {
    const block = src.slice(src.indexOf("emailResponse.status === 429 && result?.code"), src.indexOf('} catch (error)'));
    expect(block).toMatch(/else if \(emailResponse\.status >= 500\)/);
  });

  it('a non-throttle 4xx is still terminal', () => {
    // A malformed address or a rejected payload IS about this recipient. Re-queueing those
    // would spin the campaign forever on a row that can never succeed.
    const block = src.slice(src.indexOf("emailResponse.status === 429 && result?.code"), src.indexOf('} catch (error)'));
    expect(block).toMatch(/throw new Error\(result\?\.error/);
  });

  it('the throttle branch stops the batch, the 5xx branch does not', () => {
    // Continuing to hammer something that just asked us to slow down is the wrong response to a
    // 429; a single upstream blip should not stop a whole campaign.
    const block = src.slice(src.indexOf("emailResponse.status === 429 && result?.code"), src.indexOf('} catch (error)'));
    const throttle = block.slice(block.indexOf('else if (emailResponse.status === 429)'), block.indexOf('else if (emailResponse.status >= 500)'));
    const upstream = block.slice(block.indexOf('else if (emailResponse.status >= 500)'));
    expect(throttle).toContain('break;');
    expect(upstream.slice(0, upstream.indexOf('} else'))).not.toContain('break;');
  });
});

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
