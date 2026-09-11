/**
 * Google Business reviews on a public profile — shown ALONGSIDE the profile's own, never merged.
 *
 * Two different reputations: `profile_reviews` are about working with a person on a service and
 * carry dimension ratings; these are about a place, written under Google's terms by people who
 * may never have opened this app. They keep their own heading, their own average and a visible
 * attribution so a reader is never in doubt which they are looking at.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { ExternalLink, AlertTriangle, Star } from 'lucide-react';

import { Card, CardContent } from '@/components/core/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
import { PlatformIcon } from '@/components/core/icons/PlatformIcon';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { formatDate } from '@/utils/datetime';
import { safeHref, safeImageSrc } from '@/utils/safeUrl';
import { destinationRoute } from '@/config/appDestinations';
import { StarRow } from './StarRow';
import { showsGoogleReviews, type GoogleReviewsPayload, type PublishedGoogleReview } from './googleReviews';

/**
 * These URLs reach us through `social_accounts.metadata`, and that column is writable by any
 * signed-in user on their own row — so on a page an anonymous visitor loads they are untrusted
 * input, not Google's word. Anything that is not http(s) is dropped rather than linked: an empty
 * fallback lets the caller render no link at all, which is the honest outcome for a bad URL.
 */
const httpLink = (url: string | null): string | null => (url ? safeHref(url, '') || null : null);

const SOCIAL_ACCOUNTS_ROUTE = destinationRoute('social-accounts') ?? '/profile?tab=social-accounts';

function initials(name: string | null): string {
  const t = (name ?? '').trim();
  if (!t) return '?';
  return t.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || '?';
}

const ReviewRow: React.FC<{ review: PublishedGoogleReview }> = ({ review }) => (
  <div className="p-4 space-y-2.5">
    <div className="flex items-start gap-3">
      <Avatar className="h-8 w-8 shrink-0">
        {safeImageSrc(review.reviewer_avatar_url) && (
          <AvatarImage src={safeImageSrc(review.reviewer_avatar_url)!} alt="" referrerPolicy="no-referrer" />
        )}
        <AvatarFallback className="bg-primary/10 text-primary text-xs">
          {initials(review.reviewer_name)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{review.reviewer_name || 'Google user'}</p>
        <div className="mt-0.5 flex items-center gap-2">
          {/* An unrated row is a review whose rating arrived in a shape we did not recognise.
              Saying so beats zero stars, which reads as one-star-but-worse. */}
          {review.rating != null
            ? <StarRow rating={review.rating} />
            : <span className="text-[11px] text-muted-foreground">No rating</span>}
          {review.posted_at && (
            <span className="text-xs text-muted-foreground">{formatDate(review.posted_at)}</span>
          )}
        </div>
      </div>
    </div>

    {review.comment && (
      <p className="text-sm text-foreground/80 leading-relaxed">{review.comment}</p>
    )}

    {review.reply_text && (
      <div className="ml-4 border-l-2 border-primary/20 pl-3">
        <p className="mb-1 text-xs font-medium text-muted-foreground">Response from the business</p>
        <p className="text-sm text-foreground/80">{review.reply_text}</p>
      </div>
    )}
  </div>
);

export const GoogleReviewsBlock: React.FC<{
  data: GoogleReviewsPayload;
  /** The profile's owner sees the states a visitor must not — a broken connection, and silence. */
  isOwn?: boolean;
}> = ({ data, isOwn = false }) => {
  const mapsUrl = httpLink(data.maps_url);
  const reviewUrl = httpLink(data.review_url);

  // A connection that is opted in and broken is the owner's problem to fix and nobody else's
  // business. `unknown` lands here too: an unrecognised verdict withholds rather than guessing.
  if (data.status === 'not_shown') return null;

  if (data.status === 'not_connected' || data.status === 'unknown') {
    if (!isOwn) return null;
    return (
      <section className="mt-8">
        <HubEmptyState
          icon={AlertTriangle}
          title="Your Google reviews are not being shown"
          description={
            data.status === 'unknown'
              ? 'We could not read the state of this connection, so nothing is published. Reload, and reconnect the location if it persists.'
              : 'The Google Business location this profile publishes is disconnected, switched off, or in a workspace you are no longer a member of. Nothing is being shown to visitors.'
          }
          action={(
            <Link
              to={SOCIAL_ACCOUNTS_ROUTE}
              className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Social accounts
            </Link>
          )}
        />
      </section>
    );
  }

  // Connected and genuinely silent. A visitor gets nothing — an empty Google heading on somebody
  // else's profile is noise — but the owner should know the pipe works and is carrying nothing.
  if (!showsGoogleReviews(data)) {
    if (!isOwn) return null;
    return (
      <section className="mt-8">
        <HubEmptyState
          icon={Star}
          title="No Google reviews yet"
          description={`${data.location_name ?? 'Your Google Business location'} is connected and nothing has been left on it yet. New reviews appear here on their own.`}
          action={reviewUrl ? (
            <a
              href={reviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm underline underline-offset-2"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Your “write a review” link
            </a>
          ) : undefined}
        />
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <PlatformIcon platform="googlebusiness" className="h-4 w-4 shrink-0" />
          <h3 className="text-sm font-semibold">Google reviews</h3>
          {data.location_name && (
            <span className="text-xs text-muted-foreground">· {data.location_name}</span>
          )}
        </div>
        {mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            View on Google <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-hairline bg-surface-sunken px-4 py-3">
            {data.average != null ? (
              <>
                <span className="text-2xl font-light tabular-nums">{data.average.toFixed(1)}</span>
                <StarRow rating={data.average} size="lg" />
              </>
            ) : (
              <span className="text-sm text-muted-foreground">No rated reviews yet</span>
            )}
            {/* The divisor is printed. `rated` and `total` differ when a review arrived without a
                rating, and an average over a smaller set than the reader can count is otherwise
                an unexplained disagreement. */}
            <span className="text-xs text-muted-foreground">
              {data.total} review{data.total !== 1 ? 's' : ''} on Google
              {data.rated !== data.total && data.average != null && (
                <> · average of the {data.rated} that carry a rating</>
              )}
            </span>
          </div>

          <div className="divide-y divide-hairline">
            {data.reviews.map((r, i) => (
              <ReviewRow key={`${r.posted_at ?? 'na'}-${i}`} review={r} />
            ))}
          </div>

          {data.total > data.reviews.length && mapsUrl && (
            <div className="border-t border-hairline px-4 py-3 text-center">
              <a
                href={mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Read all {data.total} on Google
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-2 text-xs text-muted-foreground">
        Written on Google Business Profile, not on this site. Shown as they were left.
      </p>
    </section>
  );
};
