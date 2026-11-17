import React, { useCallback, useEffect, useState } from 'react';
import { Mail, MessageCircle, Pencil, Plus, Trash2, Zap } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import {
  LEAD_CAPTURE_CHANNELS, LEAD_CAPTURE_CHANNEL_LABEL, LEAD_CAPTURE_FIELDS, LEAD_CAPTURE_FIELD_LABEL,
  LEAD_CAPTURE_MODES, LEAD_CAPTURE_MODE_LABEL, type LeadCaptureChannel, type LeadCaptureField, type LeadCaptureMode,
} from '@/modules/crm/leadVocabulary';
import { leadCaptureRulesService, type LeadCaptureRule, type LeadCaptureRuleInput } from '@/services/leadCaptureRulesService';
import { gmailApi, type MailAccount } from '@/services/gmailApi';

const EMPTY: LeadCaptureRuleInput = {
  label: '', channel: 'whatsapp', match_field: 'body', match_mode: 'contains', pattern: '', mail_account_id: null,
};

export const LeadCaptureRulesDialog: React.FC<{ workspaceId: string; open: boolean; onClose: () => void }> = ({ workspaceId, open, onClose }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<LeadCaptureRule[]>([]);
  const [accounts, setAccounts] = useState<MailAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<{ id: string | null; form: LeadCaptureRuleInput } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rows, status] = await Promise.all([
        leadCaptureRulesService.list(workspaceId),
        gmailApi.status(workspaceId).catch(() => ({ configured: false, accounts: [] as MailAccount[] })),
      ]);
      setRules(rows);
      setAccounts(status.accounts.filter((a) => a.status === 'active'));
    } catch (e) {
      toast({ title: 'Could not load capture rules', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [workspaceId, toast]);

  useEffect(() => { if (open) void load(); }, [open, load]);

  const mailboxName = (id: string | null) => accounts.find((a) => a.id === id)?.email ?? 'A mailbox you cannot see';

  const startNew = () => setEditing({ id: null, form: { ...EMPTY } });
  const startEdit = (r: LeadCaptureRule) => setEditing({
    id: r.id,
    form: { label: r.label, channel: r.channel, match_field: r.match_field, match_mode: r.match_mode, pattern: r.pattern, mail_account_id: r.mail_account_id },
  });
  const setForm = (patch: Partial<LeadCaptureRuleInput>) => setEditing((e) => (e ? { ...e, form: { ...e.form, ...patch } } : e));

  const form = editing?.form;
  const valid = !!form && form.label.trim() !== '' && form.pattern.trim().length >= 3 && (form.channel === 'whatsapp' || !!form.mail_account_id);

  const save = async () => {
    if (!editing || !valid || saving) return;
    setSaving(true);
    try {
      if (editing.id) await leadCaptureRulesService.update(editing.id, editing.form);
      else await leadCaptureRulesService.create(workspaceId, editing.form);
      setEditing(null);
      await load();
    } catch (e) {
      toast({ title: 'Could not save the rule', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (r: LeadCaptureRule, enabled: boolean) => {
    setRules((rows) => rows.map((x) => (x.id === r.id ? { ...x, enabled } : x)));
    try {
      await leadCaptureRulesService.setEnabled(r.id, enabled);
    } catch (e) {
      setRules((rows) => rows.map((x) => (x.id === r.id ? { ...x, enabled: !enabled } : x)));
      toast({ title: 'Could not change the rule', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const remove = async (r: LeadCaptureRule) => {
    if (!window.confirm(`Delete the rule "${r.label}"? Leads it already created are kept.`)) return;
    try {
      await leadCaptureRulesService.remove(r.id);
      await load();
    } catch (e) {
      toast({ title: 'Could not delete the rule', description: (e as Error).message, variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setEditing(null); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lead capture rules</DialogTitle>
          <DialogDescription>
            An incoming email or WhatsApp message that matches a rule becomes a lead automatically — one lead per conversation,
            assigned to you. Replying moves it from New to Contacted. What happens next is a flow: Automations → Lead Captured.
          </DialogDescription>
        </DialogHeader>

        {editing && form ? (
          <div className="space-y-4">
            <FormSection title={editing.id ? 'Edit rule' : 'New rule'}>
              <FormGrid>
                <FormField label="Name">
                  <Input value={form.label} onChange={(e) => setForm({ label: e.target.value })} placeholder="Website contact form" />
                </FormField>
                <FormField label="Channel">
                  <Select value={form.channel} onValueChange={(v) => setForm({ channel: v as LeadCaptureChannel, match_field: v === 'whatsapp' ? 'body' : form.match_field })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_CAPTURE_CHANNELS.map((c) => <SelectItem key={c} value={c}>{LEAD_CAPTURE_CHANNEL_LABEL[c]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                {form.channel === 'email' && (
                  <FormField label="Mailbox" hint="Only messages this rule matches are ever read from a personal mailbox.">
                    <Select value={form.mail_account_id ?? ''} onValueChange={(v) => setForm({ mail_account_id: v })}>
                      <SelectTrigger><SelectValue placeholder={accounts.length ? 'Choose a mailbox' : 'Connect Gmail in the Inbox first'} /></SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.email}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                {form.channel === 'email' && (
                  <FormField label="Look In">
                    <Select value={form.match_field} onValueChange={(v) => setForm({ match_field: v as LeadCaptureField })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {LEAD_CAPTURE_FIELDS.map((f) => <SelectItem key={f} value={f}>{LEAD_CAPTURE_FIELD_LABEL[f]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </FormField>
                )}
                <FormField label="Match">
                  <Select value={form.match_mode} onValueChange={(v) => setForm({ match_mode: v as LeadCaptureMode })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAD_CAPTURE_MODES.map((m) => <SelectItem key={m} value={m}>{LEAD_CAPTURE_MODE_LABEL[m]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Text" hint="Case-insensitive. At least 3 characters.">
                  <Input value={form.pattern} onChange={(e) => setForm({ pattern: e.target.value })} placeholder="MaterialsHub inquiry" />
                </FormField>
              </FormGrid>
            </FormSection>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={() => void save()} disabled={!valid || saving}>{saving ? 'Saving…' : 'Save rule'}</Button>
            </DialogFooter>
          </div>
        ) : !loading && rules.length === 0 ? (
          <HubEmptyState
            icon={Zap}
            title="No capture rules yet"
            description="Add one for each way enquiries reach you, e.g. the subject your website form sends."
            action={<Button size="sm" onClick={startNew}><Plus className="h-4 w-4 mr-1" />New rule</Button>}
          />
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-start gap-3 rounded-sm border border-hairline p-3">
                {r.channel === 'email' ? <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" /> : <MessageCircle className="h-4 w-4 mt-0.5 text-muted-foreground" />}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{r.label}</span>
                    <Badge variant={r.enabled ? 'success' : 'neutral'}>{r.enabled ? 'On' : 'Off'}</Badge>
                  </div>
                  <div className="text-xs text-muted-foreground break-words">
                    {LEAD_CAPTURE_CHANNEL_LABEL[r.channel]}
                    {r.channel === 'email' ? ` · ${mailboxName(r.mail_account_id)}` : ''}
                    {' · '}{LEAD_CAPTURE_FIELD_LABEL[r.match_field]} {LEAD_CAPTURE_MODE_LABEL[r.match_mode].toLowerCase()} “{r.pattern}”
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.match_count > 0 && r.last_matched_at
                      ? `Matched ${r.match_count} time${r.match_count === 1 ? '' : 's'}, last ${formatDate(r.last_matched_at)}`
                      : 'Has not matched anything yet'}
                  </div>
                </div>
                <Switch checked={r.enabled} onCheckedChange={(v) => void toggle(r, v)} aria-label={`Turn ${r.label} ${r.enabled ? 'off' : 'on'}`} />
                <Button size="icon" variant="ghost" aria-label="Edit rule" onClick={() => startEdit(r)}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" aria-label="Delete rule" onClick={() => void remove(r)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-4 w-4 mr-1" />New rule</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
