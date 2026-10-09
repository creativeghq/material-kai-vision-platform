import React, { useState } from 'react';
import { AlarmClock, Loader2, Send, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { formatDate, formatTime } from '@/utils/datetime';
import { daysFromNow, toLocalInputValue } from '../inboxFormat';

export const FOLLOW_UP_PRESETS: Array<{ label: string; days: number }> = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

export interface PendingOutreach { id: string; send_at: string; preview?: string | null }

/** Morning of `n` days ahead, so a Boomerang or Outreach lands at the start of a working day. */
function presetAt(days: number): Date {
  const d = daysFromNow(days);
  d.setHours(9, 0, 0, 0);
  return d;
}

const stamp = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

const WhenPicker: React.FC<{ id: string; busy: boolean; action: string; disabled?: boolean; onPick: (at: Date) => void }> = ({ id, busy, action, disabled, onPick }) => {
  const [custom, setCustom] = useState('');
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {FOLLOW_UP_PRESETS.map((p) => (
          <Button key={p.days} variant="outline" size="sm" disabled={busy || disabled} onClick={() => onPick(presetAt(p.days))}>{p.label}</Button>
        ))}
      </div>
      <div className="space-y-1">
        <Label htmlFor={id} className="text-xs">Or pick a date and time</Label>
        <div className="flex gap-1.5">
          <Input id={id} type="datetime-local" className="h-8 text-xs" value={custom} min={toLocalInputValue(new Date())} onChange={(e) => setCustom(e.target.value)} />
          <Button size="sm" className="h-8 shrink-0" disabled={busy || disabled || !custom} onClick={() => onPick(new Date(custom))}>{action}</Button>
        </div>
      </div>
    </div>
  );
};

/** Follow up on a conversation: Boomerang brings it back to the top on a date; Outreach sends a reply then unless they write first. */
export const FollowUpPopover: React.FC<{
  idPrefix: string;
  boomerangAt: string | null;
  outreach: PendingOutreach[];
  onBoomerang: (at: Date, note: string) => Promise<void>;
  onClearBoomerang: () => Promise<void>;
  onOutreach: (at: Date, message: string) => Promise<void>;
  onCancelOutreach: (id: string) => Promise<void>;
  showNote?: boolean;
  outreachHint?: React.ReactNode;
  compact?: boolean;
}> = ({ idPrefix, boomerangAt, outreach, onBoomerang, onClearBoomerang, onOutreach, onCancelOutreach, showNote, outreachHint, compact }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'boomerang' | 'outreach'>('boomerang');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const pending = !!boomerangAt || outreach.length > 0;

  const run = async (fn: () => Promise<void>, close = true) => {
    setBusy(true);
    try {
      await fn();
      if (close) { setOpen(false); setNote(''); setMessage(''); }
    } catch { /* the caller reported it */ } finally { setBusy(false); }
  };

  const title = outreach.length
    ? `Follow-up sends ${stamp(outreach[0].send_at)}`
    : boomerangAt ? `Back on ${stamp(boomerangAt)}` : 'Follow up';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button size="sm" variant="ghost" className="h-6 text-xs"><AlarmClock className="w-3.5 h-3.5 mr-1" />{title}</Button>
        ) : (
          <Button variant={pending ? 'secondary' : 'outline'} size="icon" className="h-9 w-9" title={pending ? `${title} — click to change` : 'Follow up'}>
            <AlarmClock className="w-4 h-4" />
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div role="tablist" aria-label="Follow up" className="flex items-center gap-4 px-3 border-b border-hairline">
          <button role="tab" aria-selected={tab === 'boomerang'} onClick={() => setTab('boomerang')} className="text-xs py-2">Boomerang</button>
          <button role="tab" aria-selected={tab === 'outreach'} onClick={() => setTab('outreach')} className="text-xs py-2">Automatic outreach</button>
        </div>
        {tab === 'boomerang' ? (
          <div className="p-3 space-y-3">
            <p className="text-xs text-muted-foreground">Takes the conversation out of the inbox and brings it back to the top on the day you pick.</p>
            {boomerangAt && (
              <div className="flex items-center gap-2 text-xs rounded-sm border border-hairline px-2 py-1.5">
                <AlarmClock className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1">Back on {stamp(boomerangAt)}</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={busy} onClick={() => run(onClearBoomerang)}>Bring back now</Button>
              </div>
            )}
            {showNote && (
              <div className="space-y-1">
                <Label htmlFor={`${idPrefix}-note`} className="text-xs">Note to yourself (optional)</Label>
                <Input id={`${idPrefix}-note`} className="h-8 text-xs" placeholder="e.g. confirm the decking quantity" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
            <WhenPicker id={`${idPrefix}-boomerang`} busy={busy} action="Set" onPick={(at) => run(() => onBoomerang(at, note.trim()))} />
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <p className="text-xs text-muted-foreground">Sends this as a reply in the conversation on the day you pick. If they write to you first, it is not sent.</p>
            {outreach.map((o) => (
              <div key={o.id} className="flex items-start gap-2 text-xs rounded-sm border border-hairline px-2 py-1.5">
                <Send className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="block">Sends {stamp(o.send_at)}</span>
                  {o.preview && <span className="block text-muted-foreground truncate">{o.preview}</span>}
                </span>
                <button type="button" title="Cancel this follow-up" disabled={busy} onClick={() => run(() => onCancelOutreach(o.id), false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-message`} className="text-xs">The message to send</Label>
              <Textarea id={`${idPrefix}-message`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Hi — just checking in on this. Did you have a chance to look?" className="min-h-[72px] text-xs resize-none" />
            </div>
            {outreachHint}
            <WhenPicker id={`${idPrefix}-outreach`} busy={busy} action="Schedule" disabled={!message.trim()} onPick={(at) => run(() => onOutreach(at, message.trim()))} />
            {busy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground mx-auto" />}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
