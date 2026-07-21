/**
 * Filter definitions for the HR list surfaces.
 *
 * Employees had no list filter at all — a 200-person roster was a flat paginated table.
 * Positions had counted status tabs and nothing else; those tabs stay (they are how you move
 * between the open / draft / closed views) and the modal carries the secondary dimensions.
 */
import { Briefcase, CalendarDays, Coins, MapPin, Users } from 'lucide-react';
import { NONE_VALUE, optionsFromRows, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import {
  EMPLOYEE_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, LOCATION_TYPE_LABELS,
  type Department, type Employee, type EmployeeStatus, type EmploymentType, type JobPosting, type LocationType,
} from '../services/hrService';

const employeeName = (e: Employee) =>
  e.contact?.name || [e.contact?.first_name, e.contact?.last_name].filter(Boolean).join(' ') || 'Unnamed';

const departmentOptions = (departments: Department[], rows: Array<{ department_id: string | null }>): FilterOption[] => {
  const counts = new Map<string, number>();
  for (const r of rows) if (r.department_id) counts.set(r.department_id, (counts.get(r.department_id) ?? 0) + 1);
  return [
    { value: NONE_VALUE, label: 'No department' },
    ...departments.map((d) => ({ value: d.id, label: d.name, count: counts.get(d.id) ?? 0 })),
  ];
};

export function buildEmployeeFilters(rows: Employee[], departments: Department[]): FilterGroupDef[] {
  const statusCounts = new Map<string, number>();
  const typeCounts = new Map<string, number>();
  for (const e of rows) {
    statusCounts.set(e.status, (statusCounts.get(e.status) ?? 0) + 1);
    if (e.employment_type) typeCounts.set(e.employment_type, (typeCounts.get(e.employment_type) ?? 0) + 1);
  }

  return [
    {
      key: 'general', label: 'General', icon: Users,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search name / position…',
          accessor: (e: Employee) => [employeeName(e), e.contact?.position, e.contact?.email],
        },
        {
          key: 'status', type: 'multi', label: 'Status',
          options: (Object.keys(EMPLOYEE_STATUS_LABELS) as EmployeeStatus[])
            .map((s) => ({ value: s, label: EMPLOYEE_STATUS_LABELS[s], count: statusCounts.get(s) ?? 0 })),
          accessor: (e: Employee) => e.status,
        },
        {
          key: 'employment_type', type: 'multi', label: 'Employment type',
          options: [
            ...(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[])
              .map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t], count: typeCounts.get(t) ?? 0 })),
            { value: NONE_VALUE, label: 'Unset' },
          ],
          accessor: (e: Employee) => e.employment_type ?? undefined,
        },
        {
          key: 'department', type: 'multi', label: 'Department',
          options: departmentOptions(departments, rows),
          accessor: (e: Employee) => e.department_id ?? undefined,
        },
      ],
    },
    {
      key: 'availability', label: 'Availability', icon: CalendarDays,
      fields: [
        {
          key: 'on_leave_today', type: 'bool', label: 'On leave today',
          trueLabel: 'On leave today', falseLabel: 'Available today',
          accessor: (e: Employee) => e.on_leave_today,
        },
        {
          key: 'remaining_leave_days', type: 'range', label: 'Leave days left',
          min: 0, max: 60, step: 1,
          accessor: (e: Employee) => e.remaining_leave_days,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'start_date', type: 'dateRange', label: 'Hire date', accessor: (e: Employee) => e.start_date },
        { key: 'end_date', type: 'dateRange', label: 'End date', accessor: (e: Employee) => e.end_date },
      ],
    },
  ];
}

/** Positions list. `status` stays on the tab strip and is deliberately absent here. */
export function buildPostingFilters(rows: JobPosting[], departments: Department[]): FilterGroupDef[] {
  const salaries = rows.map((p) => Number(p.salary_max ?? p.salary_min)).filter((n) => Number.isFinite(n) && n > 0);
  const salaryMax = Math.max(salaries.length ? Math.ceil(Math.max(...salaries) / 1000) * 1000 : 0, 10000);

  return [
    {
      key: 'general', label: 'General', icon: Briefcase,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search title / level…',
          accessor: (p: JobPosting) => [p.title, p.level, p.department?.name, p.location],
        },
        {
          key: 'employment_type', type: 'multi', label: 'Employment type',
          options: (Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => ({ value: t, label: EMPLOYMENT_TYPE_LABELS[t] })),
          accessor: (p: JobPosting) => p.employment_type ?? undefined,
        },
        {
          key: 'department', type: 'multi', label: 'Department',
          options: departmentOptions(departments, rows),
          accessor: (p: JobPosting) => p.department_id ?? undefined,
        },
        {
          key: 'has_applicants', type: 'bool', label: 'Applicants',
          trueLabel: 'Has active applicants', falseLabel: 'No active applicants',
          accessor: (p: JobPosting) => p.active_applicants > 0,
        },
      ],
    },
    {
      key: 'location', label: 'Location', icon: MapPin,
      fields: [
        {
          key: 'location_type', type: 'multi', label: 'Work setup',
          options: (Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((t) => ({ value: t, label: LOCATION_TYPE_LABELS[t] })),
          // The legacy `remote` boolean predates location_type — fall back to it so old rows match.
          accessor: (p: JobPosting) => p.location_type ?? (p.remote ? 'remote' : undefined),
        },
        {
          key: 'location', type: 'multi', label: 'Location',
          options: optionsFromRows(rows, (p) => p.location ?? undefined),
          accessor: (p: JobPosting) => p.location ?? undefined,
        },
      ],
    },
    {
      key: 'compensation', label: 'Compensation', icon: Coins,
      fields: [
        {
          key: 'salary', type: 'range', label: 'Salary band',
          description: 'Matches against the top of the posted range.',
          min: 0, max: salaryMax,
          accessor: (p: JobPosting) => p.salary_max ?? p.salary_min ?? 0,
        },
      ],
    },
    {
      key: 'dates', label: 'Dates', icon: CalendarDays,
      fields: [
        { key: 'created_at', type: 'dateRange', label: 'Created', accessor: (p: JobPosting) => p.created_at },
        { key: 'closes_at', type: 'dateRange', label: 'Applications close', accessor: (p: JobPosting) => p.closes_at },
      ],
    },
  ];
}
