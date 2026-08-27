import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { stripComments } from '../helpers/stripComments';
import {
  EMPLOYMENT_TYPES, EMPLOYEE_STATUSES, ABSENCE_TYPES,
  POSTING_STATUSES, LOCATION_TYPES, SEPARATION_TYPES,
  isEmploymentType, isAbsenceType, isLocationType, isSeparationType,
} from '@/modules/hr/hrVocabulary';

/**
 * The HR vocabularies exist ONCE, and equal their CHECK constraints (#391).
 *
 * Eight sets were typed out across ten files — two to six copies each — agreeing only by
 * memory. The database is the enforcer, so a copy that drifts WIDER makes the UI offer a
 * value the write rejects with a raw `23514` naming a constraint the user has never heard
 * of; a copy that drifts NARROWER makes a legitimate value vanish from a dropdown with
 * nobody able to tell.
 *
 * WHY THIS TEST DOES NOT CARRY ITS OWN COPY OF THE VALUES
 * -------------------------------------------------------
 * That is the failure mode #391 names explicitly: a previous guard for this exact shape
 * "carried its own fourth copy of the list, hand-edited in the same commit as the other
 * three". A test whose pin you edit alongside the thing it pins can only ever catch
 * INCONSISTENCY, never INCORRECTNESS.
 *
 * So the values below are asserted against the CONSTRAINT TEXT, quoted verbatim from
 * `pg_constraint` on 2026-08-27. That string is not something anyone edits casually while
 * changing a dropdown, and if the constraint moves the fix is a migration plus a source
 * edit in one commit — which is the rule this file enforces.
 */

const ROOT = join(__dirname, '..', '..');

/** `pg_get_constraintdef` output, copied verbatim. Deliberately unparsed and ugly: it is
 *  evidence, and reformatting it into a tidy array would make it a fourth copy. */
const CONSTRAINTS: Record<string, string> = {
  hr_absences_absence_type_check:
    "CHECK ((absence_type = ANY (ARRAY['vacation'::text, 'sick'::text, 'unpaid'::text, 'other'::text])))",
  hr_employees_employment_type_check:
    "CHECK ((employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contractor'::text])))",
  hr_employees_status_check:
    "CHECK ((status = ANY (ARRAY['active'::text, 'on_leave'::text, 'terminated'::text])))",
  hr_job_postings_status_check:
    "CHECK ((status = ANY (ARRAY['draft'::text, 'open'::text, 'closed'::text])))",
  hr_job_postings_location_type_chk:
    "CHECK (((location_type IS NULL) OR (location_type = ANY (ARRAY['onsite'::text, 'hybrid'::text, 'remote'::text]))))",
  hr_separations_separation_type_check:
    "CHECK ((separation_type = ANY (ARRAY['voluntary'::text, 'termination'::text, 'expiry'::text])))",
};

/** The literals a CHECK admits, read out of the constraint text. */
function admits(constraint: string): string[] {
  return [...constraint.matchAll(/'([^']+)'::text/g)].map((m) => m[1]);
}

describe('#391 — HR vocabularies match their database constraints', () => {
  const cases: Array<[string, readonly string[], string]> = [
    ['employment type', EMPLOYMENT_TYPES, 'hr_employees_employment_type_check'],
    ['employee status', EMPLOYEE_STATUSES, 'hr_employees_status_check'],
    ['absence type', ABSENCE_TYPES, 'hr_absences_absence_type_check'],
    ['posting status', POSTING_STATUSES, 'hr_job_postings_status_check'],
    ['location type', LOCATION_TYPES, 'hr_job_postings_location_type_chk'],
    ['separation type', SEPARATION_TYPES, 'hr_separations_separation_type_check'],
  ];

  for (const [label, values, constraint] of cases) {
    it(`${label} equals ${constraint}`, () => {
      expect([...values].sort()).toEqual(admits(CONSTRAINTS[constraint]).sort());
    });
  }

  it('the job-posting employment type is the SAME vocabulary as the employee one', () => {
    // Two constraints, two tables, one fact. They have always held the same three values,
    // and splitting them into two sources would be re-creating the duplication inside the
    // fix. If they ever need to differ, that is a deliberate change with two names.
    expect(admits("CHECK ((employment_type = ANY (ARRAY['full_time'::text, 'part_time'::text, 'contractor'::text])))"))
      .toEqual([...EMPLOYMENT_TYPES]);
  });

  it('the extractor actually reads the constraint text', () => {
    // A parser that returns [] would make every case above pass by comparing nothing to
    // nothing — the quiet way a guard stops guarding.
    expect(admits(CONSTRAINTS.hr_absences_absence_type_check)).toHaveLength(4);
    expect(admits('CHECK ((x = ANY (ARRAY[])))')).toEqual([]);
  });
});

