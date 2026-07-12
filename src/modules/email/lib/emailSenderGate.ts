/**
 * Shared "no workspace email configured" gate helpers.
 *
 * Tenant business mail (quotes, invoices, statements, catalog, CRM sends, POs, campaigns) MUST
 * go out from the workspace's OWN Resend BYOK sender — never the shared platform domain. The
 * backend enforces this (`requireWorkspaceSender` → 503 `workspace_sender_required`). These
 * helpers give the frontend a single, reusable way to react when a send is blocked:
 *   1. surface the Connect-email modal (see ConnectEmailModal), and
 *   2. raise a bell notification for the workspace's admins with a link to set it up.
 */

import { flowEventService } from '@/services/flows/flowEventService';
import { supabase } from '@/integrations/supabase/client';

/** Deep link to where a workspace owner/admin connects their Resend BYOK sender. */
export const CONNECT_EMAIL_PATH = '/profile?tab=keys';

/**
 * Fire the bell notification (via the Flows engine) telling the workspace's admins that a
 * feature needs email but no BYOK sender is connected. Fire-and-forget; never throws.
 * A seeded `system-default` flow on the `email_sender_not_configured` event delivers the bell.
 */
export async function notifyEmailSenderNotConfigured(params: {
  workspaceId: string | null | undefined;
  /** The feature that tried to send, e.g. 'quotes' | 'invoice' | 'crm_contact' | 'catalog'. */
  feature: string;
  /** The user who hit the block (so the flow can attribute / route). */
  userId?: string | null;
}): Promise<void> {
  if (!params.workspaceId) return;
  // The bell needs a concrete recipient (the create_notification flow action targets one user).
  // Default to the current user — they just tried to send, so they need to know it was blocked.
  let userId = params.userId ?? null;
  if (!userId) {
    try { userId = (await supabase.auth.getUser()).data.user?.id ?? null; } catch { /* best-effort */ }
  }
  if (!userId) return;
  await flowEventService.emit('email_sender_not_configured', {
    workspace_id: params.workspaceId,
    user_id: userId,
    feature: params.feature,
    action_url: CONNECT_EMAIL_PATH,
    title: 'Connect your email to send',
    body: `The ${params.feature} feature tried to send an email, but this workspace hasn't connected its own email sender yet. Connect Resend to start sending from your own address.`,
    type: 'email_sender_not_configured',
  });
}
