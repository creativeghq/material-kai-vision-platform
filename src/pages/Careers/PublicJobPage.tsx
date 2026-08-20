// PUBLIC job detail + application at /careers/:slug/:job. Anonymous.
// Layout mirrors a modern ATS posting: sticky facts rail on the left, Overview / Application
// tabs on the right. Emits JobPosting JSON-LD so the role is indexable by job search engines.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowLeft, CheckCircle2, FileText, Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { mdComponents } from '@/components/features/knowledge/markdownComponents';
import {
  fileToBase64, publicCareersService, type CareersJobDetail, type CompanyProfile,
} from '@/services/publicCareersService';
import { bandLabel, CompanyHeader, EMPLOYMENT_LABELS, locationTypeLabel, rangeLabel } from './careersShared';

const RESUME_MAX_BYTES = 8_000_000;

export default function PublicJobPage() {
  const { slug = '', job: jobKey = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<CareersJobDetail | null>(null);
  const [company, setCompany] = useState<CompanyProfile | null>(null);
  const [siteKey, setSiteKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'overview' | 'application'>('overview');
  const [applied, setApplied] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const r = await publicCareersService.getJob(slug, jobKey);
        if (cancelled) return;
        setJob(r.job); setCompany(r.company_profile); setSiteKey(r.turnstile_site_key);
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [slug, jobKey]);

  // Title + JSON-LD so the posting unfurls and indexes as a real job listing.
  useEffect(() => {
    if (!job || !company) return;
    document.title = `${job.title} · ${company.name}`;
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.text = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'JobPosting',
      title: job.title,
      description: [job.description, job.requirements].filter(Boolean).join('\n\n') || job.title,
      datePosted: job.published_at ?? undefined,
      validThrough: job.closes_at ?? undefined,
      employmentType: job.employment_type?.toUpperCase(),
      hiringOrganization: { '@type': 'Organization', name: company.name, logo: company.logo_url ?? undefined, sameAs: company.website ?? undefined },
      jobLocationType: (job.location_type === 'remote' || job.remote) ? 'TELECOMMUTE' : undefined,
      jobLocation: job.location ? { '@type': 'Place', address: { '@type': 'PostalAddress', addressLocality: job.location } } : undefined,
      baseSalary: job.salary_min || job.salary_max ? {
        '@type': 'MonetaryAmount', currency: job.currency || 'EUR',
        value: { '@type': 'QuantitativeValue', minValue: job.salary_min ?? undefined, maxValue: job.salary_max ?? undefined, unitText: 'YEAR' },
      } : undefined,
    });
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [job, company]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !job || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">{error || 'This position is no longer open.'}</p>
        <Button variant="outline" onClick={() => navigate(`/careers/${slug}`)}>See all open roles</Button>
      </div>
    );
  }

  const facts: Array<{ label: string; value: React.ReactNode }> = [];
  if (job.location) facts.push({ label: 'Location', value: job.location });
  if (job.employment_type) facts.push({ label: 'Employment Type', value: EMPLOYMENT_LABELS[job.employment_type] ?? job.employment_type });
  const locType = locationTypeLabel(job);
  if (locType) facts.push({ label: 'Location Type', value: locType });
  if (job.department) facts.push({ label: 'Department', value: job.department });

  const legacyRange = rangeLabel(job.salary_min, job.salary_max, job.currency);
  const hasComp = job.compensation?.length > 0 || !!legacyRange;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-between gap-4 mb-8">
          <Link to={`/careers/${slug}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />All openings
          </Link>
          <CompanyHeader company={company} onHome={() => navigate(`/careers/${slug}`)} />
        </div>

        <h1 className="text-3xl font-display font-semibold tracking-tight mb-8">{job.title}</h1>

        <div className="grid gap-10 md:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          {/* ── Facts rail ── */}
          <aside className="md:sticky md:top-8 md:self-start space-y-5">
            {facts.map((f) => (
              <div key={f.label} className="border-b border-border/60 pb-4">
                <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
                <div className="text-sm">{f.value}</div>
              </div>
            ))}
            {hasComp && (
              <div className="border-b border-border/60 pb-4">
                <div className="text-xs text-muted-foreground mb-2">Compensation</div>
                {job.compensation?.length > 0 ? (
                  <div className="space-y-3">
                    {job.compensation.map((b, i) => (
                      <div key={`${b.region}-${i}`}>
                        <div className="text-sm font-medium">{b.region}</div>
                        <div className="text-xs text-muted-foreground">{bandLabel(b)}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm">{legacyRange}</div>
                )}
              </div>
            )}
            {job.compensation_note && <p className="text-xs text-muted-foreground leading-relaxed">{job.compensation_note}</p>}
            {job.level && <p className="text-xs text-muted-foreground leading-relaxed">This position is leveled as {job.level}.</p>}
            {job.closes_at && (
              <p className="text-xs text-muted-foreground">
                Applications close {new Date(job.closes_at).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric' })}.
              </p>
            )}
          </aside>

          {/* ── Overview / Application ── */}
          <div className="min-w-0">
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'overview' | 'application')} className="mb-6">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="application">Application</TabsTrigger>
              </TabsList>
            </Tabs>

            {tab === 'overview' ? (
              <div>
                {job.description && <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{job.description}</ReactMarkdown>}
                {job.requirements && (
                  <div className="mt-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{job.requirements}</ReactMarkdown>
                  </div>
                )}
                {!job.description && !job.requirements && <p className="text-muted-foreground">Full details coming soon — apply and we’ll be in touch.</p>}
                <Button className="mt-8" onClick={() => setTab('application')}>Apply for this role</Button>
              </div>
            ) : applied ? (
              <div className="rounded-2xl border border-border/60 p-10 text-center">
                <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-primary" />
                <h2 className="text-lg font-display font-semibold">{applied}</h2>
                <p className="text-sm text-muted-foreground mt-1">We’ll be in touch if there’s a fit.</p>
                <Button variant="outline" className="mt-5" onClick={() => navigate(`/careers/${slug}`)}>Back to openings</Button>
              </div>
            ) : (
              <ApplicationForm slug={slug} job={job} siteKey={siteKey} onDone={setApplied} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ApplicationForm({ slug, job, siteKey, onDone }: {
  slug: string; job: CareersJobDetail; siteKey: string | null; onDone: (msg: string) => void;
}) {
  const cfg = job.apply_config;
  const [f, setF] = useState({ name: '', email: '', phone: '', headline: '', location: '', links: '', cover_letter: '' });
  const [resume, setResume] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const turnstileRef = useRef<TurnstileHandle>(null);
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const takeFile = useCallback((file: File | null) => {
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { setErr('Please upload your résumé as a PDF.'); return; }
    if (file.size > RESUME_MAX_BYTES) { setErr('That file is too large (max 8MB).'); return; }
    setErr(null); setResume(file);
  }, []);

  const submit = async () => {
    if (!f.name.trim()) { setErr('Please enter your name.'); return; }
    if (!f.email.trim()) { setErr('Please enter your email so we can reply.'); return; }
    if (cfg.require_resume && !resume) { setErr('A résumé (PDF) is required for this role.'); return; }
    if (siteKey && !token) { setErr('Please complete the bot check.'); return; }
    setSubmitting(true); setErr(null);
    try {
      const r = await publicCareersService.apply(slug, {
        job_slug: job.slug || undefined, job_id: job.slug ? undefined : job.id,
        name: f.name.trim(), email: f.email.trim(),
        phone: f.phone.trim() || undefined, headline: f.headline.trim() || undefined,
        location: f.location.trim() || undefined, links: f.links.trim() || undefined,
        cover_letter: f.cover_letter.trim() || undefined,
        resume_base64: resume ? await fileToBase64(resume) : undefined,
        resume_filename: resume?.name,
        turnstile_token: token || undefined,
      });
      onDone(r.message || 'Application submitted — thank you!');
    } catch (e) {
      setErr((e as Error).message); turnstileRef.current?.reset(); setToken('');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5"><Label>Name *</Label><Input value={f.name} onChange={(e) => upd('name', e.target.value)} placeholder="Type here..." /></div>
        <div className="space-y-1.5"><Label>Email *</Label><Input type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} placeholder="hello@example.com" /></div>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {cfg.ask_phone && <div className="space-y-1.5"><Label>Phone</Label><Input value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></div>}
        {cfg.ask_location && <div className="space-y-1.5"><Label>Location</Label><Input value={f.location} onChange={(e) => upd('location', e.target.value)} placeholder="City, Country" /></div>}
      </div>
      <div className="space-y-1.5">
        <Label>Current role</Label>
        <Input value={f.headline} onChange={(e) => upd('headline', e.target.value)} placeholder="e.g. Senior Product Manager @ Acme" />
      </div>

      <div className="space-y-1.5">
        <Label>Résumé{cfg.require_resume ? ' *' : ''} <span className="text-muted-foreground font-normal">(PDF)</span></Label>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => takeFile(e.target.files?.[0] ?? null)} />
        {resume ? (
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-card px-4 py-3">
            <FileText className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm truncate flex-1">{resume.name}</span>
            <span className="text-xs text-muted-foreground shrink-0">{(resume.size / 1024 / 1024).toFixed(1)} MB</span>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => { setResume(null); if (fileRef.current) fileRef.current.value = ''; }}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ) : (
          <div
            // Presentational: the keyboard path is the file button inside this box.
            role="presentation"
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); takeFile(e.dataTransfer.files?.[0] ?? null); }}
            className={`flex items-center justify-center gap-4 rounded-xl border border-dashed px-4 py-8 transition-colors ${dragging ? 'border-primary bg-primary/5' : 'border-border/60'}`}
          >
            <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
              <Paperclip className="h-4 w-4 mr-2" />Upload file
            </Button>
            <span className="text-sm text-muted-foreground">or drag and drop here</span>
          </div>
        )}
      </div>

      {cfg.ask_links && (
        <div className="space-y-1.5">
          <Label>Links to your GitHub, portfolio, website, LinkedIn, etc.</Label>
          <Input value={f.links} onChange={(e) => upd('links', e.target.value)} placeholder="Type here..." />
        </div>
      )}
      {cfg.ask_cover_letter && (
        <div className="space-y-1.5">
          <Label>Cover letter</Label>
          <Textarea rows={5} value={f.cover_letter} onChange={(e) => upd('cover_letter', e.target.value)} placeholder="Why you’re a great fit (optional)" />
        </div>
      )}

      {siteKey && <TurnstileWidget ref={turnstileRef} siteKey={siteKey} action="careers_apply" onVerify={setToken} onExpired={() => setToken('')} />}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button onClick={submit} disabled={submitting}>
        {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit application
      </Button>
    </div>
  );
}
