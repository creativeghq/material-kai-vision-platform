import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, Building2, Loader2, UserPlus, UserRound, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { formatDate, formatTime } from '@/utils/datetime';
import { gmailApi, type GmailAddress, type GmailThreadMeta } from '@/services/gmailApi';
import { OUTREACH_VIEW, SNOOZED_VIEW, type GmailMailboxState } from './useGmailMailbox';
import { FollowUpPopover } from '../components/FollowUpPopover';

function at(daysAhead: number, hour: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export const GmailThreadFacts: React.FC<{ g: GmailMailboxState; threadId: string; subject: string; sender: GmailAddress | null }> = ({ g, threadId, subject, sender }) => {
  const { toast } = useToast();
  const { account } = g;
  const [meta, setMeta] = useState<GmailThreadMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [remindAt, setRemindAt] = useState('');
  const [remindNote, setRemindNote] = useState('');

  const load = useCallback(async () => {
    if (!account) return;
    try {
      setMeta(await gmailApi.threadMeta(account.id, threadId, sender?.address));
    } catch (e) {
      toast({ title: 'Could not load the CRM link', description: (e as Error).message, variant: 'destructive' });
    }
  }, [account, threadId, sender?.address, toast]);

  useEffect(() => { setMeta(null); void load(); }, [load]);

  const loadBestTime = useCallback(async () => (account ? gmailApi.bestTime(account.id, threadId) : null), [account, threadId]);
  const draft = useCallback(async () => {
    if (!account) return '';
    try { return (await gmailApi.assist(account.id, threadId, 'followup')).text; } catch (e) {
      toast({ title: 'Could not write the follow-up', description: (e as Error).message, variant: 'destructive' });
      throw e;
    }
  }, [account, threadId, toast]);

  const run = async (fn: () => Promise<unknown>, done: string): Promise<boolean> => {
    setBusy(true);
    try { await fn(); toast({ title: done }); await load(); return true; } catch (e) {
      toast({ title: 'That did not work', description: (e as Error).message, variant: 'destructive' });
      return false;
    } finally { setBusy(false); }
  };
  const orThrow = async (ok: Promise<boolean>) => { if (!(await ok)) throw new Error('not done'); };

  if (!account) return null;
  if (!meta) return <div className="px-4 py-2 border-b border-hairline text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin inline" /></div>;

  const snooze = (until: Date | null) => run(async () => {
    await gmailApi.snooze({ account_id: account.id, thread_id: threadId, until: until ? until.toISOString() : null, subject });
    if (until && g.labelId === 'INBOX') g.dropThread(threadId);
    else if (!until && g.labelId === SNOOZED_VIEW) g.dropThread(threadId);
    else g.patchThread(threadId, { snoozed_until: until ? until.toISOString() : null });
  }, until ? `Boomerang set — back on top ${formatDate(until.toISOString())} ${formatTime(until.toISOString())}` : 'Back in the inbox');

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

      <FollowUpPopover
        compact
        idPrefix={`gmail-followup-${threadId}`}
        boomerangAt={meta.snoozed_until}
        outreach={meta.outreach ?? []}
        onBoomerang={(at) => orThrow(snooze(at))}
        onClearBoomerang={() => orThrow(snooze(null))}
        loadBestTime={loadBestTime}
        draft={draft}
        onOutreach={(steps) => orThrow(run(async () => {
          await gmailApi.outreachSchedule({ account_id: account.id, thread_id: threadId, steps: steps.map((st) => ({ body: st.body, send_at: st.at.toISOString() })) });
          if (g.labelId === OUTREACH_VIEW) void g.loadThreads();
        }, steps.length > 1
          ? `${steps.length} follow-ups scheduled from ${formatDate(steps[0].at.toISOString())} — they stop as soon as they reply`
          : `Follow-up scheduled for ${formatDate(steps[0].at.toISOString())} ${formatTime(steps[0].at.toISOString())} — it sends unless they reply first`))}
        onCancelOutreach={(o, whole) => orThrow(run(async () => {
          await gmailApi.outreachCancel(account.id, whole && o.sequence_id ? { sequence_id: o.sequence_id } : { id: o.id });
          if (g.labelId === OUTREACH_VIEW) void g.loadThreads();
        }, whole ? 'Follow-ups cancelled — none will be sent' : 'Follow-up cancelled — it will not be sent'))}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost" className="h-6 text-xs" disabled={busy}>
            <BellRing className="w-3.5 h-3.5 mr-1" />
            {meta.remind_at ? `Reminder ${formatDate(meta.remind_at)}${meta.remind_if_no_reply ? ' (if no reply)' : ''}` : 'Remind me'}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          {[3, 7].map((days) => (
            <DropdownMenuItem key={days} onSelect={() => run(() => gmailApi.remind({ account_id: account.id, thread_id: threadId, at: at(days, 9).toISOString(), if_no_reply: true, subject }), `I will remind you in ${days} days if they have not replied`)}>
              If no reply in {days === 7 ? 'a week' : `${days} days`}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => run(() => gmailApi.remind({ account_id: account.id, thread_id: threadId, at: at(1, 9).toISOString(), subject }), 'Reminder set for tomorrow morning')}>Tomorrow morning</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRemindOpen(true)}>Pick a date and a note…</DropdownMenuItem>
          {meta.remind_at && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => run(() => gmailApi.remind({ account_id: account.id, thread_id: threadId, at: null }), 'Reminder removed')}>Remove the reminder</DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {remindOpen && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <Input type="datetime-local" value={remindAt} onChange={(e) => setRemindAt(e.target.value)} className="h-6 text-xs w-48" aria-label="Remind me at" />
          <Input value={remindNote} onChange={(e) => setRemindNote(e.target.value)} placeholder="Note (optional)" className="h-6 text-xs w-44" aria-label="Reminder note" />
          <Button size="sm" className="h-6 text-xs" disabled={!remindAt || busy}
            onClick={() => { setRemindOpen(false); void run(() => gmailApi.remind({ account_id: account.id, thread_id: threadId, at: new Date(remindAt).toISOString(), note: remindNote, subject }), 'Reminder set'); }}>Set</Button>
          <button type="button" title="Cancel" onClick={() => setRemindOpen(false)} className="text-muted-foreground hover:text-foreground"><X className="w-3 h-3" /></button>
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
