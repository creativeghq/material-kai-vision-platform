import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, ExternalLink, Layers, Loader2, Radar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { useEntitlements } from '@/hooks/useEntitlements';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { timeAgo } from '@/utils/datetime';
import { safeHref } from '@/utils/safeUrl';
import {
  signalsService, SIGNAL_KIND_MODULE,
  type CompanySignalsOverview,
} from '@/services/signalsService';

const DISCOVERY_COPY: Record<string, string> = {
  pending: 'We have not read this company website yet. It is in the queue and is checked within about two days.',
  none: 'We read the website and found no job board or careers page we can follow.',
  unreadable: 'The homepage carried almost no links, which usually means it is built in JavaScript. We could not read it.',
  unreachable: 'We could not load the website — it refused our request or did not answer. We will try again.',
  found: '',
};

function SourceLink({ url }: { url: string | null | undefined }) {
  const href = safeHref(url, '');
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
      Source <ExternalLink className="h-3 w-3" />
    </a>
  );
}

function SectionCard({ icon: Icon, title, subtitle, children }: {
  icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm"><Icon className="h-4 w-4 text-muted-foreground" />{title}</CardTitle>
        <CardDescription>{subtitle}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function NotEntitled({ slug, name }: { slug: string; name: string }) {
  return <ModuleTabGate moduleSlug={slug} moduleName={name}><span /></ModuleTabGate>;
}

export function CompanySignalsPanel({ website }: { website: string | null | undefined }) {
  const { activeWorkspaceId } = useWorkspace();
  const { isModuleAvailable, loading: entLoading } = useEntitlements();
  const [data, setData] = useState<CompanySignalsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const anyEntitled = Object.values(SIGNAL_KIND_MODULE).some((slug) => isModuleAvailable(slug));

  useEffect(() => {
    if (!activeWorkspaceId || !website || entLoading || !anyEntitled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    signalsService.companyOverview(activeWorkspaceId, website)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeWorkspaceId, website, entLoading, anyEntitled]);

  if (entLoading) return null;
  if (!anyEntitled) {
    return (
      <ModuleTabGate moduleSlug="signals-hiring" moduleName="Hiring Signals"
        blurb="See when this company starts hiring, which technologies it runs and what it is shopping for — read from its own job board and website.">
        <span />
      </ModuleTabGate>
    );
  }
  if (!website) {
    return (
      <Card><CardContent className="p-0">
        <HubEmptyState icon={Radar} title="No website on this company"
          description="Signals are read from a company's own website and job board. Add the website under Details and it is picked up on the next pass." />
      </CardContent></Card>
    );
  }
  if (loading && !data) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Reading signals…</div>;
  }
  if (error) {
    return <Card><CardContent className="p-0"><HubEmptyState icon={Radar} title="Could not load signals" description={error} /></CardContent></Card>;
  }
  if (!data) return null;

  const profile = data.profile;
  const discovery = profile?.ats_check_status ?? 'pending';
  const roles = data.hiring.open_roles ?? [];
  const techs = data.technologies.items ?? [];
  const intents = data.intents.items ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">What we read</CardTitle>
          <CardDescription>
            {data.domain}
            {profile?.ats_checked_at ? ` · checked ${timeAgo(profile.ats_checked_at)}` : ''}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {DISCOVERY_COPY[discovery] ? <p className="text-muted-foreground">{DISCOVERY_COPY[discovery]}</p> : null}
          {profile?.ats_check_error ? <p className="text-xs text-muted-foreground">Last error: {profile.ats_check_error}</p> : null}
          <div className="flex flex-wrap items-center gap-2">
            {safeHref(profile?.careers_url, '') ? (
              <Button asChild variant="outline" size="sm">
                <a href={safeHref(profile?.careers_url, '')} target="_blank" rel="noopener noreferrer">Careers page <ExternalLink className="ml-1 h-3 w-3" /></a>
              </Button>
            ) : null}
            {data.boards.map((b) => (
              <Badge key={b.provider} variant={b.status === 'active' ? 'success' : 'neutral'}>
                {b.provider}{b.status === 'unsupported' ? ' · not readable yet' : b.status === 'dead' ? ' · gone' : ''}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {data.hiring.status === 'not_entitled' ? <NotEntitled slug="signals-hiring" name="Hiring Signals" /> : (
        <SectionCard icon={Briefcase} title="Open roles"
          subtitle={`${data.hiring.open_count ?? 0} open · ${data.hiring.opened_30d ?? 0} opened and ${data.hiring.closed_30d ?? 0} closed in 30 days`}>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {data.boards.some((b) => b.status === 'active') ? 'Their job board is read daily and has no open roles.' : 'No job board we can read, so we cannot see their hiring.'}
            </p>
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead><tr className="border-b border-hairline text-left text-[11px] font-semibold text-muted-foreground">
                  <th className="py-2 pr-3">Role</th><th className="py-2 pr-3">Location</th><th className="py-2 pr-3">Team</th><th className="py-2 pr-3">First seen</th><th className="py-2"><span className="sr-only">Source</span></th>
                </tr></thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.url} className="border-b border-hairline last:border-0">
                      <td className="py-2 pr-3">{r.title}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.location ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{r.department ?? '—'}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{timeAgo(r.first_seen_at)}</td>
                      <td className="py-2 text-right"><SourceLink url={r.url} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      )}

      {data.technologies.status === 'not_entitled' ? <NotEntitled slug="signals-technographics" name="Technology Signals" /> : (
        <SectionCard icon={Layers} title="Technologies" subtitle="Named in their job ads or found in their homepage code">
          {techs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {discovery === 'pending' ? 'Not read yet.' : 'Nothing from our dictionary was found in what we could read.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {techs.map((t) => (
                <span key={`${t.slug}-${t.evidence}`} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline px-2 py-1 text-xs">
                  <span className="font-medium">{t.name}</span>
                  <span className="text-muted-foreground">{t.evidence === 'website_html' ? 'website' : 'job ad'}</span>
                  <SourceLink url={t.evidence_url} />
                </span>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {data.intents.status === 'not_entitled' ? <NotEntitled slug="signals-intent" name="Intent Signals" /> : (
        <SectionCard icon={Radar} title="Buying intent" subtitle="Use cases their own job ads say they are working on">
          {intents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No intent phrases in their open job ads.</p>
          ) : (
            <ul className="space-y-2">
              {intents.map((i, idx) => (
                <li key={`${i.intent}-${idx}`} className="text-sm">
                  <div className="flex items-center gap-2"><Badge variant="info">{i.label}</Badge><SourceLink url={i.evidence_url} /></div>
                  {i.matched_text ? <p className="mt-1 text-xs text-muted-foreground">“{i.matched_text}”</p> : null}
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      )}

      <p className="text-xs text-muted-foreground">
        Watch companies like this one continuously from <Link to="/signals" className="text-primary hover:underline">Signals</Link>.
      </p>
    </div>
  );
}
