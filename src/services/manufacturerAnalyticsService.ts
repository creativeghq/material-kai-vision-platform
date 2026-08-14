/**
 * Manufacturer Analytics Service
 *
 * Tracks product interaction events for manufacturer/B2B analytics.
 * Uses batching (flush every 5s or at 20 events) and fire-and-forget patterns
 * to avoid blocking the UI.
 *
 * The schema this file used to paste inline had drifted from the live table and was worse than
 * no documentation: it claimed a CHECK constraint on event_type that did not exist (so the table
 * silently became a two-family bus when the 3D embed widget started writing `embed_*` rows) and
 * described an RLS shape ("admins read") that was never applied. The live contract is now:
 *
 * - `event_type` is CHECK-constrained to BOTH families — the six product events below and the six
 *   `embed_*` events in `products-3d-api`. A typo fails the insert instead of reading as zero.
 * - `workspace_id` is DERIVED from the product by a BEFORE INSERT trigger, never sent by this
 *   service. That is deliberate: a client that could assert its own workspace_id could attribute
 *   engagement to a tenant it does not belong to (security invariant 1).
 * - INSERT requires `user_id = auth.uid()` and membership of the derived workspace, so an
 *   unauthenticated view cannot be recorded — see the guard in `track()`.
 * - SELECT is workspace-scoped, and there is exactly one read policy. Consumers must go through a
 *   SECURITY DEFINER RPC (`company_market_analytics`) rather than reading this table directly;
 *   a direct read returns only what the caller's own workspace generated.
 *
 * Migration: `manufacturer_analytics_event_bus_foundation` (issue #350).
 */

import { supabase } from '@/integrations/supabase/client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ManufacturerEventType =
  | 'product_view'
  | 'product_save'
  | 'product_quote'
  | 'product_search_impression'
  | 'product_search_click'
  | 'product_compare';

export interface ManufacturerAnalyticsEvent {
  event_type: ManufacturerEventType;
  product_id: string;
  manufacturer_id?: string;
  /** Always set — `track()` drops anonymous events, which the INSERT policy would reject anyway. */
  user_id: string;
  user_city?: string;
  user_country?: string;
  session_id: string;
  source_page?: string;
  /** Upload category (one of 10 DB categories: tiles, wood, lighting, etc.) */
  category?: string;
  /** Fine-grained controlled-vocab type (e.g. porcelain_tile, pendant_light, radiator) */
  material_type?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

interface UserLocationCache {
  city?: string;
  country?: string;
  fetched_at: number;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 5_000;
const LOCATION_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Postgres SQLSTATEs that mean "this row will never be accepted" — retrying is pointless.
 * 23514 check_violation (unknown event_type) · 42501 insufficient_privilege (RLS refused, e.g. the
 * product's workspace isn't ours) · 23503 foreign_key_violation · 23502 not_null_violation.
 */
const PERMANENT_INSERT_CODES = new Set(['23514', '42501', '23503', '23502']);

class ManufacturerAnalyticsService {
  private queue: ManufacturerAnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;
  private locationCache: UserLocationCache | null = null;
  private locationFetchPromise: Promise<UserLocationCache | null> | null = null;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.startFlushTimer();

    // Flush remaining events when the tab is closing
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  // -------------------------------------------------------------------------
  // Session ID
  // -------------------------------------------------------------------------

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback for older browsers
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  // -------------------------------------------------------------------------
  // User location cache
  // -------------------------------------------------------------------------

  private async fetchUserLocation(): Promise<UserLocationCache | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      // user_profiles uses user_id (FK to auth.users) — NOT id (the row PK).
      // Columns: location (free-text "city, country"), location_country_code.
      // The previous query .eq('id', ...).select('city, country') silently
      // returned nothing because (a) wrong filter column, (b) those fields
      // don't exist — every analytics event was being written with null
      // city/country.
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('location, location_country_code')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) return null;

      // location is free-text — derive city as the part before the first comma
      const location = (profile.location as string | null) ?? undefined;
      const city = location ? location.split(',')[0]?.trim() || undefined : undefined;

