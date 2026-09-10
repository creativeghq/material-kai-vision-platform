/** A channel link reports ITS OWN sync, not the run's. */
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
