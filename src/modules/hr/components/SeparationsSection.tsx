import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Loader2, UserMinus, Send, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type Employee, type Separation, type SeparationType,
  SEPARATION_TYPE_LABELS, SEPARATION_CODES,
} from '../services/hrService';
import { SectionHeader, EmptyState, hrMoney, FILING_STATUS_LABELS, filingTone } from './_shared';
import { ErganiFilingDialog } from './ErganiFilingDialog';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

const empName = (e: Employee) => e.contact?.name || 'Unnamed';
const SEPARATION_TYPES = Object.keys(SEPARATION_TYPE_LABELS) as SeparationType[];

export function SeparationsSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const [separations, setSeparations] = useState<Separation[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [erganiOn, setErganiOn] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, e] = await Promise.all([hrService.listSeparations(workspaceId), hrService.listEmployees(workspaceId)]);
      setSeparations(s.separations); setEmployees(e.employees);
      setPage((p) => clampPage(p, s.separations.length));
    } catch (err) {
      toast({ title: 'Failed to load departures', description: (err as Error).message, variant: 'destructive' });
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
    try { await hrService.deleteSeparation(workspaceId, id); toast({ title: 'Departure deleted' }); load(); }
    catch (e) { toast({ title: 'Could not delete', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  if (loading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Departures"
        subtitle="Voluntary departure (Ε5), contract termination (Ε6) and fixed-term expiry (Ε7)"
        actions={canManage && workspaceId && employees.length > 0
          ? <SeparationDialog workspaceId={workspaceId} employees={employees} onDone={load} />
          : undefined}
      />
      <Card>
        <CardContent className="p-0">
          {separations.length === 0 ? (
            <EmptyState
              icon={UserMinus}
              title="No departures recorded"
              hint="Record a departure, then file it to Ergani as Ε5, Ε6 or Ε7."
              action={canManage && workspaceId && employees.length > 0
                ? <SeparationDialog workspaceId={workspaceId} employees={employees} onDone={load} />
                : undefined}
            />
          ) : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead><TableHead>Type</TableHead><TableHead>Effective</TableHead>
                <TableHead>Notice</TableHead><TableHead className="text-right">Severance</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {paginate(separations, page).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.employee?.contact?.name || nameById.get(s.employee_id) || '—'}</TableCell>
                    <TableCell className="text-sm">{SEPARATION_TYPE_LABELS[s.separation_type]}</TableCell>
                    <TableCell>{s.effective_date}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.notice_date ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{s.severance_amount == null ? '—' : hrMoney(s.severance_amount, 'EUR')}</TableCell>
                    <TableCell>
                      <span className={`text-sm ${filingTone(s.status)}`}>{FILING_STATUS_LABELS[s.status] ?? s.status}</span>
                      {s.ergani_protocol && <span className="block text-xs text-muted-foreground font-mono">{s.ergani_protocol}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canManage && erganiOn && s.status !== 'submitted' && workspaceId && (
                          <ErganiFilingDialog
                            trigger={<Button size="sm" variant="ghost" title={`File ${SEPARATION_CODES[s.separation_type]} to Ergani`}><Send className="h-4 w-4" /></Button>}
                            title={`File ${SEPARATION_CODES[s.separation_type]}`}
                            description="Built from Ergani’s live template for this departure type. Review the values, complete anything left blank, then file. Filing also marks the employee as terminated."
                            loadPreview={() => hrService.submitSeparation(workspaceId, { separation_id: s.id, preview: true })}
                            submit={(document) => hrService.submitSeparation(workspaceId, { separation_id: s.id, document })}
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
          <TablePagination page={page} total={separations.length} onPageChange={setPage} label="departures" />
        </CardContent>
      </Card>
    </div>
  );
}

function SeparationDialog({ workspaceId, employees, onDone }: { workspaceId: string; employees: Employee[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ employeeId: '', type: 'voluntary' as SeparationType, effective: '', notice: '', reason: '', severance: '', note: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => setF({ employeeId: '', type: 'voluntary', effective: '', notice: '', reason: '', severance: '', note: '' });

  const save = async () => {
    if (!f.employeeId) { toast({ title: 'Pick an employee', variant: 'destructive' }); return; }
    if (!f.effective) { toast({ title: 'Effective date is required', variant: 'destructive' }); return; }
    const severance = f.severance.trim() === '' ? null : Number(f.severance);
    if (severance != null && (!Number.isFinite(severance) || severance < 0)) {
      toast({ title: 'Severance must be a positive number', variant: 'destructive' }); return;
    }
    setSaving(true);
    try {
      await hrService.createSeparation(workspaceId, {
        employee_id: f.employeeId, separation_type: f.type, effective_date: f.effective,
        notice_date: f.notice || null, reason: f.reason.trim() || null,
        severance_amount: severance, note: f.note.trim() || null,
      });
      toast({ title: 'Departure recorded', description: 'File it to Ergani when you are ready.' });
      setOpen(false); reset(); onDone();
    } catch (e) {
      toast({ title: 'Could not record the departure', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Record departure</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Record Departure</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Employee *</Label>
            <Select value={f.employeeId} onValueChange={(v) => upd('employeeId', v)}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>{employees.map((e) => <SelectItem key={e.id} value={e.id}>{empName(e)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Type *</Label>
            <Select value={f.type} onValueChange={(v) => upd('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{SEPARATION_TYPES.map((t) => <SelectItem key={t} value={t}>{SEPARATION_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Effective date *</Label><Input type="date" value={f.effective} onChange={(e) => upd('effective', e.target.value)} /></div>
            <div className="space-y-1"><Label>Notice date</Label><Input type="date" value={f.notice} onChange={(e) => upd('notice', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Reason</Label><Input value={f.reason} onChange={(e) => upd('reason', e.target.value)} placeholder="Shown on the Ergani declaration" /></div>
          <div className="space-y-1"><Label>Severance (€)</Label><Input type="number" min="0" step="0.01" value={f.severance} onChange={(e) => upd('severance', e.target.value)} /></div>
          <div className="space-y-1"><Label>Internal note</Label><Textarea rows={2} value={f.note} onChange={(e) => upd('note', e.target.value)} /></div>
          <p className="text-xs text-muted-foreground">
            The employee stays active until the departure is filed to Ergani — filing marks them terminated and sets their end date.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Record departure</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
