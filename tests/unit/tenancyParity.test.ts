/**
 * Guards the tenancy-parity detector.
 *
 * `npm run lint:tenancy` is the real gate. This test guards the things that would quietly turn it
 * off while leaving it green:
 *
 *   • the detector losing its ability to detect (its own self-test failing),
 *   • the tenant-table list shrinking, which silently removes tables from scope,
 *   • the baseline being edited upward to absorb a new finding.
 *
 * The detector currently reports ZERO findings. Zero is also what a broken detector reports — this
 * session produced two semgrep rules that loaded fine and matched nothing — so "it found nothing"
 * is only meaningful while the self-test still proves it catches the #294 shape.
 */
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'check-tenancy-parity.mjs');
const BASELINE = join(ROOT, '.github', 'tenancy-parity-baseline.json');
const TABLES = join(ROOT, '.github', 'tenant-tables.json');

describe('tenancy parity gate', () => {
  it('the runner, table list and baseline all exist', () => {
    expect(existsSync(SCRIPT), 'scripts/check-tenancy-parity.mjs is missing').toBe(true);
    expect(existsSync(TABLES), '.github/tenant-tables.json is missing').toBe(true);
    expect(existsSync(BASELINE), 'baseline missing — write one with --write-baseline').toBe(true);
  });

  /**
   * The detector proving it still detects. Runs the script's own self-test, which feeds it #294 S1
   * exactly as that code was written before the fix, plus the sibling door that correctly checks
   * `uploaded_by`, and asserts it flags the first and ignores the second.
   */
  it('still catches the #294 shape it was built for', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(out, 'the detector no longer flags an unscoped service-role read by a body-supplied id')
      .toMatch(/ok\s+flags: #294 S1/);
    expect(out, 'the detector now flags a door that DOES check ownership — it will be ignored as noise')
      .toMatch(/ok\s+ignores: the sibling door/);
    expect(out).not.toMatch(/FAIL/);
  });

  /**
   * A table missing from the list is a table the gate does not look at. Shrinking the list is
   * therefore indistinguishable from fixing the findings, and much easier.
   */
  it('the workspace-scoped table list does not shrink', () => {
    const { tables } = JSON.parse(readFileSync(TABLES, 'utf8')) as { tables: string[] };
    expect(Array.isArray(tables)).toBe(true);
    // 255 relations carried workspace_id on 2026-08-01. New tenant tables should push this UP.
    expect(
      tables.length,
      'The tenant-table list got smaller. Every removed table drops out of the tenancy gate ' +
      'silently. Regenerate it from information_schema (SQL is in the file header) rather than ' +
      'hand-editing.',
    ).toBeGreaterThanOrEqual(255);
    expect(new Set(tables).size, 'duplicate entries in tenant-tables.json').toBe(tables.length);
  });

  it('the baseline is internally consistent and has not been padded', () => {
    const base = JSON.parse(readFileSync(BASELINE, 'utf8')) as { total: number; files: Record<string, number> };
    const sum = Object.values(base.files).reduce((a, b) => a + b, 0);
    expect(base.total, `baseline total (${base.total}) disagrees with its per-file counts (${sum})`).toBe(sum);
    expect(
      base.total,
      'The tenancy baseline is above zero. It was zero when the gate landed, and a service-role ' +
      'read of tenant data by a body-supplied id is CLAUDE.md security invariant 1 — fix the ' +
      'finding rather than recording it as accepted.',
    ).toBe(0);
  });
});
