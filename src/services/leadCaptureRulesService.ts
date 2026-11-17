import { supabase } from '@/integrations/supabase/client';
import type { LeadCaptureChannel, LeadCaptureField, LeadCaptureMode } from '@/modules/crm/leadVocabulary';

export interface LeadCaptureRule {
  id: string;
  workspace_id: string;
  label: string;
  channel: LeadCaptureChannel;
  match_field: LeadCaptureField;
  match_mode: LeadCaptureMode;
  pattern: string;
  mail_account_id: string | null;
  enabled: boolean;
  match_count: number;
  last_matched_at: string | null;
}

export interface LeadCaptureRuleInput {
  label: string;
  channel: LeadCaptureChannel;
  match_field: LeadCaptureField;
  match_mode: LeadCaptureMode;
  pattern: string;
  mail_account_id: string | null;
}

const SELECT = 'id, workspace_id, label, channel, match_field, match_mode, pattern, mail_account_id, enabled, match_count, last_matched_at';

const table = () => supabase.from('lead_capture_rules');

function payload(input: LeadCaptureRuleInput) {
  const email = input.channel === 'email';
  return {
    label: input.label.trim(),
    channel: input.channel,
    match_field: email ? input.match_field : 'body',
    match_mode: input.match_mode,
    pattern: input.pattern.trim(),
    mail_account_id: email ? input.mail_account_id : null,
  };
}

export const leadCaptureRulesService = {
  async list(workspaceId: string): Promise<LeadCaptureRule[]> {
    const { data, error } = await table().select(SELECT).eq('workspace_id', workspaceId).order('created_at', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as LeadCaptureRule[];
  },
  async create(workspaceId: string, input: LeadCaptureRuleInput): Promise<void> {
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await table().insert({ workspace_id: workspaceId, assign_to_user_id: auth.user?.id ?? null, ...payload(input) });
    if (error) throw new Error(error.message);
  },
  async update(id: string, input: LeadCaptureRuleInput): Promise<void> {
    const { error } = await table().update({ ...payload(input), updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const { error } = await table().update({ enabled, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw new Error(error.message);
  },
  async remove(id: string): Promise<void> {
    const { error } = await table().delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
