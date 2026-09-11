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

  it('is not on a schedule yet — an unsupervised deleter caused the outage', () => {
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).not.toMatch(/^\s*schedule:/m);
  });
});
