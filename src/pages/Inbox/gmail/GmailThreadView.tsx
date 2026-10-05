import React, { useMemo, useRef, useState } from 'react';
import {
  Archive, ArrowLeft, Check, Forward, ListTodo, Loader2, Mail, MailOpen, Paperclip, Reply, ReplyAll, Send, Sparkles, Star, Tag, Trash2, X,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { formatDate, formatTime } from '@/utils/datetime';
import { gmailApi, type GmailAddress, type GmailMessage } from '@/services/gmailApi';
import { EmailHtmlView } from '../components/EmailHtmlView';
import { EmailFormatBar, EmailPreview } from '../components/EmailFormatBar';
import { SendLaterMenu } from '../components/SendLater';
import { ComposerInsertMenu } from '../components/ComposerInsertMenu';
import type { GmailMailboxState } from './useGmailMailbox';
import { GmailThreadFacts } from './GmailThreadFacts';
import { GmailTaskDialog } from './GmailTaskDialog';
import { AttachmentCards, MailAvatar, PersonChip, RecipientInput, base64ToBlob } from './mailParts';
import { AttachmentActionsProvider } from '../components/AttachmentActions';

export async function fileToAttachment(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { filename: file.name, content_type: file.type || 'application/octet-stream', data_base64: btoa(bin) };
}

const stamp = (iso: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : '—');
const who = (a: GmailAddress) => a.name || a.address || 'Unknown';

const ToolButton: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; active?: boolean }> = ({ icon: Icon, label, onClick, disabled, active }) => (
  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1.5" title={label} onClick={onClick} disabled={disabled}>
    <Icon className={`w-4 h-4 ${active ? 'fill-current text-amber-700 dark:text-amber-300' : ''}`} />
    <span className="hidden xl:inline">{label}</span>
  </Button>
);

const CollapsedMessage: React.FC<{ m: GmailMessage; mine: boolean; onOpen: () => void }> = ({ m, mine, onOpen }) => (
  <button type="button" onClick={onOpen} className="w-full flex items-center gap-3 py-2.5 border-b border-hairline text-left hover:bg-surface-hover px-1">
    <MailAvatar name={m.from.name} email={m.from.address} photoUrl={m.from.photo_url} className="h-8 w-8" />
    <span className="text-sm font-medium shrink-0">{mine ? 'You' : who(m.from)}</span>
    <span className="text-xs text-muted-foreground truncate flex-1">– {m.snippet}</span>
    {m.attachments.length > 0 && <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{stamp(m.date)}</span>
  </button>
);

const FullMessage: React.FC<{ m: GmailMessage; mine: boolean; accountId: string; onCollapse?: () => void }> = ({ m, mine, accountId, onCollapse }) => {
  const [plain, setPlain] = useState(false);
  return (
    <article className="py-4 border-b border-hairline last:border-b-0 space-y-3">
      <header className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onCollapse} disabled={!onCollapse} className="flex items-center gap-3 text-left min-w-0">
          <MailAvatar name={m.from.name} email={m.from.address} photoUrl={m.from.photo_url} className="h-10 w-10" />
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{mine ? `You (${m.from.address})` : who(m.from)}</span>
            <span className="block text-xs text-muted-foreground truncate">{mine ? stamp(m.date) : `${m.from.address} · ${stamp(m.date)}`}</span>
          </span>
        </button>
        <div className="ml-auto flex flex-col items-end gap-1 min-w-0 max-w-full">
          {m.to.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground">To:</span>
              {m.to.slice(0, 4).map((a) => <PersonChip key={a.address} name={a.name} address={a.address ?? ''} photoUrl={a.photo_url} />)}
              {m.to.length > 4 && <span className="text-xs text-muted-foreground">+{m.to.length - 4}</span>}
            </div>
          )}
          {m.cc.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground">Cc:</span>
              {m.cc.slice(0, 4).map((a) => <PersonChip key={a.address} name={a.name} address={a.address ?? ''} photoUrl={a.photo_url} />)}
              {m.cc.length > 4 && <span className="text-xs text-muted-foreground">+{m.cc.length - 4}</span>}
            </div>
          )}
        </div>
      </header>
      {m.html && !plain
        ? <EmailHtmlView html={m.html} sender={m.from.address} onShowText={() => setPlain(true)} />
        : (
          <div className="space-y-1">
            <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.text ?? m.snippet}</div>
            {m.html && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPlain(false)}>Show formatted</Button>}
          </div>
        )}
      <AttachmentCards accountId={accountId} messageId={m.id} attachments={m.attachments} />
    </article>
  );
};

