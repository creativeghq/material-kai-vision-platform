/**
 * Guard: the deploy diff is taken from what is LIVE, not from the previous commit.
 *
 * On 2026-08-17 a concurrent push cancelled the deploy for d02b5c79. The next commit was
 * test-only, so `changes` compared against a parent whose frontend had never shipped, answered
 * "no frontend change", and the run went green over a build missing two fixes. Nothing failed —
 * that is the whole problem. A cancelled deploy is invisible to a diff anchored on HEAD~1,
 * because the commit it skipped is still in the history behind it.
 *
 * The fix is a pair of markers (`deployed/frontend`, `deployed/functions`) moved ONLY by a
 * successful deploy, with every diff anchored there. This pins the three properties that make it
 * work; each is a one-line edit away from being undone, and none of them fails loudly if it is.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const wf = readFileSync(join(__dirname, '..', '..', '.github', 'workflows', 'deploy.yml'), 'utf8');

describe('deploy baseline', () => {
  it('anchors the diff on the deployed markers, not on the previous commit', () => {
    expect(wf).toMatch(/refs\/tags\/\$TAG\^\{commit\}/);
    expect(wf).toContain('steps.base.outputs.functions_base');
    // `github.event.before` is the previous COMMIT. Using it is precisely the bug: it says
    // nothing about whether that commit's deploy ever finished.
    expect(
      wf.includes('github.event.before'),
      'the diff is anchored on github.event.before again — a cancelled deploy becomes invisible',
    ).toBe(false);
  });

  it('moves a marker only after that area actually deployed', () => {
    // Gated on the deploying job's own success. `always()` or a bare `needs` would advance the
    // baseline past work that never shipped, which is the original bug with extra steps.
    expect(wf).toMatch(/mark-deployed-frontend:[\s\S]*?needs:\s*\[promote\][\s\S]*?needs\.promote\.result == 'success'/);
    expect(wf).toMatch(/mark-deployed-functions:[\s\S]*?needs:\s*\[deploy-functions\][\s\S]*?needs\.deploy-functions\.result == 'success'/);
  });

  it('deploys everything when it cannot prove anything is live', () => {
    // A missing marker must mean "undeployed", never "unchanged". The safe direction is the
    // expensive one, and it is only ever taken once.
    expect(wf).toMatch(/no deployed\/frontend marker/);
    expect(wf).toMatch(/No deployed\/functions marker/);
    expect(wf).toMatch(/frontend=true/);
  });
});
