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
 * So every entrypoint must be positively accounted for before a baseline is written. A
 * `Check <file>` line is the primary evidence, but it is not sufficient on its own:
 * deno prints NOTHING on a cache hit, so a warm cache makes a fully-checked tree look
 * entirely unchecked. Silence therefore triggers a per-file re-run whose EXIT STATUS
 * settles it — 0 means checked and clean, non-zero must come with a parseable error.
 * A file that is silent, non-zero, and mute about why fails the build.
 *
 * Do not weaken that to "no news is good news", and do not add `|| true` in the
 * workflow (see .github/workflows/semgrep.yml for what happened the last time a gate
 * here was allowed to swallow its own failure).
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

/**
 * Functions that cannot be checked on any machine we have, with the reason.
 *
 * This is a CAP ON COVERAGE, so it is reported loudly on every run and written into the
 * baseline — never silently skipped. Adding an entry needs a reason and a way out.
 *
 * `agent-chat` dynamically imports 41 tool modules pulling `@langchain/{anthropic,langgraph,core}`
 * + zod. langgraph's generics instantiate into a type graph that does not fit in 12 GB even
 * checked entirely alone — measured, not estimated: it OOMs at 4 GB in a batch, at 8 GB alone,
 * and at 12 GB alone. This dev machine has 15.7 GB total / 9.5 GB free and GitHub's standard
 * runners have 16 GB, so there is no heap setting that makes it pass anywhere we run.
 * `skipLibCheck` does not help — the cost is instantiating those types, not error-checking
 * their .d.ts files.
 *
 * The way out is to shrink the graph, which is already the house convention for the Python
 * side (CLAUDE.md pipeline §10: no SDK clients for AI providers). Until then, one unchecked
 * function named in every run beats a gate that is permanently red and therefore ignored.
 */
const UNCHECKABLE = new Map([
  ['agent-chat/index.ts',
   'type graph exceeds 12 GB even alone (@langchain/langgraph generics); no runner has the heap'],
]);

