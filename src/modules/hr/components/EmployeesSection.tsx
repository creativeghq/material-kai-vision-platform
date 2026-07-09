import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ExternalLink, Loader2, Pencil, Users } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type Employee, type Department, type EmploymentType, type EmployeeStatus,
  EMPLOYMENT_TYPE_LABELS, EMPLOYEE_STATUS_LABELS,
} from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const statusVariant: Record<EmployeeStatus, 'default' | 'secondary' | 'outline'> = { active: 'default', on_leave: 'secondary', terminated: 'outline' };
const empName = (e: Employee) => e.contact?.name || [e.contact?.first_name, e.contact?.last_name].filter(Boolean).join(' ') || 'Unnamed';

export function EmployeesSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Employee | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [e, d] = await Promise.all([hrService.listEmployees(workspaceId), hrService.listDepartments(workspaceId)]);
      setEmployees(e.employees); setDepartments(d.departments);
    } catch (err) { toast({ title: 'Failed to load employees', description: (err as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—';

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Employees" subtitle={`${employees.length} people`} actions={canManage && workspaceId ? <AddEmployeeDialog workspaceId={workspaceId} departments={departments} onDone={load} /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {employees.length === 0 ? <EmptyState icon={Users} title="No employees yet" hint={canManage ? 'Add your first employee.' : undefined} /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Position</TableHead><TableHead>Department</TableHead>
                <TableHead>Type</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Absence</TableHead><TableHead className="text-right">Leave left</TableHead><TableHead />
              </TableRow></TableHeader>
              <TableBody>
                {employees.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">{empName(e)}{e.on_leave_today && <Badge variant="secondary" className="ml-2">On leave</Badge>}</TableCell>
                    <TableCell>{e.contact?.position || '—'}</TableCell>
                    <TableCell>{deptName(e.department_id)}</TableCell>
                    <TableCell>{e.employment_type ? EMPLOYMENT_TYPE_LABELS[e.employment_type] : '—'}</TableCell>
                    <TableCell><Badge variant={statusVariant[e.status]}>{EMPLOYEE_STATUS_LABELS[e.status]}</Badge></TableCell>
                    <TableCell className="text-right">{e.total_absence_days}</TableCell>
                    <TableCell className="text-right">{e.remaining_leave_days}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && <Button variant="ghost" size="sm" onClick={() => setEditing(e)} title="Edit"><Pencil className="h-4 w-4" /></Button>}
                        {e.crm_contact_id && <Button asChild variant="ghost" size="sm"><Link to={`/crm/contacts/${e.crm_contact_id}`} title="Open CRM contact"><ExternalLink className="h-4 w-4" /></Link></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
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
  const [f, setF] = useState({ name: '', email: '', position: '', department_id: '', employment_type: 'full_time' as EmploymentType, start_date: '', allowance: '20', salary: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => setF({ name: '', email: '', position: '', department_id: '', employment_type: 'full_time', start_date: '', allowance: '20', salary: '' });

  const submit = async () => {
    if (!f.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.createEmployee(workspaceId, {
        contact: { name: f.name.trim(), email: f.email.trim() || undefined, position: f.position.trim() || undefined },
        employment_type: f.employment_type, start_date: f.start_date || null,
        annual_leave_allowance_days: Number(f.allowance) || 0,
        department_id: f.department_id || null, monthly_salary: f.salary ? Number(f.salary) : null,
      });
      toast({ title: 'Employee added' }); setOpen(false); reset(); onDone();
    } catch (e) { toast({ title: 'Could not add employee', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Add employee</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
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
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Start date</Label><Input type="date" value={f.start_date} onChange={(e) => upd('start_date', e.target.value)} /></div>
            <div className="space-y-1"><Label>Leave (days)</Label><Input type="number" min={0} value={f.allowance} onChange={(e) => upd('allowance', e.target.value)} /></div>
            <div className="space-y-1"><Label>Monthly salary</Label><Input type="number" min={0} value={f.salary} onChange={(e) => upd('salary', e.target.value)} placeholder="0" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add employee</Button>
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
  const [salary, setSalary] = useState(employee.monthly_salary != null ? String(employee.monthly_salary) : '');
  const [allowance, setAllowance] = useState(String(employee.annual_leave_allowance_days ?? 0));

  const submit = async () => {
    setSaving(true);
    try {
      await hrService.updateEmployee(workspaceId, {
        employee_id: employee.id, status, department_id: deptId || null,
        monthly_salary: salary ? Number(salary) : null, annual_leave_allowance_days: Number(allowance) || 0,
      });
      toast({ title: 'Employee updated' }); onDone();
    } catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
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
            <div className="space-y-1"><Label>Monthly salary</Label><Input type="number" min={0} value={salary} onChange={(e) => setSalary(e.target.value)} /></div>
            <div className="space-y-1"><Label>Annual leave (days)</Label><Input type="number" min={0} value={allowance} onChange={(e) => setAllowance(e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
