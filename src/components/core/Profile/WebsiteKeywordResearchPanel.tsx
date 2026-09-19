import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, Search, Target, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { KeywordResearchDetail } from '@/components/core/Profile/KeywordResearchDetail';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import {
  userWebsitesService,
  type PageGscQuery,
  type PageKeywordIdeas,
  type SeoKeywordResearchRow,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { Loading, useLaunchQuickStart } from './seo/dashboardPrimitives';

/** Websites -> Content -> Keyword Research. */
export const WebsiteKeywordResearchPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const launchQuickStart = useLaunchQuickStart();
  const siteHost = website.url.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');

  const [research, setResearch] = useState<SeoKeywordResearchRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openResearchId, setOpenResearchId] = useState<string | null>(null);
  const [deletingResearchId, setDeletingResearchId] = useState<string | null>(null);

  // A page title is the keyword its author chose. Suggesting the ones the site neither tracks nor
  // has researched starts "what next" from what the site says it is about, not a blank box.
  const [pageTitles, setPageTitles] = useState<{ url: string; title: string }[]>([]);
  const [tracked, setTracked] = useState<Set<string>>(new Set());
  const [trackingKeywords, setTrackingKeywords] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [kr, titles, trackedSet] = await Promise.allSettled([
        userWebsitesService.keywordResearch(website.id),
        userWebsitesService.pageTitles(website.id),
        userWebsitesService.trackedKeywordStrings(website.id),
      ]);
      if (cancelled) return;
      if (kr.status === 'fulfilled') setResearch(kr.value);
      else toast({ title: 'Could not load keyword research', variant: 'destructive' });
      setPageTitles(titles.status === 'fulfilled' ? titles.value : []);
      setTracked(trackedSet.status === 'fulfilled' ? trackedSet.value : new Set());
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  // Research answers "is this keyword worth it"; the tracker answers "are we winning it". The two
  // were separate boxes with retyping in between.
  const trackKeywords = async (keywords: string[], origin: string) => {
    if (!website.workspace_id) return;
    setTrackingKeywords(origin);
    try {
      const n = await userWebsitesService.addTrackedKeywords(website.id, website.workspace_id, keywords, 'GR', 'el');
      toast({ title: `Tracking ${n} keyword${n === 1 ? '' : 's'}`, description: 'Positions arrive on the next check, under Rank Tracker.' });
      setTracked((prev) => { const next = new Set(prev); keywords.forEach((k) => next.add(k.trim().toLowerCase())); return next; });
    } catch (e: any) {
      toast({ title: 'Could not track them', description: e.message, variant: 'destructive' });
    } finally {
      setTrackingKeywords(null);
    }
  };

  const researched = new Set(research.map((r) => r.target_keyword.trim().toLowerCase()));
  const suggestions = (() => {
    const seen = new Set<string>();
    const out: { keyword: string; url: string }[] = [];
    for (const p of pageTitles) {
      const keyword = p.title.split(/\s+[|\u2013\u2014-]\s+/)[0].replace(/\s+/g, ' ').trim();
      const key = keyword.toLowerCase();
      if (keyword.length < 4 || keyword.length > 80 || seen.has(key)) continue;
      if (tracked.has(key) || researched.has(key)) continue;
      if (/materialshub|materials hub/i.test(keyword)) continue;
      seen.add(key);
      out.push({ keyword, url: p.url });
      if (out.length >= 24) break;
    }
    return out;
  })();

  const researchKeyword = (keyword: string) => {
    const prompt = `Research the keyword "${keyword}" for ${siteHost} in the Greek market (GR, el): search volume, difficulty, what the results page shows, keyword clusters and who ranks now.`;
    navigate(`/agent-hub?agent=kai&prompt=${encodeURIComponent(prompt)}`);
  };

  // Two sources, in order of trust: the queries Google already shows the page for (free, from
  // Search Console rows we hold), then paid keyword ideas seeded from the title (one DataForSEO
  // call, credit-debited by the edge function).
  const [pageQuery, setPageQuery] = useState('');
  const [chosenPage, setChosenPage] = useState<{ url: string; title: string } | null>(null);
  const [pageQueries, setPageQueries] = useState<PageGscQuery[] | null>(null);
  const [pageIdeas, setPageIdeas] = useState<PageKeywordIdeas | null>(null);
  const [ideasBusy, setIdeasBusy] = useState(false);
  const pageMatches = pageQuery.trim().length < 2
    ? []
    : pageTitles
      .filter((p) => p.title.toLowerCase().includes(pageQuery.toLowerCase()) || p.url.toLowerCase().includes(pageQuery.toLowerCase()))
      .slice(0, 8);

  const choosePage = async (p: { url: string; title: string }) => {
    setChosenPage(p);
    setPageQuery(p.title);
    setPageIdeas(null);
    setPageQueries(null);
    try {
      setPageQueries(await userWebsitesService.pageGscQueries(website.id, p.url, 90));
    } catch (e: any) {
      toast({ title: 'Could not read Search Console rows for this page', description: e.message, variant: 'destructive' });
      setPageQueries([]);
    }
  };

  const fetchIdeas = async () => {
    if (!chosenPage) return;
    setIdeasBusy(true);
    try {
      setPageIdeas(await userWebsitesService.pageKeywordIdeas(website.id, chosenPage.url));
    } catch (e: any) {
      toast({ title: 'Could not fetch keyword ideas', description: e.message, variant: 'destructive' });
    } finally {
      setIdeasBusy(false);
    }
  };

  const seedOf = (title: string) => title.split(/\s+[|\u2013\u2014-]\s+/)[0].replace(/\s+/g, ' ').trim();

  const deleteResearch = async (r: SeoKeywordResearchRow) => {
    if (!confirm(`Delete the research for "${r.target_keyword}"? The captured results page goes with it.`)) return;
    setDeletingResearchId(r.id);
    try {
      await userWebsitesService.deleteKeywordResearch(r.id);
      setResearch((rows) => rows.filter((x) => x.id !== r.id));
    } catch (e: any) {
      toast({ title: 'Could not delete it', description: e.message, variant: 'destructive' });
    } finally {
      setDeletingResearchId(null);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
          <CardTitle>Keyword Research</CardTitle>
          <CardDescription>
            Open a run to read the whole results page it captured — AI Overview citations, image and
            local packs, People Also Ask, clusters and who ranks now.
          </CardDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0"
            onClick={() => launchQuickStart('seo-research', 'Research a keyword')}>
            <Plus className="w-3.5 h-3.5 mr-1" />New research
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <Loading />
          ) : research.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No keyword research yet"
              description="A research pass captures the whole results page for a keyword — AI Overview citations, image and local packs, People Also Ask, and who ranks now."
              action={
                <Button size="sm" onClick={() => launchQuickStart('seo-research', 'Research a keyword')}>
                  <Plus className="w-3.5 h-3.5 mr-1" />New research
                </Button>
              }
            />
          ) : (
            <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Target keyword</TableHead>
                  <TableHead>Topic</TableHead>
                  <TableHead className="text-right">Volume</TableHead>
                  <TableHead className="text-right">Difficulty</TableHead>
                  <TableHead className="text-right">CPC</TableHead>
                  <TableHead className="text-right">Competition</TableHead>
                  <TableHead className="text-right">Opportunity</TableHead>
                  <TableHead>Trend</TableHead>
                  <TableHead className="text-right">Related</TableHead>
                  <TableHead className="text-right">Addressable</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Figures are the researched keyword's own (recommendedPrimary); "Related" and
                    "Addressable" describe the expanded set the run found around it. A dash is
                    "the source did not return it" — difficulty is unscored for many Greek terms —
                    never a zero. */}
                {research.map((r) => (
                  <TableRow
                    key={r.id}
                    onClick={() => setOpenResearchId(r.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-medium max-w-[220px] truncate">
                      {r.target_keyword}
                      {r.language_code ? <span className="ml-1 text-[11px] text-muted-foreground">{r.language_code}</span> : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[200px] truncate">{r.topic}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.primary?.search_volume != null ? formatNumber(r.primary.search_volume) : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.primary?.difficulty != null ? r.primary.difficulty : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.primary?.cpc != null ? `$${r.primary.cpc.toFixed(2)}` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.primary?.competition != null ? `${Math.round(r.primary.competition * 100)}%` : '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.primary?.opportunity != null ? r.primary.opportunity : '—'}</TableCell>
                    <TableCell>
                      {r.primary?.trend
                        ? (
                          <Badge variant={r.primary.trend === 'up' ? 'success' : r.primary.trend === 'down' ? 'warning' : 'neutral'}>
                            {r.primary.trend}{r.primary.trend_delta != null ? ` ${r.primary.trend_delta > 0 ? '+' : ''}${r.primary.trend_delta}%` : ''}
                          </Badge>
                        )
                        : <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.total_keywords_found)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(r.total_addressable_volume)}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(r.created_at)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-0.5">
                        {tracked.has(r.target_keyword.trim().toLowerCase()) ? (
                          <span className="text-[11px] text-muted-foreground" title="Already in the rank tracker">tracked</span>
                        ) : (
                          <Button size="icon" variant="ghost" className="h-7 w-7"
                            aria-label={`Track ${r.target_keyword} in the rank tracker`}
                            title="Track in the rank tracker"
                            onClick={(e) => { e.stopPropagation(); void trackKeywords([r.target_keyword], r.id); }}
                            disabled={trackingKeywords === r.id}>
                            {trackingKeywords === r.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Target className="h-3.5 w-3.5 text-primary" />}
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" className="h-7 w-7"
                          aria-label={`Delete research for ${r.target_keyword}`}
                          onClick={(e) => { e.stopPropagation(); void deleteResearch(r); }}
                          disabled={deletingResearchId === r.id}>
                          {deletingResearchId === r.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Trash2 className="h-3.5 w-3.5 text-destructive" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {(suggestions.length > 0 || pageTitles.length > 0) && (
        <Card className="dashboard-card mt-4">
          <CardHeader>
            <CardTitle className="text-base">Suggested from your pages</CardTitle>
            <CardDescription>
              Pick one of your pages to see the queries Google already shows it for and to get keyword ideas
              around its title. Below that, page titles that are neither tracked nor researched yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative max-w-xl">
              <Input
                value={pageQuery}
                onChange={(e) => { setPageQuery(e.target.value); if (chosenPage) { setChosenPage(null); setPageQueries(null); setPageIdeas(null); } }}
                placeholder="Type part of a page title or URL — e.g. πλακάκια, /thessaloniki/marmaro"
                aria-label="Find one of your pages"
              />
              {!chosenPage && pageMatches.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-sm border border-hairline bg-card shadow-overlay">
                  {pageMatches.map((p) => (
                    <button
                      key={p.url}
                      type="button"
                      className="block w-full truncate px-3 py-1.5 text-left text-xs hover:bg-surface-sunken"
                      onClick={() => void choosePage(p)}
                      title={p.url}
                    >
                      <span className="text-foreground">{p.title}</span>
                      <span className="ml-2 text-muted-foreground">{p.url.replace(/^https?:\/\/[^/]+/, '')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {chosenPage && (
              <div className="space-y-4 rounded-sm border border-hairline p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <a href={chosenPage.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate text-sm font-medium text-foreground hover:underline">
                    {chosenPage.title}
                  </a>
                  <span className="text-[11px] text-muted-foreground">seed: “{seedOf(chosenPage.title)}”</span>
                </div>

                <div>
                  <p className="mb-1 text-xs font-semibold text-muted-foreground">Queries Google already shows this page for (90 days)</p>
                  {pageQueries == null ? (
                    <Loading />
                  ) : pageQueries.length === 0 ? (
                    <HubEmptyState
                      variant="empty"
                      title="Google has not shown this page for any query yet"
                      description="Either it has no impressions in the window, or Search Console is not connected under Search Performance. Keyword ideas around its title still work."
                      action={
                        <Button size="sm" onClick={() => void fetchIdeas()} disabled={ideasBusy || !!pageIdeas}>
                          {ideasBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1 h-3.5 w-3.5" />}
                          Get keyword ideas
                        </Button>
                      }
                    />
                  ) : (
                    <div className="table-scroll">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Query</TableHead>
                            <TableHead className="text-right">Impr.</TableHead>
                            <TableHead className="text-right">Clicks</TableHead>
                            <TableHead className="text-right">Pos.</TableHead>
                            <TableHead className="w-36" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageQueries.slice(0, 30).map((q) => (
                            <TableRow key={q.query}>
                              <TableCell className="max-w-[260px] truncate font-medium">{q.query}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(q.impressions)}</TableCell>
                              <TableCell className="text-right tabular-nums">{formatNumber(q.clicks)}</TableCell>
                              <TableCell className="text-right tabular-nums">{q.position != null ? q.position : '—'}</TableCell>
                              <TableCell>
                                <div className="flex justify-end gap-0.5">
                                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => researchKeyword(q.query)}>Research</Button>
                                  {tracked.has(q.query.toLowerCase()) ? (
                                    <span className="self-center text-[11px] text-muted-foreground">tracked</span>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={trackingKeywords === q.query}
                                      onClick={() => void trackKeywords([q.query], q.query)}>
                                      {trackingKeywords === q.query ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Track'}
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-baseline justify-between gap-2">
                    <p className="text-xs font-semibold text-muted-foreground">Keyword ideas around this page's title (Greek market)</p>
                    {!pageIdeas && (
                      <Button size="sm" variant="outline" onClick={() => void fetchIdeas()} disabled={ideasBusy}>
                        {ideasBusy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Search className="mr-1 h-3.5 w-3.5" />}
                        Get ideas
                      </Button>
                    )}
                  </div>
                  {pageIdeas && (
                    pageIdeas.ideas.length === 0 ? (
                      <HubEmptyState
                        variant="empty"
                        title={`The source returned no ideas for “${pageIdeas.seed}”`}
                        description="Research the seed itself instead — the full run also reads the results page and who ranks."
                        action={<Button size="sm" onClick={() => researchKeyword(pageIdeas.seed)}>Research “{pageIdeas.seed}”</Button>}
                      />
                    ) : (
                      <div className="table-scroll">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Keyword</TableHead>
                              <TableHead className="text-right">Volume</TableHead>
                              <TableHead className="text-right">CPC</TableHead>
                              <TableHead className="text-right">Competition</TableHead>
                              <TableHead className="w-36" />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {pageIdeas.ideas.map((k) => (
                              <TableRow key={k.term}>
                                <TableCell className="max-w-[260px] truncate font-medium">{k.term}</TableCell>
                                <TableCell className="text-right tabular-nums">{k.search_volume != null ? formatNumber(k.search_volume) : '—'}</TableCell>
                                <TableCell className="text-right tabular-nums">{k.cpc != null ? `$${k.cpc.toFixed(2)}` : '—'}</TableCell>
                                <TableCell className="text-right tabular-nums">{k.competition != null ? `${Math.round(k.competition * 100)}%` : '—'}</TableCell>
                                <TableCell>
                                  <div className="flex justify-end gap-0.5">
                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => researchKeyword(k.term)}>Research</Button>
                                    {tracked.has(k.term.toLowerCase()) ? (
                                      <span className="self-center text-[11px] text-muted-foreground">tracked</span>
                                    ) : (
                                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={trackingKeywords === k.term}
                                        onClick={() => void trackKeywords([k.term], k.term)}>
                                        {trackingKeywords === k.term ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Track'}
                                      </Button>
                                    )}
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {suggestions.length > 0 && (
              <p className="text-xs font-semibold text-muted-foreground">Page titles not yet tracked or researched</p>
            )}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {suggestions.map((sg) => (
                <div key={sg.keyword} className="flex items-center gap-2 rounded-sm border border-hairline px-2.5 py-1.5">
                  <a href={sg.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-xs text-foreground hover:underline" title={sg.url}>
                    {sg.keyword}
                  </a>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => researchKeyword(sg.keyword)}>
                    Research
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-xs"
                    onClick={() => void trackKeywords([sg.keyword], sg.keyword)}
                    disabled={trackingKeywords === sg.keyword}>
                    {trackingKeywords === sg.keyword ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Track'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* The full captured SERP, not the 5-column summary. */}
      <Dialog open={!!openResearchId} onOpenChange={(o) => { if (!o) setOpenResearchId(null); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">Keyword research</DialogTitle>
          {openResearchId && (
            <KeywordResearchDetail
              researchId={openResearchId}
              siteDomain={siteHost}
              tracked={tracked}
              onTrack={(keywords) => trackKeywords(keywords, 'detail')}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebsiteKeywordResearchPanel;
