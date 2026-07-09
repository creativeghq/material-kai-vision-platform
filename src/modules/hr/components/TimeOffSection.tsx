import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Check, X, Loader2, CalendarDays } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type Absence, type Employee, type AbsenceType, type AbsenceStatus, ABSENCE_TYPE_LABELS } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const absVariant: Record<AbsenceStatus, 'default' | 'secondary' | 'destructive'> = { approved: 'default', pending: 'secondary', rejected: 'destructive' };
const empName = (e: Employee) => e.contact?.name || 'Unnamed';

export function TimeOffSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const [a, e] = await Promise.all([hrService.listAbsences(workspaceId), hrService.listEmployees(workspaceId)]); setAbsences(a.absences); setEmployees(e.employees); }
    catch (err) { toast({ title: 'Failed to load time off', description: (err as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, empName(e)])), [employees]);
  const pending = absences.filter((a) => a.status === 'pending').length;

  const decide = async (id: string, decision: 'approve' | 'reject') => {
    if (!workspaceId) return;
    setBusyId(id);
    try { decision === 'approve' ? await hrService.approveAbsence(workspaceId, id) : await hrService.rejectAbsence(workspaceId, id); toast({ title: decision === 'approve' ? 'Approved' : 'Rejected' }); load(); }
    catch (e) { toast({ title: 'Action failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Time Off" subtitle={pending ? `${pending} pending approval` : 'All caught up'} actions={canManage && workspaceId && employees.length > 0 ? <LogAbsenceDialog workspaceId={workspaceId} employees={employees} onDone={load} /> : undefined} />
      <Card>
        <CardContent className="p-0">
          {absences.length === 0 ? <EmptyState icon={CalendarDays} title="No time off recorded" /> : (
            <Table>
              <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>From</TableHead><TableHead>To</TableHead><TableHead className="text-right">Days</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {absences.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-medium">{a.employee?.contact?.name || nameById.get(a.employee_id) || '—'}</TableCell>
                    <TableCell>{ABSENCE_TYPE_LABELS[a.absence_type]}</TableCell>
                    <TableCell>{a.start_date}</TableCell><TableCell>{a.end_date}</TableCell>
                    <TableCell className="text-right">{a.working_days ?? '—'}</TableCell>
                    <TableCell><Badge variant={absVariant[a.status]}>{a.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {canManage && a.status === 'pending' && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'approve')} title="Approve"><Check className="h-4 w-4 text-success" /></Button>
                          <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => decide(a.id, 'reject')} title="Reject"><X className="h-4 w-4 text-destructive" /></Button>
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
    </div>
  );
}

function LogAbsenceDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ employeeId: '', type: 'vacation' as AbsenceType, start: '', end: '', note: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => setF({ employeeId: '', type: 'vacation', start: '', end: '', note: '' });

  const submit = async () => {
    if (!f.employeeId) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!f.start || !f.end) { toast({ title: 'Dates are required', variant: 'destructive' }); return; }
    if (f.end < f.start) { toast({ title: 'End must be after start', variant: 'destructive' }); return; }
    setSaving(true);
    try { await hrService.recordAbsence(workspaceId, { employee_id: f.employeeId, absence_type: f.type, start_date: f.start, end_date: f.end, note: f.note.trim() || undefined }); toast({ title: 'Time off logged', description: 'Pending approval.' }); setOpen(false); reset(); onDone(); }
    catch (e) { toast({ title: 'Could not log', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Log time off</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log time off</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee *</Label>
            <Select value={f.employeeId} onValueChange={(v) => upd('employeeId', v)}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type</Label>
            <Select value={f.type} onValueChange={(v) => upd('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(ABSENCE_TYPE_LABELS) as AbsenceType[]).map((t) => <SelectItem key={t} value={t}>{ABSENCE_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>From *</Label><Input type="date" value={f.start} onChange={(e) => upd('start', e.target.value)} /></div>
            <div className="space-y-1"><Label>To *</Label><Input type="date" value={f.end} onChange={(e) => upd('end', e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">Working days are computed automatically (weekends excluded).</p>
          <div className="space-y-1"><Label>Note</Label><Textarea rows={2} value={f.note} onChange={(e) => upd('note', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Log time off</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
