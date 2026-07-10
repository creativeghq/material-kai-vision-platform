import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// #252 — client for the `hr-api` edge function. Every call passes the active workspace_id; the
// edge function re-derives access from the caller (JWT) and enforces entitlement + hr.view/hr.manage.

export type EmploymentType = 'full_time' | 'part_time' | 'contractor';
export type PayBasis = 'monthly' | 'hourly';
export const PAY_BASIS_LABELS: Record<PayBasis, string> = { monthly: 'Monthly salary', hourly: 'Hourly rate' };
export type EmployeeStatus = 'active' | 'on_leave' | 'terminated';
export type AbsenceType = 'vacation' | 'sick' | 'unpaid' | 'other';
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
  vat_number?: string | null; // ΑΦΜ — used for Ergani filings
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
  amka: string | null; // ΑΜΚΑ — social-security number, for Ergani filings
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

export interface HrOverview {
  headcount: number;
  active_count: number;
  on_leave_today: number;
  total_absence_days: number;
  days_by_type: Record<string, number>;
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
export type PostingStatus = 'draft' | 'open' | 'closed';
export interface JobPosting {
  id: string; title: string; department_id: string | null; department: { id: string; name: string } | null;
  employment_type: EmploymentType | null; location: string | null; remote: boolean;
  description: string | null; requirements: string | null; salary_min: number | null; salary_max: number | null;
  currency: string | null; status: PostingStatus; created_at: string; published_at: string | null;
  applicant_count: number; active_applicants: number;
}
export interface Candidate { id: string; name: string; email: string | null; phone: string | null; headline: string | null; source: string | null; resume_path?: string | null; created_at: string; }
export type AppStage = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
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
export type DocType = 'contract' | 'id' | 'certificate' | 'payslip' | 'review' | 'other';
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
export interface PayrollSettings {
  workspace_id?: string; country_code: string; currency: string; salaries_per_year: number;
  employee_contribution_rate: number; employer_contribution_rate: number; contribution_monthly_ceiling: number | null;
  income_tax_brackets: TaxBracket[]; tax_credit_base: number; tax_credit_per_child: Record<string, number>;
  tax_credit_taper_per_1000: number; tax_credit_taper_floor: number; is_default?: boolean;
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

export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' };
export const APP_STAGE_LABELS: Record<AppStage, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };
export const APP_STAGES: AppStage[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
export const DOC_TYPE_LABELS: Record<DocType, string> = { contract: 'Contract', id: 'ID / Tax', certificate: 'Certificate', payslip: 'Payslip', review: 'Review', other: 'Other' };

// ── Ergani II (ΠΣ Ergani) integration types ──
export type ErganiEnv = 'trial' | 'production';
export interface ErganiCredsStatus {
  username: string | null; employer_afm: string | null; branch_aa: string; usertype: string;
  environment: ErganiEnv; enabled: boolean; has_password: boolean;
}
export interface SaveErganiInput {
  username: string; password?: string; employer_afm?: string | null; branch_aa?: string;
  usertype?: string; environment: ErganiEnv; enabled: boolean;
}
export interface ErganiLeaveType { code: string; description_el: string; category: string; subcategory: string; is_hourly: boolean; sort_order: number; }
export interface ErganiSubmissionType { id: number; code: string; description: string; }
export interface ErganiSubmitResult { id: string; protocol: string; submitDate: string; }
export interface SubmitWorkcardInput { employee_id: string; punch_type: 'arrival' | 'departure'; reference_date?: string; at?: string; late_reason?: string; comments?: string; }
export interface SubmitLeaveInput { absence_id: string; ergani_leave_code: string; document?: unknown; }
export interface SaveScheduleInput { employee_id: string; schedule_type: 'weekly' | 'daily'; effective_from: string; effective_to?: string | null; details?: unknown; }
export interface WorkSchedule { id: string; workspace_id: string; employee_id: string; schedule_type: 'weekly' | 'daily'; effective_from: string; effective_to: string | null; details: unknown; status: 'draft' | 'submitted' | 'failed'; created_at: string; }
export interface ErganiSubmission {
  id: string; workspace_id: string; submission_type: string; entity_type: string | null; entity_id: string | null;
  employee_id: string | null; environment: string; status: 'submitted' | 'failed' | 'cancelled';
  protocol: string | null; ergani_id: string | null; submit_date: string | null; error: string | null; created_at: string;
}

async function call<T>(workspaceId: string, action: string, extra: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hr-api', {
    body: { action, workspace_id: workspaceId, ...extra },
  });
  if (error) throw await edgeError(error);
  return data as T;
}

