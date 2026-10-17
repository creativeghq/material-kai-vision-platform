/**
 * JobSitesFormModal — inline modal triggered by the agent's `job_sites_form_open`
 * chunk. Lets the user fill site details without learning the schema, then
 * submits as a follow-up agent message that re-invokes the `manage_job_sites`
 * tool with structured fields.
 */

import { useEffect, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
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
          <DialogTitle>Add a Job Site</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={v => setTab(v as 'single' | 'bulk')}>
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0 mb-3">
            <TabsTrigger value="single" className="flex items-center gap-2">
              Single
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              Bulk Paste
            </TabsTrigger>
          </TabsList>
          <TabsContent value="single">
            <FormGrid>
              <FormField label="Site type" className="sm:col-span-2">
                <Select value={siteType} onValueChange={setSiteType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SITE_TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField
                label={isPerplexity ? 'Domain' : 'Full URL'}
                hint={isPerplexity
                  ? "No protocol, e.g. kariera.gr. Perplexity caps the filter at 10 domains. Disable a less-used one if you're at the limit."
                  : undefined}
                className="sm:col-span-2"
              >
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
              </FormField>
              <FormField label="Display name" optional>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Kariera.gr"
                />
              </FormField>
              <FormField label="Country" optional hint="ISO-2 code.">
                <Input
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value.toUpperCase())}
                  maxLength={3}
                  placeholder="GR"
                />
              </FormField>
              <FormField label="Category" optional className="sm:col-span-2">
                <Input
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="general | tech | remote | startup | finance | ..."
                />
              </FormField>
              <FormField label="Notes" optional className="sm:col-span-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Why we added this, who curated it, etc."
                  rows={2}
                />
              </FormField>
            </FormGrid>
          </TabsContent>

          <TabsContent value="bulk">
            <FormGrid>
              <FormField label="Scope" className="sm:col-span-2">
                <Select value={bulkScope} onValueChange={v => setBulkScope(v as BulkScope)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Platform-wide defaults (apply to all future searches)</SelectItem>
                    <SelectItem value="per_search">Pin to ONE specific tracked search</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>

              {bulkScope === 'global' && (
                <FormField label="Site type" className="sm:col-span-2">
                  <Select value={bulkSiteType} onValueChange={setBulkSiteType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SITE_TYPE_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
              )}

              {bulkScope === 'per_search' && (
                <>
                  <FormField
                    label="Which tracked search?"
                    hint={trackedJobs.length === 0 ? 'No tracked searches yet. Create one via KAI first.' : undefined}
                  >
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
                  </FormField>
                  <FormField label="URL type">
                    <Select value={bulkField} onValueChange={v => setBulkField(v as 'careers_page_urls' | 'rss_feed_urls')}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="careers_page_urls">Career pages (Firecrawl scrape)</SelectItem>
                        <SelectItem value="rss_feed_urls">RSS / Atom feeds</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormField>
                </>
              )}

              <FormField
                label="URLs"
                hint="One per line. Whitespace trimmed, duplicates skipped, blank lines ignored. Max 200 per request."
                className="sm:col-span-2"
              >
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
              </FormField>

              {bulkScope === 'global' && (
                <>
                  <FormField label="Country" optional>
                    <Input value={bulkCountry} onChange={(e) => setBulkCountry(e.target.value.toUpperCase())} maxLength={3} placeholder="GR" />
                  </FormField>
                  <FormField label="Category" optional>
                    <Input value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)} placeholder="general | tech | remote | ..." />
                  </FormField>
                </>
              )}

              {bulkScope === 'global' && (
                <FormField label="Notes" optional hint="Applied to all rows." className="sm:col-span-2">
                  <Input value={bulkNotes} onChange={(e) => setBulkNotes(e.target.value)} placeholder="Imported from operator's list…" />
                </FormField>
              )}
            </FormGrid>
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
