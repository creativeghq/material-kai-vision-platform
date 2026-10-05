import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Building2, Loader2, UserPlus, UserRound, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { formatDate, formatTime } from '@/utils/datetime';
import { gmailApi, type GmailAddress, type GmailThreadMeta } from '@/services/gmailApi';
import { SNOOZED_VIEW, type GmailMailboxState } from './useGmailMailbox';

function at(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export function snoozePresets(now = new Date()): Array<{ label: string; at: Date }> {
  const out: Array<{ label: string; at: Date }> = [];
  const later = new Date(now);
  later.setHours(later.getHours() + 3, 0, 0, 0);
  if (later.getDate() === now.getDate() && later.getHours() <= 20) out.push({ label: 'Later today', at: later });
  out.push({ label: 'Tomorrow morning', at: at(1, 8) });
  const toMonday = ((8 - now.getDay()) % 7) || 7;
  out.push({ label: 'Next week', at: at(toMonday, 8) });
  out.push({ label: 'In a month', at: at(30, 8) });
  return out;
}

export const GmailThreadFacts: React.FC<{ g: GmailMailboxState; threadId: string; subject: string; sender: GmailAddress | null }> = ({ g, threadId, subject, sender }) => {
  const { toast } = useToast();
  const { account } = g;
  const [meta, setMeta] = useState<GmailThreadMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setMeta(await gmailApi.threadMeta(account.id, threadId, sender?.address));
    } catch (e) {
      toast({ title: 'Could not load the CRM link', description: (e as Error).message, variant: 'destructive' });
    }
  }, [account, threadId, sender?.address, toast]);

  useEffect(() => { setMeta(null); void load(); }, [load]);

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast({ title: done }); await load(); } catch (e) {
      toast({ title: 'That did not work', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  if (!account) return null;
  if (!meta) return <div className="px-4 py-2 border-b border-hairline text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /></div>;

  const snooze = (until: Date | null) => run(async () => {
    await gmailApi.snooze({ account_id: account.id, thread_id: threadId, until: until ? until.toISOString() : null, subject });
    if (until && g.labelId === 'INBOX') g.dropThread(threadId);
    else if (!until && g.labelId === SNOOZED_VIEW) g.dropThread(threadId);
    else g.patchThread(threadId, { snoozed_until: until ? until.toISOString() : null });
  }, until ? `Snoozed until ${formatDate(until.toISOString())} ${formatTime(until.toISOString())}` : 'Back in the inbox');

  return (
    <div className="px-4 py-2 border-b border-hairline flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs shrink-0">
      <span className="inline-flex items-center gap-1.5 min-w-0">
        <UserRound className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        {meta.contact ? (
          <>
            <Link to={`/crm/contacts/${meta.contact.id}`} className="font-medium hover:underline truncate">{meta.contact.name || meta.contact.email}</Link>
            {meta.contact.companies[0] && (
              <Link to={`/crm/companies/${meta.contact.companies[0].id}`} className="inline-flex items-center gap-1 text-muted-foreground hover:underline truncate">
                <Building2 className="w-3 h-3" />{meta.contact.companies[0].name}
              </Link>
            )}
            {meta.contact_suggested ? (
              <Button size="sm" variant="outline" className="h-6 text-xs" disabled={busy}
                onClick={() => run(() => gmailApi.linkContact({ account_id: account.id, thread_id: threadId, contact_id: meta.contact!.id, subject, sender: sender?.address ?? undefined }), 'Linked to the contact')}>
                Link
              </Button>
            ) : (
              <button type="button" title="Unlink from this contact" className="text-muted-foreground hover:text-foreground" disabled={busy}
                onClick={() => run(() => gmailApi.linkContact({ account_id: account.id, thread_id: threadId, contact_id: null }), 'Unlinked')}>
                <X className="w-3 h-3" />
              </button>
            )}
          </>
        ) : sender?.address ? (
          <>
            <span className="text-muted-foreground truncate">{sender.address} is not in your CRM</span>
            <Button size="sm" variant="outline" className="h-6 text-xs" disabled={busy}
              onClick={() => run(() => gmailApi.createContact({ account_id: account.id, thread_id: threadId, email: sender.address!, name: sender.name ?? undefined }), 'Contact saved')}>
              <UserPlus className="w-3 h-3 mr-1" />Add to CRM
            </Button>
          </>
        ) : <span className="text-muted-foreground">No sender to link</span>}
      </span>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={busy}>
            <AlarmClock className="w-3.5 h-3.5 mr-1" />
            {meta.snoozed_until ? `Snoozed until ${formatDate(meta.snoozed_until)} ${formatTime(meta.snoozed_until)}` : 'Snooze'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {snoozePresets().map((p) => (
            <DropdownMenuItem key={p.label} onSelect={() => snooze(p.at)}>
              <span className="flex-1">{p.label}</span>
              <span className="text-muted-foreground text-[11px]">{formatDate(p.at.toISOString())} {formatTime(p.at.toISOString())}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>Pick a date and time…</DropdownMenuItem>
          {meta.snoozed_until && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => snooze(null)}>Unsnooze now</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {customOpen && (
        <span className="inline-flex items-center gap-1.5">
          <Input type="datetime-local" value={custom} onChange={(e) => setCustom(e.target.value)} className="h-6 text-xs w-48" aria-label="Snooze until" />
          <Button size="sm" className="h-6 text-xs" disabled={!custom || busy} onClick={() => { setCustomOpen(false); void snooze(new Date(custom)); }}>Snooze</Button>
          <button type="button" title="Cancel" onClick={() => setCustomOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
        </span>
      )}

      {meta.shared && (
        <label className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground">Assigned to</span>
          <select
            className="h-6 rounded-sm border border-hairline bg-card px-1 text-xs"
            value={meta.assignee_user_id ?? ''}
            disabled={busy}
            onChange={(e) => {
              const v = e.target.value || null;
              void run(async () => { await gmailApi.assign(account.id, threadId, v); g.patchThread(threadId, { assignee_user_id: v }); }, v ? 'Assigned' : 'Unassigned');
            }}
          >
            <option value="">Nobody</option>
            {meta.members.map((m) => <option key={m.user_id} value={m.user_id}>{m.name}</option>)}
          </select>
        </label>
      )}
    </div>
  );
};
