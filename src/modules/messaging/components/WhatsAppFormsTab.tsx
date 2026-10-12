/** WhatsApp forms: build a one-screen form, publish it, send it from a conversation, read what came back. */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Eye, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/utils/datetime';
import { messagingService } from '../services/messagingService';
import {
  WHATSAPP_FORM_FIELD_KINDS, WHATSAPP_FORM_FIELD_LABELS, WHATSAPP_FORM_LIMITS, WHATSAPP_FORM_PURPOSES,
  WHATSAPP_FORM_PURPOSE_LABELS, fieldKeyFrom, renderWhatsAppFormSubmission, validateWhatsAppForm,
  type WhatsAppFormField, type WhatsAppFormFieldKind, type WhatsAppFormPurpose, type WhatsAppFormStatus,
} from '../whatsappForms';

interface FormRow {
  id: string; name: string; purpose: WhatsAppFormPurpose; intro: string; cta: string; submit_label: string;
  fields: WhatsAppFormField[]; status: WhatsAppFormStatus; channel_id: string | null;
  validation_errors: Array<{ message?: string; error?: string }>; created_at: string; published_at: string | null;
}
interface ResponseRow { id: string; form_id: string | null; thread_id: string | null; data: Record<string, unknown>; received_at: string }
interface Channel { id: string; display_name: string | null; sender_id: string | null }

const STATUS_VARIANT: Record<WhatsAppFormStatus, 'neutral' | 'success' | 'warning'> = {
  draft: 'warning', published: 'success', deprecated: 'neutral',
};

type Draft = {
  id?: string; name: string; purpose: WhatsAppFormPurpose; intro: string; cta: string; submitLabel: string;
  channelId: string; fields: Array<WhatsAppFormField & { optionsText?: string }>;
};

const blankDraft = (channelId: string): Draft => ({
  name: '', purpose: 'order', intro: '', cta: 'Open form', submitLabel: 'Send', channelId,
  fields: [{ key: 'name', label: 'Your name', kind: 'text', required: true }],
});

function toFields(d: Draft): WhatsAppFormField[] {
  const taken = new Set<string>();
  return d.fields.map((f) => {
    const key = f.key && !taken.has(f.key) ? f.key : fieldKeyFrom(f.label, taken);
    taken.add(key);
    const out: WhatsAppFormField = { key, label: f.label, kind: f.kind, required: f.required };
    if (f.kind === 'dropdown') out.options = (f.optionsText ?? (f.options ?? []).join('\n')).split('\n').map((o) => o.trim()).filter(Boolean);
    if (f.helper?.trim()) out.helper = f.helper.trim();
    return out;
  });
}

