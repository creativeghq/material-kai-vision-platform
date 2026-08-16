/**
 * Semgrep ruleset validity guard.
 *
 * `.github/semgrep-security.yml` is the code-level half of the invariants (the DB
 * half is check_security_invariants(), run by the data-integrity cron). It was INVALID YAML from
 * the day it was added — an unquoted pattern containing `": F"` parsed as a nested mapping — so
 * semgrep loaded zero rules and exited non-zero on every run. The workflow ran it with
 * `|| true`, so the job went green and the gate silently enforced nothing.
 *
 * The workflow is blocking now, but a malformed ruleset is exactly the failure that hid before,
 * so assert it parses HERE too: the unit tier fails in seconds, without pulling a container.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { load as parse } from 'js-yaml';

const RULESET = join(process.cwd(), '.github/semgrep-security.yml');
const WORKFLOW = join(process.cwd(), '.github/workflows/semgrep.yml');

describe('semgrep security ruleset', () => {
  const raw = readFileSync(RULESET, 'utf8');

  it('is valid YAML', () => {
    expect(() => parse(raw), 'semgrep-security.yml does not parse — semgrep would load 0 rules').not.toThrow();
  });

  // Semgrep has no `tsx` / `jsx` language — the ruleset declared `tsx` and semgrep rejected the
  // WHOLE config (UnknownLanguageError), which report-only hid. `.tsx` files are covered by
  // `typescript`; verified by scanning a probe component.
  const VALID_LANGUAGES = new Set([
    'typescript', 'ts', 'javascript', 'js', 'python', 'py', 'python3',
    'json', 'yaml', 'html', 'sql', 'bash', 'sh', 'go', 'ruby', 'java', 'generic', 'regex',
  ]);

  it('declares only language identifiers semgrep accepts', () => {
    const doc = parse(raw) as { rules: Array<{ id: string; languages: string[] }> };
    const bad = doc.rules.flatMap((r) =>
      (r.languages ?? []).filter((l) => !VALID_LANGUAGES.has(l)).map((l) => `${r.id}: ${l}`));
    expect(
      bad,
      `Unknown semgrep language(s). semgrep rejects the ENTIRE config on one bad language, ` +
        `so every rule silently stops running. Note there is no 'tsx'/'jsx' — '.tsx' is covered ` +
        `by 'typescript'.`,
    ).toEqual([]);
  });

  /**
   * The UTC-date rule is deliberately NARROW — it matches `new Date()` and `Date.now() ± n`, and
   * leaves `d.toISOString().slice(0, 10)` on a variable alone, because three modules
   * (projects/lib/schedule, financeService.nextRecurrenceDate, ordersService's aging-view
   * alignment) do all their arithmetic in UTC and are self-consistent. Widening it to any
   * `.toISOString().slice` would flag those and the fix would be to suppress it, which is how a
   * rule stops being read. Pin the narrowness so it is a decision, not a drift.
   */
  it('scopes the UTC-date rule to the frontend and to unambiguous now-shapes', () => {
    const doc = parse(raw) as {
      rules: Array<{ id: string; paths?: { include?: string[] }; 'pattern-either'?: Array<{ pattern: string }> }>;
    };
    const rule = doc.rules.find((r) => r.id === 'no-utc-today-as-local-date');
    expect(rule, 'the UTC-date rule is gone — 25 sites regress silently without it').toBeTruthy();
    const pats = (rule!['pattern-either'] ?? []).map((p) => p.pattern);
    // Every pattern must start from a NOW expression. `new Date($X)` on a variable is not one.
    for (const p of pats) {
      expect(p, `"${p}" would also match deliberate UTC arithmetic on a variable`)
        .toMatch(/^new Date\((\)|Date\.now\(\) [+-] \$N\))/);
    }
    expect(pats.some((p) => p.includes("split('T')[0]")), 'the split() spelling must be covered too').toBe(true);
    // Edge functions and MIVAA run in UTC by definition and have no workspace timezone to resolve
    // against; only `src/**` runs in the operator's browser, where "today" means their calendar.
    expect(rule!.paths?.include).toEqual(['/src/**']);
  });

  it('keeps the JSX rules anchored to an element (the empty-pattern trap)', () => {
    // `dangerouslySetInnerHTML={=~/.*/}` parsed fine and matched NOTHING for months. A pattern
    // that cannot match is indistinguishable from a clean codebase, so pin the working shape.
    const doc = parse(raw) as { rules: Array<{ id: string; 'pattern-either'?: Array<{ pattern: string }> }> };
    const rule = doc.rules.find((r) => r.id === 'no-dangerously-set-inner-html');
    expect(rule, 'the dangerouslySetInnerHTML rule is gone').toBeTruthy();
    const pats = (rule!['pattern-either'] ?? []).map((p) => p.pattern).join('\n');
    expect(pats, 'pattern must anchor to a JSX element or it matches nothing').toContain('<$EL');
    expect(pats).toContain('dangerouslySetInnerHTML');
  });

  /**
   * Patterns that semgrep REJECTS. A rule whose pattern fails to parse is not skipped quietly at
   * the rule level — semgrep reports a "Rule parse error" and the rule matches nothing, which on
   * a clean-looking scan is indistinguishable from a codebase with no violations.
   *
   * The entry below cost a real debugging cycle while writing the rules: `catch (...)` gives
   * "Invalid pattern for JavaScript/TypeScript: Stdlib.Parsing.Parse_error". The binding form
   * `catch ($E)` is correct AND also matches a bare `catch {`, so it is strictly better anyway.
   *
   * Only syntax CONFIRMED against semgrep belongs in this list. A trailing `...` in an object
   * pattern (`{ ..., allowed: true, ... }`) was nearly added here on the assumption it shared the
   * blame; probing it showed it parses fine in both typescript and python. A guard built on a
   * guess would have blocked valid patterns forever.
   */
  const FORBIDDEN_PATTERN_SYNTAX: Array<{ re: RegExp; why: string }> = [
    { re: /catch\s*\(\s*\.\.\.\s*\)/, why: '`catch (...)` is a parse error — use `catch ($E)`, which also matches a bare `catch {`' },
  ];

  it('uses no pattern syntax semgrep rejects', () => {
    const doc = parse(raw) as { rules: Array<Record<string, unknown>> };
    const offenders: string[] = [];
    for (const rule of doc.rules) {
      // Every pattern in the rule, however nested (pattern / pattern-either / patterns /
      // pattern-inside / pattern-not), reduced to a flat list of strings.
      const pats: string[] = [];
      const walk = (node: unknown): void => {
        if (typeof node === 'string') pats.push(node);
        else if (Array.isArray(node)) node.forEach(walk);
        else if (node && typeof node === 'object') {
          for (const [k, v] of Object.entries(node)) if (k.startsWith('pattern')) walk(v);
        }
      };
      for (const [k, v] of Object.entries(rule)) if (k.startsWith('pattern')) walk(v);
      for (const p of pats) {
        for (const { re, why } of FORBIDDEN_PATTERN_SYNTAX) {
          if (re.test(p)) offenders.push(`${rule.id}: ${why}\n    ${p.trim().slice(0, 90)}`);
        }
      }
    }
    expect(
      offenders,
      'These patterns do not parse, so their rules load and match NOTHING — the scan goes green ' +
      'and enforces nothing. Verify a new rule against a probe file before trusting a clean run.\n' +
      offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * `no-swallowed-write` matches a bare `$X.insert(...)`, so WITHOUT its `pattern-inside` context
   * it flags every write in the platform. The narrowing clause is the rule, not a detail.
   */
  it('keeps no-swallowed-write anchored to the empty-catch context', () => {
    const doc = parse(raw) as { rules: Array<{ id: string; patterns?: Array<Record<string, unknown>> }> };
    const rule = doc.rules.find((r) => r.id === 'no-swallowed-write');
    expect(rule, 'the swallowed-write rule is gone').toBeTruthy();
    const inside = (rule!.patterns ?? []).map((p) => p['pattern-inside']).filter(Boolean).join('\n');
    expect(
      inside,
      'no-swallowed-write lost its `pattern-inside` — it now matches every insert/update in the ' +
      'codebase and the only way to get CI green again is to delete or weaken the rule.',
    ).toContain('catch');
  });

  /**
   * The prompt rules are split by LANGUAGE. A single rule declaring [typescript, python] threw
   * "Invalid pattern for TypeScript" on the Python `or` form and semgrep rejected the WHOLE
   * rule — it loaded and matched nothing, which is the failure this whole file exists to
   * prevent. Merging them back would look like a tidy-up and silently disarm both.
   */
  it('keeps the prompt-fallback rules split by language', () => {
    const doc = parse(raw) as { rules: Array<{ id: string; languages: string[] }> };
    const ts = doc.rules.find((r) => r.id === 'no-prompt-code-fallback');
    const py = doc.rules.find((r) => r.id === 'no-prompt-code-fallback-python');
    expect(ts, 'the TypeScript prompt-fallback rule is gone (#347 phase 3P)').toBeTruthy();
    expect(py, 'the Python prompt-fallback rule is gone (#347 phase 3P)').toBeTruthy();
    expect(ts!.languages, 'no-prompt-code-fallback must be typescript-only').toEqual(['typescript']);
    expect(py!.languages, 'no-prompt-code-fallback-python must be python-only').toEqual(['python']);
  });

  /**
   * Every real call site awaits its loader. A bare-call pattern parses fine and matches NOTHING,
   * so this pins the `await` form that was verified against a probe.
   */
  it('the TypeScript prompt-fallback patterns are anchored to `await`', () => {
    const doc = parse(raw) as { rules: Array<{ id: string; 'pattern-either'?: Array<{ pattern: string }> }> };
    const rule = doc.rules.find((r) => r.id === 'no-prompt-code-fallback');
    const patterns = (rule?.['pattern-either'] ?? []).map((p) => p.pattern);
    expect(patterns.length, 'the rule lost its patterns').toBeGreaterThan(5);
    expect(
      patterns.filter((p) => p.startsWith('await ')).length,
      'no-prompt-code-fallback lost its `await` forms — a bare-call pattern matches nothing, ' +
      'because every real prompt call site awaits.',
    ).toBeGreaterThanOrEqual(8);
  });

  it('defines rules, each with the fields semgrep requires', () => {
    const doc = parse(raw) as { rules?: Array<Record<string, unknown>> };
    expect(Array.isArray(doc.rules), 'no `rules:` array').toBe(true);
    // Never let the ruleset silently shrink to nothing.
    expect(doc.rules!.length, 'ruleset is empty — the gate would pass everything').toBeGreaterThanOrEqual(8);
    for (const rule of doc.rules!) {
      expect(rule.id, `rule missing id: ${JSON.stringify(rule).slice(0, 80)}`).toBeTruthy();
      expect(rule.message, `rule ${rule.id} has no message`).toBeTruthy();
      expect(rule.severity, `rule ${rule.id} has no severity`).toBeTruthy();
      expect(rule.languages, `rule ${rule.id} has no languages`).toBeTruthy();
      expect(
        'pattern' in rule || 'pattern-either' in rule || 'patterns' in rule,
        `rule ${rule.id} has no pattern — it can never match`,
      ).toBe(true);
    }
  });

  it('runs as a BLOCKING gate (no `|| true`)', () => {
    // Strip comments first — the header explains the `|| true` history, and matching that
    // prose instead of the actual step is its own flavour of a test that asserts nothing.
    const wf = readFileSync(WORKFLOW, 'utf8')
      .split('\n').filter((l) => !l.trimStart().startsWith('#')).join('\n');
    expect(/\|\|\s*true/.test(wf), 'the semgrep step swallows its exit code again').toBe(false);
    expect(wf).toContain('--error');
  });
});
