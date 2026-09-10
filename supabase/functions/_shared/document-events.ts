/**
 * Delivery trail writer — the ONE way an edge function records that a document
 * was sent, delivered, opened, or viewed.
 */

import type { DbClient } from './supabase-client.ts';
import { getTrustedClientIp } from './client-ip.ts';

/**
 * The closed registry of trackable documents. Adding one is a migration (the CHECK
 * constraints on `document_events.entity_type` and `email_logs.entity_type`) plus a value
 * in the SOURCE — `src/services/documentDeliveryTypes.ts`. This was a hand-kept copy of
 * that list until #391; it is now generated, so the two cannot disagree.
 */
export { DOCUMENT_ENTITY_TYPES } from './documentDeliveryTypes.generated.ts';
export type { DocumentEntityType } from './documentDeliveryTypes.generated.ts';

// Also imported: a re-export does not bind the name locally.
import type { DocumentEntityType } from './documentDeliveryTypes.generated.ts';

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
