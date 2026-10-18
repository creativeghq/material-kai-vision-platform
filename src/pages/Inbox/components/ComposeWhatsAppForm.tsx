import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { DialogFooter } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { messagingService, whatsAppNumberLabel, type WhatsAppNumber } from '@/modules/messaging/services/messagingService';

export const ComposeWhatsAppForm: React.FC<{
  workspaceId: string;
  onCancel: () => void;
  onOpened: (threadId: string) => void;
}> = ({ workspaceId, onCancel, onOpened }) => {
  const { toast } = useToast();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [channelId, setChannelId] = useState('');
  const [numbersState, setNumbersState] = useState<'loading' | 'ready' | 'failed'>('loading');
  useEffect(() => {
    let cancelled = false;
    setNumbers([]);
    setChannelId('');
    setNumbersState('loading');
    messagingService.whatsAppNumbers(workspaceId)
      .then((rows) => { if (!cancelled) { setNumbers(rows); setChannelId(rows[0]?.id ?? ''); setNumbersState('ready'); } })
      .catch(() => { if (!cancelled) { setNumbers([]); setNumbersState('failed'); } });
    return () => { cancelled = true; };
  }, [workspaceId]);
  const valid = /^\s*(\+|00)\d[\d\s().-]{6,}$/.test(phone);

  const open = async () => {
    if (!valid || numbersState !== 'ready') return;
    setBusy(true);
    try {
      const res = await messagingService.openWhatsAppThread({
        phone, name: name.trim() || undefined, workspaceId, channelId: numbers.length > 1 ? channelId || undefined : undefined,
      });
      if (!res.created) toast({ title: 'You already have a conversation with this number' });
      onOpened(res.thread_id);
    } catch (e) {
      toast({ title: 'Could not open the conversation', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="space-y-2.5">
        {numbersState === 'failed' && (
          <p className="text-xs text-destructive">Could not load this workspace&apos;s WhatsApp numbers. Close and try again.</p>
        )}
        {numbers.length > 1 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger aria-label="Send from"><SelectValue /></SelectTrigger>
              <SelectContent>
                {numbers.map((n) => <SelectItem key={n.id} value={n.id}>{whatsAppNumberLabel(n)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
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
        <Button onClick={open} disabled={busy || !valid || numbersState !== 'ready'}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Open conversation'}
        </Button>
      </DialogFooter>
    </>
  );
};
