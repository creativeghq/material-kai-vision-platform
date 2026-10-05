import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { DialogFooter } from '@/components/core/ui/dialog';
import { messagingService } from '@/modules/messaging/services/messagingService';

export const ComposeWhatsAppForm: React.FC<{
  workspaceId: string;
  onCancel: () => void;
  onOpened: (threadId: string) => void;
}> = ({ workspaceId, onCancel, onOpened }) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = /^\s*(\+|00)\d[\d\s().-]{6,}$/.test(phone);

  const open = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      const res = await messagingService.openWhatsAppThread({ phone, name: name.trim() || undefined, workspaceId });
      if (!res.created) toast({ title: 'You already have a conversation with this number' });
      onOpened(res.thread_id);
    } catch (e) {
      toast({ title: 'Could not open the conversation', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="space-y-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="wa-phone" className="text-xs text-muted-foreground">Phone number</Label>
          <Input id="wa-phone" placeholder="+30 691 234 5678" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="wa-name" className="text-xs text-muted-foreground">Name (optional)</Label>
          <Input id="wa-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Nothing is sent yet. A first message to someone who has not written to you must be an approved template, which you pick in the conversation.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={open} disabled={busy || !valid}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Open conversation'}
        </Button>
      </DialogFooter>
    </>
  );
};
