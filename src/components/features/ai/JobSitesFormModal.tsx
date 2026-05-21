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

import { useState } from 'react';
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

const SITE_TYPE_OPTIONS = [
  { value: 'perplexity_domain', label: 'Perplexity domain filter (Sonar)' },
  { value: 'rss_feed_default', label: 'Default RSS feed' },
  { value: 'careers_page_default', label: 'Default career page' },
] as const;

export function JobSitesFormModal({ state, onClose, onSubmit }: Props) {
  const open = !!state;
  const [siteType, setSiteType] = useState<string>(state?.default_site_type || 'perplexity_domain');
  const [urlOrDomain, setUrlOrDomain] = useState(state?.prefill?.url_or_domain || '');
  const [displayName, setDisplayName] = useState(state?.prefill?.display_name || '');
  const [countryCode, setCountryCode] = useState(state?.prefill?.country_code || '');
  const [category, setCategory] = useState(state?.prefill?.category || '');
  const [notes, setNotes] = useState(state?.prefill?.notes || '');

  // Sync state when a new prefill arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    if (state) {
      setSiteType(state.default_site_type);
      setUrlOrDomain(state.prefill?.url_or_domain || '');
      setDisplayName(state.prefill?.display_name || '');
      setCountryCode(state.prefill?.country_code || '');
      setCategory(state.prefill?.category || '');
      setNotes(state.prefill?.notes || '');
    }
  });

  const handleSubmit = () => {
    if (!urlOrDomain.trim()) return;
    const parts: string[] = [];
    parts.push(`Please add this job site to the platform list using manage_job_sites.`);
    parts.push(`- site_type: \`${siteType}\``);
    parts.push(`- url_or_domain: \`${urlOrDomain.trim()}\``);
    if (displayName.trim()) parts.push(`- display_name: ${displayName.trim()}`);
    if (countryCode.trim()) parts.push(`- country_code: ${countryCode.trim().toUpperCase()}`);
    if (category.trim()) parts.push(`- category: ${category.trim()}`);
    if (notes.trim()) parts.push(`- notes: ${notes.trim()}`);
    parts.push(`Use action: "add". Confirm back to me once it's done.`);
    onSubmit(parts.join('\n'));
    onClose();
  };

  const isPerplexity = siteType === 'perplexity_domain';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a job site</DialogTitle>
        </DialogHeader>
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
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!urlOrDomain.trim()}>Send to agent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
