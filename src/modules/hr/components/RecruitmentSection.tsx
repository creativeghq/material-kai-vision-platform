import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Loader2, Sparkles, Briefcase, ChevronLeft, UserPlus, GraduationCap, ExternalLink, FileUp, FileText, Wand2, Zap, Trash2, Lock, LockOpen, Pencil, Link as LinkIcon } from 'lucide-react';
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
  hrService, type JobPosting, type Application, type Department, type AppStage, type EmploymentType, type PostingStatus, type LocationType,
  APP_STAGE_LABELS, APP_STAGES, POSTING_STATUS_LABELS, EMPLOYMENT_TYPE_LABELS, LOCATION_TYPE_LABELS,
} from '../services/hrService';
import { SectionHeader, EmptyState, fileToBase64 } from './_shared';
import { parseDecimal } from '@/utils/decimal';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildPostingFilters } from './hrFilters';

const statusVariant: Record<string, 'default' | 'secondary' | 'outline'> = { open: 'default', draft: 'secondary', closed: 'outline' };

export function RecruitmentSection({ workspaceId, canManage }: { workspaceId: string | null; canManage: boolean }) {
  const { toast } = useToast();
  const { activeWorkspace } = useWorkspace();
  const careersUrl = activeWorkspace?.slug ? `${window.location.origin}/careers/${activeWorkspace.slug}` : null;
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  // Track the id, not the row: every reload then re-derives the selected posting from fresh data,
  // so editing a job doesn't leave a stale copy on screen.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<PostingStatus | 'all'>('open');

  const load = useCallback(async () => {
    if (!workspaceId) { setLoading(false); return; }
    setLoading(true);
    try { const [p, d] = await Promise.all([hrService.listJobPostings(workspaceId), hrService.listDepartments(workspaceId)]); setPostings(p.postings); setDepartments(d.departments); }
    catch (e) { toast({ title: 'Failed to load jobs', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [workspaceId, toast]);
  useEffect(() => { void load(); }, [load]);

  // Status stays on the tab strip; the modal carries everything else.
  const filterGroups = useMemo(() => buildPostingFilters(postings, departments), [postings, departments]);
  const { values: filterValues, setValues: setFilterValues, filtered: matched, previewCount } =
    useFilters<JobPosting>(postings, filterGroups);

  if (loading) return <Skeleton className="h-64 w-full" />;
  if (!workspaceId) return null;

  const selected = selectedId ? postings.find((p) => p.id === selectedId) ?? null : null;
  if (selected) {
    return (
      <ApplicationsPipeline
        workspaceId={workspaceId} posting={selected} departments={departments} canManage={canManage}
        careersSlug={activeWorkspace?.slug ?? null}
        onRefresh={load} onBack={() => { setSelectedId(null); void load(); }}
      />
    );
  }

  const counts = { open: postings.filter((p) => p.status === 'open').length, draft: postings.filter((p) => p.status === 'draft').length, closed: postings.filter((p) => p.status === 'closed').length };
  const shown = posFilter === 'all' ? matched : matched.filter((p) => p.status === posFilter);

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs value={posFilter} onValueChange={(v) => setPosFilter(v as PostingStatus | 'all')}>
          <TabsList>
            <TabsTrigger value="open">Open ({counts.open})</TabsTrigger>
            <TabsTrigger value="draft">Drafts ({counts.draft})</TabsTrigger>
            <TabsTrigger value="closed">Closed ({counts.closed})</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>
        {postings.length > 0 && (
          <FilterBar
            groups={filterGroups}
            values={filterValues}
            onChange={setFilterValues}
            previewCount={previewCount}
            title="Filter positions"
            searchPlaceholder="Search positions…"
          />
        )}
      </div>
      {shown.length === 0 ? (
        <Card><CardContent><EmptyState icon={Briefcase} title={postings.length === 0 ? 'No job postings yet' : `No ${posFilter} positions`} hint={canManage && postings.length === 0 ? 'Create a job — the AI can draft the description for you.' : undefined} /></CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {shown.map((p) => (
            <button key={p.id} onClick={() => setSelectedId(p.id)} className="text-left rounded-2xl border border-border/60 bg-card p-4 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
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
function ApplicationsPipeline({ workspaceId, posting, departments, canManage, careersSlug, onRefresh, onBack }: { workspaceId: string; posting: JobPosting; departments: Department[]; canManage: boolean; careersSlug: string | null; onRefresh: () => void; onBack: () => void }) {
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

  const [busyPosting, setBusyPosting] = useState(false);
  const toggleStatus = async () => {
    const next = posting.status === 'closed' ? 'open' : 'closed';
    setBusyPosting(true);
    try { await hrService.updateJobPosting(workspaceId, posting.id, { status: next }); toast({ title: next === 'closed' ? 'Position closed' : 'Position reopened' }); onBack(); }
    catch (e) { toast({ title: 'Update failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyPosting(false); }
  };
  const removePosting = async () => {
    if (!confirm('Delete this job posting and its applicants? This cannot be undone.')) return;
    setBusyPosting(true);
    try { await hrService.deleteJobPosting(workspaceId, posting.id); toast({ title: 'Position deleted' }); onBack(); }
    catch (e) { toast({ title: 'Delete failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusyPosting(false); }
  };

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
        {canManage && (
          <div className="flex items-center gap-2">
            {careersSlug && posting.status === 'open' && (
              <Button
                variant="outline" size="sm" className="rounded-full"
                onClick={() => window.open(`${window.location.origin}/careers/${careersSlug}/${posting.slug || posting.id}`, '_blank')}
                title="Open the public posting"
              >
                <ExternalLink className="h-4 w-4 mr-1" />View public page
              </Button>
            )}
            <JobDialog workspaceId={workspaceId} departments={departments} posting={posting} onDone={onRefresh} />
            <Button variant="outline" size="sm" className="rounded-full" disabled={busyPosting} onClick={toggleStatus}>
              {posting.status === 'closed' ? <><LockOpen className="h-4 w-4 mr-1" />Reopen</> : <><Lock className="h-4 w-4 mr-1" />Close</>}
            </Button>
            <Button variant="outline" size="sm" className="rounded-full text-destructive hover:text-destructive" disabled={busyPosting} onClick={removePosting}>
              <Trash2 className="h-4 w-4" />
            </Button>
            <AddApplicantDialog workspaceId={workspaceId} postingId={posting.id} onDone={load} />
          </div>
        )}
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
          <div className="text-xs text-muted-foreground truncate">
            {[app.candidate?.headline, app.candidate?.location, app.candidate?.email].filter(Boolean).join(' · ') || '—'}
          </div>
          {app.candidate?.links && (
            <div className="text-xs text-muted-foreground truncate mt-0.5 flex items-center gap-1">
              <LinkIcon className="h-3 w-3 shrink-0" />
              <span className="truncate">{app.candidate.links}</span>
            </div>
          )}
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
          <div className="space-y-1"><Label>Source</Label><Input value={f.source} onChange={(e) => upd('source', e.target.value)} placeholder="LinkedIn / Referral / Website" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)} disabled={saving}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Add</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Create / edit job dialog (with AI description) ──
type CompRow = { region: string; currency: string; min: string; max: string; equity: boolean; bonus: boolean; note: string };

const blankForm = () => ({
  title: '', department_id: '', employment_type: 'full_time' as EmploymentType, location: '',
  location_type: '' as '' | LocationType, level: '', keywords: '',
  description: '', requirements: '', salary_min: '', salary_max: '', currency: 'EUR',
  compensation_note: '', closes_at: '',
  require_resume: true, ask_phone: true, ask_location: true, ask_links: true, ask_cover_letter: true,
});

/** Hydrate the form from an existing posting (edit mode). */
function formFromPosting(p: JobPosting): ReturnType<typeof blankForm> {
  const cfg = p.apply_config ?? {};
  const flag = (v: boolean | undefined) => v !== false; // unset → asked for
  return {
    ...blankForm(),
    title: p.title ?? '', department_id: p.department_id ?? '',
    employment_type: (p.employment_type ?? 'full_time') as EmploymentType,
    location: p.location ?? '', location_type: (p.location_type ?? (p.remote ? 'remote' : '')) as '' | LocationType,
    level: p.level ?? '', description: p.description ?? '', requirements: p.requirements ?? '',
    salary_min: p.salary_min != null ? String(p.salary_min) : '', salary_max: p.salary_max != null ? String(p.salary_max) : '',
    currency: p.currency || 'EUR', compensation_note: p.compensation_note ?? '',
    closes_at: p.closes_at ? p.closes_at.slice(0, 10) : '',
    require_resume: flag(cfg.require_resume), ask_phone: flag(cfg.ask_phone), ask_location: flag(cfg.ask_location),
    ask_links: flag(cfg.ask_links), ask_cover_letter: flag(cfg.ask_cover_letter),
  };
}

const compRowsFromPosting = (p?: JobPosting | null): CompRow[] =>
  (p?.compensation ?? []).map((b) => ({
    region: b.region ?? '', currency: b.currency || 'EUR',
    min: b.min != null ? String(b.min) : '', max: b.max != null ? String(b.max) : '',
    equity: !!b.equity, bonus: !!b.bonus, note: b.note ?? '',
  }));

function JobDialog({ workspaceId, departments, posting, onDone }: { workspaceId: string; departments: Department[]; posting?: JobPosting; onDone: () => void }) {
  const { toast } = useToast();
  const isEdit = !!posting;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [f, setF] = useState(() => (posting ? formFromPosting(posting) : blankForm()));
  const [comp, setComp] = useState<CompRow[]>(() => compRowsFromPosting(posting));
  const upd = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const reset = () => { setF(posting ? formFromPosting(posting) : blankForm()); setComp(compRowsFromPosting(posting)); };

  const updComp = (i: number, patch: Partial<CompRow>) => setComp((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addComp = () => setComp((rows) => [...rows, { region: '', currency: f.currency || 'EUR', min: '', max: '', equity: false, bonus: false, note: '' }]);

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

  const submit = async (status: PostingStatus) => {
    if (!f.title.trim()) { toast({ title: 'Title is required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const payload = {
        title: f.title.trim(), department_id: f.department_id || null, employment_type: f.employment_type,
        location: f.location.trim() || null, location_type: f.location_type || null,
        // `remote` is the legacy boolean — keep it in step with location_type so old readers stay correct.
        remote: f.location_type === 'remote', level: f.level.trim() || null,
        description: f.description || null, requirements: f.requirements || null,
        salary_min: parseDecimal(f.salary_min), salary_max: parseDecimal(f.salary_max), currency: f.currency || 'EUR',
        compensation: comp
          .filter((r) => r.region.trim())
          .map((r) => ({ region: r.region.trim(), currency: r.currency || 'EUR', min: parseDecimal(r.min), max: parseDecimal(r.max), equity: r.equity, bonus: r.bonus, note: r.note.trim() || null })),
        compensation_note: f.compensation_note.trim() || null,
        closes_at: f.closes_at ? new Date(`${f.closes_at}T23:59:59`).toISOString() : null,
        apply_config: {
          require_resume: f.require_resume, ask_phone: f.ask_phone, ask_location: f.ask_location,
          ask_links: f.ask_links, ask_cover_letter: f.ask_cover_letter,
        },
        status,
      };
      if (isEdit) await hrService.updateJobPosting(workspaceId, posting!.id, payload);
      else await hrService.createJobPosting(workspaceId, payload);
      toast({ title: isEdit ? 'Job updated' : status === 'open' ? 'Job published' : 'Draft saved' });
      setOpen(false); onDone();
    } catch (e) { toast({ title: 'Could not save', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        {isEdit
          ? <Button variant="outline" size="sm" className="rounded-full"><Pencil className="h-4 w-4 mr-1" />Edit</Button>
          : <Button size="sm" className="rounded-full"><Plus className="h-4 w-4 mr-2" />New job</Button>}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{isEdit ? 'Edit job posting' : 'New job posting'}</DialogTitle></DialogHeader>
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={f.employment_type} onValueChange={(v) => upd('employment_type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{(Object.keys(EMPLOYMENT_TYPE_LABELS) as EmploymentType[]).map((t) => <SelectItem key={t} value={t}>{EMPLOYMENT_TYPE_LABELS[t]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Work setup</Label>
              <Select value={f.location_type || 'none'} onValueChange={(v) => upd('location_type', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {(Object.keys(LOCATION_TYPE_LABELS) as LocationType[]).map((t) => <SelectItem key={t} value={t}>{LOCATION_TYPE_LABELS[t]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Location</Label><Input value={f.location} onChange={(e) => upd('location', e.target.value)} placeholder="United Kingdom; Ireland" /></div>
            <div className="space-y-1"><Label>Level</Label><Input value={f.level} onChange={(e) => upd('level', e.target.value)} placeholder="P4" /></div>
            <div className="space-y-1"><Label>Applications close</Label><Input type="date" value={f.closes_at} onChange={(e) => upd('closes_at', e.target.value)} /></div>
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
          <p className="text-xs text-muted-foreground">Both fields render as Markdown on the public page — use <code>##</code> headings and <code>-</code> bullets.</p>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1"><Label>Salary min</Label><Input type="text" inputMode="decimal" value={f.salary_min} onChange={(e) => upd('salary_min', e.target.value)} /></div>
            <div className="space-y-1"><Label>Salary max</Label><Input type="text" inputMode="decimal" value={f.salary_max} onChange={(e) => upd('salary_max', e.target.value)} /></div>
            <div className="space-y-1"><Label>Currency</Label><Input value={f.currency} onChange={(e) => upd('currency', e.target.value.toUpperCase())} placeholder="EUR" /></div>
          </div>

          {/* Optional per-region bands — when present they replace the flat range on the public page. */}
          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Compensation by region <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Button size="sm" variant="outline" className="rounded-full h-8" onClick={addComp}><Plus className="h-3.5 w-3.5 mr-1" />Add region</Button>
            </div>
            {comp.length === 0 ? (
              <p className="text-xs text-muted-foreground">Leave empty to show the single salary range above.</p>
            ) : comp.map((r, i) => (
              <div key={i} className="rounded-lg border border-border/40 p-2 space-y-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input value={r.region} onChange={(e) => updComp(i, { region: e.target.value })} placeholder="United Kingdom" className="h-8" />
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={() => setComp((rows) => rows.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input value={r.min} inputMode="decimal" onChange={(e) => updComp(i, { min: e.target.value })} placeholder="Min" className="h-8" />
                  <Input value={r.max} inputMode="decimal" onChange={(e) => updComp(i, { max: e.target.value })} placeholder="Max" className="h-8" />
                  <Input value={r.currency} onChange={(e) => updComp(i, { currency: e.target.value.toUpperCase() })} placeholder="GBP" className="h-8" />
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={r.equity} onChange={(e) => updComp(i, { equity: e.target.checked })} />Offers equity</label>
                  <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={r.bonus} onChange={(e) => updComp(i, { bonus: e.target.checked })} />Offers bonus</label>
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Compensation note</Label>
              <Textarea rows={2} value={f.compensation_note} onChange={(e) => upd('compensation_note', e.target.value)} placeholder="How you determine compensation, link to your philosophy, etc." />
            </div>
          </div>

          {/* What the public application form asks for. */}
          <div className="rounded-xl border border-border/60 p-3 space-y-2">
            <Label>Application form</Label>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {([
                ['require_resume', 'Require a résumé (PDF)'], ['ask_phone', 'Ask for phone'],
                ['ask_location', 'Ask for location'], ['ask_links', 'Ask for links (GitHub, portfolio…)'],
                ['ask_cover_letter', 'Ask for a cover letter'],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={f[k]} onChange={(e) => upd(k, e.target.checked)} />{label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          {isEdit ? (
            <Button className="rounded-full" onClick={() => submit(posting!.status)} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save changes
            </Button>
          ) : (
            <>
              <Button variant="outline" className="rounded-full" onClick={() => submit('draft')} disabled={saving}>Save draft</Button>
              <Button className="rounded-full" onClick={() => submit('open')} disabled={saving}>{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Publish</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
