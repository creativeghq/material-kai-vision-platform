/**
 * Semgrep ruleset validity guard.
 *
 * `.github/semgrep-security.yml` is the code-level half of the pentest #250 invariants (the DB
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

  it('defines rules, each with the fields semgrep requires', () => {
    const doc = parse(raw) as { rules?: Array<Record<string, unknown>> };
    expect(Array.isArray(doc.rules), 'no `rules:` array').toBe(true);
    // Never let the ruleset silently shrink to nothing.
    expect(doc.rules!.length, 'ruleset is empty — the gate would pass everything').toBeGreaterThanOrEqual(5);
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
