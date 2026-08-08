import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, Timer, Send, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type Employee, type Overtime } from '../services/hrService';
import { SectionHeader, EmptyState, FILING_STATUS_LABELS, filingTone } from './_shared';
import { ErganiFilingDialog } from './ErganiFilingDialog';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

const empName = (e: Employee) => e.contact?.name || 'Unnamed';

export function OvertimeSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Overtime[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erganiOn, setErganiOn] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [o, e] = await Promise.all([hrService.listOvertime(workspaceId), hrService.listEmployees(workspaceId)]);
      setEntries(o.overtime); setEmployees(e.employees); setSelected(new Set());
      setPage((p) => clampPage(p, o.overtime.length));
    } catch (err) {
      toast({ title: 'Failed to load overtime', description: (err as Error).message, variant: 'destructive' });
    } finally { setLoading(false); }
    if (canManage) {
      const st = await hrService.getErganiStatus(workspaceId).catch(() => null);
      setErganiOn(!!st?.has_password && !!st?.enabled);
    }
  }, [workspaceId, canManage, toast]);
  useEffect(() => { void load(); }, [load]);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, empName(e)])), [employees]);
  const draftIds = useMemo(() => entries.filter((e) => e.status !== 'submitted').map((e) => e.id), [entries]);
  const pendingHours = useMemo(
    () => entries.filter((e) => e.status !== 'submitted').reduce((sum, e) => sum + Number(e.hours ?? 0), 0),
    [entries],
  );

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const remove = async (id: string) => {
    if (!workspaceId) return;
    setBusyId(id);
    try { await hrService.deleteOvertime(workspaceId, id); toast({ title: 'Overtime deleted' }); load(); }
    catch (e) { toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  const selectedIds = [...selected];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Overtime"
        subtitle={pendingHours > 0 ? `${pendingHours.toFixed(2)} h not yet filed` : 'Filed to Ergani as Ε8 (αναγγελία υπερωρίας)'}
        actions={canManage && workspaceId && employees.length > 0 ? (
          <div className="flex gap-2">
            {erganiOn && selectedIds.length > 0 && (
              <ErganiFilingDialog
                trigger={<Button size="sm" variant="outline" className="rounded-full"><Send className="h-4 w-4 mr-2" />File {selectedIds.length} to Ergani</Button>}
                title="File Overtime"
                description="One Ε8 carrying every selected entry, built from Ergani’s live template. Review the values, complete anything left blank, then file."
                loadPreview={() => hrService.submitOvertime(workspaceId, { overtime_ids: selectedIds, preview: true })}
                submit={(document) => hrService.submitOvertime(workspaceId, { overtime_ids: selectedIds, document })}
                onDone={load}
              />
            )}
            <OvertimeDialog workspaceId={workspaceId} employees={employees} onDone={load} />
          </div>
        ) : undefined}
      />
      <Card>
        <CardContent className="p-0">
          {entries.length === 0 ? (
            <EmptyState icon={Timer} title="No overtime recorded" hint="Log the hours worked beyond the schedule, then file them as an Ε8." />
          ) : (
            <Table>
              <TableHeader><TableRow>
                {canManage && erganiOn && (
                  <TableHead className="w-10">
                    <Checkbox
                      checked={draftIds.length > 0 && draftIds.every((id) => selected.has(id))}
                      onCheckedChange={(v) => setSelected(v ? new Set(draftIds) : new Set())}
                      aria-label="Select all unfiled overtime"
                    />
                  </TableHead>
                )}
                <TableHead>Employee</TableHead><TableHead>Date</TableHead><TableHead>From</TableHead><TableHead>To</TableHead>
                <TableHead className="text-right">Hours</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paginate(entries, page).map((o) => (
                  <TableRow key={o.id}>
                    {canManage && erganiOn && (
                      <TableCell>
                        {o.status !== 'submitted' && (
                          <Checkbox checked={selected.has(o.id)} onCheckedChange={() => toggle(o.id)} aria-label={`Select overtime on ${o.work_date}`} />
                        )}
                      </TableCell>
                    )}
                    <TableCell className="font-medium">{o.employee?.contact?.name || nameById.get(o.employee_id) || '—'}</TableCell>
                    <TableCell>{o.work_date}</TableCell>
                    <TableCell>{o.start_time?.slice(0, 5)}</TableCell>
                    <TableCell>{o.end_time?.slice(0, 5)}</TableCell>
                    <TableCell className="text-right tabular-nums">{Number(o.hours ?? 0).toFixed(2)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[220px] truncate" title={o.reason}>{o.reason}</TableCell>
                    <TableCell>
                      <span className={`text-sm ${filingTone(o.status)}`}>{FILING_STATUS_LABELS[o.status] ?? o.status}</span>
                      {o.ergani_protocol && <span className="block text-xs text-muted-foreground font-mono">{o.ergani_protocol}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      {canManage && o.status !== 'submitted' && (
                        <Button size="sm" variant="ghost" disabled={busyId === o.id} onClick={() => remove(o.id)} title="Delete">
                          {busyId === o.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={entries.length} onPageChange={setPage} label="entries" />
        </CardContent>
      </Card>
    </div>
  );
}

function OvertimeDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ employeeId: '', date: '', start: '', end: '', reason: '', note: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => setF({ employeeId: '', date: '', start: '', end: '', reason: '', note: '' });

  // Mirrors the SQL generated column so the operator sees the same number the row will carry.
  const hours = useMemo(() => {
    if (!f.start || !f.end || f.end <= f.start) return null;
    const [sh, sm] = f.start.split(':').map(Number);
    const [eh, em] = f.end.split(':').map(Number);
    return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
  }, [f.start, f.end]);

  const save = async () => {
    if (!f.employeeId) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!f.date) { toast({ title: 'Date is required', variant: 'destructive' }); return; }
    if (!f.start || !f.end || f.end <= f.start) { toast({ title: 'End time must be after start time', variant: 'destructive' }); return; }
    if (!f.reason.trim()) { toast({ title: 'Reason is required', description: 'Ergani rejects an overtime declaration without a justification.', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.createOvertime(workspaceId, {
        employee_id: f.employeeId, work_date: f.date, start_time: f.start, end_time: f.end,
        reason: f.reason.trim(), note: f.note.trim() || null,
      });
      toast({ title: 'Overtime recorded' });
      setOpen(false); reset(); onDone();
    } catch (e) {
      toast({ title: 'Could not record overtime', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Log overtime</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Log Overtime</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee *</Label>
            <Select value={f.employeeId} onValueChange={(v) => upd('employeeId', v)}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Date *</Label><Input type="date" value={f.date} onChange={(e) => upd('date', e.target.value)} /></div>
            <div className="space-y-1"><Label>From *</Label><Input type="time" value={f.start} onChange={(e) => upd('start', e.target.value)} /></div>
            <div className="space-y-1"><Label>To *</Label><Input type="time" value={f.end} onChange={(e) => upd('end', e.target.value)} /></div>
          </div>
          <p className="text-xs text-muted-foreground">
            {hours == null ? 'Overtime is declared within a single work date.' : `${hours.toFixed(2)} hours.`}
          </p>
          <div className="space-y-1">
            <Label>Reason *</Label>
            <Input value={f.reason} onChange={(e) => upd('reason', e.target.value)} placeholder="e.g. Urgent customer delivery" />
          </div>
          <div className="space-y-1"><Label>Note</Label><Textarea rows={2} value={f.note} onChange={(e) => upd('note', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record overtime</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