export const WhatsAppFormsTab: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const [forms, setForms] = useState<FormRow[] | null>(null);
  const [responses, setResponses] = useState<ResponseRow[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    const [f, r, c] = await Promise.all([
      supabase.from('whatsapp_forms').select('*').eq('workspace_id', activeWorkspaceId).order('created_at', { ascending: false }),
      supabase.from('whatsapp_form_responses').select('id, form_id, thread_id, data, received_at')
        .eq('workspace_id', activeWorkspaceId).order('received_at', { ascending: false }).limit(50),
      supabase.from('messaging_channels').select('id, display_name, sender_id')
        .eq('workspace_id', activeWorkspaceId).eq('channel_type', 'whatsapp').not('zernio_account_id', 'is', null),
    ]);
    if (f.error) toast({ title: 'Could not load forms', description: f.error.message, variant: 'destructive' });
    setForms((f.data ?? []) as FormRow[]);
    setResponses((r.data ?? []) as ResponseRow[]);
    setChannels((c.data ?? []) as Channel[]);
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) {
      toast({ title: 'That did not work', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const save = () => run('save', async () => {
    if (!draft || !activeWorkspaceId) return;
    const res = await messagingService.whatsAppFormAction<{ validation_errors: Array<{ message?: string }> }>('whatsapp-form-save', {
      workspaceId: activeWorkspaceId, formId: draft.id, channelId: draft.channelId, name: draft.name, purpose: draft.purpose,
      intro: draft.intro, cta: draft.cta, submitLabel: draft.submitLabel, fields: toFields(draft),
    });
    if (res.validation_errors?.length) {
      toast({ title: 'Saved, but WhatsApp found problems', description: res.validation_errors.map((e) => e.message).join(' '), variant: 'destructive' });
    } else {
      toast({ title: 'Form saved as a draft', description: 'Preview it, then publish to send it to customers.' });
    }
    setDraft(null);
    await load();
  });

  const publish = (f: FormRow) => run(`publish:${f.id}`, async () => {
    await messagingService.whatsAppFormAction('whatsapp-form-publish', { formId: f.id });
    toast({ title: `${f.name} is published`, description: 'Send it from any WhatsApp conversation on this number.' });
    await load();
  });

  const retire = (f: FormRow) => run(`retire:${f.id}`, async () => {
    const res = await messagingService.whatsAppFormAction<{ deleted: boolean }>('whatsapp-form-retire', { formId: f.id });
    toast({ title: res.deleted ? 'Draft deleted' : `${f.name} retired`, description: res.deleted ? undefined : 'Customers can no longer open it. Its answers stay below.' });
    await load();
  });

  const preview = (f: FormRow) => run(`preview:${f.id}`, async () => {
    const res = await messagingService.whatsAppFormAction<{ url: string }>('whatsapp-form-preview', { formId: f.id });
    window.open(res.url, '_blank', 'noopener');
  });

  const edit = (f: FormRow, asCopy: boolean) => setDraft({
    id: asCopy ? undefined : f.id,
    name: asCopy ? `${f.name} v2`.slice(0, WHATSAPP_FORM_LIMITS.title) : f.name,
    purpose: f.purpose, intro: f.intro, cta: f.cta, submitLabel: f.submit_label, channelId: f.channel_id ?? channels[0]?.id ?? '',
    fields: f.fields.map((x) => ({ ...x, optionsText: (x.options ?? []).join('\n') })),
  });

  const formById = new Map((forms ?? []).map((f) => [f.id, f]));
  const problems = draft ? validateWhatsAppForm({ title: draft.name, fields: toFields(draft) }) : [];
  const setField = (i: number, patch: Partial<Draft['fields'][number]>) =>
    setDraft((d) => d && { ...d, fields: d.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>WhatsApp forms</CardTitle>
            <CardDescription>
              A form opens inside WhatsApp, so a customer answers in fields instead of a paragraph. The answers land in the
              conversation as a message — an order form feeds order intake exactly like a typed order.
            </CardDescription>
          </div>
          <Button onClick={() => setDraft(blankDraft(channels[0]?.id ?? ''))} disabled={!channels.length}>
            <Plus className="h-4 w-4 mr-1" /> New form
          </Button>
        </CardHeader>
        <CardContent>
          {forms === null ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : forms.length === 0 ? (
            <HubEmptyState
              icon={ClipboardList}
              title={channels.length ? 'No forms yet' : 'Connect a WhatsApp number first'}
              description={channels.length
                ? 'Build an order, booking or lead form and send it from any WhatsApp conversation.'
                : 'Forms are sent from a WhatsApp number on this workspace.'}
              action={channels.length
                ? <Button onClick={() => setDraft(blankDraft(channels[0].id))}><Plus className="h-4 w-4 mr-1" /> New form</Button>
                : <Button variant="outline" asChild><Link to="/profile?tab=social-accounts&section=wa-numbers">Get a number</Link></Button>}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Form</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead className="text-right">Fields</TableHead>
                  <TableHead className="text-right">Answers</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {forms.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>
                      <div className="font-medium">{f.name}</div>
                      {f.validation_errors?.length > 0 && (
                        <div className="text-xs text-destructive">{f.validation_errors.map((e) => e.message ?? e.error).join(' ')}</div>
                      )}
                    </TableCell>
                    <TableCell>{WHATSAPP_FORM_PURPOSE_LABELS[f.purpose]}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.fields.length}</TableCell>
                    <TableCell className="text-right tabular-nums">{responses.filter((r) => r.form_id === f.id).length}</TableCell>
                    <TableCell><Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {f.status !== 'deprecated' && (
                        <Button size="sm" variant="ghost" onClick={() => void preview(f)} disabled={busy === `preview:${f.id}`} title="Preview in WhatsApp's renderer">
                          <Eye className="h-4 w-4" />
                        </Button>
                      )}
                      {f.status === 'draft' && <Button size="sm" variant="outline" onClick={() => edit(f, false)}>Edit</Button>}
                      {f.status === 'draft' && (
                        <Button size="sm" variant="secondary" className="ml-1" onClick={() => void publish(f)}
                          disabled={busy === `publish:${f.id}` || f.validation_errors?.length > 0}>
                          {busy === `publish:${f.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 mr-1" />} Publish
                        </Button>
                      )}
                      {f.status !== 'draft' && <Button size="sm" variant="outline" onClick={() => edit(f, true)}>New version</Button>}
                      {f.status !== 'deprecated' && (
                        <Button size="sm" variant="ghost" className="ml-1" onClick={() => void retire(f)} disabled={busy === `retire:${f.id}`}
                          title={f.status === 'draft' ? 'Delete draft' : 'Retire: customers can no longer open it'}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Latest answers</CardTitle>
          <CardDescription>The last 50 submissions. Each one is also a message in its conversation.</CardDescription>
        </CardHeader>
        <CardContent>
          {responses.length === 0 ? (
            <HubEmptyState
              icon={Send}
              title="No answers yet"
              description="Send a published form from a WhatsApp conversation in the Inbox."
              action={<Button variant="outline" asChild><Link to="/inbox">Open the Inbox</Link></Button>}
            />
          ) : (
            <div className="divide-y divide-hairline">
              {responses.map((r) => {
                const f = r.form_id ? formById.get(r.form_id) : undefined;
                return (
                  <div key={r.id} className="py-3 text-sm">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{formatDate(r.received_at)}</span>
                      {r.thread_id && <Link className="text-primary underline" to={`/inbox?thread=${r.thread_id}`}>Open conversation</Link>}
                    </div>
                    <pre className="whitespace-pre-wrap font-sans">{renderWhatsAppFormSubmission(f ? { name: f.name, fields: f.fields } : null, r.data)}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {draft && (
        <Dialog open onOpenChange={(o) => !o && setDraft(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{draft.id ? 'Edit form' : 'New WhatsApp form'}</DialogTitle>
              <DialogDescription>Saved as a draft. Meta checks it on save; publishing makes it sendable and freezes it.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Title</Label>
                <Input value={draft.name} maxLength={WHATSAPP_FORM_LIMITS.title} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Order request" />
              </div>
              <div className="space-y-1.5">
                <Label>Purpose</Label>
                <Select value={draft.purpose} onValueChange={(v) => setDraft({ ...draft, purpose: v as WhatsAppFormPurpose })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_FORM_PURPOSES.map((p) => <SelectItem key={p} value={p}>{WHATSAPP_FORM_PURPOSE_LABELS[p]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {!draft.id && channels.length > 1 && (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>WhatsApp number</Label>
                  <Select value={draft.channelId} onValueChange={(v) => setDraft({ ...draft, channelId: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {channels.map((c) => <SelectItem key={c.id} value={c.id}>{c.display_name || c.sender_id}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Message sent with the form</Label>
                <Textarea rows={2} value={draft.intro} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} placeholder="Tell us what you need and we will confirm the order." />
              </div>
              <div className="space-y-1.5">
                <Label>Button text</Label>
                <Input value={draft.cta} maxLength={WHATSAPP_FORM_LIMITS.cta} onChange={(e) => setDraft({ ...draft, cta: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Submit button</Label>
                <Input value={draft.submitLabel} maxLength={WHATSAPP_FORM_LIMITS.submit} onChange={(e) => setDraft({ ...draft, submitLabel: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <Label>Fields</Label>
              {draft.fields.map((f, i) => (
                <div key={i} className="rounded-sm border border-hairline p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Input className="flex-1 min-w-[10rem]" value={f.label} placeholder="Label" onChange={(e) => setField(i, { label: e.target.value, key: '' })} />
                    <Select value={f.kind} onValueChange={(v) => setField(i, { kind: v as WhatsAppFormFieldKind })}>
                      <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {WHATSAPP_FORM_FIELD_KINDS.map((k) => <SelectItem key={k} value={k}>{WHATSAPP_FORM_FIELD_LABELS[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Switch checked={f.required} onCheckedChange={(v) => setField(i, { required: v })} /> Required
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => setDraft({ ...draft, fields: draft.fields.filter((_, j) => j !== i) })} title="Remove field">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  {f.kind === 'dropdown' && (
                    <Textarea rows={3} placeholder="One option per line" value={f.optionsText ?? (f.options ?? []).join('\n')}
                      onChange={(e) => setField(i, { optionsText: e.target.value })} />
                  )}
                  <Input value={f.helper ?? ''} maxLength={WHATSAPP_FORM_LIMITS.helper} placeholder="Hint (optional)" onChange={(e) => setField(i, { helper: e.target.value })} />
                </div>
              ))}
              {draft.fields.length < WHATSAPP_FORM_LIMITS.fields && (
                <Button size="sm" variant="outline" onClick={() => setDraft({ ...draft, fields: [...draft.fields, { key: '', label: '', kind: 'text', required: false }] })}>
                  <Plus className="h-4 w-4 mr-1" /> Add field
                </Button>
              )}
            </div>

            {problems.length > 0 && (
              <ul className="text-xs text-destructive list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              <Button onClick={() => void save()} disabled={busy === 'save' || problems.length > 0}>
                {busy === 'save' && <Loader2 className="h-4 w-4 mr-1 animate-spin" />} Save draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};
