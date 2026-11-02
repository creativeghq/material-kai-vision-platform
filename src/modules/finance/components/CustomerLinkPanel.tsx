import React, { useState } from 'react';
import { Copy, ExternalLink, Loader2, MessageCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { HubPanel } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { customerLinkHandlers, mintCustomerLink, type ShareableDocumentKind } from '@/modules/finance/services/customerLinks';

export const CustomerLinkPanel: React.FC<{
  kind: ShareableDocumentKind;
  id: string;
  label: string;
  title?: string;
}> = ({ kind, id, label, title = 'Customer link' }) => {
  const { toast } = useToast();
  const [rotating, setRotating] = useState(false);
  const h = customerLinkHandlers(kind, id, label, toast);

  const rotate = async () => {
    setRotating(true);
    try {
      const url = await mintCustomerLink(kind, id, true);
      await navigator.clipboard.writeText(url).catch(() => {});
      toast({ title: 'New link created and copied', description: 'The previous link no longer opens.' });
    } catch (e) {
      toast({ title: 'Could not create a new link', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setRotating(false);
    }
  };

  return (
    <HubPanel title={title}>
      <p className="mb-3 text-xs text-muted-foreground">Opens this document online, without an account.</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.copy()}><Copy className="h-3.5 w-3.5" /> Copy</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.open()}><ExternalLink className="h-3.5 w-3.5" /> Open</Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void h.whatsapp()}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={() => void rotate()} disabled={rotating}>
          {rotating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} New link
        </Button>
      </div>
    </HubPanel>
  );
};

export default CustomerLinkPanel;
