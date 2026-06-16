/**
 * Saved/applied job-listing triage for a single job-research agent.
 *
 * Mounted inside `AgentRunHistoryDrawer` only when `agent.agent_type === 'job-research'`.
 * Shows the listings the user has marked saved / applied / interested across all
 * runs of THIS tracked_job. Lets the admin (or the user via shared row visibility)
 * undo a status, jump to the source URL, or tag a wrong match for the classifier.
 *
 * v0.3 — replaces the dropped hidden "/knowledge-base/job-sources" page. Cross-
 * conversation triage lives here, scoped to one tracked_job, alongside the
 * background-agents framework.
 */

import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Bookmark, CheckCircle2, X, Briefcase } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/core/ui/tabs';
import { Skeleton } from '@/components/core/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
  jobResearchService, type JobListing, type JobUserAction,
} from '@/services/jobResearchService';
import { formatDistanceToNow } from 'date-fns';

interface JobResearchSavedJobsPanelProps {
  /** The `tracked_job_id` carried in the background_agents.config blob. */
  trackedJobId: string;
}

const FILTERS = [
  { key: 'saved' as const,    label: 'Saved' },
  { key: 'applied' as const,  label: 'Applied' },
  { key: 'interested' as const, label: 'Interested' },
  { key: 'all' as const,      label: 'All matches' },
];
type Filter = (typeof FILTERS)[number]['key'];

export function JobResearchSavedJobsPanel({ trackedJobId }: JobResearchSavedJobsPanelProps) {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('saved');
  const [listings, setListings] = useState<JobListing[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const { listings } = await jobResearchService.listListings(trackedJobId, {
        relevance: 'match', days: 90, limit: 200,
      });
      setListings(listings);
    } catch (e: unknown) {
      toast({ title: 'Failed to load saved jobs', description: String(e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (trackedJobId) reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedJobId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return listings;
    return listings.filter(l => l.user_action === filter);
  }, [listings, filter]);

  const counts = useMemo(() => ({
    saved:      listings.filter(l => l.user_action === 'saved').length,
    applied:    listings.filter(l => l.user_action === 'applied').length,
    interested: listings.filter(l => l.user_action === 'interested').length,
    all:        listings.length,
  }), [listings]);

  const onMark = async (l: JobListing, action: JobUserAction | null) => {
    try {
      if (action) {
        const updated = await jobResearchService.markListing(l.id, action);
        setListings(prev => prev.map(x => x.id === updated.id ? updated : x));
      } else {
        // Clear: backend doesn't have an unset endpoint today. Re-using markListing with
        // 'dismissed' as a workaround so the row leaves the saved/applied filter.
        const updated = await jobResearchService.markListing(l.id, 'dismissed');
        setListings(prev => prev.map(x => x.id === updated.id ? updated : x));
      }
    } catch (e: unknown) {
      toast({ title: 'Action failed', description: String(e), variant: 'destructive' });
    }
  };

  const onWrongMatch = async (l: JobListing) => {
    const reason = window.prompt(`Why is "${l.title || 'this listing'}" a wrong match?`, '');
    if (reason === null) return;
    try {
      await jobResearchService.correctMatch(l.id, 'mismatch', reason || undefined);
      setListings(prev => prev.filter(x => x.id !== l.id));  // It'll now be filtered out
      toast({ title: 'Recorded — classifier will mirror this on next refresh' });
    } catch (e: unknown) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Briefcase className="h-4 w-4 text-primary" />
        <span className="text-xs font-medium">Saved / applied jobs (last 90 days)</span>
      </div>

      <Tabs value={filter} onValueChange={v => setFilter(v as Filter)}>
        <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
          {FILTERS.map(f => (
            <TabsTrigger
              key={f.key}
              value={f.key}
              className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
            >
              {f.label}
              <Badge variant="outline" className="ml-1 text-[10px]">{counts[f.key]}</Badge>
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={filter} className="mt-3">
          {filtered.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">
              {filter === 'all'
                ? 'No matches in this tracked search yet.'
                : `No jobs marked as ${filter} yet. Use the buttons in the chat findings card to triage.`}
            </p>
          ) : (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {filtered.map(l => (
                <div key={l.id} className="border rounded-md p-2.5 bg-card/40">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium hover:underline inline-flex items-start gap-1 min-w-0 flex-1"
                    >
                      <span className="line-clamp-1">{l.title || '(untitled)'}</span>
                      <ExternalLink className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground" />
                    </a>
                    {l.user_action && (
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                        {l.user_action}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                    <span>{l.company || '—'}</span>
                    {l.location && <span>· {l.location}</span>}
                    {l.is_remote && <span className="text-emerald-500">· Remote</span>}
                    {l.salary_annual_min_usd && (
                      <span>· ${l.salary_annual_min_usd.toLocaleString()}{l.salary_annual_max_usd ? `–$${l.salary_annual_max_usd.toLocaleString()}` : '+'} /yr</span>
                    )}
                    {l.user_action_at && (
                      <span>· marked {formatDistanceToNow(new Date(l.user_action_at), { addSuffix: true })}</span>
                    )}
                  </div>
                  {l.user_notes && (
                    <p className="text-xs text-muted-foreground italic mt-1">{l.user_notes}</p>
                  )}
                  <div className="flex items-center gap-1 mt-2">
                    <Button
                      size="sm"
                      variant={l.user_action === 'saved' ? 'default' : 'ghost'}
                      className="h-6 text-[11px]"
                      onClick={() => onMark(l, 'saved')}
                    >
                      <Bookmark className="h-3 w-3 mr-1" />Save
                    </Button>
                    <Button
                      size="sm"
                      variant={l.user_action === 'applied' ? 'default' : 'ghost'}
                      className="h-6 text-[11px]"
                      onClick={() => onMark(l, 'applied')}
                    >
                      <CheckCircle2 className="h-3 w-3 mr-1" />Applied
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px]"
                      onClick={() => onMark(l, null)}
                      title="Dismiss / clear status"
                    >
                      <X className="h-3 w-3 mr-1" />Dismiss
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[11px] ml-auto text-muted-foreground hover:text-red-500"
                      onClick={() => onWrongMatch(l)}
                      title="Tell the classifier this was wrong"
                    >
                      ⚠ Wrong match
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
