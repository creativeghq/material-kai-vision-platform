import React, { useState } from 'react';
import { Copy, ExternalLink, Loader2, Mail, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { HubPanel } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { financeService } from '@/modules/finance/services/financeService';
import { customerLinkHandlers, mintCustomerLink, type ShareableDocumentKind } from '@/modules/finance/services/customerLinks';

export const CustomerLinkPanel: React.FC<{
  kind: ShareableDocumentKind;
  id: string;
  workspaceId: string;
  label: string;
  title?: string;
}> = ({ kind, id, workspaceId, label, title = 'Customer link' }) => {
  const { toast } = useToast();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [busy, setBusy] = useState<'rotate' | 'email' | null>(null);
  const h = customerLinkHandlers(kind, id, label, toast);
  const emailable = kind === 'credit_note' || kind === 'delivery_note';

  const rotate = async () => {
    setBusy('rotate');
    try {
      const url = await mintCustomerLink(kind, id, true);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'New link created and copied', description: 'The previous link no longer opens.' });
    } catch (e) {
      toast({ title: 'Could not create a new link', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const email = async () => {
    if (kind !== 'credit_note' && kind !== 'delivery_note') return;
    setBusy('email');
    try {
      const { sent_to } = await financeService.sendDocumentEmail(kind, id);
      toast({ title: 'Email sent', description: `To ${sent_to}, with the PDF and the online link.` });
    } catch (e) {
      if (await handleEmailSendError(e, { workspaceId, feature: kind })) return;
      toast({ title: 'Email not sent', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <HubPanel title={title}>
      <p className="mb-3 text-xs text-muted-foreground">Opens this document online, without an account.</p>
      <div className="flex flex-wrap gap-2">
        {emailable && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void email()} disabled={!!busy}>
            {busy === 'email' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mail className="h-3.5 w-3.5" />} Email
          </Button>
        )}
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.copy()}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.open()}><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.whatsapp()}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void rotate()} disabled={!!busy}>
          {busy === 'rotate' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} New link
        </Button>
      </div>
      {connectEmailGate}
    </HubPanel>
  );
};

export default CustomerLinkPanel;
