import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';

// #252 — client for the `hr-api` edge function. Every call passes the active workspace_id; the
// edge function re-derives access from the caller (JWT) and enforces entitlement + hr.view/hr.manage.

export type EmploymentType = 'full_time' | 'part_time' | 'contractor';
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
}

export const hrService = new HrService();
