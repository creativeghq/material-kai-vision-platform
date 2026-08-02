import { useCallback, useEffect, useMemo, useState } from 'react';
import { Clock, LogIn, LogOut, Loader2, Settings, Copy, Check, Bell, Smartphone } from 'lucide-react';
import { Card, CardContent } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { hrService, type AttendanceRow, type HrSettings, type NotifyCandidate } from '../services/hrService';
import { SectionHeader, EmptyState } from './_shared';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { PunchHistoryDialog, TimesheetDialog } from './AttendanceExtras';

const fmtTime = (t: string | null) => (t ? String(t).slice(0, 5) : '—');

export function AttendanceSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [date, setDate] = useState('');
  const [settings, setSettings] = useState<HrSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [a, s] = await Promise.all([hrService.attendanceToday(workspaceId), hrService.getHrSettings(workspaceId)]);
      setRows(a.attendance); setDate(a.date); setSettings(s.settings);
      setPage((p) => clampPage(p, a.attendance.length));
    } catch (e) { toast({ title: 'Failed to load attendance', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  const clock = async (r: AttendanceRow) => {
    if (!workspaceId) return; setBusyId(r.employee_id);
    try {
      const res = await hrService.clockEmployee(workspaceId, r.employee_id, r.clocked_in ? 'departure' : 'arrival');
      toast({ title: r.clocked_in ? 'Clocked out' : 'Clocked in', description: res.filed ? `Filed to Ergani · ${res.protocol}` : `Recorded${res.reason ? ` (${res.reason})` : ''}` });
      load();
    } catch (e) { toast({ title: 'Clock failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyId(null); }
  };

  const kioskUrl = useMemo(() => {
    const slug = (activeWorkspace as any)?.slug;
    return slug ? `${window.location.origin}/${slug}/clockin` : null;
  }, [activeWorkspace]);

  const copyKiosk = () => { if (kioskUrl) { navigator.clipboard.writeText(kioskUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); } };

  if (loading) return <Skeleton className="h-64 w-full" />;
  const working = rows.filter((r) => r.status === 'active' && r.work_today);
  const others = rows.filter((r) => r.status === 'active' && !r.work_today);
  // Working-today first, then the off-today tail — page over the combined order the table renders.
  const board = [...working, ...others];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Attendance"
        subtitle={date ? `Today · ${date}` : 'Clock-in board'}
        actions={workspaceId ? (
          <div className="flex gap-2">
            <TimesheetDialog workspaceId={workspaceId} />
            {canManage && settings && <SettingsDialog workspaceId={workspaceId} settings={settings} onSaved={load} />}
          </div>
        ) : undefined}
      />

      {settings?.kiosk_enabled && kioskUrl && (
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Smartphone className="h-5 w-5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">Public clock-in kiosk is live</div>
              <div className="text-xs text-muted-foreground truncate">{kioskUrl}</div>
            </div>
            <Button size="sm" variant="outline" className="rounded-full shrink-0" onClick={copyKiosk}>
              {copied ? <Check className="h-4 w-4 mr-1 text-emerald-500" /> : <Copy className="h-4 w-4 mr-1" />}Copy link
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {board.length === 0 ? <EmptyState icon={Clock} title="No active employees" /> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>Employee</TableHead><TableHead>Expected</TableHead><TableHead>Status</TableHead><TableHead>Last punch</TableHead>
                {canManage && <TableHead className="text-right">Action</TableHead>}
              </TableRow></TableHeader>
              <TableBody>
                {paginate(board, page).map((r) => (
                  <TableRow key={r.employee_id} className={!r.work_today ? 'opacity-60' : ''}>
                    <TableCell className="font-medium">{r.name}{!r.work_today && <span className="ml-2 text-xs text-muted-foreground">(off today)</span>}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtTime(r.work_start_time)}–{fmtTime(r.work_end_time)}</TableCell>
                    <TableCell>
                      {r.clocked_in
                        ? <span className="text-sm text-emerald-600 dark:text-emerald-400">In{r.last_is_late ? ' · late' : ''}</span>
                        : r.last_punch_type === 'departure'
                          ? <span className="text-sm text-muted-foreground">Out</span>
                          : <span className="text-sm text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {r.last_at ? new Date(r.last_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                      {r.last_status === 'submitted' && <span className="ml-1 text-emerald-500" title="Filed to Ergani">✓</span>}
                    </TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 items-center">
                        <PunchHistoryDialog workspaceId={workspaceId!} employeeId={r.employee_id} name={r.name} onChanged={load} />
                        <Button size="sm" variant={r.clocked_in ? 'outline' : 'default'} className="rounded-full h-8"
                          disabled={busyId === r.employee_id} onClick={() => clock(r)}>
                          {busyId === r.employee_id ? <Loader2 className="h-4 w-4 animate-spin" /> : r.clocked_in ? <><LogOut className="h-4 w-4 mr-1" />Out</> : <><LogIn className="h-4 w-4 mr-1" />In</>}
                        </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <TablePagination page={page} total={board.length} onPageChange={setPage} label="employees" />
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsDialog({ workspaceId, settings, onSaved }: { workspaceId: string; settings: HrSettings; onSaved: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [s, setS] = useState<HrSettings>(settings);
  const [emails, setEmails] = useState((settings.notify_emails || []).join(', '));
  const [candidates, setCandidates] = useState<NotifyCandidate[]>([]);
  const set = <K extends keyof HrSettings>(k: K, v: HrSettings[K]) => setS((p) => ({ ...p, [k]: v }));

  useEffect(() => { if (open) { setS(settings); setEmails((settings.notify_emails || []).join(', ')); hrService.listNotifyCandidates(workspaceId).then((r) => setCandidates(r.candidates)).catch(() => {}); } }, [open, settings, workspaceId]);

  const toggleUser = (uid: string) => set('notify_user_ids', s.notify_user_ids.includes(uid) ? s.notify_user_ids.filter((x) => x !== uid) : [...s.notify_user_ids, uid]);

  const save = async () => {
    setSaving(true);
    try {
      await hrService.saveHrSettings(workspaceId, {
        ...s,
        notify_emails: emails.split(',').map((e) => e.trim()).filter(Boolean),
      });
      toast({ title: 'Attendance settings saved' });
      setOpen(false); onSaved();
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="rounded-full"><Settings className="h-4 w-4 mr-2" />Settings</Button></DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Attendance & Clock-In Settings</DialogTitle></DialogHeader>
        <div className="space-y-5">
          {/* Kiosk */}
          <div className="space-y-3">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Smartphone className="h-3.5 w-3.5" /> Public kiosk</div>
            <Row label="Enable public clock-in page" hint="Employees clock in by VAT number at /{workspace}/clockin"><Switch checked={s.kiosk_enabled} onCheckedChange={(v) => set('kiosk_enabled', v)} /></Row>
            <Row label="Require a PIN" hint="Second factor on top of the VAT number (set per employee)"><Switch checked={s.kiosk_require_pin} onCheckedChange={(v) => set('kiosk_require_pin', v)} /></Row>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Timezone</Label><Input value={s.timezone} onChange={(e) => set('timezone', e.target.value)} className="font-mono text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs">Late grace (min)</Label><Input type="number" min={0} value={s.late_grace_minutes} onChange={(e) => set('late_grace_minutes', Number(e.target.value) || 0)} /></div>
            </div>
          </div>

          {/* Lateness alerts */}
          <div className="space-y-3 border-t border-border/60 pt-4">
            <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1"><Bell className="h-3.5 w-3.5" /> Late check-in alerts</div>
            <Row label="Enable late-check-in alerts" hint="Notify when an employee hasn't clocked in past their start + grace"><Switch checked={s.late_alert_enabled} onCheckedChange={(v) => set('late_alert_enabled', v)} /></Row>
            <Row label="Notify workspace owner" hint="Bell + email"><Switch checked={s.notify_owner} onCheckedChange={(v) => set('notify_owner', v)} /></Row>
            <Row label="Notify finance / admins" hint="Bell + email"><Switch checked={s.notify_finance} onCheckedChange={(v) => set('notify_finance', v)} /></Row>
            {candidates.length > 0 && (
              <div className="space-y-1">
                <Label className="text-xs">Also notify (bell + email)</Label>
                <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-40 overflow-y-auto">
                  {candidates.map((c) => (
                    <label key={c.user_id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                      <Checkbox checked={s.notify_user_ids.includes(c.user_id)} onCheckedChange={() => toggleUser(c.user_id)} />
                      <span>{c.name}</span>{c.role && <span className="ml-auto text-[10px] text-muted-foreground capitalize">{c.role}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Extra emails (email only, comma-separated)</Label>
              <Input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="ops@company.com, hr@company.com" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 p-3">
      <div><div className="text-sm">{label}</div>{hint && <p className="text-xs text-muted-foreground">{hint}</p>}</div>
      {children}
    </div>
  );
}
