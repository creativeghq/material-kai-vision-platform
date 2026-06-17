import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, Send, Plus, Loader2, MessageSquare, Lock, Paperclip,
  StickyNote, UserPlus, X, Bot, Search, Mail, Phone, Building2, MapPin,
  FileText, FolderKanban, Tag, Users, Globe, Hash, ChevronRight, BadgeCheck,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { Separator } from '@/components/core/ui/separator';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  inboxApi, signInboxAttachment,
  type InboxThread, type InboxMessage, type InboxParticipant, type InboxChannel,
  type WhatsAppWindow, type InboxThreadContext,
} from '@/services/inboxApi';

type ChannelFilter = 'all' | InboxChannel;

interface WorkspaceMemberOption { user_id: string; label: string; }

/** {label, kind, userId} keyed by participant id — drives sender names + bubble alignment. */
interface ParticipantLabel { label: string; kind: 'member' | 'customer' | 'agent'; userId: string | null; }

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString();
}

function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Stable subtle avatar tint derived from the name. */
function avatarTint(name: string | null | undefined): string {
  const palette = [
    'bg-rose-500/20 text-rose-300', 'bg-sky-500/20 text-sky-300', 'bg-emerald-500/20 text-emerald-300',
    'bg-amber-500/20 text-amber-300', 'bg-violet-500/20 text-violet-300', 'bg-cyan-500/20 text-cyan-300',
  ];
  const s = name || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'EUR' }).format(amount);
  } catch { return `${amount} ${currency || ''}`.trim(); }
}

