import { supabase } from '@/integrations/supabase/client';
import { emptyTrail, type DeliveryTrail, type DocumentEntityType, type EmailStatus, type PageStatus } from './documentDeliveryTypes';

/**
 * Delivery trail — "was this document emailed, did it arrive, did they open it,
 * and did they look at the public page?"
 *
 * ONE derivation, in SQL (`get_document_delivery`). This module fetches and
 * FORMATS; it never re-derives. Specifically: do not compute `emailStatus` from
 * a timestamp pair, do not add `viewCount` up from raw events, and do not read
 * the legacy per-row counters (`properties.view_count`,
 * `moodboard_presentation_sheets.share_view_count`, …) — those are cached copies
 * kept only for existing UI, and a nightly drift check compares them to this.
 *
 * See CLAUDE.md, "One derivation per money quantity" — the same rule applied to a
 * delivery quantity, for the same reason: a wrong count is a valid number, so
 * nothing raises when a second implementation disagrees.
 *
 * The vocabulary (entity types, statuses, the trail shape) lives in
 * ./documentDeliveryTypes so the registry guard can read it without a client.
 */

export { DOCUMENT_ENTITY_TYPES, emptyTrail } from './documentDeliveryTypes';
export type { DeliveryTrail, DocumentEntityType, EmailStatus, PageStatus } from './documentDeliveryTypes';

/**
 * Fetch trails for a page of documents in ONE round trip, keyed by entity id.
 *
 * Ids absent from the result have no events at all; callers should fall back to
 * `emptyTrail(id)` rather than treating a missing key as an error — "never sent"
 * is a normal, common state, not a failure.
 */
export async function fetchDeliveryTrails(
  entityType: DocumentEntityType,
  entityIds: string[],
): Promise<Record<string, DeliveryTrail>> {
  if (entityIds.length === 0) return {};

  const { data, error } = await supabase.rpc('get_document_delivery', {
    p_entity_type: entityType,
    p_entity_ids: entityIds,
  });

  if (error) {
    // A broken trail must never take a list page down with it — the invoices
    // still matter when the analytics do not. Logged, not thrown; the cells
    // render their "no activity" state.
    console.error('[documentDeliveryService] get_document_delivery failed:', error.message);
    return {};
  }

  const out: Record<string, DeliveryTrail> = {};
  for (const r of data ?? []) {
    out[r.entity_id] = {
      entityId: r.entity_id,
      emailStatus: r.email_status as EmailStatus,
      sentAt: r.sent_at,
      deliveredAt: r.delivered_at,
      firstOpenedAt: r.first_opened_at,
      lastOpenedAt: r.last_opened_at,
      openCount: r.open_count ?? 0,
      clickCount: r.click_count ?? 0,
      bouncedAt: r.bounced_at,
      bounceReason: r.bounce_reason,
      sendCount: r.send_count ?? 0,
      recipients: r.recipients ?? [],
      pageStatus: r.page_status as PageStatus,
      viewCount: r.view_count ?? 0,
      legacyViewCount: r.legacy_view_count ?? 0,
      firstViewedAt: r.first_viewed_at,
      lastViewedAt: r.last_viewed_at,
      distinctViewers: r.distinct_viewers ?? 0,
      downloadCount: r.download_count ?? 0,
      completedEvent: r.completed_event,
      completedAt: r.completed_at,
    };
  }
  return out;
}

/** Single-document convenience for detail pages. */
export async function fetchDeliveryTrail(
  entityType: DocumentEntityType,
  entityId: string,
): Promise<DeliveryTrail> {
  const map = await fetchDeliveryTrails(entityType, [entityId]);
  return map[entityId] ?? emptyTrail(entityId);
}
