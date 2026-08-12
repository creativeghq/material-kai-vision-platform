/**
 * Delivery trail writer — the ONE way an edge function records that a document
 * was sent, delivered, opened, or viewed.
 *
 * Before this, "was it viewed?" was answered seven different ways: event tables
 * for quotes and catalogs, a read-modify-write `share_view_count = x + 1` on
 * moodboard sheets (which silently lost concurrent views), five separate
 * `increment_*_view_count` RPCs, and nothing at all on the invoice pay page and
 * the contract signing page — the two that matter most.
 *
 * Everything now writes `document_events` through `record_document_event`, and
 * everything READS the derived answer from `get_document_delivery`. Do not add
 * an eighth counter, and do not count `document_events` in application code.
 *
 * Bot filtering, the 30-minute view-collapse window and the visitor hashing all
 * live INSIDE the SQL function, not here — a caller cannot get them subtly
 * wrong, and the difference between "viewed 4x" and "viewed 40x because a mail
 * scanner followed the link" is invisible once it is stored.
 */

import type { DbClient } from './supabase-client.ts';
import { getTrustedClientIp } from './client-ip.ts';

/**
 * The closed registry of trackable documents. Adding one is a migration (the
 * CHECK constraints on `document_events.entity_type` and
 * `email_logs.entity_type`) plus a value here — guarded by
 * tests/unit/documentEvents.test.ts, which reads both.
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

/** Email-channel events mirror the Resend webhook vocabulary. */
export type EmailEventType =
  | 'sent' | 'delivered' | 'opened' | 'clicked'
  | 'bounced' | 'complained' | 'unsubscribed' | 'send_failed';

/** Page-channel events. The last four are terminal outcomes. */
export type PageEventType =
  | 'viewed' | 'downloaded' | 'printed'
  | 'paid' | 'signed' | 'accepted' | 'declined';

export interface DocumentEventInput {
  entityType: DocumentEntityType;
  entityId: string;
  /** Workspace-scoped documents. One of workspaceId / ownerUserId is required. */
  workspaceId?: string | null;
  /** User-owned documents (moodboards have no workspace at all). */
  ownerUserId?: string | null;
  actorEmail?: string | null;
  actorUserId?: string | null;
  emailLogId?: string | null;
  metadata?: Record<string, unknown>;
  /** Defaults to now(). Pass the provider's timestamp when replaying a webhook. */
  occurredAt?: string | null;
}

interface RecordArgs extends DocumentEventInput {
  channel: 'email' | 'page';
  eventType: EmailEventType | PageEventType;
  clientIp?: string | null;
  userAgent?: string | null;
}

async function record(supabase: DbClient, args: RecordArgs): Promise<void> {
  const { error } = await supabase.rpc('record_document_event', {
    p_entity_type: args.entityType,
    p_entity_id: args.entityId,
    p_channel: args.channel,
    p_event_type: args.eventType,
    p_workspace_id: args.workspaceId ?? null,
    p_owner_user_id: args.ownerUserId ?? null,
    p_actor_email: args.actorEmail ?? null,
    p_actor_user_id: args.actorUserId ?? null,
    p_client_ip: args.clientIp ?? null,
    p_user_agent: args.userAgent ?? null,
    p_email_log_id: args.emailLogId ?? null,
    p_metadata: args.metadata ?? {},
    p_occurred_at: args.occurredAt ?? null,
  });

  if (error) {
    // Never fail the request the customer is making because analytics broke:
    // a share page must still render if the trail write fails. But log loudly —
    // a silently-zero trail is exactly the failure mode this platform keeps
    // hitting (CLAUDE.md "silent zero"), and ops.silent_zero probes the result.
    console.error(
      `[document-events] record failed (${args.entityType}/${args.eventType}):`,
      error.message,
    );
  }
}

/**
 * Record a public-page hit. Call this from the edge function that already
 * resolved the share token — never from the browser, or anyone could inflate
 * any document's view count.
 *
 * Fire-and-forget by design: the caller should not await it before responding.
 */
export function recordPageEvent(
  supabase: DbClient,
  req: Request,
  eventType: PageEventType,
  input: DocumentEventInput,
): Promise<void> {
  return record(supabase, {
    ...input,
    channel: 'page',
    eventType,
    clientIp: getTrustedClientIp(req),
    userAgent: req.headers.get('user-agent'),
  });
}

/** Record an email-channel event (a send, or a replayed provider webhook). */
export function recordEmailEvent(
  supabase: DbClient,
  eventType: EmailEventType,
  input: DocumentEventInput,
): Promise<void> {
  return record(supabase, { ...input, channel: 'email', eventType });
}
