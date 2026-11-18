import type { SupabaseClient } from '@supabase/supabase-js';
import { emitFlowEvent } from '../flow-events.ts';
import type { CapturedLeadFields, InquirySource } from './leadCapture.ts';

type Db = SupabaseClient;

const CONFIG_KEYS = ['workspace_id', 'channel', 'mail_account_id', 'match_field', 'match_mode', 'pattern'] as const;

export async function loadInquirySources(
  db: Db, filter: { channel: 'email' | 'whatsapp'; workspaceId?: string },
): Promise<InquirySource[]> {
  let q = db.from('flows').select('id, name, created_by, trigger_config')
    .eq('trigger_type', 'inquiry_received').eq('status', 'active').eq('is_global', true)
    .eq('trigger_config->>channel', filter.channel);
  if (filter.workspaceId) q = q.eq('trigger_config->>workspace_id', filter.workspaceId);
  const { data, error } = await q.order('created_at', { ascending: true });
  if (error) throw new Error(`Inquiry Received flows unreadable: ${error.message}`);
  return (data ?? []).flatMap((f) => {
    const c = (f.trigger_config ?? {}) as Record<string, string | undefined>;
    if (!c.workspace_id || !c.pattern || c.pattern.trim().length < 3) return [];
    if (c.channel === 'email' && !c.mail_account_id) return [];
    return [{
      flow_id: f.id, name: f.name, created_by: f.created_by, workspace_id: c.workspace_id,
      channel: c.channel as InquirySource['channel'],
      match_field: c.channel === 'whatsapp' ? 'body' : (c.match_field === 'body' ? 'body' : 'subject'),
      match_mode: c.match_mode === 'contains' ? 'contains' : 'starts_with',
      pattern: c.pattern, mail_account_id: c.mail_account_id ?? null, trigger_config: c,
    } satisfies InquirySource];
  });
}

export async function reportInquiry(
  source: InquirySource, sourceRef: string, fields: CapturedLeadFields, receivedAt: string,
): Promise<void> {
  const match = Object.fromEntries(CONFIG_KEYS.map((k) => [k, source.trigger_config[k] ?? '']));
  const who = fields.name || fields.phone || fields.email || 'Someone';
  const via = source.channel === 'whatsapp' ? 'WhatsApp' : 'email';
  await emitFlowEvent('inquiry_received', {
    ...match,
    type: 'inquiry_received',
    workspace_id: source.workspace_id,
    user_id: source.created_by ?? undefined,
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
