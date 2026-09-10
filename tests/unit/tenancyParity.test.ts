/** Guards the tenancy-parity detector. */
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
   * The detector proving it still detects. Runs the script's own self-test, which feeds it the
   * unscoped catalog-translate-pdf read exactly as it was written before the fix, plus the
   * sibling door that correctly checks `uploaded_by`, and asserts it flags the first and
   * ignores the second.
   */
  it('still catches the shape it was built for', () => {
    const out = execFileSync(process.execPath, [SCRIPT], { encoding: 'utf8', cwd: ROOT });
    expect(out, 'the detector no longer flags an unscoped service-role read by a body-supplied id')
      .toMatch(/ok\s+flags: catalog-translate-pdf/);
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
    // Floor lowered 255 -> 254 on 2026-08-16: 16 of the 38 tables dropped as unreachable schema
    // carried workspace_id, so the list legitimately shrank. Only a DROP may move this number
    // down, and only together with the migration that performed it.
    expect(
      tables.length,
      'The tenant-table list got smaller. Every removed table drops out of the tenancy gate ' +
      'silently. Regenerate it from information_schema (SQL is in the file header) rather than ' +
      'hand-editing.',
    ).toBeGreaterThanOrEqual(254);
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
