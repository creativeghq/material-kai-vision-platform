#!/usr/bin/env node
/**
 * Typecheck every Supabase edge function with `deno check`.
 *
 * WHY THIS EXISTS
 * ---------------
 * `tsconfig.json` excludes `supabase/**`, so until 2026-07-30 nothing typechecked the
 * 107 edge functions. `npm run typecheck` reported success while never looking at them.
 * That blind spot hid, among others: token/cost logging that always wrote 0 (AI SDK v4
 * field names against a v6 pin), a Kling provider called as a function so every video
 * generation threw, a refund path that threw ReferenceError inside its own catch, and
 * a tenancy binding reading a field that does not exist on AuthResult.
 *
 * COVERAGE IS ASSERTED, NOT ASSUMED
 * ---------------------------------
 * While building this, three separate sweep attempts reported success without having
 * checked anything: one exited 0 on an unresolved npm import, one crashed with a V8
 * out-of-memory partway through a batch, and one used the wrong import maps. An exit
 * code alone is not evidence that the work happened — the same lesson as
 * `ops.silent_zero` and `ops.test_artifacts_accumulating`.
 *
 * So this script requires a `Check <file>` line back from deno for EVERY entrypoint it
 * set out to check, and fails if any are missing. Do not remove that assertion, and do
 * not add `|| true` in the workflow (see .github/workflows/semgrep.yml for what happened
 * the last time a gate here was allowed to swallow its own failure).
 *
 * PER-FUNCTION IMPORT MAPS
 * ------------------------
 * 31 of the functions ship their own `deno.json` with extra import mappings; the rest use
 * `supabase/functions/deno.json`. Checking everything against one config produces bogus
 * "not a dependency" errors. Functions are therefore grouped by config and each group is
 * checked with its own.
 *
 * BASELINE
 * --------
 * The tree is not error-free yet (mostly strict-null-check findings that need individual
 * judgement). `.github/edge-typecheck-baseline.json` records the per-function count, and
 * this gate fails when a count goes UP or a new file starts erroring. That blocks new
 * breakage today instead of waiting for a big-bang cleanup. Lower the numbers as you fix
 * things: `node scripts/check-edge-functions.mjs --write-baseline`.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';

const ROOT = process.cwd();
const FN_DIR = join(ROOT, 'supabase', 'functions');
const ROOT_CONFIG = join(FN_DIR, 'deno.json');
const BASELINE = join(ROOT, '.github', 'edge-typecheck-baseline.json');
const BATCH = 6;
const WRITE = process.argv.includes('--write-baseline');

/** Entrypoints: supabase/functions/<name>/index.ts, skipping _shared and friends. */
function entrypoints() {
  return readdirSync(FN_DIR)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter((n) => statSync(join(FN_DIR, n)).isDirectory())
    .map((n) => join(FN_DIR, n, 'index.ts'))
    .filter(existsSync)
    .sort();
}

/** Group entrypoints by the config that governs them (own deno.json wins). */
function groupByConfig(files) {
  const groups = new Map();
  for (const f of files) {
    const own = join(dirname(f), 'deno.json');
    const cfg = existsSync(own) ? own : ROOT_CONFIG;
    if (!groups.has(cfg)) groups.set(cfg, []);
    groups.get(cfg).push(f);
  }
  return groups;
}

const rel = (p) => p.slice(ROOT.length + 1).split('\\').join('/');
const stripAnsi = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');

// NOTE the {4,5}: TS codes are not all four digits (TS18047, TS18046 are strict-null checks).
// A `TS\d{4}` pattern silently mis-parses those, which is exactly how an earlier ad-hoc tally
// of mine reported a phantom "TS1804" class.
const ERROR_RE = /^TS\d{4,5} \[ERROR\]/;
/** `    at file:///…/supabase/functions/<rest>:line:col` → [, file, line, col] */
const LOC_RE_FULL = /at file:\/\/\/.*?\/supabase\/functions\/(.+?):(\d+):(\d+)\s*$/;

