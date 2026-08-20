/**
 * Inline editor for the "Job Research Sites" KB doc.
 *
 * Mounted as a 3rd tab ("Manage") inside the standard DocumentEditor when
 * the document's metadata.doc_kind === 'job_research_sites'. Lets the operator
 * add as many resources as they want from inside the KB — no separate /admin/
 * route, no fragmented surface.
 *
 * Reads/writes the typed `job_research_sites` table (not the doc body); the
 * doc body auto-syncs on the backend after every CRUD so the Preview tab on
 * the same dialog reflects the latest state on next refresh.
 */

import { useEffect, useMemo, useState } from 'react';
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
import { Plus, ExternalLink, Trash2, ListPlus, Save, Pencil } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  jobResearchService, type JobSite, type JobSiteType,
} from '@/services/jobResearchService';

const SITE_TYPES: Array<{ key: JobSiteType; label: string; description: string; example: string }> = [
  {
    key: 'perplexity_domain',
    label: 'Perplexity domain filter',
    description:
      "Pinned domains for Sonar's search_domain_filter. Capped at 10 by Perplexity — extras truncate alphabetically. Bare domains (no scheme).",
    example: 'kariera.gr',
  },
  {
    key: 'rss_feed_default',
    label: 'Default RSS feeds',
    description:
      'RSS / Atom feeds polled directly via httpx + XML parse on every refresh, UNIONed with each tracked_job\'s own rss_feed_urls. Gives per-item dates that Perplexity search can\'t. New tracked_jobs auto-enable the rss_feeds source when any default exists.',
    example: 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss',
  },
  {
    key: 'careers_page_default',
    label: 'Custom Pages',
    description:
      'Any page we crawl directly — company career pages AND job-board / multi-listing pages — scraped via Firecrawl with schema-guided extraction on every refresh, UNIONed with each tracked_job\'s own careers_page_urls. The extractor pulls every job listing off the page, so a board search-results page works just as well as a single company careers page. Handles JS-rendered job lists that Perplexity can\'t see. New tracked_jobs auto-enable this source when any default exists. Firecrawl credits apply per page.',
    example: 'https://stripe.com/jobs',
  },
];

