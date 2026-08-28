// GENERATED MIRROR of src/services/documentDeliveryTypes.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * Delivery-trail vocabulary — the declarative half of documentDeliveryService.
 *
 * This module imports NOTHING (not even the Supabase client) so the registry
 * guard in tests/unit/documentEvents.test.ts can inspect the allowlist directly
 * instead of regexing source or booting a client. Same reason
 * `src/services/templates/schema.ts` is split from its adapters.
 */

/**
 * Must match `document_events.entity_type` AND `email_logs.entity_type` (two DB
 * CHECK constraints) AND the edge-side copy in
 * `supabase/functions/_shared/document-events.ts`. Four copies, because Deno and
 * Vite share no module graph — held in step by the registry guard, not by care.
 */
export const DOCUMENT_ENTITY_TYPES = [
  'invoice',          // /pay/:token   — also covers receipts (invoices.document_type)
  'quote',            // /q/:token
  'contract',         // /sign/:token
  'statement',        // /statement/:token
  'catalog',          // /c/:slug
  'moodboard_sheet',  // /sheets/share/:token
  'client_view',      // /cv/:token
  'property_listing', // /p/:token
  'moodboard',        // /board/:id
  'storefront',       // /store/:slug
  'order',
] as const;

export type DocumentEntityType = typeof DOCUMENT_ENTITY_TYPES[number];

/** Worst-news-first ladder — a bounce outranks an open. See get_document_delivery. */
export type EmailStatus =
  | 'not_sent' | 'sent' | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'complained' | 'failed';

export type PageStatus =
  | 'not_viewed' | 'viewed' | 'downloaded'
  | 'paid' | 'signed' | 'accepted' | 'declined';

export interface DeliveryTrail {
  entityId: string;
  emailStatus: EmailStatus;
  sentAt: string | null;
  deliveredAt: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  clickCount: number;
  bouncedAt: string | null;
  bounceReason: string | null;
  sendCount: number;
  recipients: string[];
  pageStatus: PageStatus;
  /** Observed page hits, after the bot filter and the 30-minute collapse window. */
  viewCount: number;
  firstViewedAt: string | null;
  lastViewedAt: string | null;
  distinctViewers: number;
  downloadCount: number;
  completedEvent: string | null;
  completedAt: string | null;
}

/** The empty trail — a document that has never been sent or opened. */
export function emptyTrail(entityId: string): DeliveryTrail {
  return {
    entityId,
    emailStatus: 'not_sent', sentAt: null, deliveredAt: null,
    firstOpenedAt: null, lastOpenedAt: null, openCount: 0, clickCount: 0,
    bouncedAt: null, bounceReason: null, sendCount: 0, recipients: [],
    pageStatus: 'not_viewed', viewCount: 0,
    firstViewedAt: null, lastViewedAt: null, distinctViewers: 0,
    downloadCount: 0, completedEvent: null, completedAt: null,
  };
}
