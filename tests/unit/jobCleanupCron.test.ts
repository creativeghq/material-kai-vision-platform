/**
 * The weekly reaper does not put an unbounded id list in a URL (#365 AD-28 follow-up).
 *
 * `job-cleanup-cron` returned 200 every Sunday until 2026-08-16, then 500 on 08-23 and 08-30,
 * with pg_cron reporting "succeeded" the whole time — it only sees that `net.http_post` was
 * enqueued. `ops.cron_reported_success_but_no_effect` is what caught it.
 *
 * The cause was a fix. AD-28 corrected a genuine bug (steps were deleted by age alone, so a run
 * still in flight after 30 days lost its history) by resolving the finished parents first and
 * deleting their steps by id. Correct in intent, and it put one uuid per finished run into a
 * PostgREST `in.(…)` filter — which travels in the URL. Measured against production: 900 uuids is
 * a 33,399-byte URL and the gateway answers **400**; 20 uuids answers 200. It worked while the
 * platform had a handful of runs and broke the week flows got busy.
 *
 * The repair is a deletion, not a chunking. `flow_run_steps.flow_run_id` is ON DELETE CASCADE, so
 * deleting the finished runs already removes exactly their steps — atomically, with no id list and
 * no window where the parent is gone and the children are not. Verified live: 21,340 steps, 0
 * orphaned.
 *
 * This guards the TypeScript half; the cascade itself is a schema fact checked by probe.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const CRON = 'supabase/functions/job-cleanup-cron/index.ts';
const src = stripComments(readFileSync(join(ROOT, CRON), 'utf8'));

describe('#365 AD-28 — the reaper cannot rebuild the 33KB URL', () => {
  it('does not delete flow_run_steps by an id list', () => {
    // The exact shape that failed: `.in('flow_run_id', <mapped ids>)`. One uuid is 36 bytes plus a
    // separator, so this is a URL whose length is set by how busy the platform is — it cannot fail
    // in testing and cannot keep working in production.
    expect(src, 'the id-list delete is back')
      .not.toMatch(/from\('flow_run_steps'\)[\s\S]{0,200}\.delete\(\)[\s\S]{0,200}\.in\(/);
    expect(src, 'a mapped id list is being built for a filter')
      .not.toMatch(/\.in\('flow_run_id',[\s\S]{0,120}\.map\(/);
  });

  it('counts the steps through the parent instead of enumerating them', () => {
    // An inner-join filter asks the same question with a fixed-length URL, so the reported number
    // stays true without naming a single id.
    expect(src).toMatch(/flow_runs!inner\(status, created_at\)/);
    expect(src).toMatch(/\.in\('flow_runs\.status'/);
  });

  it('still reports a partial run as a failure', () => {
    // AD-29. A janitor that returns success after a partial failure is the reaper shape: the
    // monitoring sees a clean run and the rows accumulate with nobody told. This is what turned
    // the above from invisible into a 500, and it must not be softened back.
    expect(src).toMatch(/failures\.push\(/);
    expect(src).toMatch(/status: 500/);
    expect(src).toMatch(/success: false/);
  });

  it('every table it touches collects its error rather than only logging it', () => {
    // One `console.error` without a matching `failures.push` is a table that can fail silently
    // again. Counted rather than named, so a new table is covered the day it is added.
    const errors = (src.match(/console\.error\('\[JobCleanupCron\]/g) || []).length;
    const pushes = (src.match(/failures\.push\(/g) || []).length;
    expect(pushes, `${errors} error logs but only ${pushes} collected`).toBeGreaterThanOrEqual(errors - 1);
  });
});
