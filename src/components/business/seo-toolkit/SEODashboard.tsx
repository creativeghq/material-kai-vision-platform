/**
 * SEODashboard — admin landing page for the SEO toolkit at /admin/seo.
 *
 * Four tabs, each backed by the seoToolkitApi service:
 *   1. Keyword Research — history of every chat-driven research run, with
 *      starred / labelled / re-render-from-history actions.
 *   2. Domain Audit — list of tracked domains with denormalised current_*
 *      metrics + per-domain trendline + manual re-audit button.
 *   3. Backlinks — focused view of backlink-related metrics across tracked
 *      domains (referring domains count + spam score trend).
 *   4. Competitive Intel — multi-domain matrix view (your-brands × top
 *      competitors × shared-keyword count) computed on demand.
 *
 * Every "fire a fresh call" action goes through the same agent-tools surface
 * we already shipped — this page just persists / displays / re-runs.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Plus, Star, Trash2, ExternalLink, TrendingUp, Globe2, Link2, Target, Waypoints } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  listResearchRuns, listTrackedDomains, listAuditHistory,
  createTrackedDomain, deleteTrackedDomain, updateTrackedDomain,
  setResearchRunStarred, deleteResearchRun, triggerAuditNow,
  getDashboardStats,
  type SeoResearchRun, type SeoTrackedDomain, type SeoDomainAuditSnapshot,
} from '@/services/seoToolkitApi';
import { SeoInterlinkingPanel } from '@/modules/seo-interlinking/pages/SeoInterlinkingModulePage';

const fmtNum = (n: any): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

// ───────────────────────────────────────────────────────────────────
// Dashboard root
// ───────────────────────────────────────────────────────────────────

const SEO_INNER_TABS = new Set(['research', 'domains', 'backlinks', 'competitive', 'interlinking']);

export const SEODashboardPanel: React.FC = () => {
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [stats, setStats] = useState<{ research_run_count_30d: number; tracked_domain_count: number; total_audit_cost_30d: number; starred_count: number } | null>(null);

  // Inner-tab selection is mirrored into ?seotab= so the legacy
  // /admin/modules/seo-interlinking redirect can deep-link straight to the
  // Inter-linking sub-tab (it now lives under SEO Toolkit).
  const requestedSeoTab = searchParams.get('seotab') || '';
  const activeSeoTab = SEO_INNER_TABS.has(requestedSeoTab) ? requestedSeoTab : 'research';
  const handleSeoTabChange = useCallback((value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value === 'research') next.delete('seotab');
    else next.set('seotab', value);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const loadStats = useCallback(async () => {
    try {
      const s = await getDashboardStats();
      setStats(s);
    } catch (e: any) {
      toast({ title: 'Stats load failed', description: String(e?.message || e), variant: 'destructive' });
    }
  }, [toast]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          DataForSEO-powered keyword research, domain audits, backlinks, and competitive intel.
          Fire a research call from <a href="/agent-hub" className="text-primary hover:underline">KAI chat</a> or
          persistent monitoring below.
        </p>
        <Button onClick={loadStats} variant="outline" className="rounded-full">
          <RefreshCw className="h-3 w-3 mr-1" /> Refresh stats
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Research runs (30d)</div>
          <div className="text-3xl font-medium">{stats?.research_run_count_30d ?? '—'}</div>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Tracked domains</div>
          <div className="text-3xl font-medium">{stats?.tracked_domain_count ?? '—'}</div>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">DataForSEO spend (30d)</div>
          <div className="text-3xl font-medium">${(stats?.total_audit_cost_30d ?? 0).toFixed(2)}</div>
        </CardContent></Card>
        <Card className="dashboard-card"><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Starred research</div>
          <div className="text-3xl font-medium">{stats?.starred_count ?? '—'}</div>
        </CardContent></Card>
      </div>

      <Tabs value={activeSeoTab} onValueChange={handleSeoTabChange}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          <TabsTrigger value="research" className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" /> Keyword Research
          </TabsTrigger>
          <TabsTrigger value="domains" className="flex items-center gap-2">
            <Globe2 className="h-3.5 w-3.5" /> Domain Audit
          </TabsTrigger>
          <TabsTrigger value="backlinks" className="flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5" /> Backlinks
          </TabsTrigger>
          <TabsTrigger value="competitive" className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5" /> Competitive Intel
          </TabsTrigger>
          <TabsTrigger value="interlinking" className="flex items-center gap-2">
            <Waypoints className="h-3.5 w-3.5" /> Inter-linking
          </TabsTrigger>
        </TabsList>

        <TabsContent value="research" className="mt-4">
          <KeywordResearchTab />
        </TabsContent>
        <TabsContent value="domains" className="mt-4">
          <DomainAuditTab onChange={loadStats} />
        </TabsContent>
        <TabsContent value="backlinks" className="mt-4">
          <BacklinksTab />
        </TabsContent>
        <TabsContent value="competitive" className="mt-4">
          <CompetitiveIntelTab />
        </TabsContent>
        <TabsContent value="interlinking" className="mt-4">
          <SeoInterlinkingPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SEODashboardPanel;

// ───────────────────────────────────────────────────────────────────
// Tab 1 — Keyword Research history
// ───────────────────────────────────────────────────────────────────

const KeywordResearchTab: React.FC = () => {
  const { toast } = useToast();
  const [runs, setRuns] = useState<SeoResearchRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'starred'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listResearchRuns({
        starredOnly: filter === 'starred',
        limit: 200,
      });
      setRuns(data);
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, filter]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    if (!search) return runs;
    const q = search.toLowerCase();
    return runs.filter((r) =>
      r.subject.toLowerCase().includes(q) ||
      (r.label && r.label.toLowerCase().includes(q)) ||
      r.kind.toLowerCase().includes(q),
    );
  }, [runs, search]);

  const handleStar = async (run: SeoResearchRun) => {
    try {
      await setResearchRunStarred(run.id, !run.starred);
      setRuns((prev) => prev.map((r) => r.id === run.id ? { ...r, starred: !r.starred } : r));
    } catch (e: any) {
      toast({ title: 'Update failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const handleDelete = async (run: SeoResearchRun) => {
    if (!confirm(`Delete "${run.subject}"?`)) return;
    try {
      await deleteResearchRun(run.id);
      setRuns((prev) => prev.filter((r) => r.id !== run.id));
    } catch (e: any) {
      toast({ title: 'Delete failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  return (
    <Card className="dashboard-card">
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-sm">Research history</CardTitle>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant={filter === 'all' ? 'default' : 'outline'}
            onClick={() => setFilter('all')} className="rounded-full text-xs">
            All
          </Button>
          <Button
            size="sm" variant={filter === 'starred' ? 'default' : 'outline'}
            onClick={() => setFilter('starred')} className="rounded-full text-xs">
            Starred
          </Button>
          <Input
            placeholder="Search subject / label / kind..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {loading ? 'Loading...' : (
              runs.length === 0
                ? 'No research yet. Open KAI chat and try "research the keyword X".'
                : 'No matches.'
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <div key={r.id} className="p-4 hover:bg-white/5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-[10px]">{r.kind}</Badge>
                      {r.country_code && <Badge className="text-[10px] bg-white/10">{r.country_code}</Badge>}
                      {r.success ? null : <Badge className="text-[10px] bg-red-500/20 text-red-300 border-red-500/40">Failed</Badge>}
                      <span className="font-medium text-sm truncate">{r.label || r.subject}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-x-4">
                      <span>{new Date(r.created_at).toLocaleString()}</span>
                      <span>cost: ${r.cost_usd.toFixed(4)}</span>
                      {r.latency_ms != null && <span>{r.latency_ms}ms</span>}
                    </div>
                    {r.error_message && (
                      <div className="text-xs text-red-300 mt-1">{r.error_message.slice(0, 200)}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => handleStar(r)} className="h-8 w-8 p-0">
                      <Star className={`h-4 w-4 ${r.starred ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(r)} className="h-8 w-8 p-0">
                      <Trash2 className="h-4 w-4 text-red-400" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ───────────────────────────────────────────────────────────────────
// Tab 2 — Domain Audit
// ───────────────────────────────────────────────────────────────────

const DomainAuditTab: React.FC<{ onChange?: () => void }> = ({ onChange }) => {
  const { toast } = useToast();
  const [domains, setDomains] = useState<SeoTrackedDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [auditingId, setAuditingId] = useState<string | null>(null);
  const [selectedDomain, setSelectedDomain] = useState<SeoTrackedDomain | null>(null);
  const [auditHistory, setAuditHistory] = useState<SeoDomainAuditSnapshot[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDomains(await listTrackedDomains());
    } catch (e: any) {
      toast({ title: 'Load failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleAuditNow = async (d: SeoTrackedDomain) => {
    setAuditingId(d.id);
    try {
      const result = await triggerAuditNow(d.id);
      if (!result.ok) {
        toast({ title: 'Audit failed', description: result.error || 'unknown', variant: 'destructive' });
        return;
      }
      toast({ title: 'Audit complete', description: `${d.domain} re-audited.` });
      await load();
      onChange?.();
    } catch (e: any) {
      toast({ title: 'Audit failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setAuditingId(null);
    }
  };

  const handleDelete = async (d: SeoTrackedDomain) => {
    if (!confirm(`Stop tracking "${d.domain}"?`)) return;
    try {
      await deleteTrackedDomain(d.id);
      await load();
      onChange?.();
    } catch (e: any) {
      toast({ title: 'Delete failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  const openHistory = async (d: SeoTrackedDomain) => {
    setSelectedDomain(d);
    try {
      setAuditHistory(await listAuditHistory(d.id, 30));
    } catch (e: any) {
      toast({ title: 'History load failed', description: String(e?.message || e), variant: 'destructive' });
    }
  };

  return (
    <>
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm">Tracked domains</CardTitle>
          <Button onClick={() => setShowAdd(true)} size="sm" className="rounded-full">
            <Plus className="h-3 w-3 mr-1" /> Track domain
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {domains.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              {loading ? 'Loading...' : 'No tracked domains. Add one to start persistent monitoring.'}
            </div>
          ) : (
            <div className="divide-y divide-border">
              {domains.map((d) => (
                <div key={d.id} className="p-4 hover:bg-white/5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {d.is_active ? (
                          <Badge className="text-[10px] bg-green-500/20 text-green-300 border-green-500/40">Active</Badge>
                        ) : (
                          <Badge className="text-[10px] bg-gray-500/20 text-gray-300">Inactive</Badge>
                        )}
                        {d.country_code && <Badge variant="outline" className="text-[10px]">{d.country_code}</Badge>}
                        <span className="font-medium text-sm truncate">{d.display_label || d.domain}</span>
                        {d.display_label && (
                          <span className="text-xs text-muted-foreground">· {d.domain}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground space-x-4">
                        <span>rank: <strong>{d.current_domain_rank ?? '—'}</strong></span>
                        <span>kw: <strong>{fmtNum(d.current_ranking_keywords)}</strong></span>
                        <span>traffic: <strong>{fmtNum(d.current_organic_traffic)}</strong></span>
                        <span>refs: <strong>{fmtNum(d.current_referring_domains)}</strong></span>
                        <span>links: <strong>{fmtNum(d.current_backlinks)}</strong></span>
                        <span>last: {d.last_audited_at ? new Date(d.last_audited_at).toLocaleDateString() : 'never'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm" variant="outline"
                        onClick={() => handleAuditNow(d)}
                        disabled={auditingId === d.id}
                        className="rounded-full text-xs">
                        <RefreshCw className={`h-3 w-3 mr-1 ${auditingId === d.id ? 'animate-spin' : ''}`} />
                        Audit
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openHistory(d)} className="rounded-full text-xs">
                        <TrendingUp className="h-3 w-3 mr-1" /> History
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(d)} className="h-8 w-8 p-0">
                        <Trash2 className="h-4 w-4 text-red-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddDomainDialog
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { void load(); onChange?.(); }}
      />

      <Dialog open={!!selectedDomain} onOpenChange={(o) => !o && setSelectedDomain(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDomain?.display_label || selectedDomain?.domain} — audit history
            </DialogTitle>
          </DialogHeader>
          {auditHistory.length === 0 ? (
            <div className="text-sm text-muted-foreground p-4">No audit history yet.</div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {auditHistory.map((s) => (
                <div key={s.id} className="bg-white/5 rounded p-3 border border-white/10">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-muted-foreground">
                      {new Date(s.audited_at).toLocaleString()} · {s.source}
                    </div>
                    <div className="text-xs text-muted-foreground">${s.cost_usd.toFixed(4)}</div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-2 text-xs">
                    <div><div className="text-[10px] text-white/60">Domain rank</div><div className="font-medium">{s.domain_rank ?? '—'}</div></div>
                    <div><div className="text-[10px] text-white/60">Ranking kw</div><div className="font-medium">{fmtNum(s.ranking_keywords)}</div></div>
                    <div><div className="text-[10px] text-white/60">Traffic</div><div className="font-medium">{fmtNum(s.organic_traffic)}</div></div>
                    <div><div className="text-[10px] text-white/60">Ref domains</div><div className="font-medium">{fmtNum(s.referring_domains)}</div></div>
                    <div><div className="text-[10px] text-white/60">Backlinks</div><div className="font-medium">{fmtNum(s.backlinks)}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};

// ───────────────────────────────────────────────────────────────────
// Add domain dialog
// ───────────────────────────────────────────────────────────────────

const AddDomainDialog: React.FC<{ open: boolean; onClose: () => void; onAdded: () => void }> = ({ open, onClose, onAdded }) => {
  const { toast } = useToast();
  const [domain, setDomain] = useState('');
  const [label, setLabel] = useState('');
  const [country, setCountry] = useState('US');
  const [language, setLanguage] = useState('en');
  const [cadence, setCadence] = useState(168);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!domain.trim()) {
      toast({ title: 'Domain required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await createTrackedDomain({
        domain,
        display_label: label || null,
        country_code: country || null,
        language_code: language,
        audit_cadence_hours: cadence,
      });
      toast({ title: 'Domain added', description: `${domain} now tracked.` });
      setDomain(''); setLabel(''); setCountry('US'); setLanguage('en'); setCadence(168);
      onAdded();
      onClose();
    } catch (e: any) {
      toast({ title: 'Add failed', description: String(e?.message || e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track a new domain</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground">Domain</label>
            <Input placeholder="flobali.gr" value={domain} onChange={(e) => setDomain(e.target.value)} />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Display label (optional)</label>
            <Input placeholder="Flobali (main brand)" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-muted-foreground">Country</label>
              <Input placeholder="US" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Language</label>
              <Input placeholder="en" maxLength={5} value={language} onChange={(e) => setLanguage(e.target.value.toLowerCase())} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Cadence (hrs)</label>
              <Input type="number" value={cadence} onChange={(e) => setCadence(parseInt(e.target.value, 10) || 168)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-full">Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="rounded-full">
            {saving ? 'Saving...' : 'Track domain'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

// ───────────────────────────────────────────────────────────────────
// Tab 3 — Backlinks
// ───────────────────────────────────────────────────────────────────

const BacklinksTab: React.FC = () => {
  const [domains, setDomains] = useState<SeoTrackedDomain[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listTrackedDomains();
        if (!cancelled) setDomains(list.filter((d) => d.is_active));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-sm">Backlink overview across tracked domains</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {domains.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {loading ? 'Loading...' : 'Add a tracked domain in the Domain Audit tab to see backlinks here.'}
          </div>
        ) : (
          <div className="divide-y divide-border">
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase text-muted-foreground tracking-wide bg-white/5">
              <div className="col-span-4">Domain</div>
              <div className="col-span-2 text-right">Ref. domains</div>
              <div className="col-span-2 text-right">Backlinks</div>
              <div className="col-span-2 text-right">Last audited</div>
              <div className="col-span-2 text-right">Action</div>
            </div>
            {domains.map((d) => (
              <div key={d.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-xs items-center hover:bg-white/5">
                <div className="col-span-4 truncate font-medium">{d.display_label || d.domain}</div>
                <div className="col-span-2 text-right">{fmtNum(d.current_referring_domains)}</div>
                <div className="col-span-2 text-right">{fmtNum(d.current_backlinks)}</div>
                <div className="col-span-2 text-right text-muted-foreground">
                  {d.last_audited_at ? new Date(d.last_audited_at).toLocaleDateString() : 'never'}
                </div>
                <div className="col-span-2 text-right">
                  <a
                    href={`/agent-hub?agent=kai&q=${encodeURIComponent(`Show me the top backlinks and anchor texts for ${d.domain}`)}`}
                    className="text-primary hover:underline inline-flex items-center gap-1">
                    Drill <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// ───────────────────────────────────────────────────────────────────
// Tab 4 — Competitive Intel
// ───────────────────────────────────────────────────────────────────

const CompetitiveIntelTab: React.FC = () => {
  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="text-sm">Competitive intel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            Cross-domain keyword-gap analysis. Pick two tracked domains in chat to compute a gap matrix:
          </p>
          <div className="bg-white/5 rounded p-3 border border-white/10 font-mono text-xs">
            "find keyword gaps between flobali.gr and carrelagedirect.fr in the UK"
          </div>
          <p className="text-muted-foreground text-xs">
            The result renders as a card in chat and is saved here automatically. A future pass will add a
            multi-domain matrix view here directly. For now, every chat-driven keyword-gap call
            persists into the research history above.
          </p>
          <div className="pt-2">
            <a
              href="/agent-hub?agent=kai&q=find%20keyword%20gaps%20between%20"
              className="text-primary hover:underline text-sm inline-flex items-center gap-1">
              Run keyword-gap analysis in chat <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
