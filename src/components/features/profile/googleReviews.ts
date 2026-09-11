/**
 * The Google Business reviews a profile publishes — shape and verdict.
 *
 * These are NOT `profile_reviews` and are never folded into them: a Google review is about a
 * PLACE and carries no dimension ratings, so a blended average would average two things that are
 * not comparable. `get_public_profile_google_reviews` derives the number and the verdict; this
 * module only normalises what it said, and TypeScript only formats.
 */

/**
 * `ok` — there are reviews. `no_reviews` — connected, nothing left yet. `not_shown` — the profile
 * has not opted in (the default). `not_connected` — opted in, but the account is gone, switched
 * off, or in a workspace this person has left. `unknown` is never returned by SQL: it is what an
 * unrecognised status DEGRADES to, so a future status cannot fall through to rendering numbers as
 * fact.
 */
export type GoogleReviewStatus = 'ok' | 'no_reviews' | 'not_shown' | 'not_connected' | 'unknown';

const KNOWN_STATUSES: readonly GoogleReviewStatus[] = ['ok', 'no_reviews', 'not_shown', 'not_connected'];

export interface PublishedGoogleReview {
  rating: number | null;
  comment: string | null;
  reviewer_name: string | null;
  reviewer_avatar_url: string | null;
  reply_text: string | null;
  replied_at: string | null;
  posted_at: string | null;
}

export interface GoogleReviewsPayload {
  status: GoogleReviewStatus;
  location_name: string | null;
  maps_url: string | null;
  review_url: string | null;
  /** Every review held for this location. */
  total: number;
  /** How many of them carried a rating — the average's divisor, stated rather than assumed. */
  rated: number;
  average: number | null;
  reviews: PublishedGoogleReview[];
}

export const NO_GOOGLE_REVIEWS: GoogleReviewsPayload = {
  status: 'not_shown',
  location_name: null,
  maps_url: null,
  review_url: null,
  total: 0,
  rated: 0,
  average: null,
  reviews: [],
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

function toReview(raw: unknown): PublishedGoogleReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  return {
    rating: num(r.rating),
    comment: str(r.comment),
    reviewer_name: str(r.reviewer_name),
    reviewer_avatar_url: str(r.reviewer_avatar_url),
    reply_text: str(r.reply_text),
    replied_at: str(r.replied_at),
    posted_at: str(r.posted_at),
  };
}

/** Whatever the RPC returned, made safe to render. A read that failed must NOT arrive here. */
export function normalizeGoogleReviews(raw: unknown): GoogleReviewsPayload {
  if (!raw || typeof raw !== 'object') return NO_GOOGLE_REVIEWS;
  const p = raw as Record<string, unknown>;
  const declared = typeof p.status === 'string' ? p.status : '';
  const status = (KNOWN_STATUSES as readonly string[]).includes(declared)
    ? (declared as GoogleReviewStatus)
    : 'unknown';

  return {
    status,
    location_name: str(p.location_name),
    maps_url: str(p.maps_url),
    review_url: str(p.review_url),
    total: num(p.total) ?? 0,
    rated: num(p.rated) ?? 0,
    average: num(p.average),
    reviews: Array.isArray(p.reviews)
      ? p.reviews.map(toReview).filter((r): r is PublishedGoogleReview => r !== null)
      : [],
  };
}

/** Whether a VISITOR sees anything at all. Everything else is for the profile's owner. */
export function showsGoogleReviews(p: GoogleReviewsPayload): boolean {
  return p.status === 'ok' && p.reviews.length > 0;
}
