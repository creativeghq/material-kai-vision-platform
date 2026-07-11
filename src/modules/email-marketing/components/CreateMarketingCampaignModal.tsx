/**
 * #255 — create a workspace-scoped email campaign. Audience = CRM categories (resolved via the
 * membership-guarded RPC) + optional manual emails. Recipients are de-duped by email before insert.
 * Sending is BYOK-only, so "Send now" is disabled until the workspace Resend is configured.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Users, Calendar, Loader2, Send } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { marketingService, type CrmCategory, type MarketingTemplate, type AudienceRecipient } from '../services/marketingService';

interface Props {
  workspaceId: string;
  byokReady: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const CreateMarketingCampaignModal: React.FC<Props> = ({ workspaceId, byokReady, onClose, onSuccess }) => {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [categories, setCategories] = useState<CrmCategory[]>([]);
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [manualEmails, setManualEmails] = useState('');
  const [resolved, setResolved] = useState<AudienceRecipient[]>([]);
  const [resolving, setResolving] = useState(false);
  const [contacts, setContacts] = useState<AudienceRecipient[]>([]);
  const [includeAllContacts, setIncludeAllContacts] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: '',
    description: '',
    template_id: '',
    subject_line: '',
    preview_text: '',
    schedule: 'draft' as 'now' | 'draft' | 'later',
    scheduled_at: '',
  });

  useEffect(() => {
    (async () => {
      // Load independently — a failure in one source (e.g. a categories RPC hiccup) must not blank
      // the others (templates / the full contacts list).
      const [tpls, cats, cts] = await Promise.allSettled([
        marketingService.listTemplates(workspaceId),
        marketingService.listCategories(),
        marketingService.listContacts(workspaceId),
      ]);
      if (tpls.status === 'fulfilled') setTemplates(tpls.value.filter((t) => t.is_active));
      if (cats.status === 'fulfilled') setCategories(cats.value);
      if (cts.status === 'fulfilled') setContacts(cts.value);
      const failed = [tpls, cats, cts].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
      if (failed) {
        console.error('[email-marketing] audience load partial failure:', failed.reason);
        toast({ title: 'Some audience data failed to load', description: failed.reason?.message || 'Try reopening the dialog.', variant: 'destructive' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  // Resolve CRM-category recipients whenever the selection changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedCategoryIds.length) { setResolved([]); return; }
      setResolving(true);
      try {
        const r = await marketingService.resolveAudience(workspaceId, selectedCategoryIds);
        if (!cancelled) setResolved(r);
      } catch (e: any) {
        if (!cancelled) { setResolved([]); toast({ title: 'Error', description: e?.message || 'Failed to resolve audience', variant: 'destructive' }); }
      } finally {
        if (!cancelled) setResolving(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategoryIds, workspaceId]);

  const manualList = useMemo(
    () => manualEmails.split(/[\n,]/).map((e) => e.trim().toLowerCase()).filter((e) => EMAIL_RE.test(e)),
    [manualEmails],
  );

  // Merge all-contacts + category members + manual, de-dupe by email.
  const finalRecipients = useMemo<AudienceRecipient[]>(() => {
    const byEmail = new Map<string, AudienceRecipient>();
    if (includeAllContacts) for (const c of contacts) byEmail.set(c.email.toLowerCase(), c);
    for (const r of resolved) byEmail.set(r.email.toLowerCase(), r);
    for (const e of manualList) {
      if (!byEmail.has(e)) byEmail.set(e, { email: e, member_kind: null, crm_contact_id: null, crm_company_id: null, display_name: null });
    }
    return [...byEmail.values()];
  }, [includeAllContacts, contacts, resolved, manualList]);

  const toggleCategory = (id: string) => {
    setSelectedCategoryIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!form.name.trim()) { toast({ title: 'Campaign name is required', variant: 'destructive' }); return; }
    if (!form.template_id) { toast({ title: 'Select a template', variant: 'destructive' }); return; }
    if (finalRecipients.length === 0) { toast({ title: 'Add at least one recipient', variant: 'destructive' }); return; }
    if (form.schedule === 'later' && !form.scheduled_at) { toast({ title: 'Pick a send time', variant: 'destructive' }); return; }
    if ((form.schedule === 'now' || form.schedule === 'later') && !byokReady) {
      toast({ title: 'Resend not configured', description: 'Configure your workspace Resend account before sending.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      await marketingService.createCampaign(workspaceId, {
        name: form.name,
        description: form.description,
        template_id: form.template_id,
        subject_line: form.subject_line,
        preview_text: form.preview_text,
        audience: { category_ids: selectedCategoryIds, manual_emails: manualList },
        recipients: finalRecipients,
        schedule: form.schedule,
        scheduled_at: form.schedule === 'later' ? new Date(form.scheduled_at).toISOString() : null,
      });
      toast({ title: 'Campaign created', description: form.schedule === 'now' ? 'Sending will begin shortly.' : 'Saved.' });
      onSuccess();
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to create campaign', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !saving) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>New Email Campaign</DialogTitle></DialogHeader>

        <Tabs defaultValue="details" className="w-full">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="audience"><Users className="h-4 w-4 mr-2" /> Audience ({finalRecipients.length})</TabsTrigger>
            <TabsTrigger value="schedule"><Calendar className="h-4 w-4 mr-2" /> Schedule</TabsTrigger>
          </TabsList>

          {/* Details */}
          <TabsContent value="details" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="c-name">Campaign Name *</Label>
              <Input id="c-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Summer Sale 2026" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-desc">Description</Label>
              <Textarea id="c-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-tpl">Email Template *</Label>
              <Select value={form.template_id || undefined} onValueChange={(v) => setForm({ ...form, template_id: v })}>
                <SelectTrigger id="c-tpl"><SelectValue placeholder={templates.length ? 'Select a template' : 'No ready templates — design one first'} /></SelectTrigger>
                <SelectContent>
                  {templates.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-subj">Subject Line</Label>
              <Input id="c-subj" value={form.subject_line} onChange={(e) => setForm({ ...form, subject_line: e.target.value })} placeholder="Overrides the template subject" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="c-prev">Preview Text</Label>
              <Input id="c-prev" value={form.preview_text} onChange={(e) => setForm({ ...form, preview_text: e.target.value })} />
            </div>
          </TabsContent>

          {/* Audience */}
          <TabsContent value="audience" className="space-y-4">
            <div className="p-3 rounded-lg border bg-muted/50 text-sm">
              <span className="font-medium">{finalRecipients.length}</span> unique recipient{finalRecipients.length === 1 ? '' : 's'}
              {resolving && <span className="text-muted-foreground"> · resolving…</span>}
            </div>

            {/* Whole-CRM audience — the fast path for "email everyone". */}
            <label className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-muted/50">
              <Checkbox checked={includeAllContacts} onCheckedChange={(v) => setIncludeAllContacts(!!v)} />
              <div className="flex-1">
                <p className="text-sm font-medium">All CRM contacts with an email</p>
                <p className="text-xs text-muted-foreground">
                  {contacts.length > 0 ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'} in this workspace` : 'No CRM contacts with an email yet'}
                </p>
              </div>
            </label>

            <div className="space-y-2">
              <Label>CRM Categories <span className="text-muted-foreground font-normal">(target a segment)</span></Label>
              {categories.length === 0 ? (
                <p className="text-xs text-muted-foreground">No CRM categories found. Tag contacts in CRM, or use manual emails below.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto p-1">
                  {categories.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 p-2 border rounded-lg cursor-pointer hover:bg-muted/50">
                      <Checkbox checked={selectedCategoryIds.includes(c.id)} onCheckedChange={() => toggleCategory(c.id)} />
                      <span className="text-sm">{c.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="c-manual">Additional emails (one per line or comma-separated)</Label>
              <Textarea id="c-manual" value={manualEmails} onChange={(e) => setManualEmails(e.target.value)} rows={4} placeholder="vip@example.com" />
              {manualEmails.trim() && (
                <p className="text-xs text-muted-foreground">{manualList.length} valid email{manualList.length === 1 ? '' : 's'} detected.</p>
              )}
            </div>
          </TabsContent>

          {/* Schedule */}
          <TabsContent value="schedule" className="space-y-4">
            {!byokReady && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                Configure your workspace Resend account in <strong>Setup</strong> before you can send. You can still save a draft.
              </div>
            )}
            <div className="space-y-2">
              {([
                { v: 'draft', title: 'Save as Draft', sub: 'Create now, send manually later.' },
                { v: 'now', title: 'Send Now', sub: 'Begin sending on the next processing tick (~8/min).' },
                { v: 'later', title: 'Schedule for Later', sub: 'Pick a date & time.' },
              ] as const).map((o) => (
                <label key={o.v} className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer hover:bg-muted/50 ${o.v !== 'draft' && !byokReady ? 'opacity-60' : ''}`}>
                  <input type="radio" name="schedule" value={o.v} checked={form.schedule === o.v}
                    disabled={o.v !== 'draft' && !byokReady}
                    onChange={(e) => setForm({ ...form, schedule: e.target.value as any })} />
                  <div>
                    <p className="font-medium">{o.title}</p>
                    <p className="text-xs text-muted-foreground">{o.sub}</p>
                  </div>
                </label>
              ))}
            </div>
            {form.schedule === 'later' && (
              <div className="space-y-2">
                <Label htmlFor="c-when">Send Date &amp; Time</Label>
                <Input id="c-when" type="datetime-local" value={form.scheduled_at}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {form.schedule === 'now' ? 'Create & Send' : form.schedule === 'later' ? 'Schedule Campaign' : 'Save Draft'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateMarketingCampaignModal;
