import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Check, ListTodo, Loader2, Mail, MailOpen, Sparkles, Star, Tag, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/core/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { formatDate, formatTime } from '@/utils/datetime';
import { gmailApi, type GmailAddress, type GmailMessage } from '@/services/gmailApi';
import { normalizeCid, referencedCids } from '@/utils/sanitizeEmailHtml';
import { useInlineImages } from '../useInlineImages';
import { useTrackOpens } from '../components/OpenTracking';
import { CopilotPanel } from '../components/AssistTools';
import type { GmailMailboxState } from './useGmailMailbox';
import { GmailThreadFacts } from './GmailThreadFacts';
import { GmailTaskDialog } from './GmailTaskDialog';
import { AttachmentCards, MailAvatar, base64ToBlob } from './mailParts';
import { AttachmentActionsProvider } from '../components/AttachmentActions';
import { fileToAttachment } from '../composerAttachments';
import { applyGmailPlan, describePlan, type SendFollowUpPlan } from '../components/FollowUpOnSend';
import { MailMessageCard } from '../components/MailMessageCard';
import { InboxComposer } from '../components/InboxComposer';
import { useComposerSettings } from '../useComposerSettings';
import type { ComposeMode, MailComposerModel } from '../composerModel';

const stamp = (iso: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : '—');
const who = (a: GmailAddress) => a.name || a.address || 'Unknown';
const person = (a: GmailAddress) => ({ address: a.address ?? '', name: a.name, photoUrl: a.photo_url });

const IconAction: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; disabled?: boolean; active?: boolean }> = ({ icon: Icon, label, onClick, disabled, active }) => (
  <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title={label} aria-label={label} onClick={onClick} disabled={disabled}>
    <Icon className={`w-4 h-4 ${active ? 'fill-current text-amber-700 dark:text-amber-300' : ''}`} />
  </Button>
);

const GmailMessageCard: React.FC<{
  m: GmailMessage; mine: boolean; accountId: string; collapsed: boolean; onToggle?: () => void;
  onReply: () => void; onForward: () => void;
}> = ({ m, mine, accountId, collapsed, onToggle, onReply, onForward }) => {
  const { toast } = useToast();
  const [plain, setPlain] = useState(false);
  const cids = useMemo(() => referencedCids(m.html), [m.html]);
  const parts = m.attachments.filter((a) => a.contentId && cids.has(normalizeCid(a.contentId)));
  const inlineImages = useInlineImages(`${m.id}|${[...cids].join(',')}`, parts.map((a) => ({
    cid: a.contentId!, mime: a.mimeType, size: a.size,
    load: () => gmailApi.attachment(accountId, m.id, a.attachmentId).then((r) => base64ToBlob(r.data_base64, a.mimeType)),
  })), !collapsed && !!m.html && !plain);
  const listed = m.attachments.filter((a) => {
    const cid = a.contentId ? normalizeCid(a.contentId) : null;
    if (cid && inlineImages?.[cid]) return false;
    return !(a.inline && cid && !cids.has(cid));
  });
  const text = m.text ?? m.snippet;
  return (
    <MailMessageCard
      name={who(m.from)}
      address={m.from.address}
      photoUrl={m.from.photo_url}
      ours={mine}
      date={m.date}
      to={m.to.filter((a) => a.address).map(person)}
      cc={m.cc.filter((a) => a.address).map(person)}
      html={m.html}
      text={text}
      inlineImages={inlineImages}
      collapsed={collapsed}
      onToggle={onToggle}
      plain={plain}
      onPlainChange={setPlain}
      hasAttachments={listed.length > 0}
      attachments={<AttachmentCards accountId={accountId} messageId={m.id} attachments={listed} />}
      opens={m.opens}
      actions={{
        ours: true,
        onReply,
        onCopy: text ? () => { void navigator.clipboard.writeText(text); toast({ title: 'Copied' }); } : undefined,
        onForward,
      }}
    />
  );
};

