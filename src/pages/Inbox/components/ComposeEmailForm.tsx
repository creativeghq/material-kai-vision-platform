import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Paperclip, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { DialogFooter } from '@/components/core/ui/dialog';
import { inboxApi, type AttachmentInput } from '@/services/inboxApi';
import { splitAddresses } from '../emailRecipients';
import { EmailFormatBar, EmailPreview } from './EmailFormatBar';
import { ComposerInsertMenu } from './ComposerInsertMenu';

type Suggestion = { id: string; label: string; email: string };

async function toAttachment(file: File): Promise<AttachmentInput> {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return { filename: file.name, content_type: file.type || 'application/octet-stream', data_base64: btoa(bin) };
}

export const ComposeEmailForm: React.FC<{
  workspaceId: string;
  onCancel: () => void;
  onSent: (threadId: string) => void;
}> = ({ workspaceId, onCancel, onSent }) => {
  const { toast } = useToast();
  const [from, setFrom] = useState<string | null | undefined>(undefined);
  const [to, setTo] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inboxApi.getMyEmailAddress(workspaceId)
      .then((r) => setFrom(r.address?.is_active ? r.address.full_address : null))
      .catch(() => setFrom(null));
  }, [workspaceId]);

  useEffect(() => {
    const term = to.trim();
    if (contactId || term.length < 2) { setSuggestions([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('crm_contacts')
        .select('id, name, first_name, last_name, email')
        .eq('workspace_id', workspaceId)
        .not('email', 'is', null)
        .ilike(CRM_SEARCH_COLUMN, foldedLike(term))
        .limit(6);
      if (cancelled) return;
      setSuggestions((data ?? []).map((r: { id: string; name?: string; first_name?: string; last_name?: string; email: string }) => ({
        id: r.id,
        email: r.email,
        label: r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email,
      })));
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [to, contactId, workspaceId]);

  const canSend = !!from && to.trim().includes('@') && subject.trim() && (body.trim() || files.length > 0);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      const attachments = await Promise.all(files.map(toAttachment));
      const res = await inboxApi.composeEmail({
        workspace_id: workspaceId,
        to: to.trim(),
        contact_id: contactId ?? undefined,
        subject: subject.trim(),
        body: body.trim() || undefined,
        email_cc: splitAddresses(cc),
        email_bcc: splitAddresses(bcc),
        attachments: attachments.length ? attachments : undefined,
      });
      if (res.delivery_error) {
        toast({ title: 'Saved, but the email was NOT sent', description: res.delivery_error, variant: 'destructive' });
      } else {
        toast({ title: 'Email sent' });
      }
      onSent(res.thread_id);
    } catch (e) {
      toast({ title: 'Could not send', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="space-y-2.5">
        <div className="text-xs text-muted-foreground">
          {from === undefined ? 'Loading your address…' : from ? <>From <span className="text-foreground font-medium">{from}</span></> : 'You have no active Inbox address yet. Set one up in Inbox settings first.'}
        </div>
        <div className="space-y-1.5 relative">
          <div className="flex items-center justify-between">
            <Label htmlFor="compose-to" className="text-xs text-muted-foreground">To</Label>
            {!copiesOpen && <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setCopiesOpen(true)}>Cc / Bcc</Button>}
          </div>
          <Input id="compose-to" placeholder="name@company.com or search contacts" value={to} onChange={(e) => { setTo(e.target.value); setContactId(null); }} />
          {suggestions.length > 0 && (
            <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-sm border border-hairline bg-popover shadow-overlay p-1">
              {suggestions.map((s) => (
                <button key={s.id} type="button" onClick={() => { setTo(s.email); setContactId(s.id); setSuggestions([]); }}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover">
                  <span className="block truncate">{s.label}</span>
                  <span className="block text-[11px] text-muted-foreground truncate">{s.email}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {copiesOpen && (
          <div className="grid grid-cols-[2.5rem_1fr] items-center gap-1.5">
            <Label htmlFor="compose-cc" className="text-xs text-muted-foreground">Cc</Label>
            <Input id="compose-cc" value={cc} onChange={(e) => setCc(e.target.value)} placeholder="name@company.com, …" className="h-8 text-sm" />
            <Label htmlFor="compose-bcc" className="text-xs text-muted-foreground">Bcc</Label>
            <Input id="compose-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="name@company.com, …" className="h-8 text-sm" />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="compose-subject" className="text-xs text-muted-foreground">Subject</Label>
          <Input id="compose-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <EmailFormatBar textareaRef={bodyRef} value={body} onChange={setBody} preview={preview} onPreview={setPreview} />
          <ComposerInsertMenu workspaceId={workspaceId} currentText={body} recipient={{ email: to.trim() || null }} onInsert={(t) => setBody((d) => (d.trim() ? `${d.trimEnd()}\n\n${t}` : t))} />
        </div>
        {preview
          ? <EmailPreview value={body} onEdit={() => setPreview(false)} />
          : <Textarea ref={bodyRef} aria-label="Message" placeholder="Write your email…" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[140px] resize-y" />}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground">
            <Paperclip className="w-3.5 h-3.5" /> Attach files
            <input type="file" multiple className="hidden" onChange={(e) => { const picked = Array.from(e.target.files ?? []); setFiles((f) => [...f, ...picked]); e.target.value = ''; }} />
          </label>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-card px-1.5 py-0.5">
              {f.name}
              <button type="button" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground" title="Remove">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={send} disabled={busy || !canSend}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send email'}
        </Button>
      </DialogFooter>
    </>
  );
};
