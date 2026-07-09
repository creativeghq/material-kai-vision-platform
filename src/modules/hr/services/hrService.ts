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
  contact?: Partial<Pick<EmployeeContact, 'name' | 'first_name' | 'last_name' | 'email' | 'phone' | 'mobile' | 'position' | 'department' | 'date_of_birth'>>;
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
  contact?: Partial<Pick<EmployeeContact, 'name' | 'email' | 'phone' | 'mobile' | 'position' | 'department' | 'date_of_birth'>>;
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
export interface Candidate { id: string; name: string; email: string | null; phone: string | null; headline: string | null; source: string | null; created_at: string; }
export type AppStage = 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected';
export interface Application {
  id: string; job_posting_id: string; candidate_id: string; stage: AppStage; rating: number | null; notes: string | null;
  applied_at: string; hired_employee_id: string | null;
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
export interface PayrollItem { id: string; run_id: string; employee_id: string; gross: number; deductions: number; net: number; currency: string; note: string | null; basis: PayBasis | null; days_worked: number | null; hours_per_day: number | null; rate: number | null; employee?: { id: string; contact: { id: string; name: string } | null } | null; }
export interface HrAnalytics {
  headcount: number; active: number; on_leave_today: number; total_absence_days: number;
  absence_by_type: Record<string, number>; headcount_by_department: Record<string, number>;
  departments: number; open_positions: number; recruitment_funnel: Record<string, number>;
  onboarding_pending: number; last_payroll: { period: string; total_net: number; currency: string; status: string } | null;
}

export const POSTING_STATUS_LABELS: Record<PostingStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' };
export const APP_STAGE_LABELS: Record<AppStage, string> = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offer: 'Offer', hired: 'Hired', rejected: 'Rejected' };
export const APP_STAGES: AppStage[] = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected'];
export const DOC_TYPE_LABELS: Record<DocType, string> = { contract: 'Contract', id: 'ID / Tax', certificate: 'Certificate', payslip: 'Payslip', review: 'Review', other: 'Other' };

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
  generateJobDescription(ws: string, input: { title: string; seniority?: string; department?: string; employment_type?: string; location?: string; keywords?: string; company?: string }): Promise<{ generated: { description: string; requirements: string; suggested_salary_min?: number; suggested_salary_max?: number } }> { return call(ws, 'generate-job-description', input); }
  listApplications(ws: string, filters: { job_posting_id?: string; stage?: AppStage } = {}): Promise<{ applications: Application[] }> { return call(ws, 'list-applications', filters); }
  createApplication(ws: string, input: { job_posting_id: string; candidate_id?: string; candidate?: { name: string; email?: string; phone?: string; headline?: string; source?: string }; notes?: string }): Promise<{ application: Application }> { return call(ws, 'create-application', input); }
  updateApplication(ws: string, application_id: string, input: { stage?: AppStage; rating?: number; notes?: string }): Promise<{ application: Application }> { return call(ws, 'update-application', { application_id, ...input }); }
  hireApplication(ws: string, application_id: string, input: { start_date?: string; department_id?: string } = {}): Promise<{ employee_id: string; onboarding_seeded: number }> { return call(ws, 'hire-application', { application_id, ...input }); }

  // ── Onboarding ──
  listOnboarding(ws: string, filters: { employee_id?: string; pending_only?: boolean } = {}): Promise<{ tasks: OnboardingTask[] }> { return call(ws, 'list-onboarding', filters); }
  addOnboardingTask(ws: string, input: { employee_id: string; title: string; description?: string; due_date?: string; assignee_contact_id?: string }): Promise<{ task: OnboardingTask }> { return call(ws, 'add-onboarding-task', input); }
  toggleOnboardingTask(ws: string, task_id: string): Promise<{ task: OnboardingTask }> { return call(ws, 'toggle-onboarding-task', { task_id }); }
  deleteOnboardingTask(ws: string, task_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-onboarding-task', { task_id }); }

  // ── Documents ──
  listDocuments(ws: string, filters: { employee_id?: string } = {}): Promise<{ documents: HrDocument[] }> { return call(ws, 'list-documents', filters); }
  documentUploadPath(ws: string, input: { filename: string; employee_id?: string }): Promise<{ bucket: string; path: string }> { return call(ws, 'document-upload-path', input); }
  recordDocument(ws: string, input: { name: string; doc_type: DocType; storage_bucket: string; storage_object_path: string; size_bytes?: number; employee_id?: string }): Promise<{ document: HrDocument }> { return call(ws, 'record-document', input); }
  signDocument(ws: string, document_id: string): Promise<{ url: string }> { return call(ws, 'sign-document', { document_id }); }
  deleteDocument(ws: string, document_id: string): Promise<{ ok: boolean }> { return call(ws, 'delete-document', { document_id }); }

  // ── Payroll ──
  listPayrollRuns(ws: string): Promise<{ runs: PayrollRun[] }> { return call(ws, 'list-payroll-runs'); }
  createPayrollRun(ws: string, input: { period: string; currency?: string }): Promise<{ run: PayrollRun; items: number }> { return call(ws, 'create-payroll-run', input); }
  getPayrollRun(ws: string, run_id: string): Promise<{ run: PayrollRun; items: PayrollItem[] }> { return call(ws, 'get-payroll-run', { run_id }); }
  updatePayrollItem(ws: string, item_id: string, input: { gross: number; deductions: number; note?: string }): Promise<{ ok: boolean; total_gross: number; total_net: number }> { return call(ws, 'update-payroll-item', { item_id, ...input }); }
  setPayrollStatus(ws: string, run_id: string, status: PayrollStatus): Promise<{ run: PayrollRun }> { return call(ws, 'set-payroll-status', { run_id, status }); }
  postPayrollToFinance(ws: string, run_id: string): Promise<{ ok: boolean; planned_payment_id: string }> { return call(ws, 'post-payroll-to-finance', { run_id }); }
}

export const hrService = new HrService();
