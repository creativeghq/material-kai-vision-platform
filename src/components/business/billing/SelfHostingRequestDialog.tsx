/**
 * Self-hosting enquiry, from the plans page.
 *
 * Replaces the Enterprise tier's Subscribe button. Running this platform on someone else's
 * infrastructure is a conversation — a checkout would collect money for something nobody has
 * scoped yet.
 *
 * The form asks for the least it can and still be answerable: who to reply to, and what they
 * need. Everything else is optional, because a required field on an enquiry form is a reason not
 * to send it.
 */
import React, { useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { supabase } from '@/integrations/supabase/client';
import { edgeErrorMessage } from '@/utils/edgeError';

interface Props {
  open: boolean;
  onClose: () => void;
}

export const SelfHostingRequestDialog: React.FC<Props> = ({ open, onClose }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();

  // Pre-filled from the signed-in account: they are already known to us, and asking a customer to
  // retype an address we hold is how a form gets abandoned.
  const [email, setEmail] = useState(user?.email ?? '');
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [teamSize, setTeamSize] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!email.includes('@')) {
      toast({ title: 'A reply address is needed', description: 'We cannot answer without one.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-api', {
        body: {
          action: 'request-self-hosting',
          workspace_id: activeWorkspaceId,
          contact_email: email.trim(),
          contact_name: name.trim() || null,
          company: company.trim() || null,
          team_size: teamSize.trim() || null,
          message: message.trim() || null,
        },
      });
      if (error) throw new Error(await edgeErrorMessage(error, 'Could not send the request'));
      if (data?.error) throw new Error(data.error);

      toast({
        title: 'Request sent',
        description: 'We have it, and we will come back to you at ' + email.trim() + '.',
      });
      onClose();
    } catch (err) {
      toast({
        title: 'Could not send the request',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request self hosting</DialogTitle>
          <DialogDescription>
            Tell us what you need to run Material KAI on your own infrastructure and we will come
            back to you.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sh-email">Reply to *</Label>
            <Input
              id="sh-email" type="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sh-name">Your name</Label>
              <Input id="sh-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sh-company">Company</Label>
              <Input id="sh-company" value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-size">Team size</Label>
            <Input
              id="sh-size" value={teamSize} onChange={(e) => setTeamSize(e.target.value)}
              placeholder="e.g. 25 people, 3 workspaces"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sh-message">What do you need?</Label>
            <Textarea
              id="sh-message" rows={4} value={message} onChange={(e) => setMessage(e.target.value)}
              placeholder="Where it would run, any compliance requirements, rough timeline…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={sending}>
            {sending
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Sending…</>
              : <><Send className="h-4 w-4 mr-2" /> Send request</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SelfHostingRequestDialog;
