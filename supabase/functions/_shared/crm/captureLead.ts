import type { SupabaseClient } from '@supabase/supabase-js';
import { emitFlowEvent } from '../flow-events.ts';
import type { CapturedLeadFields, LeadCaptureRule } from './leadCapture.ts';

type Db = SupabaseClient;

const RULE_COLUMNS = 'id, workspace_id, label, channel, match_field, match_mode, pattern, mail_account_id';

export async function loadLeadCaptureRules(
  db: Db, filter: { channel: 'email' | 'whatsapp'; workspaceId?: string; mailAccountIds?: string[] },
): Promise<LeadCaptureRule[]> {
  let q = db.from('lead_capture_rules').select(RULE_COLUMNS).eq('enabled', true).eq('channel', filter.channel);
  if (filter.workspaceId) q = q.eq('workspace_id', filter.workspaceId);
  if (filter.mailAccountIds) q = q.in('mail_account_id', filter.mailAccountIds);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(`lead capture rules unreadable: ${error.message}`);
  return (data ?? []) as LeadCaptureRule[];
}

export async function captureInboundLead(
  db: Db, rule: LeadCaptureRule, sourceRef: string, fields: CapturedLeadFields, receivedAt: string,
): Promise<{ leadId: string | null; created: boolean }> {
  const { data, error } = await db.rpc('capture_inbound_lead', {
    p_rule_id: rule.id, p_source_ref: sourceRef, p_name: fields.name, p_email: fields.email,
    p_phone: fields.phone, p_title: fields.title, p_request: fields.request, p_received_at: receivedAt,
  });
  if (error) throw new Error(`capture_inbound_lead failed: ${error.message}`);
  const r = (data ?? {}) as { lead_id?: string; created?: boolean; owner_user_id?: string | null };
  const leadId = r.lead_id ?? null;
  if (r.created && leadId) {
    const who = fields.name || fields.phone || fields.email || 'Someone';
    const via = rule.channel === 'whatsapp' ? 'WhatsApp' : 'email';
    await emitFlowEvent('crm_lead_captured', {
      type: 'crm_lead_captured',
      workspace_id: rule.workspace_id,
      user_id: r.owner_user_id ?? undefined,
      lead_id: leadId,
      channel: rule.channel,
      rule_id: rule.id,
      rule_label: rule.label,
      lead_name: fields.name,
      lead_email: fields.email,
      lead_phone: fields.phone,
      lead_title: fields.title,
      source_ref: sourceRef,
      title: `New lead via ${via}: ${who}`,
      body: fields.title ?? fields.request?.slice(0, 200) ?? '',
      action_url: `/crm/leads/${leadId}`,
    }).catch((e) => console.error('[lead-capture] lead created but crm_lead_captured not emitted', leadId, e));
  }
  return { leadId, created: !!r.created };
}
