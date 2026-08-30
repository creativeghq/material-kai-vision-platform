/**
 * A channel link reports ITS OWN sync, not the run's.
 *
 * `real-estate-ical` pulls every active channel calendar in one pass and stamps each link with
 * `last_sync_status` / `last_sync_message`. The conflict counter — the one that means "these
 * nights are already held, someone has double-booked" — was declared ONCE, outside the per-link
 * loop, and never reset:
 *
 *     let imported = 0, skipped = 0, failed = 0;
 *     for (const link of links) {
 *       for (const ev of events) { if (error.code === '23P01') skipped++; }
 *       await finish(skipped > 0 ? 'partial' : 'ok', `${skipped} date conflict(s) …`);
 *     }
 *
 * So the first genuine double booking anywhere in the run stamped EVERY link processed after it
 * as `partial`, with a message telling the operator to go and find a double booking on a property
 * that has none — and the number quoted was the running total across all links rather than that
 * link's. The one link that really did have a conflict was reported correctly, and buried among
 * false ones.
 *
 * Nothing could catch it: every value is a valid integer, every status is a valid status, and the
 * only reader is a person looking at a channel-links list and believing it. It is the exact shape
 * of a per-item decision made from a run-level accumulator, which is why the guard below is about
 * the SCOPE of the counter rather than about iCal.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const src = readFileSync(join(ROOT, 'supabase/functions/real-estate-ical/index.ts'), 'utf8');

describe('a channel link is stamped with its own result', () => {
  it('is pointed at the real file', () => {
    expect(src).toContain('property_channel_links');
    expect(src, 'the per-link stamp is what this guards').toMatch(/last_sync_status/);
  });

  it('counts conflicts per LINK, not per run, and decides the status from that', () => {
    // The counter the status reads must be declared INSIDE the loop over links.
    expect(src, 'a per-link conflict counter must exist').toMatch(/let linkConflicts = 0;/);
    expect(src, 'the status must be decided from the per-link count')
      .toMatch(/linkConflicts > 0 \? 'partial' : 'ok'/);
    expect(src, 'and the message must quote the per-link count')
      .toMatch(/\$\{linkConflicts\} date conflict\(s\)/);

    // And the run-level total must not be what the stamp reads. `skipped` was that variable.
    expect(src, 'the run total must not decide a single link\'s status')
      .not.toMatch(/skipped > 0 \? 'partial'/);
  });

  it('the per-link counter is declared inside the per-link loop', () => {
    // Scope is the whole defect, so assert it structurally rather than by name: `linkConflicts`
    // must appear AFTER the `for (const link` that owns it, not in the preamble beside `imported`.
    const loopAt = src.indexOf('for (const link of links');
    const declAt = src.indexOf('let linkConflicts = 0;');
    expect(loopAt, 'the per-link loop must still exist').toBeGreaterThan(-1);
    expect(declAt, 'the per-link counter must still exist').toBeGreaterThan(-1);
    expect(declAt, 'declaring it above the loop is the bug this exists for').toBeGreaterThan(loopAt);
  });

  it('still reports a run-level total to the caller, separately', () => {
    // The two numbers are both wanted; conflating them is what broke. The cron's own return
    // value is the place the run total belongs.
    expect(src).toMatch(/return json\(\{[^}]*conflicts[^}]*\}\)/s);
  });
});
