import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, Send, Plus, Loader2, MessageSquare, Lock, Paperclip,
  StickyNote, UserPlus, X, Bot, Search, Mail, Phone, Building2, MapPin,
  FileText, FolderKanban, Tag, Users, Globe, Hash, ChevronRight, BadgeCheck,
  User as UserIcon, MessagesSquare, Settings2, ArrowLeft, CheckCircle2, Wallet,
  Archive, ArchiveRestore, Trash2, Sparkles, Check, MessageCircle, Link2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { marketplaceService } from '@/services/marketplaceService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { Separator } from '@/components/core/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Sheet, SheetContent } from '@/components/core/ui/sheet';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildInboxFilters } from './inboxFilters';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  inboxApi, signInboxAttachment, LABEL_COLORS, labelChipClass,
  type InboxThread, type InboxMessage, type InboxParticipant, type InboxChannel,
  type WhatsAppWindow, type InboxThreadContext, type InboxAgentSettings, type InboxLabel,
  type InboxThreadStatus,
} from '@/services/inboxApi';

type ChannelFilter = 'all' | InboxChannel;

interface WorkspaceMemberOption { user_id: string; label: string; }

/** {label, kind, userId} keyed by participant id — drives sender names + bubble alignment. */
interface ParticipantLabel { label: string; kind: 'member' | 'customer' | 'agent'; userId: string | null; }

const ACTIVE_TAB = 'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground';

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

/** Per-source presentation for a thread's channel (the "internal / WhatsApp / email" tag). */
function channelMeta(t: InboxThread): { label: string; Icon: typeof MessageCircle; className: string } {
  if (t.channel === 'whatsapp') {
    return { label: 'WhatsApp', Icon: MessageCircle, className: 'bg-green-500/15 text-green-400 border-green-500/30' };
  }
  if (t.thread_type === 'internal') {
    return { label: 'Team', Icon: Users, className: 'bg-sky-500/15 text-sky-300 border-sky-500/30' };
  }
  // customer / upstream on the internal channel = an in-app customer chat.
  return { label: t.thread_type === 'upstream' ? 'Dealer' : 'Customer', Icon: MessageSquare, className: 'bg-violet-500/15 text-violet-300 border-violet-500/30' };
}

