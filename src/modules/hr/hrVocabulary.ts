/** The HR closed value-sets, written ONCE (#391). */

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

/** Membership tests. */
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

/** `hr_applications_stage_check` — the recruitment funnel. */
export const APP_STAGES = [
  'applied', 'screening', 'interview', 'offer', 'hired', 'rejected',
] as const;
export type AppStage = (typeof APP_STAGES)[number];

/** The funnel proper — every stage except the `rejected` off-ramp. Derived, not a second
 *  vocabulary: written as a slice so a new stage joins it automatically. */
export const APP_STAGES_IN_FUNNEL = APP_STAGES.filter((s) => s !== 'rejected');

/** `hr_documents_doc_type_check` — what an employee's file can hold. */
export const DOC_TYPES = [
  'contract', 'id', 'certificate', 'payslip', 'review', 'other',
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function isAppStage(v: unknown): v is AppStage {
  return typeof v === 'string' && (APP_STAGES as readonly string[]).includes(v);
}
export function isHrDocType(v: unknown): v is DocType {
  return typeof v === 'string' && (DOC_TYPES as readonly string[]).includes(v);
}