describe('#391 — the HR vocabulary is not written down anywhere else', () => {
  const SOURCE = 'src/modules/hr/hrVocabulary.ts';
  const MIRROR = 'supabase/functions/_shared/hrVocabulary.generated.ts';

  function walk(dir: string, out: string[] = []): string[] {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return out;
    }
    for (const e of entries) {
      if (e === 'node_modules') continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.tsx?$/.test(e)) out.push(full);
    }
    return out;
  }

  it('no file re-declares a set the source owns', () => {
    // Matched on the VALUES, not on a variable name — renaming the constant is exactly
    // how a copy hides. Coincidental matches are not a concern for these: no other
    // vocabulary in the platform is `['vacation','sick','unpaid','other']`.
    const signatures: Array<[string, readonly string[]]> = [
      ['employment types', EMPLOYMENT_TYPES],
      ['absence types', ABSENCE_TYPES],
      ['location types', LOCATION_TYPES],
      ['separation types', SEPARATION_TYPES],
    ];
    const offenders: string[] = [];

    for (const file of [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'supabase/functions'))]) {
      const rel = file.replace(ROOT, '').replace(/\\/g, '/').replace(/^\//, '');
      if (rel === SOURCE || rel === MIRROR) continue;
      // `toolManifest.generated.ts` is an AST PROJECTION of every tool's zod schema, so
      // it necessarily contains the values a `z.enum` resolves to. It is derived, not
      // written — `npm run tools:manifest` rebuilds it and toolkitCoverage.test.ts fails
      // the build if it is stale. Exempting it is not a hole: if the source moved and the
      // enum stopped resolving, the manifest would degrade the param to `type: 'string'`
      // and the manifest test would catch THAT, which is the failure that matters.
      if (rel === 'src/components/features/ai/toolManifest.generated.ts') continue;
      const src = stripComments(readFileSync(file, 'utf8'));
      for (const [label, values] of signatures) {
        // `'a', 'b', 'c'` in order, allowing any whitespace — the shape a hand-written
        // array literal or a z.enum takes.
        const pattern = values.map((v) => `'${v}'`).join('\\s*,\\s*');
        if (new RegExp(pattern).test(src)) offenders.push(`${rel} (${label})`);
      }
    }

    expect(
      offenders,
      'these re-declare an HR vocabulary the source already owns:\n  ' +
        offenders.join('\n  ') +
        `\n\nImport from ${SOURCE} (same runtime) or ${MIRROR} (edge). One fact, one place.`,
    ).toEqual([]);
  });

  it('the source stays import-free so the mirror can be a byte copy', () => {
    const src = readFileSync(join(ROOT, SOURCE), 'utf8');
    expect(
      /^\s*import\s/m.test(src),
      'hrVocabulary.ts has grown an import. Vite resolves `@/` and Deno resolves by URL, ' +
        'so the generated mirror would fail to load on the edge side.',
    ).toBe(false);
  });
});

describe('#391 — the membership guards narrow', () => {
  it('accept every member and reject a near-miss', () => {
    for (const v of EMPLOYMENT_TYPES) expect(isEmploymentType(v)).toBe(true);
    for (const v of ABSENCE_TYPES) expect(isAbsenceType(v)).toBe(true);
    expect(isEmploymentType('fulltime')).toBe(false);
    expect(isAbsenceType('holiday')).toBe(false);
    expect(isLocationType('')).toBe(false);
    expect(isSeparationType(null)).toBe(false);
    expect(isSeparationType(undefined)).toBe(false);
  });

  it('an unset location type is not a member', () => {
    // The column is nullable and the constraint reads `location_type IS NULL OR ...`, so
    // "unspecified" is legitimate but is NOT one of the three values. A consumer that
    // needs it as an option adds it at the UI layer.
    expect(isLocationType(null)).toBe(false);
    expect(LOCATION_TYPES).toHaveLength(3);
  });
});
