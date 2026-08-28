import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// Client for the `hr-api` edge function. Every call passes the active workspace_id; the
// edge function re-derives access from the caller (JWT) and enforces entitlement + hr.view/hr.manage.

// The closed value-sets come from `../hrVocabulary` (#391) and are re-exported here so
// every existing `import { EmploymentType } from '.../hrService'` keeps working. They
// were declared inline in this file and in nine others; the DB CHECK constraints are the
// enforcer and the source now equals them exactly.
export {
  EMPLOYMENT_TYPES, EMPLOYEE_STATUSES, ABSENCE_TYPES,
  POSTING_STATUSES, LOCATION_TYPES, SEPARATION_TYPES,
} from '../hrVocabulary';
export type {
  EmploymentType, EmployeeStatus, AbsenceType,
  PostingStatus, LocationType, SeparationType,
  AppStage, DocType,
} from '../hrVocabulary';

// Also imported for use WITHIN this file — a re-export does not bind the names locally.
import type {
  EmploymentType, EmployeeStatus, AbsenceType,
  PostingStatus, LocationType, SeparationType,
  AppStage, DocType,
} from '../hrVocabulary';
export type PayBasis = 'monthly' | 'hourly';
export const PAY_BASIS_LABELS: Record<PayBasis, string> = { monthly: 'Monthly salary', hourly: 'Hourly rate' };
export type AbsenceStatus = 'pending' | 'approved' | 'rejected';

export interface EmployeeContact {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  position: string | null;
  department: string | null;
  date_of_birth: string | null;
  vat_number?: string | null; // VAT — used for Ergani filings
}

export interface Employee {
  id: string;
  workspace_id: string;
  crm_contact_id: string;
  employment_type: EmploymentType | null;
  start_date: string | null;
  end_date: string | null;
  weekly_hours: number | null;
  annual_leave_allowance_days: number;
  manager_contact_id: string | null;
  status: EmployeeStatus;
  department_id: string | null;
  pay_basis: PayBasis;
  monthly_salary: number | null;
  hourly_rate: number | null;
  salary_currency: string | null;
  amka: string | null; // AMKA — social-security number, for Ergani filings
  dependent_children: number; // drives the payroll income-tax credit
  work_start_time: string | null;
  work_end_time: string | null;
  work_days: number[] | null; // ISO weekdays 1=Mon..7=Sun
  created_at: string;
  updated_at: string;
  contact: EmployeeContact | null;
  manager: { id: string; name: string } | null;
  // Rollup (vw_hr_employee_absence_summary), attached server-side.
  total_absence_days: number;
  days_by_type: Record<string, number>;
  on_leave_today: boolean;
  remaining_leave_days: number;
}

export interface Absence {
  id: string;
  workspace_id: string;
  employee_id: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  working_days: number | null;
  status: AbsenceStatus;
  approved_by: string | null;
  note: string | null;
  ergani_leave_code: string | null;
  created_at: string;
  employee?: { id: string; crm_contact_id: string; contact: { id: string; name: string } | null } | null;
}


export interface CreateEmployeeInput {
  // Provide either an existing contact to attach…
  crm_contact_id?: string;
  // …or the fields to create a new one.
  contact?: Partial<Pick<EmployeeContact, 'name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'mobile' | 'position' | 'department' | 'date_of_birth' | 'vat_number'>>;
  employment_type?: EmploymentType;
  start_date?: string | null;
  weekly_hours?: number | null;
  annual_leave_allowance_days?: number;
  manager_contact_id?: string | null;
  status?: EmployeeStatus;
  department_id?: string | null;
  pay_basis?: PayBasis;
  monthly_salary?: number | null;
  hourly_rate?: number | null;
  amka?: string | null;
  dependent_children?: number;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_days?: number[] | null;
}

export interface UpdateEmployeeInput {
  employee_id: string;
  employment_type?: EmploymentType;
  start_date?: string | null;
  end_date?: string | null;
  weekly_hours?: number | null;
  annual_leave_allowance_days?: number;
  manager_contact_id?: string | null;
  status?: EmployeeStatus;
  department_id?: string | null;
  pay_basis?: PayBasis;
  monthly_salary?: number | null;
  hourly_rate?: number | null;
  amka?: string | null;
  dependent_children?: number;
  work_start_time?: string | null;
  work_end_time?: string | null;
  work_days?: number[] | null;
  contact?: Partial<Pick<EmployeeContact, 'name' | 'email' | 'phone' | 'mobile' | 'position' | 'department' | 'date_of_birth' | 'vat_number'>>;
}

export interface RecordAbsenceInput {
  employee_id: string;
  absence_type: AbsenceType;
  start_date: string;
  end_date: string;
  working_days?: number; // omit → server computes (weekends excluded)
  note?: string;
}

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contractor: 'Contractor',
};
export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: 'Active',
  on_leave: 'On leave',
  terminated: 'Terminated',
};
export const ABSENCE_TYPE_LABELS: Record<AbsenceType, string> = {
  vacation: 'Vacation',
  sick: 'Sick',
  unpaid: 'Unpaid',
  other: 'Other',
};

