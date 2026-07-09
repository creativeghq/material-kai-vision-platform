import React from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users, LayoutDashboard, CalendarDays, Network, Briefcase, ClipboardCheck, FolderOpen, Wallet, Clock, Receipt,
} from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Skeleton } from '@/components/core/ui/skeleton';
import { OverviewSection } from '../components/OverviewSection';
import { EmployeesSection } from '../components/EmployeesSection';
import { DepartmentsSection } from '../components/DepartmentsSection';
import { TimeOffSection } from '../components/TimeOffSection';
import { AttendanceSection } from '../components/AttendanceSection';
import { RecruitmentSection } from '../components/RecruitmentSection';
import { OnboardingSection } from '../components/OnboardingSection';
import { DocumentsSection } from '../components/DocumentsSection';
import { PayrollSection } from '../components/PayrollSection';
import { AccountingSection } from '../components/AccountingSection';

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="flex w-full items-center gap-2 px-3 pt-3 pb-1">
    <span className="h-px flex-1 bg-foreground/40" aria-hidden="true" />
    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</span>
    <span className="h-px flex-1 bg-foreground/40" aria-hidden="true" />
  </div>
);

export default function HRPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const canManage = can('hr.manage');
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview';

  const setTab = (v: string) => {
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  const ws = activeWorkspaceId;
  const sectionProps = { workspaceId: ws, canManage };

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="min-h-screen">
      <PageHeader icon={Users} title="HR" subtitle="Employees, org, recruiting, onboarding, documents & payroll" />

      <div className="p-3 sm:p-6">
        <Tabs value={tab} onValueChange={setTab} orientation="vertical" className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <TabsList className="finance-tabs-list flex h-auto w-full shrink-0 flex-row flex-wrap gap-1 bg-transparent p-0 lg:w-56 lg:flex-col lg:flex-nowrap">
            <TabsTrigger value="overview" className="w-full justify-start"><LayoutDashboard className="h-4 w-4 mr-2" /> Overview</TabsTrigger>
            <TabsTrigger value="employees" className="w-full justify-start"><Users className="h-4 w-4 mr-2" /> Employees</TabsTrigger>
            <TabsTrigger value="departments" className="w-full justify-start"><Network className="h-4 w-4 mr-2" /> Departments</TabsTrigger>
            <TabsTrigger value="timeoff" className="w-full justify-start"><CalendarDays className="h-4 w-4 mr-2" /> Time Off</TabsTrigger>
            <TabsTrigger value="attendance" className="w-full justify-start"><Clock className="h-4 w-4 mr-2" /> Attendance</TabsTrigger>

            <SectionLabel>Recruiting</SectionLabel>
            <TabsTrigger value="recruitment" className="w-full justify-start"><Briefcase className="h-4 w-4 mr-2" /> Jobs &amp; Applicants</TabsTrigger>
            <TabsTrigger value="onboarding" className="w-full justify-start"><ClipboardCheck className="h-4 w-4 mr-2" /> Onboarding</TabsTrigger>

            <SectionLabel>Records</SectionLabel>
            <TabsTrigger value="documents" className="w-full justify-start"><FolderOpen className="h-4 w-4 mr-2" /> Documents</TabsTrigger>
            <TabsTrigger value="payroll" className="w-full justify-start"><Wallet className="h-4 w-4 mr-2" /> Payroll</TabsTrigger>
            <TabsTrigger value="accounting" className="w-full justify-start"><Receipt className="h-4 w-4 mr-2" /> Accounting</TabsTrigger>
          </TabsList>

          <div className="min-w-0 flex-1 space-y-4">
            <TabsContent value="overview" className="mt-0 space-y-4"><OverviewSection {...sectionProps} /></TabsContent>
            <TabsContent value="employees" className="mt-0 space-y-4"><EmployeesSection {...sectionProps} /></TabsContent>
            <TabsContent value="departments" className="mt-0 space-y-4"><DepartmentsSection {...sectionProps} /></TabsContent>
            <TabsContent value="timeoff" className="mt-0 space-y-4"><TimeOffSection {...sectionProps} /></TabsContent>
            <TabsContent value="attendance" className="mt-0 space-y-4"><AttendanceSection {...sectionProps} /></TabsContent>
            <TabsContent value="recruitment" className="mt-0 space-y-4"><RecruitmentSection {...sectionProps} /></TabsContent>
            <TabsContent value="onboarding" className="mt-0 space-y-4"><OnboardingSection {...sectionProps} /></TabsContent>
            <TabsContent value="documents" className="mt-0 space-y-4"><DocumentsSection {...sectionProps} /></TabsContent>
            <TabsContent value="payroll" className="mt-0 space-y-4"><PayrollSection {...sectionProps} /></TabsContent>
            <TabsContent value="accounting" className="mt-0 space-y-4"><AccountingSection {...sectionProps} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export interface HrSectionProps { workspaceId: string | null; canManage: boolean; }
