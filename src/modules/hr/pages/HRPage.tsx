import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Users, LayoutDashboard, CalendarDays, Network, Briefcase, ClipboardCheck, FolderOpen, Wallet, Clock, Receipt, Landmark, Package,
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
import { ErganiSection } from '../components/ErganiSection';
import { RecruitmentSection } from '../components/RecruitmentSection';
import { OnboardingSection } from '../components/OnboardingSection';
import { DocumentsSection } from '../components/DocumentsSection';
import { PayrollSection } from '../components/PayrollSection';
import { AccountingSection } from '../components/AccountingSection';
import { CompanyAssetsPanel } from '@/components/business/assets/CompanyAssetsPanel';

// Tabs whose data loads DIRECTLY from the DB (fast, RLS-gated) are PRELOADED on page open so the
// first click is instant — no skeleton "blink". Every tab (including the edge-backed
// attendance/ergani/accounting) also stays MOUNTED once visited, so a revisit never re-flashes.
// (Edge-backed tabs aren't preloaded — they'd fire an edge call on open even if never opened.)
const PRELOAD_TABS = ['overview', 'employees', 'departments', 'timeoff', 'recruitment', 'onboarding', 'documents', 'payroll', 'assets'];

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

  // Which tab panels are kept in the DOM. Preloaded (direct-DB) tabs are mounted from the start so
  // clicking them is instant; any other tab is added the first time it's opened and then stays
  // mounted (Radix would otherwise unmount inactive tabs and refetch — re-flashing every revisit).
  const [mountedTabs, setMountedTabs] = useState<Set<string>>(() => new Set([tab, ...PRELOAD_TABS]));
  const fm = (v: string): true | undefined => (mountedTabs.has(v) ? true : undefined);

  const setTab = (v: string) => {
    setMountedTabs((prev) => (prev.has(v) ? prev : new Set(prev).add(v)));
    const p = new URLSearchParams(searchParams);
    p.set('tab', v);
    setSearchParams(p, { replace: true });
  };

  const ws = activeWorkspaceId;
  const sectionProps = { workspaceId: ws, canManage };

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  // The nav link is hidden for non-HR users, but direct navigation would otherwise render the full
  // admin console (which fires PII-laden loads the server then 403s). Gate the page on hr.view.
  if (!can('hr.view')) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Users} title="HR" subtitle="Human resources" />
        <div className="p-6">
          <div className="dashboard-card p-8 text-center text-sm text-muted-foreground">
            You don’t have access to HR for this workspace. Ask a workspace owner or admin for the HR role.
          </div>
        </div>
      </div>
    );
  }

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
            <TabsTrigger value="assets" className="w-full justify-start"><Package className="h-4 w-4 mr-2" /> Assets</TabsTrigger>
            <TabsTrigger value="payroll" className="w-full justify-start"><Wallet className="h-4 w-4 mr-2" /> Payroll</TabsTrigger>
            <TabsTrigger value="accounting" className="w-full justify-start"><Receipt className="h-4 w-4 mr-2" /> Accounting</TabsTrigger>

            <SectionLabel>Compliance</SectionLabel>
            <TabsTrigger value="ergani" className="w-full justify-start"><Landmark className="h-4 w-4 mr-2" /> Ergani</TabsTrigger>
          </TabsList>

          {/*
            forceMount keeps a panel in the DOM across tab switches (no re-flash/refetch on revisit),
            BUT Radix computes `hidden = !(forceMount || isSelected)`, so a forceMounted panel is NEVER
            hidden by Radix and every mounted tab would paint at once. We hide inactive panels ourselves
            via `data-[state=inactive]:hidden` (Radix still sets data-state correctly). This is the fix
            for "HR tabs don't switch" — without it all preloaded tabs stack on top of each other.
          */}
          <div className="min-w-0 flex-1 space-y-4">
            <TabsContent value="overview" forceMount={fm('overview')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><OverviewSection {...sectionProps} /></TabsContent>
            <TabsContent value="employees" forceMount={fm('employees')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><EmployeesSection {...sectionProps} /></TabsContent>
            <TabsContent value="departments" forceMount={fm('departments')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><DepartmentsSection {...sectionProps} /></TabsContent>
            <TabsContent value="timeoff" forceMount={fm('timeoff')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><TimeOffSection {...sectionProps} /></TabsContent>
            <TabsContent value="attendance" forceMount={fm('attendance')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><AttendanceSection {...sectionProps} /></TabsContent>
            <TabsContent value="recruitment" forceMount={fm('recruitment')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><RecruitmentSection {...sectionProps} /></TabsContent>
            <TabsContent value="onboarding" forceMount={fm('onboarding')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><OnboardingSection {...sectionProps} /></TabsContent>
            <TabsContent value="documents" forceMount={fm('documents')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><DocumentsSection {...sectionProps} /></TabsContent>
            <TabsContent value="assets" forceMount={fm('assets')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><CompanyAssetsPanel workspaceId={ws} canManage={canManage} context="hr" /></TabsContent>
            <TabsContent value="payroll" forceMount={fm('payroll')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><PayrollSection {...sectionProps} /></TabsContent>
            <TabsContent value="accounting" forceMount={fm('accounting')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><AccountingSection {...sectionProps} /></TabsContent>
            <TabsContent value="ergani" forceMount={fm('ergani')} className="mt-0 space-y-4 data-[state=inactive]:hidden"><ErganiSection {...sectionProps} /></TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}

export interface HrSectionProps { workspaceId: string | null; canManage: boolean; }
