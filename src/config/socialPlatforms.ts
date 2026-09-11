/**
 * The networks a workspace can connect, declared once.
 *
 * This was two hand-kept lists: `zernio-api` accepted `googlebusiness` and the connect grid never
 * offered it, so the entire Google review path — OAuth, the webhook upsert, the Reviews screen,
 * the "Review Received" flow trigger — was reachable by nobody and nothing said so. Import-free
 * so `vocab:mirror` can byte-copy it to Deno, which is the side that refuses an unknown platform.
 */

/**
 * How many steps the connect flow takes. `oauth_then_location` means the callback comes back with
 * `step=select_location` and a `pendingDataToken` instead of a finished account: one Google
 * account can own many locations, reviews belong to a location, and an account stored without one
 * receives nothing for ever while looking connected.
 */
export type SocialConnectFlow = 'oauth' | 'oauth_then_location';

export interface SocialPlatformSpec {
  id: string;
  flow: SocialConnectFlow;
  /** This platform's reviews land in `external_reviews`. */
  hasReviews: boolean;
}

/** Every platform `zernio-api` will start a connect flow for, in the order the UI lists them. */
export const SOCIAL_PLATFORM_SPECS: readonly SocialPlatformSpec[] = [
  { id: 'instagram', flow: 'oauth', hasReviews: false },
  { id: 'facebook', flow: 'oauth', hasReviews: false },
  { id: 'linkedin', flow: 'oauth', hasReviews: false },
  { id: 'tiktok', flow: 'oauth', hasReviews: false },
  { id: 'pinterest', flow: 'oauth', hasReviews: false },
  { id: 'youtube', flow: 'oauth', hasReviews: false },
  { id: 'twitter', flow: 'oauth', hasReviews: false },
  { id: 'threads', flow: 'oauth', hasReviews: false },
  { id: 'googlebusiness', flow: 'oauth_then_location', hasReviews: true },
];

/** The ids alone — what the edge validates a connect request against. */
export const CONNECTABLE_PLATFORM_IDS: readonly string[] = SOCIAL_PLATFORM_SPECS.map((p) => p.id);

export function socialPlatformSpec(id: string): SocialPlatformSpec | null {
  return SOCIAL_PLATFORM_SPECS.find((p) => p.id === id) ?? null;
}

/** True when OAuth alone does not finish the job. */
export function needsLocationStep(id: string): boolean {
  return socialPlatformSpec(id)?.flow === 'oauth_then_location';
}

/** True when this platform can put rows in `external_reviews`. */
export function platformHasReviews(id: string): boolean {
  return socialPlatformSpec(id)?.hasReviews === true;
}
