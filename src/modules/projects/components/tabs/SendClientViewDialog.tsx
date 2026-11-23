/** Emails a client view's link through the client_view_sent flow (#604 phase 8). The person confirms the recipient; nothing sends by itself. */
import React, { useEffect, useState } from 'react';
import { Loader2, Mail } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { FormField, FormGrid } from '@/components/core/ui/form-layout';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import type { ClientView } from '@/services/clientViewsService';
import { escapeHtml } from '@/utils/escapeHtml';

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export const SendClientViewDialog: React.FC<{
  view: ClientView | null;
  projectId: string;
  projectName: string;
  workspaceId: string | null;
  onClose(): void;
  onSent(): void;
}> = ({ view, projectId, projectName, workspaceId, onClose, onSent }) => {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!view) return;
    let live = true;
    setEmail(''); setName(view.cover?.client_name ?? '');
    void (async () => {
      const { data: proj } = await supabase.from('projects').select('client_contact_id, client_company_id').eq('id', projectId).maybeSingle();
      const contactId = (proj as { client_contact_id?: string | null } | null)?.client_contact_id;
      const companyId = (proj as { client_company_id?: string | null } | null)?.client_company_id;
      const row = contactId
        ? (await supabase.from('crm_contacts').select('name, email').eq('id', contactId).maybeSingle()).data
        : companyId ? (await supabase.from('crm_companies').select('name, email').eq('id', companyId).maybeSingle()).data : null;
      if (!live || !row) return;
      const r = row as { name?: string | null; email?: string | null };
      if (r.email) setEmail(r.email);
      if (r.name && !view.cover?.client_name) setName(r.name);
    })();
    return () => { live = false; };
  }, [view, projectId]);

  const send = async () => {
    if (!view?.public_share_token || !EMAIL_RE.test(email.trim())) return;
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const sender = (user?.user_metadata?.full_name as string | undefined) || user?.email || 'Your designer';
      const title = view.title || `${projectName} presentation`;
      const link = `${window.location.origin}/cv/${view.public_share_token}`;
      await flowEventService.emit('client_view_sent', {
        workspace_id: workspaceId,
        user_id: user?.id ?? null,
        client_view_id: view.id,
        project_id: projectId,
        recipient_email: email.trim(),
        recipient_name: name.trim() || null,
        subject: `${title} — from ${sender}`,
        link,
        greeting_html: name.trim() ? ` ${escapeHtml(name.trim())}` : '',
        sender_html: escapeHtml(sender),
        title_html: escapeHtml(title),
        title: `${title} sent to ${email.trim()}`,
        body: `The online presentation was emailed to ${email.trim()}.`,
        action_url: `/projects/${projectId}?tab=client-view`,
        type: 'info',
      });
      toast({ title: 'Presentation sent', description: `Emailed to ${email.trim()}. Opens show on the delivery trail.` });
      onSent();
      onClose();
    } catch (e) {
      toast({ title: 'The presentation could not be sent', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!view} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send by Email</DialogTitle>
          <DialogDescription>Emails the link to this online presentation. The link is live: what the client sees follows the project as it changes.</DialogDescription>
        </DialogHeader>
        <FormGrid>
          <FormField label="Recipient Email" htmlFor="cv-send-email">
            <Input id="cv-send-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>
          <FormField label="Recipient Name" htmlFor="cv-send-name" optional>
            <Input id="cv-send-name" value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
        </FormGrid>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button className="gap-1.5" disabled={busy || !EMAIL_RE.test(email.trim()) || !view?.public_share_token} onClick={() => void send()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