export const GmailThreadView: React.FC<{ g: GmailMailboxState }> = ({ g }) => {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { account, openId, openMessages, loadingThread, modify, threads, setOpenId, openThread, labels, myUserId } = g;
  const [taskOpen, setTaskOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<{ threadId: string; text: string } | null>(null);
  const [copilotFor, setCopilotFor] = useState<string | null>(null);

  const [composeMode, setComposeModeState] = useState<ComposeMode>('reply');
  const [target, setTarget] = useState<GmailMessage | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [copiesOpen, setCopiesOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [draft, setDraft] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const forwardSeq = useRef(0);
  const [drafting, setDrafting] = useState(false);
  const [draftShown, setDraftShown] = useState(false);
  const [draftAvoidHits, setDraftAvoidHits] = useState<string[]>([]);
  const [steer, setSteer] = useState('');
  const [steerOpen, setSteerOpen] = useState(false);
  const [includeSignature, setIncludeSignature] = useState(true);
  const [followUp, setFollowUp] = useState<SendFollowUpPlan | null>(null);
  const [trackOpens, setTrackOpens] = useTrackOpens();
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const sendInFlight = useRef(false);
  const composerSettings = useComposerSettings(account?.workspace_id, myUserId);

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

  const replyBase = target ?? lastIncoming;
  const replyAllOthers = (m: GmailMessage | null, primary: string) => (m
    ? [...new Set([...m.to, ...m.cc].map((a) => a.address).filter((a): a is string => !!a && a !== me && a !== primary))]
    : []);

  const replyPrimary = (m: GmailMessage | null) => {
    if (!m) return '';
    if (m.from.address === me) return m.to.map((a) => a.address).find((a): a is string => !!a && a !== me) ?? '';
    return m.reply_to || m.from.address || '';
  };

  const startReply = (kind: 'reply' | 'all', m: GmailMessage | null = replyBase, focus = true) => {
    forwardSeq.current += 1;
    setPreparing(false);
    const primary = replyPrimary(m);
    setTo(primary ? [primary] : []);
    const others = kind === 'all' ? replyAllOthers(m, primary) : [];
    setCc(others);
    setBcc([]);
    setCopiesOpen(others.length > 0);
    setSubject('');
    setComposeModeState(kind);
    if (focus) requestAnimationFrame(() => composerRef.current?.focus());
  };

  const startForward = async (m: GmailMessage | null = target ?? last) => {
    if (!account || !m) return;
    const seq = ++forwardSeq.current;
    setComposeModeState('forward'); setTarget(m); setTo([]); setCc([]); setBcc([]); setCopiesOpen(false);
    setSubject(/^fwd?:/i.test(threadSubject) ? threadSubject : `Fwd: ${threadSubject}`);
    setDraft([
      '', '', '---------- Forwarded message ----------',
      `From: ${who(m.from)}${m.from.name ? ` <${m.from.address}>` : ''}`,
      `Date: ${stamp(m.date)}`,
      `Subject: ${m.subject}`,
      `To: ${m.to.map((a) => a.address).join(', ')}`,
      '', m.text ?? m.snippet,
    ].join('\n'));
    const forwarded = m.attachments.filter((a) => !a.inline);
    setFiles([]);
    if (!forwarded.length) return;
    setPreparing(true);
    try {
      const loaded = await Promise.all(forwarded.map(async (a) => {
        const { data_base64 } = await gmailApi.attachment(account.id, m.id, a.attachmentId);
        return new File([base64ToBlob(data_base64, a.mimeType || 'application/octet-stream')], a.filename, { type: a.mimeType });
      }));
      if (seq === forwardSeq.current) setFiles(loaded);
    } catch (e) {
      if (seq === forwardSeq.current) toast({ title: 'The attachments could not be added', description: (e as Error).message, variant: 'destructive' });
    } finally {
      if (seq === forwardSeq.current) setPreparing(false);
    }
  };

  const clearComposer = () => {
    setDraft(''); setFiles([]); setPreview(false); setSteer(''); setDraftShown(false); setTarget(null); setFollowUp(null);
  };
  const resetComposer = () => { clearComposer(); startReply('reply', lastIncoming, false); };
  const leaveForward = () => { if (composeMode === 'forward') { setDraft(''); setFiles([]); setTarget(null); } };

  useEffect(() => {
    clearComposer();
    setTo([]); setCc([]); setBcc([]); setCopiesOpen(false); setComposeModeState('reply');
  }, [openId]);
  useEffect(() => {
    if (lastIncoming && composeMode !== 'forward' && !target) startReply(composeMode, lastIncoming, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastIncoming?.id]);

  const suggest = async () => {
    if (!account || !openId) return;
    setDrafting(true);
    setSteerOpen(false);
    try {
      const r = await gmailApi.assist(account.id, openId, 'draft', steer);
      if (composeMode === 'forward') { leaveForward(); startReply('reply', lastIncoming, false); }
      setDraft(r.text);
      setDraftAvoidHits(r.avoid_hits ?? []);
      setDraftShown(true);
      setSteer('');
    } catch (e) {
      toast({ title: 'Could not draft a reply', description: (e as Error).message, variant: 'destructive' });
    } finally { setDrafting(false); }
  };

  const summarise = async () => {
    if (!account || !openId) return;
    try {
      const r = await gmailApi.assist(account.id, openId, 'summary');
      setSummary({ threadId: openId, text: r.text });
    } catch (e) {
      toast({ title: 'Could not summarise', description: (e as Error).message, variant: 'destructive' });
    }
  };

  const send = async (sendAt?: Date): Promise<boolean> => {
    if (!account || !openId || !replyBase) return false;
    if (sendAt && followUp) {
      toast({ title: 'Send now, or remove the follow-up', description: 'A follow-up starts when the message goes out, so it cannot be set on a message scheduled for later.', variant: 'destructive' });
      return false;
    }
    if (sendInFlight.current) return false;
    sendInFlight.current = true;
    setSending(true);
    try {
      const input = {
        account_id: account.id, to, cc, bcc, body: draft, track_opens: trackOpens,
        include_signature: includeSignature,
        ...(composeMode === 'forward' ? { subject } : { thread_id: openId, reply_to_message_id: replyBase.id }),
        attachments: files.length ? await Promise.all(files.map(fileToAttachment)) : undefined,
      };
      if (sendAt) {
        await gmailApi.schedule({ ...input, send_at: sendAt.toISOString() });
        toast({ title: 'Scheduled', description: `It goes out ${stamp(sendAt.toISOString())}.` });
      } else {
        const sent = await gmailApi.send(input);
        toast({ title: composeMode === 'forward' ? 'Forwarded' : 'Reply sent' });
        if (followUp) {
          const plan = followUp;
          await applyGmailPlan(account.id, sent.thread_id, plan, subject || undefined).then(
            () => toast({ title: describePlan(plan) }),
            (e: unknown) => toast({ title: 'Sent, but the follow-up was not set', description: (e as Error).message, variant: 'destructive' }),
          );
        }
      }
      const wasForward = composeMode === 'forward';
      resetComposer();
      if (!sendAt && !wasForward) await openThread(openId);
      return true;
    } catch (e) {
      toast({ title: 'Not sent', description: (e as Error).message, variant: 'destructive' });
      return false;
    } finally { sendInFlight.current = false; setSending(false); }
  };

  const model: MailComposerModel | null = openId && account ? {
    threadId: openId,
    workspaceId: account.workspace_id,
    channel: 'email',
    threadMeta: null,
    recipientName: lastIncoming ? who(lastIncoming.from) : threadSubject,
    agent: { state: null, draft: null, draftIsCurrent: null, draftError: null },
    waWindow: null,
    waBlocked: false,
    isMember: true,
    isMobile,
    autocomplete: false,
    draft,
    setDraft,
    composerRef,
    sending: sending || preparing,
    isNote: false,
    attachments: files,
    setAttachments: setFiles,
    replyQuote: target && target.id !== lastIncoming?.id && composeMode !== 'forward'
      ? { label: who(target.from), text: target.snippet || '—' }
      : null,
    clearReplyQuote: () => { setTarget(null); startReply(composeMode === 'all' ? 'all' : 'reply', lastIncoming, false); },
    email: {
      composeMode,
      setComposeMode: (mode) => {
        if (mode === 'forward') { void startForward(); return; }
        const fromForward = composeMode === 'forward';
        leaveForward();
        startReply(mode, fromForward ? lastIncoming : replyBase);
      },
      replyAllCount: replyAllOthers(replyBase, replyPrimary(replyBase)).length,
      to, setTo, from: account.email, cc, setCc, bcc, setBcc, copiesOpen, setCopiesOpen,
      subject, setSubject, known,
      trackOpens, setTrackOpens, preview, setPreview, includeSignature, setIncludeSignature,
    },
    ai: {
      drafting, draftShown, draftAvoidHits, setDraftShown, steer, setSteer, steerOpen, setSteerOpen,
      suggest,
      rewrite: async (mode, text) => (await gmailApi.assist(account.id, openId, mode, undefined, text)).text,
    },
    cards: null,
    templates: null,
    composerSettings,
    followUp: { value: followUp, set: setFollowUp, whatsappThreadId: null },
    send: () => send(),
    sendAndClose: async () => { if (await send()) await modify(openId, { remove: ['INBOX'] }, 'Sent and archived'); },
    schedule: (d) => { void send(d); },
    discard: resetComposer,
    refresh: () => { void openThread(openId); },
  } : null;

  if (!openId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-muted-foreground p-6">
        <Mail className="w-6 h-6 mb-2" />
        Pick a conversation to read it.
      </div>
    );
  }

  const earlier = (openMessages ?? []).slice(0, -1);
  const counterpart = lastIncoming?.from ?? null;
  const toggleStar = () => modify(openId, row?.starred ? { remove: ['STARRED'] } : { add: ['STARRED'] }, row?.starred ? 'Unstarred' : 'Starred');
  const card = (m: GmailMessage, collapsed: boolean, onToggle?: () => void) => (
    <GmailMessageCard key={m.id} m={m} mine={m.from.address === me} accountId={account?.id ?? ''}
      collapsed={collapsed} onToggle={onToggle}
      onReply={() => { leaveForward(); setTarget(m); startReply('reply', m); }}
      onForward={() => { void startForward(m); }} />
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-1.5 md:px-4 py-2 md:py-3 border-b border-hairline bg-card md:bg-surface-sunken flex items-center gap-2 md:gap-3 shrink-0">
        <button type="button" onClick={() => setOpenId(null)} aria-label="Back to conversations"
          className="md:hidden shrink-0 h-11 w-9 flex items-center justify-center rounded-sm text-foreground active:bg-surface-hover">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <MailAvatar name={counterpart?.name} email={counterpart?.address} photoUrl={counterpart?.photo_url} className="h-9 w-9 md:h-10 md:w-10 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-semibold truncate">{counterpart ? who(counterpart) : threadSubject}</div>
          <div className="text-xs text-muted-foreground truncate">{counterpart?.address ?? account?.email ?? ''} · Gmail</div>
        </div>
        <div className="flex items-center gap-0.5 overflow-x-auto max-w-[55%] md:max-w-none">
          <IconAction icon={Star} label={row?.starred ? 'Unstar' : 'Star'} active={row?.starred} onClick={() => { void toggleStar(); }} />
          {userLabels.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" title="Labels" aria-label="Labels"><Tag className="w-4 h-4" /></Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
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
          <IconAction icon={ListTodo} label="Create a task" onClick={() => setTaskOpen(true)} disabled={!openMessages} />
          <IconAction icon={Sparkles} label="JARVIS" onClick={() => setCopilotFor(copilotFor === openId ? null : openId)} disabled={!openMessages} />
          <IconAction icon={MailOpen} label="Mark unread" onClick={() => modify(openId, { add: ['UNREAD'] }, 'Marked unread')} />
          <IconAction icon={Archive} label="Archive" onClick={() => modify(openId, { remove: ['INBOX'] }, 'Archived')} />
          <IconAction icon={Trash2} label="Delete" onClick={() => modify(openId, { trash: true }, 'Moved to the Bin')} />
        </div>
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
      <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-3 py-3 md:p-4">
        <div className="space-y-3">
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
          <h1 className="font-sans text-xl sm:text-2xl font-semibold leading-tight break-words pb-1">{threadSubject}</h1>
          {openMessages && <GmailThreadFacts g={g} threadId={openId} subject={threadSubject} sender={lastIncoming?.from ?? null} />}
          {copilotFor === openId && account && (
            <div className="rounded-sm border border-hairline p-3">
              <CopilotPanel run={async (mode, question) => (await gmailApi.assist(account.id, openId, mode, question)).text} />
            </div>
          )}
          {summary?.threadId === openId ? (
            <div className="rounded-sm border border-hairline bg-surface-sunken px-3 py-2 text-sm">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                <Sparkles className="w-3.5 h-3.5" /> Summary by JARVIS
                <button type="button" className="ml-auto hover:text-foreground" title="Hide" onClick={() => setSummary(null)}><X className="w-3.5 h-3.5" /></button>
              </div>
              <div className="whitespace-pre-wrap">{summary.text}</div>
            </div>
          ) : openMessages && openMessages.length > 2 && (
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => { void summarise(); }}>
              <Sparkles className="w-3.5 h-3.5 mr-1" /> Summarise this conversation
            </Button>
          )}
          {loadingThread || !openMessages ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div>
              {earlier.map((m) => (expanded.has(m.id)
                ? card(m, false, () => setExpanded((cur) => { const n = new Set(cur); n.delete(m.id); return n; }))
                : card(m, true, () => setExpanded((cur) => new Set(cur).add(m.id)))))}
              {last && card(last, false)}
            </div>
          )}
        </div>
      </div>
      </AttachmentActionsProvider>

      {model && <InboxComposer m={model} />}
    </div>
  );
};
