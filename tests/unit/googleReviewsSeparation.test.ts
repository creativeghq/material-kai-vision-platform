/**
 * Google Business reviews are a SECOND reputation, shown beside the profile's own and never
 * folded into them — and the connect flow that produces them must be reachable.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import {
  NO_GOOGLE_REVIEWS, normalizeGoogleReviews, showsGoogleReviews, type GoogleReviewsPayload,
} from '../../src/components/features/profile/googleReviews';
import { CONNECTABLE_PLATFORM_IDS, SOCIAL_PLATFORM_SPECS, platformHasReviews, needsLocationStep } from '../../src/config/socialPlatforms';

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (p: string) => blankComments(read(p));

const REVIEWS_SECTION = 'src/components/features/profile/ReviewsSection.tsx';
const GOOGLE_BLOCK = 'src/components/features/profile/GoogleReviewsBlock.tsx';
const OAUTH_HANDLER = 'supabase/functions/zernio-api/handlers/oauth.ts';
const ZERNIO_ROUTER = 'supabase/functions/zernio-api/index.ts';

describe('the two review sets never merge', () => {
  it('the profile aggregate is computed from profile_reviews alone', () => {
    const src = code(REVIEWS_SECTION);
    // The aggregate lives between `if (list.length > 0)` and `setStats({`. `list` is the
    // profile_reviews array; a Google row reaching this arithmetic is the defect.
    const start = src.indexOf('const overall =');
    const end = src.indexOf('setStats({');
    expect(start, 'the aggregate block moved — re-point this test').toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const aggregate = src.slice(start, end);
    expect(aggregate).not.toMatch(/google/i);
  });

  it('the Google block never writes to profile_reviews, and never reads external_reviews itself', () => {
    const src = code(GOOGLE_BLOCK);
    expect(src).not.toContain('profile_reviews');
    // The public read is the self-guarding RPC. A direct table read from a page an anonymous
    // visitor can open would be refused by RLS and render as "no reviews".
    expect(src).not.toContain('external_reviews');
    expect(src).not.toContain('.from(');
  });

  it('nothing on the public profile reads external_reviews directly', () => {
    for (const f of [REVIEWS_SECTION, GOOGLE_BLOCK, 'src/pages/PublicProfilePage.tsx']) {
      expect(code(f), `${f} must go through get_public_profile_google_reviews`)
        .not.toContain("from('external_reviews')");
    }
  });

  it('the profile fetches the Google set through the self-guarding RPC', () => {
    expect(code(REVIEWS_SECTION)).toContain('get_public_profile_google_reviews');
  });
});

describe('the payload withholds rather than guesses', () => {
  it('an unrecognised status degrades to unknown, never to a rendered number', () => {
    const p = normalizeGoogleReviews({ status: 'something_new', total: 9, average: 4.9, reviews: [{ rating: 5 }] });
    expect(p.status).toBe('unknown');
    expect(showsGoogleReviews(p)).toBe(false);
  });

  it('a missing or malformed payload publishes nothing', () => {
    for (const raw of [null, undefined, 'nope', 42, {}]) {
      const p = normalizeGoogleReviews(raw);
      expect(showsGoogleReviews(p)).toBe(false);
    }
    expect(NO_GOOGLE_REVIEWS.status).toBe('not_shown');
  });

  it('only `ok` WITH rows is shown to a visitor', () => {
    const base: GoogleReviewsPayload = { ...NO_GOOGLE_REVIEWS, reviews: [{
      rating: 5, comment: 'x', reviewer_name: 'A', reviewer_avatar_url: null,
      reply_text: null, replied_at: null, posted_at: null,
    }] };
    for (const status of ['not_shown', 'not_connected', 'no_reviews', 'unknown'] as const) {
      expect(showsGoogleReviews({ ...base, status })).toBe(false);
    }
    expect(showsGoogleReviews({ ...base, status: 'ok' })).toBe(true);
    // `ok` with nothing to show is still nothing to show.
    expect(showsGoogleReviews({ ...base, status: 'ok', reviews: [] })).toBe(false);
  });

  it('the published shape carries no internal column', () => {
    const p = normalizeGoogleReviews({
      status: 'ok', total: 1, rated: 1, average: 5,
      reviews: [{ rating: 5, comment: 'x', raw: { secret: 1 }, reviewer_id: 'g123', external_id: 'e1', workspace_id: 'w1' }],
    });
    const keys = Object.keys(p.reviews[0]);
    for (const internal of ['raw', 'reviewer_id', 'external_id', 'workspace_id', 'zernio_account_id', 'id']) {
      expect(keys, `${internal} must never reach a public profile`).not.toContain(internal);
    }
  });

  it('the average is reported with the divisor it was taken over', () => {
    // A review stored without a rating is one that arrived in a shape we did not map, not a
    // zero-star review, so `rated` can legitimately be smaller than `total`.
    const p = normalizeGoogleReviews({ status: 'ok', total: 3, rated: 2, average: 4.5, reviews: [] });
    expect(p.total).toBe(3);
    expect(p.rated).toBe(2);
    expect(p.average).toBe(4.5);
  });
});

describe('the connect flow that produces them is reachable', () => {
  it('the edge reads the shared vocabulary instead of its own platform list', () => {
    const src = code(OAUTH_HANDLER);
    expect(src).toContain('socialPlatforms.generated.ts');
    expect(src).toContain('CONNECTABLE_PLATFORM_IDS');
    // The hand-written array is what drifted: it listed a platform the connect grid never drew.
    expect(src).not.toMatch(/SUPPORTED_PLATFORMS\s*=\s*\[/);
  });

  it('Google Business is offered, and is the platform that carries reviews', () => {
    expect(CONNECTABLE_PLATFORM_IDS).toContain('googlebusiness');
    expect(platformHasReviews('googlebusiness')).toBe(true);
    expect(needsLocationStep('googlebusiness')).toBe(true);
  });

  it('every platform that carries reviews is one you can actually connect', () => {
    for (const spec of SOCIAL_PLATFORM_SPECS.filter(s => s.hasReviews)) {
      expect(CONNECTABLE_PLATFORM_IDS).toContain(spec.id);
    }
  });

  it('every action the oauth handler implements is one the router will dispatch', () => {
    // The router holds its own allowlist, so an action implemented in the handler and missing
    // from that set is refused as unknown with the handler none the wiser.
    const handler = code(OAUTH_HANDLER);
    const router = code(ZERNIO_ROUTER);
    const implemented = [...handler.matchAll(/action === '([a-z_]+)'/g)].map(m => m[1]);
    expect(implemented.length).toBeGreaterThan(0);
    const declared = router.slice(router.indexOf('OAUTH_ACTIONS'), router.indexOf('PUBLISH_ACTIONS'));
    for (const action of implemented) {
      expect(declared, `'${action}' is implemented but the router will not route it`).toContain(`'${action}'`);
    }
  });
});
