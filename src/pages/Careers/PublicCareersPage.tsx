import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Briefcase, MapPin, Loader2, ChevronLeft, Building2, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { TurnstileWidget, type TurnstileHandle } from '@/components/features/turnstile/TurnstileWidget';
import { publicCareersService, type CareersMeta, type CareersJobDetail } from '@/services/publicCareersService';

const empLabel: Record<string, string> = { full_time: 'Full-time', part_time: 'Part-time', contractor: 'Contractor' };
const salaryStr = (j: { salary_min: number | null; salary_max: number | null; currency: string | null }) =>
  j.salary_min || j.salary_max ? `${[j.salary_min, j.salary_max].filter(Boolean).map((n) => Number(n).toLocaleString()).join('–')} ${j.currency || ''}`.trim() : null;

export default function PublicCareersPage() {
  const { slug = '' } = useParams();
  const [meta, setMeta] = useState<CareersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try { const m = await publicCareersService.meta(slug); if (!cancelled) setMeta(m); }
      catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !meta) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">This careers page isn’t available.</div>;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-11 h-11 rounded-xl bg-primary/15 flex items-center justify-center"><Building2 className="h-6 w-6 text-primary" /></div>
          <div>
            <h1 className="text-2xl font-display font-semibold">{meta.company}</h1>
            <p className="text-sm text-muted-foreground">Open positions</p>
          </div>
        </div>

        {selected ? (
          <JobDetail slug={slug} jobId={selected} siteKey={meta.turnstile_site_key} onBack={() => setSelected(null)} />
        ) : meta.jobs.length === 0 ? (
          <div className="rounded-2xl border border-border/60 p-10 text-center text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p>No open positions right now. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {meta.jobs.map((j) => (
              <button key={j.id} onClick={() => setSelected(j.id)} className="w-full text-left rounded-2xl border border-border/60 p-5 hover:border-primary/40 hover:shadow-sm transition-all cursor-pointer">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-medium">{j.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {j.department && <span className="inline-flex items-center gap-1"><Briefcase className="h-3.5 w-3.5" />{j.department}</span>}
                      {(j.location || j.remote) && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{[j.location, j.remote ? 'Remote' : ''].filter(Boolean).join(' · ')}</span>}
                      {j.employment_type && <span>{empLabel[j.employment_type] ?? j.employment_type}</span>}
                    </div>
                  </div>
                  {salaryStr(j) && <Badge variant="secondary" className="shrink-0">{salaryStr(j)}</Badge>}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobDetail({ slug, jobId, siteKey, onBack }: { slug: string; jobId: string; siteKey: string | null; onBack: () => void }) {
  const [job, setJob] = useState<CareersJobDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [applied, setApplied] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const turnstileRef = useRef<TurnstileHandle>(null);
  const [f, setF] = useState({ name: '', email: '', phone: '', headline: '', cover_letter: '' });
  const upd = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    setLoading(true);
    try { setJob((await publicCareersService.getJob(slug, jobId)).job); }
    catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [slug, jobId]);
  useEffect(() => { void load(); }, [load]);

  const submit = async () => {
    if (!f.name.trim()) { setErr('Please enter your name.'); return; }
    if (siteKey && !token) { setErr('Please complete the bot check.'); return; }
    setSubmitting(true); setErr(null);
    try {
      const r = await publicCareersService.apply(slug, { job_id: jobId, name: f.name.trim(), email: f.email.trim() || undefined, phone: f.phone.trim() || undefined, headline: f.headline.trim() || undefined, cover_letter: f.cover_letter.trim() || undefined, turnstile_token: token || undefined });
      setApplied(r.message || 'Application submitted — thank you!');
    } catch (e) { setErr((e as Error).message); turnstileRef.current?.reset(); setToken(''); }
    finally { setSubmitting(false); }
  };

  if (loading) return <div className="py-16 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></div>;
  if (!job) return <div className="text-muted-foreground">{err || 'This position is no longer open.'}</div>;

  if (applied) return (
    <div className="rounded-2xl border border-border/60 p-10 text-center">
      <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-success" />
      <h2 className="text-lg font-display font-semibold">{applied}</h2>
      <p className="text-sm text-muted-foreground mt-1">We’ll be in touch if there’s a fit.</p>
      <Button variant="outline" className="rounded-full mt-5" onClick={onBack}>Back to openings</Button>
    </div>
  );

  return (
    <div>
      <Button variant="ghost" size="sm" onClick={onBack} className="mb-3"><ChevronLeft className="h-4 w-4 mr-1" />All openings</Button>
      <h2 className="text-2xl font-display font-semibold">{job.title}</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
        {job.department && <span>{job.department}</span>}
        {(job.location || job.remote) && <span>· {[job.location, job.remote ? 'Remote' : ''].filter(Boolean).join(' · ')}</span>}
        {job.employment_type && <span>· {empLabel[job.employment_type] ?? job.employment_type}</span>}
        {salaryStr(job) && <span>· {salaryStr(job)}</span>}
      </div>

      {job.description && <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">{job.description}</div>}
      {job.requirements && <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{job.requirements}</div>}

      <div className="mt-8 rounded-2xl border border-border/60 p-5">
        <h3 className="font-display font-semibold mb-3">Apply for this role</h3>
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Full name *</Label><Input value={f.name} onChange={(e) => upd('name', e.target.value)} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={f.email} onChange={(e) => upd('email', e.target.value)} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Phone</Label><Input value={f.phone} onChange={(e) => upd('phone', e.target.value)} /></div>
            <div className="space-y-1"><Label>Current role</Label><Input value={f.headline} onChange={(e) => upd('headline', e.target.value)} placeholder="e.g. Backend Engineer @ Acme" /></div>
          </div>
          <div className="space-y-1"><Label>Cover letter</Label><Textarea rows={4} value={f.cover_letter} onChange={(e) => upd('cover_letter', e.target.value)} placeholder="Why you’re a great fit (optional)" /></div>
          {siteKey && <TurnstileWidget ref={turnstileRef} siteKey={siteKey} action="careers_apply" onVerify={setToken} onExpired={() => setToken('')} />}
          {err && <p className="text-sm text-destructive">{err}</p>}
          <Button className="rounded-full" onClick={submit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Submit application</Button>
        </div>
      </div>
    </div>
  );
}