      const cached: UserLocationCache = {
        city,
        country: (profile.location_country_code as string | null) ?? undefined,
        fetched_at: Date.now(),
      };
      this.locationCache = cached;
      return cached;
    } catch {
      return null;
    }
  }

  private getUserLocation(): Promise<UserLocationCache | null> {
    if (
      this.locationCache &&
      Date.now() - this.locationCache.fetched_at < LOCATION_CACHE_TTL_MS
    ) {
      return Promise.resolve(this.locationCache);
    }
    // Deduplicate concurrent fetches
    if (!this.locationFetchPromise) {
      this.locationFetchPromise = this.fetchUserLocation().finally(() => {
        this.locationFetchPromise = null;
      });
    }
    return this.locationFetchPromise;
  }

  // -------------------------------------------------------------------------
  // Core tracking
  // -------------------------------------------------------------------------

  private track(
    eventType: ManufacturerEventType,
    productId: string,
    manufacturerId?: string,
    sourcePage?: string,
    metadata?: Record<string, unknown>,
    category?: string,
    materialType?: string,
  ): void {
    // Fire-and-forget — build the event asynchronously, never block the caller
    Promise.all([
      supabase.auth.getUser(),
      this.getUserLocation(),
    ])
      .then(([{ data: { user } }, location]) => {
        // The INSERT policy is `user_id = auth.uid()`, so an anonymous event can only ever be
        // rejected. Queuing it anyway would burn a flush, log a warning and re-queue a batch that
        // can never succeed. Drop it at the door instead.
        if (!user?.id) return;

        const event: ManufacturerAnalyticsEvent = {
          event_type: eventType,
          product_id: productId,
          manufacturer_id: manufacturerId,
          user_id: user.id,
          user_city: location?.city,
          user_country: location?.country,
          session_id: this.sessionId,
          source_page: sourcePage ?? (typeof window !== 'undefined' ? window.location.pathname : undefined),
          category,
          material_type: materialType,
          metadata,
          created_at: new Date().toISOString(),
        };

        this.queue.push(event);

        if (this.queue.length >= BATCH_SIZE) {
          this.flush();
        }
      })
      .catch(() => {
        // Silently discard — analytics must never break the app
      });
  }

  // -------------------------------------------------------------------------
  // Flush / batching
  // -------------------------------------------------------------------------

  private startFlushTimer(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  flush(): void {
    if (this.queue.length === 0) return;

    const batch = this.queue.splice(0);

    // Use sendBeacon for beforeunload reliability, otherwise normal insert
    if (typeof navigator !== 'undefined' && navigator.sendBeacon && document.visibilityState === 'hidden') {
      // sendBeacon can only send strings/blobs — we need the Supabase REST endpoint
      // Fall through to the normal path; sendBeacon with Supabase client isn't straightforward.
    }

    supabase
      .from('manufacturer_analytics_events')
      .insert(batch as never[])
      .then(({ error }) => {
        if (!error) return;
        // A rejected batch is either transient (offline, 5xx) or permanent (CHECK violation, RLS
        // refusal, dangling product_id). Re-queuing a permanent failure retries it every 5s until
        // the 200-event cap silently eats the queue — the loudest symptom of a broken contract
        // reduced to a console line nobody reads. Retry the first kind, report the second.
        if (PERMANENT_INSERT_CODES.has(error.code ?? '')) {
          console.error(
            `[ManufacturerAnalytics] dropped ${batch.length} event(s) — the insert is invalid, not delayed `
            + `(${error.code}: ${error.message}). This is a contract break, not a network blip.`,
          );
          return;
        }
        console.warn('[ManufacturerAnalytics] flush failed, will retry:', error.message);
        // Re-queue failed events (cap to prevent memory leak)
        if (this.queue.length < 200) {
          this.queue.unshift(...batch);
        }
      })
      .catch(() => {
        // Silently discard on network failure
      });
  }

  dispose(): void {
    this.flush();
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  // -------------------------------------------------------------------------
  // Convenience methods
  // -------------------------------------------------------------------------

  trackProductView(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_view', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }

  trackProductSave(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_save', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }

  trackProductQuote(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_quote', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }

  trackSearchImpression(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_search_impression', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }

  trackSearchClick(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_search_click', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }

  trackProductCompare(productId: string, manufacturerId?: string, sourcePage?: string, metadata?: Record<string, unknown>, category?: string, materialType?: string): void {
    this.track('product_compare', productId, manufacturerId, sourcePage, metadata, category, materialType);
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const manufacturerAnalytics = new ManufacturerAnalyticsService();

// Named convenience exports
export const trackProductView = manufacturerAnalytics.trackProductView.bind(manufacturerAnalytics);
export const trackProductSave = manufacturerAnalytics.trackProductSave.bind(manufacturerAnalytics);
export const trackProductQuote = manufacturerAnalytics.trackProductQuote.bind(manufacturerAnalytics);
export const trackSearchImpression = manufacturerAnalytics.trackSearchImpression.bind(manufacturerAnalytics);
export const trackSearchClick = manufacturerAnalytics.trackSearchClick.bind(manufacturerAnalytics);
export const trackProductCompare = manufacturerAnalytics.trackProductCompare.bind(manufacturerAnalytics);
export const getSessionId = manufacturerAnalytics.getSessionId.bind(manufacturerAnalytics);
