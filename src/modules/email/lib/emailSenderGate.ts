/**
 * Shared "no workspace email configured" gate helpers.
 *
 * Tenant business mail (quotes, invoices, statements, catalog, CRM sends, POs, campaigns) MUST
 * go out from the workspace's OWN Resend BYOK sender — never the shared platform domain. The
 * backend enforces this (`requireWorkspaceSender` → 503 `workspace_sender_required`). These
 * helpers give the frontend a single, reusable way to react when a send is blocked:
 *   1. surface the Connect-email modal (see ConnectEmailModal / useConnectEmailGate), and
 *   2. raise a bell notification for the workspace's admins with a link to set it up.
 */

import { flowEventService } from '@/services/flows/flowEventService';
import { supabase } from '@/integrations/supabase/client';
import { EmailSendError } from '@/modules/email/services/emailService';

/** Deep link to where a workspace owner/admin connects their Resend BYOK sender. */
export const CONNECT_EMAIL_PATH = '/profile?tab=keys';

/**
 * Normalize any email send failure into `{ code, message }`, reading the edge response body at
 * most once. Handles both the typed EmailSendError (from emailService.sendEmail) and a raw
 * `supabase.functions.invoke` error (from call sites that hit send-quote-email / finance-* /
 * catalog-* / generate-purchase-sheet-pdf directly). The body of an invoke error is a Response
 * that can only be consumed once — call this instead of also calling edgeError on the same error.
 */
export async function unwrapEmailSendError(err: unknown): Promise<{ code: string | null; message: string }> {
  if (err instanceof EmailSendError) return { code: err.code, message: err.message };
  const anyErr = err as any;
  try {
    const body = await anyErr?.context?.json?.();
    if (body && (body.code || body.error || body.message)) {
      return { code: body.code ?? null, message: String(body.error ?? body.message ?? 'Send failed') };
    }
  } catch { /* body not JSON / already read — fall through */ }
  return { code: null, message: anyErr?.message ? String(anyErr.message) : 'Send failed' };
}

/** True when a send failed only because the workspace has no BYOK Resend configured yet. */
export function isSenderNotConfiguredCode(code: string | null): boolean {
  return code === 'workspace_sender_required';
}

// Per-workspace client throttle so repeated blocked sends don't spam the admins' bells.
const NOTIFY_THROTTLE_MS = 30 * 60 * 1000; // 30 min
function throttleKey(workspaceId: string): string { return `email_byok_notify:${workspaceId}`; }
function recentlyNotified(workspaceId: string): boolean {
  try {
    const ts = Number(localStorage.getItem(throttleKey(workspaceId)) || 0);
    return ts > 0 && (Date.now() - ts) < NOTIFY_THROTTLE_MS;
  } catch { return false; }
}
function markNotified(workspaceId: string): void {
  try { localStorage.setItem(throttleKey(workspaceId), String(Date.now())); } catch { /* ignore */ }
}

/**
 * Fire the bell notification (via the Flows engine) to the workspace's OWNER + ADMINS telling
 * them a feature needs email but no BYOK sender is connected. Fire-and-forget; never throws.
 * The seeded `system-default` flow on `email_sender_not_configured` delivers one bell per
 * recipient. Throttled per workspace so retries don't spam.
 */
export async function notifyEmailSenderNotConfigured(params: {
  workspaceId: string | null | undefined;
  /** The feature that tried to send, e.g. 'quotes' | 'invoice' | 'crm_contact' | 'catalog'. */
  feature: string;
}): Promise<void> {
  const workspaceId = params.workspaceId;
  if (!workspaceId || recentlyNotified(workspaceId)) return;

  // Resolve who can actually fix it (owner/admins). Membership-guarded RPC; falls back to the
  // current user if the list can't be resolved, so a bell is still delivered.
  let recipients: string[] = [];
  try {
    const { data } = await supabase.rpc('get_workspace_notify_recipients', { p_workspace_id: workspaceId });
    recipients = Array.isArray(data) ? (data as unknown[]).map((r) => String((r as any)?.user_id ?? r)).filter(Boolean) : [];
  } catch { /* fall through to current-user fallback */ }
  if (recipients.length === 0) {
    try { const uid = (await supabase.auth.getUser()).data.user?.id; if (uid) recipients = [uid]; } catch { /* ignore */ }
  }
  if (recipients.length === 0) return;

  markNotified(workspaceId);
  await Promise.all(recipients.map((uid) =>
    flowEventService.emit('email_sender_not_configured', {
      workspace_id: workspaceId,
      user_id: uid,
      feature: params.feature,
      action_url: CONNECT_EMAIL_PATH,
      title: 'Connect your email to send',
      body: `The ${params.feature} feature tried to send an email, but this workspace hasn't connected its own email sender yet. Connect Resend to start sending from your own address.`,
      type: 'email_sender_not_configured',
    }),
  ));
}
