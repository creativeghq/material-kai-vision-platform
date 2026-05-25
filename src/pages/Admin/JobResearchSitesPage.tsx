/**
 * Job Research Sites — canonical management page (hidden from public KB).
 *
 * URL: /admin/knowledge-base/job-sources
 * Guards: AuthGuard + AdminGuard (writes are also RLS-enforced server-side).
 * NOT linked from the public knowledge base; reachable via:
 *   - Direct URL (operator workflow)
 *   - The KAI agent ("open the job sources page" / deep-link from manage_job_sites)
 *
 * What lives here: the operator-curated list of WHERE the engine searches for
 * jobs. Three sub-types (= three tabs):
 *   - Perplexity domain filter (Sonar search_domain_filter, capped at 10)
 *   - Default RSS feeds (offered to new tracked_jobs)
 *   - Default career pages (offered to new tracked_jobs)
 *
 * Reads `job_research_sites` table directly via jobResearchService. Writes
 * (add/remove/toggle/bulk) call existing CRUD endpoints we already shipped.
 * Per-tracked-job overrides still happen via the KAI agent and the
 * JobSitesFormModal — this page is the platform-wide default.
 *
 * The auto-synced KB doc at "Internal Configuration → Job Research Sites"
 * is the READ-ONLY mirror of what this page edits.
 */

import { useEffect, useMemo, useState } from 'react';
import { Layout } from '@/components/core/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { Switch } from '@/components/core/ui/switch';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Label } from '@/components/core/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  Briefcase, Plus, ExternalLink, Trash2, ListPlus, Save,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  jobResearchService, type JobSite, type JobSiteType,
} from '@/services/jobResearchService';

const SITE_TYPES: Array<{ key: JobSiteType; label: string; description: string; example: string }> = [
  {
    key: 'perplexity_domain',
    label: 'Perplexity domain filter',
    description:
      'Pinned domains for Sonar\'s search_domain_filter. Capped at 10 by Perplexity — extras truncate alphabetically. Use bare domains (no scheme).',
    example: 'kariera.gr',
  },
  {
    key: 'rss_feed_default',
    label: 'Default RSS feeds',
    description:
      'RSS / Atom feeds offered to new tracked_jobs when sources_enabled.rss_feeds=true. Per-tracked_job rss_feed_urls override these.',
    example: 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  },
  {
    key: 'careers_page_default',
    label: 'Default career pages',
    description:
      'Company career pages offered to new tracked_jobs when sources_enabled.careers_pages=true. Per-tracked_job careers_page_urls override these.',
    example: 'https://stripe.com/jobs',
  },
];