function main() {
  const files = entrypoints();
  if (files.length === 0) {
    console.error('FAIL: found no edge-function entrypoints — wrong cwd, or the layout changed.');
    process.exit(1);
  }

  const groups = groupByConfig(files);
  const checked = new Set();
  /**
   * Distinct errors, keyed `file:line:col:message`.
   *
   * MUST be de-duplicated: a `_shared/*` file is pulled into many batches, so the same
   * error is reported once per batch that imports it. Counting occurrences would make the
   * baseline depend on BATCH size and grouping — change either and the gate fails on
   * unchanged code. Distinct errors are a property of the tree, not of how it was scanned.
   */
  const seen = new Map(); // `file:line:col:message` -> file
  let sawFatal = false;

  console.log(`Checking ${files.length} edge functions across ${groups.size} import maps…\n`);

  /** One `deno check` invocation. Returns its combined, ANSI-stripped output. */
  const runCheck = (cfg, batch) => {
    const res = spawnSync(
      'deno',
      [
        'check',
        '--node-modules-dir=auto',
        '--config', cfg,
        // agent-chat dynamically imports @langchain/{anthropic,langgraph,core} + zod. Lazy
        // `import()` keeps its BOOT fast but does nothing for the checker, which walks the whole
        // type graph regardless — so this one function needs far more heap than the 4 GB default.
        // It does not fit in 8 GB even checked on its own (the split-retry below proved that by
        // isolating it), and GitHub's standard runners have 16 GB, so 12 leaves room for the OS.
        '--v8-flags=--max-old-space-size=12288',
        ...batch,
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return stripAnsi(`${res.stdout ?? ''}\n${res.stderr ?? ''}`);
  };

  const isOom = (out) => /Fatal JavaScript out of memory|Ineffective mark-compacts/.test(out);

  /** Harvest `Check <file>` coverage lines and distinct errors out of one run's output. */
  const harvest = (out) => {
    for (const line of out.split('\n')) {
      const m = line.match(/^Check (.+index\.ts)\s*$/);
      if (m) checked.add(m[1].split('\\').join('/').replace(/^.*supabase\/functions\//, ''));
    }
    let pending = null;
    for (const line of out.split('\n')) {
      if (ERROR_RE.test(line.trim())) { pending = line.trim(); continue; }
      const loc = line.match(LOC_RE_FULL);
      if (loc && pending) {
        const f = loc[1].split('\\').join('/');
        seen.set(`${f}:${loc[2]}:${loc[3]}:${pending}`, f);
        pending = null;
      }
    }
  };

  /**
   * Check a batch, splitting it on out-of-memory rather than giving up.
   *
   * A batch shares ONE deno process, so a heavyweight function is checked on top of whatever else
   * happens to sit beside it — which made coverage depend on alphabetical position. When the batch
   * died, every entrypoint in it went unreported, the coverage assertion failed, and no baseline
   * could ever be written. Halving and retrying isolates the expensive one and lets its neighbours
   * through; only a function that OOMs *alone* is a genuine failure, and that one gets named.
   */
  const checkBatch = (cfg, batch) => {
    const out = runCheck(cfg, batch);
    if (!isOom(out)) { harvest(out); return; }
    if (batch.length === 1) {
      console.error(`FATAL: deno ran out of memory checking ${rel(batch[0])} on its own — its type `
        + 'graph does not fit in 8 GB. Raise --max-old-space-size or shrink the graph.');
      sawFatal = true;
      return;
    }
    const mid = Math.ceil(batch.length / 2);
    console.log(`  ↳ out of memory on ${batch.length} files; retrying as ${mid} + ${batch.length - mid}`);
    checkBatch(cfg, batch.slice(0, mid));
    checkBatch(cfg, batch.slice(mid));
  };

  for (const [cfg, groupFiles] of groups) {
    for (let i = 0; i < groupFiles.length; i += BATCH) {
      checkBatch(cfg, groupFiles.slice(i, i + BATCH));
    }
  }

  // ── Coverage assertion: the whole point of this script ────────────────────
  const expected = files.map((f) => rel(f).replace(/^supabase\/functions\//, ''));
  const missing = expected.filter((e) => !checked.has(e));
  console.log(`Coverage: ${checked.size}/${expected.length} entrypoints reported back from deno.`);
  if (missing.length > 0) {
    console.error('\nFAIL: deno never reported checking these entrypoints:');
    for (const m of missing) console.error(`  ${m}`);
    console.error('\nA passing exit code without full coverage is exactly the failure this gate exists to catch.');
    process.exit(1);
  }
  if (sawFatal) {
    console.error('\nFAIL: an out-of-memory crash occurred; results are not trustworthy.');
    process.exit(1);
  }

  /** file -> distinct error count, derived from `seen` so batching cannot affect it. */
  const counts = new Map();
  for (const f of seen.values()) counts.set(f, (counts.get(f) ?? 0) + 1);

  const total = seen.size;
  const sorted = [...counts.entries()].sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0]));

  if (WRITE) {
    const payload = {
      _comment:
        'Per-file deno-check error counts. The gate fails when a count rises or a new file appears. ' +
        'Lower these as you fix things; regenerate with: node scripts/check-edge-functions.mjs --write-baseline',
      entrypoints: expected.length,
      total,
      files: Object.fromEntries(sorted),
    };
    writeFileSync(BASELINE, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`\nWrote baseline: ${total} errors across ${counts.size} files -> ${rel(BASELINE)}`);
    return;
  }

  if (!existsSync(BASELINE)) {
    console.error(`\nFAIL: no baseline at ${rel(BASELINE)}. Create it with --write-baseline.`);
    process.exit(1);
  }
  const base = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const baseFiles = base.files ?? {};

  const worse = [];
  for (const [f, n] of sorted) {
    const allowed = baseFiles[f] ?? 0;
    if (n > allowed) worse.push({ f, n, allowed });
  }
  const improved = Object.entries(baseFiles).filter(([f, n]) => (counts.get(f) ?? 0) < n);

  console.log(`Errors: ${total} (baseline ${base.total ?? 0}) across ${counts.size} files.`);

  if (worse.length > 0) {
    console.error('\nFAIL: new or increased type errors:');
    for (const { f, n, allowed } of worse) console.error(`  ${f}: ${n} (baseline ${allowed})`);
    console.error('\nFix them, or if a count legitimately moves, update the baseline in the same commit and say why.');
    process.exit(1);
  }

  if (improved.length > 0) {
    console.log(`\n${improved.length} file(s) improved below baseline — regenerate it to lock the gain in:`);
    for (const [f, n] of improved.slice(0, 10)) console.log(`  ${f}: ${counts.get(f) ?? 0} (baseline ${n})`);
  }
  console.log('\nOK: no new edge-function type errors.');
}

main();
