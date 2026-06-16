/**
 * JobSitesFormModal — inline modal triggered by the agent's `job_sites_form_open`
 * chunk. Lets the user fill site details without learning the schema, then
 * submits as a follow-up agent message that re-invokes the `manage_job_sites`
 * tool with structured fields.
 *
 * Why this exists: a chat-only flow is fine for one-off additions ("add
 * kariera.gr to perplexity filter") but tedious for full entries with country
 * codes, categories, and notes. The modal trades a single chunk-emit for a
 * proper form, then collapses back into chat-tool flow on submit.
 */

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { jobResearchService, type TrackedJob } from '@/services/jobResearchService';

export type JobSitesFormState = {
  mode: 'add' | 'edit';
  default_site_type: 'perplexity_domain' | 'rss_feed_default' | 'careers_page_default';
  prefill?: {
    url_or_domain?: string;
    display_name?: string;
    country_code?: string;
    category?: string;
    notes?: string;
  };
} | null;

interface Props {
  state: JobSitesFormState;
  onClose: () => void;
  /** Called with a string that should be sent as a follow-up user message to the agent.
   *  The agent will parse it and call manage_job_sites with structured args. */
  onSubmit: (followupMessage: string) => void;
}

type BulkScope = 'global' | 'per_search';

const SITE_TYPE_OPTIONS = [
  { value: 'perplexity_domain', label: 'Perplexity domain filter (Sonar)' },
  { value: 'rss_feed_default', label: 'Default RSS feed' },
  { value: 'careers_page_default', label: 'Default career page' },
] as const;

