// #252 — PUBLIC careers board at /careers/:slug. Anonymous; data from the `hr-careers` edge fn.
// Each role links to its own shareable URL (/careers/:slug/:job) — see PublicJobPage.
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Briefcase, MapPin, Loader2, Globe } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { publicCareersService, type CareersMeta } from '@/services/publicCareersService';
import { CompanyHeader, EMPLOYMENT_LABELS, locationTypeLabel, summarySalary } from './careersShared';

export default function PublicCareersPage() {
  const { slug = '' } = useParams();
  const [meta, setMeta] = useState<CareersMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try { const m = await publicCareersService.meta(slug); if (!cancelled) setMeta(m); }
      catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  useEffect(() => {
    if (meta) document.title = `Careers · ${meta.company_profile.name}`;
  }, [meta]);

  // Group by department so a board with many roles stays scannable (Coder-style sections).
  const groups = useMemo(() => {
    if (!meta) return [];
    const by = new Map<string, typeof meta.jobs>();
    for (const j of meta.jobs) {
      const k = j.department || 'Open roles';
      by.set(k, [...(by.get(k) ?? []), j]);
    }
    return [...by.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [meta]);

  if (loading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error || !meta) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">This careers page isn’t available.</div>;

  const { company_profile: company } = meta;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12">
        <CompanyHeader company={company} />
        <div className="mt-6 mb-10">
          <h2 className="text-3xl font-display font-semibold tracking-tight">Open positions</h2>
          <p className="text-muted-foreground mt-1">
            {meta.jobs.length === 0 ? 'No open positions right now.' : `${meta.jobs.length} role${meta.jobs.length === 1 ? '' : 's'} we’re hiring for.`}
            {company.website && (
              <> <a href={company.website} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-1">
                <Globe className="h-3.5 w-3.5" />Company site
              </a></>
            )}
          </p>
        </div>

        {meta.jobs.length === 0 ? (
          <div className="rounded-2xl border border-border/60 p-12 text-center text-muted-foreground">
            <Briefcase className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No open positions right now. Check back soon.</p>
          </div>
        ) : (
          <div className="space-y-10">
            {groups.map(([dept, jobs]) => (
              <section key={dept}>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">{dept}</h3>
                <div className="space-y-3">
                  {jobs.map((j) => {
                    const salary = summarySalary(j);
                    const locType = locationTypeLabel(j);
                    return (
                      <Link
                        key={j.id}
                        to={`/careers/${slug}/${j.slug || j.id}`}
                        className="block rounded-2xl border border-border/60 p-5 hover:border-primary/40 hover:shadow-sm transition-all"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-lg font-medium">{j.title}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                              {(j.location || locType) && (
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3.5 w-3.5" />{[j.location, locType].filter(Boolean).join(' · ')}
                                </span>
                              )}
                              {j.employment_type && <span>{EMPLOYMENT_LABELS[j.employment_type] ?? j.employment_type}</span>}
                              {j.level && <span>{j.level}</span>}
                            </div>
                          </div>
                          {salary && <Badge variant="secondary" className="shrink-0">{salary}</Badge>}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
