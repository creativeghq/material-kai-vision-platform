/**
 * CompanySEOPanel — SEO health card mounted on CompanyDetailPage.
 *
 * If the CRM company row has a website set, this panel:
 *   1. Normalises website → bare domain (strip protocol, trailing path)
 *   2. Looks up the user's seo_tracked_domains row (if any) for that domain
 *   3. Renders denormalised current_* metrics inline (rank, keywords,
 *      traffic, referring domains, backlinks)
 *   4. Provides a "Track domain" button that creates a tracked_domain row
 *      and fires the first audit
 *   5. Provides a "Re-audit" button on tracked rows
 *   6. Provides "Open in chat" links for keyword research / brand audit
 *
 * Lazily imported by CompanyDetailPage so non-SEO users don't pay the bundle
 * cost. Falls back to an "Add a website to enable SEO" empty state when
 * company.website is null.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, ExternalLink, TrendingUp, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  listTrackedDomains, createTrackedDomain, triggerAuditNow, listAuditHistory,
  type SeoTrackedDomain, type SeoDomainAuditSnapshot,
} from '@/services/seoToolkitApi';

interface Props {
  companyId: string;
  companyName: string;
  website?: string | null;
  countryCode?: string | null;
}

const fmtNum = (n: any): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

function normaliseDomain(website: string): string {
  return website.trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

const CompanySEOPanel: React.FC<Props> = ({ companyName, website, countryCode }) => {
  const { toast } = useToast();
  const [tracked, setTracked] = useState<SeoTrackedDomain | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [history, setHistory] = useState<SeoDomainAuditSnapshot[]>([]);

  const domain = useMemo(() => website ? normaliseDomain(website) : null, [website]);

  const load = useCallback(async () => {
    if (!domain) {
      setTracked(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const all = await listTrackedDomains();
      const match = all.find((d) => d.domain === domain) || null;
      setTracked(match);
      if (match) {
        const h = await listAuditHistory(match.id, 10);
        setHistory(h);
      }
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [domain, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleTrack = async () => {
    if (!domain) return;
    setAuditing(true);
    try {
      const row = await createTrackedDomain({
        domain,
        display_label: companyName,
        country_code: countryCode || null,
        language_code: 'en',
        audit_cadence_hours: 168,
      });
      // Fire first audit
      await triggerAuditNow(row.id);
      toast({ title: 'Domain tracked', description: `${domain} now under monitoring.` });
      await load();
    } catch (e: any) {
      toast({ title: 'Track failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setAuditing(false);
    }
  };

  const handleReaudit = async () => {
    if (!tracked) return;
    setAuditing(true);
    try {
      const r = await triggerAuditNow(tracked.id);
      if (!r.ok) {
        toast({ title: 'Audit failed', description: r.error || 'unknown', variant: 'destructive' });
      } else {
        toast({ title: 'Re-audited', description: domain || '' });
        await load();
      }
    } finally {
      setAuditing(false);
    }
  };

  if (!website || !domain) {
    return (
      <Card className="dashboard-card">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Search className="h-4 w-4 text-primary" /> SEO Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add a website to this company in the Overview tab to enable SEO monitoring.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" /> SEO Health — {domain}
            </CardTitle>
            {tracked && (
              <div className="text-xs text-muted-foreground mt-1">
                Last audited {tracked.last_audited_at ? new Date(tracked.last_audited_at).toLocaleString() : 'never'}
                {' · '}
                cadence every {tracked.audit_cadence_hours}h
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {tracked ? (
              <Button
                size="sm" variant="outline" onClick={handleReaudit}
                disabled={auditing} className="rounded-full text-xs">
                <RefreshCw className={`h-3 w-3 mr-1 ${auditing ? 'animate-spin' : ''}`} />
                Re-audit
              </Button>
            ) : (
              <Button
                size="sm" onClick={handleTrack}
                disabled={auditing || loading} className="rounded-full text-xs">
                <Plus className="h-3 w-3 mr-1" />
                {auditing ? 'Auditing...' : 'Track domain'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading && !tracked ? (
            <div className="text-sm text-muted-foreground">Loading...</div>
          ) : !tracked ? (
            <div className="text-sm text-muted-foreground">
              Domain not yet tracked. Click "Track domain" to enrol it in
              persistent monitoring (DataForSEO Domain Rank Overview + ranking
              keywords + competitors + backlinks). First audit fires immediately.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <Stat label="Domain rank" value={tracked.current_domain_rank} />
                <Stat label="Ranking kw" value={fmtNum(tracked.current_ranking_keywords)} />
                <Stat label="Est. traffic" value={fmtNum(tracked.current_organic_traffic)} />
                <Stat label="Ref domains" value={fmtNum(tracked.current_referring_domains)} />
                <Stat label="Backlinks" value={fmtNum(tracked.current_backlinks)} />
              </div>

              {history.length > 1 && (
                <div className="bg-white/5 rounded p-3 border border-white/10">
                  <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Recent audits
                  </div>
                  <div className="space-y-1">
                    {history.slice(0, 5).map((s) => (
                      <div key={s.id} className="flex justify-between text-xs">
                        <span className="text-white/70">{new Date(s.audited_at).toLocaleDateString()}</span>
                        <span className="text-white/50">
                          rank {s.domain_rank ?? '—'} · {fmtNum(s.ranking_keywords)} kw · {fmtNum(s.organic_traffic)} traffic
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2 text-xs">
                <a
                  href={`/admin/seo`}
                  className="text-primary hover:underline inline-flex items-center gap-1">
                  Open in dashboard <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-muted-foreground">·</span>
                <a
                  href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Run a brand search audit for "${companyName}"`)}`}
                  className="text-primary hover:underline inline-flex items-center gap-1">
                  Brand-search audit <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-muted-foreground">·</span>
                <a
                  href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Show top backlinks for ${domain}`)}`}
                  className="text-primary hover:underline inline-flex items-center gap-1">
                  Backlinks deep-dive <ExternalLink className="h-3 w-3" />
                </a>
                <span className="text-muted-foreground">·</span>
                <a
                  href={`/agent-hub?agent=kai&q=${encodeURIComponent(`What does ${domain} rank for?`)}`}
                  className="text-primary hover:underline inline-flex items-center gap-1">
                  Ranking keywords <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: any }> = ({ label, value }) => (
  <div className="bg-white/5 rounded p-2 border border-white/10">
    <div className="text-[10px] text-muted-foreground">{label}</div>
    <div className="text-lg font-medium">{value ?? '—'}</div>
  </div>
);

export default CompanySEOPanel;
