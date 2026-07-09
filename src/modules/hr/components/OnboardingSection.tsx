import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, ClipboardCheck, Circle, CheckCircle2, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type OnboardingTask, type Employee } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';

const empName = (e: Employee) => e.contact?.name || 'Unnamed';

export function OnboardingSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState<OnboardingTask[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const [t, e] = await Promise.all([hrService.listOnboarding(workspaceId), hrService.listEmployees(workspaceId)]); setTasks(t.tasks); setEmployees(e.employees); }
    catch (err) { toast({ title: 'Failed to load onboarding', description: (err as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const byEmployee = useMemo(() => {
    const m = new Map<string, { name: string; tasks: OnboardingTask[] }>();
    for (const t of tasks) {
      const name = t.employee?.contact?.name || employees.find((e) => e.id === t.employee_id)?.contact?.name || 'Employee';
      const cur = m.get(t.employee_id) ?? { name, tasks: [] };
      cur.tasks.push(t); m.set(t.employee_id, cur);
    }
    return [...m.entries()];
  }, [tasks, employees]);

  const toggle = async (id: string) => {
    if (!workspaceId) return;
    setBusy(id);
    try { await hrService.toggleOnboardingTask(workspaceId, id); load(); }
    catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const del = async (id: string) => {
    if (!workspaceId) return;
    try { await hrService.deleteOnboardingTask(workspaceId, id); load(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader title="Onboarding" subtitle={`${tasks.filter((t) => t.status === 'pending').length} pending tasks`} actions={canManage && workspaceId && employees.length > 0 ? <AddTaskDialog workspaceId={workspaceId} employees={employees} onDone={load} /> : undefined} />
      {byEmployee.length === 0 ? (
        <Card><CardContent><EmptyState icon={ClipboardCheck} title="No onboarding in progress" hint="Hiring a candidate seeds a default checklist automatically." /></CardContent></Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {byEmployee.map(([empId, { name, tasks: list }]) => {
            const done = list.filter((t) => t.status === 'done').length;
            const pct = list.length ? Math.round((done / list.length) * 100) : 0;
            return (
              <Card key={empId}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{name}</div>
                    <span className="text-xs text-muted-foreground">{done}/{list.length}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                  <div className="mt-3 space-y-1">
                    {list.map((t) => (
                      <div key={t.id} className="flex items-center gap-2 group">
                        <button disabled={!canManage || busy === t.id} onClick={() => toggle(t.id)} className="shrink-0 cursor-pointer disabled:cursor-default">
                          {t.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <span className={`text-sm flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                        {canManage && <button onClick={() => del(t.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive cursor-pointer"><Trash2 className="h-3.5 w-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddTaskDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');

  const submit = async () => {
    if (!employeeId || !title.trim()) { toast({ title: 'Employee and task are required', variant: 'destructive' }); return; }
    setSaving(true);
    try { await hrService.addOnboardingTask(workspaceId, { employee_id: employeeId, title: title.trim(), due_date: due || undefined }); toast({ title: 'Task added' }); setOpen(false); setTitle(''); setDue(''); onDone(); }
    catch (e) { toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Add task</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add onboarding task</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee *</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>Task *</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Sign NDA" /></div>
          <div className="space-y-1"><Label>Due date</Label><Input type="date" value={due} onChange={(e) => setDue(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add task</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
