import React, { useRef, useState } from 'react';
import { AlarmClock, AlertTriangle, Archive, CalendarClock, Users, FilePen, Inbox as InboxIcon, Loader2, Mail, Paperclip, Plus, Search, Send, ShieldAlert, Star, Tag, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { HubEmptyState } from '@/components/core/hub';
import { gmailApi } from '@/services/gmailApi';
import { timeAgo } from '../inboxFormat';
import { formatDate } from '@/utils/datetime';
import { INBOX_MODES, type InboxMode } from '../inboxModes';
import { splitAddresses } from '../emailRecipients';
import { NavRow, SidebarHeading } from '../components/InboxPrimitives';
import { EmailFormatBar, EmailPreview } from '../components/EmailFormatBar';
import { GmailThreadView, fileToAttachment } from './GmailThreadView';
import { SNOOZED_VIEW, useGmailMailbox, type GmailMailboxState } from './useGmailMailbox';
import { GmailShareDialog } from './GmailShareDialog';
import { ScheduledDialog, SendLaterMenu } from '../components/SendLater';

const SYSTEM_ROWS: Array<{ id: string; label: string; icon: React.ElementType }> = [
  { id: 'INBOX', label: 'Inbox', icon: InboxIcon },
  { id: 'STARRED', label: 'Starred', icon: Star },
  { id: SNOOZED_VIEW, label: 'Snoozed', icon: AlarmClock },
  { id: 'DRAFT', label: 'Drafts', icon: FilePen },
  { id: 'SENT', label: 'Sent', icon: Send },
  { id: 'SPAM', label: 'Spam', icon: ShieldAlert },
  { id: 'TRASH', label: 'Trash', icon: Trash2 },
];

const ComposeGmailDialog: React.FC<{ g: GmailMailboxState; onClose: () => void }> = ({ g, onClose }) => {
  const { toast } = useToast();
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const send = async (sendAt?: Date) => {
    if (!g.account) return;
    setBusy(true);
    try {
      const input = {
        account_id: g.account.id, to: splitAddresses(to), cc: splitAddresses(cc), bcc: splitAddresses(bcc), subject, body,
        attachments: files.length ? await Promise.all(files.map(fileToAttachment)) : undefined,
      };
      if (sendAt) await gmailApi.schedule({ ...input, send_at: sendAt.toISOString() });
      else await gmailApi.send(input);
      toast({ title: sendAt ? 'Email scheduled' : 'Email sent' });
      onClose();
      void g.loadThreads();
    } catch (e) {
      toast({ title: 'Email not sent', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>New Email</DialogTitle>
          <DialogDescription>From {g.account?.email}. It goes out through Gmail and lands in your Sent.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-[3.5rem_1fr] items-center gap-1.5">
          <Label htmlFor="gc-to" className="text-xs text-muted-foreground">To</Label>
          <Input id="gc-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="name@company.com, …" />
          <Label htmlFor="gc-cc" className="text-xs text-muted-foreground">Cc</Label>
          <Input id="gc-cc" value={cc} onChange={(e) => setCc(e.target.value)} />
          <Label htmlFor="gc-bcc" className="text-xs text-muted-foreground">Bcc</Label>
          <Input id="gc-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} />
          <Label htmlFor="gc-subject" className="text-xs text-muted-foreground">Subject</Label>
          <Input id="gc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <EmailFormatBar textareaRef={ref} value={body} onChange={setBody} preview={preview} onPreview={setPreview} />
        {preview
          ? <EmailPreview value={body} onEdit={() => setPreview(false)} />
          : <Textarea ref={ref} aria-label="Message" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[180px] resize-y" />}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground">
            <Paperclip className="w-3.5 h-3.5" /> Attach files
            <input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); setFiles((c) => [...c, ...f]); e.target.value = ''; }} />
          </label>
          {files.map((f, i) => (
            <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-card px-1.5 py-0.5">
              {f.name}<button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} title="Remove"><X className="w-3 h-3" /></button>
            </span>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <SendLaterMenu disabled={busy || !to.includes('@') || !subject.trim() || (!body.trim() && !files.length)} onPick={(d) => { void send(d); }} />
          <Button onClick={() => { void send(); }} disabled={busy || !to.includes('@') || !subject.trim() || (!body.trim() && !files.length)}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Send'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export const GmailInbox: React.FC<{ mode: InboxMode; setMode: (m: InboxMode) => void }> = ({ mode, setMode }) => {
  const g = useGmailMailbox();
  const [composing, setComposing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [showScheduled, setShowScheduled] = useState(false);
  const { accounts, account, configured } = g;
  const labelById = new Map(g.labels.map((l) => [l.id, l]));
  const userLabels = g.labels.filter((l) => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name));

  const modeTabs = (
    <div role="tablist" aria-label="Inbox source" className="flex items-center gap-3 px-3 border-b border-hairline shrink-0">
      {INBOX_MODES.map((m) => (
        <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)} className="text-xs py-2">{m.label}</button>
      ))}
    </div>
  );

  if (accounts !== null && (accounts.length === 0 || !account)) {
    return (
      <div className="dashboard-card md:col-span-12 flex-1 min-h-0 flex flex-col overflow-hidden p-0">
        {modeTabs}
        <div className="flex-1 flex items-center justify-center p-6">
          <HubEmptyState
            icon={Mail}
            title="Connect your Gmail"
            description={configured
              ? 'Read, search and answer your Gmail here, next to your customers. Your mail stays in Gmail: nothing is copied, and only you see this mailbox.'
              : 'Google is not configured on this platform yet. A platform admin adds GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET under Operations → Keys.'}
            action={configured ? <Button onClick={g.connect}><Mail className="w-4 h-4 mr-1.5" />Connect Gmail</Button> : undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      <aside className="dashboard-card md:col-span-3 lg:col-span-2 hidden md:flex flex-col overflow-hidden p-0">
        {modeTabs}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-3 space-y-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className="w-full text-left text-[11px] text-muted-foreground truncate hover:text-foreground">
                  {account?.email ?? 'Loading…'} ▾
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {(accounts ?? []).map((a) => (
                  <DropdownMenuItem key={a.id} onSelect={() => g.setAccountId(a.id)}>
                    {a.email}{a.is_shared ? ' · shared' : ''}{a.status !== 'active' ? ' (reconnect)' : ''}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={g.connect}><Plus className="w-3.5 h-3.5 mr-1.5" />Connect another Gmail</DropdownMenuItem>
                {account?.is_owner && <DropdownMenuItem onSelect={() => setSharing(true)}><Users className="w-3.5 h-3.5 mr-1.5" />Share this mailbox…</DropdownMenuItem>}
                {account?.is_owner && <DropdownMenuItem onSelect={() => g.disconnect(account.id)}>Disconnect {account.email}</DropdownMenuItem>}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button className="w-full" onClick={() => setComposing(true)} disabled={account?.status !== 'active'}>
              <Plus className="w-4 h-4 mr-1.5" /> Compose
            </Button>
          </div>
          <nav className="px-2 pb-1 space-y-0.5">
            {SYSTEM_ROWS.map(({ id, label, icon: Icon }) => {
              const l = labelById.get(id);
              return (
                <NavRow key={id} icon={<Icon className="w-4 h-4 shrink-0" />} label={label}
                  active={!g.appliedQuery && g.labelId === id}
                  count={id === 'INBOX' && l?.unread ? String(l.unread) : id === 'DRAFT' && l?.total ? String(l.total) : null}
                  emphasiseCount={id === 'INBOX'}
                  onClick={() => { g.setQuery(''); g.setLabelId(id); }} />
              );
            })}
            <NavRow icon={<CalendarClock className="w-4 h-4 shrink-0" />} label="Scheduled" active={false} onClick={() => setShowScheduled(true)} />
            <NavRow icon={<Archive className="w-4 h-4 shrink-0" />} label="All mail" active={!g.appliedQuery && g.labelId === ''}
              onClick={() => { g.setQuery(''); g.setLabelId(''); }} />
          </nav>
          {userLabels.length > 0 && (
            <>
              <SidebarHeading>Labels</SidebarHeading>
              <nav className="px-2 pb-3 space-y-0.5">
                {userLabels.map((l) => (
                  <NavRow key={l.id} dense label={l.name} active={!g.appliedQuery && g.labelId === l.id}
                    icon={<Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                    count={l.unread ? String(l.unread) : null}
                    onClick={() => { g.setQuery(''); g.setLabelId(l.id); }} />
                ))}
              </nav>
            </>
          )}
        </div>
      </aside>

      <div className={`dashboard-card md:col-span-4 lg:col-span-3 flex-1 min-h-0 md:flex-none flex flex-col overflow-hidden p-0 ${g.openId ? 'hidden md:flex' : 'flex'}`}>
        <div className="md:hidden">{modeTabs}</div>
        <div className="p-3 border-b border-hairline bg-surface-sunken flex items-center gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input value={g.query} onChange={(e) => g.setQuery(e.target.value)} placeholder="Search Gmail (from:, has:attachment…)" className="pl-9 h-9" />
          </div>
          <Button size="icon" className="h-9 w-9 shrink-0 md:hidden" onClick={() => setComposing(true)} title="Compose"><Plus className="w-4 h-4" /></Button>
        </div>
        {account?.is_shared && (
          <div role="tablist" aria-label="Assignment" className="flex items-center gap-3 px-3 border-b border-hairline text-xs">
            {(['all', 'mine', 'unassigned'] as const).map((k) => (
              <button key={k} role="tab" aria-selected={g.assignFilter === k} onClick={() => g.setAssignFilter(k)} className="py-1.5 capitalize">{k}</button>
            ))}
          </div>
        )}
        {account?.status === 'needs_reauth' && (
          <div className="m-3 text-xs rounded-sm border border-warning/25 bg-[hsl(var(--warning-bg))] text-warning px-3 py-2 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span className="flex-1">Google access for {account.email} was revoked or expired.</span>
            <Button size="sm" variant="outline" className="h-6 text-xs" onClick={g.connect}>Reconnect</Button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {g.loadingList ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
          ) : g.listError ? (
            <div className="p-4 text-sm text-destructive">Gmail did not answer: {g.listError}</div>
          ) : g.visibleThreads.length === 0 ? (
            g.appliedQuery
              ? <HubEmptyState icon={Search} variant="filtered" title="Nothing matches" description={`Gmail found nothing for “${g.appliedQuery}”.`}
                action={<Button size="sm" variant="outline" onClick={() => g.setQuery('')}>Clear search</Button>} />
              : <HubEmptyState icon={Mail} title="Nothing here" description="This folder is empty in Gmail." />
          ) : (
            <>
              {g.visibleThreads.map((t) => (
                <button key={t.id} type="button" onClick={() => g.openThread(t.id)}
                  className={`w-full text-left px-4 py-3 border-b border-hairline border-l-2 transition-colors ${g.openId === t.id ? 'bg-surface-hover border-l-primary' : 'border-l-transparent hover:bg-surface-hover'}`}>
                  <div className="flex items-center gap-2">
                    {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                    <span className={`flex-1 truncate text-sm ${t.unread ? 'font-semibold' : 'text-foreground/90'}`}>
                      {t.participants.join(', ') || t.from.name || t.from.address}
                      {t.message_count > 1 && <span className="text-muted-foreground font-normal"> {t.message_count}</span>}
                    </span>
                    {t.starred && <Star className="w-3 h-3 shrink-0 fill-current text-amber-700 dark:text-amber-300" />}
                    <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{t.date ? timeAgo(t.date) : ''}</span>
                  </div>
                  <div className={`text-xs truncate ${t.unread ? 'text-foreground' : 'text-foreground/80'}`}>{t.subject}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.snippet}</div>
                  {(t.contact_name || t.snoozed_until) && (
                    <div className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted-foreground">
                      {t.contact_name && <span className="truncate">CRM · {t.contact_name}</span>}
                      {t.snoozed_until && <span className="inline-flex items-center gap-0.5"><AlarmClock className="w-3 h-3" />{formatDate(t.snoozed_until)}</span>}
                    </div>
                  )}
                </button>
              ))}
              {g.nextPageToken && (
                <div className="p-3 flex justify-center">
                  <Button size="sm" variant="outline" onClick={g.loadMore} disabled={g.loadingMore}>
                    {g.loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load older'}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`dashboard-card md:col-span-5 lg:col-span-7 flex-1 min-h-0 flex flex-col overflow-hidden p-0 ${g.openId ? 'flex' : 'hidden md:flex'}`}>
        <GmailThreadView g={g} />
      </div>
      {composing && <ComposeGmailDialog g={g} onClose={() => setComposing(false)} />}
      {showScheduled && <ScheduledDialog onClose={() => setShowScheduled(false)} />}
      {sharing && account && <GmailShareDialog account={account} onClose={() => setSharing(false)} onSaved={() => { setSharing(false); void g.reloadAccounts(); }} />}
    </>
  );
};