class HrService {
  listEmployees(workspaceId: string): Promise<{ employees: Employee[] }> {
    return call(workspaceId, 'list-employees');
  }
  getEmployee(workspaceId: string, employeeId: string): Promise<{ employee: Employee }> {
    return call(workspaceId, 'get-employee', { employee_id: employeeId });
  }
  createEmployee(workspaceId: string, input: CreateEmployeeInput): Promise<{ employee: Employee }> {
    return call(workspaceId, 'create-employee', input as unknown as Record<string, unknown>);
  }
  updateEmployee(workspaceId: string, input: UpdateEmployeeInput): Promise<{ employee: Employee }> {
    return call(workspaceId, 'update-employee', input as unknown as Record<string, unknown>);
  }
  listAbsences(workspaceId: string, filters: { employee_id?: string; status?: AbsenceStatus } = {}): Promise<{ absences: Absence[] }> {
    return call(workspaceId, 'list-absences', filters);
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
  overview(workspaceId: string): Promise<{ overview: HrOverview }> {
    return call(workspaceId, 'overview');
  }
  analytics(workspaceId: string): Promise<{ analytics: HrAnalytics }> {
    return call(workspaceId, 'analytics');
  }

  // ── Departments ──
  listDepartments(ws: string): Promise<{ departments: Department[] }> { return call(ws, 'list-departments'); }
  createDepartment(ws: string, input: { name: string; description?: string; head_contact_id?: string }): Promise<{ department: Department }> { return call(ws, 'create-department', input); }
  updateDepartment(ws: string, department_id: string, input: { name?: string; description?: string; head_contact_id?: string | null }): Promise<{ department: Department }> { return call(ws, 'update-department', { department_id, ...input }); }
  deleteDepartment(ws: string, department_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-department', { department_id }); }

  // ── Recruitment ──
  listJobPostings(ws: string): Promise<{ postings: JobPosting[] }> { return call(ws, 'list-job-postings'); }
  createJobPosting(ws: string, input: Record<string, unknown>): Promise<{ posting: JobPosting }> { return call(ws, 'create-job-posting', input); }
  updateJobPosting(ws: string, job_posting_id: string, input: Record<string, unknown>): Promise<{ posting: JobPosting }> { return call(ws, 'update-job-posting', { job_posting_id, ...input }); }
  deleteJobPosting(ws: string, job_posting_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-job-posting', { job_posting_id }); }
  generateJobDescription(ws: string, input: { title: string; seniority?: string; department?: string; employment_type?: string; location?: string; keywords?: string; company?: string }): Promise<{ generated: { description: string; requirements: string; suggested_salary_min?: number; suggested_salary_max?: number }; credits_used: number }> { return call(ws, 'generate-job-description', input); }
  listApplications(ws: string, filters: { job_posting_id?: string; stage?: AppStage } = {}): Promise<{ applications: Application[] }> { return call(ws, 'list-applications', filters); }
  createApplication(ws: string, input: { job_posting_id: string; candidate_id?: string; candidate?: { name: string; email?: string; phone?: string; headline?: string; source?: string }; notes?: string }): Promise<{ application: Application }> { return call(ws, 'create-application', input); }
  updateApplication(ws: string, application_id: string, input: { stage?: AppStage; rating?: number; notes?: string }): Promise<{ application: Application }> { return call(ws, 'update-application', { application_id, ...input }); }
  hireApplication(ws: string, application_id: string, input: { start_date?: string; department_id?: string } = {}): Promise<{ employee_id: string; onboarding_seeded: number }> { return call(ws, 'hire-application', { application_id, ...input }); }
  uploadApplicationCv(ws: string, candidate_id: string, filename: string, content_base64: string): Promise<{ ok: boolean }> { return call(ws, 'upload-application-cv', { candidate_id, filename, content_base64 }); }
  applicationCvUrl(ws: string, candidate_id: string): Promise<{ url: string }> { return call(ws, 'application-cv-url', { candidate_id }); }
  screenApplication(ws: string, application_id: string): Promise<{ application: { id: string; ai_score: number; ai_summary: string; ai_rated_at: string }; credits_used: number }> { return call(ws, 'screen-application', { application_id }); }

  // ── Onboarding ──
  listOnboarding(ws: string, filters: { employee_id?: string; pending_only?: boolean } = {}): Promise<{ tasks: OnboardingTask[] }> { return call(ws, 'list-onboarding', filters); }
  addOnboardingTask(ws: string, input: { employee_id: string; title: string; description?: string; due_date?: string; assignee_contact_id?: string }): Promise<{ task: OnboardingTask }> { return call(ws, 'add-onboarding-task', input); }
  toggleOnboardingTask(ws: string, task_id: string): Promise<{ task: OnboardingTask }> { return call(ws, 'toggle-onboarding-task', { task_id }); }
  deleteOnboardingTask(ws: string, task_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-onboarding-task', { task_id }); }

  // ── Documents ──
  listDocuments(ws: string, filters: { employee_id?: string } = {}): Promise<{ documents: HrDocument[] }> { return call(ws, 'list-documents', filters); }
  uploadDocument(ws: string, input: { name: string; doc_type: DocType; content_base64: string; content_type?: string; employee_id?: string }): Promise<{ document: HrDocument }> { return call(ws, 'upload-document', input); }
  signDocument(ws: string, document_id: string): Promise<{ url: string }> { return call(ws, 'sign-document', { document_id }); }
  deleteDocument(ws: string, document_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-document', { document_id }); }

  // ── Payroll ──
  listPayrollRuns(ws: string): Promise<{ runs: PayrollRun[] }> { return call(ws, 'list-payroll-runs'); }
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
  getPayrollSettings(ws: string): Promise<{ settings: PayrollSettings }> { return call(ws, 'get-payroll-settings'); }
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
  selfPunches(ws: string, days = 14): Promise<{ punches: SelfPunch[] }> { return call(ws, 'self-punches', { days }); }

  // ── Admin attendance + kiosk/notification settings ──
  clockEmployee(ws: string, employee_id: string, punch_type: 'arrival' | 'departure'): Promise<ClockEmployeeResult> { return call(ws, 'clock-employee', { employee_id, punch_type }); }
  setEmployeePin(ws: string, employee_id: string, pin: string): Promise<{ ok: boolean; pin_set: boolean }> { return call(ws, 'set-employee-pin', { employee_id, pin }); }
  attendanceToday(ws: string): Promise<{ date: string; attendance: AttendanceRow[] }> { return call(ws, 'attendance-today'); }
  getHrSettings(ws: string): Promise<{ settings: HrSettings }> { return call(ws, 'get-hr-settings'); }
  saveHrSettings(ws: string, settings: Partial<HrSettings>): Promise<{ settings: HrSettings }> { return call(ws, 'save-hr-settings', settings as Record<string, unknown>); }
  listNotifyCandidates(ws: string): Promise<{ candidates: NotifyCandidate[] }> { return call(ws, 'list-notify-candidates'); }

  // ── Ergani II (ΠΣ Ergani) integration ──────────────────────────────────────
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
  submitWorkcard(ws: string, input: SubmitWorkcardInput): Promise<{ ok: boolean; result: ErganiSubmitResult; punch: unknown }> { return call(ws, 'ergani-submit-workcard', input as unknown as Record<string, unknown>); }
  submitLeave(ws: string, input: SubmitLeaveInput): Promise<{ ok: boolean; result: ErganiSubmitResult }> { return call(ws, 'ergani-submit-leave', input as unknown as Record<string, unknown>); }
  saveSchedule(ws: string, input: SaveScheduleInput): Promise<{ schedule: WorkSchedule }> { return call(ws, 'ergani-save-schedule', input as unknown as Record<string, unknown>); }
  erganiSubmit(ws: string, input: { code: string; document: unknown; entity_type?: string; entity_id?: string; employee_id?: string; schedule_id?: string }): Promise<{ ok: boolean; result: ErganiSubmitResult }> { return call(ws, 'ergani-submit', input); }
  erganiCancel(ws: string, input: { type_of_document: string; protocol: string; submitted_date: string }): Promise<{ ok: boolean; message: string }> { return call(ws, 'ergani-cancel', input); }
  erganiDownloadPdf(ws: string, input: { code: string; protocol: string; submitted_date: string }): Promise<{ pdf_base64: string }> { return call(ws, 'ergani-download-pdf', input); }
  erganiSubmissionsLog(ws: string, filters: { employee_id?: string; submission_type?: string; limit?: number } = {}): Promise<{ submissions: ErganiSubmission[] }> { return call(ws, 'ergani-submissions-log', filters); }
}

export const hrService = new HrService();
