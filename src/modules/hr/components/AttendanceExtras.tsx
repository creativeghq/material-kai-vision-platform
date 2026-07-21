import { useCallback, useEffect, useState } from 'react';
import { Clock, Loader2, History, CalendarRange, Trash2, Plus, Download } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { hrService, type Punch, type TimesheetRow } from '../services/hrService';
import { EmptyState } from './_shared';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';

const todayISO = () => new Date().toISOString().slice(0, 10);
const daysAgoISO = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

/** ISO instant → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function csvCell(s: string): string { return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }

// ── Per-employee punch history + corrections (edit/delete/add manual) ──
export function PunchHistoryDialog({ workspaceId, employeeId, name, onChanged }: { workspaceId: string; employeeId: string; name: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [punches, setPunches] = useState<Punch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [add, setAdd] = useState<{ type: 'arrival' | 'departure'; at: string }>({ type: 'arrival', at: '' });
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    // Deleting a punch can empty the last page — re-clamp on every reload.
    try { const r = await hrService.listPunches(workspaceId, { employee_id: employeeId, from: daysAgoISO(30), to: todayISO() }); setPunches(r.punches); setPage((p) => clampPage(p, r.punches.length)); }
    catch (e) { toast({ title: 'Failed to load punches', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, employeeId, toast]);
  useEffect(() => { if (open) void load(); }, [open, load]);

  const del = async (id: string) => {
    setBusy(id);
    try { await hrService.deletePunch(workspaceId, id); load(); onChanged(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const editTime = async (p: Punch, value: string) => {
    if (!value) return; setBusy(p.id);
    try { await hrService.updatePunch(workspaceId, { punch_id: p.id, punched_at: new Date(value).toISOString() }); load(); onChanged(); }
    catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const addManual = async () => {
    if (!add.at) { toast({ title: 'Pick a date/time', variant: 'destructive' }); return; }
    setBusy('add');
    try { await hrService.addManualPunch(workspaceId, { employee_id: employeeId, punch_type: add.type, at: new Date(add.at).toISOString() }); setAdd({ type: 'arrival', at: '' }); load(); onChanged(); }
    catch (e) { toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Punch history"><History className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{name} — punch history (30 days)</DialogTitle></DialogHeader>
        <div className="rounded-md border border-border/60 p-3 space-y-2">
          <Label className="text-xs">Add a manual punch (correction — not filed to Ergani)</Label>
          <div className="flex gap-2 items-end">
            <Select value={add.type} onValueChange={(v) => setAdd((a) => ({ ...a, type: v as 'arrival' | 'departure' }))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="arrival">Clock in</SelectItem><SelectItem value="departure">Clock out</SelectItem></SelectContent>
            </Select>
            <Input type="datetime-local" value={add.at} onChange={(e) => setAdd((a) => ({ ...a, at: e.target.value }))} className="flex-1" />
            <Button size="sm" className="rounded-full" onClick={addManual} disabled={busy === 'add'}>{busy === 'add' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}</Button>
          </div>
        </div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : punches.length === 0 ? (
          <EmptyState icon={Clock} title="No punches in the last 30 days" />
        ) : (
          <>
          <div className="divide-y divide-border/40">
            {paginate(punches, page).map((p) => (
              <div key={p.id} className="flex items-center gap-2 py-2 text-sm">
                <Badge variant={p.punch_type === 'arrival' ? 'default' : 'secondary'} className="w-14 justify-center">{p.punch_type === 'arrival' ? 'In' : 'Out'}</Badge>
                <input type="datetime-local" defaultValue={toLocalInput(p.punched_at)} onBlur={(e) => { const v = e.target.value; if (v && new Date(v).toISOString() !== p.punched_at) editTime(p, v); }}
                  className="bg-transparent border border-border/50 rounded px-2 py-1 text-xs" disabled={busy === p.id} />
                {p.is_late && <span className="text-xs text-amber-500">late</span>}
                {p.status === 'submitted' && <span className="text-xs text-emerald-500" title={p.ergani_protocol ?? 'Ergani'}>Ergani ✓</span>}
                <span className="text-[10px] text-muted-foreground ml-auto uppercase">{p.source}</span>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" disabled={busy === p.id} onClick={() => del(p.id)} title="Delete"><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button>
              </div>
            ))}
          </div>
          <TablePagination page={page} total={punches.length} onPageChange={setPage} label="punches" className="px-0" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Timesheet: worked hours per employee over a date range + CSV export ──
export function TimesheetDialog({ workspaceId }: { workspaceId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(daysAgoISO(14));
  const [to, setTo] = useState(todayISO());
  const [rows, setRows] = useState<TimesheetRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const run = useCallback(async () => {
    setLoading(true);
    // A new date range is a fresh result set.
    try { const r = await hrService.timesheet(workspaceId, from, to); setRows(r.timesheet); setPage(1); }
    catch (e) { toast({ title: 'Failed to build timesheet', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, from, to, toast]);
  useEffect(() => { if (open) void run(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const lines = [['Employee', 'Date', 'Hours', 'First in', 'Last out'].join(',')];
    for (const r of rows) for (const d of r.days) {
      lines.push([csvCell(r.name), d.date, String(d.hours), d.first_in ? new Date(d.first_in).toLocaleTimeString() : '', d.last_out ? new Date(d.last_out).toLocaleTimeString() : ''].join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `timesheet_${from}_${to}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full"><CalendarRange className="h-4 w-4 mr-2" />Timesheet</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Timesheet</DialogTitle></DialogHeader>
        <div className="flex items-end gap-2">
          <div className="space-y-1"><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          <Button size="sm" className="rounded-full" onClick={run} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Run'}</Button>
          <Button size="sm" variant="outline" className="rounded-full ml-auto" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4 mr-1" />CSV</Button>
        </div>
        {loading ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : rows.length === 0 ? (
          <EmptyState icon={CalendarRange} title="No data for this range" />
        ) : (
          <>
          <Table>
            <TableHeader><TableRow><TableHead>Employee</TableHead><TableHead>Days worked</TableHead><TableHead className="text-right">Total hours</TableHead></TableRow></TableHeader>
            <TableBody>
              {paginate(rows, page).map((r) => (
                <TableRow key={r.employee_id}>
                  <TableCell className="font-medium">{r.name}{r.open && <span className="ml-2 text-xs text-amber-500" title="Has an unmatched clock-in">open</span>}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.days.length}</TableCell>
                  <TableCell className="text-right font-mono">{r.total_hours.toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <TablePagination page={page} total={rows.length} onPageChange={setPage} label="employees" className="px-0" />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
