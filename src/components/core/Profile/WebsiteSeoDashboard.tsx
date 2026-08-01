import React, { useEffect, useState } from 'react';
import {
  ArrowLeft, Globe, ExternalLink, RefreshCw, Loader2, FileText, Search,
  FlaskConical, Radar, AlertTriangle, LineChart, Gauge, TrendingUp,
} from 'lucide-react';
import { WebsiteGscPanel } from '@/components/core/Profile/WebsiteGscPanel';
import { WebsiteHealthPanel } from '@/components/core/Profile/WebsiteHealthPanel';
import { WebsiteDomainIntelPanel } from '@/components/core/Profile/WebsiteDomainIntelPanel';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import {
  userWebsitesService,
  type UserWebsite,
  type WebsiteSeoOverview,
  type SeoArticleRow,
  type SeoKeywordResearchRow,
  type SeoResearchRunRow,
  type SeoTrackedDomainRow,
} from '@/services/userWebsitesService';
import SEOArticleViewer from '@/components/features/ai/SEOArticleViewer';

function timeAgo(iso: string | null): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-500',
  researching: 'text-amber-600 dark:text-amber-400',
  writing: 'text-amber-600 dark:text-amber-400',
  planning: 'text-amber-600 dark:text-amber-400',
  analyzing: 'text-amber-600 dark:text-amber-400',
};

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="dashboard-card">
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export const WebsiteSeoDashboard: React.FC<{ website: UserWebsite; onBack: () => void; initialTab?: string }> = ({ website, onBack, initialTab }) => {
  const { toast } = useToast();
  const [tab, setTab] = useState(initialTab || 'articles');
  const [overview, setOverview] = useState<WebsiteSeoOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [recrawling, setRecrawling] = useState(false);

  const [articles, setArticles] = useState<SeoArticleRow[]>([]);
  const [research, setResearch] = useState<SeoKeywordResearchRow[]>([]);
  const [runs, setRuns] = useState<SeoResearchRunRow[]>([]);
  const [domains, setDomains] = useState<SeoTrackedDomainRow[]>([]);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ov, ar, kr, rr, td] = await Promise.all([
        userWebsitesService.overview(website.id),
        userWebsitesService.articles(website.id),
        userWebsitesService.keywordResearch(website.id),
        userWebsitesService.toolkitRuns(website.id),
        userWebsitesService.trackedDomains(website.id),
      ]);
      setOverview(ov);
      setArticles(ar);
      setResearch(kr);
      setRuns(rr);
      setDomains(td);
    } catch (e: any) {
      toast({ title: 'Failed to load dashboard', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  const handleRecrawl = async () => {
    setRecrawling(true);
    try {
      const result = await userWebsitesService.crawl(website.id);
      toast({ title: 'Crawl complete', description: `${result.pages_indexed} of ${result.pages_discovered} pages indexed` });
      loadAll();
    } catch (e: any) {
      toast({ title: 'Crawl failed', description: e.message, variant: 'destructive' });
    } finally {
      setRecrawling(false);
    }
  };

  const domainLabel = website.display_name || website.url.replace(/^https?:\/\//, '');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} title="Back to websites">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">{domainLabel}</h2>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              <a href={website.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 hover:text-foreground min-w-0">
                <span className="truncate max-w-[280px]">{website.url}</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>
              <span>·</span>
              <span>{website.page_count} pages indexed</span>
              <span>·</span>
              <span>Last crawl: {timeAgo(website.last_crawled_at)}</span>
            </div>
          </div>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={handleRecrawl} disabled={recrawling}>
          {recrawling ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
          Recrawl
        </Button>
      </div>

      {website.last_crawl_error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/5 border border-red-500/20 text-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
          <span className="break-all">{website.last_crawl_error}</span>
        </div>
      )}

      {/* Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Articles" value={loading ? '—' : overview?.articles.total ?? 0} />
        <Stat label="Keyword research" value={loading ? '—' : overview?.keyword_research.total ?? 0} />
        <Stat label="Toolkit runs" value={loading ? '—' : overview?.toolkit_runs.total ?? 0} />
        <Stat label="Tracked domains" value={loading ? '—' : overview?.tracked_domains.total ?? 0} />
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="bg-muted">
          <TabsTrigger value="articles" className="gap-1"><FileText className="w-3.5 h-3.5" /> Articles</TabsTrigger>
          <TabsTrigger value="research" className="gap-1"><Search className="w-3.5 h-3.5" /> Keyword Research</TabsTrigger>
          <TabsTrigger value="runs" className="gap-1"><FlaskConical className="w-3.5 h-3.5" /> Toolkit Runs</TabsTrigger>
          <TabsTrigger value="domains" className="gap-1"><Radar className="w-3.5 h-3.5" /> Domain Audits</TabsTrigger>
          <TabsTrigger value="gsc" className="gap-1"><LineChart className="w-3.5 h-3.5" /> Search Performance</TabsTrigger>
          <TabsTrigger value="rankings" className="gap-1"><TrendingUp className="w-3.5 h-3.5" /> Rankings &amp; Links</TabsTrigger>
          <TabsTrigger value="health" className="gap-1"><Gauge className="w-3.5 h-3.5" /> Site Health</TabsTrigger>
        </TabsList>

        {/* Articles */}
        <TabsContent value="articles">
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle>SEO Articles</CardTitle>
              <CardDescription>Articles generated for this website. Click one to open the full viewer.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : articles.length === 0 ? (
                <Empty text="No articles generated for this site yet. Ask the JARVIS agent to write one." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Keyword</TableHead>
                      <TableHead className="text-right">SEO</TableHead>
                      <TableHead className="text-right">Words</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {articles.map((a) => (
                      <TableRow
                        key={a.id}
                        className="cursor-pointer"
                        // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                        // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                        // row is invalid ARIA and yields a focus stop with no name. (audit #302 finding 3)
                        onClick={() => setOpenArticleId(a.id)}
                      >
                        <TableCell className="font-medium max-w-[280px] truncate">
                          <button type="button" onClick={(e) => { e.stopPropagation(); setOpenArticleId(a.id); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{a.title || a.target_keyword}</button>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[180px] truncate">{a.target_keyword}</TableCell>
                        <TableCell className="text-right">{a.seo_score ?? '—'}</TableCell>
                        <TableCell className="text-right">{a.word_count?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className={STATUS_COLOR[a.status] || 'text-muted-foreground'}>{a.status}</TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(a.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keyword Research */}
        <TabsContent value="research">
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle>Keyword Research</CardTitle>
              <CardDescription>DataForSEO keyword-research passes filed under this website.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : research.length === 0 ? (
                <Empty text="No keyword research filed under this site yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Target keyword</TableHead>
                      <TableHead>Topic</TableHead>
                      <TableHead className="text-right">Keywords</TableHead>
                      <TableHead className="text-right">Volume</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {research.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium max-w-[220px] truncate">{r.target_keyword}</TableCell>
                        <TableCell className="text-muted-foreground max-w-[220px] truncate">{r.topic}</TableCell>
                        <TableCell className="text-right">{r.total_keywords_found?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className="text-right">{r.total_addressable_volume?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Toolkit Runs */}
        <TabsContent value="runs">
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle>Toolkit Runs</CardTitle>
              <CardDescription>SEO research + audit passes the agent and toolkit ran for this website.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : runs.length === 0 ? (
                <Empty text="No toolkit runs filed under this site yet." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Subject</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Country</TableHead>
                      <TableHead>Result</TableHead>
                      <TableHead>Ran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runs.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium max-w-[240px] truncate">{r.label || r.subject}</TableCell>
                        <TableCell className="text-muted-foreground">{r.kind}</TableCell>
                        <TableCell className="text-muted-foreground">{r.country_code || '—'}</TableCell>
                        <TableCell className={r.success ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}>
                          {r.success ? 'success' : 'failed'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Domain Audits */}
        <TabsContent value="domains">
          <Card className="dashboard-card">
            <CardHeader>
              <CardTitle>Domain Audits</CardTitle>
              <CardDescription>Scheduled domain-rank tracking for this website's domain.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <Loading />
              ) : domains.length === 0 ? (
                <Empty text="This website's domain isn't tracked for scheduled audits yet. Ask the agent to run a site review to start." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Domain</TableHead>
                      <TableHead className="text-right">Rank</TableHead>
                      <TableHead className="text-right">Organic traffic</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last audit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {domains.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell className="font-medium">{d.display_label || d.domain}</TableCell>
                        <TableCell className="text-right">{d.current_domain_rank ?? '—'}</TableCell>
                        <TableCell className="text-right">{d.current_organic_traffic?.toLocaleString() ?? '—'}</TableCell>
                        <TableCell className={d.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                          {d.is_active ? 'active' : 'paused'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{timeAgo(d.last_audited_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Search Performance (Google Search Console) */}
        <TabsContent value="gsc">
          <WebsiteGscPanel website={website} />
        </TabsContent>

        {/* Rankings & Links (DataForSEO domain intel) */}
        <TabsContent value="rankings">
          <WebsiteDomainIntelPanel website={website} />
        </TabsContent>

        {/* Site Health (Lighthouse + on-page) */}
        <TabsContent value="health">
          <WebsiteHealthPanel website={website} />
        </TabsContent>
      </Tabs>

      {/* Article viewer */}
      <Dialog open={!!openArticleId} onOpenChange={(o) => { if (!o) setOpenArticleId(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {openArticleId && <SEOArticleViewer articleId={openArticleId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Loading() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="text-center py-12 text-sm text-muted-foreground">{text}</div>;
}

export default WebsiteSeoDashboard;
