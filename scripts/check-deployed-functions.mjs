/**
 * Compare the DEPLOYED edge functions against the ones with source in this repo.
 *
 * WHY THIS EXISTS. The deploy workflow has always asked one direction of the question — which
 * repo functions need shipping — and never the other. By 2026-08-11 that had let **thirteen**
 * functions accumulate in production with no directory under `supabase/functions/`: three
 * throwaway `tmp-*`/`demo-*` experiments, five crons superseded by `monitoring-cron`, a
 * `ses-webhook` replaced by `email-webhooks`, two diagnostic probes, a one-off seeder, and
 * `generate-pbr-maps` — which CLAUDE.md recorded as *deleted* while version 54 of it was still
 * live. None could be read, reviewed, fixed or redeployed; they could only be invoked or
 * deleted. That is issue #345, and its own conclusion was that the check is the part worth
 * doing "regardless of what happens to the thirteen: without it this recurs".
 *
 * IT IS A RATCHET, NOT A WALL. A known orphan is recorded in
 * `.github/deployed-function-orphans.json` with a reason, and the list may only shrink. That
 * shape is deliberate and matches `edge-typecheck-baseline.json`:
 *   - failing outright on every orphan would block deploys on something you often cannot fix in
 *     the same commit (deleting a deployed function needs a management token, not a merge), and
 *     a red gate nobody can act on trains people to ignore red gates;
 *   - reporting without failing is what allowed thirteen to pile up in the first place.
 * So a NEW orphan is a hard failure and a recorded one is not.
 *
 * IT ALSO ASKS THE REVERSE. A function with source that is NOT deployed is the silent-zero
 * shape from CLAUDE.md: nothing errors, the code simply never runs. That is always a failure —
 * there is no baseline for it, because it has never been true and must not become true.
 *
 * FAIL CLOSED ON A MISSING TOKEN. Skipping when the credentials are absent would make the
 * check pass hardest exactly when it is not running, which is the failure mode it exists to
 * catch. In CI the token is always present; locally you are expected not to run this.
 *
 * Usage:
 *   node scripts/check-deployed-functions.mjs
 *   node scripts/check-deployed-functions.mjs --write-baseline
 *
 * Env: SUPABASE_ACCESS_TOKEN, and PROJECT_REF (or SUPABASE_PROJECT_ID).
 */
import { readdirSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN_DIR = join(ROOT, 'supabase', 'functions');
const BASELINE = join(ROOT, '.github', 'deployed-function-orphans.json');
const WRITE = process.argv.includes('--write-baseline');

/**
 * The functions this repo can deploy.
 *
 * `index.ts` is REQUIRED, not just a directory. The deploy workflow's own list is every
 * directory except `_shared`, which is correct for a clean checkout and wrong the moment
 * anything creates a stray directory there — `deno check --node-modules-dir=auto` drops a
 * `supabase/functions/node_modules/` in exactly that spot, and `supabase functions deploy
 * node_modules` fails the whole job. Requiring the entrypoint costs nothing and cannot be
 * wrong: a directory with no `index.ts` is not a function by any definition the CLI accepts.
 */
export function repoFunctions() {
  return readdirSync(FN_DIR)
    .filter((n) => n !== '_shared')
    .filter((n) => {
      const d = join(FN_DIR, n);
      return statSync(d).isDirectory() && existsSync(join(d, 'index.ts'));
    })
    .sort();
}

function readBaseline() {
  if (!existsSync(BASELINE)) return { orphans: {} };
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

async function deployedFunctions() {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = process.env.PROJECT_REF || process.env.SUPABASE_PROJECT_ID;
  if (!token || !ref) {
    console.error('FAIL: SUPABASE_ACCESS_TOKEN and PROJECT_REF are required.');
    console.error('  This check fails rather than skips when it cannot run — a check that passes');
    console.error('  loudest when it is not running is the exact failure it exists to catch.');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/functions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`FAIL: Management API returned ${res.status} ${res.statusText}`);
    console.error(await res.text().catch(() => ''));
    process.exit(1);
  }
  const body = await res.json();
  const list = Array.isArray(body) ? body : (body.functions ?? []);
  if (!Array.isArray(list) || list.length === 0) {
    // An empty list would make every "orphan" check pass and every "missing" check fail
    // loudly, so it cannot be silently mistaken for a clean result — but say so plainly.
    console.error('FAIL: the Management API returned no functions. That is not a clean result.');
    process.exit(1);
  }
  return list;
}

const main = async () => {
  const repo = repoFunctions();
  const deployed = await deployedFunctions();
  const deployedSlugs = deployed.map((f) => f.slug).sort();

  const bySlug = new Map(deployed.map((f) => [f.slug, f]));
  const orphans = deployedSlugs.filter((s) => !repo.includes(s));
  const missing = repo.filter((s) => !deployedSlugs.includes(s));

  console.log(`Repo functions: ${repo.length} · deployed: ${deployedSlugs.length}`);

  if (WRITE) {
    const out = {
      _comment:
        'Edge functions deployed with NO source in this repo. They cannot be read, reviewed, '
        + 'fixed or redeployed — only invoked or deleted. The list may only SHRINK: a new orphan '
        + 'fails the build. Each entry needs a reason and a way out. Regenerate with: '
        + 'node scripts/check-deployed-functions.mjs --write-baseline',
      orphans: Object.fromEntries(
        orphans.map((s) => [
          s,
          readBaseline().orphans?.[s] ?? {
            reason: 'TODO — say what this is and why it is still deployed',
            version: bySlug.get(s)?.version ?? null,
          },
        ]),
      ),
    };
    writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
    console.log(`Wrote ${orphans.length} orphan(s) to .github/deployed-function-orphans.json`);
    return;
  }

  const baseline = readBaseline();
  const known = Object.keys(baseline.orphans ?? {});
  const newOrphans = orphans.filter((s) => !known.includes(s));
  const staleEntries = known.filter((s) => !orphans.includes(s));

  let failed = false;

  if (missing.length > 0) {
    // No baseline for this, on purpose. A function whose source is in the repo and which is
    // not deployed does not error anywhere — it simply never runs.
    console.error('\nFAIL: these functions have source in the repo but are NOT deployed:');
    for (const m of missing) console.error(`  ${m}`);
    console.error('Nothing errors when this happens; the code just never runs.');
    failed = true;
  }

  if (newOrphans.length > 0) {
    console.error('\nFAIL: these functions are DEPLOYED with no source in this repo:');
    for (const o of newOrphans) {
      console.error(`  ${o} (v${bySlug.get(o)?.version ?? '?'})`);
    }
    console.error('\nNobody can read, review, fix or redeploy them. Either delete the function');
    console.error('  supabase functions delete <slug> --project-ref "$PROJECT_REF"');
    console.error('or record it with a reason and a way out:');
    console.error('  node scripts/check-deployed-functions.mjs --write-baseline');
    failed = true;
  }

  if (staleEntries.length > 0) {
    // Keeps the ratchet honest. A recorded orphan that is gone must leave the file, or the
    // list stops describing production and starts being decoration.
    console.error('\nFAIL: these baseline entries are no longer deployed — remove them:');
    for (const s of staleEntries) console.error(`  ${s}`);
    failed = true;
  }

  if (failed) process.exit(1);

  if (orphans.length > 0) {
    console.log(`\n${orphans.length} known orphan(s), each recorded with a reason:`);
    for (const o of orphans) console.log(`  ${o} — ${baseline.orphans[o]?.reason ?? '(no reason)'}`);
    console.log('This list may only shrink.');
  }
  console.log('\nOK: no drift between deployed functions and repo source.');
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