// ── Expansion types (org, recruitment, onboarding, documents, payroll, analytics) ──
export interface Department { id: string; name: string; description: string | null; head_contact_id: string | null; head: { id: string; name: string } | null; employee_count: number; }
/** One region's pay band, rendered on the public job page's facts rail. */
export interface CompensationBand {
  region: string; currency: string; min: number | null; max: number | null;
  equity: boolean; bonus: boolean; note: string | null;
}
/** Which optional fields the public application form asks for. Unset keys default to true. */
export interface ApplyConfig {
  require_resume?: boolean; ask_phone?: boolean; ask_location?: boolean; ask_links?: boolean; ask_cover_letter?: boolean;
}
export interface JobPosting {
  id: string; title: string; slug: string | null; department_id: string | null; department: { id: string; name: string } | null;
  employment_type: EmploymentType | null; location: string | null; location_type: LocationType | null; remote: boolean;
  level: string | null;
  description: string | null; requirements: string | null; salary_min: number | null; salary_max: number | null;
  currency: string | null; compensation: CompensationBand[]; compensation_note: string | null;
  apply_config: ApplyConfig; closes_at: string | null;
  status: PostingStatus; created_at: string; published_at: string | null;
  applicant_count: number; active_applicants: number;
}
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = { onsite: 'On-site', hybrid: 'Hybrid', remote: 'Remote' };
export interface Candidate {
  id: string; name: string; email: string | null; phone: string | null; headline: string | null;
  location?: string | null; links?: string | null;
  source: string | null; resume_path?: string | null; created_at: string;
}
export interface Application {
  id: string; job_posting_id: string; candidate_id: string; stage: AppStage; rating: number | null; notes: string | null;
  applied_at: string; hired_employee_id: string | null;
  ai_score: number | null; ai_summary: string | null; ai_rated_at: string | null;
  candidate: Candidate | null; posting: { id: string; title: string } | null;
}
export interface OnboardingTask {
  id: string; employee_id: string; title: string; description: string | null; due_date: string | null;
  status: 'pending' | 'done'; sort_order: number; completed_at: string | null;
  employee?: { id: string; contact: { id: string; name: string } | null } | null;
}
export interface HrDocument {
  id: string; employee_id: string | null; name: string; doc_type: DocType;
  storage_bucket: string; storage_object_path: string; size_bytes: number | null; created_at: string;
  employee?: { id: string; contact: { id: string; name: string } | null } | null;
}
export type PayrollStatus = 'draft' | 'approved' | 'paid';
export interface PayrollRun { id: string; period: string; status: PayrollStatus; currency: string; total_gross: number; total_net: number; notes: string | null; posted_finance_ref: unknown | null; created_at: string; approved_at: string | null; paid_at: string | null; }
export interface PayrollItem { id: string; run_id: string; employee_id: string; gross: number; deductions: number; net: number; employee_contributions: number; income_tax: number; employer_contributions: number; employer_cost: number; currency: string; note: string | null; basis: PayBasis | null; days_worked: number | null; hours_per_day: number | null; rate: number | null; employee?: { id: string; contact: { id: string; name: string } | null } | null; }
export interface PayrollSummary { total_gross: number; total_net: number; total_income_tax: number; total_employee_contributions: number; total_employer_contributions: number; total_employer_cost: number; }
export interface TaxBracket { up_to: number | null; rate: number; }
/** Young-worker (age) + family (children) income-tax band reductions. {} = none (default). */
export interface BracketReductions {
  age_bands?: { up_to_age: number; band_rates: Record<string, number> }[];
  child_bands?: { min_children: number; band_rates: Record<string, number> }[];
}
export interface PayrollSettings {
  workspace_id?: string; country_code: string; currency: string; salaries_per_year: number;
  employee_contribution_rate: number; employer_contribution_rate: number; contribution_monthly_ceiling: number | null;
  income_tax_brackets: TaxBracket[]; tax_credit_base: number; tax_credit_per_child: Record<string, number>;
  tax_credit_taper_per_1000: number; tax_credit_taper_floor: number; bracket_reductions?: BracketReductions; is_default?: boolean;
}
export interface HrAnalytics {
  headcount: number; active: number; on_leave_today: number; total_absence_days: number;
  absence_by_type: Record<string, number>; headcount_by_department: Record<string, number>;
  departments: number; open_positions: number; recruitment_funnel: Record<string, number>;
  onboarding_pending: number; last_payroll: { period: string; total_net: number; currency: string; status: string } | null;
}

// Accounting documents (monthly statutory docs → Claude OCR → reconcile; credit-metered)
export interface AccountingExtract { kind_group?: string | null; payment_id: string | null; payment_number: string | null; amount: number; currency: string; payee: string | null; period_covered?: string | null; due_date: string | null; issued_at: string | null; entries?: { kind_group?: string; label?: string; payment_id?: string; amount?: number }[]; line_items: { label: string; amount: number }[]; }
export type AcctStatus = 'uploaded' | 'analyzed' | 'error';
export interface AccountingDoc { id: string; period: string; payroll_run_id: string | null; name: string; mime: string | null; size_bytes: number | null; status: AcctStatus; doc_kind: string | null; extracted: AccountingExtract | null; ai_confidence: number | null; ai_notes: string | null; credits_spent: number; analyzed_at: string | null; created_at: string; }
export interface ReconMatch { obligation: string; expected_amount?: number; document_name?: string; payment_id?: string; found_amount?: number; status: string; }
export interface Reconciliation { matches: ReconMatch[]; discrepancies?: string[]; summary: string; ready_to_pay?: boolean; }
// Credits for HR AI ops are usage-based (charged on real token consumption, not a fixed number) —
// the actual amount is returned as `credits_used` on each response. Labels below are for the
// routing group only; `doc_kind` itself is a free-text label the AI names per document.
export const ACCT_KIND_GROUP_LABELS: Record<string, string> = {
  efka_payment: 'EFKA', tax_payment: 'Tax (ΦΜΥ)', apd: 'APD', payslip: 'Payslip',
  bonus: 'Bonus (Δώρο)', allowance: 'Allowance', auxiliary_fund: 'Auxiliary fund', other: 'Other',
};

