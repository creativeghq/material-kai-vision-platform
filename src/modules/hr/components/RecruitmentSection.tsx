import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Loader2, Sparkles, Briefcase, ChevronLeft, UserPlus, GraduationCap, ExternalLink, FileUp, FileText, Wand2, Zap } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  hrService, type JobPosting, type Application, type Department, type AppStage, type EmploymentType, type PostingStatus,
  APP_STAGE_LABELS, APP_STAGES, POSTING_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS,
} from '../services/hrService';
import { SectionHeader, EmptyState, fileToBase64 } from './_shared';
import { parseDecimal } from '@/utils/decimal';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = { open: 'default', draft: 'secondary', closed: 'outline' };

export function RecruitmentSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const careersUrl = activeWorkspace?.slug ? `${window.location.origin}/careers/${activeWorkspace.slug}` : null;
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const [posFilter, setPosFilter] = useState<PostingStatus | 'all'>('open');

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const [p, d] = await Promise.all([hrService.listJobPostings(workspaceId), hrService.listDepartments(workspaceId)]); setPostings(p.postings); setDepartments(d.departments); }
    catch (e) { toast({ title: 'Failed to load jobs', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!workspaceId) return null;

  if (selected) {
    return <ApplicationsPipeline workspaceId={workspaceId} posting={selected} departments={departments} canManage={canManage} onBack={() => { setSelected(null); load(); }} />;
  }

  const counts = { open: postings.filter((p) => p.status === 'open').length, draft: postings.filter((p) => p.status === 'draft').length, closed: postings.filter((p) => p.status === 'closed').length };
  const shown = posFilter === 'all' ? postings : postings.filter((p) => p.status === posFilter);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Positions"
        subtitle={`${counts.open} open · ${counts.closed} closed`}
        actions={
          <div className="flex items-center gap-2">
            {careersUrl && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={() => window.open(careersUrl, '_blank')} title={careersUrl}>
                <ExternalLink className="h-4 w-4 mr-1" />Careers page
              </Button>
            )}
            {canManage && <JobDialog workspaceId={workspaceId} departments={departments} onDone={load} />}
          </div>
        }
      />
      <Tabs value={posFilter} onValueChange={(v) => setPosFilter(v as PostingStatus | 'all')}>
        <TabsList>
          <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
          <TabsTrigger value="draft">Drafts ({counts.draft})</TabsTrigger>
          <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {shown.length === 0 ? (
        <Card><CardContent><EmptyState icon={Briefcase} title={postings.length === 0 ? 'No job postings yet' : `No ${posFilter} positions`} hint={canManage && postings.length === 0 ? 'Create a job — the AI can draft the description for you.' : undefined} /></CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <button key={p.id} onClick={() => setSelected(p)} className="text-left rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{p.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{p.department?.name || 'No department'}{p.location ? ` · ${p.location}` : ''}{p.remote ? ' · Remote' : ''}</div>
                </div>
                <Badge variant={statusVariant[p.status]}>{POSTING_STATUS_LABELS[p.status]}</Badge>
              </div>
              <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                <span>{p.applicant_count} applicant{p.applicant_count === 1 ? '' : 's'}</span>
                <span>·</span>
                <span>{p.active_applicants} active</span>
                {p.employment_type && <><span>·</span><span>{EMPLOYMENT_TYPE_LABELS[p.employment_type]}</span></>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Applications pipeline for one posting ──
function ApplicationsPipeline({ workspaceId, posting, departments, canManage, onBack }: { workspaceId: string; posting: JobPosting; departments: Department[]; canManage: boolean; onBack: () => void }) {
  const { toast } = useToast();
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setApps((await hrService.listApplications(workspaceId, { job_posting_id: posting.id })).applications); }
    catch (e) { toast({ title: 'Failed to load applicants', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, posting.id, toast]);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="h-4 w-4 mr-1" />Positions</Button>
          <div>
            <h2 className="text-base font-display font-semibold">{posting.title}</h2>
            <p className="text-xs text-muted-foreground">{apps.length} applicant{apps.length === 1 ? '' : 's'} · <Badge variant={statusVariant[posting.status]} className="align-middle">{POSTING_STATUS_LABELS[posting.status]}</Badge></p>
          </div>
        </div>
        {canManage && <AddApplicantDialog workspaceId={workspaceId} postingId={posting.id} onDone={load} />}
      </div>

      {loading ? <Skeleton className="h-48 w-full" /> : apps.length === 0 ? (
        <Card><CardContent><EmptyState icon={UserPlus} title="No applicants yet" hint={canManage ? 'Add candidates manually, or share the careers page and they’ll appear here.' : undefined} /></CardContent></Card>
      ) : (
        <>
          <div className="grid gap-2">
            {apps.map((a) => <ApplicantRow key={a.id} app={a} workspaceId={workspaceId} canManage={canManage} onChanged={load} />)}
          </div>
          {canManage && <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Zap className="h-3.5 w-3.5" />Moving an applicant between stages fires the <strong>“HR — Applicant Stage Changed”</strong> Flow trigger — build a flow (in Flows) to auto-schedule interviews, email the candidate, or notify the team.</p>}
        </>
      )}
    </div>
  );
}

function scoreVariant(score: number): 'default' | 'secondary' | 'destructive' {
  if (score >= 70) return 'default';
  if (score >= 40) return 'secondary';
  return 'destructive';
}

function ApplicantRow({ app, workspaceId, canManage, onChanged }: { app: Application; workspaceId: string; canManage: boolean; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasCv = !!app.candidate?.resume_path;

  const move = async (stage: AppStage) => {
    setBusy('stage');
    try { await hrService.updateApplication(workspaceId, app.id, { stage }); onChanged(); }
    catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); setBusy(null); }
  };
  const hire = async () => {
    setBusy('hire');
    try { const r = await hrService.hireApplication(workspaceId, app.id); toast({ title: 'Hired 🎉', description: `Employee created + ${r.onboarding_seeded} onboarding tasks seeded.` }); onChanged(); }
    catch (e) { toast({ title: 'Hire failed', description: (e as Error).message, variant: 'destructive' }); setBusy(null); }
  };
  const viewCv = async () => {
    if (!app.candidate) return; setBusy('cv');
    try { const { url } = await hrService.applicationCvUrl(workspaceId, app.candidate.id); window.open(url, '_blank'); }
    catch (e) { toast({ title: 'Could not open CV', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const onFile = async (file: File | null) => {
    if (!file || !app.candidate) return; setBusy('cv');
    try {
      const b64 = await fileToBase64(file);
      await hrService.uploadApplicationCv(workspaceId, app.candidate.id, file.name, b64);
      toast({ title: 'CV uploaded' }); onChanged();
    } catch (e) { toast({ title: 'Upload failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); if (fileRef.current) fileRef.current.value = ''; }
  };
  const screen = async () => {
    setBusy('ai');
    try { const r = await hrService.screenApplication(workspaceId, app.id); toast({ title: 'AI screening done', description: `${r.credits_used} credit(s) used.` }); onChanged(); }
    catch (e) { toast({ title: 'AI screening failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card p-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="font-medium truncate flex items-center gap-2">
            {app.candidate?.name || 'Candidate'}
            {app.ai_score != null && <Badge variant={scoreVariant(app.ai_score)} className="gap-1"><Wand2 className="h-3 w-3" />{app.ai_score}/100</Badge>}
          </div>
          <div className="text-xs text-muted-foreground truncate">{app.candidate?.headline || app.candidate?.email || '—'}</div>
        </div>

        {canManage && (
          <>
            <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            {hasCv
              ? <Button variant="ghost" size="sm" className="h-8" disabled={busy === 'cv'} onClick={viewCv} title="View CV">{busy === 'cv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}</Button>
              : <Button variant="ghost" size="sm" className="h-8" disabled={busy === 'cv'} onClick={() => fileRef.current?.click()} title="Upload CV (PDF)">{busy === 'cv' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}</Button>}
            {hasCv && <Button variant="outline" size="sm" className="rounded-full h-8" disabled={busy === 'ai'} onClick={screen} title="AI-screen this CV against the job">{busy === 'ai' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Wand2 className="h-4 w-4 mr-1" />AI screen</>}</Button>}
          </>
        )}

        {canManage ? (
          <Select value={app.stage} onValueChange={(v) => move(v as AppStage)} disabled={!!busy || app.stage === 'hired'}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{APP_STAGES.map((s) => <SelectItem key={s} value={s}>{APP_STAGE_LABELS[s]}</SelectItem>)}</SelectContent>
          </Select>
        ) : <Badge variant="secondary">{APP_STAGE_LABELS[app.stage]}</Badge>}

        {canManage && app.stage !== 'hired' && app.stage !== 'rejected' && (
          <Button size="sm" className="rounded-full h-8" disabled={!!busy} onClick={hire}>{busy === 'hire' ? <Loader2 className="h-4 w-4 animate-spin" /> : <><GraduationCap className="h-4 w-4 mr-1" />Hire</>}</Button>
        )}
        {app.stage === 'hired' && <Badge variant="default">Hired</Badge>}
      </div>
      {app.ai_summary && <p className="mt-2 text-xs text-muted-foreground border-t border-border/40 pt-2">{app.ai_summary}</p>}
    </div>
  );
}

function AddApplicantDialog({ workspaceId, postingId, onDone }: { workspaceId: string; postingId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ name: '', email: '', phone: '', headline: '', source: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    if (!f.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setSaving(true);
    try { await hrService.createApplication(workspaceId, { job_posting_id: postingId, candidate: { name: f.name.trim(), email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, headline: f.headline.trim() || undefined, source: f.source.trim() || undefined } }); toast({ title: 'Applicant added' }); setOpen(false); setF({ name: '', email: '', phone: '', headline: '', source: '' }); onDone(); }
    catch (e) { toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><UserPlus className="h-4 w-4 mr-2" />Add applicant</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add applicant</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Full name *</Label><Input value={f.name} onChange={(e) => upd('name', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} /></div>
            <div className="space-y-1"><Label>Phone</Label><Input value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Headline</Label><Input value={f.headline} onChange={(e) => upd('headline', e.target.value)} placeholder="Senior Frontend Engineer @ Acme" /></div>
          <div className="space-y-1"><Label>Source</Label><Input value={f.source} onChange={(e) => upd('source', e.target.value)} placeholder="LinkedIn / referral / website" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── New job dialog (with AI description) ──
function JobDialog({ workspaceId, departments, onDone }: { workspaceId: string; departments: Department[]; onDone: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [f, setF] = useState({ title: '', department_id: '', employment_type: 'full_time' as EmploymentType, location: '', remote: false, keywords: '', description: '', requirements: '', salary_min: '', salary_max: '', status: 'draft' });
  const upd = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => setF({ title: '', department_id: '', employment_type: 'full_time', location: '', remote: false, keywords: '', description: '', requirements: '', salary_min: '', salary_max: '', status: 'draft' });

  const generate = async () => {
    if (!f.title.trim()) { toast({ title: 'Enter a job title first', variant: 'destructive' }); return; }
    setAiBusy(true);
    try {
      const { generated, credits_used } = await hrService.generateJobDescription(workspaceId, {
        title: f.title.trim(), department: departments.find((d) => d.id === f.department_id)?.name, employment_type: f.employment_type, location: f.location, keywords: f.keywords,
      });
      setF((p) => ({ ...p, description: generated.description, requirements: generated.requirements, salary_min: generated.suggested_salary_min ? String(generated.suggested_salary_min) : p.salary_min, salary_max: generated.suggested_salary_max ? String(generated.suggested_salary_max) : p.salary_max }));
      toast({ title: 'Draft generated', description: `Review & edit before publishing. ${credits_used} credit(s) used.` });
    } catch (e) { toast({ title: 'AI generation failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setAiBusy(false); }
  };

  const submit = async (status: 'draft' | 'open') => {
    if (!f.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await hrService.createJobPosting(workspaceId, {
        title: f.title.trim(), department_id: f.department_id || null, employment_type: f.employment_type, location: f.location.trim() || null, remote: f.remote,
        description: f.description || null, requirements: f.requirements || null,
        salary_min: parseDecimal(f.salary_min), salary_max: parseDecimal(f.salary_max), status,
      });
      toast({ title: status === 'open' ? 'Job published' : 'Draft saved' }); setOpen(false); reset(); onDone();
    } catch (e) { toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild><Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New job</Button></DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New job posting</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Title *</Label><Input value={f.title} onChange={(e) => upd('title', e.target.value)} placeholder="Senior Product Designer" /></div>
            <div className="space-y-1">
              <Label>Department</Label>
              <Select value={f.department_id || 'none'} onValueChange={(v) => upd('department_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="none">—</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={f.employment_type} onValueChange={(v) => upd('employment_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Location</Label><Input value={f.location} onChange={(e) => upd('location', e.target.value)} placeholder="Athens" /></div>
            <div className="space-y-1 flex items-end"><label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={f.remote} onChange={(e) => upd('remote', e.target.checked)} /> Remote</label></div>
          </div>

          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="flex items-center gap-1.5"><Sparkles className="h-4 w-4 text-primary" /> AI job description</Label>
              <Button size="sm" variant="outline" className="rounded-full h-8" onClick={generate} disabled={aiBusy}>{aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generate'}</Button>
            </div>
            <Input value={f.keywords} onChange={(e) => upd('keywords', e.target.value)} placeholder="Must-haves / keywords (e.g. Figma, design systems, 5+ yrs)" />
          </div>

          <div className="space-y-1"><Label>Description</Label><Textarea rows={6} value={f.description} onChange={(e) => upd('description', e.target.value)} placeholder="Role overview & responsibilities (markdown)" /></div>
          <div className="space-y-1"><Label>Requirements</Label><Textarea rows={4} value={f.requirements} onChange={(e) => upd('requirements', e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Salary min</Label><Input type="text" inputMode="decimal" value={f.salary_min} onChange={(e) => upd('salary_min', e.target.value)} /></div>
            <div className="space-y-1"><Label>Salary max</Label><Input type="text" inputMode="decimal" value={f.salary_max} onChange={(e) => upd('salary_max', e.target.value)} /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => submit('draft')} disabled={saving}>Save draft</Button>
          <Button className="rounded-full" onClick={() => submit('open')} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Publish</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
