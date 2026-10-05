import React, { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { HubEmptyState } from '@/components/core/hub';
import { formatDate, formatTime } from '@/utils/datetime';

function at(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function sendLaterPresets(now = new Date()): Array<{ label: string; at: Date }> {
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  return [
    { label: 'Tomorrow morning', at: at(1, 8) },
    { label: 'Tomorrow afternoon', at: at(1, 14) },
    { label: 'Monday morning', at: at(toMonday, 8) },
  ];
}

const stamp = (d: Date | string) => {
  const iso = typeof d === 'string' ? d : d.toISOString();
  return `${formatDate(iso)} ${formatTime(iso)}`;
};

export const SendLaterMenu: React.FC<{ disabled?: boolean; onPick: (at: Date) => void }> = ({ disabled, onPick }) => {
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  if (customOpen) {
    return (
      <span className="inline-flex items-center gap-1">
        <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-8 text-xs w-48" aria-label="Send at" />
        <Button size="sm" variant="outline" disabled={!custom || disabled} onClick={() => { setCustomOpen(false); onPick(new Date(custom)); }}>Schedule</Button>
        <button type="button" title="Cancel" onClick={() => setCustomOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3.5 h-3.5" /></button>
      </span>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled} title="Send later">
          <CalendarClock className="w-4 h-4" /><ChevronDown className="w-3 h-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        {sendLaterPresets().map((p) => (
          <DropdownMenuItem key={p.label} onSelect={() => onPick(p.at)}>
            <span className="flex-1">{p.label}</span>
            <span className="text-[11px] text-muted-foreground">{stamp(p.at)}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setCustomOpen(true)}>Pick a date and time…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

interface ScheduledRow {
  id: string; kind: 'gmail' | 'inbox'; summary: string | null; recipients: string | null;
  send_at: string; status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'; error: string | null;
}

const STATUS_TONE = { pending: 'info', sending: 'warning', sent: 'success', failed: 'error', cancelled: 'neutral' } as const;

export const ScheduledDialog: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<ScheduledRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('mail_scheduled_sends')
      .select('id, kind, summary, recipients, send_at, status, error')
      .in('status', ['pending', 'sending', 'failed'])
      .order('send_at', { ascending: true }).limit(100);
    if (error) { toast({ title: 'Could not load scheduled messages', description: error.message, variant: 'destructive' }); setRows([]); return; }
    setRows((data ?? []) as ScheduledRow[]);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const cancel = async (id: string) => {
    setBusyId(id);
    const { data, error } = await supabase.from('mail_scheduled_sends').update({ status: 'cancelled' }).eq('id', id).eq('status', 'pending').select('id');
    setBusyId(null);
    if (error || !data?.length) {
      toast({ title: 'Could not cancel', description: error?.message ?? 'It is already being sent.', variant: 'destructive' });
    } else toast({ title: 'Cancelled — it will not be sent' });
    void load();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Scheduled Messages</DialogTitle>
          <DialogDescription>What is waiting to go out, and anything that could not be sent.</DialogDescription>
        </DialogHeader>
        {rows === null ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" /> : rows.length === 0 ? (
          <HubEmptyState icon={CalendarClock} title="Nothing scheduled" description="Use the clock beside Send to send a message later." />
        ) : (
          <div className="divide-y divide-hairline border border-hairline rounded-sm max-h-[60vh] overflow-y-auto">
            {rows.map((r) => (
              <div key={r.id} className="px-3 py-2 flex items-start gap-3 text-sm">
                <div className="min-w-0 flex-1">
                  <div className="truncate">{r.summary || '—'}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.kind === 'gmail' ? 'Gmail' : 'Inbox'} · {r.recipients || '—'} · {stamp(r.send_at)}
                  </div>
                  {r.error && <div className="text-xs text-destructive mt-0.5">{r.error}</div>}
                </div>
                <Badge variant={STATUS_TONE[r.status]}>{r.status}</Badge>
                {r.status === 'pending' && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busyId === r.id} onClick={() => cancel(r.id)}>Cancel</Button>
                )}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