// Employee self-service (the caller's OWN record only)
export interface SelfProfile {
  id: string; employment_type: EmploymentType | null; start_date: string | null; weekly_hours: number | null;
  annual_leave_allowance_days: number; status: EmployeeStatus; pay_basis: PayBasis;
  monthly_salary: number | null; hourly_rate: number | null; salary_currency: string | null;
  contact: EmployeeContact | null; department: { id: string; name: string } | null;
  summary: { total_absence_days: number; days_by_type: Record<string, number>; remaining_leave_days: number; annual_leave_allowance_days: number } | null;
}
export interface SelfTask { id: string; title: string; description: string | null; due_date: string | null; status: 'pending' | 'done'; completed_at: string | null; sort_order: number; }
export interface SelfAbsence { id: string; absence_type: AbsenceType; start_date: string; end_date: string; working_days: number | null; status: AbsenceStatus; note: string | null; created_at: string; }
export interface SelfDocument { id: string; name: string; doc_type: DocType; size_bytes: number | null; created_at: string; }
export interface SelfPunch { id: string; punch_type: 'arrival' | 'departure'; reference_date: string; punched_at: string; status: 'pending' | 'submitted' | 'failed'; ergani_protocol: string | null; }
export interface SelfClockResult { ok: boolean; punch: SelfPunch; filed: boolean; reason: string | null; protocol: string | null; is_late?: boolean | null; }

// ── Attendance / kiosk / HR settings ──
export interface AttendanceRow {
  employee_id: string; name: string; status: EmployeeStatus;
  work_today: boolean; work_start_time: string | null; work_end_time: string | null; has_pin: boolean;
  clocked_in: boolean; last_punch_type: 'arrival' | 'departure' | null; last_at: string | null;
  last_is_late: boolean | null; last_status: 'pending' | 'submitted' | 'failed' | null;
}
export interface HrSettings {
  workspace_id?: string; timezone: string; kiosk_enabled: boolean; kiosk_require_pin: boolean;
  late_alert_enabled: boolean; late_grace_minutes: number; notify_owner: boolean; notify_finance: boolean;
  notify_user_ids: string[]; notify_emails: string[]; is_default?: boolean;
}
export interface ClockEmployeeResult { ok: boolean; punch: unknown; filed: boolean; reason: string | null; is_late: boolean | null; protocol: string | null; }
export interface NotifyCandidate { user_id: string; name: string; email: string | null; role: string | null; }
export interface Punch {
  id: string; employee_id: string; punch_type: 'arrival' | 'departure'; reference_date: string; punched_at: string;
  source: 'self' | 'kiosk' | 'admin' | 'api'; is_late: boolean | null; status: 'pending' | 'submitted' | 'failed';
  ergani_protocol: string | null; late_reason: string | null;
}
export interface TimesheetDay { date: string; hours: number; first_in: string | null; last_out: string | null; }
export interface TimesheetRow { employee_id: string; name: string; total_hours: number; open: boolean; days: TimesheetDay[]; }

export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' };
export const APP_STAGE_LABELS: Record<AppStage, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };
export { APP_STAGES, APP_STAGES_IN_FUNNEL } from '../hrVocabulary';
export const DOC_TYPE_LABELS: Record<DocType, string> = { contract: 'Contract', id: 'ID / Tax', certificate: 'Certificate', payslip: 'Payslip', review: 'Review', other: 'Other' };

// ── Ergani II (Ergani) integration types ──
export type ErganiEnv = 'trial' | 'production';
export interface ErganiCredsStatus {
  username: string | null; employer_afm: string | null; branch_aa: string; usertype: string;
  environment: ErganiEnv; enabled: boolean; has_password: boolean;
}
export interface SaveErganiInput {
  username: string; password?: string; employer_afm?: string | null; branch_aa?: string;
  usertype?: string; environment: ErganiEnv; enabled: boolean;
}
export interface ErganiLeaveType { code: string; description_el: string; description_en: string | null; category: string; subcategory: string; is_hourly: boolean; sort_order: number; }
export interface ErganiSubmissionType { id: number; code: string; description: string; }
export interface ErganiSubmitResult { id: string; protocol: string; submitDate: string; }
export interface SubmitLeaveInput { absence_id: string; ergani_leave_code: string; document?: unknown; }
export interface ErganiSubmission {
  id: string; workspace_id: string; submission_type: string; entity_type: string | null; entity_id: string | null;
  employee_id: string | null; environment: string; status: 'submitted' | 'failed' | 'cancelled';
  protocol: string | null; ergani_id: string | null; submit_date: string | null; error: string | null; created_at: string;
}

/**
 * A filing built from Ergani's live template but NOT yet submitted. `unfilled` lists the template
 * keys we could not recognise — the operator completes those before submitting, which is why every
 * Ε-document flow in the UI is preview-then-submit rather than one click.
 */
export interface ErganiPreview { preview: true; code: string; document: unknown; filled: string[]; unfilled: string[]; }
export type ErganiFiled = { ok: true; result: ErganiSubmitResult; filed?: number };

