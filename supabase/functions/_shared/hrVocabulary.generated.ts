// GENERATED MIRROR of src/modules/hr/hrVocabulary.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * The HR closed value-sets, written ONCE (#391).
 *
 * Eight of them were typed out across `hrService.ts`, `TimeOffSection`,
 * `RecruitmentSection`, `careersShared`, `hr-api/index.ts`, `hr-api/expansion.ts`,
 * `hr-api/ergani.ts`, `hr-api/labour.ts`, `hr-tools.ts` and `my-hr-tools.ts` — two to six
 * copies each, agreeing only by memory.
 *
 * THE DATABASE IS THE ENFORCER, SO THE DATABASE WINS
 * ---------------------------------------------------
 * Every set here equals its CHECK constraint exactly, verified against the live schema on
 * 2026-08-27 and pinned by `tests/unit/hrVocabulary.test.ts`. Postgres refuses anything
 * else, so a copy that drifts WIDER makes the UI offer a value the write rejects with a
 * raw `23514` naming a constraint the user has never heard of; a copy that drifts
 * NARROWER makes a legitimate value vanish from a dropdown with nobody able to tell.
 *
 * Changing a set is therefore a migration AND an edit here, in one commit.
 *
 * THIS FILE IS IMPORT-FREE, ON PURPOSE
 * -------------------------------------
 * It is mirrored into `supabase/functions/` byte-for-byte by `npm run vocab:mirror`,
 * because Vite resolves `@/` and Deno resolves by URL — one import and the mirror will
 * not load on the other side. Same-runtime consumers import THIS file directly; a mirror
 * inside `src/` would be re-creating the problem with a banner on it.
 */

/** `hr_employees_employment_type_check`, `hr_job_postings_employment_type_check`.
 *  One vocabulary, two tables — they have always held the same three values. */
export const EMPLOYMENT_TYPES = ['full_time', 'part_time', 'contractor'] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

/** `hr_employees_status_check`. */
export const EMPLOYEE_STATUSES = ['active', 'on_leave', 'terminated'] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

/** `hr_absences_absence_type_check`. */
export const ABSENCE_TYPES = ['vacation', 'sick', 'unpaid', 'other'] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];

/** `hr_job_postings_status_check`. */
export const POSTING_STATUSES = ['draft', 'open', 'closed'] as const;
export type PostingStatus = (typeof POSTING_STATUSES)[number];

/** `hr_job_postings_location_type_chk`.
 *
 *  The column is NULLABLE and the constraint says `location_type IS NULL OR ...`, so an
 *  unset location is legitimate and is NOT a member of this set. A consumer that needs
 *  "unspecified" as an option adds it at the UI layer; putting it here would make the
 *  set disagree with the constraint, which is the exact drift this file exists to stop. */
export const LOCATION_TYPES = ['onsite', 'hybrid', 'remote'] as const;
export type LocationType = (typeof LOCATION_TYPES)[number];

/** `hr_separations_separation_type_check`. */
export const SEPARATION_TYPES = ['voluntary', 'termination', 'expiry'] as const;
export type SeparationType = (typeof SEPARATION_TYPES)[number];

/**
 * Membership tests.
 *
 * `as const` makes each set a readonly tuple of literals, so `SET.includes(someString)`
 * is a type error — the argument is `string` and the parameter is the union. The inline
 * arrays these replaced were plain `string[]`, which accepted anything and told the
 * reader nothing.
 *
 * Casting at each call site would work and would spread `as readonly string[]` across ten
 * files, which is the shape this whole change is removing. A named guard says what it is
 * checking and narrows the type on the way through, so a caller that passes the test can
 * use the value as the union without a second assertion.
 */
export function isEmploymentType(v: unknown): v is EmploymentType {
  return typeof v === 'string' && (EMPLOYMENT_TYPES as readonly string[]).includes(v);
}
export function isEmployeeStatus(v: unknown): v is EmployeeStatus {
  return typeof v === 'string' && (EMPLOYEE_STATUSES as readonly string[]).includes(v);
}
export function isAbsenceType(v: unknown): v is AbsenceType {
  return typeof v === 'string' && (ABSENCE_TYPES as readonly string[]).includes(v);
}
export function isPostingStatus(v: unknown): v is PostingStatus {
  return typeof v === 'string' && (POSTING_STATUSES as readonly string[]).includes(v);
}
export function isLocationType(v: unknown): v is LocationType {
  return typeof v === 'string' && (LOCATION_TYPES as readonly string[]).includes(v);
}
export function isSeparationType(v: unknown): v is SeparationType {
  return typeof v === 'string' && (SEPARATION_TYPES as readonly string[]).includes(v);
}
