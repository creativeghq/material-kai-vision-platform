// deno-lint-ignore-file no-explicit-any
import type { SupabaseClient } from '@supabase/supabase-js';

type DbClient = SupabaseClient<any, 'public', 'public', any, any>;

/** Resolve a template for SENDING (#359 CM-3). */
export async function resolveSendableTemplate(
  db: DbClient,
  workspaceId: string,
  templateId: string,
): Promise<{ template: any } | { error: string }> {
  const { data, error } = await db
    .from('messaging_templates')
    .select('*')
    .eq('id', templateId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) return { error: `Could not load the template: ${error.message}` };
  // 404-shaped for both "no such template" and "not yours" — invariant 1, no id enumeration.
  if (!data) return { error: 'Template not found.' };
  if (data.is_active === false) return { error: 'That template is not active.' };
  if (data.approval_status !== 'approved') {
    return { error: `That template is not approved by Meta (status: ${data.approval_status ?? 'unknown'}). Submit it for approval first.` };
  }
  if (!data.whatsapp_template_name) {
    return { error: 'That template has no approved WhatsApp template name, so it cannot be sent as a template.' };
  }
  return { template: data };
}

/** E.164 for the provider, and a REFUSAL when the number is not in international form (#359 CM-1). */
export function toE164(phone: string): string | null {
  const raw = String(phone || '').trim();
  const intl = /^\+/.test(raw) ? raw.slice(1) : /^00/.test(raw) ? raw.slice(2) : null;
  if (intl === null) return null;
  const digits = intl.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return `+${digits}`;
}

/** May we send to this number at all? (#359 CM-1 / CM-2) */
export async function whyNotSendable(
  db: DbClient,
  opts: { workspaceId: string; to: string; isTemplate: boolean },
): Promise<string | null> {
  const { data: optedOut, error: optErr } = await db.rpc('messaging_number_is_opted_out', {
    p_workspace_id: opts.workspaceId,
    p_phone: opts.to,
    p_channel_type: 'whatsapp',
  });
  // FAIL CLOSED. A compliance check that switches itself off when it cannot run is the one shape
  // that guarantees the violation happens on the day the database is unwell.
  if (optErr) return 'Could not check the opt-out list; the message was not sent.';
  if (optedOut === true) return 'This number has opted out of WhatsApp messages.';

  // A template is allowed outside the window — that is what templates are FOR. Only a freeform
  // body is bounded by it.
  if (opts.isTemplate) return null;

  const { data: open, error: winErr } = await db.rpc('whatsapp_service_window_open', {
    p_workspace_id: opts.workspaceId,
    p_phone: opts.to,
  });
  if (winErr) return 'Could not check the 24-hour service window; the message was not sent.';
  if (open !== true) {
    return 'Outside the 24-hour window: Meta only allows a free-form message within 24 hours of the '
      + 'customer\'s last message. Send an approved template instead.';
  }
  return null;
}

/** Best-effort refund of a pre-charged WhatsApp credit when the send fails (invariant #10). */
export async function refundWhatsAppCredits(
  supabaseClient: DbClient,
  userId: string,
  credits: number,
  to: string,
): Promise<void> {
  if (!(credits > 0)) return;
  await supabaseClient.rpc('refund_credits', {
    p_user_id: userId,
    p_amount: credits,
    p_operation_type: 'messaging_whatsapp_refund',
    p_description: 'Refund: WhatsApp send failed',
    p_metadata: { to },
    p_workspace_id: null,
  }).then(() => {}, () => {});
}

export function renderTemplate(content: string, variables: Record<string, string>): string {
  let out = content || '';
  for (const [k, v] of Object.entries(variables || {})) {
    out = out.replace(new RegExp(`{{${k}}}`, 'g'), v ?? '');
  }
  return out;
}

/** Build ordered WhatsApp template body params from the template's declared variable order. */
export function orderedTemplateParams(template: any, variables: Record<string, string>): string[] {
  const names: string[] = Array.isArray(template?.variables) ? template.variables : [];
  return names.map((name) => String(variables?.[name] ?? ''));
}
