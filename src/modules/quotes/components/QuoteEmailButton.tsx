import React, { useState } from 'react';
import { Mail, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';
import { unwrapEmailSendError } from '@/modules/email/lib/emailSenderGate';

/**
 * QuoteEmailButton — emails the quote to a recipient via the `send-quote-email`
 * edge function (owner-or-admin). Leaving the recipient blank lets the backend
 * send to the customer on file; the function also ensures the public share link
 * exists so the email deep-links to a no-login /q/:token view.
 */

interface Props {
  quoteId: string;
  /** Optional default recipient to prefill (e.g. known customer email). */
  defaultEmail?: string | null;
  /** Reload the parent quote afterwards (sending enables the share link). */
  onSent?: () => void;
}

export const QuoteEmailButton: React.FC<Props> = ({ quoteId, defaultEmail, onSent }) => {
  const { toast } = useToast();
  const { activeWorkspaceId } = useWorkspace();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState(defaultEmail ?? '');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const send = async () => {
    try {
      setSending(true);
      const { data, error } = await supabase.functions.invoke('send-quote-email', {
        body: { quote_id: quoteId, to: to.trim() || undefined, message: message.trim() || undefined },
      });
      if (error) {
        if (await handleEmailSendError(error, { workspaceId: activeWorkspaceId, feature: 'quote' })) return;
        const { message: msg } = await unwrapEmailSendError(error);
        throw new Error(msg);
      }
      if (!data?.success) throw new Error(data?.error || 'Failed to send');
      toast({ title: 'Quote emailed', description: `Sent to ${data.sent_to}` });
      setOpen(false);
      setMessage('');
      onSent?.();
    } catch (err) {
      console.error('Failed to email quote:', err);
      toast({
        title: 'Could not send',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" className="rounded-full gap-2" onClick={() => setOpen(true)}>
        <Mail className="h-4 w-4" />
        Email Quote
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Email This Quote</DialogTitle>
            <DialogDescription>
              We’ll send a link to a no-login view of this quote. Leave the recipient blank to
              send to the customer on file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Recipient</label>
              <Input
                type="email"
                placeholder="Customer on file"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Message (optional)</label>
              <Textarea
                placeholder="Add a short note…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={sending} className="rounded-full">
              Cancel
            </Button>
            <Button onClick={send} disabled={sending} className="rounded-full gap-2">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {connectEmailGate}
    </>
  );
};

export default QuoteEmailButton;
