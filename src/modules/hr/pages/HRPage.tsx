import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, CalendarDays, LayoutDashboard, Plus, ExternalLink, Check, X, Loader2 } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  hrService, type Employee, type Absence, type HrOverview,
  type EmploymentType, type EmployeeStatus, type AbsenceType, type AbsenceStatus,
  EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, ABSENCE_TYPE_LABELS,
} from '../services/hrService';

const statusVariant: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = {
  active: 'default', on_leave: 'secondary', terminated: 'outline',
};
const absenceStatusVariant: Record<AbsenceStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  approved: 'default', pending: 'secondary', rejected: 'destructive',
};

function employeeName(e: Employee): string {
  return e.contact?.name || [e.contact?.first_name, e.contact?.last_name].filter(Boolean).join(' ') || 'Unnamed';
}

export default function HRPage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const { toast } = useToast();
  const canManage = can('hr.manage');

  const [tab, setTab] = useState('overview');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [overview, setOverview] = useState<HrOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      const [emp, abs, ov] = await Promise.all([
        hrService.listEmployees(activeWorkspaceId),
        hrService.listAbsences(activeWorkspaceId),
        hrService.overview(activeWorkspaceId),
      ]);
      setEmployees(emp.employees);
      setAbsences(abs.absences);
      setOverview(ov.overview);
    } catch (e) {
      toast({ title: 'Failed to load HR data', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="container mx-auto max-w-6xl px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-primary/10 p-2 text-primary"><Users className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-display font-semibold">HR</h1>
          <p className="text-sm text-muted-foreground">Employees, absences & leave balances.</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview"><LayoutDashboard className="mr-2 h-4 w-4" />Overview</TabsTrigger>
          <TabsTrigger value="employees"><Users className="mr-2 h-4 w-4" />Employees</TabsTrigger>
          <TabsTrigger value="absences"><CalendarDays className="mr-2 h-4 w-4" />Absences</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab overview={overview} loading={loading} />
        </TabsContent>

        <TabsContent value="employees" className="mt-4">
          <EmployeesTab
            employees={employees}
            loading={loading}
            canManage={canManage}
            workspaceId={activeWorkspaceId}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="absences" className="mt-4">
          <AbsencesTab
            absences={absences}
            employees={employees}
            loading={loading}
            canManage={canManage}
            workspaceId={activeWorkspaceId}
            onChanged={load}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ── Overview ───────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="dashboard-card">
      <CardContent className="p-4">
        <div className="text-2xl font-semibold">{value}</div>
        <div className="text-xs text-muted-foreground mt-1">{label}</div>
      </CardContent>
    </Card>
  );
}

function OverviewTab({ overview, loading }: { overview: HrOverview | null; loading: boolean }) {
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!overview) return <p className="text-sm text-muted-foreground">No data yet.</p>;
  const byType = Object.entries(overview.days_by_type ?? {});
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Headcount" value={overview.headcount} />
        <StatCard label="Active" value={overview.active_count} />
        <StatCard label="On leave today" value={overview.on_leave_today} />
        <StatCard label="Total absence days" value={overview.total_absence_days} />
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Absence days by type</CardTitle></CardHeader>
        <CardContent>
          {byType.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approved absences recorded.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {byType.map(([type, days]) => (
                <Badge key={type} variant="secondary">
                  {ABSENCE_TYPE_LABELS[type as AbsenceType] ?? type}: {days}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Employees ──────────────────────────────────────────────────────────────
function EmployeesTab({
  employees, loading, canManage, workspaceId, onChanged,
}: {
  employees: Employee[]; loading: boolean; canManage: boolean; workspaceId: string | null; onChanged: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Employees</CardTitle>
        {canManage && workspaceId && <AddEmployeeDialog workspaceId={workspaceId} onDone={onChanged} />}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : employees.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No employees yet. {canManage ? 'Add the first one.' : ''}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Absence days</TableHead>
                <TableHead className="text-right">Leave left</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-medium">
                    {employeeName(e)}
                    {e.on_leave_today && <Badge variant="secondary" className="ml-2">On leave</Badge>}
                  </TableCell>
                  <TableCell>{e.contact?.position || '—'}</TableCell>
                  <TableCell>{e.contact?.department || '—'}</TableCell>
                  <TableCell>{e.employment_type ? EMPLOYMENT_TYPE_LABELS[e.employment_type] : '—'}</TableCell>
                  <TableCell><Badge variant={statusVariant[e.status]}>{EMPLOYEE_STATUS_LABELS[e.status]}</Badge></TableCell>
                  <TableCell className="text-right">{e.total_absence_days}</TableCell>
                  <TableCell className="text-right">{e.remaining_leave_days}</TableCell>
                  <TableCell className="text-right">
                    {e.crm_contact_id && (
                      <Button asChild variant="ghost" size="sm">
                        <Link to={`/crm/contacts/${e.crm_contact_id}`} title="Open CRM contact">
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function AddEmployeeDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [employmentType, setEmploymentType] = useState<EmploymentType>('full_time');
  const [startDate, setStartDate] = useState('');
  const [allowance, setAllowance] = useState('20');

  const reset = () => {
    setName(''); setEmail(''); setPosition(''); setDepartment('');
    setEmploymentType('full_time'); setStartDate(''); setAllowance('20');
  };

  const submit = async () => {
    if (!name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.createEmployee(workspaceId, {
        contact: { name: name.trim(), email: email.trim() || undefined, position: position.trim() || undefined, department: department.trim() || undefined },
        employment_type: employmentType,
        start_date: startDate || null,
        annual_leave_allowance_days: Number(allowance) || 0,
      });
      toast({ title: 'Employee added' });
      setOpen(false); reset(); onDone();
    } catch (e) {
      toast({ title: 'Could not add employee', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Add employee</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Full name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" /></div>
            <div className="space-y-1"><Label>Position</Label><Input value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Designer" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Department</Label><Input value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>Employment type</Label>
              <Select value={employmentType} onValueChange={(v) => setEmploymentType(v as EmploymentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => (
                    <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start date</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Annual leave (days)</Label><Input type="number" min={0} value={allowance} onChange={(e) => setAllowance(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add employee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Absences ───────────────────────────────────────────────────────────────
function AbsencesTab({
  absences, employees, loading, canManage, workspaceId, onChanged,
}: {
  absences: Absence[]; employees: Employee[]; loading: boolean; canManage: boolean; workspaceId: string | null; onChanged: () => void;
}) {
  const { toast } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);

  const nameByEmployeeId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees) m.set(e.id, employeeName(e));
    return m;
  }, [employees]);

  const decide = async (absenceId: string, decision: 'approve' | 'reject') => {
    if (!workspaceId) return;
    setBusyId(absenceId);
    try {
      if (decision === 'approve') await hrService.approveAbsence(workspaceId, absenceId);
      else await hrService.rejectAbsence(workspaceId, absenceId);
      toast({ title: decision === 'approve' ? 'Absence approved' : 'Absence rejected' });
      onChanged();
    } catch (e) {
      toast({ title: 'Action failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Absences</CardTitle>
        {canManage && workspaceId && employees.length > 0 && (
          <LogAbsenceDialog workspaceId={workspaceId} employees={employees} onDone={onChanged} />
        )}
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4"><Skeleton className="h-40 w-full" /></div>
        ) : absences.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">No absences recorded.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>From</TableHead>
                <TableHead>To</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {absences.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">
                    {a.employee?.contact?.name || nameByEmployeeId.get(a.employee_id) || '—'}
                  </TableCell>
                  <TableCell>{ABSENCE_TYPE_LABELS[a.absence_type]}</TableCell>
                  <TableCell>{a.start_date}</TableCell>
                  <TableCell>{a.end_date}</TableCell>
                  <TableCell className="text-right">{a.working_days ?? '—'}</TableCell>
                  <TableCell><Badge variant={absenceStatusVariant[a.status]}>{a.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    {canManage && a.status === 'pending' && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'approve')} title="Approve">
                          <Check className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')} title="Reject">
                          <X className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function LogAbsenceDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [absenceType, setAbsenceType] = useState<AbsenceType>('vacation');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [note, setNote] = useState('');

  const reset = () => { setEmployeeId(''); setAbsenceType('vacation'); setStartDate(''); setEndDate(''); setNote(''); };

  const submit = async () => {
    if (!employeeId) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!startDate || !endDate) { toast({ title: 'Start and end dates are required', variant: 'destructive' }); return; }
    if (endDate < startDate) { toast({ title: 'End date must be on or after start date', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.recordAbsence(workspaceId, {
        employee_id: employeeId, absence_type: absenceType, start_date: startDate, end_date: endDate, note: note.trim() || undefined,
      });
      toast({ title: 'Absence logged', description: 'Pending approval.' });
      setOpen(false); reset(); onDone();
    } catch (e) {
      toast({ title: 'Could not log absence', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" />Log absence</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log absence</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{employeeName(e)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={absenceType} onValueChange={(v) => setAbsenceType(v as AbsenceType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((t) => (
                  <SelectItem key={t} value={t}>{ABSENCE_TYPE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From *</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div className="space-y-1"><Label>To *</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Working days are computed automatically (weekends excluded).</p>
          <div className="space-y-1"><Label>Note</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Log absence</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
