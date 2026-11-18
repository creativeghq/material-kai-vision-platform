import React, { useEffect, useState } from 'react';

import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import {
  LEAD_CAPTURE_CHANNELS, LEAD_CAPTURE_CHANNEL_LABEL, LEAD_CAPTURE_FIELDS, LEAD_CAPTURE_FIELD_LABEL,
  LEAD_CAPTURE_MODES, LEAD_CAPTURE_MODE_LABEL,
} from '@/modules/crm/leadVocabulary';
import { gmailApi, type MailAccount } from '@/services/gmailApi';
import type { InquiryReceivedTriggerConfig } from '@/services/flows/types';

export const InquiryTriggerFields: React.FC<{
  config: InquiryReceivedTriggerConfig;
  onChange: (next: InquiryReceivedTriggerConfig) => void;
  flowId?: string;
}> = ({ config, onChange, flowId }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [leads, setLeads] = useState<number | null>(null);
  const workspaceId = config.workspace_id || activeWorkspaceId || '';
  const channel = config.channel ?? 'email';

  useEffect(() => {
    if (activeWorkspaceId && !config.workspace_id) onChange({ ...config, workspace_id: activeWorkspaceId });
  }, [activeWorkspaceId, config, onChange]);

  useEffect(() => {
    if (!workspaceId) return;
    gmailApi.status(workspaceId).then((s) => setAccounts(s.accounts.filter((a) => a.status === 'active'))).catch(() => setAccounts([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!flowId) return;
    void supabase.from('crm_leads').select('id', { count: 'exact', head: true }).eq('capture_flow_id', flowId)
      .then(({ count }) => setLeads(count ?? 0));
  }, [flowId]);

  const set = (patch: Partial<InquiryReceivedTriggerConfig>) => onChange({ ...config, workspace_id: workspaceId, ...patch });

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted-foreground">
        A message that matches is an inquiry; the steps after this trigger decide what happens to it. Only one lead is ever
        created per conversation. A personal mailbox is read only for messages this trigger matches.
        {leads !== null && ` This flow has created ${leads} lead${leads === 1 ? '' : 's'}.`}
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Channel</Label>
        <Select value={channel} onValueChange={(v) => set(v === 'whatsapp'
          ? { channel: 'whatsapp', match_field: 'body', mail_account_id: undefined }
          : { channel: 'email' })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAD_CAPTURE_CHANNELS.map((c) => <SelectItem key={c} value={c}>{LEAD_CAPTURE_CHANNEL_LABEL[c]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {channel === 'email' && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">Mailbox</Label>
            <Select value={config.mail_account_id ?? ''} onValueChange={(v) => set({ mail_account_id: v })}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder={accounts.length ? 'Choose a mailbox' : 'Connect Gmail in the Inbox first'} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Look In</Label>
            <Select value={config.match_field ?? 'subject'} onValueChange={(v) => set({ match_field: v as InquiryReceivedTriggerConfig['match_field'] })}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_CAPTURE_FIELDS.map((f) => <SelectItem key={f} value={f}>{LEAD_CAPTURE_FIELD_LABEL[f]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <div className="space-y-1.5">
        <Label className="text-xs">Match</Label>
        <Select value={config.match_mode ?? 'starts_with'} onValueChange={(v) => set({ match_mode: v as InquiryReceivedTriggerConfig['match_mode'] })}>
          <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {LEAD_CAPTURE_MODES.map((m) => <SelectItem key={m} value={m}>{LEAD_CAPTURE_MODE_LABEL[m]}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">Text</Label>
        <Input value={config.pattern ?? ''} onChange={(e) => set({ pattern: e.target.value })} placeholder="MaterialsHub inquiry" className="h-8 text-sm" />
        <p className="text-[11px] text-muted-foreground">Case-insensitive, at least 3 characters.</p>
      </div>
    </div>
  );
};
