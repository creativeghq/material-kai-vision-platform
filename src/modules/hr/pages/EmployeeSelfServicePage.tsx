import { useCallback, useEffect, useState } from 'react';
import { UserCircle, ClipboardCheck, CalendarDays, FolderOpen, Plus, Loader2, Circle, CheckCircle2, Download, Clock, LogIn, LogOut } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  hrService, type SelfProfile, type SelfTask, type SelfAbsence, type SelfDocument, type SelfPunch, type AbsenceType,
  ABSENCE_TYPE_LABELS, EMPLOYMENT_TYPE_LABELS, DOC_TYPE_LABELS,
} from '../services/hrService';
import { HrStat, EmptyState } from '../components/_shared';
import { statusTone } from '@/utils/statusTone';

export default function EmployeeSelfServicePage() {
  const { activeWorkspaceId, activeWorkspace, loading: wsLoading } = useWorkspace();
  const { toast } = useToast();
  const ws = activeWorkspaceId;

  const [profile, setProfile] = useState<SelfProfile | null>(null);
  const [tasks, setTasks] = useState<SelfTask[]>([]);
  const [absences, setAbsences] = useState<SelfAbsence[]>([]);
  const [docs, setDocs] = useState<SelfDocument[]>([]);
  const [punches, setPunches] = useState<SelfPunch[]>([]);
  const [currentlyIn, setCurrentlyIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ws) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, o, t, d, pu] = await Promise.all([hrService.selfProfile(ws), hrService.selfOnboarding(ws), hrService.selfTimeoff(ws), hrService.selfDocuments(ws), hrService.selfPunches(ws).catch(() => ({ punches: [] as SelfPunch[], clocked_in: false }))]);
      setProfile(p.profile); setTasks(o.tasks); setAbsences(t.absences); setDocs(d.documents); setPunches(pu.punches); setCurrentlyIn(pu.clocked_in);
    } catch (e) { toast({ title: 'Could not load your HR info', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [ws, toast]);
  useEffect(() => { void load(); }, [load]);

  const clock = async (punch_type: 'arrival' | 'departure') => {
    if (!ws) return; setBusy('clock');
    try {
      const r = await hrService.selfClock(ws, { punch_type });
      toast({
        title: punch_type === 'arrival' ? 'Clocked in' : 'Clocked out',
        description: r.filed ? `Filed to Ergani · protocol ${r.protocol}` : `Recorded${r.reason ? ` · not filed to Ergani (${r.reason})` : ''}`,
      });
      load();
    } catch (e) { toast({ title: 'Clock failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const toggleTask = async (id: string) => {
    if (!ws) return; setBusy(id);
    try { await hrService.toggleSelfOnboarding(ws, id); load(); }
    catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const viewDoc = async (id: string) => {
    if (!ws) return; setBusy(id);
    try { const { url } = await hrService.signSelfDocument(ws, id); window.open(url, '_blank'); }
    catch (e) { toast({ title: 'Could not open', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (wsLoading || loading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;

  const name = profile?.contact?.name || 'My HR';
  const done = tasks.filter((t) => t.status === 'done').length;

  return (
    <div className="min-h-screen">
      <PageHeader icon={UserCircle} title="My HR" subtitle={activeWorkspace?.name ? `Your record at ${activeWorkspace.name}` : 'Your employee self-service'} />
      <div className="p-3 sm:p-6 max-w-4xl">
        <Tabs defaultValue="clock">
          <TabsList className="mb-4">
            <TabsTrigger value="clock"><Clock className="h-4 w-4 mr-2" />Clock</TabsTrigger>
            <TabsTrigger value="profile"><UserCircle className="h-4 w-4 mr-2" />Profile</TabsTrigger>
            <TabsTrigger value="onboarding"><ClipboardCheck className="h-4 w-4 mr-2" />Onboarding</TabsTrigger>
            <TabsTrigger value="timeoff"><CalendarDays className="h-4 w-4 mr-2" />Time Off</TabsTrigger>
            <TabsTrigger value="documents"><FolderOpen className="h-4 w-4 mr-2" />Documents</TabsTrigger>
          </TabsList>

          <TabsContent value="clock" className="space-y-4">
            <Card>
              <CardContent className="flex flex-col items-center gap-4 py-8">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className={`h-2.5 w-2.5 rounded-full ${currentlyIn ? 'bg-emerald-500' : 'bg-muted-foreground/40'}`} />
                  {currentlyIn ? 'You are clocked in' : 'You are clocked out'}
                </div>
                <Button
                  size="lg"
                  className="rounded-full h-16 w-56 text-base"
                  variant={currentlyIn ? 'destructive' : 'default'}
                  disabled={busy === 'clock'}
                  onClick={() => clock(currentlyIn ? 'departure' : 'arrival')}
                >
                  {busy === 'clock' ? <Loader2 className="h-5 w-5 mr-2 animate-spin" /> : currentlyIn ? <LogOut className="h-5 w-5 mr-2" /> : <LogIn className="h-5 w-5 mr-2" />}
                  {currentlyIn ? 'Clock out' : 'Clock in'}
                </Button>
                <p className="text-xs text-muted-foreground text-center max-w-xs">
                  Records your arrival/departure and files the Digital Work Card to Ergani when your employer has it configured.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Recent punches</CardTitle></CardHeader>
              <CardContent className="p-0">
                {punches.length === 0 ? <EmptyState icon={Clock} title="No punches yet" hint="Clock in above to start." /> : (
                  <div className="divide-y divide-border/40">
                    {punches.map((p) => (
                      <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                        <div className="flex items-center gap-2">
                          {p.punch_type === 'arrival' ? <LogIn className="h-4 w-4 text-emerald-500" /> : <LogOut className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-medium capitalize">{p.punch_type === 'arrival' ? 'In' : 'Out'}</span>
                          <span className="text-muted-foreground">{new Date(p.punched_at).toLocaleString()}</span>
                        </div>
                        <span className={`text-sm ${p.status === 'submitted' ? 'text-emerald-600 dark:text-emerald-400' : p.status === 'failed' ? 'text-red-500 dark:text-red-400' : 'text-muted-foreground'}`} title={p.ergani_protocol ?? ''}>
                          {p.status === 'submitted' ? `Ergani · ${p.ergani_protocol ?? 'filed'}` : p.status === 'failed' ? 'Ergani failed' : 'Recorded'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile" className="space-y-4">
            {!profile ? <EmptyState title="No profile found" /> : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <HrStat label="Leave allowance" value={profile.summary?.annual_leave_allowance_days ?? profile.annual_leave_allowance_days} hint="days / year" />
                  <HrStat label="Leave remaining" value={profile.summary?.remaining_leave_days ?? '—'} hint="days" />
                  <HrStat label="Absence taken" value={profile.summary?.total_absence_days ?? 0} hint="days" />
                  <HrStat label="Status" value={<span className="capitalize">{profile.status.replace('_', ' ')}</span>} />
                </div>
                <Card>
                  <CardHeader><CardTitle className="text-base">{name}</CardTitle></CardHeader>
                  <CardContent className="grid sm:grid-cols-2 gap-y-2 gap-x-6 text-sm">
                    <Field label="Position" value={profile.contact?.position} />
                    <Field label="Department" value={profile.department?.name} />
                    <Field label="Employment" value={profile.employment_type ? EMPLOYMENT_TYPE_LABELS[profile.employment_type] : null} />
                    <Field label="Start date" value={profile.start_date} />
                    <Field label="Email" value={profile.contact?.email} />
                    <Field label="Phone" value={profile.contact?.phone || profile.contact?.mobile} />
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          <TabsContent value="onboarding" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Onboarding {tasks.length > 0 && <span className="text-xs text-muted-foreground font-normal">· {done}/{tasks.length} done</span>}</CardTitle></CardHeader>
              <CardContent>
                {tasks.length === 0 ? <EmptyState icon={ClipboardCheck} title="Nothing to onboard" /> : (
                  <div className="space-y-1">
                    {tasks.map((t) => (
                      <div key={t.id} className="flex items-center gap-2">
                        <button disabled={busy === t.id} onClick={() => toggleTask(t.id)} className="shrink-0 cursor-pointer">
                          {t.status === 'done' ? <CheckCircle2 className="h-4 w-4 text-success" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                        </button>
                        <span className={`text-sm ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
                        {t.due_date && <span className="ml-auto text-xs text-muted-foreground">due {t.due_date}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="timeoff" className="space-y-4">
            <div className="flex justify-end">{ws && <RequestTimeOffDialog workspaceId={ws} onDone={load} />}</div>
            <Card>
              <CardContent className="p-0">
                {absences.length === 0 ? <EmptyState icon={CalendarDays} title="No time off yet" hint="Request time off above." /> : (
                  <div className="divide-y divide-border/40">
                    {absences.map((a) => (
                      <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div><span className="font-medium">{ABSENCE_TYPE_LABELS[a.absence_type]}</span><span className="text-muted-foreground"> · {a.start_date} → {a.end_date} · {a.working_days ?? '—'}d</span></div>
                        <span className={`text-sm capitalize ${statusTone(a.status)}`}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="documents" className="space-y-4">
            <Card>
              <CardContent className="p-0">
                {docs.length === 0 ? <EmptyState icon={FolderOpen} title="No documents" hint="Payslips and contracts your HR shares will appear here." /> : (
                  <div className="divide-y divide-border/40">
                    {docs.map((d) => (
                      <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                        <div className="flex items-center gap-2"><span className="font-medium">{d.name}</span><span className="text-sm text-muted-foreground capitalize">{DOC_TYPE_LABELS[d.doc_type]}</span></div>
                        <Button variant="ghost" size="sm" disabled={busy === d.id} onClick={() => viewDoc(d.id)}><Download className="h-4 w-4" /></Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return <div><span className="text-muted-foreground">{label}: </span><span>{value || '—'}</span></div>;
}

function RequestTimeOffDialog({ workspaceId, onDone }: { workspaceId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ type: 'vacation' as AbsenceType, start: '', end: '', note: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.start || !f.end) { toast({ title: 'Dates are required', variant: 'destructive' }); return; }
    if (f.end < f.start) { toast({ title: 'End must be after start', variant: 'destructive' }); return; }
    setSaving(true);
    try { await hrService.requestSelfTimeoff(workspaceId, { absence_type: f.type, start_date: f.start, end_date: f.end, note: f.note.trim() || undefined }); toast({ title: 'Request submitted', description: 'Pending approval from HR.' }); setOpen(false); setF({ type: 'vacation', start: '', end: '', note: '' }); onDone(); }
    catch (e) { toast({ title: 'Could not submit', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />Request time off</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Request time off</DialogTitle></DialogHeader>
        <div className="space-y-3">
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
          <div className="space-y-1"><Label>Note</Label><Textarea rows={2} value={f.note} onChange={(e) => upd('note', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