type ComposeMode = 'reply' | 'all' | 'forward';

export const GmailThreadView: React.FC<{ g: GmailMailboxState }> = ({ g }) => {
  const { toast } = useToast();
  const { account, openId, openMessages, loadingThread, modify, threads, setOpenId, openThread, labels } = g;
  const [taskOpen, setTaskOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<ComposeMode | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [assisting, setAssisting] = useState<null | 'summary' | 'draft'>(null);
  const [summary, setSummary] = useState<{ threadId: string; text: string } | null>(null);
  const [steer, setSteer] = useState('');
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const userLabels = labels.filter((l) => l.type === 'user').sort((a, b) => a.name.localeCompare(b.name));
  const row = threads.find((t) => t.id === openId);
  const last = openMessages?.[openMessages.length - 1] ?? null;
  const me = account?.email.toLowerCase() ?? '';
  const threadSubject = row?.subject ?? last?.subject ?? 'Conversation';
  const threadLabels = userLabels.filter((l) => (row?.label_ids ?? []).includes(l.id));

  const lastIncoming = useMemo(
    () => [...(openMessages ?? [])].reverse().find((m) => m.from.address !== me) ?? last,
    [openMessages, me, last],
  );

  const known = useMemo(() => {
    const map = new Map<string, { name: string | null; photo_url?: string | null }>();
    for (const m of openMessages ?? []) {
      for (const a of [m.from, ...m.to, ...m.cc]) if (a.address && !map.has(a.address)) map.set(a.address, { name: a.name, photo_url: a.photo_url });
    }
    return map;
  }, [openMessages]);

  const reset = () => {
    setMode(null); setBody(''); setFiles([]); setTo([]); setCc([]); setBcc([]); setCopiesOpen(false); setPreview(false); setSubject(''); setSteer('');
  };

  const startReply = (kind: 'reply' | 'all') => {
    if (!lastIncoming) return;
    const target = lastIncoming.reply_to || lastIncoming.from.address || '';
    setTo(target ? [target] : []);
    const others = kind === 'all'
      ? [...lastIncoming.to, ...lastIncoming.cc].map((a) => a.address).filter((a): a is string => !!a && a !== me && a !== target)
      : [];
    setCc([...new Set(others)]);
    setCopiesOpen(others.length > 0);
    setSubject('');
    setMode(kind);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const startForward = async () => {
    if (!account || !last) return;
    setMode('forward'); setTo([]); setCc([]); setBcc([]); setCopiesOpen(false);
    setSubject(/^fwd?:/i.test(threadSubject) ? threadSubject : `Fwd: ${threadSubject}`);
    setBody([
      '', '', '---------- Forwarded message ----------',
      `From: ${who(last.from)}${last.from.name ? ` <${last.from.address}>` : ''}`,
      `Date: ${stamp(last.date)}`,
      `Subject: ${last.subject}`,
      `To: ${last.to.map((a) => a.address).join(', ')}`,
      '', last.text ?? last.snippet,
    ].join('\n'));
    if (!last.attachments.length) { setFiles([]); return; }
    setPreparing(true);
    try {
      const loaded = await Promise.all(last.attachments.map(async (a) => {
        const { data_base64 } = await gmailApi.attachment(account.id, last.id, a.attachmentId);
        return new File([base64ToBlob(data_base64, a.mimeType || 'application/octet-stream')], a.filename, { type: a.mimeType });
      }));
      setFiles(loaded);
    } catch (e) {
      toast({ title: 'The attachments could not be added', description: (e as Error).message, variant: 'destructive' });
    } finally { setPreparing(false); }
  };

  const assist = async (kind: 'summary' | 'draft') => {
    if (!account || !openId) return;
    setAssisting(kind);
    try {
      const r = await gmailApi.assist(account.id, openId, kind, kind === 'draft' ? steer : undefined);
      if (kind === 'summary') setSummary({ threadId: openId, text: r.text });
      else {
        if (!mode || mode === 'forward') startReply('reply');
        setBody(r.text);
        setSteer('');
      }
    } catch (e) {
      toast({ title: kind === 'summary' ? 'Could not summarise' : 'Could not draft', description: (e as Error).message, variant: 'destructive' });
    } finally { setAssisting(null); }
  };

  const send = async (sendAt?: Date) => {
    if (!account || !openId || !lastIncoming || !mode) return;
    setSending(true);
    try {
      const input = {
        account_id: account.id, to, cc, bcc, body,
        ...(mode === 'forward'
          ? { subject }
          : { thread_id: openId, reply_to_message_id: lastIncoming.id }),
        attachments: files.length ? await Promise.all(files.map(fileToAttachment)) : undefined,
      };
      if (sendAt) {
        await gmailApi.schedule({ ...input, send_at: sendAt.toISOString() });
        toast({ title: 'Scheduled', description: `It goes out ${stamp(sendAt.toISOString())}.` });
      } else {
        await gmailApi.send(input);
        toast({ title: mode === 'forward' ? 'Forwarded' : 'Reply sent' });
      }
      reset();
      if (!sendAt && mode !== 'forward') await openThread(openId);
    } catch (e) {
      toast({ title: 'Not sent', description: (e as Error).message, variant: 'destructive' });
    } finally { setSending(false); }
  };

  if (!openId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-muted-foreground p-6">
        <Mail className="w-6 h-6 mb-2" />
        Pick a conversation to read it.
      </div>
    );
  }

  const canSend = to.length > 0 && (body.trim() || files.length > 0) && (mode !== 'forward' || subject.trim()) && !sending && !preparing;
  const earlier = (openMessages ?? []).slice(0, -1);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-2 py-1.5 border-b border-hairline bg-surface-sunken flex items-center gap-0.5 shrink-0 overflow-x-auto">
        <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setOpenId(null)} title="Back"><ArrowLeft className="w-4 h-4" /></Button>
        <ToolButton icon={Reply} label="Reply" onClick={() => startReply('reply')} disabled={!lastIncoming} />
        <ToolButton icon={ReplyAll} label="Reply all" onClick={() => startReply('all')} disabled={!lastIncoming} />
        <ToolButton icon={Forward} label="Forward" onClick={() => { void startForward(); }} disabled={!last} />
        <span className="w-px h-5 bg-hairline mx-1" />
        <ToolButton icon={Star} label="Important" active={row?.starred}
          onClick={() => modify(openId, row?.starred ? { remove: ['STARRED'] } : { add: ['STARRED'] }, row?.starred ? 'Unstarred' : 'Starred')} />
        {userLabels.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1.5" title="Labels"><Tag className="w-4 h-4" /><span className="hidden xl:inline">Label</span></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {userLabels.map((l) => {
                const on = (row?.label_ids ?? []).includes(l.id);
                return (
                  <DropdownMenuItem key={l.id} onSelect={() => modify(openId, on ? { remove: [l.id] } : { add: [l.id] }, on ? `Removed ${l.name}` : `Labelled ${l.name}`)}>
                    <Check className={`w-3.5 h-3.5 mr-2 ${on ? '' : 'opacity-0'}`} />{l.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <ToolButton icon={ListTodo} label="Task" onClick={() => setTaskOpen(true)} disabled={!openMessages} />
        <ToolButton icon={assisting === 'summary' ? Loader2 : Sparkles} label="Summarise" onClick={() => { void assist('summary'); }} disabled={!!assisting || !openMessages} />
        <span className="ml-auto" />
        <ToolButton icon={MailOpen} label="Unread" onClick={() => modify(openId, { add: ['UNREAD'] }, 'Marked unread')} />
        <ToolButton icon={Archive} label="Archive" onClick={() => modify(openId, { remove: ['INBOX'] }, 'Archived')} />
        <ToolButton icon={Trash2} label="Delete" onClick={() => modify(openId, { trash: true }, 'Moved to trash')} />
      </div>

      {taskOpen && account && (
        <GmailTaskDialog
          subject={threadSubject}
          context={[
            lastIncoming ? `From ${lastIncoming.from.name ?? ''} <${lastIncoming.from.address ?? ''}>`.trim() : '',
            (lastIncoming?.snippet ?? '').trim(),
            `Gmail: https://mail.google.com/mail/u/?authuser=${encodeURIComponent(account.email)}#all/${openId}`,
          ].filter(Boolean).join('\n\n')}
          onClose={() => setTaskOpen(false)}
        />
      )}

      <AttachmentActionsProvider value={account ? { workspaceId: account.workspace_id, customer: null, subject: threadSubject } : null}>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 pt-4 pb-2 space-y-2">
          {threadLabels.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {threadLabels.map((l) => (
                <span key={l.id} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken px-2 py-0.5 text-xs">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/40" style={l.color ? { backgroundColor: l.color } : undefined} />{l.name}
                  <button type="button" title={`Remove ${l.name}`} className="text-muted-foreground hover:text-foreground"
                    onClick={() => modify(openId, { remove: [l.id] }, `Removed ${l.name}`)}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
          )}
          {last?.date && <div className="text-xs text-muted-foreground">{stamp(last.date)}</div>}
          <h1 className="font-sans text-xl sm:text-2xl font-semibold leading-tight break-words">{threadSubject}</h1>
        </div>
        {openMessages && <GmailThreadFacts g={g} threadId={openId} subject={threadSubject} sender={lastIncoming?.from ?? null} />}

        <div className="px-5 pb-4">
          {summary?.threadId === openId && (
            <div className="mt-3 rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Summary by JARVIS
                <button type="button" className="ml-auto hover:text-foreground" title="Hide" onClick={() => setSummary(null)}><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="whitespace-pre-wrap">{summary.text}</div>
            </div>
          )}
          {loadingThread || !openMessages ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {earlier.map((m) => (expanded.has(m.id)
                ? <FullMessage key={m.id} m={m} mine={m.from.address === me} accountId={account?.id ?? ''}
                    onCollapse={() => setExpanded((cur) => { const n = new Set(cur); n.delete(m.id); return n; })} />
                : <CollapsedMessage key={m.id} m={m} mine={m.from.address === me}
                    onOpen={() => setExpanded((cur) => new Set(cur).add(m.id))} />))}
              {last && <FullMessage m={last} mine={last.from.address === me} accountId={account?.id ?? ''} />}
            </>
          )}
        </div>
      </div>
      </AttachmentActionsProvider>

      <div className="border-t border-hairline bg-surface-sunken p-3 shrink-0">
        {!mode ? (
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => startReply('reply')} disabled={!lastIncoming}><Reply className="w-4 h-4 mr-1" />Reply</Button>
            <Button size="sm" variant="outline" onClick={() => startReply('all')} disabled={!lastIncoming}><ReplyAll className="w-4 h-4 mr-1" />Reply all</Button>
            <Button size="sm" variant="outline" onClick={() => { void startForward(); }} disabled={!last}><Forward className="w-4 h-4 mr-1" />Forward</Button>
            <Button size="sm" variant="outline" onClick={() => { void assist('draft'); }} disabled={!lastIncoming || !!assisting}>
              {assisting === 'draft' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}Draft with AI
            </Button>
          </div>
        ) : (
          <div className="rounded-sm border border-hairline bg-card">
            <div className="px-3 pt-1 border-b border-hairline">
              <div className="flex items-start">
                <div className="flex-1 min-w-0"><RecipientInput id="g-to" label="To" value={to} onChange={setTo} known={known} autoFocus={mode === 'forward'} /></div>
                {!copiesOpen && <button type="button" className="text-xs text-muted-foreground hover:text-foreground pt-2.5" onClick={() => setCopiesOpen(true)}>Cc Bcc</button>}
              </div>
              {copiesOpen && (
                <>
                  <RecipientInput id="g-cc" label="Cc" value={cc} onChange={setCc} known={known} />
                  <RecipientInput id="g-bcc" label="Bcc" value={bcc} onChange={setBcc} known={known} />
                </>
              )}
              {mode === 'forward' && (
                <div className="flex items-center gap-2 py-1">
                  <label htmlFor="g-subject" className="text-xs text-muted-foreground w-8 shrink-0">Subj.</label>
                  <input id="g-subject" value={subject} onChange={(e) => setSubject(e.target.value)} className="flex-1 bg-transparent text-sm outline-none py-1" />
                </div>
              )}
            </div>
            {mode !== 'forward' && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-hairline">
                <Sparkles className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <Input value={steer} onChange={(e) => setSteer(e.target.value)} placeholder="Tell JARVIS what the reply should say, then Draft" className="h-7 text-xs border-0 shadow-none focus-visible:ring-0 px-1" />
                <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" disabled={!!assisting} onClick={() => { void assist('draft'); }}>
                  {assisting === 'draft' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Draft'}
                </Button>
              </div>
            )}
            <div className="p-2">
              {preview
                ? <EmailPreview value={body} onEdit={() => setPreview(false)} />
                : <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your message…" className="min-h-[110px] resize-y border-0 shadow-none focus-visible:ring-0" />}
            </div>
            <div className="px-2 pb-2 flex items-center justify-between gap-2">
              <EmailFormatBar textareaRef={bodyRef} value={body} onChange={setBody} preview={preview} onPreview={setPreview} />
              <ComposerInsertMenu workspaceId={account?.workspace_id ?? null} currentText={body}
                recipient={{ name: lastIncoming?.from.name ?? null, email: to[0] ?? null }} onInsert={(t) => setBody((d) => (d.trim() ? `${d.trimEnd()}\n\n${t}` : t))} />
            </div>
            {(files.length > 0 || preparing) && (
              <div className="px-3 pb-2 flex flex-wrap gap-1.5 text-xs">
                {preparing && <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />Adding the attachments…</span>}
                {files.map((f, i) => (
                  <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-surface-sunken px-1.5 py-0.5">
                    <Paperclip className="w-3 h-3" />{f.name}
                    <button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} title="Remove"><X className="w-3 h-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-hairline">
              <label className="inline-flex items-center gap-1 cursor-pointer text-xs text-muted-foreground hover:text-foreground" title="Attach files">
                <Paperclip className="w-4 h-4" /><span className="hidden sm:inline">Attach</span>
                <input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); setFiles((c) => [...c, ...f]); e.target.value = ''; }} />
              </label>
              <span className="ml-auto flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={reset} title="Discard"><Trash2 className="w-4 h-4" /></Button>
                <SendLaterMenu disabled={!canSend} onPick={(d) => { void send(d); }} />
                <Button size="sm" onClick={() => { void send(); }} disabled={!canSend}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Send<Send className="w-4 h-4 ml-1.5" /></>}
                </Button>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