/** Entrypoints: supabase/functions/<name>/index.ts, skipping _shared and friends. */
function entrypoints() {
  return readdirSync(FN_DIR)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter((n) => statSync(join(FN_DIR, n)).isDirectory())
    .map((n) => join(FN_DIR, n, 'index.ts'))
    .filter(existsSync)
    .filter((f) => !UNCHECKABLE.has(rel(f).replace(/^supabase\/functions\//, '')))
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

  console.log(`Checking ${files.length} edge functions across ${groups.size} import maps…`);
  // No silent caps (CLAUDE.md): say out loud, every run, what this sweep does NOT cover.
  if (UNCHECKABLE.size > 0) {
    console.log(`\n⚠ NOT COVERED — ${UNCHECKABLE.size} function(s) excluded from this gate:`);
    for (const [f, why] of UNCHECKABLE) console.log(`    ${f} — ${why}`);
  }
  console.log('');

/**
 * Heap sizes, in order of escalation.
 *
 * Nearly every edge function checks comfortably in 4 GB. ONE (agent-chat) pulls
 * `@langchain/{anthropic,langgraph,core}` + zod, and langgraph's generics instantiate into a type
 * graph that does not fit in 8 GB even checked alone — `skipLibCheck` does not help, because the
 * cost is instantiating those types, not error-checking their `.d.ts` files.
 *
 * Running everything at the size that one function needs made the whole sweep expensive. So the
 * ceiling is paid only where it is actually required: a batch starts at 4 GB, and a LONE file that
 * OOMs is retried at the high mark before being declared a failure.
 */
const HEAP_MB = [4096, 12288];

/**
 * One `deno check` invocation at a given heap.
 *
 * Returns the exit status alongside the output, and BOTH are load-bearing. `deno check` prints
 * `Check <file>` only when it does uncached work — on a cache hit it prints nothing at all and
 * exits 0. So output alone cannot tell "checked previously, clean" apart from "never ran", which
 * is what the coverage pass below uses the status for.
 */
  const runCheck = (cfg, batch, heapMb) => {
    const res = spawnSync(
      'deno',
      [
        'check',
        '--node-modules-dir=auto',
        '--config', cfg,
        `--v8-flags=--max-old-space-size=${heapMb}`,
        ...batch,
      ],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    return { out: stripAnsi(`${res.stdout ?? ''}\n${res.stderr ?? ''}`), status: res.status };
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
    const { out } = runCheck(cfg, batch, HEAP_MB[0]);
    if (!isOom(out)) { harvest(out); return; }

    // Splitting first is deliberate: a batch that died because six graphs shared one heap is far
    // cheaper to halve than to re-run at the high mark. Only once a file is ALONE is the heap
    // itself the thing left to blame.
    if (batch.length > 1) {
      const mid = Math.ceil(batch.length / 2);
      console.log(`  ↳ out of memory on ${batch.length} files; retrying as ${mid} + ${batch.length - mid}`);
      checkBatch(cfg, batch.slice(0, mid));
      checkBatch(cfg, batch.slice(mid));
      return;
    }

    for (const heap of HEAP_MB.slice(1)) {
      console.log(`  ↳ ${rel(batch[0])} needs more than ${HEAP_MB[0]} MB; retrying at ${heap} MB`);
      const { out: retry } = runCheck(cfg, batch, heap);
      if (!isOom(retry)) { harvest(retry); return; }
    }
    console.error(`FATAL: deno ran out of memory checking ${rel(batch[0])} on its own at `
      + `${HEAP_MB[HEAP_MB.length - 1]} MB. Shrink its type graph — dropping the @langchain/* `
      + 'dependencies for direct Anthropic REST calls is the standing convention (CLAUDE.md §10).');
    sawFatal = true;
  };

  for (const [cfg, groupFiles] of groups) {
    for (let i = 0; i < groupFiles.length; i += BATCH) {
      checkBatch(cfg, groupFiles.slice(i, i + BATCH));
    }
  }

  // ── Coverage assertion: the whole point of this script ────────────────────
  // A `Check <file>` line proves deno did the work. Its ABSENCE proves nothing, because deno is
  // silent on a cache hit: run the sweep twice and the second run reports zero coverage on
  // identical, fully-checked code. That is not a theoretical edge — it made a local run report
  // "20 entrypoints never reported" while every one of them was checked and clean, which is the
  // precise false alarm this assertion exists to avoid raising.
  // So silence is not a verdict, it is a question, and it gets answered rather than guessed:
  // re-run the quiet file on its own and read its exit status. 0 means deno validated the graph
  // (cached or not) and found nothing; non-zero means it has errors, which harvest() then records.
  // Either way the file is accounted for. Only a file that stays silent AND exits non-zero AND
  // yields no parseable error is genuinely unexplained — and that is a hard failure.
  const expected = files.map((f) => rel(f).replace(/^supabase\/functions\//, ''));
  const quiet = expected.filter((e) => !checked.has(e));

  // Runs even when a FATAL occurred. Gating this on `!sawFatal` meant one OOM anywhere
  // suppressed verification of every quiet file, so a single unfixable function reported
  // 20 healthy ones as "could not be verified" — noise that buries the one real problem.
  if (quiet.length > 0) {
    console.log(`\n${quiet.length} entrypoint(s) produced no Check line (deno is silent on a cache `
      + 'hit); re-running each alone to confirm it was really checked…');
    for (const e of quiet) {
      const file = join(FN_DIR, e);
      const own = join(dirname(file), 'deno.json');
      const cfg = existsSync(own) ? own : ROOT_CONFIG;
      const { out, status } = runCheck(cfg, [file], HEAP_MB[HEAP_MB.length - 1]);
      if (isOom(out)) {
        console.error(`FATAL: ${e} ran out of memory when re-checked alone.`);
        sawFatal = true;
        continue;
      }
      harvest(out);
      if (status === 0) { checked.add(e); continue; }
      // Non-zero: legitimate only if it actually told us what is wrong.
      if ([...seen.values()].includes(e)) { checked.add(e); continue; }
      console.error(`\nFAIL: ${e} exited ${status} without reporting a single parseable error.`);
      console.error(out.split('\n').filter(Boolean).slice(-15).map((l) => `  ${l}`).join('\n'));
      console.error('\nA passing exit code without full coverage is exactly the failure this gate exists to catch.');
      process.exit(1);
    }
  }

  const missing = expected.filter((e) => !checked.has(e));
  console.log(`Coverage: ${checked.size}/${expected.length} entrypoints verified.`);
  if (missing.length > 0) {
    console.error('\nFAIL: these entrypoints could not be verified:');
    for (const m of missing) console.error(`  ${m}`);
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
      // Recorded so the coverage cap is visible in the committed artifact, not only in a
      // build log nobody reads. Guarded by tests/unit/edgeTypecheckGate.test.ts.
      uncheckable: Object.fromEntries(UNCHECKABLE),
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