export function JobResearchSitesEditor() {
  const { toast } = useToast();
  const [tab, setTab] = useState<JobSiteType>('perplexity_domain');
  const [sites, setSites] = useState<JobSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);

  const [draft, setDraft] = useState({
    url_or_domain: '', display_name: '', country_code: '', category: '', notes: '',
  });
  const [editTarget, setEditTarget] = useState<JobSite | null>(null);
  const [editDraft, setEditDraft] = useState({
    url_or_domain: '', display_name: '', country_code: '', category: '', notes: '',
  });
  const [editSubmitting, setEditSubmitting] = useState(false);
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

  const onEditOpen = (s: JobSite) => {
    setEditTarget(s);
    setEditDraft({
      url_or_domain: s.url_or_domain,
      display_name: s.display_name || '',
      country_code: s.country_code || '',
      category: s.category || '',
      notes: s.notes || '',
    });
  };

  const onSaveEdit = async () => {
    if (!editTarget) return;
    if (!editDraft.url_or_domain.trim()) {
      toast({ title: 'URL / domain required', variant: 'destructive' });
      return;
    }
    setEditSubmitting(true);
    try {
      const updated = await jobResearchService.updateSite(editTarget.id, {
        url_or_domain: editDraft.url_or_domain.trim(),
        display_name: editDraft.display_name.trim(),
        country_code: editDraft.country_code.trim(),
        category: editDraft.category.trim(),
        notes: editDraft.notes.trim(),
      });
      setSites(prev => prev.map(x => x.id === updated.id ? updated : x));
      setEditTarget(null);
      toast({ title: 'Saved' });
    } catch (e: unknown) {
      toast({ title: 'Update failed', description: String(e), variant: 'destructive' });
    } finally {
      setEditSubmitting(false);
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
      toast({ title: 'Added' });
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
        title: 'Bulk add complete',
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
    // v0.5.1: was `p-6 space-y-4` — too much padding when this editor is mounted
    // inside another TabsContent panel which already has spacing. Tighter padding
    // so content sits flush with the parent tab's content area.
    <div className="px-4 pt-3 pb-4 space-y-3">
      <Tabs value={tab} onValueChange={v => setTab(v as JobSiteType)}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          {SITE_TYPES.map(t => (
            <TabsTrigger
              key={t.key}
              value={t.key}
              className="flex items-center gap-2"
            >
              {t.label}
              <Badge variant="outline" className="ml-1 text-[10px]">{enabledCount(t.key)}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={tab} className="mt-3">
          <p className="text-xs text-muted-foreground mb-3">{config.description}</p>

          <Card className="dashboard-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="font-normal">{config.label}</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
                  <ListPlus className="h-3 w-3 mr-1" />Bulk paste
                </Button>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3 w-3 mr-1" />Add resource
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
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No {config.label.toLowerCase()} yet. Click "Add resource" or "Bulk paste".
                </div>
              ) : (
                <Table className="table-fixed w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-auto">URL / Domain</TableHead>
                      <TableHead className="w-40">Name</TableHead>
                      <TableHead className="w-20">Country</TableHead>
                      <TableHead className="w-32">Category</TableHead>
                      <TableHead className="w-20 text-center">Enabled</TableHead>
                      <TableHead className="w-24 text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentRows.map(s => (
                      <TableRow key={s.id}>
                        <TableCell className="font-mono text-xs align-top">
                          {tab === 'perplexity_domain' ? (
                            <span className="break-all">{s.url_or_domain}</span>
                          ) : (
                            <a href={s.url_or_domain} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-start gap-1">
                              <span className="break-all">{s.url_or_domain}</span>
                              <ExternalLink className="h-3 w-3 shrink-0 mt-0.5" />
                            </a>
                          )}
                        </TableCell>
                        <TableCell className="text-sm align-top break-words">
                          {s.display_name || '—'}
                          {/* `notes` was written at create and edit and loaded back into the edit
                              form, but shown nowhere else — so a curation note ("why added, who
                              curated") was invisible exactly when scanning the list, which is when
                              it is useful. Surfaced here rather than dropping a field that has a
                              real purpose. */}
                          {s.notes && (
                            <span className="mt-0.5 block text-xs italic text-muted-foreground break-words">{s.notes}</span>
                          )}
                        </TableCell>
                        <TableCell className="align-top">
                          {s.country_code ? <Badge variant="outline" className="text-[10px]">{s.country_code}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground align-top break-words">{s.category || '—'}</TableCell>
                        <TableCell className="text-center align-top">
                          <Switch checked={s.is_enabled} onCheckedChange={(checked) => onToggle(s, checked)} />
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap align-top">
                          <Button size="icon" variant="ghost" onClick={() => onEditOpen(s)} title="Edit">
                            <Pencil className="h-3 w-3 text-muted-foreground" />
                          </Button>
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
              only the first 10 (alphabetical) will be used per search.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Add-single dialog */}
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

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {editTarget?.display_name || editTarget?.url_or_domain || 'resource'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">
                {editTarget?.site_type === 'perplexity_domain' ? 'Domain (no scheme)' : 'URL'}
              </Label>
              <Input
                value={editDraft.url_or_domain}
                onChange={(e) => setEditDraft(d => ({ ...d, url_or_domain: e.target.value }))}
                placeholder={config.example}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Display name (optional)</Label>
                <Input value={editDraft.display_name} onChange={(e) => setEditDraft(d => ({ ...d, display_name: e.target.value }))} placeholder="Kariera.gr" />
              </div>
              <div>
                <Label className="text-xs">Country (ISO-2, optional)</Label>
                <Input value={editDraft.country_code} onChange={(e) => setEditDraft(d => ({ ...d, country_code: e.target.value.toUpperCase() }))} placeholder="GR" maxLength={3} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Category (optional)</Label>
              <Input value={editDraft.category} onChange={(e) => setEditDraft(d => ({ ...d, category: e.target.value }))} placeholder="general | tech | remote | ..." />
            </div>
            <div>
              <Label className="text-xs">Notes (optional)</Label>
              <Input value={editDraft.notes} onChange={(e) => setEditDraft(d => ({ ...d, notes: e.target.value }))} placeholder="Why added, who curated, etc." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditTarget(null)} disabled={editSubmitting}>Cancel</Button>
            <Button onClick={onSaveEdit} disabled={editSubmitting || !editDraft.url_or_domain.trim()}>
              <Save className="h-3 w-3 mr-1" />{editSubmitting ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk-paste dialog */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Bulk-add to {config.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Resources (one per line)</Label>
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
  );
}
