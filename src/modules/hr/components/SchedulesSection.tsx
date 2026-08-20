import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, CalendarClock, Send, Trash2, Pencil, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type Employee, type WorkSchedule, type ScheduleShift, type ScheduleType,
} from '../services/hrService';
import { SectionHeader, EmptyState, FILING_STATUS_LABELS, filingTone } from './_shared';
import { ErganiFilingDialog } from './ErganiFilingDialog';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

const empName = (e: Employee) => e.contact?.name || 'Unnamed';

// Shifts use the JS weekday convention (0=Sunday … 6=Saturday) so a weekday maps straight onto a
// calendar date server-side. hr_employees.work_days is ISO (1=Mon … 7=Sun) — convert, don't assume.
const DAY_LABELS: Record<number, string> = { 0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday' };
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const isoToJsDay = (iso: number) => (iso === 7 ? 0 : iso);

const blankWeek = (): ScheduleShift[] => WEEK_ORDER.map((day) => ({ day, off: true }));

/** "Mon–Fri 09:00–17:00" style summary, collapsing consecutive identical days. */
function summarize(details: ScheduleShift[]): string {
  const working = WEEK_ORDER.map((d) => details.find((s) => s.day === d)).filter((s): s is ScheduleShift => !!s && !s.off);
  if (!working.length) return '—';
  const parts = working.map((s) => `${DAY_LABELS[s.day].slice(0, 3)} ${s.start}–${s.end}`);
  return parts.length <= 3 ? parts.join(', ') : `${parts.slice(0, 2).join(', ')} +${parts.length - 2} more`;
}

export function SchedulesSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erganiOn, setErganiOn] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, e] = await Promise.all([hrService.listSchedules(workspaceId), hrService.listEmployees(workspaceId)]);
      setSchedules(s.schedules); setEmployees(e.employees);
      setPage((p) => clampPage(p, s.schedules.length));
    } catch (err) {
      toast({ title: 'Failed to load schedules', description: (err as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
    if (canManage) {
      const st = await hrService.getErganiStatus(workspaceId).catch(() => null);
      setErganiOn(!!st?.has_password && !!st?.enabled);
    }
  }, [workspaceId, canManage, toast]);
  useEffect(() => { void load(); }, [load]);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, empName(e)])), [employees]);

  const remove = async (id: string) => {
    if (!workspaceId) return;
    setBusyId(id);
    try { await hrService.deleteSchedule(workspaceId, id); toast({ title: 'Schedule deleted' }); load(); }
    catch (e) { toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Work Schedules"
        subtitle="Working-time rosters filed to Ergani as Ε4 (πίνακας ωρών εργασίας)"
        actions={canManage && workspaceId && employees.length > 0
          ? <ScheduleDialog workspaceId={workspaceId} employees={employees} onDone={load} />
          : undefined}
      />
      <Card>
        <CardContent className="p-0">
          {schedules.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title="No schedules yet"
              hint="Build a weekly roster, then file it to Ergani as an Ε4."
              action={canManage && workspaceId && employees.length > 0
                ? <ScheduleDialog workspaceId={workspaceId} employees={employees} onDone={load} />
                : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead><TableHead>Schedule</TableHead><TableHead>Type</TableHead>
                <TableHead>Effective</TableHead><TableHead>Shifts</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paginate(schedules, page).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.employee?.contact?.name || nameById.get(s.employee_id) || '—'}</TableCell>
                    <TableCell>{s.name || '—'}</TableCell>
                    <TableCell className="capitalize">{s.schedule_type}</TableCell>
                    <TableCell className="text-sm">{s.effective_from}{s.effective_to ? ` → ${s.effective_to}` : ''}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{summarize(s.details ?? [])}</TableCell>
                    <TableCell>
                      <span className={`text-sm ${filingTone(s.status)}`}>{FILING_STATUS_LABELS[s.status] ?? s.status}</span>
                      {s.ergani_protocol && <span className="block text-xs text-muted-foreground font-mono">{s.ergani_protocol}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && s.status !== 'submitted' && workspaceId && (
                          <ScheduleDialog workspaceId={workspaceId} employees={employees} existing={s} onDone={load} />
                        )}
                        {canManage && erganiOn && s.status !== 'submitted' && workspaceId && (
                          <ErganiFilingDialog
                            trigger={<Button size="sm" variant="ghost" title="File to Ergani"><Send className="h-4 w-4" /></Button>}
                            title="File Work Schedule"
                            description="Built from Ergani’s live Ε4 template, one detail row per working shift. Review the values, complete anything left blank, then file."
                            loadPreview={() => hrService.submitSchedule(workspaceId, { schedule_id: s.id, preview: true })}
                            submit={(document) => hrService.submitSchedule(workspaceId, { schedule_id: s.id, document })}
                            onDone={load}
                          />
                        )}
                        {canManage && s.status !== 'submitted' && (
                          <Button size="sm" variant="ghost" disabled={busyId === s.id} onClick={() => remove(s.id)} title="Delete">
                            {busyId === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={schedules.length} onPageChange={setPage} label="schedules" />
        </CardContent>
      </Card>
    </div>
  );
}

/** Create or edit a roster. A filed schedule is the Ministry's copy, so only drafts reach this. */
function ScheduleDialog({ workspaceId, employees, existing, onDone }: {
  workspaceId: string; employees: Employee[]; existing?: WorkSchedule; onDone: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [employeeId, setEmployeeId] = useState(existing?.employee_id ?? '');
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<ScheduleType>(existing?.schedule_type ?? 'weekly');
  const [from, setFrom] = useState(existing?.effective_from ?? '');
  const [to, setTo] = useState(existing?.effective_to ?? '');
  const [shifts, setShifts] = useState<ScheduleShift[]>(existing?.details?.length ? existing.details : blankWeek());

  const reset = () => {
    setEmployeeId(existing?.employee_id ?? ''); setName(existing?.name ?? '');
    setType(existing?.schedule_type ?? 'weekly'); setFrom(existing?.effective_from ?? '');
    setTo(existing?.effective_to ?? ''); setShifts(existing?.details?.length ? existing.details : blankWeek());
  };

  const patch = (day: number, next: Partial<ScheduleShift>) =>
    setShifts((prev) => prev.map((s) => (s.day === day ? { ...s, ...next } : s)));

  /** Prefill from the employee's stored working-time window — the common case is "same as contract". */
  const copyFromEmployee = () => {
    const emp = employees.find((e) => e.id === employeeId);
    if (!emp) { toast({ title: 'Pick an employee first', variant: 'destructive' }); return; }
    if (!emp.work_start_time || !emp.work_end_time) {
      toast({ title: 'No working hours on this employee', description: 'Set their work start/end time on the Employees tab first.', variant: 'destructive' });
      return;
    }
    const days = new Set((emp.work_days ?? [1, 2, 3, 4, 5]).map(isoToJsDay));
    const start = emp.work_start_time.slice(0, 5);
    const end = emp.work_end_time.slice(0, 5);
    setShifts(WEEK_ORDER.map((day) => (days.has(day) ? { day, off: false, start, end } : { day, off: true })));
  };

  const save = async () => {
    if (!employeeId) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!from) { toast({ title: 'Effective from is required', variant: 'destructive' }); return; }
    if (to && to < from) { toast({ title: 'Effective to must be after effective from', variant: 'destructive' }); return; }
    const working = shifts.filter((s) => !s.off);
    if (!working.length) { toast({ title: 'Add at least one working day', variant: 'destructive' }); return; }
    const bad = working.find((s) => !s.start || !s.end || s.end <= s.start);
    if (bad) { toast({ title: `${DAY_LABELS[bad.day]} needs a start and a later end time`, variant: 'destructive' }); return; }

    setSaving(true);
    try {
      const payload = { name: name.trim() || null, schedule_type: type, effective_from: from, effective_to: to || null, details: shifts };
      if (existing) await hrService.updateSchedule(workspaceId, { id: existing.id, ...payload });
      else await hrService.createSchedule(workspaceId, { employee_id: employeeId, ...payload });
      toast({ title: existing ? 'Schedule updated' : 'Schedule created' });
      setOpen(false); onDone();
    } catch (e) {
      toast({ title: 'Could not save the schedule', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {existing
          ? <Button size="sm" variant="ghost" title="Edit"><Pencil className="h-4 w-4" /></Button>
          : <Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New schedule</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{existing ? 'Edit Work Schedule' : 'New Work Schedule'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Employee *</Label>
              <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!existing}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as ScheduleType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Weekly (WTOWeek)</SelectItem>
                  <SelectItem value="daily">Daily (WTODaily)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Summer roster" /></div>
            <div className="space-y-1"><Label>Effective from *</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="space-y-1"><Label>Effective to</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>

          <div className="flex items-center justify-between pt-1">
            <Label>Weekly pattern</Label>
            <Button size="sm" variant="outline" className="rounded-full h-7 text-xs" onClick={copyFromEmployee}>
              <Copy className="h-3.5 w-3.5 mr-1" />Copy contract hours
            </Button>
          </div>
          <div className="rounded-lg border border-border/60 divide-y divide-border/60">
            {WEEK_ORDER.map((day) => {
              const s = shifts.find((x) => x.day === day) ?? { day, off: true };
              return (
                <div key={day} className="flex items-center gap-3 px-3 py-2">
                  <Switch checked={!s.off} onCheckedChange={(on) => patch(day, { off: !on, start: s.start ?? '09:00', end: s.end ?? '17:00' })} />
                  <span className="w-24 text-sm">{DAY_LABELS[day]}</span>
                  {s.off ? (
                    <span className="text-xs text-muted-foreground">Off</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Input type="time" className="h-8 w-28" value={s.start ?? ''} onChange={(e) => patch(day, { start: e.target.value })} />
                      <span className="text-xs text-muted-foreground">to</span>
                      <Input type="time" className="h-8 w-28" value={s.end ?? ''} onChange={(e) => patch(day, { end: e.target.value })} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            Saved as a draft. Filing it to Ergani resolves each weekday to a real date from the effective-from week.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}{existing ? 'Save changes' : 'Create schedule'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
