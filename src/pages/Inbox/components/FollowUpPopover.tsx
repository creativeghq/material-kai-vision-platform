import React, { useState } from 'react';
import { AlarmClock, Send, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { formatDate, formatTime } from '@/utils/datetime';
import { daysFromNow, toLocalInputValue } from '../inboxFormat';
import { withinBusinessHours, type BestTime } from '../followUpTiming';
import { OutreachComposer, type OutreachStepInput, type OutreachTemplateChoice } from './OutreachComposer';

export const FOLLOW_UP_PRESETS: Array<{ label: string; days: number }> = [
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'In a week', days: 7 },
  { label: 'In 2 weeks', days: 14 },
];

export interface PendingOutreach { id: string; send_at: string; preview?: string | null; sequence_id?: string | null; step?: number | null }

/** Morning of `n` days ahead, on a working day, so a Boomerang lands at the start of the day. */
function presetAt(days: number): Date {
  const d = daysFromNow(days);
  d.setHours(9, 0, 0, 0);
  return withinBusinessHours(d);
}

const stamp = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

/** Follow up on a conversation: Boomerang brings it back to the top on a date; Outreach sends a chain of replies unless they write first. */
export const FollowUpPopover: React.FC<{
  idPrefix: string;
  boomerangAt: string | null;
  outreach: PendingOutreach[];
  onBoomerang: (at: Date, note: string) => Promise<void>;
  onClearBoomerang: () => Promise<void>;
  onOutreach: (steps: OutreachStepInput[], template: OutreachTemplateChoice | null) => Promise<void>;
  onCancelOutreach: (o: PendingOutreach, wholeSequence: boolean) => Promise<void>;
  loadBestTime?: () => Promise<BestTime | null>;
  draft?: () => Promise<string>;
  whatsappThreadId?: string | null;
  showNote?: boolean;
  outreachHint?: React.ReactNode;
  compact?: boolean;
}> = ({ idPrefix, boomerangAt, outreach, onBoomerang, onClearBoomerang, onOutreach, onCancelOutreach, loadBestTime, draft, whatsappThreadId, showNote, outreachHint, compact }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'boomerang' | 'outreach'>(outreach.length ? 'outreach' : 'boomerang');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [custom, setCustom] = useState('');
  const pending = !!boomerangAt || outreach.length > 0;

  const run = async (fn: () => Promise<void>, close = true) => {
    setBusy(true);
    try {
      await fn();
      if (close) { setOpen(false); setNote(''); setCustom(''); }
    } catch { /* the caller reported it */ } finally { setBusy(false); }
  };

  const title = outreach.length
    ? `Follow-up sends ${stamp(outreach[0].send_at)}${outreach.length > 1 ? ` (+${outreach.length - 1})` : ''}`
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
      <PopoverContent align="end" className="w-[26rem] max-w-[calc(100vw-2rem)] p-0 max-h-[80vh] overflow-y-auto">
        <div role="tablist" aria-label="Follow up" className="flex items-center gap-4 px-3 border-b border-hairline sticky top-0 bg-popover z-10">
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
            <div className="grid grid-cols-2 gap-1.5">
              {FOLLOW_UP_PRESETS.map((p) => (
                <Button key={p.days} variant="outline" size="sm" disabled={busy} onClick={() => run(() => onBoomerang(presetAt(p.days), note.trim()))}>{p.label}</Button>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor={`${idPrefix}-boomerang`} className="text-xs">Or pick a date and time</Label>
              <div className="flex gap-1.5">
                <Input id={`${idPrefix}-boomerang`} type="datetime-local" className="h-8 text-xs" value={custom} min={toLocalInputValue(new Date())} onChange={(e) => setCustom(e.target.value)} />
                <Button size="sm" className="h-8 shrink-0" disabled={busy || !custom} onClick={() => run(() => onBoomerang(new Date(custom), note.trim()))}>Set</Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            <p className="text-xs text-muted-foreground">Sends these as replies in the conversation on the days you pick. The moment they write to you, the rest is cancelled. An out-of-office reply does not count.</p>
            {outreach.map((o) => (
              <div key={o.id} className="flex items-start gap-2 text-xs rounded-sm border border-hairline px-2 py-1.5">
                <Send className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span className="flex-1 min-w-0">
                  <span className="block">{o.step ? `Follow-up ${o.step} · ` : ''}sends {stamp(o.send_at)}</span>
                  {o.preview && <span className="block text-muted-foreground truncate">{o.preview}</span>}
                </span>
                {o.sequence_id && outreach.filter((x) => x.sequence_id === o.sequence_id).length > 1 && (
                  <button type="button" disabled={busy} onClick={() => run(() => onCancelOutreach(o, true), false)} className="text-[11px] text-muted-foreground hover:text-foreground">Cancel all</button>
                )}
                <button type="button" title="Cancel this follow-up" disabled={busy} onClick={() => run(() => onCancelOutreach(o, false), false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {open && (
              <OutreachComposer
                idPrefix={`${idPrefix}-outreach`}
                loadBestTime={loadBestTime}
                draft={draft}
                whatsappThreadId={whatsappThreadId}
                hint={outreachHint}
                onSubmit={async (steps, template) => { await onOutreach(steps, template); setOpen(false); }}
              />
            )}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