const InboxPage: React.FC = () => {
  const { activeWorkspaceId, isPlatformOperator } = useWorkspace();
  const { persona } = usePermissions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [query, setQuery] = useState('');
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('thread'));

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [participants, setParticipants] = useState<InboxParticipant[]>([]);
  const [labels, setLabels] = useState<Map<string, ParticipantLabel>>(new Map());
  const [activeThread, setActiveThread] = useState<InboxThread | null>(null);
  const [waWindow, setWaWindow] = useState<WhatsAppWindow | null>(null);
  const [context, setContext] = useState<InboxThreadContext | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draft, setDraft] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null)); }, []);

  // Members (business roles + operator) get the full controls; end-users (clients) get a read/reply surface.
  const isMember = useMemo(
    () => isPlatformOperator || persona !== 'end_user',
    [isPlatformOperator, persona],
  );

  const waBlocked = activeThread?.channel === 'whatsapp' && !!waWindow && !waWindow.open && !isNote;

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const { threads } = await inboxApi.listThreads({
        ...(filter === 'all' ? {} : { channel: filter }),
        ...(allWorkspaces && isPlatformOperator ? { scope: 'all' as const } : {}),
      });
      setThreads(threads);
    } catch (e) {
      toast({ title: 'Could not load inbox', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingThreads(false);
    }
  }, [filter, allWorkspaces, isPlatformOperator, toast]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const openThread = useCallback(async (id: string) => {
    setActiveId(id);
    setSearchParams((p) => { p.set('thread', id); return p; }, { replace: true });
    setLoadingThread(true);
    setContext(null);
    try {
      const { thread, participants, messages, whatsapp_window } = await inboxApi.getThread(id);
      setActiveThread(thread);
      setParticipants(participants);
      setMessages(messages);
      setWaWindow(whatsapp_window);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));

      // CRM context for the right rail (members only; internal threads come back empty).
      let ctx: InboxThreadContext | null = null;
      if (isMember) {
        ctx = await inboxApi.getThreadContext(id).catch(() => null);
        setContext(ctx);
      }

      // Sender labels: member profiles + the linked contact.
      const memberIds = participants
        .filter((p) => p.participant_type === 'member' && p.user_id)
        .map((p) => p.user_id as string);
      const profMap: Record<string, { full_name?: string; email?: string }> = {};
      if (memberIds.length) {
        const { data: profs } = await supabase
          .from('user_profiles').select('user_id, full_name, email').in('user_id', memberIds);
        for (const p of (profs || []) as Array<{ user_id: string; full_name?: string; email?: string }>) {
          profMap[p.user_id] = p;
        }
      }
      const customerName = ctx?.contact?.name || thread.subject || 'Customer';
      const next = new Map<string, ParticipantLabel>();
      for (const p of participants) {
        if (p.participant_type === 'member') {
          const isMe = p.user_id && p.user_id === myUserId;
          const prof = p.user_id ? profMap[p.user_id] : undefined;
          next.set(p.id, { label: isMe ? 'You' : (prof?.full_name || prof?.email || 'Team member'), kind: 'member', userId: p.user_id });
        } else if (p.participant_type === 'customer') {
          next.set(p.id, { label: customerName, kind: 'customer', userId: p.user_id });
        } else {
          next.set(p.id, { label: 'Assistant', kind: 'agent', userId: null });
        }
      }
      setLabels(next);
    } catch (e) {
      toast({ title: 'Could not open conversation', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingThread(false);
    }
  }, [setSearchParams, toast, isMember, myUserId]);

  useEffect(() => { if (activeId) openThread(activeId); /* eslint-disable-next-line */ }, []);

  // #209 fallback: claim an inbox-conversion token that survived an email-confirmation round trip.
  useEffect(() => {
    const pending = localStorage.getItem('inbox_claim_token');
    if (!pending) return;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      try {
        const r = await inboxApi.tokenClaim(pending, data.user.id);
        localStorage.removeItem('inbox_claim_token');
        await loadThreads();
        if (r?.thread_id) openThread(r.thread_id);
      } catch { localStorage.removeItem('inbox_claim_token'); }
    })();
    // eslint-disable-next-line
  }, []);

  // Realtime: new messages on the open thread + thread-list bumps.
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`inbox-thread:${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `thread_id=eq.${activeId}`,
      }, (payload) => {
        const m = payload.new as InboxMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    const ch = supabase
      .channel('inbox-threads-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_threads' }, () => loadThreads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadThreads]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = useCallback(async () => {
    if (!activeId || (!draft.trim() && !attachment)) return;
    setSending(true);
    try {
      let attachments;
      if (attachment) {
        const buf = new Uint8Array(await attachment.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        attachments = [{ filename: attachment.name, content_type: attachment.type || 'application/octet-stream', data_base64: btoa(bin) }];
      }
      await inboxApi.sendMessage({
        thread_id: activeId,
        body: draft.trim() || undefined,
        attachments,
        message_type: isNote ? 'note' : 'text',
      });
      setDraft('');
      setAttachment(null);
    } catch (e) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [activeId, draft, attachment, isNote, toast]);

  const visibleThreads = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => (t.subject || '').toLowerCase().includes(q));
  }, [threads, query]);

  const threadDisplayName = (t: InboxThread) => t.subject || (t.channel === 'whatsapp' ? 'WhatsApp contact' : 'Conversation');

  const channelBadge = (t: InboxThread) =>
    t.channel === 'whatsapp'
      ? <Badge variant="secondary" className="text-[10px] bg-green-600/15 text-green-400 border-0">WhatsApp</Badge>
      : <Badge variant="secondary" className="text-[10px] capitalize">{t.thread_type}</Badge>;

  return (
    <div className="container mx-auto py-6 h-[calc(100vh-5rem)] flex flex-col">
      <div className="flex items-center gap-3 mb-4">
        <InboxIcon className="w-6 h-6 text-primary" />
        <div>
          <h1 className="text-2xl leading-tight">Inbox</h1>
          <p className="text-xs text-muted-foreground">Team conversations, WhatsApp and customer chats — all in one place.</p>
        </div>
        <div className="flex-1" />
        {isPlatformOperator && (
          <Button
            variant={allWorkspaces ? 'default' : 'outline'}
            size="sm" className="rounded-full"
            title="Show conversations across every workspace on the platform"
            onClick={() => setAllWorkspaces((v) => !v)}
          >
            <Globe className="w-4 h-4 mr-1" /> All workspaces
          </Button>
        )}
        {isMember && (
          <Button className="rounded-full" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId}>
            <Plus className="w-4 h-4 mr-1" /> New conversation
          </Button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 flex-1 min-h-0">
        {/* ── Column 1 · Conversations ── */}
        <Card className="dashboard-card col-span-3 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-white/10 space-y-2">
            <div className="text-sm">Conversations</div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search conversations"
                className="pl-8 h-8 text-sm bg-white/5 border-white/10"
              />
            </div>
            <Tabs value={filter} onValueChange={(v) => setFilter(v as ChannelFilter)}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1 text-xs">All</TabsTrigger>
                <TabsTrigger value="internal" className="flex-1 text-xs">Internal</TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex-1 text-xs">WhatsApp</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : visibleThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2 px-4 text-center">
                <MessageSquare className="w-8 h-8 opacity-40" />
                {query ? 'No conversations match your search.' : 'No conversations yet. WhatsApp and customer chats appear here automatically.'}
              </div>
            ) : visibleThreads.map((t) => {
              const name = threadDisplayName(t);
              return (
                <button
                  key={t.id}
                  onClick={() => openThread(t.id)}
                  className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition flex gap-3 ${activeId === t.id ? 'bg-white/10' : ''}`}
                >
                  <Avatar className="h-9 w-9 mt-0.5">
                    <AvatarFallback className={`text-xs ${avatarTint(name)}`}>{initials(name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                      <span className={`flex-1 truncate text-sm ${t.unread ? 'font-medium text-foreground' : ''}`}>{name}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.last_message_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1">
                      {channelBadge(t)}
                      {t.status !== 'open' && <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>}
                      {t.agent_state === 'active' && (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary"><Bot className="w-2.5 h-2.5 mr-0.5" />AI</Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ── Column 2 · Conversation ── */}
        <Card className="dashboard-card col-span-6 flex flex-col overflow-hidden">
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <MessageSquare className="w-10 h-10 opacity-30" />
              Select a conversation to get started
            </div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-3">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className={`text-xs ${avatarTint(threadDisplayName(activeThread))}`}>
                    {initials(threadDisplayName(activeThread))}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{threadDisplayName(activeThread)}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="capitalize">{activeThread.channel}</span>
                    <span>·</span>
                    <span>{participants.filter((p) => p.status === 'active').length} participant{participants.filter((p) => p.status === 'active').length === 1 ? '' : 's'}</span>
                  </div>
                </div>
                {isMember && (
                  <>
                    <Button
                      variant={activeThread.agent_state === 'active' ? 'default' : 'outline'}
                      size="sm" className="rounded-full"
                      title={activeThread.agent_state === 'active' ? 'AI assistant is handling this — click to take back' : 'Hand this conversation to the AI assistant'}
                      onClick={async () => {
                        const next = activeThread.agent_state === 'active' ? 'off' : 'active';
                        try {
                          await inboxApi.setAgent(activeThread.id, next);
                          setActiveThread({ ...activeThread, agent_state: next });
                        } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
                      }}
                    >
                      <Bot className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-full" title="Add a teammate" onClick={() => setShowAdd(true)}>
                      <UserPlus className="w-4 h-4" />
                    </Button>
                    <select
                      className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs"
                      value={activeThread.status}
                      onChange={async (e) => {
                        const status = e.target.value as InboxThread['status'];
                        await inboxApi.setStatus(activeThread.id, status).catch((err) => toast({ title: 'Failed', description: (err as Error).message, variant: 'destructive' }));
                        setActiveThread({ ...activeThread, status });
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="snoozed">Snoozed</option>
                      <option value="closed">Closed</option>
                    </select>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingThread ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : messages.map((m) => (
                  <MessageBubble
                    key={m.id} m={m}
                    info={m.sender_participant_id ? labels.get(m.sender_participant_id) : undefined}
                    myUserId={myUserId}
                    isCustomerThread={activeThread.thread_type !== 'internal'}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-white/10 p-3 space-y-2">
                {activeThread.channel === 'whatsapp' && waWindow && !waWindow.open && !isNote && (
                  <div className="text-xs bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded px-2 py-1.5">
                    WhatsApp 24-hour reply window has closed. Freeform replies are blocked by Meta — an approved
                    template is required to re-open the conversation. (Internal notes are still allowed.)
                  </div>
                )}
                {isMember && (
                  <button
                    onClick={() => setIsNote((v) => !v)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isNote ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-white/5'}`}
                  >
                    <StickyNote className="w-3 h-3" /> {isNote ? 'Private note (team only)' : 'Reply to customer'}
                  </button>
                )}
                {attachment && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="w-3 h-3" /> {attachment.name}
                    <button onClick={() => setAttachment(null)}><X className="w-3 h-3" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="cursor-pointer p-2 rounded-full hover:bg-white/5">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
                  </label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!waBlocked) send(); } }}
                    placeholder={isNote ? 'Write a private note…' : waBlocked ? 'Reply window closed — template required' : 'Type a message…'}
                    className="flex-1 min-h-[44px] max-h-32 resize-none bg-white/5 border-white/10"
                    disabled={waBlocked}
                  />
                  <Button className="rounded-full" onClick={send} disabled={sending || waBlocked || (!draft.trim() && !attachment)}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>

        {/* ── Column 3 · Details ── */}
        <Card className="dashboard-card col-span-3 flex flex-col overflow-hidden">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs px-4 text-center">
              Contact details, quotes and projects appear here.
            </div>
          ) : (
            <DetailsRail
              thread={activeThread}
              context={context}
              participants={participants}
              labels={labels}
              isMember={isMember}
            />
          )}
        </Card>
      </div>

      {showNew && activeWorkspaceId && (
        <NewThreadDialog
          workspaceId={activeWorkspaceId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); loadThreads(); openThread(id); }}
        />
      )}
      {showAdd && activeThread && (
        <AddParticipantDialog
          thread={activeThread}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); openThread(activeThread.id); }}
        />
      )}
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Message bubble
// ──────────────────────────────────────────────────────────────────────────

const MessageBubble: React.FC<{
  m: InboxMessage;
  info?: ParticipantLabel;
  myUserId: string | null;
  isCustomerThread: boolean;
}> = ({ m, info, myUserId, isCustomerThread }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      for (const a of m.attachments || []) {
        const u = await signInboxAttachment(a);
        const k = a.storage_object_path || a.url || '';
        if (u && k) setUrls((p) => ({ ...p, [k]: u }));
      }
    })();
  }, [m]);

  const isNote = m.message_type === 'note';
  const isSystem = m.message_type === 'system';
  const isAgent = m.message_type === 'agent';

  if (isSystem) {
    return <div className="text-center text-[11px] text-muted-foreground py-1">{m.body}</div>;
  }

  // Our side (right): team members + the AI agent on a customer thread, or our own messages on an internal thread.
  const ours = isCustomerThread
    ? (info?.kind === 'member' || info?.kind === 'agent')
    : (info?.userId != null && info.userId === myUserId);

  return (
    <div className={`flex flex-col max-w-[80%] ${ours ? 'ml-auto items-end' : 'items-start'}`}>
      {info && !isNote && (
        <div className="text-[10px] text-muted-foreground mb-0.5 px-1">{info.label}</div>
      )}
      <div className={`rounded-lg px-3 py-2 ${isNote
        ? 'bg-amber-500/10 border border-amber-500/30'
        : isAgent
          ? 'bg-primary/10 border border-primary/30'
          : ours
            ? 'bg-primary/15 border border-primary/20'
            : 'bg-white/5 border border-white/10'}`}>
        {isNote && <div className="flex items-center gap-1 text-[10px] text-amber-400 mb-1"><Lock className="w-3 h-3" /> Private note</div>}
        {isAgent && <div className="flex items-center gap-1 text-[10px] text-primary mb-1"><Bot className="w-3 h-3" /> Assistant</div>}
        {m.body && <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>}
        {(m.attachments || []).map((a, i) => {
          const k = a.storage_object_path || a.url || '';
          return (
            <a key={k || i} href={urls[k]} target="_blank" rel="noreferrer"
               className="flex items-center gap-1 text-xs text-primary mt-1 underline">
              <Paperclip className="w-3 h-3" /> {a.name || 'attachment'}
            </a>
          );
        })}
        <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Column 3 · Details rail (CRM contact / company / quotes / projects / participants)
// ──────────────────────────────────────────────────────────────────────────

const Row: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-start gap-2 text-sm">
    <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0 break-words">{children}</span>
  </div>
);

