/**
 * Manufacturer Analytics Service
 *
 * Tracks product interaction events for manufacturer/B2B analytics.
 * Uses batching (flush every 5s or at 20 events) and fire-and-forget patterns
 * to avoid blocking the UI.
 *
 * SQL Migration (run via mcp__supabase__apply_migration):
 *
 * CREATE TABLE IF NOT EXISTS manufacturer_analytics_events (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   event_type text NOT NULL CHECK (event_type IN (
 *     'product_view', 'product_save', 'product_quote',
 *     'product_search_impression', 'product_search_click', 'product_compare'
 *   )),
 *   product_id uuid NOT NULL,
 *   manufacturer_id text,
 *   user_id uuid,
 *   user_city text,
 *   user_country text,
 *   session_id uuid NOT NULL,
 *   source_page text,
 *   metadata jsonb DEFAULT '{}',
 *   created_at timestamptz NOT NULL DEFAULT now()
 * );
 *
 * CREATE INDEX idx_mfg_analytics_event_type ON manufacturer_analytics_events (event_type);
 * CREATE INDEX idx_mfg_analytics_product_id ON manufacturer_analytics_events (product_id);
 * CREATE INDEX idx_mfg_analytics_manufacturer_id ON manufacturer_analytics_events (manufacturer_id);
 * CREATE INDEX idx_mfg_analytics_user_id ON manufacturer_analytics_events (user_id);
 * CREATE INDEX idx_mfg_analytics_created_at ON manufacturer_analytics_events (created_at DESC);
 * CREATE INDEX idx_mfg_analytics_session_id ON manufacturer_analytics_events (session_id);
 *
 * ALTER TABLE manufacturer_analytics_events ENABLE ROW LEVEL SECURITY;
 *
 * CREATE POLICY "Allow authenticated inserts" ON manufacturer_analytics_events
 *   FOR INSERT TO authenticated WITH CHECK (true);
 *
 * CREATE POLICY "Allow admins to read" ON manufacturer_analytics_events
 *   FOR SELECT TO authenticated
 *   USING (
 *     auth.uid() IN (
 *       SELECT id FROM user_profiles WHERE role IN ('admin', 'owner')
 *     )
 *   );
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
  user_id?: string;
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

      const { data: profile } = await supabase
        .from('user_profiles')
        .select('city, country')
        .eq('id', user.id)
        .single();

      if (!profile) return null;

      const cached: UserLocationCache = {
        city: profile.city ?? undefined,
        country: profile.country ?? undefined,
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
        const event: ManufacturerAnalyticsEvent = {
          event_type: eventType,
          product_id: productId,
          manufacturer_id: manufacturerId,
          user_id: user?.id,
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
        if (error) {
          console.warn('[ManufacturerAnalytics] flush failed:', error.message);
          // Re-queue failed events (cap to prevent memory leak)
          if (this.queue.length < 200) {
            this.queue.unshift(...batch);
          }
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
