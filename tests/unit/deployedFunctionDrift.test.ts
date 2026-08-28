import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * The deployed-vs-repo drift check (#345).
 *
 * Thirteen edge functions were running in production with no source in this repo — three
 * throwaway experiments, five superseded crons, a replaced webhook, two probes, a seeder, and
 * `generate-pbr-maps`, which CLAUDE.md recorded as deleted while v54 of it was still live. None
 * could be read, reviewed, fixed or redeployed. They accumulated because the deploy workflow
 * only ever asked which repo functions need shipping, never which deployed functions have no
 * source.
 *
 * These cases cannot reach the Management API, so they do not check for drift. They check the
 * three things that would make the drift check itself worthless:
 *   1. nothing runs it,
 *   2. it passes when it cannot actually run,
 *   3. its idea of "a function" differs from the deploy workflow's.
 */

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

const SCRIPT = 'scripts/check-deployed-functions.mjs';
const WORKFLOW = '.github/workflows/deploy.yml';
const BASELINE = '.github/deployed-function-orphans.json';

describe('#345 — the drift check is wired up', () => {
  it('the deploy workflow actually runs it', () => {
    // A check nobody invokes is the same as no check, and reads as coverage from the outside.
    const wf = read(WORKFLOW);
    expect(wf).toContain('scripts/check-deployed-functions.mjs');
  });

  it('it runs with the credentials it needs', () => {
    // The step is inside the functions job precisely because that is the only job holding a
    // management token. Without these two it can only fail-closed on every run, which would
    // get it deleted rather than fixed.
    const wf = read(WORKFLOW);
    const step = wf.slice(wf.indexOf('Deployed-vs-repo drift'));
    expect(step).toContain('SUPABASE_ACCESS_TOKEN');
    expect(step).toContain('PROJECT_REF');
  });
});

describe('#345 — it fails closed when it cannot run', () => {
  it('exits non-zero with no token instead of reporting success', () => {
    // The failure mode this whole check exists to prevent is a green signal that means
    // nothing. Skipping on absent credentials would make it pass hardest exactly when it is
    // not running. Run for real rather than grepping the source for a `process.exit(1)`.
    const res = spawnSync(process.execPath, [join(ROOT, SCRIPT)], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, SUPABASE_ACCESS_TOKEN: '', PROJECT_REF: '', SUPABASE_PROJECT_ID: '' },
    });
    expect(res.status).not.toBe(0);
    expect(`${res.stderr}${res.stdout}`).toMatch(/SUPABASE_ACCESS_TOKEN and PROJECT_REF are required/);
  });
});

describe('#345 — the script and the workflow agree on what a function is', () => {
  /** The rule both sides must use: a directory that is not `_shared` and has an `index.ts`. */
  const expected = readdirSync(join(ROOT, 'supabase', 'functions'))
    .filter((n) => n !== '_shared')
    .filter((n) => {
      const d = join(ROOT, 'supabase', 'functions', n);
      return statSync(d).isDirectory() && existsSync(join(d, 'index.ts'));
    })
    .sort();

  it('the script enumerates exactly that set', async () => {
    const { repoFunctions } = await import(`file://${join(ROOT, SCRIPT)}`);
    expect(repoFunctions()).toEqual(expected);
  });

  it('the workflow requires an index.ts too, not merely a directory', () => {
    // `deno check --node-modules-dir=auto` drops a `supabase/functions/node_modules/` in
    // exactly the place the old "every directory except _shared" rule was looking, and
    // `supabase functions deploy node_modules` fails the entire deploy job. The two sides
    // measuring different sets would also make the drift check report phantom differences.
    const wf = read(WORKFLOW);
    const block = wf.slice(wf.indexOf('ALL=$('), wf.indexOf('FUNCS=""'));
    expect(block).toContain('index.ts');
    expect(block).toContain('_shared');
  });

  it('it finds a real, non-trivial set', () => {
    // An enumeration that came back empty would make "nothing is missing" trivially true.
    expect(expected.length).toBeGreaterThan(50);
    expect(expected).not.toContain('node_modules');
    expect(expected).toContain('agent-chat');
  });
});

describe('#345 — the orphan list is a ratchet, and an honest one', () => {
  const baseline = JSON.parse(read(BASELINE)) as {
    orphans: Record<string, { reason?: string; wayOut?: string }>;
  };

  it('every recorded orphan says what it is and how it leaves', () => {
    // "Each entry needs a reason and a way out" — without that the file becomes a list of
    // things nobody remembers, which is how the thirteen became undecidable in the first place.
    for (const [slug, entry] of Object.entries(baseline.orphans)) {
      expect(entry.reason, `${slug} has no reason`).toBeTruthy();
      expect(entry.reason!.length, `${slug}'s reason is too thin to act on`).toBeGreaterThan(40);
      expect(entry.reason, `${slug} still has the placeholder reason`).not.toMatch(/^TODO/);
      expect(entry.wayOut, `${slug} has no way out`).toBeTruthy();
    }
  });

  it('no recorded orphan has source in the repo', () => {
    // If it has source it is not an orphan, and leaving it listed hides a real deploy gap.
    for (const slug of Object.keys(baseline.orphans)) {
      expect(
        existsSync(join(ROOT, 'supabase', 'functions', slug, 'index.ts')),
        `${slug} has source in the repo — it is not an orphan and must leave this file`,
      ).toBe(false);
    }
  });
});
