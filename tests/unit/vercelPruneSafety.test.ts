/**
 * The deployment prune is a janitor that can take the site down.
 *
 * Vercel shares static assets between deployments, so deleting the one a long-stable chunk was
 * attributed to orphans a file the CURRENT deployment still serves. That is what happened on
 * 2026-09-11. These assert the guardrails, not the happy path.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blankComments } from '../helpers/stripComments';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const prune = blankComments(read('scripts/prune-vercel-deployments.mjs'));
const workflow = read('.github/workflows/vercel-storage-prune.yml');

describe('the Vercel deployment prune', () => {
  it('deletes nothing unless --apply is passed', () => {
    expect(prune).toContain("process.argv.includes('--apply')");
    // The dry-run branch must return BEFORE any DELETE is issued.
    const dryAt = prune.indexOf('if (!APPLY)');
    const deleteAt = prune.indexOf("call('DELETE'");
    expect(dryAt).toBeGreaterThan(-1);
    expect(deleteAt).toBeGreaterThan(-1);
    expect(dryAt).toBeLessThan(deleteAt);
  });

  it('refuses to run at all when it cannot identify the live deployment', () => {
    // Without that id every deployment looks equally disposable, including the one serving users.
    expect(prune).toContain('refusing to delete anything');
    expect(prune).toContain('targets || {}).production');
  });

  it('spares the live production deployment before any other rule', () => {
    const at = prune.indexOf('for (const d of deps)');
    const loop = prune.slice(at, at + 600);
    expect(loop).toContain('id(d) === liveId');
    expect(loop.indexOf('id(d) === liveId')).toBeLessThan(loop.indexOf('keptNewest.has'));
  });

  it('keeps a newest-N floor and an age floor, not just one of them', () => {
    expect(prune).toContain('KEEP_NEWEST');
    expect(prune).toContain('MIN_AGE_DAYS');
  });

  it('reports what it CLEARED, not that it ran', () => {
    // A prune that deleted nothing while hundreds were eligible is the silent-zero shape.
    expect(prune).toMatch(/RESULT eligible=/);
  });

  it('probes the live site before AND after applying', () => {
    // The repo rule for janitors: check the world, not the exit code. Every delete can return
    // 200 while the live site is now missing a chunk — those are different facts.
    const before = workflow.indexOf('Live site BEFORE');
    const after = workflow.indexOf('Live site AFTER');
    expect(before).toBeGreaterThan(-1);
    expect(after).toBeGreaterThan(before);
    expect(workflow.split('probe-live-frontend.mjs').length - 1).toBeGreaterThanOrEqual(2);
  });

  it('exits non-zero when its deletions were REFUSED', () => {
    // Reporting success for "deleted 0 of 180, all 403" is the same silent-zero shape this whole
    // janitor exists to avoid — a weekly cron green for months while clearing nothing.
    expect(prune).toContain('r.failed > 0');
    expect(prune).toContain('r.denied');
    const exits = prune.slice(prune.indexOf('RESULT eligible='));
    expect(exits.indexOf('process.exit(1)')).toBeLessThan(exits.lastIndexOf('process.exit(0)'));
  });

  it('a dry run proves the token could actually delete', () => {
    // A read-scoped token lists happily and 403s every DELETE, which would otherwise surface
    // only on the first real run. The probe id is well-formed and cannot exist.
    expect(prune).toContain('probeDeletePermission');
    expect(prune).toContain('dpl_000000000000000000000000');
    expect(prune).toContain('status !== 401 && status !== 403');
  });

  it('runs weekly and can still be driven by hand', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toMatch(/cron:\s*'0 9 \* \* 0'/);
  });

  it('never reads inputs.apply directly — they are EMPTY on a schedule', () => {
    // The weekly run would otherwise resolve to a dry run, delete nothing, and report success:
    // a cron that looks healthy and does no work, which is the silent-zero shape exactly.
    const steps = workflow.slice(workflow.indexOf('jobs:'));
    expect(steps).not.toMatch(/inputs\.apply\s*&&/);
    expect(steps).toContain("steps.cfg.outputs.apply == 'true'");
  });

  it('gives the unattended run a wider margin than a watched one', () => {
    const sched = workflow.slice(workflow.indexOf('github.event_name'), workflow.indexOf('else'));
    // Nobody is looking on a Sunday, so the floors it prunes down to are deliberately higher
    // than the manual defaults (keep 20 / 7 days).
    expect(sched).toMatch(/keep=30/);
    expect(sched).toMatch(/min_age=14/);
  });
});