export default function JobResearchSitesPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState<JobSiteType>('perplexity_domain');
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  // Single-add form
  const [draft, setDraft] = useState({
    url_or_domain: '', display_name: '', country_code: '', category: '', notes: '',
  });

  // Bulk-add form
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkCountry, setBulkCountry] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [bulkSubmitting, setBulkSubmitting] = useState(false);

  const reload = async () => {
    setLoading(true);
    try {
      setSites(await jobResearchService.listSites());
    } catch (e: unknown) {
      toast({ title: 'Failed to load sites', description: String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); }, []);

  const config = useMemo(() => SITE_TYPES.find(t => t.key === tab)!, [tab]);
  const grouped = useMemo(() => {
    const by: Record<JobSiteType, JobSite[]> = {
      perplexity_domain: [], rss_feed_default: [], careers_page_default: [],
    };
    for (const s of sites) by[s.site_type]?.push(s);
    return by;
  }, [sites]);
  const currentRows = grouped[tab] || [];
  const enabledCount = (t: JobSiteType) => (grouped[t] || []).filter(s => s.is_enabled).length;

  const onToggle = async (s: JobSite, enabled: boolean) => {
    try {
      const updated = await jobResearchService.updateSite(s.id, { is_enabled: enabled });
      setSites(prev => prev.map(x => x.id === updated.id ? updated : x));
    } catch (e: unknown) {
      toast({ title: 'Update failed', description: String(e), variant: 'destructive' });
    }
  };

  const onDelete = async (s: JobSite) => {
    if (!window.confirm(`Remove "${s.display_name || s.url_or_domain}" from the ${config.label} list?`)) return;
    try {
      await jobResearchService.deleteSite(s.id);
      setSites(prev => prev.filter(x => x.id !== s.id));
    } catch (e: unknown) {
      toast({ title: 'Delete failed', description: String(e), variant: 'destructive' });
    }
  };

  const onAddSingle = async () => {
    if (!draft.url_or_domain.trim()) {
      toast({ title: 'URL / domain required', variant: 'destructive' });
      return;
    }
    try {
      const created = await jobResearchService.createSite({
        site_type: tab,
        url_or_domain: draft.url_or_domain.trim(),
        display_name: draft.display_name.trim() || undefined,
        country_code: draft.country_code.trim() || undefined,
        category: draft.category.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        is_enabled: true,
      });
      setSites(prev => [...prev, created]);
      setAddOpen(false);
      setDraft({ url_or_domain: '', display_name: '', country_code: '', category: '', notes: '' });
      toast({ title: 'Site added' });
    } catch (e: unknown) {
      toast({ title: 'Add failed', description: String(e), variant: 'destructive' });
    }
  };

  const onAddBulk = async () => {
    const urls = bulkUrls.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) {
      toast({ title: 'No URLs', description: 'Paste one URL or domain per line.', variant: 'destructive' });
      return;
    }
    setBulkSubmitting(true);
    try {
      const r = await jobResearchService.createSitesBulk({
        site_type: tab,
        urls,
        country_code: bulkCountry.trim() || undefined,
        category: bulkCategory.trim() || undefined,
        notes: bulkNotes.trim() || undefined,
      });
      toast({
        title: `Bulk add complete`,
        description: `${r.created} added, ${r.skipped} already existed${r.failed.length ? `, ${r.failed.length} failed` : ''}.`,
      });
      await reload();
      setBulkOpen(false);
      setBulkUrls(''); setBulkCountry(''); setBulkCategory(''); setBulkNotes('');
    } catch (e: unknown) {
      toast({ title: 'Bulk add failed', description: String(e), variant: 'destructive' });
    } finally {
      setBulkSubmitting(false);
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-[1200px]">
        <div className="flex items-baseline justify-between mb-6">
          <div>
            <h1 className="text-2xl font-light flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-primary" />
              Job Research Sites
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              The list of where the job-research engine looks. Hidden from the public Knowledge Base; admin-only edits.
              Auto-syncs to the read-only KB doc <code className="text-xs">Internal Configuration → Job Research Sites</code>.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as JobSiteType)}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {SITE_TYPES.map(t => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
              >
                {t.label}
                <Badge variant="outline" className="ml-1 text-[10px]">{enabledCount(t.key)}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            <Card className="dashboard-card mb-4">
              <CardContent className="pt-6">
                <p className="text-xs text-muted-foreground">{config.description}</p>
              </CardContent>
            </Card>

            <Card className="dashboard-card">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-base font-normal">{config.label}</CardTitle>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => setBulkOpen(true)}>
                    <ListPlus className="h-3 w-3 mr-1" />Bulk paste
                  </Button>
                  <Button size="sm" className="rounded-full" onClick={() => setAddOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" />Add site
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-6 space-y-3">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : currentRows.length === 0 ? (
                  <div className="p-12 text-center text-sm text-muted-foreground">
                    No {config.label.toLowerCase()} configured. Click "Add site" or "Bulk paste".
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>URL / Domain</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-center">Enabled</TableHead>
                        <TableHead className="text-right w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {currentRows.map(s => (
                        <TableRow key={s.id}>
                          <TableCell className="font-mono text-xs">
                            {tab === 'perplexity_domain' ? (
                              s.url_or_domain
                            ) : (
                              <a href={s.url_or_domain} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                                <span className="truncate max-w-md">{s.url_or_domain}</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                              </a>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{s.display_name || '—'}</TableCell>
                          <TableCell>
                            {s.country_code ? <Badge variant="outline" className="text-[10px]">{s.country_code}</Badge> : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{s.category || '—'}</TableCell>
                          <TableCell className="text-center">
                            <Switch checked={s.is_enabled} onCheckedChange={(checked) => onToggle(s, checked)} />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => onDelete(s)} title="Remove">
                              <Trash2 className="h-3 w-3 text-muted-foreground" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {tab === 'perplexity_domain' && currentRows.filter(s => s.is_enabled).length > 10 && (
              <div className="mt-3 text-xs text-amber-400">
                ⚠ Perplexity caps the domain filter at 10. You have {currentRows.filter(s => s.is_enabled).length} enabled —
                only the first 10 (alphabetical by url_or_domain) will be used per search.
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Add single */}
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to {config.label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">
                  {tab === 'perplexity_domain' ? 'Domain (no scheme)' : 'URL'}
                </Label>
                <Input
                  value={draft.url_or_domain}
                  onChange={(e) => setDraft(d => ({ ...d, url_or_domain: e.target.value }))}
                  placeholder={config.example}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Display name (optional)</Label>
                  <Input value={draft.display_name} onChange={(e) => setDraft(d => ({ ...d, display_name: e.target.value }))} placeholder="Kariera.gr" />
                </div>
                <div>
                  <Label className="text-xs">Country (ISO-2, optional)</Label>
                  <Input value={draft.country_code} onChange={(e) => setDraft(d => ({ ...d, country_code: e.target.value.toUpperCase() }))} placeholder="GR" maxLength={3} />
                </div>
              </div>
              <div>
                <Label className="text-xs">Category (optional)</Label>
                <Input value={draft.category} onChange={(e) => setDraft(d => ({ ...d, category: e.target.value }))} placeholder="general | tech | remote | ..." />
              </div>
              <div>
                <Label className="text-xs">Notes (optional)</Label>
                <Input value={draft.notes} onChange={(e) => setDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Why added, who curated, etc." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={onAddSingle}>
                <Save className="h-3 w-3 mr-1" />Add
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk paste */}
        <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Bulk-add to {config.label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label className="text-xs">URLs (one per line)</Label>
                <Textarea
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  placeholder={
                    tab === 'perplexity_domain'
                      ? 'kariera.gr\njobs.gr\nworkable.com'
                      : tab === 'rss_feed_default'
                      ? 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss\nhttps://stackoverflow.com/jobs/feed?l=remote'
                      : 'https://stripe.com/jobs\nhttps://canonical.com/careers\nhttps://anthropic.com/careers'
                  }
                  rows={10}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Whitespace trimmed, duplicates skipped, blank lines ignored. Max 200 per request.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Country (optional, applied to all)</Label>
                  <Input value={bulkCountry} onChange={(e) => setBulkCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="GR" />
                </div>
                <div>
                  <Label className="text-xs">Category (optional, applied to all)</Label>
                  <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="general | tech | ..." />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes (optional, applied to all)</Label>
                <Input value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="Imported from operator's list…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={bulkSubmitting}>Cancel</Button>
              <Button onClick={onAddBulk} disabled={bulkSubmitting || !bulkUrls.trim()}>
                {bulkSubmitting ? 'Adding…' : 'Add all'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