// ── Labour records behind the Ε-documents ──
/** voluntary → Ε5, termination → Ε6, expiry → Ε7. The kind IS the Ergani document. */
export type FilingStatus = 'draft' | 'submitted' | 'failed';
export const SEPARATION_TYPE_LABELS: Record<SeparationType, string> = {
  voluntary: 'Voluntary departure (Ε5)',
  termination: 'Contract termination (Ε6)',
  expiry: 'Fixed-term expiry (Ε7)',
};
export const SEPARATION_CODES: Record<SeparationType, string> = { voluntary: 'E5', termination: 'E6', expiry: 'E7' };

export interface LabourEmployeeRef {
  id: string;
  contact: { id: string; name: string; vat_number: string | null } | null;
}

export interface Separation {
  id: string; workspace_id: string; employee_id: string;
  separation_type: SeparationType; effective_date: string; notice_date: string | null;
  reason: string | null; severance_amount: number | null; note: string | null;
  status: FilingStatus; ergani_protocol: string | null; created_at: string; updated_at: string;
  employee?: LabourEmployeeRef | null;
}
export interface SeparationInput {
  separation_type: SeparationType; effective_date: string; notice_date?: string | null;
  reason?: string | null; severance_amount?: number | null; note?: string | null;
}

export interface Overtime {
  id: string; workspace_id: string; employee_id: string;
  work_date: string; start_time: string; end_time: string;
  /** Generated in SQL from start/end — never sent by the client. */
  hours: number;
  reason: string; note: string | null;
  status: FilingStatus; ergani_protocol: string | null; created_at: string; updated_at: string;
  employee?: LabourEmployeeRef | null;
}
export interface OvertimeInput {
  work_date: string; start_time: string; end_time: string; reason: string; note?: string | null;
}

export type ScheduleType = 'weekly' | 'daily';
/** One roster row. `day` is 0=Sunday … 6=Saturday; `date` pins a specific day for daily schedules. */
export interface ScheduleShift {
  day: number; off?: boolean; start?: string; end?: string;
  break_start?: string; break_end?: string; date?: string; note?: string;
}
export interface WorkSchedule {
  id: string; workspace_id: string; employee_id: string;
  name: string | null; schedule_type: ScheduleType;
  effective_from: string; effective_to: string | null;
  details: ScheduleShift[];
  status: FilingStatus; ergani_protocol: string | null; created_at: string; updated_at: string;
  employee?: LabourEmployeeRef | null;
}
export interface WorkScheduleInput {
  name?: string | null; schedule_type: ScheduleType;
  effective_from: string; effective_to?: string | null; details: ScheduleShift[];
}

async function call<T>(workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hr-api', {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) throw await edgeError(error);
  return data as T;
}

// Reads go DIRECT to the DB (like Finance), not through the hr-api edge function — that pays a
// cold-start on the first navigation and a per-tab-switch round-trip, which is the whole "blank
// div while it loads" symptom. The hr_* SELECT RLS policy is `is_workspace_admin(workspace_id) OR
// is_platform_operator()`, i.e. the IDENTICAL owner/admin-only gate resolveHrAccess enforces on the
// edge, so a direct client read is equally safe AND runs at always-warm PostgREST speed (~100ms).
// Writes + computed/credit-metered/external endpoints stay on `call()`.
// hr_* tables post-date the last `supabase gen types` run so they're absent from the generated
// Database type; `sb` is a thin untyped handle for those reads. Rows are cast to the exported
// interfaces below — the same type-safety level `call<T>()` had (neither validates at runtime).
// deno-lint-ignore no-explicit-any
const sb = supabase as any;

class HrService {
  async listEmployees(workspaceId: string): Promise<{ employees: Employee[] }> {
    const [{ data: emps, error }, { data: sums }] = await Promise.all([
      sb.from('hr_employees')
        .select('*, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name, first_name, last_name, email, phone, mobile, position, department, date_of_birth, vat_number ), manager:crm_contacts!hr_employees_manager_contact_id_fkey ( id, name )')
        .eq('workspace_id', workspaceId).order('created_at', { ascending: true }),
      sb.from('vw_hr_employee_absence_summary').select('*').eq('workspace_id', workspaceId),
    ]);
    if (error) throw error;
    const byId = new Map((sums ?? []).map((s: any) => [s.employee_id, s]));
    const employees = (emps ?? []).map((e: any) => {
      const s: any = byId.get(e.id) ?? {};
      return {
        ...e,
        total_absence_days: Number(s.total_absence_days ?? 0),
        days_by_type: s.days_by_type ?? {},
        on_leave_today: !!s.on_leave_today,
        remaining_leave_days: s.remaining_leave_days ?? e.annual_leave_allowance_days ?? 0,
      };
    });
    return { employees: employees as Employee[] };
  }
  createEmployee(workspaceId: string, input: CreateEmployeeInput): Promise<{ employee: Employee }> {
    return call(workspaceId, 'create-employee', input as unknown as Record<string, unknown>);
  }
  updateEmployee(workspaceId: string, input: UpdateEmployeeInput): Promise<{ employee: Employee }> {
    return call(workspaceId, 'update-employee', input as unknown as Record<string, unknown>);
  }
  async listAbsences(workspaceId: string, filters: { employee_id?: string; status?: AbsenceStatus } = {}): Promise<{ absences: Absence[] }> {
    let q = sb.from('hr_absences')
      .select('*, employee:hr_employees!hr_absences_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
      .eq('workspace_id', workspaceId).order('start_date', { ascending: false });
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.status) q = q.eq('status', filters.status);
    const { data, error } = await q;
    if (error) throw error;
    return { absences: (data ?? []) as Absence[] };
  }
  recordAbsence(workspaceId: string, input: RecordAbsenceInput): Promise<{ absence: Absence }> {
    return call(workspaceId, 'record-absence', input as unknown as Record<string, unknown>);
  }
  approveAbsence(workspaceId: string, absenceId: string): Promise<{ absence: Absence }> {
    return call(workspaceId, 'approve-absence', { absence_id: absenceId });
  }
  rejectAbsence(workspaceId: string, absenceId: string): Promise<{ absence: Absence }> {
    return call(workspaceId, 'reject-absence', { absence_id: absenceId });
  }
  // Overview landing reads the always-warm `hr_overview_analytics` RPC (PostgREST) instead of the
  // hr-api edge function — the edge pays a ~1.5-2.9s isolate cold-start on the first HR navigation,
  // which is the "HR body loads slowly" symptom. The RPC enforces the identical gates in SQL
  // (owner/admin-or-global access → module enabled → entitlement). Matches Finance's direct-read pattern.
  async analytics(workspaceId: string): Promise<{ analytics: HrAnalytics }> {
    const { data, error } = await sb.rpc('hr_overview_analytics', { p_workspace_id: workspaceId });
    if (error) throw error;
    return { analytics: data as HrAnalytics };
  }

