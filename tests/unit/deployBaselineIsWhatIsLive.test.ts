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
    expect(wf).toMatch(/functions=true/);
  });

  it('gates both deploy jobs on a verdict that knows about a missing marker', () => {
    // The first version derived the function LIST from the missing marker but left the JOB GATE
    // on the raw paths-filter answer. So on a commit touching no functions the job was skipped,
    // the marker was never created, and the missing-marker recovery path could never run — it was
    // unreachable precisely when it was needed. Both outputs must come from the resolved verdict.
    expect(wf).toContain('frontend: ${{ steps.areas.outputs.frontend }}');
    expect(wf).toContain('functions: ${{ steps.areas.outputs.functions }}');
    expect(
      /^\s+functions: \$\{\{ steps\.filter\.outputs\.functions \}\}/m.test(wf),
      'the functions job gate reads paths-filter directly again — the missing-marker path becomes unreachable',
    ).toBe(false);
  });
});

/**
 * Guard: the two properties that used to be free and are now load-bearing wiring.
 *
 * On 2026-08-19 this workflow was restructured for wall-clock — the lint checks moved out of
 * `unit-tests` into their own job, and the single workflow-level concurrency group (which
 * serialized entire runs, costing ~13 minutes of pure queueing across five pushes) was replaced
 * by per-job groups on only the jobs that touch a shared external resource.
 *
 * Both changes are safe, and both replaced a structural guarantee with a wiring decision that
 * fails SILENTLY if it is undone. Hence these.
 */
// LF-normalized. A Windows checkout has CRLF, so an LF-anchored multiline regex matches
// nothing and every assertion below would pass vacuously — the same shape that had to be
// fixed in another guard this week.
const wfLF = wf.split('\r\n').join('\n');

function jobBlock(name: string): string {
  // From `^  <name>:` to the next top-level job key. Comments between jobs belong to the block
  // that follows them, which does not matter for anything asserted here.
  const m = new RegExp(`^  ${name}:$([\\s\\S]*?)(?=^  [a-z][a-z0-9-]*:$|$(?![\\s\\S]))`, 'm').exec(wfLF);
  if (!m) throw new Error(`job "${name}" not found in deploy.yml — it was renamed or removed`);
  return m[1];
}

describe('deploy wiring', () => {
  it('keeps lint gating BOTH deploys, wherever the lint steps live', () => {
    // `npm run lint` is the check people skip: it is the one gate the Deploy workflow alone
    // runs, so a lint-only failure passes typecheck and tests and blocks the deploy silently.
    // While it lived inside `unit-tests` it was gated for free. Now it is a `needs:` entry —
    // one word, deletable, and nothing goes red if it goes missing.
    const owner = ['unit-tests', 'lint'].find((j) => {
      const b = jobBlock(j);
      return b.includes('npm run lint') && b.includes('npm run lint:a11y');
    });
    expect(owner, 'no job runs both `npm run lint` and `npm run lint:a11y`').toBeDefined();

    for (const deployer of ['deploy-frontend', 'deploy-functions']) {
      const needs = /needs:\s*\[([^\]]*)\]/.exec(jobBlock(deployer))?.[1] ?? '';
      expect(
        needs.split(',').map((s) => s.trim()),
        `${deployer} no longer needs "${owner}" — a red lint would ship to production`,
      ).toContain(owner);
    }
  });

  it('serializes every job that touches a shared external resource', () => {
    // There is no workflow-level group any more, so this is the ONLY thing stopping two runs
    // building against the same Vercel project, aliasing out of order, or running two
    // `supabase functions deploy` sweeps at once — the last of which reports ✅ while silently
    // uploading stale code (2026-06-01).
    expect(
      /^concurrency:/m.test(wfLF),
      'a workflow-level concurrency group is back — it serializes the hermetic gates too, ' +
        'which is what cost 9 minutes of queueing per push',
    ).toBe(false);

    const groups = new Map<string, string>();
    for (const job of ['deploy-frontend', 'promote', 'deploy-functions']) {
      const group = /concurrency:\s*\n\s*group:\s*(\S+)/.exec(jobBlock(job))?.[1];
      expect(group, `${job} has no concurrency group — two runs can now race on it`).toBeDefined();
      // Distinct groups, and this is not tidiness: deploy-frontend and deploy-functions run
      // CONCURRENTLY inside one run, so a shared group makes them cancel each other and the
      // run half-deploys itself.
      expect(
        groups.get(group!),
        `${job} shares its concurrency group with ${groups.get(group!)}`,
      ).toBeUndefined();
      groups.set(group!, job);
    }
  });
});
