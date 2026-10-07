import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { inboxApi, type InboxLabel } from '@/services/inboxApi';
import { humanizeLabel } from '@/utils/humanize';
import type { Json } from '@/integrations/supabase/types';

interface Option { id: string; name: string }
interface Category extends Option { kind: string }
interface Preview { sendable: number; opted_out: number; no_country_code: number; sample: Array<{ name: string | null; phone: string }> }
interface AudienceFilter { inbox_label_ids: string[]; crm_category_ids: string[]; contact_tags: string[]; all_whatsapp_contacts: boolean }

/** Team-facing categories describe colleagues, never an audience for a customer broadcast. */
const NON_AUDIENCE_KINDS = new Set(['role', 'employment']);

export const WhatsAppCampaignDialog: React.FC<{ workspaceId: string; onClose: () => void; onCreated: () => void }> = ({ workspaceId, onClose, onCreated }) => {
  const { toast } = useToast();
  const [name, setName] = useState('');
  const [channels, setChannels] = useState<Option[] | null>(null);
  const [templates, setTemplates] = useState<Option[] | null>(null);
  const [labels, setLabels] = useState<InboxLabel[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [channelId, setChannelId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [filter, setFilter] = useState<AudienceFilter>({ inbox_label_ids: [], crm_category_ids: [], contact_tags: [], all_whatsapp_contacts: false });
  const [tagText, setTagText] = useState('');
  const [sendAt, setSendAt] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const [ch, tp, cats] = await Promise.all([
        supabase.from('messaging_channels').select('id, display_name, sender_id').eq('workspace_id', workspaceId)
          .eq('channel_type', 'whatsapp').neq('is_active', false),
        supabase.from('messaging_templates').select('id, name').eq('workspace_id', workspaceId).eq('channel_type', 'whatsapp')
          .eq('approval_status', 'approved').neq('is_active', false).not('whatsapp_template_name', 'is', null).order('name'),
        supabase.from('crm_categories').select('id, name, kind').eq('is_active', true).order('name'),
      ]);
      const chRows = (ch.data ?? []).map((c) => ({ id: c.id, name: c.display_name || c.sender_id || 'WhatsApp number' }));
      setChannels(chRows);
      if (chRows.length === 1) setChannelId(chRows[0].id);
      setTemplates((tp.data ?? []).map((t) => ({ id: t.id, name: t.name })));
      setCategories(((cats.data ?? []) as Array<{ id: string; name: string; kind: string }>).filter((c) => !NON_AUDIENCE_KINDS.has(String(c.kind))));
      try { setLabels((await inboxApi.listLabels(workspaceId)).labels); } catch { setLabels([]); }
    })();
  }, [workspaceId]);

  const effective = useMemo<AudienceFilter>(() => ({
    ...filter, contact_tags: tagText.split(',').map((t) => t.trim()).filter(Boolean),
  }), [filter, tagText]);
  const hasAudience = effective.all_whatsapp_contacts || effective.inbox_label_ids.length > 0
    || effective.crm_category_ids.length > 0 || effective.contact_tags.length > 0;

  useEffect(() => {
    if (!hasAudience) { setPreview(null); return; }
    let live = true;
    setPreviewing(true);
    const timer = setTimeout(() => {
      void supabase.rpc('whatsapp_audience_preview', { p_workspace_id: workspaceId, p_filter: effective as unknown as Json })
        .then(({ data, error }) => {
          if (!live) return;
          setPreviewing(false);
          if (error) { setPreview(null); toast({ title: 'Could not count the audience', description: error.message, variant: 'destructive' }); return; }
          setPreview(data as unknown as Preview);
        });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [effective, hasAudience, workspaceId, toast]);

  const toggle = (key: 'inbox_label_ids' | 'crm_category_ids', id: string) =>
    setFilter((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const chip = (on: boolean) => `h-7 px-2.5 rounded-sm border text-xs ${on ? 'border-primary/50 bg-primary/[0.08] text-primary' : 'border-hairline text-muted-foreground hover:text-foreground'}`;
  const categoriesByKind = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of categories) m.set(c.kind, [...(m.get(c.kind) ?? []), c]);
    return [...m.entries()];
  }, [categories]);

  const create = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_whatsapp_campaign', {
      p_workspace_id: workspaceId, p_name: name.trim(), p_template_id: templateId, p_channel_id: channelId,
      p_filter: effective as unknown as Json, p_scheduled_at: sendAt ? new Date(sendAt).toISOString() : null,
    });
    setBusy(false);
    if (error) { toast({ title: 'Campaign not created', description: error.message, variant: 'destructive' }); return; }
    const count = (data as { recipient_count?: number } | null)?.recipient_count ?? 0;
    toast({
      title: sendAt ? 'Campaign scheduled' : 'Campaign saved as a draft',
      description: `${count.toLocaleString()} recipients. ${sendAt ? 'It starts at the time you picked.' : 'Press Start on the campaign to send it.'}`,
    });
    onCreated();
    onClose();
  };

  const missingSetup = channels !== null && templates !== null && (!channels.length || !templates.length);
  const canCreate = !!name.trim() && !!channelId && !!templateId && !!preview?.sendable && !busy;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New WhatsApp Campaign</DialogTitle>
          <DialogDescription>Pick who receives it, then an approved template. Nothing is sent until you start it.</DialogDescription>
        </DialogHeader>

        {missingSetup ? (
          <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-sm space-y-2">
            {!channels?.length && <p>This workspace has no active WhatsApp number to send from.</p>}
            {!templates?.length && <p>There is no approved WhatsApp template yet. Meta only allows templates for broadcast messages.</p>}
            <p className="text-muted-foreground">Add and submit one on the Templates tab of this page, then come back.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="wa-campaign-name" className="text-xs font-semibold">Name</Label>
                <Input id="wa-campaign-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="October tile offer" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Send from</Label>
                <Select value={channelId} onValueChange={setChannelId}>
                  <SelectTrigger><SelectValue placeholder={channels === null ? 'Loading…' : 'Pick a number'} /></SelectTrigger>
                  <SelectContent>{(channels ?? []).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder={templates === null ? 'Loading…' : 'Pick an approved template'} /></SelectTrigger>
                  <SelectContent>{(templates ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3 rounded-sm border border-hairline p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Audience</span>
                <span className="text-[11px] text-muted-foreground">Anyone matching ANY of these</span>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={filter.all_whatsapp_contacts} onCheckedChange={(v) => setFilter((f) => ({ ...f, all_whatsapp_contacts: v === true }))} />
                Everyone who has messaged us on WhatsApp
              </label>
              {labels.length > 0 && (
                <div className="space-y-1.5">
                  <span className="text-[11px] text-muted-foreground">WhatsApp conversations labelled</span>
                  <div className="flex flex-wrap gap-1.5">
                    {labels.map((l) => (
                      <button key={l.id} type="button" className={chip(filter.inbox_label_ids.includes(l.id))} onClick={() => toggle('inbox_label_ids', l.id)}>{l.name}</button>
                    ))}
                  </div>
                </div>
              )}
              {categoriesByKind.map(([kind, cats]) => (
                <div key={kind} className="space-y-1.5">
                  <span className="text-[11px] text-muted-foreground">CRM contacts by {humanizeLabel(kind).toLowerCase()}</span>
                  <div className="flex flex-wrap gap-1.5">
                    {cats.map((c) => (
                      <button key={c.id} type="button" className={chip(filter.crm_category_ids.includes(c.id))} onClick={() => toggle('crm_category_ids', c.id)}>{c.name}</button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="space-y-1.5">
                <Label htmlFor="wa-campaign-tags" className="text-[11px] font-normal text-muted-foreground">CRM contacts tagged (comma-separated)</Label>
                <Input id="wa-campaign-tags" value={tagText} onChange={(e) => setTagText(e.target.value)} placeholder="vip, architect" className="h-8 text-sm" />
              </div>
            </div>

            <div className="rounded-sm border border-hairline bg-surface-sunken p-3 text-sm">
              {!hasAudience ? (
                <span className="text-muted-foreground">Choose at least one audience above.</span>
              ) : previewing || !preview ? (
                <span className="inline-flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Counting…</span>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold"><Users className="w-4 h-4" />{preview.sendable.toLocaleString()} will receive it</div>
                  {(preview.opted_out > 0 || preview.no_country_code > 0) && (
                    <div className="text-xs text-muted-foreground">
                      Left out: {preview.opted_out > 0 && `${preview.opted_out} opted out`}
                      {preview.opted_out > 0 && preview.no_country_code > 0 && ' · '}
                      {preview.no_country_code > 0 && `${preview.no_country_code} CRM numbers without a country code (add +30… to include them)`}
                    </div>
                  )}
                  {preview.sample.length > 0 && (
                    <div className="text-xs text-muted-foreground truncate">
                      e.g. {preview.sample.map((s) => s.name || s.phone).join(', ')}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="wa-campaign-at" className="text-xs font-semibold">Send at (optional)</Label>
              <Input id="wa-campaign-at" type="datetime-local" value={sendAt} onChange={(e) => setSendAt(e.target.value)} className="w-60" />
              <p className="text-[11px] text-muted-foreground">Empty = saved as a draft you start yourself. Each message is charged per WhatsApp’s rate for the recipient’s country.</p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {!missingSetup && (
            <Button onClick={() => { void create(); }} disabled={!canCreate}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{sendAt ? 'Schedule campaign' : 'Create draft'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
