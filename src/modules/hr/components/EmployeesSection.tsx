import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, ExternalLink, Loader2, Pencil, Users, Mail } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { ContractsSection } from '@/components/features/contracts/ContractsSection';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type Employee, type Department, type EmploymentType, type EmployeeStatus, type PayBasis,
  EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS, PAY_BASIS_LABELS,
} from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';
import { parseDecimal } from '@/utils/decimal';
import { statusTone } from '@/utils/statusTone';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildEmployeeFilters } from './hrFilters';

const empName = (e: Employee) => e.contact?.name || [e.contact?.first_name, e.contact?.last_name].filter(Boolean).join(' ') || 'Unnamed';

export function EmployeesSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [e, d] = await Promise.all([hrService.listEmployees(workspaceId), hrService.listDepartments(workspaceId)]);
      setEmployees(e.employees); setDepartments(d.departments);
      setPage((p) => clampPage(p, e.employees.length));
    } catch (err) { toast({ title: 'Failed to load employees', description: (err as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—';

  const filterGroups = useMemo(() => buildEmployeeFilters(employees, departments), [employees, departments]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount, activeCount } =
    useFilters<Employee>(employees, filterGroups);
  // A narrowed roster is a different list — restart at the first page.
  useEffect(() => { setPage(1); }, [filterValues]);

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Employees" subtitle={`${employees.length} people`} actions={canManage && workspaceId ? <AddEmployeeDialog workspaceId={workspaceId} departments={departments} onDone={load} /> : undefined} />
      {employees.length > 0 && (
        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          title="Filter employees"
          searchPlaceholder="Search employees…"
        />
      )}
      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={activeCount > 0 ? 'No employees match your filters' : 'No employees yet'}
              hint={activeCount > 0 ? 'Clear a constraint to widen the list.' : canManage ? 'Add your first employee.' : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Position</TableHead><TableHead>Department</TableHead>
                <TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Absence</TableHead><TableHead className="text-right">Leave left</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {paginate(filtered, page).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{empName(e)}{e.on_leave_today && <span className="ml-2 text-xs text-amber-600 dark:text-amber-400">On leave</span>}</TableCell>
                    <TableCell>{e.contact?.position || '—'}</TableCell>
                    <TableCell>{deptName(e.department_id)}</TableCell>
                    <TableCell>{e.employment_type ? EMPLOYMENT_TYPE_LABELS[e.employment_type] : '—'}</TableCell>
                    <TableCell><span className={`text-sm capitalize ${statusTone(e.status)}`}>{EMPLOYEE_STATUS_LABELS[e.status]}</span></TableCell>
                    <TableCell className="text-right">{e.total_absence_days}</TableCell>
                    <TableCell className="text-right">{e.remaining_leave_days}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && workspaceId && <InviteButton workspaceId={workspaceId} employee={e} onDone={load} />}
                        {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
                        {e.crm_contact_id && <Button asChild variant="ghost" size="sm"><Link to={`/crm/contacts/${e.crm_contact_id}`} title="Open CRM contact"><ExternalLink className="h-4 w-4" /></Link></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="employees" />
        </CardContent>
      </Card>

      {editing && workspaceId && (
        <EditEmployeeDialog workspaceId={workspaceId} employee={editing} departments={departments} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

function AddEmployeeDialog({ workspaceId, departments, onDone }: { workspaceId: string; departments: Department[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [f, setF] = useState({ name: '', email: '', position: '', department_id: '', employment_type: 'full_time' as EmploymentType, start_date: '', allowance: '20', pay_basis: 'monthly' as PayBasis, salary: '', hourly: '', weekly: '40', vat: '', amka: '', children: '0', workStart: '', workEnd: '' });

  // #251 App Launcher deep-link: /hr?tab=employees&new=employee opens this Add-employee dialog.
  useEffect(() => {
    if (searchParams.get('new') === 'employee') {
      setOpen(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [searchParams, setSearchParams]);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => { setF({ name: '', email: '', position: '', department_id: '', employment_type: 'full_time', start_date: '', allowance: '20', pay_basis: 'monthly', salary: '', hourly: '', weekly: '40', vat: '', amka: '', children: '0', workStart: '', workEnd: '' }); setWorkDays([1, 2, 3, 4, 5]); };

  const submit = async () => {
    if (!f.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.createEmployee(workspaceId, {
        contact: { name: f.name.trim(), email: f.email.trim() || undefined, position: f.position.trim() || undefined, vat_number: f.vat.trim() || undefined },
        employment_type: f.employment_type, start_date: f.start_date || null,
        annual_leave_allowance_days: Number(f.allowance) || 0,
        department_id: f.department_id || null, pay_basis: f.pay_basis,
        monthly_salary: f.pay_basis === 'monthly' ? parseDecimal(f.salary) : null,
        hourly_rate: f.pay_basis === 'hourly' ? parseDecimal(f.hourly) : null,
        weekly_hours: f.pay_basis === 'hourly' ? parseDecimal(f.weekly) : null,
        amka: f.amka.trim() || null, dependent_children: Number(f.children) || 0,
        work_start_time: f.workStart || null, work_end_time: f.workEnd || null, work_days: workDays,
      });
      toast({ title: 'Employee added' }); setOpen(false); reset(); onDone();
    } catch (e) { toast({ title: 'Could not add employee', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Add employee</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add employee</DialogTitle>
          <DialogDescription>Create a new employee record with role, employment type and compensation.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Full name *</Label><Input value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="Jane Doe" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} /></div>
            <div className="space-y-1"><Label>Position</Label><Input value={f.position} onChange={(e) => upd('position', e.target.value)} placeholder="Designer" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={f.department_id || 'none'} onValueChange={(v) => upd('department_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Employment type</Label>
              <Select value={f.employment_type} onValueChange={(v) => upd('employment_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Start date</Label><Input type="date" value={f.start_date} onChange={(e) => upd('start_date', e.target.value)} /></div>
            <div className="space-y-1"><Label>Leave (days)</Label><Input type="number" min={0} value={f.allowance} onChange={(e) => upd('allowance', e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>VAT number <span className="text-muted-foreground text-xs">(for Ergani)</span></Label><Input value={f.vat} onChange={(e) => upd('vat', e.target.value)} className="font-mono" maxLength={9} placeholder="9 digits" /></div>
            <div className="space-y-1"><Label>AMKA <span className="text-muted-foreground text-xs">(social security no. — for Ergani)</span></Label><Input value={f.amka} onChange={(e) => upd('amka', e.target.value)} className="font-mono" maxLength={11} placeholder="11 digits" /></div>
          </div>
          <WorkingTimeFields start={f.workStart} end={f.workEnd} days={workDays} onStart={(v) => upd('workStart', v)} onEnd={(v) => upd('workEnd', v)} onToggleDay={(n) => setWorkDays((d) => d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort())} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pay basis</Label>
              <Select value={f.pay_basis} onValueChange={(v) => upd('pay_basis', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PAY_BASIS_LABELS) as PayBasis[]).map((b) => <SelectItem key={b} value={b}>{PAY_BASIS_LABELS[b]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {f.pay_basis === 'monthly'
              ? <div className="space-y-1"><Label>Monthly salary</Label><Input type="text" inputMode="decimal" value={f.salary} onChange={(e) => upd('salary', e.target.value)} placeholder="0" /></div>
              : <>
                  <div className="space-y-1"><Label>Hourly rate</Label><Input type="text" inputMode="decimal" value={f.hourly} onChange={(e) => upd('hourly', e.target.value)} placeholder="0" /></div>
                  <div className="space-y-1"><Label>Weekly hours <span className="text-muted-foreground text-xs">(→ hours/day)</span></Label><Input type="text" inputMode="decimal" value={f.weekly} onChange={(e) => upd('weekly', e.target.value)} placeholder="40" /></div>
                </>}
          </div>
          <div className="space-y-1 w-1/2"><Label>Dependent children <span className="text-muted-foreground text-xs">(tax credit)</span></Label><Input type="number" min={0} value={f.children} onChange={(e) => upd('children', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add employee</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteButton({ workspaceId, employee, onDone }: { workspaceId: string; employee: Employee; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState(employee.contact?.email ?? '');

  const submit = async () => {
    if (!email.trim()) { toast({ title: 'Email is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const r = await hrService.inviteEmployee(workspaceId, employee.id, email.trim());
      toast({ title: r.invited ? 'Portal invite sent' : 'Employee linked to portal', description: r.role_note || (r.invited ? 'They’ll get an email to set a password.' : undefined) });
      setOpen(false); onDone();
    } catch (e) { toast({ title: 'Invite failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="sm" title="Invite to employee portal"><Mail className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Invite {empName(employee)} to the portal</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">They’ll get a login limited to their own HR self-service — their profile, onboarding, time-off requests and documents. They cannot see other employees, sales, finance or CRM.</p>
          <div className="space-y-1"><Label>Work email *</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Send invite</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditEmployeeDialog({ workspaceId, employee, departments, onClose, onDone }: { workspaceId: string; employee: Employee; departments: Department[]; onClose: () => void; onDone: () => void }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<EmployeeStatus>(employee.status);
  const [deptId, setDeptId] = useState(employee.department_id ?? '');
  const [payBasis, setPayBasis] = useState<PayBasis>(employee.pay_basis ?? 'monthly');
  const [salary, setSalary] = useState(employee.monthly_salary != null ? String(employee.monthly_salary) : '');
  const [hourly, setHourly] = useState(employee.hourly_rate != null ? String(employee.hourly_rate) : '');
  const [weekly, setWeekly] = useState(employee.weekly_hours != null ? String(employee.weekly_hours) : '40');
  const [allowance, setAllowance] = useState(String(employee.annual_leave_allowance_days ?? 0));
  const [vat, setVat] = useState(employee.contact?.vat_number ?? '');
  const [amka, setAmka] = useState(employee.amka ?? '');
  const [children, setChildren] = useState(String(employee.dependent_children ?? 0));
  const [workStart, setWorkStart] = useState(employee.work_start_time ? String(employee.work_start_time).slice(0, 5) : '');
  const [workEnd, setWorkEnd] = useState(employee.work_end_time ? String(employee.work_end_time).slice(0, 5) : '');
  const [workDays, setWorkDays] = useState<number[]>(employee.work_days ?? [1, 2, 3, 4, 5]);
  const [pin, setPin] = useState('');

  const submit = async () => {
    setSaving(true);
    try {
      await hrService.updateEmployee(workspaceId, {
        employee_id: employee.id, status, department_id: deptId || null, pay_basis: payBasis,
        monthly_salary: payBasis === 'monthly' ? parseDecimal(salary) : null,
        hourly_rate: payBasis === 'hourly' ? parseDecimal(hourly) : null,
        weekly_hours: payBasis === 'hourly' ? parseDecimal(weekly) : null,
        annual_leave_allowance_days: Number(allowance) || 0,
        amka: amka.trim() || null, dependent_children: Number(children) || 0,
        work_start_time: workStart || null, work_end_time: workEnd || null, work_days: workDays,
        contact: { vat_number: vat.trim() || null },
      });
      if (pin.trim()) await hrService.setEmployeePin(workspaceId, employee.id, pin.trim());
      toast({ title: 'Employee updated' }); onDone();
    } catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{empName(employee)}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as EmployeeStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(EMPLOYEE_STATUS_LABELS) as EmployeeStatus[]).map((s) => <SelectItem key={s} value={s}>{EMPLOYEE_STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={deptId || 'none'} onValueChange={(v) => setDeptId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Pay basis</Label>
              <Select value={payBasis} onValueChange={(v) => setPayBasis(v as PayBasis)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(PAY_BASIS_LABELS) as PayBasis[]).map((b) => <SelectItem key={b} value={b}>{PAY_BASIS_LABELS[b]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {payBasis === 'monthly'
              ? <div className="space-y-1"><Label>Monthly salary</Label><Input type="text" inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
              : <div className="space-y-1"><Label>Hourly rate</Label><Input type="text" inputMode="decimal" value={hourly} onChange={(e) => setHourly(e.target.value)} /></div>}
          </div>
          {payBasis === 'hourly' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Weekly hours <span className="text-muted-foreground text-xs">(→ hours/day)</span></Label><Input type="text" inputMode="decimal" value={weekly} onChange={(e) => setWeekly(e.target.value)} placeholder="40" /></div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Annual leave (days)</Label><Input type="number" min={0} value={allowance} onChange={(e) => setAllowance(e.target.value)} /></div>
            <div className="space-y-1"><Label>Dependent children <span className="text-muted-foreground text-xs">(tax credit)</span></Label><Input type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>VAT number <span className="text-muted-foreground text-xs">(for Ergani)</span></Label><Input value={vat} onChange={(e) => setVat(e.target.value)} className="font-mono" maxLength={9} placeholder="9 digits" /></div>
            <div className="space-y-1"><Label>AMKA <span className="text-muted-foreground text-xs">(social security no. — for Ergani)</span></Label><Input value={amka} onChange={(e) => setAmka(e.target.value)} className="font-mono" maxLength={11} placeholder="11 digits" /></div>
          </div>
          <WorkingTimeFields start={workStart} end={workEnd} days={workDays} onStart={setWorkStart} onEnd={setWorkEnd} onToggleDay={(n) => setWorkDays((d) => d.includes(n) ? d.filter((x) => x !== n) : [...d, n].sort())} />
          <div className="space-y-1"><Label>Kiosk PIN <span className="text-muted-foreground text-xs">(optional 4–8 digits; blank = unchanged)</span></Label><Input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} className="font-mono" maxLength={8} placeholder="••••" inputMode="numeric" /></div>
        </div>
        {/* Employment contracts for this employee (HR context — admin-only via RLS). */}
        <div className="border-t border-border/60 mt-4 pt-4">
          <ContractsSection workspaceId={workspaceId} context="hr" subject={{ hr_employee_id: employee.id }} heading="Employment contracts" />
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const WEEKDAYS: [string, number][] = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 7]];
function WorkingTimeFields({ start, end, days, onStart, onEnd, onToggleDay }: {
  start: string; end: string; days: number[]; onStart: (v: string) => void; onEnd: (v: string) => void; onToggleDay: (n: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border/60 p-3">
      <Label className="text-xs text-muted-foreground">Working time <span className="normal-case">(drives lateness alerts + kiosk)</span></Label>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label className="text-xs">Start</Label><Input type="time" value={start} onChange={(e) => onStart(e.target.value)} /></div>
        <div className="space-y-1"><Label className="text-xs">End</Label><Input type="time" value={end} onChange={(e) => onEnd(e.target.value)} /></div>
      </div>
      <div className="flex gap-1 flex-wrap">
        {WEEKDAYS.map(([lbl, n]) => (
          <button type="button" key={n} onClick={() => onToggleDay(n)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${days.includes(n) ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
