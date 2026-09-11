import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Star, MessageSquare, ChevronDown, ChevronUp, Sparkles,
  AlertTriangle, ExternalLink, Copy, Check, EyeOff,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { Skeleton } from '@/components/core/ui/skeleton';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { supabase } from '@/integrations/supabase/client';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ReviewModal } from './ReviewModal';
import { StarRow } from './StarRow';
import { GoogleReviewsBlock } from './GoogleReviewsBlock';
import {
  NO_GOOGLE_REVIEWS, normalizeGoogleReviews, showsGoogleReviews, type GoogleReviewsPayload,
} from './googleReviews';

export interface ProfileReview {
  id: string;
  from_user_id: string;
  from_name: string | null;
  overall_rating: number;
  dimension_ratings: Record<string, number>;
  comment: string | null;
  service_name: string | null;
  reply: string | null;
  is_verified: boolean;
  created_at: string;
}

interface AggregateStats {
  overall: number;
  count: number;
  dimensions: Record<string, number>;
}

const DIMENSIONS: { key: string; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'value', label: 'Value' },
];

export const ReviewsSection: React.FC<{
  profileUserId: string;
  currentUserId?: string;
  services?: { id: string; name: string }[];
  /** Mounted under a tab that already says "Reviews" — drop the duplicate lead-in. */
  hideHeader?: boolean;
}> = ({ profileUserId, currentUserId, services = [], hideHeader = false }) => {
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [stats, setStats] = useState<AggregateStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isPublicProfile, setIsPublicProfile] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [myReview, setMyReview] = useState<ProfileReview | null>(null);
  // A SECOND reputation, kept separate on purpose — see googleReviews.ts. Fetched here rather
  // than inside the block so this section can stop telling the owner nobody has reviewed them
  // while a wall of Google reviews sits directly underneath.
  const [google, setGoogle] = useState<GoogleReviewsPayload>(NO_GOOGLE_REVIEWS);

  const isOwn = currentUserId === profileUserId;
  const canReview = !!currentUserId && !isOwn;

  // `currentUserId` arrives AFTER the first paint on the public profile page and the Discover
  // modal (it is `user?.id` off a session that is still resolving), and it decides three things
  // this load computes: whether the profile is your own, whether the private-profile probe runs,
  // and which review is yours to edit. Keyed on the id alone, all three froze at their
  // signed-out values for the rest of the session.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileUserId, currentUserId]);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
    const [{ data: reviewsData, error: reviewsError }, { data: summaryData }, googleResult] = await Promise.all([
      supabase
        .from('profile_reviews')
        .select('*')
        .eq('to_user_id', profileUserId)
        .order('created_at', { ascending: false }),
      supabase
        .from('review_summaries')
        .select('summary_text')
        .eq('user_id', profileUserId)
        .maybeSingle(),
      supabase.rpc('get_public_profile_google_reviews', { p_user_id: profileUserId }),
    ]);

    // The Google block is secondary: a failure there withholds that block and must not take the
    // profile's own reviews down with it. `unknown` is what the normaliser degrades to, and the
    // block renders nothing for it rather than a number it cannot vouch for.
    setGoogle(googleResult.error ? { ...NO_GOOGLE_REVIEWS, status: 'unknown' } : normalizeGoogleReviews(googleResult.data));

    // A read that FAILED is not a profile with no reviews. Rendering the two the same way is
    // how a broken list reads as a clean one — say which it is (anti-regression rule 3).
    if (reviewsError) {
      setLoadError(reviewsError.message || 'The reviews could not be read.');
      setReviews([]);
      setStats(null);
      setSummary(null);
      return;
    }

    const list = (reviewsData ?? []) as ProfileReview[];
    setReviews(list);
    setSummary(summaryData?.summary_text ?? null);

    if (list.length > 0) {
      const overall = list.reduce((s, r) => s + r.overall_rating, 0) / list.length;
      const dimTotals: Record<string, { sum: number; count: number }> = {};
      list.forEach((r) => {
        Object.entries(r.dimension_ratings ?? {}).forEach(([k, v]) => {
          if (!dimTotals[k]) dimTotals[k] = { sum: 0, count: 0 };
          dimTotals[k].sum += Number(v);
          dimTotals[k].count += 1;
        });
      });
      const dimensions: Record<string, number> = {};
      Object.entries(dimTotals).forEach(([k, v]) => {
        dimensions[k] = v.sum / v.count;
      });
      setStats({ overall, count: list.length, dimensions });
    } else {
      setStats(null);
    }

    if (currentUserId) {
      const mine = list.find((r) => r.from_user_id === currentUserId) ?? null;
      setMyReview(mine);
    }

    // On your OWN reviews with none yet, the reason matters more than the fact: a private
    // profile is one nobody can open, so no client can leave a review however many you serve.
    // That is the difference between "share your link" and "you are not reachable".
    if (isOwn && list.length === 0) {
      const { data: prof, error: profError } = await supabase
        .from('user_profiles')
        .select('is_public')
        .eq('user_id', profileUserId)
        .maybeSingle();
      // No row is not "unknown" — it is a profile that has never been published, which is the
      // same dead end as a private one. Only a failed READ stays unknown.
      setIsPublicProfile(profError ? null : (prof?.is_public ?? false));
    }
    } catch (e) {
      // A rejection (offline, an aborted fetch) never reaches the PostgREST `error` field, so
      // without this the section would render "nobody has reviewed this professional" on a read
      // that never happened — the exact thing the error branch above exists to prevent.
      setLoadError(e instanceof Error ? e.message : 'The reviews could not be read.');
      setReviews([]);
      setStats(null);
      setSummary(null);
    } finally {
      // Never leave the section stuck loading on a network/RLS error.
      setLoading(false);
    }
  };

  const copyProfileLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/u/${profileUserId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const header = !hideHeader ? (
    <SectionHeader
      icon={Star}
      title="Reviews"
      actions={stats ? (
        <Badge variant="secondary" className="text-xs font-normal">
          {stats.count} review{stats.count !== 1 ? 's' : ''}
        </Badge>
      ) : undefined}
    />
  ) : null;

  // With a Google block rendering directly underneath, "nobody has reviewed this professional" is
  // read as a statement about the whole page and contradicts it, and two unlabelled averages sit
  // one above the other. Every state below therefore says WHICH set it is talking about.
  const alsoGoogle = showsGoogleReviews(google);

  if (loading) {
    return (
      <section aria-busy="true">
        {header}
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      </section>
    );
  }

  // A failed read said nothing at all before this: the section returned `null`, so a broken
  // query and a profile with no reviews were the same blank panel.
  if (loadError) {
    return (
      <section>
        {header}
        <HubEmptyState
          icon={AlertTriangle}
          title="Reviews could not be loaded"
          description={loadError}
          action={<Button variant="outline" onClick={load}>Try again</Button>}
        />
      </section>
    );
  }

  if (reviews.length === 0) {
    const elsewhere = alsoGoogle ? ' Their Google reviews are shown separately below.' : '';

    return (
      <section>
        {header}
        {canReview ? (
          <HubEmptyState
            icon={Star}
            title="No reviews yet"
            description={`Nobody has reviewed this professional here yet. Be the first to say what it was like to work with them.${elsewhere}`}
            action={(
              <Button className="gap-2" onClick={() => setModalOpen(true)}>
                <Star className="h-3.5 w-3.5" />
                Write a Review
              </Button>
            )}
          />
        ) : isOwn && isPublicProfile === false ? (
          <HubEmptyState
            icon={EyeOff}
            title="No reviews yet"
            description="Your profile is private, so nobody can open it to leave a review. Make it public first, then share the link with clients you have worked with."
            action={(
              <Button variant="outline" asChild className="gap-2">
                <Link to="/profile?tab=profile">
                  <ExternalLink className="h-3.5 w-3.5" />
                  Profile visibility
                </Link>
              </Button>
            )}
          />
        ) : isOwn ? (
          <HubEmptyState
            icon={Star}
            title="No reviews yet"
            description={`Reviews here are written by clients from your public profile — you cannot add one yourself. Share the link with people you have worked with and their reviews appear here.${
              alsoGoogle
                ? ' Your Google reviews are shown separately below; they are not written here and do not count towards this rating.'
                : ''}`}
            action={(
              <>
                <Button variant="outline" asChild className="gap-2">
                  <Link to={`/u/${profileUserId}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />
                    Preview my profile
                  </Link>
                </Button>
                <Button variant="outline" onClick={copyProfileLink} className="gap-2">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied!' : 'Copy link'}
                </Button>
              </>
            )}
          />
        ) : (
          <HubEmptyState
            icon={Star}
            title="No reviews yet"
            description={`Nobody has reviewed this professional here yet. Sign in to be the first.${elsewhere}`}
            action={(
              <Button variant="outline" asChild>
                <Link to="/auth">Sign in to review</Link>
              </Button>
            )}
          />
        )}

        <GoogleReviewsBlock data={google} isOwn={isOwn} />

        <ReviewModal
          open={modalOpen}
          onOpenChange={setModalOpen}
          toUserId={profileUserId}
          services={services}
          existingReview={myReview}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      </section>
    );
  }

  const displayed = showAll ? reviews : reviews.slice(0, 3);

  return (
    <section>
      {header}

      {/* Aggregate row */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr] gap-4 mb-6">
          {/* Score card */}
          <div className="flex flex-col items-center justify-center bg-primary/10 rounded-2xl px-8 py-5 min-w-[120px]">
            <span className="text-4xl font-light text-primary">{stats.overall.toFixed(1)}</span>
            <StarRow rating={stats.overall} size="lg" />
            <span className="text-xs text-muted-foreground mt-1">
              {stats.count} review{stats.count !== 1 ? 's' : ''}{alsoGoogle ? ' on this profile' : ''}
            </span>
          </div>

          {/* Right: AI summary + dimensions */}
          <div className="flex flex-col gap-3">
            {summary && (
              <Card className="rounded-xl border-primary/10 bg-primary/5">
                <CardContent className="p-4">
                  <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> AI SUMMARY
                  </p>
                  <p className="text-sm text-foreground/80 leading-relaxed">{summary}</p>
                </CardContent>
              </Card>
            )}
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              {DIMENSIONS.filter((d) => stats.dimensions[d.key] != null).map((d) => (
                <div key={d.key} className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{d.label}</span>
                  <div className="flex items-center gap-1.5">
                    <StarRow rating={stats.dimensions[d.key]} />
                    <span className="text-xs text-foreground tabular-nums">
                      {stats.dimensions[d.key].toFixed(1)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Write review / edit my review */}
      {canReview && (
        <div className="mb-5">
          <Button
            variant={myReview ? 'outline' : 'default'}
            size="sm"
            className="gap-2"
            onClick={() => setModalOpen(true)}
          >
            <Star className="h-3.5 w-3.5" />
            {myReview ? 'Edit My Review' : 'Write a Review'}
          </Button>
        </div>
      )}

      {/* Review list */}
      {displayed.length > 0 && (
        <div className="space-y-4">
          {displayed.map((r) => (
            <ReviewCard key={r.id} review={r} isOwn={isOwn} onReplyUpdated={load} />
          ))}

          {reviews.length > 3 && (
            <button
              className="w-full flex items-center justify-center gap-1 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? (
                <><ChevronUp className="h-4 w-4" /> Show fewer</>
              ) : (
                <><ChevronDown className="h-4 w-4" /> Show all {reviews.length} reviews</>
              )}
            </button>
          )}
        </div>
      )}

      <GoogleReviewsBlock data={google} isOwn={isOwn} />

      <ReviewModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        toUserId={profileUserId}
        services={services}
        existingReview={myReview}
        onSaved={() => { setModalOpen(false); load(); }}
      />
    </section>
  );
};

// ── Individual review card ────────────────────────────────────────────────────
function ReviewCard({
  review,
  isOwn,
  onReplyUpdated,
}: {
  review: ProfileReview;
  isOwn: boolean;
  onReplyUpdated: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState(review.reply ?? '');
  const [saving, setSaving] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  // A null from_name here is a render crash that takes the whole tab, not a blank name.
  const initials = (review.from_name ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0].toUpperCase())
    .join('');

  const saveReply = async () => {
    setSaving(true);
    setReplyError(null);
    const { error } = await supabase.from('profile_reviews').update({ reply: replyText }).eq('id', review.id);
    setSaving(false);
    if (error) {
      // Don't close + report success on a failed write (silent data loss).
      setReplyError(error.message || 'Could not save your reply. Please try again.');
      return;
    }
    setReplyOpen(false);
    onReplyUpdated();
  };

  return (
    <div className="rounded-xl border bg-card p-4 space-y-3">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials || '?'}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{review.from_name || 'Anonymous'}</span>
            {review.is_verified && (
              <Badge variant="secondary" className="text-xs px-1.5 py-0 gap-1">
                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" /> Verified
              </Badge>
            )}
            {review.service_name && (
              <span className="text-xs text-muted-foreground">· {review.service_name}</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <StarRow rating={review.overall_rating} />
            <span className="text-xs text-muted-foreground">
              {new Date(review.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {review.comment && (
        <p className="text-sm text-foreground/80 leading-relaxed">{review.comment}</p>
      )}

      {/* Owner reply */}
      {review.reply && !replyOpen && (
        <div className="ml-4 pl-3 border-l-2 border-primary/20">
          <p className="text-xs text-muted-foreground mb-1 font-medium">Response from professional</p>
          <p className="text-sm text-foreground/80">{review.reply}</p>
          {isOwn && (
            <button
              className="text-xs text-primary hover:underline mt-1"
              onClick={() => setReplyOpen(true)}
            >
              Edit reply
            </button>
          )}
        </div>
      )}

      {/* Reply form (owner only) */}
      {isOwn && !review.reply && !replyOpen && (
        <button
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
          onClick={() => setReplyOpen(true)}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Reply to this review
        </button>
      )}

      {replyOpen && (
        <div className="space-y-2">
          <textarea
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
            rows={3}
            placeholder="Write your reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
          />
          {replyError && <p className="text-xs text-destructive">{replyError}</p>}
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={saveReply} disabled={saving}>
              {saving ? 'Saving…' : 'Save Reply'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => { setReplyOpen(false); setReplyText(review.reply ?? ''); }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
