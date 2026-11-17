import type { SupabaseClient } from '@supabase/supabase-js';
import { emitFlowEvent } from '../flow-events.ts';
import type { CapturedLeadFields, LeadCaptureRule } from './leadCapture.ts';

type Db = SupabaseClient;

const RULE_COLUMNS = 'id, workspace_id, label, channel, match_field, match_mode, pattern, mail_account_id, assign_to_user_id';

export async function loadLeadCaptureRules(
  db: Db, filter: { channel: 'email' | 'whatsapp'; workspaceId?: string },
): Promise<LeadCaptureRule[]> {
  let q = db.from('lead_capture_rules').select(RULE_COLUMNS).eq('enabled', true).eq('channel', filter.channel);
  if (filter.workspaceId) q = q.eq('workspace_id', filter.workspaceId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(`lead capture rules unreadable: ${error.message}`);
  return (data ?? []) as LeadCaptureRule[];
}

export async function reportInquiry(
  db: Db, rule: LeadCaptureRule, sourceRef: string, fields: CapturedLeadFields, receivedAt: string,
): Promise<void> {
  const { error } = await db.rpc('record_lead_capture_match', { p_rule_id: rule.id });
  if (error) console.error('[lead-capture] match not counted', rule.id, error.message);
  const who = fields.name || fields.phone || fields.email || 'Someone';
  const via = rule.channel === 'whatsapp' ? 'WhatsApp' : 'email';
  await emitFlowEvent('inquiry_received', {
    type: 'inquiry_received',
    workspace_id: rule.workspace_id,
    user_id: rule.assign_to_user_id ?? undefined,
    rule_id: rule.id,
    rule_label: rule.label,
    channel: rule.channel,
    source_ref: sourceRef,
    received_at: receivedAt,
    lead_name: fields.name ?? '',
    lead_email: fields.email ?? '',
    lead_phone: fields.phone ?? '',
    lead_title: fields.title ?? '',
    lead_request: fields.request ?? '',
    title: `New lead via ${via}: ${who}`,
    body: fields.title ?? fields.request?.slice(0, 200) ?? '',
    action_url: sourceRef.startsWith('whatsapp:') ? `/inbox?thread=${sourceRef.slice('whatsapp:'.length)}` : '/inbox?src=gmail',
  });
}
