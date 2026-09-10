/** The weekly reaper does not put an unbounded id list in a URL (#365 AD-28 follow-up). */
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
    // The CONDITION, not just the response shape. `if (false) { …500… }` keeps every token this
    // asserted while the reaper goes back to reporting a partial run as a clean one — which is
    // the exact regression this case exists to stop.
    expect(src, 'the 500 is no longer conditioned on there being failures')
      .toMatch(/if \(failures\.length > 0\)\s*\{/);
  });

  it('every table it touches collects its error rather than only logging it', () => {
    // One `console.error` without a matching `failures.push` is a table that can fail silently
    // again. Counted rather than named, so a new table is covered the day it is added.
    const perTable = (src.match(/console\.error\('\[JobCleanupCron\][^']*error:/g) || [])
      .filter((m) => !m.includes('Fatal'));
    const pushes = (src.match(/failures\.push\(/g) || []).length;
    expect(pushes, `${perTable.length} per-table error logs but only ${pushes} collected`)
      .toBeGreaterThanOrEqual(perTable.length);
    // And the fatal handler must still exist — it is what turns an unexpected throw into a 500
    // rather than a silent 200.
    expect(src, 'the fatal handler is gone').toMatch(/Fatal error/);
  });
});

/** The same defect, ten lines below its own post-mortem — 2026-08-30. */
describe('no block rebuilds the URL defect, and none hand-rolls storage cleanup', () => {
  it('never maps rows into an id filter, for any column', () => {
    // Generalised past `flow_run_id`: the failure is the SHAPE — a filter whose length is set by
    // how much data the platform holds — not the particular column that had it first.
    const offenders = src.match(/\.in\(\s*'[^']+',[\s\S]{0,200}?\.map\(/g) ?? [];
    expect(
      offenders,
      'a row set is being mapped into a PostgREST `in.(…)` filter. That travels in the URL, so it '
        + 'works in testing and fails once the table grows — 900 uuids measured at 33,399 bytes '
        + 'against a gateway that answers 400. Filter through the parent with an !inner join, or '
        + 'let ON DELETE CASCADE do it.',
    ).toEqual([]);
  });

  it('does not delete generation-images objects by hand', () => {
    expect(src, 'storage removal is back in the reaper — the GC owns entity-delete cleanup, and '
      + 'this is where the unbounded-collection and swallowed-error bugs came from')
      .not.toMatch(/storage[\s\S]{0,80}\.from\('generation-images'\)[\s\S]{0,80}\.remove\(/);
  });

  it('still deletes the generation rows themselves, and reports a failure to', () => {
    // The GC only reaps what the row delete releases, so dropping that would leak both ways.
    expect(src).toMatch(/from\('generation_3d'\)[\s\S]{0,120}\.delete\(\)/);
    expect(src).toMatch(/failures\.push\(`generation_3d:/);
  });
});