export function JobSitesFormModal({ state, onClose, onSubmit }: Props) {
  const open = !!state;
  const { toast } = useToast();
  const [tab, setTab] = useState<'single' | 'bulk'>('single');
  const [siteType, setSiteType] = useState<string>(state?.default_site_type || 'perplexity_domain');
  const [urlOrDomain, setUrlOrDomain] = useState(state?.prefill?.url_or_domain || '');
  const [displayName, setDisplayName] = useState(state?.prefill?.display_name || '');
  const [countryCode, setCountryCode] = useState(state?.prefill?.country_code || '');
  const [category, setCategory] = useState(state?.prefill?.category || '');
  const [notes, setNotes] = useState(state?.prefill?.notes || '');

  // Bulk-mode state
  const [bulkScope, setBulkScope] = useState<BulkScope>('global');
  const [bulkSiteType, setBulkSiteType] = useState<string>(state?.default_site_type || 'perplexity_domain');
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkCountry, setBulkCountry] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkNotes, setBulkNotes] = useState('');
  const [trackedJobs, setTrackedJobs] = useState<TrackedJob[]>([]);
  const [bulkTrackedJobId, setBulkTrackedJobId] = useState<string>('');
  const [bulkField, setBulkField] = useState<'careers_page_urls' | 'rss_feed_urls'>('careers_page_urls');
  const [submitting, setSubmitting] = useState(false);

  // Sync state when a new prefill arrives
  useEffect(() => {
    if (state) {
      setTab('single');
      setSiteType(state.default_site_type);
      setBulkSiteType(state.default_site_type);
      setUrlOrDomain(state.prefill?.url_or_domain || '');
      setDisplayName(state.prefill?.display_name || '');
      setCountryCode(state.prefill?.country_code || '');
      setCategory(state.prefill?.category || '');
      setNotes(state.prefill?.notes || '');
    }
  }, [state]);

  // Load tracked_jobs once on first open (used by per-search bulk mode)
  useEffect(() => {
    if (!open || trackedJobs.length > 0) return;
    jobResearchService.list(true).then(setTrackedJobs).catch(() => { /* non-fatal */ });
  }, [open, trackedJobs.length]);

  const handleSubmit = () => {
    if (!urlOrDomain.trim()) return;
    const parts: string[] = [];
    parts.push('Please add this job site to the platform list using manage_job_sites.');
    parts.push(`- site_type: \`${siteType}\``);
    parts.push(`- url_or_domain: \`${urlOrDomain.trim()}\``);
    if (displayName.trim()) parts.push(`- display_name: ${displayName.trim()}`);
    if (countryCode.trim()) parts.push(`- country_code: ${countryCode.trim().toUpperCase()}`);
    if (category.trim()) parts.push(`- category: ${category.trim()}`);
    if (notes.trim()) parts.push(`- notes: ${notes.trim()}`);
    parts.push('Use action: "add". Confirm back to me once it\'s done.');
    onSubmit(parts.join('\n'));
    onClose();
  };

  const handleBulkSubmit = async () => {
    const urls = bulkUrls
      .split(/\r?\n/)
      .map(u => u.trim())
      .filter(Boolean);
    if (urls.length === 0) {
      toast({ title: 'No URLs', description: 'Paste one URL or domain per line.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      if (bulkScope === 'global') {
        const r = await jobResearchService.createSitesBulk({
          site_type: bulkSiteType as any,
          urls,
          country_code: bulkCountry.trim() || undefined,
          category: bulkCategory.trim() || undefined,
          notes: bulkNotes.trim() || undefined,
        });
        toast({
          title: 'Bulk add complete',
          description: `${r.created} added, ${r.skipped} already existed${r.failed.length ? `, ${r.failed.length} failed` : ''}.`,
        });
      } else {
        if (!bulkTrackedJobId) {
          toast({ title: 'Pick a tracked job search', variant: 'destructive' });
          setSubmitting(false);
          return;
        }
        const r = await jobResearchService.appendUrlsToTrackedJob(
          bulkTrackedJobId, bulkField, urls,
        );
        toast({
          title: `Added to "${r.tracked_job.label}"`,
          description: `${r.added} new URL${r.added === 1 ? '' : 's'} added (${r.skipped_dup} duplicates skipped). ${bulkField === 'careers_page_urls' ? 'Firecrawl' : 'RSS'} source auto-enabled.`,
        });
      }
      setBulkUrls('');
      onClose();
    } catch (e: unknown) {
      toast({ title: 'Bulk add failed', description: String(e), variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const isPerplexity = siteType === 'perplexity_domain';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a job site</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={v => setTab(v as 'single' | 'bulk')}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-3">
            <TabsTrigger value="single" className="flex items-center gap-2">
              Single
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              Bulk paste
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Site type</Label>
            <Select value={siteType} onValueChange={setSiteType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {SITE_TYPE_OPTIONS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">
              {isPerplexity ? 'Domain (e.g. kariera.gr — no protocol)' : 'Full URL'}
            </Label>
            <Input
              value={urlOrDomain}
              onChange={(e) => setUrlOrDomain(e.target.value)}
              placeholder={
                isPerplexity
                  ? 'kariera.gr'
                  : siteType === 'rss_feed_default'
                  ? 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss'
                  : 'https://stripe.com/jobs'
              }
            />
            {isPerplexity && (
              <p className="text-[11px] text-muted-foreground mt-1">
                Perplexity caps the filter at 10 domains. Disable a less-used one if you're at the limit.
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Display name (optional)</Label>
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Kariera.gr"
              />
            </div>
            <div>
              <Label className="text-xs">Country (ISO-2, optional)</Label>
              <Input
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                maxLength={3}
                placeholder="GR"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Category (optional)</Label>
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="general | tech | remote | startup | finance | ..."
            />
          </div>
          <div>
            <Label className="text-xs">Notes (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Why we added this, who curated it, etc."
              rows={2}
            />
          </div>
        </div>
          </TabsContent>

          <TabsContent value="bulk">
            <div className="space-y-3">
              <div>
                <Label className="text-xs">Scope</Label>
                <Select value={bulkScope} onValueChange={v => setBulkScope(v as BulkScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Platform-wide defaults (apply to all future searches)</SelectItem>
                    <SelectItem value="per_search">Pin to ONE specific tracked search</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {bulkScope === 'global' && (
                <div>
                  <Label className="text-xs">Site type</Label>
                  <Select value={bulkSiteType} onValueChange={setBulkSiteType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SITE_TYPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {bulkScope === 'per_search' && (
                <>
                  <div>
                    <Label className="text-xs">Which tracked search?</Label>
                    <Select value={bulkTrackedJobId} onValueChange={setBulkTrackedJobId}>
                      <SelectTrigger>
                        <SelectValue placeholder={trackedJobs.length ? 'Pick a tracked search…' : 'Loading…'} />
                      </SelectTrigger>
                      <SelectContent>
                        {trackedJobs.map(t => (
                          <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {trackedJobs.length === 0 && (
                      <p className="text-[11px] text-muted-foreground mt-1">No tracked searches yet. Create one via KAI first.</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-xs">URL type</Label>
                    <Select value={bulkField} onValueChange={v => setBulkField(v as 'careers_page_urls' | 'rss_feed_urls')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="careers_page_urls">Career pages (Firecrawl scrape)</SelectItem>
                        <SelectItem value="rss_feed_urls">RSS / Atom feeds</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}

              <div>
                <Label className="text-xs">URLs (one per line)</Label>
                <Textarea
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  placeholder={
                    bulkScope === 'global' && bulkSiteType === 'perplexity_domain'
                      ? 'kariera.gr\njobs.gr\nworkable.com'
                      : bulkScope === 'per_search' && bulkField === 'rss_feed_urls'
                      ? 'https://weworkremotely.com/categories/remote-back-end-programming-jobs.rss\nhttps://stackoverflow.com/jobs/feed?l=remote'
                      : 'https://stripe.com/jobs\nhttps://canonical.com/careers\nhttps://anthropic.com/careers'
                  }
                  rows={8}
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Whitespace trimmed, duplicates skipped, blank lines ignored. Max 200 per request.
                </p>
              </div>

              {bulkScope === 'global' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Country (optional)</Label>
                    <Input value={bulkCountry} onChange={(e) => setBulkCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="GR" />
                  </div>
                  <div>
                    <Label className="text-xs">Category (optional)</Label>
                    <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="general | tech | remote | ..." />
                  </div>
                </div>
              )}

              {bulkScope === 'global' && (
                <div>
                  <Label className="text-xs">Notes (optional, applied to all rows)</Label>
                  <Input value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="Imported from operator's list…" />
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>Cancel</Button>
          {tab === 'single' ? (
            <Button onClick={handleSubmit} disabled={!urlOrDomain.trim()}>
              Send to agent
            </Button>
          ) : (
            <Button onClick={handleBulkSubmit} disabled={submitting || !bulkUrls.trim()}>
              {submitting ? 'Adding…' : 'Add all'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
