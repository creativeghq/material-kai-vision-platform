/**
 * Edge-function typecheck gate guard.
 *
 * `.github/workflows/edge-typecheck.yml` + `scripts/check-edge-functions.mjs` close the blind
 * spot left by `tsconfig.json` excluding `supabase/**` — until 2026-07-30 nothing typechecked
 * the edge functions, and `npm run typecheck` reported success while never looking at them.
 *
 * This test guards the GATE, not the functions. It runs in the unit tier so a gate that has
 * been quietly defanged fails in seconds instead of looking green in CI. The precedent is
 * tests/unit/semgrepRuleset.test.ts: that gate enforced nothing for months because a `|| true`
 * hid an invalid config, and only a unit-tier assertion would have caught it.
 *
 * Deliberately does NOT run deno — that belongs in CI. It asserts the gate is still wired,
 * still blocking, and still baseline-complete.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts/check-edge-functions.mjs');
const WORKFLOW = join(ROOT, '.github/workflows/edge-typecheck.yml');
const BASELINE = join(ROOT, '.github/edge-typecheck-baseline.json');
const FN_DIR = join(ROOT, 'supabase/functions');

/**
 * The entrypoints the gate is supposed to cover — same rule the script uses.
 *
 * Deployable functions PLUS every `_shared/tools/*.ts`. The tool modules are not deployable, but
 * the only function importing them is `agent-chat`, which is the one file the gate cannot check
 * at any heap — so without checking them directly they had no compiler over them at all.
 */
function entrypoints(): string[] {
  const fns = readdirSync(FN_DIR)
    .filter((n) => !n.startsWith('_') && !n.startsWith('.'))
    .filter((n) => statSync(join(FN_DIR, n)).isDirectory())
    .filter((n) => existsSync(join(FN_DIR, n, 'index.ts')));
  const toolsDir = join(FN_DIR, '_shared', 'tools');
  const tools = existsSync(toolsDir)
    ? readdirSync(toolsDir).filter((n) => n.endsWith('.ts')).map((n) => `_shared/tools/${n}`)
    : [];
  return [...fns, ...tools].sort();
}

describe('edge-function typecheck gate', () => {
  it('the runner script and workflow both exist', () => {
    expect(existsSync(SCRIPT), 'scripts/check-edge-functions.mjs is missing').toBe(true);
    expect(existsSync(WORKFLOW), '.github/workflows/edge-typecheck.yml is missing').toBe(true);
  });

  it('the workflow does not swallow failures', () => {
    const wf = readFileSync(WORKFLOW, 'utf8');
    // Strip comments — the header discusses `|| true` in prose explaining why it is banned.
    const code = wf.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
    expect(code, 'edge-typecheck.yml swallows failures with `|| true`').not.toMatch(/\|\|\s*true/);
    expect(code, 'edge-typecheck.yml sets continue-on-error, so the gate cannot fail the build')
      .not.toMatch(/continue-on-error:\s*true/);
  });

  it('the runner still asserts coverage rather than trusting the exit code', () => {
    const src = readFileSync(SCRIPT, 'utf8');
    // Three separate sweeps once reported success having checked nothing (unresolved import ->
    // exit 0, OOM mid-batch, wrong import maps). The coverage check is the whole point.
    expect(src, 'the coverage assertion (missing entrypoints -> exit 1) is gone').toMatch(/missing\.length\s*>\s*0/);
    expect(src, 'the out-of-memory detection is gone').toMatch(/out of memory/i);
    expect(src, 'the script no longer groups functions by their own deno.json import map')
      .toMatch(/groupByConfig/);
  });

  it('the baseline is valid JSON and covers every entrypoint', () => {
    expect(existsSync(BASELINE), 'baseline missing — regenerate with --write-baseline').toBe(true);
    const raw = readFileSync(BASELINE, 'utf8');
    let base: { entrypoints?: number; total?: number; files?: Record<string, number> };
    expect(() => { base = JSON.parse(raw); }, 'baseline does not parse as JSON').not.toThrow();
    base = JSON.parse(raw);

    const all = entrypoints();
    expect(all.length, 'found no edge functions — layout changed?').toBeGreaterThan(50);
    // `uncheckable` is the gate's declared coverage cap. Subtracting it here (rather than
    // ignoring the mismatch) is what keeps the cap honest: the baseline must account for
    // EVERY function as either checked or explicitly excluded with a reason.
    const excluded = Object.keys((base as any).uncheckable ?? {});
    const found = all.length - excluded.length;
    // A baseline recorded against a smaller set would let new functions in unchecked.
    expect(
      base.entrypoints,
      `baseline covers ${base.entrypoints} entrypoints but ${found} are checkable ` +
        `(${all.length} total − ${excluded.length} excluded) — regenerate it ` +
        `(node scripts/check-edge-functions.mjs --write-baseline) so new functions are gated`,
    ).toBe(found);
    expect(typeof base.total, 'baseline has no total').toBe('number');
    expect(base.files, 'baseline has no per-file map').toBeTruthy();
  });

  it('baseline counts are non-negative integers', () => {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { files: Record<string, number> };
    const bad = Object.entries(base.files).filter(([, n]) => !Number.isInteger(n) || n < 0);
    expect(bad, 'baseline contains non-integer or negative counts').toEqual([]);
  });

  /**
   * The coverage cap must stay EMPTY.
   *
   * `agent-chat/index.ts` used to be the one entry, on the grounds that langgraph's generics
   * instantiated a type graph too large for any runner. It is now checked like everything else
   * — clean, in about five seconds — after the LangChain packages were brought up to date
   * (core 1.2.9 swapped its exported Zod types for structural interfaces to stop exactly this)
   * and the blanket `let X: any` runtime singletons were given real types.
   *
   * That exclusion was not free while it lasted: it was the only compiler that could have seen
   * agent-chat, and during it the model call passed `{ system, cache_control }` as call options
   * that ChatAnthropic drops on the floor — so no agent turn carried its system prompt and no
   * turn was ever cached. An entry here is a function nobody is checking. Adding one back needs
   * a measurement, not a memory.
   */
  it('no edge function is excluded from typechecking', () => {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { uncheckable?: Record<string, string> };
    const excluded = base.uncheckable ?? {};

    expect(
      Object.keys(excluded).sort(),
      'the edge-typecheck coverage cap changed. ADDING an entry means a function is no longer ' +
      'typechecked at all: fix it or shrink its type graph first, and only widen this after ' +
      'review — re-measure rather than trusting an older note that it cannot be checked.',
    ).toEqual([]);

    for (const [file, reason] of Object.entries(excluded)) {
      expect(existsSync(join(FN_DIR, file)), `excluded ${file} does not exist — stale entry`).toBe(true);
      expect(String(reason).length, `excluded ${file} has no reason`).toBeGreaterThan(20);
    }
  });
});
