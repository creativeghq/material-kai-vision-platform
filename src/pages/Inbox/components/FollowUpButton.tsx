import React, { useState } from 'react';
import { BellRing } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Label } from '@/components/core/ui/label';
import { formatDate } from '@/utils/datetime';
import { inboxApi, type InboxThread } from '@/services/inboxApi';
import { daysFromNow, toLocalInputValue } from '../inboxFormat';

/** "Bring this back on Thursday" — and, if you want, "chase them if they have not replied by then". */
export const FOLLOW_UP_PRESETS: Array<{ label: string; days: number }> = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

export const FollowUpButton: React.FC<{
  thread: InboxThread;
  onChanged: () => void;
}> = ({ thread, onChanged }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const [autoSend, setAutoSend] = useState(false);
  const [message, setMessage] = useState('');
  const pending = !!thread.follow_up_at && !thread.follow_up_fired_at;

  const submit = async (at: Date) => {
    setBusy(true);
    try {
      const res = await inboxApi.setFollowUp({
        thread_id: thread.id,
        at: at.toISOString(),
        note: note.trim() || undefined,
        message: autoSend && message.trim() ? message.trim() : undefined,
      });
      // The warning is the whole reason this returns anything. On WhatsApp a freeform message is
      // only accepted inside Meta's 24-hour window, and a follow-up is usually days away — so
      // most automatic chases on that channel CANNOT go out, and the operator has to hear it now
      // rather than discover it on Thursday.
      toast(res.warning
        ? { title: 'Follow-up set — but the message will not send', description: res.warning }
        : { title: autoSend && message.trim() ? 'Follow-up set — the message sends automatically' : 'Follow-up set' });
      setOpen(false);
      setNote(''); setMessage(''); setAutoSend(false); setCustom('');
      onChanged();
    } catch (e) {
      toast({ title: 'Could not set the follow-up', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={pending ? 'secondary' : 'outline'}
          size="icon"
          className="h-9 w-9"
          title={pending
            ? `Following up ${formatDate(thread.follow_up_at!)} — click to change`
            : 'Follow up later'}
        >
          <BellRing className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-medium">Follow up</div>
          <div className="text-xs text-muted-foreground">
            The conversation moves to Follow-up and comes back to Open on its own. A reply from
            them cancels it.
          </div>
        </div>

        <div className="p-3 space-y-3">
          <div className="grid grid-cols-2 gap-1.5">
            {FOLLOW_UP_PRESETS.map((preset) => (
              <Button
                key={preset.days}
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => submit(daysFromNow(preset.days))}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inbox-followup-when" className="text-xs">Or pick a time</Label>
            <div className="flex gap-1.5">
              <Input
                id="inbox-followup-when"
                type="datetime-local"
                className="h-8 text-xs"
                value={custom}
                min={toLocalInputValue(new Date())}
                onChange={(e) => setCustom(e.target.value)}
              />
              <Button
                size="sm" className="h-8 shrink-0"
                disabled={busy || !custom}
                onClick={() => submit(new Date(custom))}
              >
                Set
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="inbox-followup-note" className="text-xs">What to chase (optional)</Label>
            <Input
              id="inbox-followup-note"
              className="h-8 text-xs"
              placeholder="e.g. confirm the decking quantity"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div className="space-y-1.5 pt-1 border-t border-hairline">
            <label className="flex items-start gap-2 text-xs cursor-pointer pt-2">
              <Checkbox
                checked={autoSend}
                onCheckedChange={(v) => setAutoSend(v === true)}
                className="mt-0.5"
              />
              <span>
                Send this message automatically if they have not replied by then
                {thread.channel === 'whatsapp' && (
                  /* Said before they type it, not after it fails. WhatsApp accepts a freeform
                     message only inside 24 hours of the customer's last one, so on this channel
                     an automatic chase usually cannot be delivered at all. */
                  <span className="block text-muted-foreground mt-0.5">
                    On WhatsApp this only works if they have written to you within 24 hours of
                    that time — otherwise you will just be reminded.
                  </span>
                )}
              </span>
            </label>
            {autoSend && (
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Hi — just checking in on this…"
                className="min-h-[64px] text-xs resize-none"
              />
            )}
          </div>

          {pending && (
            <Button
              variant="ghost" size="sm" className="w-full text-destructive hover:text-destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await inboxApi.clearFollowUp(thread.id);
                  setOpen(false);
                  onChanged();
                } catch (e) {
                  toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
                } finally { setBusy(false); }
              }}
            >
              Cancel the follow-up
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