const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">{children}</div>
);

const DetailsRail: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  participants: InboxParticipant[];
  labels: Map<string, ParticipantLabel>;
  isMember: boolean;
}> = ({ thread, context, participants, labels, isMember }) => {
  const contact = context?.contact ?? null;
  const company = context?.company ?? null;
  const quotes = context?.quotes ?? [];
  const projects = context?.projects ?? [];
  const displayName = contact?.name || thread.subject || 'Conversation';

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Contact header */}
      <div className="p-4 flex flex-col items-center text-center border-b border-white/10">
        <Avatar className="h-14 w-14 mb-2">
          <AvatarFallback className={`text-base ${avatarTint(displayName)}`}>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="text-sm font-medium">{displayName}</div>
        {contact?.position && <div className="text-xs text-muted-foreground">{contact.position}</div>}
        <div className="flex flex-wrap gap-1 justify-center mt-2">
          {contact?.is_client && <Badge variant="outline" className="text-[10px]"><BadgeCheck className="w-3 h-3 mr-0.5" />Client</Badge>}
          {contact?.lead_status && <Badge variant="secondary" className="text-[10px] capitalize">{contact.lead_status}</Badge>}
        </div>
      </div>

      {contact ? (
        <>
          {/* Contact details */}
          <div className="p-4 space-y-2 border-b border-white/10">
            <SectionTitle>Contact</SectionTitle>
            {contact.email && <Row icon={<Mail className="w-3.5 h-3.5" />}><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></Row>}
            {(contact.phone || contact.mobile) && <Row icon={<Phone className="w-3.5 h-3.5" />}>{contact.phone || contact.mobile}</Row>}
            {(contact.city || contact.country) && <Row icon={<MapPin className="w-3.5 h-3.5" />}>{[contact.city, contact.country].filter(Boolean).join(', ')}</Row>}
            {contact.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {contact.vat_number}</Row>}
            {contact.lead_source && <Row icon={<Tag className="w-3.5 h-3.5" />}><span className="capitalize">{contact.lead_source}</span></Row>}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {contact.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
            )}
          </div>

          {/* Company */}
          {company && (
            <div className="p-4 space-y-2 border-b border-white/10">
              <SectionTitle>Company</SectionTitle>
              <Row icon={<Building2 className="w-3.5 h-3.5" />}><span className="font-medium">{company.name}</span></Row>
              {company.industry && <Row icon={<Tag className="w-3.5 h-3.5" />}>{company.industry}</Row>}
              {company.website && <Row icon={<Globe className="w-3.5 h-3.5" />}><a href={company.website} target="_blank" rel="noreferrer" className="hover:underline truncate">{company.website}</a></Row>}
              {company.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {company.vat_number}</Row>}
            </div>
          )}

          {/* Quotes */}
          <div className="p-4 space-y-2 border-b border-white/10">
            <SectionTitle>Quotes ({quotes.length})</SectionTitle>
            {quotes.length === 0 ? (
              <div className="text-xs text-muted-foreground">No quotes for this contact yet.</div>
            ) : quotes.map((q) => (
              <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-2 text-sm py-1 hover:bg-white/5 rounded px-1 -mx-1">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{q.quote_number || q.name || 'Quote'}</span>
                <span className="text-xs text-muted-foreground">{money(q.grand_total, q.currency)}</span>
                {q.status && <Badge variant="outline" className="text-[10px] capitalize">{q.status}</Badge>}
              </a>
            ))}
          </div>

          {/* Projects */}
          <div className="p-4 space-y-2">
            <SectionTitle>Projects ({projects.length})</SectionTitle>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">No projects for this contact yet.</div>
            ) : projects.map((p) => (
              <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 text-sm py-1 hover:bg-white/5 rounded px-1 -mx-1">
                <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <span className="flex-1 min-w-0 truncate">{p.name || 'Project'}</span>
                {p.status && <Badge variant="outline" className="text-[10px] capitalize">{p.status}</Badge>}
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              </a>
            ))}
          </div>
        </>
      ) : (
        /* Internal thread (or no linked contact): show participants + thread meta. */
        <div className="p-4 space-y-2 border-b border-white/10">
          <SectionTitle><Users className="w-3 h-3 inline mr-1" />Participants</SectionTitle>
          {participants.filter((p) => p.status === 'active').map((p) => {
            const info = labels.get(p.id);
            return (
              <div key={p.id} className="flex items-center gap-2 text-sm py-0.5">
                <Avatar className="h-6 w-6">
                  <AvatarFallback className={`text-[10px] ${avatarTint(info?.label)}`}>{initials(info?.label)}</AvatarFallback>
                </Avatar>
                <span className="flex-1 min-w-0 truncate">{info?.label || 'Participant'}</span>
                {p.thread_role === 'owner' && <Badge variant="outline" className="text-[10px]">owner</Badge>}
                {p.participant_type === 'agent' && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">AI</Badge>}
              </div>
            );
          })}
          {isMember && (
            <p className="text-[11px] text-muted-foreground pt-2">
              This is an internal team conversation. Customers can't see it.
            </p>
          )}
        </div>
      )}

      {/* Conversation meta — always shown at the bottom */}
      <Separator className="bg-white/10" />
      <div className="p-4 space-y-2">
        <SectionTitle>Conversation</SectionTitle>
        <Row icon={<MessageSquare className="w-3.5 h-3.5" />}><span className="capitalize">{thread.channel} · {thread.thread_type}</span></Row>
        <Row icon={<Hash className="w-3.5 h-3.5" />}><span className="capitalize">{thread.status}</span></Row>
        <div className="text-[11px] text-muted-foreground">Started {new Date(thread.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Dialogs
// ──────────────────────────────────────────────────────────────────────────

const NewThreadDialog: React.FC<{ workspaceId: string; onClose: () => void; onCreated: (id: string) => void }> = ({ workspaceId, onClose, onCreated }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
      const me = (await supabase.auth.getUser()).data.user?.id;
      setMembers((profs || []).filter((p: { user_id: string }) => p.user_id !== me).map((p: { user_id: string; full_name?: string; email?: string }) => ({
        user_id: p.user_id, label: p.full_name || p.email || p.user_id.slice(0, 8),
      })));
    })();
  }, [workspaceId]);

  const create = async () => {
    setBusy(true);
    try {
      const { thread } = await inboxApi.createThread({
        thread_type: 'internal', workspace_id: workspaceId, subject: subject.trim() || undefined,
        participants: selected.map((user_id) => ({ type: 'member' as const, user_id })),
      });
      onCreated(thread.id);
    } catch (e) {
      toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New internal conversation</DialogTitle>
          <DialogDescription>
            Start a private conversation with people on your team. Everyone you add can read and reply.
            Customers never see internal conversations — WhatsApp and customer chats arrive here automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Topic</label>
          <Input placeholder="e.g. Follow up on the Andronikos quote" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Who's in this conversation?</div>
          <div className="max-h-48 overflow-y-auto space-y-1 rounded-md border border-white/10 p-1">
            {members.map((m) => (
              <label key={m.user_id} className="flex items-center gap-2 text-sm px-2 py-1.5 rounded hover:bg-white/5 cursor-pointer">
                <input type="checkbox" checked={selected.includes(m.user_id)}
                  onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id))} />
                <Avatar className="h-6 w-6"><AvatarFallback className={`text-[10px] ${avatarTint(m.label)}`}>{initials(m.label)}</AvatarFallback></Avatar>
                {m.label}
              </label>
            ))}
            {members.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No other team members in this workspace yet.</div>}
          </div>
          {selected.length === 0 && <p className="text-[11px] text-muted-foreground mt-1">Pick at least one teammate to start the conversation with.</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={create} disabled={busy || selected.length === 0}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddParticipantDialog: React.FC<{ thread: InboxThread; onClose: () => void; onAdded: () => void }> = ({ thread, onClose, onAdded }) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', thread.workspace_id);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
      setMembers((profs || []).map((p: { user_id: string; full_name?: string; email?: string }) => ({
        user_id: p.user_id, label: p.full_name || p.email || p.user_id.slice(0, 8),
      })));
    })();
  }, [thread.workspace_id]);

  const add = async (user_id: string) => {
    setBusy(user_id);
    try {
      await inboxApi.addParticipant({ thread_id: thread.id, type: 'member', user_id });
      onAdded();
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a teammate</DialogTitle>
          <DialogDescription>They'll be able to read this conversation and reply to the customer.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {members.map((m) => (
            <button key={m.user_id} onClick={() => add(m.user_id)} disabled={!!busy}
              className="w-full flex items-center gap-2 text-sm px-2 py-2 rounded hover:bg-white/5">
              <Avatar className="h-6 w-6"><AvatarFallback className={`text-[10px] ${avatarTint(m.label)}`}>{initials(m.label)}</AvatarFallback></Avatar>
              <span className="flex-1 text-left">{m.label}</span>
              {busy === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          ))}
          {members.length === 0 && <div className="text-xs text-muted-foreground px-2">No members found.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InboxPage;