/** Colored label pills for a thread. */
const LabelChips: React.FC<{ labels?: InboxLabel[]; className?: string }> = ({ labels, className }) => {
  if (!labels || labels.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className || ''}`}>
      {labels.map((l) => (
        <span key={l.id} className={`inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full border ${labelChipClass(l.color)}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${(LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot}`} />
          {l.name}
        </span>
      ))}
    </div>
  );
};

/** Bucket threads into Today / Yesterday / Earlier for the email-client day headers. */
function dayBucket(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const t = d.getTime();
  if (t >= startOfToday) return 'Today';
  if (t >= startOfToday - 86400000) return 'Yesterday';
  if (t >= startOfToday - 6 * 86400000) return 'This week';
  return 'Earlier';
}

const InboxPage: React.FC = () => {
  const { activeWorkspaceId, activeWorkspace, isPlatformOperator } = useWorkspace();
  const { persona } = usePermissions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [query, setQuery] = useState('');
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [statusTab, setStatusTab] = useState<InboxThreadStatus>('open');
  const [wsLabels, setWsLabels] = useState<InboxLabel[]>([]);
  const [canManageLabels, setCanManageLabels] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('thread'));

  // One bag for every secondary dimension. `channel` and `label` are request parameters on
  // listThreads (server-applied); the rest are matched client-side against the loaded page.
  const filterGroups = useMemo(() => buildInboxFilters(wsLabels), [wsLabels]);
  const { values: filterValues, setValues: setFilterValues, filtered: matchedThreads, previewCount } =
    useFilters<InboxThread>(threads, filterGroups);
  const filter = (filterValues.channel as ChannelFilter) || 'all';
  const labelFilter = (filterValues.label as string) || null;
  // The Unread mailbox folder and the modal's Unread toggle are the same constraint.
  const unreadOnly = filterValues.unread === true;
  const setUnreadOnly = useCallback(
    (on: boolean) => setFilterValues({ ...filterValues, unread: on ? true : undefined }),
    [filterValues, setFilterValues],
  );
  const setLabelFilter = useCallback(
    (id: string | null) => setFilterValues({ ...filterValues, label: id ?? undefined }),
    [filterValues, setFilterValues],
  );

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
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraftShown, setAiDraftShown] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // #251 App Launcher deep-link: /inbox?new=conversation opens the New (internal) thread dialog.
  useEffect(() => {
    if (activeWorkspaceId && searchParams.get('new') === 'conversation') {
      setShowNew(true);
      const p = new URLSearchParams(searchParams);
      p.delete('new');
      setSearchParams(p, { replace: true });
    }
  }, [activeWorkspaceId, searchParams, setSearchParams]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Mobile drill-in: return from the open conversation to the thread list.
  const backToList = useCallback(() => {
    setActiveId(null);
    setActiveThread(null);
    setMessages([]);
    setShowDetails(false);
    setSearchParams((p) => { p.delete('thread'); return p; }, { replace: true });
  }, [setSearchParams]);

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
        ...(showArchived ? { archived: true } : {}),
        ...(labelFilter ? { label_id: labelFilter } : {}),
      });
      setThreads(threads);
    } catch (e) {
      toast({ title: 'Could not load inbox', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingThreads(false);
    }
  }, [filter, allWorkspaces, isPlatformOperator, showArchived, labelFilter, toast]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  // Workspace labels drive the filter pills + the per-thread assignment popover.
  const loadLabels = useCallback(async () => {
    if (!activeWorkspaceId) { setWsLabels([]); setCanManageLabels(false); return; }
    try {
      const { labels } = await inboxApi.listLabels(activeWorkspaceId);
      setWsLabels(labels);
    } catch { /* labels are optional chrome — never block the inbox on them */ }
    // Managing labels (create/edit/delete) is owner/admin — reuse the agent-settings can_edit gate.
    try {
      const { can_edit } = await inboxApi.getAgentSettings(activeWorkspaceId);
      setCanManageLabels(can_edit);
    } catch { setCanManageLabels(false); }
  }, [activeWorkspaceId]);
  useEffect(() => { loadLabels(); }, [loadLabels]);
  // A label the filter points at may be deleted — clear a dangling filter.
  useEffect(() => {
    if (labelFilter && !wsLabels.some((l) => l.id === labelFilter)) setLabelFilter(null);
  }, [wsLabels, labelFilter]);

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
      setAiDraftShown(false);
      // Human takeover: a member's text reply pauses the assistant server-side — reflect it locally.
      if (!isNote && isMember && activeThread?.agent_state === 'active') {
        setActiveThread((t) => (t ? { ...t, agent_state: 'paused' } : t));
      }
    } catch (e) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [activeId, draft, attachment, isNote, isMember, activeThread, toast]);

  // "Help me write" — the assistant drafts the next reply into the composer for review/edit/send.
  const aiSuggest = useCallback(async () => {
    if (!activeId) return;
    setAiDrafting(true);
    try {
      const { draft: suggestion } = await inboxApi.suggestReply(activeId);
      setDraft(suggestion);
      setIsNote(false);
      setAiDraftShown(true);
    } catch (e) {
      toast({ title: 'Could not draft a reply', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setAiDrafting(false);
    }
  }, [activeId, toast]);

  // Archive (soft-delete) / restore the open thread.
  const archiveActive = useCallback(async () => {
    if (!activeThread) return;
    try {
      await inboxApi.archiveThread(activeThread.id);
      toast({ title: 'Moved to Archived', description: 'Restorable for 30 days, then permanently deleted.' });
      backToList();
      loadThreads();
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeThread, toast, backToList, loadThreads]);

  const restoreActive = useCallback(async () => {
    if (!activeThread) return;
    try {
      await inboxApi.restoreThread(activeThread.id);
      toast({ title: 'Conversation restored' });
      setActiveThread({ ...activeThread, archived_at: null, status: 'open' });
      loadThreads();
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeThread, toast, loadThreads]);

  const visibleThreads = useMemo(() => {
    let list = matchedThreads;
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) =>
      (t.subject || '').toLowerCase().includes(q) || (t.last_message_preview || '').toLowerCase().includes(q));
    // Folder + status semantics: Unread ignores status (the unread predicate itself already ran
    // in the filter matcher); Archived is its own view; otherwise the Open / Follow-up (snoozed) /
    // Done (closed) tab narrows the working set.
    if (!unreadOnly && !showArchived) list = list.filter((t) => t.status === statusTab);
    return list;
  }, [matchedThreads, query, unreadOnly, showArchived, statusTab]);

  // Threads grouped into Today / Yesterday / This week / Earlier for the email-client day headers.
  const groupedThreads = useMemo(() => {
    const order = ['Today', 'Yesterday', 'This week', 'Earlier'];
    const buckets = new Map<string, InboxThread[]>();
    for (const t of visibleThreads) {
      const k = dayBucket(t.last_message_at);
      const arr = buckets.get(k) || [];
      arr.push(t);
      buckets.set(k, arr);
    }
    return order.filter((k) => buckets.has(k)).map((k) => [k, buckets.get(k)!] as const);
  }, [visibleThreads]);

  // The open thread's labels (kept fresh from the list, which carries labels per thread).
  const activeThreadLabels = useMemo(
    () => threads.find((t) => t.id === activeId)?.labels || [],
    [threads, activeId],
  );

  const inboxUnread = useMemo(
    () => (showArchived ? 0 : threads.filter((t) => t.unread).length),
    [threads, showArchived],
  );

  const threadDisplayName = (t: InboxThread) => t.subject || (t.channel === 'whatsapp' ? 'WhatsApp contact' : 'Conversation');

  const activeCount = participants.filter((p) => p.status === 'active').length;

  // The per-thread member action cluster (AI toggle, settings, add teammate,
  // status). Reused inline in the desktop header and inside the mobile details
  // sheet so the controls stay reachable without crowding the mobile header.
  const memberControls = isMember && activeThread ? (
    <>
      {(activeThread.metadata as any)?.marketplace_inquiry_id && (
        <Button
          variant="default" size="sm" className="rounded-full"
          title="Accept this surplus inquiry — creates a draft purchase order in the buyer's workspace"
          onClick={async () => {
            try {
              const res = await marketplaceService.acceptInquiry(String((activeThread.metadata as any).marketplace_inquiry_id));
              toast({ title: res.already ? 'Already accepted' : 'Inquiry accepted', description: 'A draft purchase order was created for the buyer.' });
            } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
          }}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" /> Accept inquiry
        </Button>
      )}
      <Button
        variant={activeThread.agent_state === 'active' ? 'default' : 'outline'}
        size="icon" className="rounded-full h-9 w-9"
        title={
          activeThread.agent_state === 'active'
            ? 'AI assistant is handling this — click to take back'
            : activeThread.agent_state === 'paused'
              ? 'You took over — click to let the AI respond again'
              : 'Hand this conversation to the AI assistant'
        }
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
      <InboxAgentSettingsButton workspaceId={activeThread.workspace_id} />
      <LabelAssignButton
        workspaceId={activeThread.workspace_id}
        threadId={activeThread.id}
        labels={wsLabels}
        assigned={activeThreadLabels}
        canManage={canManageLabels}
        onChanged={() => { loadThreads(); loadLabels(); }}
      />
      {activeThread.thread_type !== 'internal' && (
        <Button
          variant="outline" size="icon" className="rounded-full h-9 w-9"
          title="Copy a private share link for the customer"
          onClick={async () => {
            try {
              const { url } = await inboxApi.createShareLink(activeThread.id);
              await navigator.clipboard.writeText(url);
              toast({ title: 'Share link copied', description: url });
            } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
          }}
        >
          <Link2 className="w-4 h-4" />
        </Button>
      )}
      <Button variant="outline" size="icon" className="rounded-full h-9 w-9" title="Add a teammate" onClick={() => setShowAdd(true)}>
        <UserPlus className="w-4 h-4" />
      </Button>
      {activeThread.archived_at ? (
        <Button variant="outline" size="sm" className="rounded-full" title="Restore this conversation" onClick={restoreActive}>
          <ArchiveRestore className="w-4 h-4 mr-1.5" /> Restore
        </Button>
      ) : (
        <Button
          variant="outline" size="icon"
          className="rounded-full h-9 w-9 text-muted-foreground hover:text-destructive"
          title="Delete — moves to Archived for 30 days, then permanently removed"
          onClick={archiveActive}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
      <select
        className="bg-transparent border border-white/10 rounded-full px-3 py-1.5 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-primary/30"
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
  ) : null;

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <PageHeader
        icon={InboxIcon}
        title="Inbox"
        subtitle="Team conversations, WhatsApp and customer chats — all in one place."
        actions={
          isPlatformOperator ? (
            <Button
              variant={allWorkspaces ? 'default' : 'outline'}
              size="sm" className="rounded-full"
              title="Show conversations across every workspace on the platform"
              onClick={() => setAllWorkspaces((v) => !v)}
            >
              <Globe className="w-4 h-4 mr-1.5" /> All workspaces
            </Button>
          ) : undefined
        }
      />

      {/* Desktop: 3-pane grid. Mobile: single-pane drill-in (list ↔ conversation),
          with the details rail moved into a slide-up sheet. */}
      <div className="flex flex-col md:grid md:grid-cols-12 gap-4 flex-1 min-h-0 px-4 sm:px-6 py-4">
        {/* ── Column 0 · Mailbox sidebar (Compose · folders · labels) ── */}
        <aside className="dashboard-card rounded-2xl border-0 md:col-span-3 lg:col-span-2 hidden md:flex flex-col overflow-hidden p-0">
          {/* Workspace header */}
          <div className="px-3 pt-3 pb-2.5 flex items-center gap-2 border-b border-white/5">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white text-xs font-display shrink-0" style={{ fontWeight: 700 }}>
              {initials(activeWorkspace?.name || 'Inbox')}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{activeWorkspace?.name || 'Workspace'}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Inbox</div>
            </div>
          </div>
          {isMember && (
            <div className="p-3">
              <Button className="w-full rounded-full" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId}>
                <Plus className="w-4 h-4 mr-1.5" /> Compose
              </Button>
            </div>
          )}
          <nav className="px-2 space-y-0.5">
            <button
              onClick={() => { setShowArchived(false); setUnreadOnly(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${!showArchived && !unreadOnly ? 'bg-primary/15 text-primary font-medium' : 'text-foreground/80 hover:bg-accent'}`}
            >
              <InboxIcon className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">All Inboxes</span>
              {!showArchived && <span className="text-[11px] text-muted-foreground">{threads.length}</span>}
            </button>
            <button
              onClick={() => { setShowArchived(false); setUnreadOnly(true); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${unreadOnly && !showArchived ? 'bg-primary/15 text-primary font-medium' : 'text-foreground/80 hover:bg-accent'}`}
            >
              <Mail className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Unread</span>
              {inboxUnread > 0 && (
                <span className="text-[11px] rounded-full bg-primary text-primary-foreground px-1.5 min-w-5 text-center">{inboxUnread}</span>
              )}
            </button>
            <button
              onClick={() => { setShowArchived(true); setUnreadOnly(false); }}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${showArchived ? 'bg-primary/15 text-primary font-medium' : 'text-foreground/80 hover:bg-accent'}`}
            >
              <Trash2 className="w-4 h-4 shrink-0" />
              <span className="flex-1 text-left">Archived</span>
            </button>
          </nav>

          <div className="px-3 pt-4 pb-1.5 flex items-center justify-between">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium">Labels</span>
            {canManageLabels && activeWorkspaceId && (
              <LabelManagerPopover
                workspaceId={activeWorkspaceId}
                labels={wsLabels}
                onChanged={() => { loadLabels(); loadThreads(); }}
              />
            )}
          </div>
          <div className="px-2 pb-3 space-y-0.5 overflow-y-auto flex-1">
            <button
              onClick={() => setLabelFilter(null)}
              className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${!labelFilter ? 'bg-accent text-foreground' : 'text-foreground/70 hover:bg-accent'}`}
            >
              <Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 text-left">All labels</span>
            </button>
            {wsLabels.map((l) => {
              const on = labelFilter === l.id;
              const dot = (LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot;
              return (
                <button
                  key={l.id}
                  onClick={() => setLabelFilter(on ? null : l.id)}
                  className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors ${on ? 'bg-accent text-foreground font-medium' : 'text-foreground/70 hover:bg-accent'}`}
                >
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dot}`} />
                  <span className="flex-1 text-left truncate">{l.name}</span>
                </button>
              );
            })}
            {wsLabels.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-2.5 py-2">
                {canManageLabels ? 'Create labels with the + above.' : 'No labels yet.'}
              </div>
            )}
          </div>
        </aside>

        {/* ── Column 1 · Message list ── */}
        <div className={`dashboard-card rounded-2xl border-0 md:col-span-4 lg:col-span-3 flex-1 min-h-0 md:flex-none flex flex-col overflow-hidden p-0 ${activeId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-white/10 space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search mail"
                  className="pl-9 h-10 rounded-lg"
                />
              </div>
              {/* Mobile compose — the sidebar (with its Compose) is desktop-only */}
              {isMember && (
                <Button size="icon" className="rounded-full h-10 w-10 shrink-0 md:hidden" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId} title="Compose">
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Mobile folder + label filters (they live in the sidebar on desktop) */}
            <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-0.5">
              <button onClick={() => { setShowArchived(false); setUnreadOnly(false); }} className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${!showArchived && !unreadOnly ? 'bg-primary text-primary-foreground border-transparent' : 'border-white/10 text-muted-foreground'}`}><InboxIcon className="w-3 h-3" />All</button>
              <button onClick={() => { setShowArchived(false); setUnreadOnly(true); }} className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${unreadOnly && !showArchived ? 'bg-primary text-primary-foreground border-transparent' : 'border-white/10 text-muted-foreground'}`}><Mail className="w-3 h-3" />Unread</button>
              <button onClick={() => { setShowArchived(true); setUnreadOnly(false); }} className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${showArchived ? 'bg-primary text-primary-foreground border-transparent' : 'border-white/10 text-muted-foreground'}`}><Archive className="w-3 h-3" />Archived</button>
              {wsLabels.map((l) => {
                const on = labelFilter === l.id;
                return (
                  <button key={l.id} onClick={() => setLabelFilter(on ? null : l.id)} className={`shrink-0 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border ${labelChipClass(l.color)} ${on ? 'ring-1 ring-inset ring-current' : 'opacity-70'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${(LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot}`} />{l.name}
                  </button>
                );
              })}
            </div>
            {/* Status tabs (Open / Follow-up / Done) narrow the working set; they are hidden in the
                Unread / Archived views, where status is not the axis. The filter bar stays put in
                every view — it is what carries the Unread toggle. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!showArchived && !unreadOnly ? (
                <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as InboxThreadStatus)}>
                  <TabsList className="h-auto gap-1.5 bg-transparent p-0">
                    <TabsTrigger value="open" className={`text-xs px-3 py-1 ${ACTIVE_TAB}`}>Open</TabsTrigger>
                    <TabsTrigger value="snoozed" className={`text-xs px-3 py-1 ${ACTIVE_TAB}`}>Follow-up</TabsTrigger>
                    <TabsTrigger value="closed" className={`text-xs px-3 py-1 ${ACTIVE_TAB}`}>Done</TabsTrigger>
                  </TabsList>
                </Tabs>
              ) : <span />}
              <FilterBar
                groups={filterGroups}
                values={filterValues}
                onChange={setFilterValues}
                previewCount={previewCount}
                searchKey={null}
                title="Filter conversations"
                className="justify-end"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : visibleThreads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2 px-4 text-center">
                <MessageSquare className="w-8 h-8 opacity-40" />
                {query ? 'No conversations match your search.'
                  : showArchived ? 'Nothing archived. Deleted conversations rest here for 30 days before they’re removed for good.'
                  : 'No conversations yet. WhatsApp and customer chats appear here automatically.'}
              </div>
            ) : groupedThreads.map(([bucket, items]) => (
              <div key={bucket}>
                <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium">{bucket}</div>
                {items.map((t) => {
                  const name = threadDisplayName(t);
                  const active = activeId === t.id;
                  const { Icon: SrcIcon, label: srcLabel, className: srcClass } = channelMeta(t);
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className={`w-full text-left px-4 py-3 flex gap-3 border-l-2 border-b border-white/5 transition-colors ${active ? 'bg-accent border-l-primary' : 'border-l-transparent hover:bg-accent'}`}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={`text-xs ${avatarTint(name)}`}>{initials(name)}</AvatarFallback>
                        </Avatar>
                        <span className={`absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center ${srcClass}`}>
                          <SrcIcon className="w-2 h-2" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                          <span className={`flex-1 truncate text-sm ${t.unread ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>{name}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.last_message_at)}</span>
                        </div>
                        {t.last_message_preview && (
                          <div className={`text-xs truncate mt-0.5 ${t.unread ? 'text-foreground/70' : 'text-muted-foreground'}`}>{t.last_message_preview}</div>
                        )}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full border ${srcClass}`}>
                            <SrcIcon className="w-2.5 h-2.5" /> {srcLabel}
                          </span>
                          {t.status !== 'open' && !t.archived_at && <Badge variant="outline" className="text-[10px] capitalize">{t.status}</Badge>}
                          {t.agent_state === 'active' && (
                            <Badge variant="outline" className="text-[10px] border-primary/40 text-primary"><Bot className="w-2.5 h-2.5 mr-0.5" />AI</Badge>
                          )}
                          <LabelChips labels={t.labels} />
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* ── Column 2 · Conversation ── */}
        <div className={`dashboard-card rounded-2xl border-0 md:col-span-5 lg:col-span-7 flex-1 min-h-0 flex flex-col overflow-hidden p-0 ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <MessageSquare className="w-10 h-10 opacity-30" />
              Select a conversation to get started
            </div>
          ) : (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-white/10 flex items-center gap-2 sm:gap-3">
                {/* Mobile: back to the conversation list */}
                <button
                  type="button"
                  onClick={backToList}
                  aria-label="Back to conversations"
                  className="md:hidden shrink-0 h-9 w-9 -ml-1 flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <Avatar className="h-10 w-10 shrink-0">
                  <AvatarFallback className={`text-sm ${avatarTint(threadDisplayName(activeThread))}`}>
                    {initials(threadDisplayName(activeThread))}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="truncate text-[15px] font-display" style={{ fontWeight: 600 }}>{threadDisplayName(activeThread)}</div>
                    {activeThread.archived_at && (
                      <Badge variant="outline" className="text-[10px] shrink-0"><Archive className="w-2.5 h-2.5 mr-0.5" />Archived</Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <span>{channelMeta(activeThread).label}</span>
                    <span className="opacity-50">·</span>
                    <span>{activeCount} participant{activeCount === 1 ? '' : 's'}</span>
                  </div>
                  <LabelChips labels={activeThreadLabels} className="mt-1" />
                </div>
                {/* Desktop: inline member controls. Mobile: collapsed into the details sheet. */}
                {memberControls && <div className="hidden md:flex items-center gap-1.5">{memberControls}</div>}
                {/* Open the Customer Profile drawer (only present while a conversation is open) */}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setShowDetails(true)}
                  title="Customer profile — contact, quotes, invoices & projects"
                  className="shrink-0 rounded-full gap-1.5"
                >
                  <UserIcon className="w-4 h-4" /> <span className="hidden sm:inline">Profile</span>
                </Button>
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
                  <div className="text-xs bg-amber-bg/60 border border-amber/30 text-amber-foreground rounded-lg px-3 py-2">
                    WhatsApp 24-hour reply window has closed. Freeform replies are blocked by Meta — an approved
                    template is required to re-open the conversation. (Internal notes are still allowed.)
                  </div>
                )}
                {isMember && (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setIsNote(false)}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${!isNote ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      <Send className="w-3 h-3" /> Reply
                    </button>
                    <button
                      onClick={() => setIsNote(true)}
                      className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full transition-colors ${isNote ? 'bg-amber text-black' : 'text-muted-foreground hover:bg-accent'}`}
                    >
                      <StickyNote className="w-3 h-3" /> Private note
                    </button>
                    {!isNote && (
                      <button
                        onClick={aiSuggest}
                        disabled={aiDrafting || waBlocked}
                        title="Let the assistant draft a reply you can edit before sending (1 credit)"
                        className="ml-auto inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-60"
                      >
                        {aiDrafting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} Draft with AI
                      </button>
                    )}
                  </div>
                )}
                {aiDraftShown && !isNote && (
                  <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 border border-primary/25 text-primary rounded-lg px-3 py-2">
                    <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI draft — review and edit before you send.</span>
                    <button onClick={() => { setDraft(''); setAiDraftShown(false); }} className="inline-flex items-center gap-1 hover:underline shrink-0">
                      <X className="w-3 h-3" /> Reject
                    </button>
                  </div>
                )}
                {attachment && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="w-3 h-3" /> {attachment.name}
                    <button onClick={() => setAttachment(null)} className="hover:text-foreground"><X className="w-3 h-3" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="cursor-pointer p-2.5 rounded-full hover:bg-accent shrink-0">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
                  </label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!waBlocked) send(); } }}
                    placeholder={isNote ? 'Write a private note (only your team sees this)…' : waBlocked ? 'Reply window closed — template required' : 'Type a message…'}
                    className={`flex-1 min-h-[44px] max-h-32 resize-none rounded-xl ${isNote ? 'border-amber/40 focus-visible:ring-amber/30' : ''}`}
                    disabled={waBlocked}
                  />
                  <Button className="rounded-full h-11 w-11 p-0 shrink-0" onClick={send} disabled={sending || waBlocked || (!draft.trim() && !attachment)}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
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

      {/* Contact / CRM details rail — a slide-over on every breakpoint (bottom on mobile,
          right on desktop). Member controls are only surfaced here on mobile, where the
          conversation header hides them. */}
      {activeThread && (
        <Sheet open={showDetails} onOpenChange={setShowDetails}>
          <SheetContent
            side={isMobile ? 'bottom' : 'right'}
            className={`p-0 bg-card overflow-hidden flex flex-col ${isMobile ? 'h-[85vh] rounded-t-2xl' : 'h-full w-full sm:max-w-md'}`}
          >
            {memberControls && (
              <div className="md:hidden flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-white/10 shrink-0">
                {memberControls}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DetailsRail
                thread={activeThread}
                context={context}
                participants={participants}
                labels={labels}
                isMember={isMember}
              />
            </div>
          </SheetContent>
        </Sheet>
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
    return (
      <div className="flex justify-center my-1.5">
        <span className="text-[11px] text-muted-foreground bg-muted rounded-full px-3 py-1">{m.body}</span>
      </div>
    );
  }

  // Our side (right): team members + the AI agent on a customer thread, or our own messages internally.
  const ours = isCustomerThread
    ? (info?.kind === 'member' || info?.kind === 'agent')
    : (info?.userId != null && info.userId === myUserId);

  // Modern bubbles: a small sender avatar beside each message, soft accent-tinted
  // outgoing (no heavy solid fill), card-surface incoming, note=amber, agent=accent.
  const bubbleClass = isNote
    ? 'bg-amber-bg/60 border border-amber/30 rounded-tl-sm'
    : isAgent
      ? 'bg-primary/10 border border-primary/25 rounded-tl-sm'
      : ours
        ? 'bg-primary/10 border border-primary/25 rounded-tr-sm text-foreground'
        : 'bg-card border border-border rounded-tl-sm';

  return (
    <div className={`flex gap-2.5 max-w-[82%] ${ours ? 'ml-auto flex-row-reverse' : ''}`}>
      <Avatar className="h-7 w-7 mt-5 shrink-0">
        <AvatarFallback className={`text-[10px] ${isAgent ? 'bg-primary/15 text-primary' : avatarTint(info?.label)}`}>
          {isAgent ? <Bot className="w-3.5 h-3.5" /> : initials(info?.label)}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col min-w-0 ${ours ? 'items-end' : 'items-start'}`}>
        {info && !isNote && (
          <div className="text-[10px] text-muted-foreground mb-1 px-1">{info.label}</div>
        )}
        <div className={`rounded-2xl px-3.5 py-2 text-left ${bubbleClass}`}>
          {isNote && <div className="flex items-center gap-1 text-[10px] text-amber-foreground mb-1"><Lock className="w-3 h-3" /> Private note</div>}
          {isAgent && <div className="flex items-center gap-1 text-[10px] text-primary mb-1"><Bot className="w-3 h-3" /> KAI assistant</div>}
          {m.body && <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>}
          {(m.attachments || []).map((a, i) => {
            const k = a.storage_object_path || a.url || '';
            return (
              <a key={k || i} href={urls[k]} target="_blank" rel="noreferrer"
                 className="flex items-center gap-1 text-xs mt-1 underline text-primary">
                <Paperclip className="w-3 h-3" /> {a.name || 'attachment'}
              </a>
            );
          })}
        </div>
        <div className="text-[10px] mt-1 px-1 text-muted-foreground">{new Date(m.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Column 3 · Details rail (CRM contact / company / quotes / projects / participants)
// ──────────────────────────────────────────────────────────────────────────

const Row: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-start gap-2.5 text-sm">
    <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0 break-words">{children}</span>
  </div>
);

const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; count?: number }> = ({ icon, children, count }) => (
  <h3 className="text-sm font-semibold text-primary flex items-center gap-2 mb-3">
    <span className="shrink-0">{icon}</span>
    <span>{children}</span>
    {count != null && <span className="text-xs text-muted-foreground font-normal">({count})</span>}
  </h3>
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
  const quotedTotal = quotes.reduce((s, q) => s + (q.grand_total || 0), 0);
  const subtitle = [contact?.position, company?.name].filter(Boolean).join(' · ');
  const metrics = context?.metrics ?? null;
  const invoices = context?.invoices ?? [];

  // Information block: who's handling it + status (real data, no fabricated priority/response-rate).
  const agentActive = thread.agent_state === 'active';
  const firstMember = participants.find((p) => p.participant_type === 'member' && p.status === 'active');
  const assignee = agentActive ? 'AI Assistant' : (firstMember ? (labels.get(firstMember.id)?.label || 'Team') : 'Unassigned');
  const statusLabel = thread.status === 'snoozed' ? 'Follow-up' : thread.status === 'closed' ? 'Done' : 'Open';
  void subtitle;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm font-semibold text-primary">Customer Profile</span>
      </div>
      {/* Cover banner + overlapping avatar */}
      <div className="border-b border-white/10">
        <div className="h-20 bg-gradient-to-br from-primary/40 via-primary/20 to-accent/40" />
        <div className="px-5 pb-4 -mt-8 flex flex-col items-center text-center">
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-lg font-display text-white bg-gradient-to-br from-primary to-primary/70 shadow-lg shadow-primary/25 ring-4 ring-card"
            style={{ fontWeight: 700 }}
          >
            {initials(displayName)}
          </div>
          <div className="text-base font-display mt-2" style={{ fontWeight: 600 }}>{displayName}</div>
          {contact?.position && <div className="text-xs text-muted-foreground mt-0.5">{contact.position}</div>}
          {company?.name && (
            <div className="mt-2">
              <Badge variant="outline" className="text-[11px]"><Building2 className="w-3 h-3 mr-1" />{company.name}</Badge>
            </div>
          )}
          {(contact?.city || contact?.country) && (
            <div className="inline-flex items-center gap-1 mt-2.5 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3" />{[contact?.city, contact?.country].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 justify-center mt-2.5">
            {contact?.is_client && <Badge variant="outline" className="text-[10px]"><BadgeCheck className="w-3 h-3 mr-0.5" />Client</Badge>}
            {contact?.lead_status && <Badge variant="secondary" className="text-[10px] capitalize">{contact.lead_status}</Badge>}
          </div>
        </div>
      </div>

      {/* Information — status + who's handling it */}
      <div className="p-5 border-b border-white/10 space-y-2.5">
        <SectionTitle icon={<Hash className="h-4 w-4" />}>Information</SectionTitle>
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge variant="outline" className="text-[10px]">{statusLabel}</Badge>
        </div>
        <div className="flex items-center justify-between text-sm gap-2">
          <span className="text-muted-foreground shrink-0">Handled by</span>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            {agentActive && <Bot className="w-3.5 h-3.5 text-primary shrink-0" />}
            <span className="truncate">{assignee}</span>
          </span>
        </div>
      </div>

      {/* Customer value — lifetime value + open balance from the customer's invoices
          (via inbox-api). Falls back to quoted-total + project-count on older API
          responses / internal threads where finance metrics aren't returned. */}
      {(metrics || quotes.length > 0 || projects.length > 0) && (
        <div className="p-5 border-b border-white/10">
          <SectionTitle icon={<Wallet className="h-4 w-4" />}>Customer value</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="text-lg font-display" style={{ fontWeight: 700 }}>
                {money(metrics ? metrics.lifetime_value : quotedTotal, metrics?.currency || quotes[0]?.currency)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Lifetime' : `Quoted · ${quotes.length}`}</div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3">
              <div className={`text-lg font-display ${metrics && metrics.open_balance > 0 ? 'text-warning' : ''}`} style={{ fontWeight: 700 }}>
                {metrics ? money(metrics.open_balance, metrics.currency) : projects.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Open balance' : `Project${projects.length === 1 ? '' : 's'}`}</div>
            </div>
          </div>
        </div>
      )}

      {/* Open invoices — the customer's unpaid invoices, soonest-due first. */}
      {invoices.length > 0 && (
        <div className="p-5 border-b border-white/10">
          <SectionTitle icon={<FileText className="h-4 w-4" />} count={metrics?.open_count}>Open invoices</SectionTitle>
          <div className="space-y-0.5">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-accent transition-colors">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{inv.number || 'Invoice'}</div>
                  {inv.due_at && <div className="text-[11px] text-muted-foreground">Due {new Date(inv.due_at).toLocaleDateString()}</div>}
                </div>
                <span className="text-xs shrink-0 text-warning" style={{ fontWeight: 600 }}>{money(inv.amount_due, inv.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {contact ? (
        <>
          {/* Contact details */}
          <div className="p-5 space-y-2.5 border-b border-white/10">
            <SectionTitle icon={<UserIcon className="h-4 w-4" />}>Contact</SectionTitle>
            {contact.email && <Row icon={<Mail className="w-3.5 h-3.5" />}><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></Row>}
            {(contact.phone || contact.mobile) && <Row icon={<Phone className="w-3.5 h-3.5" />}>{contact.phone || contact.mobile}</Row>}
            {(contact.city || contact.country) && <Row icon={<MapPin className="w-3.5 h-3.5" />}>{[contact.city, contact.country].filter(Boolean).join(', ')}</Row>}
            {contact.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {contact.vat_number}</Row>}
            {contact.lead_source && <Row icon={<Tag className="w-3.5 h-3.5" />}><span className="capitalize">{contact.lead_source}</span></Row>}
            {contact.tags && contact.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {contact.tags.map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
              </div>
            )}
          </div>

          {/* Company */}
          {company && (
            <div className="p-5 space-y-2.5 border-b border-white/10">
              <SectionTitle icon={<Building2 className="h-4 w-4" />}>Company</SectionTitle>
              <Row icon={<Building2 className="w-3.5 h-3.5" />}><span className="font-medium">{company.name}</span></Row>
              {company.industry && <Row icon={<Tag className="w-3.5 h-3.5" />}>{company.industry}</Row>}
              {company.website && <Row icon={<Globe className="w-3.5 h-3.5" />}><a href={company.website} target="_blank" rel="noreferrer" className="hover:underline truncate">{company.website}</a></Row>}
              {company.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {company.vat_number}</Row>}
            </div>
          )}

          {/* Quotes */}
          <div className="p-5 border-b border-white/10">
            <SectionTitle icon={<FileText className="h-4 w-4" />} count={quotes.length}>Quotes</SectionTitle>
            {quotes.length === 0 ? (
              <div className="text-xs text-muted-foreground">No quotes for this contact yet.</div>
            ) : (
              <div className="space-y-0.5">
                {quotes.map((q) => (
                  <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-accent transition-colors">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{q.quote_number || q.name || 'Quote'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{money(q.grand_total, q.currency)}</span>
                    {q.status && <Badge variant="outline" className="text-[10px] capitalize shrink-0">{q.status}</Badge>}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Projects */}
          <div className="p-5">
            <SectionTitle icon={<FolderKanban className="h-4 w-4" />} count={projects.length}>Projects</SectionTitle>
            {projects.length === 0 ? (
              <div className="text-xs text-muted-foreground">No projects for this contact yet.</div>
            ) : (
              <div className="space-y-0.5">
                {projects.map((p) => (
                  <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-lg hover:bg-accent transition-colors">
                    <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{p.name || 'Project'}</span>
                    {p.status && <Badge variant="outline" className="text-[10px] capitalize shrink-0">{p.status}</Badge>}
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Internal thread (or no linked contact): show participants + thread meta. */
        <div className="p-5 border-b border-white/10">
          <SectionTitle icon={<Users className="h-4 w-4" />} count={participants.filter((p) => p.status === 'active').length}>Participants</SectionTitle>
          <div className="space-y-1.5">
            {participants.filter((p) => p.status === 'active').map((p) => {
              const info = labels.get(p.id);
              return (
                <div key={p.id} className="flex items-center gap-2.5 text-sm">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className={`text-[10px] ${avatarTint(info?.label)}`}>{initials(info?.label)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 min-w-0 truncate">{info?.label || 'Participant'}</span>
                  {p.thread_role === 'owner' && <Badge variant="outline" className="text-[10px]">owner</Badge>}
                  {p.participant_type === 'agent' && <Badge variant="outline" className="text-[10px] border-primary/40 text-primary">AI</Badge>}
                </div>
              );
            })}
          </div>
          {isMember && (
            <p className="text-[11px] text-muted-foreground pt-3">
              This is an internal team conversation. Customers can't see it.
            </p>
          )}
        </div>
      )}

      {/* Conversation meta — always shown at the bottom */}
      <Separator className="bg-white/10" />
      <div className="p-5 space-y-2.5">
        <SectionTitle icon={<MessageSquare className="h-4 w-4" />}>Conversation</SectionTitle>
        <Row icon={<MessagesSquare className="w-3.5 h-3.5" />}><span className="capitalize">{thread.channel} · {thread.thread_type}</span></Row>
        <Row icon={<Hash className="w-3.5 h-3.5" />}><span className="capitalize">{thread.status}</span></Row>
        <div className="text-[11px] text-muted-foreground pt-0.5">Started {new Date(thread.created_at).toLocaleString()}</div>
      </div>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Dialogs
// ──────────────────────────────────────────────────────────────────────────

/** Per-workspace AI-assistant settings, read/written via inbox-api. Edits gated to owner/admin. */
const InboxAgentSettingsButton: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [settings, setSettings] = useState<InboxAgentSettings | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [replyCost, setReplyCost] = useState(1);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    inboxApi.getAgentSettings(workspaceId)
      .then((r) => { setSettings(r.settings); setCanEdit(r.can_edit); setReplyCost(r.reply_cost); })
      .catch((e) => toast({ title: 'Failed to load settings', description: (e as Error).message, variant: 'destructive' }))
      .finally(() => setLoading(false));
  }, [open, workspaceId, toast]);

  const update = async (key: keyof InboxAgentSettings, value: boolean) => {
    if (!settings) return;
    const prev = settings;
    setSettings({ ...settings, [key]: value });
    setSaving(key);
    try {
      const r = await inboxApi.setAgentSettings(workspaceId, { [key]: value });
      setSettings(r.settings);
    } catch (e) {
      setSettings(prev);
      toast({ title: 'Failed to save', description: (e as Error).message, variant: 'destructive' });
    } finally { setSaving(null); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full h-9 w-9" title="AI assistant settings">
          <Settings2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">AI assistant</div>
            <div className="text-xs text-muted-foreground">
              Applies to every customer conversation in this workspace. {replyCost} credit{replyCost === 1 ? '' : 's'} per reply.
            </div>
          </div>
          {loading || !settings ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Auto-respond to new chats</Label>
                  <div className="text-xs text-muted-foreground">The assistant answers first on new customer conversations.</div>
                </div>
                <Switch
                  checked={settings.auto_respond}
                  disabled={!canEdit || saving === 'auto_respond'}
                  onCheckedChange={(v) => update('auto_respond', v)}
                />
              </div>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Label className="text-sm">Answer account &amp; billing</Label>
                  <div className="text-xs text-muted-foreground">
                    Let it share the customer’s own statement, open invoices, and pay links. On WhatsApp the
                    customer is identified by phone number.
                  </div>
                </div>
                <Switch
                  checked={settings.allow_account_data}
                  disabled={!canEdit || saving === 'allow_account_data'}
                  onCheckedChange={(v) => update('allow_account_data', v)}
                />
              </div>
              {!canEdit && (
                <div className="text-xs text-muted-foreground">Only a workspace owner or admin can change these.</div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Sidebar label management (owner/admin): create, recolor, delete workspace labels. */
const LabelManagerPopover: React.FC<{
  workspaceId: string;
  labels: InboxLabel[];
  onChanged: () => void;
}> = ({ workspaceId, labels, onChanged }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try { await inboxApi.createLabel(workspaceId, name, newColor); setNewName(''); onChanged(); }
    catch (e) { toast({ title: 'Could not create label', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const recolor = async (id: string, color: string) => {
    setBusy(true);
    try { await inboxApi.updateLabel(id, { color }); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setBusy(true);
    try { await inboxApi.deleteLabel(id); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="text-muted-foreground hover:text-foreground p-0.5 rounded" title="Manage labels">
          <Plus className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-medium">Manage labels</div>
          <div className="text-xs text-muted-foreground">Create, recolor, or delete workspace labels.</div>
        </div>
        <div className="max-h-52 overflow-y-auto p-1.5 space-y-0.5">
          {labels.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-2">No labels yet.</div>
          ) : labels.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent group">
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`w-3 h-3 rounded-full shrink-0 ${(LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot}`} title="Change color" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <div className="flex items-center gap-1.5">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => recolor(l.id, c.key)}
                        title={c.label}
                        className={`w-4 h-4 rounded-full ${c.dot} ${l.color === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
                      />
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <span className="text-sm flex-1 truncate">{l.name}</span>
              <button onClick={() => remove(l.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0" title="Delete">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-border space-y-2">
          <div className="flex items-center gap-1.5">
            {LABEL_COLORS.map((c) => (
              <button
                key={c.key}
                onClick={() => setNewColor(c.key)}
                title={c.label}
                className={`w-4 h-4 rounded-full ${c.dot} ${newColor === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
              placeholder="New label"
              className="h-8 text-sm"
            />
            <Button size="sm" className="rounded-full h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};

/** Assign/unassign labels on the open thread; owner/admin can also create/delete workspace labels. */
const LabelAssignButton: React.FC<{
  workspaceId: string;
  threadId: string;
  labels: InboxLabel[];
  assigned: InboxLabel[];
  canManage: boolean;
  onChanged: () => void;
}> = ({ workspaceId, threadId, labels, assigned, canManage, onChanged }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);
  const assignedIds = useMemo(() => new Set(assigned.map((l) => l.id)), [assigned]);

  const toggle = async (labelId: string) => {
    const next = new Set(assignedIds);
    if (next.has(labelId)) next.delete(labelId); else next.add(labelId);
    setBusy(true);
    try {
      await inboxApi.setThreadLabels(threadId, [...next]);
      onChanged();
    } catch (e) {
      toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await inboxApi.createLabel(workspaceId, name, newColor);
      setNewName('');
      onChanged();
    } catch (e) {
      toast({ title: 'Could not create label', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (labelId: string) => {
    setBusy(true);
    try {
      await inboxApi.deleteLabel(labelId);
      onChanged();
    } catch (e) {
      toast({ title: 'Could not delete label', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="rounded-full h-9 w-9" title="Labels">
          <Tag className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="p-3 border-b border-border">
          <div className="text-sm font-medium">Labels</div>
          <div className="text-xs text-muted-foreground">Tag this conversation to filter and organise.</div>
        </div>
        <div className="max-h-56 overflow-y-auto p-1.5">
          {labels.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-3">No labels yet.{canManage ? ' Create one below.' : ''}</div>
          ) : labels.map((l) => {
            const on = assignedIds.has(l.id);
            const dot = (LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot;
            return (
              <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent group">
                <button onClick={() => toggle(l.id)} disabled={busy} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                  <span className={`w-4 h-4 rounded flex items-center justify-center border ${on ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                    {on && <Check className="w-3 h-3" />}
                  </span>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
                  <span className="text-sm truncate">{l.name}</span>
                </button>
                {canManage && (
                  <button onClick={() => remove(l.id)} disabled={busy} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive shrink-0" title="Delete label">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
        {canManage && (
          <div className="p-3 border-t border-border space-y-2">
            <div className="text-xs text-muted-foreground">New label</div>
            <div className="flex items-center gap-1.5">
              {LABEL_COLORS.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setNewColor(c.key)}
                  title={c.label}
                  className={`w-4 h-4 rounded-full ${c.dot} ${newColor === c.key ? 'ring-2 ring-offset-1 ring-offset-background ring-foreground/50' : ''}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); create(); } }}
                placeholder="Label name"
                className="h-8 text-sm"
              />
              <Button size="sm" className="rounded-full h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};

interface ContactOption { id: string; label: string; email: string | null; hasAccount: boolean; }

const NewThreadDialog: React.FC<{ workspaceId: string; onClose: () => void; onCreated: (id: string) => void }> = ({ workspaceId, onClose, onCreated }) => {
  const { toast } = useToast();
  const [mode, setMode] = useState<'team' | 'customer'>('team');
  const [busy, setBusy] = useState(false);

  // Team
  const [subject, setSubject] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  // Customer
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactQuery, setContactQuery] = useState('');
  const [contactId, setContactId] = useState<string | null>(null);
  const [custSubject, setCustSubject] = useState('');
  const [custMessage, setCustMessage] = useState('');

  // Success (customer without an account → share link)
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [createdThreadId, setCreatedThreadId] = useState<string | null>(null);

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

  // Load CRM contacts for the Customer tab (server-side search when the query is specific).
  useEffect(() => {
    if (mode !== 'customer') return;
    let cancelled = false;
    (async () => {
      let q = supabase.from('crm_contacts')
        .select('id, name, first_name, last_name, email, user_id')
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(40);
      const term = contactQuery.trim();
      if (term.length >= 2) {
        q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,first_name.ilike.%${term}%,last_name.ilike.%${term}%`);
      }
      const { data } = await q;
      if (cancelled) return;
      setContacts((data || []).map((r: { id: string; name?: string; first_name?: string; last_name?: string; email?: string; user_id?: string }) => ({
        id: r.id,
        label: r.name || [r.first_name, r.last_name].filter(Boolean).join(' ') || r.email || 'Contact',
        email: r.email ?? null,
        hasAccount: !!r.user_id,
      })));
    })();
    return () => { cancelled = true; };
  }, [mode, workspaceId, contactQuery]);

  const createTeam = async () => {
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

  const createCustomer = async () => {
    if (!contactId) return;
    setBusy(true);
    try {
      const res = await inboxApi.createCustomerThread({
        workspace_id: workspaceId, contact_id: contactId,
        subject: custSubject.trim() || undefined, message: custMessage.trim() || undefined,
      });
      if (res.share_url) { setShareUrl(res.share_url); setCreatedThreadId(res.thread_id); }
      else onCreated(res.thread_id);
    } catch (e) {
      toast({ title: 'Could not start conversation', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const modeBtn = (m: 'team' | 'customer', label: string) => (
    <button
      onClick={() => setMode(m)}
      className={`flex-1 text-xs py-1.5 rounded-full transition-colors ${mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
    >
      {label}
    </button>
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        {shareUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>Share this conversation</DialogTitle>
              <DialogDescription>
                This customer has no account yet. Send them this private link — they can read and reply with no login.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="text-sm" onFocus={(e) => e.currentTarget.select()} />
              <Button className="rounded-full shrink-0" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied' }); }}>
                Copy
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" className="rounded-full" onClick={onClose}>Close</Button>
              <Button className="rounded-full" onClick={() => createdThreadId && onCreated(createdThreadId)}>Open conversation</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New conversation</DialogTitle>
              <DialogDescription>Start a private team chat, or reach out to a customer.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-muted/40">
              {modeBtn('team', 'Team')}
              {modeBtn('customer', 'Customer')}
            </div>

            {mode === 'team' ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Topic</label>
                  <Input placeholder="e.g. Follow up on the Andronikos quote" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Who's in this conversation?</div>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-white/10 p-1.5">
                    {members.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-lg hover:bg-accent cursor-pointer transition-colors">
                        <input type="checkbox" checked={selected.includes(m.user_id)}
                          onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id))} />
                        <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(m.label)}`}>{initials(m.label)}</AvatarFallback></Avatar>
                        {m.label}
                      </label>
                    ))}
                    {members.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No other team members in this workspace yet.</div>}
                  </div>
                  {selected.length === 0 && <p className="text-[11px] text-muted-foreground mt-1.5">Pick at least one teammate to start the conversation with.</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
                  <Button className="rounded-full" onClick={createTeam} disabled={busy || selected.length === 0}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Customer</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input placeholder="Search contacts by name or email" value={contactQuery} onChange={(e) => { setContactQuery(e.target.value); setContactId(null); }} className="pl-9" />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-xl border border-white/10 p-1.5">
                    {contacts.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => setContactId(ct.id)}
                        className={`w-full flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-lg transition-colors text-left ${contactId === ct.id ? 'bg-primary/15 text-primary' : 'hover:bg-accent'}`}
                      >
                        <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(ct.label)}`}>{initials(ct.label)}</AvatarFallback></Avatar>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{ct.label}</span>
                          {ct.email && <span className="block text-[11px] text-muted-foreground truncate">{ct.email}</span>}
                        </span>
                        {ct.hasAccount
                          ? <Badge variant="outline" className="text-[10px] shrink-0"><BadgeCheck className="w-2.5 h-2.5 mr-0.5" />Account</Badge>
                          : <Badge variant="secondary" className="text-[10px] shrink-0">Link</Badge>}
                        {contactId === ct.id && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    ))}
                    {contacts.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No contacts found.</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Subject (optional)</label>
                  <Input placeholder="What's this about?" value={custSubject} onChange={(e) => setCustSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">First message (optional)</label>
                  <Textarea placeholder="Write the first message to the customer…" value={custMessage} onChange={(e) => setCustMessage(e.target.value)} className="min-h-[72px] resize-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Contacts with an account see this in their inbox. For others you'll get a private link to send them.
                </p>
                <DialogFooter>
                  <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
                  <Button className="rounded-full" onClick={createCustomer} disabled={busy || !contactId}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                  </Button>
                </DialogFooter>
              </>
            )}
          </>
        )}
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
              className="w-full flex items-center gap-2.5 text-sm px-2 py-2 rounded-lg hover:bg-accent transition-colors">
              <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(m.label)}`}>{initials(m.label)}</AvatarFallback></Avatar>
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
