import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { inboxApi, type InboxWhatsAppForm } from '@/services/inboxApi';
import { WHATSAPP_FORM_PURPOSE_LABELS } from '@/modules/messaging/whatsappForms';
import { destinationRoute } from '@/config/appDestinations';

export const WhatsAppFormButton: React.FC<{ threadId: string; disabled?: boolean; onSent: () => void }> = ({ threadId, disabled, onSent }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" disabled={disabled} onClick={() => setOpen(true)} title="Send a WhatsApp form"
        className={`p-2 rounded-sm hover:bg-surface-hover text-muted-foreground ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
        <ClipboardList className="w-4 h-4" />
      </button>
      {open && <WhatsAppFormDialog threadId={threadId} onClose={() => setOpen(false)} onSent={() => { setOpen(false); onSent(); }} />}
    </>
  );
};

export const WhatsAppFormDialog: React.FC<{ threadId: string; onClose: () => void; onSent: () => void }> = ({ threadId, onClose, onSent }) => {
  const { toast } = useToast();
  const [forms, setForms] = useState<InboxWhatsAppForm[] | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    inboxApi.listWhatsAppForms(threadId)
      .then((r) => {
        setForms(r.forms);
        if (r.forms.length === 1) { setPickedId(r.forms[0].id); setBody(r.forms[0].intro); }
      })
      .catch((e) => { setForms([]); toast({ title: 'Could not load forms', description: (e as Error).message, variant: 'destructive' }); });
  }, [threadId, toast]);

  const picked = forms?.find((f) => f.id === pickedId) ?? null;

  const send = async () => {
    if (!picked) return;
    setBusy(true);
    try {
      await inboxApi.sendWhatsAppForm({ thread_id: threadId, form_id: picked.id, body });
      toast({ title: 'Form sent' });
      onSent();
    } catch (e) {
      toast({ title: 'Form not sent', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a WhatsApp Form</DialogTitle>
          <DialogDescription>
            The customer fills it in inside WhatsApp. Their answers arrive in this conversation, where order intake reads them.
          </DialogDescription>
        </DialogHeader>
        {forms === null ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : forms.length === 0 ? (
          <div className="text-sm text-muted-foreground py-2">
            No published form for this WhatsApp number.{' '}
            <Link className="text-primary underline" to={destinationRoute('whatsapp-forms') ?? '/profile?tab=social-accounts'}>Build one in WhatsApp forms</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              {forms.map((f) => (
                <button key={f.id} type="button" onClick={() => { setPickedId(f.id); setBody(f.intro); }}
                  className={`w-full text-left rounded-sm border px-3 py-2 text-sm ${f.id === pickedId ? 'border-primary bg-primary/[0.06]' : 'border-hairline hover:bg-surface-hover'}`}>
                  <div className="font-medium">{f.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {WHATSAPP_FORM_PURPOSE_LABELS[f.purpose] ?? f.purpose} · {f.fields.length} field{f.fields.length === 1 ? '' : 's'} · button “{f.cta}”
                  </div>
                </button>
              ))}
            </div>
            {picked && (
              <div className="space-y-1.5">
                <Label htmlFor="wa-form-body">Message</Label>
                <Textarea id="wa-form-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Please fill in: ${picked.name}`} />
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void send()} disabled={!picked || busy}>
            {busy && <Loader2 className="w-4 h-4 mr-1 animate-spin" />} Send form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
