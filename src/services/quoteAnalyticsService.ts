/**
 * Quote Analytics Service
 *
 * Tracks how quotes are viewed and downloaded so admins can see engagement
 * per quote (QuoteAnalyticsPanel on /quotes/manage/:id).
 *
 * Mirrors manufacturerAnalyticsService: batched (flush every 5s or at 20
 * events), fire-and-forget, never blocks the UI, silently re-queues on
 * transient failure.
 *
 * Events for ANONYMOUS public-link views/downloads are NOT written here —
 * those go through the `quote-public-share` edge function (service role),
 * since anonymous browsers can't satisfy the authenticated-insert RLS policy.
 *
 * Table (see migration `quote_view_analytics_and_public_share`):
 *   quote_analytics_events(id, event_type, view_context, quote_id, user_id,
 *                          session_id, source_page, metadata, created_at)
 *   event_type   ∈ 'viewed' | 'previewed' | 'downloaded'
 *   view_context ∈ 'customer' | 'admin' | 'public' | 'preview'
 */

import { supabase } from '@/integrations/supabase/client';

export type QuoteEventType = 'viewed' | 'previewed' | 'downloaded';
export type QuoteViewContext = 'customer' | 'admin' | 'public' | 'preview';

export interface QuoteAnalyticsEvent {
  event_type: QuoteEventType;
  view_context: QuoteViewContext;
  quote_id: string;
  user_id?: string | null;
  session_id: string;
  source_page?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

const BATCH_SIZE = 20;
const FLUSH_INTERVAL_MS = 5_000;

class QuoteAnalyticsService {
  private queue: QuoteAnalyticsEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private sessionId: string;

  constructor() {
    this.sessionId = this.generateSessionId();
    if (this.flushTimer === null) {
      this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => this.flush());
    }
  }

  private generateSessionId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  getSessionId(): string {
    return this.sessionId;
  }

  private track(
    eventType: QuoteEventType,
    quoteId: string,
    context: QuoteViewContext,
    metadata?: Record<string, unknown>,
  ): void {
    // Fire-and-forget — resolve the user asynchronously, never block the caller.
    supabase.auth.getUser()
      .then(({ data: { user } }) => {
        this.queue.push({
          event_type: eventType,
          view_context: context,
          quote_id: quoteId,
          user_id: user?.id ?? null,
          session_id: this.sessionId,
          source_page: typeof window !== 'undefined' ? window.location.pathname : undefined,
          metadata,
          created_at: new Date().toISOString(),
        });
        if (this.queue.length >= BATCH_SIZE) this.flush();
      })
      .catch(() => { /* analytics must never break the app */ });
  }

  flush(): void {
    if (this.queue.length === 0) return;
    const batch = this.queue.splice(0);
    supabase
      .from('quote_analytics_events')
      .insert(batch as never[])
      .then(({ error }) => {
        if (error) {
          console.warn('[QuoteAnalytics] flush failed:', error.message);
          if (this.queue.length < 200) this.queue.unshift(...batch);
        }
      })
      .catch(() => { /* swallow network errors */ });
  }

  // ---- Convenience methods ----------------------------------------------

  /** Quote detail page opened inside the platform. */
  trackView(quoteId: string, context: QuoteViewContext = 'customer', metadata?: Record<string, unknown>): void {
    this.track('viewed', quoteId, context, metadata);
  }

  /** The print/preview page (/quotes/:id/preview) was opened. */
  trackPreview(quoteId: string, context: QuoteViewContext = 'preview', metadata?: Record<string, unknown>): void {
    this.track('previewed', quoteId, context, metadata);
  }

  /** A PDF was downloaded. `method` distinguishes client_pdf / server_generate / public_pdf. */
  trackDownload(quoteId: string, method: string, context: QuoteViewContext = 'customer'): void {
    this.track('downloaded', quoteId, context, { method });
  }
}

export const quoteAnalytics = new QuoteAnalyticsService();

export const trackQuoteView = quoteAnalytics.trackView.bind(quoteAnalytics);
export const trackQuotePreview = quoteAnalytics.trackPreview.bind(quoteAnalytics);
export const trackQuoteDownload = quoteAnalytics.trackDownload.bind(quoteAnalytics);