  // ── Departments ──
  async listDepartments(ws: string): Promise<{ departments: Department[] }> {
    const [{ data: depts, error }, { data: emps }] = await Promise.all([
      sb.from('hr_departments').select('*, head:crm_contacts!hr_departments_head_contact_id_fkey ( id, name )').eq('workspace_id', ws).order('name'),
      sb.from('hr_employees').select('department_id').eq('workspace_id', ws),
    ]);
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const e of (emps ?? [])) if (e.department_id) counts.set(e.department_id, (counts.get(e.department_id) ?? 0) + 1);
    return { departments: (depts ?? []).map((d: any) => ({ ...d, employee_count: counts.get(d.id) ?? 0 })) as Department[] };
  }
  createDepartment(ws: string, input: { name: string; description?: string; head_contact_id?: string }): Promise<{ department: Department }> { return call(ws, 'create-department', input); }
  updateDepartment(ws: string, department_id: string, input: { name?: string; description?: string; head_contact_id?: string | null }): Promise<{ department: Department }> { return call(ws, 'update-department', { department_id, ...input }); }
  deleteDepartment(ws: string, department_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-department', { department_id }); }

  // ── Recruitment ──
  async listJobPostings(ws: string): Promise<{ postings: JobPosting[] }> {
    const [{ data: posts, error }, { data: apps }] = await Promise.all([
      sb.from('hr_job_postings').select('*, department:hr_departments!hr_job_postings_department_id_fkey ( id, name )').eq('workspace_id', ws).order('created_at', { ascending: false }),
      sb.from('hr_applications').select('job_posting_id, stage').eq('workspace_id', ws),
    ]);
    if (error) throw error;
    const byJob = new Map<string, { total: number; active: number }>();
    for (const a of (apps ?? [])) {
      const cur = byJob.get(a.job_posting_id) ?? { total: 0, active: 0 };
      cur.total++; if (!['hired', 'rejected'].includes(a.stage)) cur.active++;
      byJob.set(a.job_posting_id, cur);
    }
    return { postings: (posts ?? []).map((p: any) => ({ ...p, applicant_count: byJob.get(p.id)?.total ?? 0, active_applicants: byJob.get(p.id)?.active ?? 0 })) as JobPosting[] };
  }
  createJobPosting(ws: string, input: Record<string, unknown>): Promise<{ posting: JobPosting }> { return call(ws, 'create-job-posting', input); }
  updateJobPosting(ws: string, job_posting_id: string, input: Record<string, unknown>): Promise<{ posting: JobPosting }> { return call(ws, 'update-job-posting', { job_posting_id, ...input }); }
  deleteJobPosting(ws: string, job_posting_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-job-posting', { job_posting_id }); }
  generateJobDescription(ws: string, input: { title: string; seniority?: string; department?: string; employment_type?: string; location?: string; keywords?: string; company?: string }): Promise<{ generated: { description: string; requirements: string; suggested_salary_min?: number; suggested_salary_max?: number }; credits_used: number }> { return call(ws, 'generate-job-description', input); }
  async listApplications(ws: string, filters: { job_posting_id?: string; stage?: AppStage } = {}): Promise<{ applications: Application[] }> {
    let q = sb.from('hr_applications')
      .select('*, candidate:hr_candidates!hr_applications_candidate_id_fkey ( id, name, email, phone, headline, resume_path ), posting:hr_job_postings!hr_applications_job_posting_id_fkey ( id, title )')
      .eq('workspace_id', ws).order('applied_at', { ascending: false });
    if (filters.job_posting_id) q = q.eq('job_posting_id', filters.job_posting_id);
    if (filters.stage) q = q.eq('stage', filters.stage);
    const { data, error } = await q;
    if (error) throw error;
    return { applications: (data ?? []) as Application[] };
  }
  createApplication(ws: string, input: { job_posting_id: string; candidate_id?: string; candidate?: { name: string; email?: string; phone?: string; headline?: string; source?: string }; notes?: string }): Promise<{ application: Application }> { return call(ws, 'create-application', input); }
  updateApplication(ws: string, application_id: string, input: { stage?: AppStage; rating?: number; notes?: string }): Promise<{ application: Application }> { return call(ws, 'update-application', { application_id, ...input }); }
  hireApplication(ws: string, application_id: string, input: { start_date?: string; department_id?: string } = {}): Promise<{ employee_id: string; onboarding_seeded: number }> { return call(ws, 'hire-application', { application_id, ...input }); }
  uploadApplicationCv(ws: string, candidate_id: string, filename: string, content_base64: string): Promise<{ ok: boolean }> { return call(ws, 'upload-application-cv', { candidate_id, filename, content_base64 }); }
  applicationCvUrl(ws: string, candidate_id: string): Promise<{ url: string }> { return call(ws, 'application-cv-url', { candidate_id }); }
  screenApplication(ws: string, application_id: string): Promise<{ application: { id: string; ai_score: number; ai_summary: string; ai_rated_at: string }; credits_used: number }> { return call(ws, 'screen-application', { application_id }); }

  // ── Onboarding ──
  async listOnboarding(ws: string, filters: { employee_id?: string; pending_only?: boolean } = {}): Promise<{ tasks: OnboardingTask[] }> {
    let q = sb.from('hr_onboarding_tasks')
      .select('*, employee:hr_employees!hr_onboarding_tasks_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
      .eq('workspace_id', ws).order('sort_order');
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    if (filters.pending_only) q = q.eq('status', 'pending');
    const { data, error } = await q;
    if (error) throw error;
    return { tasks: (data ?? []) as OnboardingTask[] };
  }
  addOnboardingTask(ws: string, input: { employee_id: string; title: string; description?: string; due_date?: string; assignee_contact_id?: string }): Promise<{ task: OnboardingTask }> { return call(ws, 'add-onboarding-task', input); }
  toggleOnboardingTask(ws: string, task_id: string): Promise<{ task: OnboardingTask }> { return call(ws, 'toggle-onboarding-task', { task_id }); }
  deleteOnboardingTask(ws: string, task_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-onboarding-task', { task_id }); }

  // ── Documents ──
  async listDocuments(ws: string, filters: { employee_id?: string } = {}): Promise<{ documents: HrDocument[] }> {
    let q = sb.from('hr_documents')
      .select('*, employee:hr_employees!hr_documents_employee_id_fkey ( id, crm_contact_id, contact:crm_contacts!hr_employees_crm_contact_id_fkey ( id, name ) )')
      .eq('workspace_id', ws).order('created_at', { ascending: false });
    if (filters.employee_id) q = q.eq('employee_id', filters.employee_id);
    const { data, error } = await q;
    if (error) throw error;
    return { documents: (data ?? []) as HrDocument[] };
  }
  uploadDocument(ws: string, input: { name: string; doc_type: DocType; content_base64: string; content_type?: string; employee_id?: string }): Promise<{ document: HrDocument }> { return call(ws, 'upload-document', input); }
  signDocument(ws: string, document_id: string): Promise<{ url: string }> { return call(ws, 'sign-document', { document_id }); }
  deleteDocument(ws: string, document_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-document', { document_id }); }

  // ── Payroll ──
  async listPayrollRuns(ws: string): Promise<{ runs: PayrollRun[] }> {
    const { data, error } = await sb.from('hr_payroll_runs').select('*').eq('workspace_id', ws).order('period', { ascending: false });
    if (error) throw error;
    return { runs: (data ?? []) as PayrollRun[] };
  }
  createPayrollRun(ws: string, input: { period: string; currency?: string }): Promise<{ run: PayrollRun; items: number }> { return call(ws, 'create-payroll-run', input); }
  getPayrollRun(ws: string, run_id: string): Promise<{ run: PayrollRun; items: PayrollItem[]; summary: PayrollSummary }> { return call(ws, 'get-payroll-run', { run_id }); }
  updatePayrollItem(ws: string, item_id: string, input: { gross: number; deductions?: number; note?: string }): Promise<{ ok: boolean; total_gross: number; total_net: number }> { return call(ws, 'update-payroll-item', { item_id, ...input }); }
  setPayrollStatus(ws: string, run_id: string, status: PayrollStatus): Promise<{ run: PayrollRun }> { return call(ws, 'set-payroll-status', { run_id, status }); }
  postPayrollToFinance(ws: string, run_id: string): Promise<{ ok: boolean; posted: { net_payment_ids: string[]; income_tax_payment_id: string | null; efka_payment_id: string | null; totals: { net: number; income_tax: number; employee_efka: number; employer_efka: number } } }> { return call(ws, 'post-payroll-to-finance', { run_id }); }
  generatePayslips(ws: string, run_id: string): Promise<{ ok: boolean; payslips: number }> { return call(ws, 'generate-payslips', { run_id }); }

  // ── Accounting documents (Claude OCR + reconcile, credit-metered) ──
  listAccountingDocs(ws: string, period?: string): Promise<{ documents: AccountingDoc[] }> { return call(ws, 'list-accounting-docs', period ? { period } : {}); }
  uploadAccountingDoc(ws: string, input: { period: string; name: string; content_base64: string; content_type?: string; payroll_run_id?: string }): Promise<{ document: AccountingDoc }> { return call(ws, 'upload-accounting-doc', input); }
  analyzeAccountingDoc(ws: string, document_id: string): Promise<{ document: AccountingDoc; credits_used: number }> { return call(ws, 'analyze-accounting-doc', { document_id }); }
  signAccountingDoc(ws: string, document_id: string): Promise<{ url: string }> { return call(ws, 'sign-accounting-doc', { document_id }); }
  deleteAccountingDoc(ws: string, document_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-accounting-doc', { document_id }); }
  prepareAccountingPeriod(ws: string, period: string): Promise<{ reconciliation: Reconciliation; stamped_finance_lines: number; credits_used: number }> { return call(ws, 'prepare-accounting-period', { period }); }
  getPayrollSettings(ws: string): Promise<{ settings: PayrollSettings; presets?: { greek_2026_bracket_reductions: BracketReductions } }> { return call(ws, 'get-payroll-settings'); }
  updatePayrollSettings(ws: string, input: Partial<PayrollSettings>): Promise<{ settings: PayrollSettings }> { return call(ws, 'update-payroll-settings', input as Record<string, unknown>); }

  // ── Employee portal invite (admin) ──
  inviteEmployee(ws: string, employee_id: string, email: string): Promise<{ ok: boolean; invited: boolean; role_note: string | null }> { return call(ws, 'invite-employee', { employee_id, email }); }

  // ── Employee self-service (caller's own record) ──
  selfProfile(ws: string): Promise<{ profile: SelfProfile }> { return call(ws, 'self-profile'); }
  selfOnboarding(ws: string): Promise<{ tasks: SelfTask[] }> { return call(ws, 'self-onboarding'); }
  toggleSelfOnboarding(ws: string, task_id: string): Promise<{ task: SelfTask }> { return call(ws, 'self-toggle-onboarding', { task_id }); }
  selfTimeoff(ws: string): Promise<{ absences: SelfAbsence[] }> { return call(ws, 'self-timeoff'); }
  requestSelfTimeoff(ws: string, input: { absence_type: AbsenceType; start_date: string; end_date: string; note?: string }): Promise<{ absence: SelfAbsence }> { return call(ws, 'self-request-timeoff', input); }
  selfDocuments(ws: string): Promise<{ documents: SelfDocument[] }> { return call(ws, 'self-documents'); }
  signSelfDocument(ws: string, document_id: string): Promise<{ url: string }> { return call(ws, 'self-sign-document', { document_id }); }
  // Employee self clock-in/out (Work Card). Records the punch and files to Ergani when configured.
  selfClock(ws: string, input: { punch_type: 'arrival' | 'departure'; comments?: string }): Promise<SelfClockResult> { return call(ws, 'self-clock', input); }
  selfPunches(ws: string, days = 14): Promise<{ punches: SelfPunch[]; clocked_in: boolean }> { return call(ws, 'self-punches', { days }); }

  // ── Admin attendance + kiosk/notification settings ──
  clockEmployee(ws: string, employee_id: string, punch_type: 'arrival' | 'departure'): Promise<ClockEmployeeResult> { return call(ws, 'clock-employee', { employee_id, punch_type }); }
  setEmployeePin(ws: string, employee_id: string, pin: string): Promise<{ ok: boolean; pin_set: boolean }> { return call(ws, 'set-employee-pin', { employee_id, pin }); }
  attendanceToday(ws: string): Promise<{ date: string; attendance: AttendanceRow[] }> { return call(ws, 'attendance-today'); }
  getHrSettings(ws: string): Promise<{ settings: HrSettings }> { return call(ws, 'get-hr-settings'); }
  saveHrSettings(ws: string, settings: Partial<HrSettings>): Promise<{ settings: HrSettings }> { return call(ws, 'save-hr-settings', settings as Record<string, unknown>); }
  listNotifyCandidates(ws: string): Promise<{ candidates: NotifyCandidate[] }> { return call(ws, 'list-notify-candidates'); }

  // ── Ergani II (Ergani) integration ──────────────────────────────────────
  // Credentials are stored per-workspace in workspace_ergani_credentials (RLS: workspace admin).
  // Config status comes from the masked get_ergani_creds_status RPC (never returns the password).
  async getErganiStatus(ws: string): Promise<ErganiCredsStatus | null> {
    const { data, error } = await supabase.rpc('get_ergani_creds_status', { p_workspace_id: ws });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return {
      username: row.username ?? null,
      employer_afm: row.employer_afm ?? null,
      branch_aa: row.branch_aa ?? '0',
      usertype: row.usertype ?? '02',
      environment: (row.environment ?? 'trial') as ErganiEnv,
      enabled: row.enabled ?? true,
      has_password: !!row.has_password,
    };
  }
  async saveErganiCredentials(ws: string, input: SaveErganiInput): Promise<void> {
    const payload: Record<string, unknown> = {
      workspace_id: ws,
      username: input.username || null,
      employer_afm: input.employer_afm || null,
      branch_aa: input.branch_aa || '0',
      usertype: input.usertype || '02',
      environment: input.environment,
      enabled: input.enabled,
      updated_at: new Date().toISOString(),
    };
    if (input.password && input.password.trim()) payload.password = input.password.trim();
    const { error } = await supabase.from('workspace_ergani_credentials').upsert(payload, { onConflict: 'workspace_id' });
    if (error) throw error;
  }
  async listErganiLeaveTypes(): Promise<ErganiLeaveType[]> {
    const { data, error } = await supabase.from('ergani_leave_types').select('*').order('sort_order');
    if (error) throw error;
    return (data ?? []) as ErganiLeaveType[];
  }

  erganiSubmissionTypes(ws: string): Promise<{ submission_types: ErganiSubmissionType[] }> { return call(ws, 'ergani-submission-types'); }
  erganiDocumentSchema(ws: string, code: string): Promise<{ code: string; schema: unknown }> { return call(ws, 'ergani-document-schema', { code }); }
  erganiEmployerInfo(ws: string): Promise<{ info: unknown }> { return call(ws, 'ergani-employer-info'); }
  submitLeave(ws: string, input: SubmitLeaveInput): Promise<{ ok: boolean; result: ErganiSubmitResult }> { return call(ws, 'ergani-submit-leave', input as unknown as Record<string, unknown>); }
  erganiSubmit(ws: string, input: { code: string; document: unknown; entity_type?: string; entity_id?: string; employee_id?: string; schedule_id?: string }): Promise<{ ok: boolean; result: ErganiSubmitResult }> { return call(ws, 'ergani-submit', input); }
  erganiDownloadPdf(ws: string, input: { code: string; protocol: string; submitted_date: string }): Promise<{ pdf_base64: string }> { return call(ws, 'ergani-download-pdf', input); }
  erganiSubmissionsLog(ws: string, filters: { employee_id?: string; submission_type?: string; limit?: number } = {}): Promise<{ submissions: ErganiSubmission[] }> { return call(ws, 'ergani-submissions-log', filters); }
  erganiRetry(ws: string, submission_id: string): Promise<{ ok: boolean; result: ErganiSubmitResult }> { return call(ws, 'ergani-retry', { submission_id }); }

  // ── Ε3 / Ε4 / Ε5 / Ε6 / Ε7 / Ε8 filings ──
  // Each is preview-then-submit: call with { preview: true } to get the document Ergani's own
  // template produced plus the keys we could not fill, then submit — optionally with an edited
  // `document`, which bypasses the builder entirely.
  submitHire(ws: string, input: { employee_id: string; preview?: boolean; document?: unknown; comments?: string }): Promise<ErganiPreview | ErganiFiled> { return call(ws, 'ergani-submit-hire', input); }
  submitSeparation(ws: string, input: { separation_id: string; preview?: boolean; document?: unknown }): Promise<ErganiPreview | ErganiFiled> { return call(ws, 'ergani-submit-separation', input); }
  submitOvertime(ws: string, input: { overtime_ids: string[]; preview?: boolean; document?: unknown; comments?: string }): Promise<ErganiPreview | ErganiFiled> { return call(ws, 'ergani-submit-overtime', input); }
  submitSchedule(ws: string, input: { schedule_id: string; kind?: 'schedule_weekly' | 'schedule_daily' | 'change'; preview?: boolean; document?: unknown; comments?: string }): Promise<ErganiPreview | ErganiFiled> { return call(ws, 'ergani-submit-schedule', input); }

  // ── Separations (Ε5/Ε6/Ε7) ──
  listSeparations(ws: string, filters: { employee_id?: string } = {}): Promise<{ separations: Separation[] }> { return call(ws, 'list-separations', filters); }
  createSeparation(ws: string, input: SeparationInput & { employee_id: string }): Promise<{ separation: Separation }> { return call(ws, 'create-separation', input as unknown as Record<string, unknown>); }
  updateSeparation(ws: string, input: Partial<SeparationInput> & { id: string }): Promise<{ separation: Separation }> { return call(ws, 'update-separation', input as unknown as Record<string, unknown>); }
  deleteSeparation(ws: string, id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-separation', { id }); }

  // ── Overtime (Ε8) ──
  listOvertime(ws: string, filters: { employee_id?: string; from?: string; to?: string } = {}): Promise<{ overtime: Overtime[] }> { return call(ws, 'list-overtime', filters); }
  createOvertime(ws: string, input: OvertimeInput & { employee_id: string }): Promise<{ overtime: Overtime }> { return call(ws, 'create-overtime', input as unknown as Record<string, unknown>); }
  updateOvertime(ws: string, input: Partial<OvertimeInput> & { id: string }): Promise<{ overtime: Overtime }> { return call(ws, 'update-overtime', input as unknown as Record<string, unknown>); }
  deleteOvertime(ws: string, id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-overtime', { id }); }

  // ── Work schedules (Ε4) ──
  listSchedules(ws: string, filters: { employee_id?: string } = {}): Promise<{ schedules: WorkSchedule[] }> { return call(ws, 'list-schedules', filters); }
  createSchedule(ws: string, input: WorkScheduleInput & { employee_id: string }): Promise<{ schedule: WorkSchedule }> { return call(ws, 'create-schedule', input as unknown as Record<string, unknown>); }
  updateSchedule(ws: string, input: Partial<WorkScheduleInput> & { id: string }): Promise<{ schedule: WorkSchedule }> { return call(ws, 'update-schedule', input as unknown as Record<string, unknown>); }
  deleteSchedule(ws: string, id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-schedule', { id }); }

  // ── Punch history + corrections + timesheet ──
  listPunches(ws: string, filters: { employee_id?: string; from?: string; to?: string } = {}): Promise<{ punches: Punch[] }> { return call(ws, 'list-punches', filters); }
  addManualPunch(ws: string, input: { employee_id: string; punch_type: 'arrival' | 'departure'; at: string; note?: string }): Promise<{ punch: Punch }> { return call(ws, 'add-manual-punch', input); }
  updatePunch(ws: string, input: { punch_id: string; punched_at?: string; punch_type?: 'arrival' | 'departure'; is_late?: boolean }): Promise<{ punch: Punch }> { return call(ws, 'update-punch', input); }
  deletePunch(ws: string, punch_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-punch', { punch_id }); }
  timesheet(ws: string, from: string, to: string): Promise<{ from: string; to: string; timesheet: TimesheetRow[] }> { return call(ws, 'timesheet', { from, to }); }
}

export const hrService = new HrService();
