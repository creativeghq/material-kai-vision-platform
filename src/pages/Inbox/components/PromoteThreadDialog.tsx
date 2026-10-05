import React, { useEffect, useState } from 'react';
import { Loader2, FolderKanban } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { inboxApi, type InboxThread } from '@/services/inboxApi';

/**
 * Open a deal from a conversation.
 *
 * The deal types and their stages are per type and live in `crm_deal_types` / `crm_deal_stages`,
 * so they are FETCHED — a hardcoded list here would be a second copy of a DB vocabulary, and the
 * stage a deal starts in is chosen by the RPC from the type, never guessed by the client.
 */
export const PromoteThreadDialog: React.FC<{
  thread: InboxThread;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  suggestedContactName: string;
  hasContact: boolean;
  onDone?: () => void;
}> = ({ thread, open, onOpenChange, suggestedContactName, hasContact, onDone }) => {
  const { toast } = useToast();
  const [types, setTypes] = useState<{ key: string; label: string }[] | null>(null);
  const [dealType, setDealType] = useState('general');
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');
  const [contactName, setContactName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(`Enquiry from ${(thread.subject || '').trim() || 'this conversation'}`);
    setContactName(suggestedContactName);
    setValue('');
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('crm_deal_types')
        .select('key, label, sort')
        .eq('is_active', true)
        .order('sort');
      if (cancelled) return;
      const rows = (data ?? []) as { key: string; label: string }[];
      setTypes(rows);
      if (rows.length && !rows.some((t) => t.key === 'general')) setDealType(rows[0].key);
    })();
    return () => { cancelled = true; };
  }, [open, thread.subject, suggestedContactName]);

  const submit = async () => {
    setSaving(true);
    try {
      const parsed = value.trim() === '' ? null : Number(value.replace(',', '.'));
      if (parsed !== null && !Number.isFinite(parsed)) {
        toast({ title: 'That value is not a number', variant: 'destructive' });
        return;
      }
      const r = await inboxApi.promoteThread(thread.id, {
        deal_type: dealType,
        title: title.trim() || undefined,
        value: parsed,
        contact_name: hasContact ? undefined : (contactName.trim() || undefined),
      });
      toast({
        // Say what happened to BOTH records, and name the stage — a deal that silently landed
        // somewhere the operator did not expect is the thing a pipeline cannot recover from.
        title: r.already_linked ? 'This conversation already has a deal' : `Deal opened at “${r.stage}”`,
        description: r.already_linked
          ? `“${r.deal_title}” is already open against this conversation.`
          : `“${r.deal_title}”${r.contact_created ? ' — and the contact was added to the CRM.' : ''}`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast({ title: 'Could not open the deal', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open a deal from this conversation</DialogTitle>
          <DialogDescription>
            {hasContact
              ? 'The deal is opened against the contact already linked here.'
              : 'The contact is filed at the same time — linked to an existing record when the number is already on file.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {!hasContact && (
            <div className="space-y-1.5">
              <Label htmlFor="promote-contact">Contact name</Label>
              <Input id="promote-contact" value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="Who is this?" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="promote-type">Deal type</Label>
            <Select value={dealType} onValueChange={setDealType}>
              <SelectTrigger id="promote-type">
                <SelectValue placeholder={types === null ? 'Loading…' : 'Pick a type'} />
              </SelectTrigger>
              <SelectContent>
                {(types ?? []).map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {types !== null && types.length === 0 && (
              <>
                <p className="text-xs text-muted-foreground">
                  No deal types are configured, so there is no pipeline for this to land in.
                </p>
                <Button asChild size="sm" variant="secondary" className="w-full">
                  <a href="/crm?tab=pipeline">
                    <FolderKanban className="w-3.5 h-3.5 mr-1.5" />Set up deal types
                  </a>
                </Button>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promote-title">Title</Label>
            <Input id="promote-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="promote-value">Value (optional)</Label>
            <Input id="promote-value" value={value} onChange={(e) => setValue(e.target.value)}
              inputMode="decimal" placeholder="Leave blank if you do not know yet" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={saving || types === null || types.length === 0}>
            {saving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
            Open the deal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
