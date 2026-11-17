/**
 * Reviews left on connected platform profiles (Google Business today).
 *
 * The rows arrive by webhook — `review.new` / `review.updated` upsert into `external_reviews` —
 * so this screen is a plain RLS-scoped read plus the one write the feature has: a reply.
 *
 * Unanswered-first by default, because that is the only reason anybody opens it. A four-month-old
 * five-star with a reply is a nice number; a two-star from this morning with none is a job.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, MessageSquare, RefreshCw, Loader2, ExternalLink } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Textarea } from '@/components/core/ui/textarea';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { HubEmptyState } from '@/components/core/hub';
import { formatDate } from '@/utils/datetime';

interface ExternalReview {
  id: string;
  platform: string;
  external_id: string;
  rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  reply_text: string | null;
  replied_at: string | null;
  posted_at: string | null;
}

type Filter = 'unanswered' | 'all';

/** Initials for a reviewer with no photo — Google's anonymous reviews have neither. */
function initials(name: string | null): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  return t.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

const Stars: React.FC<{ rating: number | null }> = ({ rating }) => {
  // An unrated row is a real state — a review whose rating arrived in a shape we did not
  // recognise is stored without one rather than lost — so it says so instead of showing zero
  // stars, which would read as one-star-but-worse.
  if (rating == null) return <span className="text-[11px] text-muted-foreground">No rating</span>;
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= rating
            ? 'fill-amber-500 text-amber-500'
            : 'text-muted-foreground/40'}`}
        />
      ))}
    </span>
  );
};

export const ReviewsPage: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<ExternalReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [filter, setFilter] = useState<Filter>('unanswered');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setReviews([]); setLoading(false); return; }
    setLoading(true);
    try {
      // Newest first, and nulls last: `posted_at` is the platform's timestamp and a row that
      // arrived without one should not sort to the top of the queue.
      const { data, error } = await supabase
        .from('external_reviews')
        .select('id, platform, external_id, rating, comment, reviewer_name, reviewer_avatar_url, reply_text, replied_at, posted_at')
        .eq('workspace_id', activeWorkspaceId)
        .order('posted_at', { ascending: false, nullsFirst: false })
        .limit(200);
      if (error) throw error;
      setReviews((data ?? []) as ExternalReview[]);
    } catch (e) {
      toast({ title: 'Could not load reviews', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const sync = async () => {
    if (!activeWorkspaceId) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('zernio-api', {
        body: { action: 'sync_reviews', workspace_id: activeWorkspaceId },
      });
      if (error) throw error;
      toast({ title: 'Synced', description: data?.message });
      await load();
    } catch (e) {
      toast({ title: 'Sync failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const postReply = async (review: ExternalReview) => {
    if (!activeWorkspaceId || !replyText.trim()) return;
    setPosting(true);
    try {
      const { data, error } = await supabase.functions.invoke('zernio-api', {
        body: {
          action: 'reply_review',
          workspace_id: activeWorkspaceId,
          review_id: review.id,
          reply: replyText.trim(),
        },
      });
      if (error) throw error;
      // The edge action warns when the reply POSTED but the local write failed. Surfaced rather
      // than swallowed: the two states need different responses from the operator.
      if (data?.warning) {
        toast({ title: 'Posted, with a caveat', description: data.warning });
      } else {
        toast({ title: 'Reply posted', description: 'It is live on the platform.' });
      }
      setReplyingTo(null);
      setReplyText('');
      await load();
    } catch (e) {
      toast({ title: 'Could not post the reply', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setPosting(false);
    }
  };

  const shown = useMemo(
    () => (filter === 'unanswered' ? reviews.filter((r) => !r.reply_text) : reviews),
    [reviews, filter],
  );

  const unanswered = reviews.filter((r) => !r.reply_text).length;
  const rated = reviews.filter((r) => r.rating != null);
  const average = rated.length
    ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1)
    : null;

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Star}
        title="Reviews"
        subtitle="Reviews on your connected Google Business profile. Replies post straight to the platform."
        actions={
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            {syncing ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1.5" />}
            Sync
          </Button>
        }
      />

      {reviews.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
            <div className="text-lg font-semibold tabular-nums">{reviews.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Total</div>
          </div>
          <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
            <div className={`text-lg font-semibold tabular-nums ${unanswered > 0 ? 'text-warning' : ''}`}>{unanswered}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Unanswered</div>
          </div>
          <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
            {/* Averaged over RATED rows only. Counting an unrated one as zero would drag the
                number down for a review that simply arrived in a shape we did not map. */}
            <div className="text-lg font-semibold tabular-nums">{average ?? '—'}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Average of {rated.length}</div>
          </div>
        </div>
      )}

      <Card className="dashboard-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-base">
              {filter === 'unanswered' ? 'Waiting for a reply' : 'All reviews'}
            </CardTitle>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
              <TabsList className="h-auto bg-transparent p-0 gap-4">
                <TabsTrigger value="unanswered" className="px-0 text-xs">Unanswered</TabsTrigger>
                <TabsTrigger value="all" className="px-0 text-xs">All</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : shown.length === 0 ? (
            <div className="p-6">
              {/* Two different empties, and they need opposite things: nothing connected yet vs.
                  everything answered. Offering "connect an account" to somebody who has just
                  cleared their queue would be nonsense. */}
              {reviews.length === 0 ? (
                <HubEmptyState
                  variant="empty"
                  icon={MessageSquare}
                  title="No reviews yet"
                  description="Connect a Google Business location and reviews will appear here as they are left. Nothing to do after that — they arrive on their own."
                  action={
                    <Button asChild size="sm">
                      <a href="/social-media/accounts">
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />Connect an account
                      </a>
                    </Button>
                  }
                />
              ) : (
                <HubEmptyState
                  variant="filtered"
                  icon={MessageSquare}
                  title="Every review has a reply"
                  description="Nothing is waiting on you."
                  action={<Button size="sm" variant="outline" onClick={() => setFilter('all')}>Show all</Button>}
                />
              )}
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {shown.map((r) => (
                <div key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <Avatar className="h-9 w-9 shrink-0">
                      {r.reviewer_avatar_url && (
                        <AvatarImage src={r.reviewer_avatar_url} alt={r.reviewer_name ?? ''} className="object-cover" />
                      )}
                      <AvatarFallback className="text-xs">{initials(r.reviewer_name)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium truncate">
                          {r.reviewer_name || 'Anonymous'}
                        </span>
                        <Stars rating={r.rating} />
                        {r.reply_text
                          ? <Badge variant="success" className="text-[10px]">Replied</Badge>
                          : <Badge variant="warning" className="text-[10px]">Needs a reply</Badge>}
                      </div>
                      {r.posted_at && (
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          {formatDate(r.posted_at, { withTime: true })}
                        </div>
                      )}
                      {r.comment
                        ? <p className="text-sm mt-2 whitespace-pre-wrap break-words">{r.comment}</p>
                        : <p className="text-sm mt-2 text-muted-foreground italic">Rating only — no words left.</p>}

                      {r.reply_text && (
                        <div className="mt-2.5 rounded-sm border-l-2 border-primary bg-surface-sunken px-3 py-2">
                          <div className="text-[11px] text-muted-foreground mb-0.5">Your reply</div>
                          <p className="text-sm whitespace-pre-wrap break-words">{r.reply_text}</p>
                        </div>
                      )}

                      {!r.reply_text && replyingTo !== r.id && (
                        <Button size="sm" variant="secondary" className="mt-2.5 h-7 text-xs"
                          onClick={() => { setReplyingTo(r.id); setReplyText(''); }}>
                          Reply
                        </Button>
                      )}

                      {replyingTo === r.id && (
                        <div className="mt-2.5 space-y-2">
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="Your reply is public on Google, under your business name."
                            rows={3}
                            className="text-sm"
                          />
                          <div className="flex gap-2">
                            <Button size="sm" className="h-7 text-xs"
                              disabled={posting || !replyText.trim()}
                              onClick={() => void postReply(r)}>
                              {posting ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Post reply'}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs"
                              disabled={posting}
                              onClick={() => { setReplyingTo(null); setReplyText(''); }}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ReviewsPage;
