import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, Send, Plus, Loader2, MessageSquare, Lock, Paperclip,
  StickyNote, UserPlus, X, Bot, Search, Mail, Phone, Building2, MapPin,
  FileText, FolderKanban, Tag, Users, Globe, Hash, ChevronRight, BadgeCheck,
  User as UserIcon, MessagesSquare, Settings2, ArrowLeft, CheckCircle2, Wallet, EyeOff, Eye, Reply,
  Archive, ArchiveRestore, Trash2, Sparkles, Check, Link2,
  ShoppingCart, AlertTriangle, ExternalLink, Image as ImageIcon, CookingPot,
} from 'lucide-react';
import { projectPlansService } from '@/services/projectPlansService';
import { supabase } from '@/integrations/supabase/client';
import { CRM_SEARCH_COLUMN, foldedLike } from '@/services/crmSearch';
import { marketplaceService } from '@/services/marketplaceService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Avatar, AvatarFallback } from '@/components/core/ui/avatar';
import { Separator } from '@/components/core/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/core/ui/sheet';
import { Switch } from '@/components/core/ui/switch';
import { Label } from '@/components/core/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { FilterBar, useFilters } from '@/components/core/filters';
import { buildInboxFilters } from './inboxFilters';
import {
  channelForSource, inboxRequestedServices, inboxSourceKey, inboxSourceMeta, inboxThreadSource,
  SOURCE_FILTER_ORDER, type InboxSource, type InboxSourceKey,
} from './inboxSource';
import { formatDate } from '@/utils/datetime';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  inboxApi, signInboxAttachment, LABEL_COLORS, labelChipClass,
  type InboxThread, type InboxMessage, type InboxParticipant, type InboxAttachment,
  type WhatsAppWindow, type InboxThreadContext, type InboxAgentSettings, type InboxLabel,
  type InboxThreadStatus, type OrderIntake, type IntakeItem, type IntakeTotals,
  type IntakeConfirmation, type IntakeMatchMethod, type UserEmailAddress,
} from '@/services/inboxApi';

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
  return formatDate(iso);
}

function initials(name: string | null | undefined): string {
  const n = (name || '').trim();
  if (!n) return '?';
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * Stable subtle avatar tint derived from the name. Each entry is a light/dark PAIR — a `-300`
 * shade alone is pale by design and left initials invisible on the light themes' cream card.
 */
function avatarTint(name: string | null | undefined): string {
  // All -800 on the light side, not -700: these initials are 10px sitting on a 15% wash,
  // which is a heavier tint than the tags use, and cyan-700 measured 4.44:1 there.
  const palette = [
    'bg-rose-500/15 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300',
    'bg-sky-500/15 dark:bg-sky-500/20 text-sky-800 dark:text-sky-300',
    'bg-emerald-500/15 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300',
    'bg-amber-500/15 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300',
    'bg-violet-500/15 dark:bg-violet-500/20 text-violet-800 dark:text-violet-300',
    'bg-cyan-500/15 dark:bg-cyan-500/20 text-cyan-800 dark:text-cyan-300',
  ];
  const s = name || '?';
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

function money(amount: number | null | undefined, currency: string | null | undefined): string {
  return formatMoney(amount, currency || 'EUR');
}

/** Coloured label tags for a thread. Squared (`rounded-xs`) — a pill is a button silhouette. */
const LabelChips: React.FC<{ labels?: InboxLabel[]; className?: string }> = ({ labels, className }) => {
  if (!labels || labels.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className || ''}`}>
      {labels.map((l) => (
        <span key={l.id} className={`inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded-xs border ${labelChipClass(l.color)}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${labelDot(l.color)}`} />
          {l.name}
        </span>
      ))}
    </div>
  );
};

/** The solid dot for a label colour — the one lookup, so the fallback lives in one place. */
function labelDot(color: string | null | undefined): string {
  return (LABEL_COLORS.find((c) => c.key === color) || LABEL_COLORS[0]).dot;
}

/**
 * The source, rendered for a DENSE LIST ROW: a solid dot plus a plain coloured word.
 *
 * It used to be a tinted pill here. Two problems, and the redesign fixes both at once — the
 * tint that keeps a pill quiet is exactly the thing that makes its text hard to read, and at
 * twenty rows a tag per row gives every row the visual weight of a button (the same reason
 * `statusTone` exists and `docs/design-system.md` bans pill backgrounds inside table rows).
 */
const SourceWord: React.FC<{ source: InboxSource; className?: string }> = ({ source, className }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] leading-none ${source.tone.text} ${className || ''}`}>
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${source.tone.dot}`} />
    {source.label}
  </span>
);

/**
 * One row of the mailbox sidebar — a view, a source or a label. All three are the same object:
 * somewhere you GO, with an optional count of what is waiting there.
 *
 * `count` is a string, not a number, so a caller can hand it `200+` — the server pages at 200
 * and printing the ceiling as if it were a total is the quiet kind of wrong. `null` withholds
 * the count entirely, which is what a caller does when it genuinely does not know.
 */
const NavRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: string | null;
  /** Sources and labels sit a step quieter than the three top-level views. */
  dense?: boolean;
  /** Unread earns a solid count; everything else is a muted number. */
  emphasiseCount?: boolean;
}> = ({ icon, label, active, onClick, count, dense, emphasiseCount }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'true' : undefined}
    className={`w-full flex items-center gap-2.5 rounded-sm text-sm transition-colors ${
      dense ? 'px-2.5 py-1.5' : 'px-2.5 py-2'
    } ${active
      ? 'bg-surface-sunken text-foreground font-medium'
      : 'text-foreground/80 hover:bg-surface-hover'}`}
  >
    {icon}
    <span className="flex-1 text-left truncate">{label}</span>
    {count != null && (
      emphasiseCount
        ? <span className="text-[11px] rounded-xs bg-primary text-primary-foreground px-1.5 tabular-nums shrink-0">{count}</span>
        : <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{count}</span>
    )}
  </button>
);

/** The mobile stand-in for one sidebar row. Squared, never a pill — see the call site. */
const MobileChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-xs border transition-colors ${
      active ? 'bg-primary text-primary-foreground border-transparent' : 'border-hairline text-muted-foreground hover:bg-surface-hover'
    }`}
  >
    {children}
  </button>
);

/** Section heading in the sidebar, with an optional action pinned to its right. */
const SidebarHeading: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="px-3 pt-3 pb-1.5 flex items-center justify-between gap-2">
    <span className="text-[11px] tracking-wide text-muted-foreground font-semibold">{children}</span>
    {action}
  </div>
);

/** The source where it stands ALONE and must name itself — header, rail. Squared tinted tag. */
const SourceTag: React.FC<{ source: InboxSource; className?: string }> = ({ source, className }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-1 rounded-xs border font-medium ${source.tone.tag} ${className || ''}`}>
    <source.Icon className="w-3 h-3 shrink-0" />
    {source.label}
  </span>
);

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

  // One bag for every secondary dimension. `label` is a request parameter on listThreads
  // (server-applied) and `source` is half of one — it narrows the request to that source's
  // channel and then separates same-channel sources client-side. The rest are matched
  // client-side against the loaded page. Assignee options come off the loaded threads, so the
  // group def depends on them too.
  //
  // The bag lives in `?f=` so a filtered mailbox is a link: `/profile?tab=inbox` (a whole second
  // inbox until this merge) is now just this list pinned to `source: public_profile`, and the
  // redirect that replaced it hands over exactly that URL.
  const filterGroups = useMemo(() => buildInboxFilters(wsLabels, threads, myUserId ?? undefined), [wsLabels, threads, myUserId]);
  const { values: filterValues, setValues: setFilterValues, filtered: matchedThreads, previewCount } =
    useFilters<InboxThread>(threads, filterGroups, { urlKey: 'f' });
  const channelFilter = channelForSource(filterValues.source as string | undefined);
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
  // The sidebar's Sources list and the modal's Source select are the same constraint, the same
  // way Unread already is. The sidebar is where you MOVE around a mailbox; the modal is where
  // you stack conditions on it — but there is only one filter, so picking a source in either
  // place puts it in `?f=` and the mailbox is a link either way.
  const sourceFilter = (filterValues.source as string) || null;
  const setSourceFilter = useCallback(
    (key: string | null) => setFilterValues({ ...filterValues, source: key ?? undefined }),
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

  // App Launcher deep-link: /inbox?new=conversation opens the New (internal) thread dialog.
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
        ...(channelFilter ? { channel: channelFilter } : {}),
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
  }, [channelFilter, allWorkspaces, isPlatformOperator, showArchived, labelFilter, toast]);

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

  // Fallback: claim an inbox-conversion token that survived an email-confirmation round trip.
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

  /**
   * How many conversations each source is carrying — the number that makes the Sources nav
   * worth having rather than a second copy of the filter modal.
   *
   * It counts the LOADED page, and that page is not always the whole mailbox: `list_threads`
   * caps at 200, and picking a source pushes that source's channel into the request (which is
   * the point — trimming 200 rows client-side is wrong past 200 rows). So while a source is
   * pinned the server has already thrown the others away, and counting them here would print a
   * confident `0` next to WhatsApp for someone with a hundred WhatsApp threads.
   *
   * A count that is only sometimes true is worse than no count, so it is withheld instead:
   * `null` renders nothing. Same reason `threadTotal` says `200+` at the cap rather than `200`.
   */
  const sourceCounts = useMemo(() => {
    if (sourceFilter) return null;
    const counts = new Map<InboxSourceKey, number>();
    for (const t of threads) {
      const k = inboxSourceKey(t);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
  }, [threads, sourceFilter]);

  /** `200` is the server's page cap, not an answer — say so rather than reporting the ceiling. */
  const threadTotal = threads.length >= 200 ? '200+' : String(threads.length);

  const isCommentThread = activeThread?.channel === 'social'
    && (activeThread.metadata as Record<string, unknown> | null)?.social_kind === 'comments';

  const handlePrivateReply = async (m: InboxMessage) => {
    if (!activeId) return;
    const body = window.prompt('Send this person a private DM instead of replying under the post:');
    if (!body?.trim()) return;
    try {
      await inboxApi.commentPrivateReply(activeId, m.id, body.trim());
      toast({ title: 'Sent privately', description: 'They received it as a direct message.' });
      await openThread(activeId);
    } catch (e: any) {
      // One shot per comment, inside a window — a failure here is final, not a retry prompt.
      toast({ title: 'Private reply not delivered', description: e?.message ?? String(e), variant: 'destructive' });
    }
  };

  const handleToggleHidden = async (m: InboxMessage, hidden: boolean) => {
    if (!activeId) return;
    try {
      await inboxApi.setCommentHidden(activeId, m.id, hidden);
      toast({ title: hidden ? 'Comment hidden' : 'Comment visible again' });
      await openThread(activeId);
    } catch (e: any) {
      toast({ title: 'Could not update the comment', description: e?.message ?? String(e), variant: 'destructive' });
    }
  };

  // Falls back to the SOURCE, which is the one thing always known about a subject-less thread —
  // "WhatsApp contact" beats "Conversation", and so does "Public profile enquiry".
  const threadDisplayName = (t: InboxThread) => t.subject || `${inboxThreadSource(t).label} conversation`;

  const activeCount = participants.filter((p) => p.status === 'active').length;

  // The per-thread member action cluster (AI toggle, settings, add teammate,
  // status). Reused inline in the desktop header and inside the mobile details
  // sheet so the controls stay reachable without crowding the mobile header.
  const memberControls = isMember && activeThread ? (
    <>
      {(activeThread.metadata as any)?.marketplace_inquiry_id && (
        <Button
          variant="default" size="sm"
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
        size="icon" className="h-9 w-9"
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
          variant="outline" size="icon" className="h-9 w-9"
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
      <Button variant="outline" size="icon" className="h-9 w-9" title="Add a teammate" onClick={() => setShowAdd(true)}>
        <UserPlus className="w-4 h-4" />
      </Button>
      {activeThread.archived_at ? (
        <Button variant="outline" size="sm" title="Restore this conversation" onClick={restoreActive}>
          <ArchiveRestore className="w-4 h-4 mr-1.5" /> Restore
        </Button>
      ) : (
        <Button
          variant="outline" size="icon"
          className="h-9 w-9 text-muted-foreground hover:text-destructive"
          title="Delete — moves to Archived for 30 days, then permanently removed"
          onClick={archiveActive}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      )}
      <select
        className="bg-card border border-hairline rounded-sm px-3 py-1.5 text-xs capitalize focus:outline-none focus:ring-2 focus:ring-ring"
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
              size="sm"
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
        {/* ── Column 0 · Mailbox sidebar (Compose · views · sources · labels) ── */}
        <aside className="dashboard-card md:col-span-3 lg:col-span-2 hidden md:flex flex-col overflow-hidden p-0">
          {/* Workspace header. Flat: the ladder is bg-background → bg-card → bg-surface-sunken,
              and a gradient block here would be the only thing on the page that is not on it. */}
          <div className="px-3 py-2.5 flex items-center gap-2 border-b border-hairline bg-surface-sunken shrink-0">
            <div className="h-8 w-8 rounded-sm bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold shrink-0">
              {initials(activeWorkspace?.name || 'Inbox')}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{activeWorkspace?.name || 'Workspace'}</div>
              <div className="text-[11px] text-muted-foreground leading-tight">Inbox</div>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {isMember && (
              <div className="p-3">
                <Button className="w-full" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId}>
                  <Plus className="w-4 h-4 mr-1.5" /> Compose
                </Button>
              </div>
            )}

            <nav className="px-2 pb-1 space-y-0.5">
              <NavRow
                icon={<InboxIcon className="w-4 h-4 shrink-0" />}
                label="All conversations"
                active={!showArchived && !unreadOnly}
                count={showArchived ? null : threadTotal}
                onClick={() => { setShowArchived(false); setUnreadOnly(false); }}
              />
              <NavRow
                icon={<Mail className="w-4 h-4 shrink-0" />}
                label="Unread"
                active={unreadOnly && !showArchived}
                count={inboxUnread > 0 ? String(inboxUnread) : null}
                emphasiseCount
                onClick={() => { setShowArchived(false); setUnreadOnly(true); }}
              />
              <NavRow
                icon={<Archive className="w-4 h-4 shrink-0" />}
                label="Archived"
                active={showArchived}
                onClick={() => { setShowArchived(true); setUnreadOnly(false); }}
              />
            </nav>

            {/*
              Sources — the door each conversation came through, which is the axis this inbox is
              actually organised on since the profile-enquiry merge. It was reachable only from
              inside the filter modal, so the one thing that distinguishes a "Hire me" enquiry
              from cold mail took two clicks and a read to find.
            */}
            <SidebarHeading>Sources</SidebarHeading>
            <nav className="px-2 pb-1 space-y-0.5">
              <NavRow
                icon={<MessagesSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                label="Every source"
                dense
                active={!sourceFilter}
                onClick={() => setSourceFilter(null)}
              />
              {SOURCE_FILTER_ORDER.map((key) => {
                const meta = inboxSourceMeta(key);
                const n = sourceCounts?.get(key) ?? null;
                // A source with nothing in it is not a place to go. It stays visible only while
                // it is the one you picked, so the row you are standing on never vanishes.
                if (sourceCounts && !n && sourceFilter !== key) return null;
                return (
                  <NavRow
                    key={key}
                    icon={<span className={`w-2 h-2 rounded-full shrink-0 ${meta.tone.dot}`} />}
                    label={meta.label}
                    dense
                    active={sourceFilter === key}
                    count={n != null ? String(n) : null}
                    onClick={() => setSourceFilter(sourceFilter === key ? null : key)}
                  />
                );
              })}
            </nav>

            <SidebarHeading
              action={canManageLabels && activeWorkspaceId ? (
                <LabelManagerPopover
                  workspaceId={activeWorkspaceId}
                  labels={wsLabels}
                  onChanged={() => { loadLabels(); loadThreads(); }}
                />
              ) : undefined}
            >
              Labels
            </SidebarHeading>
            <nav className="px-2 pb-3 space-y-0.5">
              <NavRow
                icon={<Tag className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                label="All labels"
                dense
                active={!labelFilter}
                onClick={() => setLabelFilter(null)}
              />
              {wsLabels.map((l) => (
                <NavRow
                  key={l.id}
                  icon={<span className={`w-2 h-2 rounded-full shrink-0 ${labelDot(l.color)}`} />}
                  label={l.name}
                  dense
                  active={labelFilter === l.id}
                  onClick={() => setLabelFilter(labelFilter === l.id ? null : l.id)}
                />
              ))}
              {wsLabels.length === 0 && (
                <div className="text-[11px] text-muted-foreground px-2.5 py-2">
                  {canManageLabels ? 'Create labels with the + above.' : 'No labels yet.'}
                </div>
              )}
            </nav>
          </div>
        </aside>

        {/* ── Column 1 · Message list ── */}
        <div className={`dashboard-card md:col-span-4 lg:col-span-3 flex-1 min-h-0 md:flex-none flex flex-col overflow-hidden p-0 ${activeId ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-3 border-b border-hairline bg-surface-sunken space-y-3 shrink-0">
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <Input
                  value={query} onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search conversations"
                  className="pl-9 h-9"
                />
              </div>
              {/* Mobile compose — the sidebar (with its Compose) is desktop-only */}
              {isMember && (
                <Button size="icon" className="h-9 w-9 shrink-0 md:hidden" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId} title="Compose">
                  <Plus className="w-4 h-4" />
                </Button>
              )}
            </div>
            {/* Mobile views + sources (they live in the sidebar on desktop). Squared, not pills:
                a pill is the silhouette of a primary button, so "where I am" and "what to press"
                would be the same object on the one breakpoint with no room to tell them apart. */}
            <div className="flex md:hidden items-center gap-1.5 overflow-x-auto pb-0.5">
              <MobileChip active={!showArchived && !unreadOnly} onClick={() => { setShowArchived(false); setUnreadOnly(false); }}>
                <InboxIcon className="w-3 h-3" />All
              </MobileChip>
              <MobileChip active={unreadOnly && !showArchived} onClick={() => { setShowArchived(false); setUnreadOnly(true); }}>
                <Mail className="w-3 h-3" />Unread
              </MobileChip>
              <MobileChip active={showArchived} onClick={() => { setShowArchived(true); setUnreadOnly(false); }}>
                <Archive className="w-3 h-3" />Archived
              </MobileChip>
              {SOURCE_FILTER_ORDER.map((key) => {
                const meta = inboxSourceMeta(key);
                const n = sourceCounts?.get(key) ?? null;
                if (sourceCounts && !n && sourceFilter !== key) return null;
                return (
                  <MobileChip key={key} active={sourceFilter === key} onClick={() => setSourceFilter(sourceFilter === key ? null : key)}>
                    <span className={`w-1.5 h-1.5 rounded-full ${meta.tone.dot}`} />{meta.label}
                  </MobileChip>
                );
              })}
            </div>
            {/* Status tabs (Open / Follow-up / Done) narrow the working set; they are hidden in the
                Unread / Archived views, where status is not the axis. The filter bar stays put in
                every view — it is what carries the Unread toggle. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!showArchived && !unreadOnly ? (
                <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as InboxThreadStatus)}>
                  {/* No active-state override: the underline treatment is global, on
                      [role="tab"] in index.css. A filled pill here would read as a button. */}
                  <TabsList className="h-auto gap-3 bg-transparent p-0">
                    <TabsTrigger value="open" className="text-xs px-0 py-1">Open</TabsTrigger>
                    <TabsTrigger value="snoozed" className="text-xs px-0 py-1">Follow-up</TabsTrigger>
                    <TabsTrigger value="closed" className="text-xs px-0 py-1">Done</TabsTrigger>
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
              /*
                Three different facts, and only one of them has an action. A search that matched
                nothing is the user's own filter and clears in one press; an empty archive and an
                empty inbox are both "nothing has happened yet" — conversations arrive on their
                own, so there is nothing to offer and inventing a create button would be a lie.
              */
              query ? (
                <HubEmptyState
                  icon={MessageSquare}
                  variant="filtered"
                  title="No conversations match your search"
                  description={`Nothing matching “${query}”${showArchived ? ' in the archive' : ''}.`}
                  action={<Button size="sm" variant="outline" onClick={() => setQuery('')}>Clear search</Button>}
                />
              ) : (
                <HubEmptyState
                  icon={MessageSquare}
                  title={showArchived ? 'Nothing archived' : 'No conversations yet'}
                  description={showArchived
                    ? 'Deleted conversations rest here for 30 days before they are removed for good.'
                    : 'Email, WhatsApp, social and enquiries from your public profile all land here, each tagged with where it came from.'}
                />
              )
            ) : groupedThreads.map(([bucket, items]) => (
              <div key={bucket}>
                <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium">{bucket}</div>
                {items.map((t) => {
                  const name = threadDisplayName(t);
                  const active = activeId === t.id;
                  const source = inboxThreadSource(t);
                  // Who is on it, printed after the source — the pairing an operator triages by
                  // ("Email · Cody Wilson"). Unassigned is STATED, not left blank: a thread
                  // nobody has picked up and one whose assignee simply did not render look
                  // identical when the answer is an empty string.
                  const assignee = (t.assignees ?? [])[0]?.name ?? null;
                  const orderPending = (t.metadata as { order_intake?: { status?: string } } | null)
                    ?.order_intake?.status === 'pending_review';
                  return (
                    <button
                      key={t.id}
                      onClick={() => openThread(t.id)}
                      className={`w-full text-left px-4 py-3 flex gap-3 border-l-2 border-b border-hairline transition-colors ${active ? 'bg-surface-hover border-l-primary' : 'border-l-transparent hover:bg-surface-hover'}`}
                    >
                      <div className="relative shrink-0 mt-0.5">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className={`text-xs ${avatarTint(name)}`}>{initials(name)}</AvatarFallback>
                        </Avatar>
                        {/* Solid, not tinted: at 16px a 15% wash reads as grey in every theme,
                            and the glyph inside it needs a ground to sit on. */}
                        <span
                          className={`absolute -right-0.5 -bottom-0.5 w-4 h-4 rounded-full border-2 border-card flex items-center justify-center text-white ${source.tone.dot}`}
                          title={source.label}
                        >
                          <source.Icon className="w-2 h-2" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                          <span className={`flex-1 truncate text-sm ${t.unread ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>{name}</span>
                          <span className="text-[11px] text-muted-foreground shrink-0 tabular-nums">{timeAgo(t.last_message_at)}</span>
                        </div>
                        {t.last_message_preview && (
                          <div className={`text-xs truncate mt-0.5 ${t.unread ? 'text-foreground/70' : 'text-muted-foreground'}`}>{t.last_message_preview}</div>
                        )}
                        <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap">
                          <SourceWord source={source} />
                          <span className="text-[11px] text-muted-foreground truncate max-w-[9rem]">
                            {assignee ?? 'Unassigned'}
                          </span>
                          {t.status !== 'open' && !t.archived_at && <span className={`text-[11px] capitalize ${statusTone(t.status)}`}>{t.status}</span>}
                          {t.agent_state === 'active' && (
                            <span className="inline-flex items-center gap-1 text-[11px] leading-none text-primary"><Bot className="w-3 h-3" />AI</span>
                          )}
                          {/* #342: an order waiting for approval is the one thing worth seeing
                              from the list — otherwise it is only discoverable by opening the
                              thread, which is how an order sits unactioned for a week. It keeps
                              a tag where the rest of the row went to plain words, because it is
                              the one item in the row that is a JOB rather than a description. */}
                          {orderPending && (
                            <Badge variant="warning" className="text-[10px] py-0">
                              <ShoppingCart className="w-2.5 h-2.5" />Order
                            </Badge>
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

        {/* ── Column 2 · Conversation ──
            Takes every column the sidebar and the list do not, at every breakpoint. The
            customer profile is a drawer now (opened from the name or the person icon in this
            header), so there is no fourth column to make room for. */}
        <div className={`dashboard-card md:col-span-5 lg:col-span-7 flex-1 min-h-0 flex flex-col overflow-hidden p-0 ${activeId ? 'flex' : 'hidden md:flex'}`}>
          {!activeThread ? (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <MessageSquare className="w-10 h-10 opacity-30" />
              Select a conversation to get started
            </div>
          ) : (
            <>
              <div className="px-3 sm:px-4 py-3 border-b border-hairline bg-surface-sunken flex items-center gap-2 sm:gap-3 shrink-0">
                {/* Mobile: back to the conversation list */}
                <button
                  type="button"
                  onClick={backToList}
                  aria-label="Back to conversations"
                  className="md:hidden shrink-0 h-9 w-9 -ml-1 flex items-center justify-center rounded-sm text-muted-foreground hover:bg-surface-hover"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {/* Avatar and name both OPEN the profile drawer — clicking who you are talking
                    to is the affordance people reach for before they look for a button, and it
                    costs the header no width. The person icon on the right is the same action
                    for anyone who does not think to try the name. Two tight targets rather than
                    one block: the meta row under the name is read, not pressed, and a click
                    target that tall swallows the label chips beside it. */}
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  title="Customer profile — contact, quotes, invoices & projects"
                  aria-label={`Open the profile for ${threadDisplayName(activeThread)}`}
                  className="shrink-0 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className={`text-sm ${avatarTint(threadDisplayName(activeThread))}`}>
                      {initials(threadDisplayName(activeThread))}
                    </AvatarFallback>
                  </Avatar>
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowDetails(true)}
                      title="Customer profile — contact, quotes, invoices & projects"
                      className="min-w-0 truncate text-left text-[15px] font-semibold rounded-sm hover:underline decoration-hairline underline-offset-2"
                    >
                      {threadDisplayName(activeThread)}
                    </button>
                    {activeThread.archived_at && (
                      <Badge variant="neutral" className="text-[10px] shrink-0"><Archive className="w-2.5 h-2.5" />Archived</Badge>
                    )}
                  </div>
                  {/* Here the source DOES get a tag: it stands alone with room around it, and
                      this is the one place that has to answer "what am I about to reply on"
                      before the operator starts typing. */}
                  <div className="flex items-center gap-1.5 flex-wrap mt-1">
                    <SourceTag source={inboxThreadSource(activeThread)} />
                    <span className="text-xs text-muted-foreground">
                      {activeCount} participant{activeCount === 1 ? '' : 's'}
                    </span>
                    <LabelChips labels={activeThreadLabels} />
                  </div>
                </div>
                {/* Desktop: inline member controls. Mobile: collapsed into the details sheet. */}
                {memberControls && <div className="hidden md:flex items-center gap-1.5">{memberControls}</div>}
                {/* Open the Customer Profile drawer (only present while a conversation is open).
                    No longer `2xl:hidden`: the profile is a drawer at EVERY width now, so this
                    is the icon half of the two ways in, not a small-screen stand-in. */}
                <Button
                  variant="outline" size="sm"
                  onClick={() => setShowDetails(true)}
                  title="Customer profile — contact, quotes, invoices & projects"
                  aria-label="Customer profile"
                  className="shrink-0 gap-1.5"
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
                    onPrivateReply={isCommentThread && isMember ? handlePrivateReply : undefined}
                    onToggleHidden={isCommentThread && isMember ? handleToggleHidden : undefined}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-hairline bg-surface-sunken p-3 space-y-2 shrink-0">
                {/* A comment reply is PUBLIC. Nothing else about the composer says so, and the
                    same box is used for private DMs one filter click away — an operator who
                    assumes private has already published the mistake by the time they find out. */}
                {activeThread.channel === 'social'
                  && (activeThread.metadata as Record<string, unknown> | null)?.social_kind === 'comments'
                  && !isNote && (
                  <div className="text-xs bg-pink-500/10 dark:bg-pink-500/15 border border-pink-500/25 dark:border-pink-500/30 text-pink-700 dark:text-pink-300 rounded-sm px-3 py-2 flex items-start gap-1.5">
                    <MessagesSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>
                      This posts publicly as a reply under your {String((activeThread.metadata as Record<string, unknown> | null)?.platform ?? 'social')} post,
                      visible to everyone. Keep order details and personal information out of it.
                    </span>
                  </div>
                )}

                {activeThread.channel === 'whatsapp' && waWindow && !waWindow.open && !isNote && (
                  <div className="text-xs bg-[hsl(var(--warning-bg))] border border-warning/25 text-warning rounded-sm px-3 py-2">
                    WhatsApp 24-hour reply window has closed. Freeform replies are blocked by Meta — an approved
                    template is required to re-open the conversation. (Internal notes are still allowed.)
                  </div>
                )}
                {isMember && (
                  <div className="flex items-center gap-2">
                    {/* Reply / Private note is a MODE, not an action, so it is a segmented
                        control rather than two filled buttons — the composer already has one
                        solid button and it is Send. Getting this wrong publishes an internal
                        note to a customer, so the selected mode is stated in words and the
                        note mode carries its colour through to the textarea below. */}
                    <div className="inline-flex rounded-sm border border-hairline overflow-hidden bg-card">
                      <button
                        onClick={() => setIsNote(false)}
                        aria-pressed={!isNote}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 transition-colors ${!isNote ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-hover'}`}
                      >
                        <Send className="w-3 h-3" /> Reply
                      </button>
                      <button
                        onClick={() => setIsNote(true)}
                        aria-pressed={isNote}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border-l border-hairline transition-colors ${isNote ? 'bg-[hsl(var(--warning-bg))] text-warning' : 'text-muted-foreground hover:bg-surface-hover'}`}
                      >
                        <StickyNote className="w-3 h-3" /> Private note
                      </button>
                    </div>
                    {!isNote && (
                      <Button
                        variant="secondary" size="sm"
                        onClick={aiSuggest}
                        disabled={aiDrafting || waBlocked}
                        title="Let the assistant draft a reply you can edit before sending (1 credit)"
                        className="ml-auto h-8"
                      >
                        {aiDrafting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />} Draft with AI
                      </Button>
                    )}
                  </div>
                )}
                {aiDraftShown && !isNote && (
                  <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 border border-primary/25 text-primary rounded-sm px-3 py-2">
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
                  <label className="cursor-pointer p-2.5 rounded-sm hover:bg-surface-hover shrink-0">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
                  </label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!waBlocked) send(); } }}
                    placeholder={isNote ? 'Write a private note (only your team sees this)…' : waBlocked ? 'Reply window closed — template required' : 'Type a message…'}
                    className={`flex-1 min-h-[44px] max-h-32 resize-none bg-card ${isNote ? 'border-warning/40 focus-visible:ring-warning/30' : ''}`}
                    disabled={waBlocked}
                  />
                  <Button className="h-10 w-10 p-0 shrink-0" onClick={send} disabled={sending || waBlocked || (!draft.trim() && !attachment)}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/*
          There is no standing profile column. It used to be a fourth pane from 2xl up; the
          conversation is what an operator is actually working in, so the profile is a drawer
          at every width and the conversation keeps the room. It opens from the contact's name
          or the person icon in the conversation header — see the Sheet at the bottom of this
          component, which is now the ONLY renderer of DetailsRail.
        */}
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
          right on desktop), and the only place DetailsRail renders. Opened from the contact's
          name or the person icon in the conversation header. Member controls are only surfaced
          here on mobile, where the conversation header hides them. */}
      {activeThread && (
        <Sheet open={showDetails} onOpenChange={setShowDetails}>
          <SheetContent
            side={isMobile ? 'bottom' : 'right'}
            className={`p-0 bg-card overflow-hidden flex flex-col ${isMobile ? 'h-[85vh] rounded-t-2xl' : 'h-full w-full sm:max-w-md'}`}
          >
            {/* sr-only: this panel has no visible heading, and without a SheetTitle Radix
                logs a warning and a screen reader announces it with no name at all. */}
            <SheetTitle className="sr-only">Conversation details</SheetTitle>
            {memberControls && (
              <div className="md:hidden flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-hairline shrink-0">
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
                // The channel tab derives the 24-hour service window from the last INBOUND
                // message, so it needs the transcript, not just the thread row.
                messages={messages}
                // Approving writes a `system` message onto the thread; reopen so the transcript
                // shows it without the member having to click away and back.
                onIntakeChanged={() => { void openThread(activeThread.id); }}
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

/**
 * Did the customer actually GET it?
 *
 * Nothing in this UI answered that, and the answer was routinely no. Measured 2026-08-24 on the
 * first connected WhatsApp number: 27 outbound messages, all 27 accepted by Meta with a message
 * id returned — and 23 of them reported FAILED a second later. The operator saw 27 ordinary sent
 * bubbles. That is the precise reason "we are not sending messages to WhatsApp" was the
 * reasonable conclusion: we send them correctly, and the platform's own report that they did not
 * arrive was written to a metadata key with no reader.
 *
 * `failed` is deliberately loud and carries Meta's reason. The commonest one is the 24-hour
 * service window having closed, which is not a bug and is fixable by the operator — but only if
 * they are told.
 */
const DeliveryState: React.FC<{ meta: Record<string, unknown> }> = ({ meta }) => {
  const status = typeof meta.delivery_status === 'string' ? meta.delivery_status : null;
  if (!status) return null;

  if (status === 'failed' || status === 'relay_failed') {
    const code = meta.delivery_error_code;
    const detail = typeof meta.delivery_error_message === 'string' ? meta.delivery_error_message : null;
    const reason = [detail, code != null ? `(${String(code)})` : null].filter(Boolean).join(' ');
    return (
      <span
        className="inline-flex items-center gap-1 text-destructive"
        title={reason || 'WhatsApp did not report a reason.'}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {status === 'relay_failed' ? 'Not sent' : 'Not delivered'}
        {reason && <span className="opacity-80">· {reason}</span>}
      </span>
    );
  }
  if (status === 'read') return <span className="inline-flex items-center gap-1 text-primary"><CheckCircle2 className="w-2.5 h-2.5" />Read</span>;
  if (status === 'delivered') return <span className="inline-flex items-center gap-1"><Check className="w-2.5 h-2.5" />Delivered</span>;
  if (status === 'sent') return <span className="inline-flex items-center gap-1 opacity-80"><Check className="w-2.5 h-2.5" />Sent</span>;
  return null;
};

/**
 * An attachment rendered as the thing it IS.
 *
 * Every attachment used to render as one paperclip link with a filename, so reviewing a
 * conversation meant opening each file in a new tab to find out what it was — and a customer's
 * photo of the damaged tile, which is the whole message, showed as "attachment".
 *
 * `content_type` is the primary signal and the extension is the fallback, because a channel
 * attachment often arrives with no MIME type at all.
 */
const AttachmentView: React.FC<{ att: InboxAttachment; href?: string }> = ({ att, href }) => {
  const name = att.name || 'attachment';
  const ct = (att.content_type || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const kind = ct.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext) ? 'image'
    : ct.startsWith('video/') || ['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? 'video'
    : ct.startsWith('audio/') || ['mp3', 'ogg', 'wav', 'm4a', 'opus'].includes(ext) ? 'audio'
    : ct === 'application/pdf' || ext === 'pdf' ? 'pdf'
    : 'file';

  // No signed URL yet (still minting) or none obtainable. Say which — a bare filename that does
  // nothing when clicked reads as a broken link rather than as a file still loading.
  if (!href) {
    return (
      <div className="flex items-center gap-1 text-xs mt-1 text-muted-foreground">
        <Paperclip className="w-3 h-3 shrink-0" />
        <span className="truncate">{name}</span>
        <span className="opacity-70">· preparing…</span>
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block mt-1.5">
        <img
          src={href}
          alt={name}
          loading="lazy"
          className="max-h-64 w-auto max-w-full rounded-sm border border-hairline object-contain"
        />
      </a>
    );
  }
  if (kind === 'video') {
    // `controls` and nothing else: no autoplay, because a thread of six clips would all start at
    // once the moment it opens.
    return <video src={href} controls preload="metadata" className="mt-1.5 max-h-64 w-full rounded-sm border border-hairline" />;
  }
  if (kind === 'audio') {
    return <audio src={href} controls preload="metadata" className="mt-1.5 w-full max-w-[260px]" />;
  }
  if (kind === 'pdf') {
    // An <embed> inside a chat bubble is unreadable at bubble width and fights the scroll
    // container, so: name it, size it, and open it full-window. The label is what makes it
    // reviewable at a glance, which was the actual complaint.
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 mt-1.5 rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2 hover:border-primary/40 transition-colors"
      >
        <FileText className="w-4 h-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">{name}</span>
          <span className="block text-[10px] text-muted-foreground">
            PDF{att.size ? ` · ${Math.max(1, Math.round(att.size / 1024))} KB` : ''} · opens in a new tab
          </span>
        </span>
        <ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground" />
      </a>
    );
  }
  return (
    <a href={href} target="_blank" rel="noreferrer"
       className="flex items-center gap-1 text-xs mt-1 underline text-primary">
      <Paperclip className="w-3 h-3 shrink-0" /> <span className="truncate">{name}</span>
    </a>
  );
};

const MessageBubble: React.FC<{
  m: InboxMessage;
  info?: ParticipantLabel;
  myUserId: string | null;
  isCustomerThread: boolean;
  /** Present only on a social COMMENT thread — a DM has neither affordance. */
  onPrivateReply?: (m: InboxMessage) => void;
  onToggleHidden?: (m: InboxMessage, hidden: boolean) => void;
}> = ({ m, info, myUserId, isCustomerThread, onPrivateReply, onToggleHidden }) => {
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

  // A social commenter or DM sender has NO participant row — they are a handle with neither
  // phone nor email, and they never read this inbox. Their name lives on the message instead,
  // so without this every social message renders as an unattributed grey bubble and a thread
  // of ten different commenters looks like one anonymous person talking to themselves.
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  // A channel placeholder standing in for media, with nothing attached to show for it. Both
  // halves matter: once the attachment IS captured, the bubble should render the file rather
  // than keep apologising for it.
  const mediaPlaceholder = meta.attachment_unresolved === true
    && (m.attachments || []).length === 0;
  const externalAuthor = !m.sender_participant_id && typeof meta.author_handle === 'string'
    ? (meta.author_handle as string)
    : null;
  const displayLabel = info?.label ?? externalAuthor ?? undefined;

  if (isSystem) {
    return (
      <div className="flex justify-center my-1.5">
        <span className="text-[11px] text-muted-foreground bg-surface-sunken border border-hairline rounded-xs px-2.5 py-1">{m.body}</span>
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
        <AvatarFallback className={`text-[10px] ${isAgent ? 'bg-primary/15 text-primary' : avatarTint(displayLabel)}`}>
          {isAgent ? <Bot className="w-3.5 h-3.5" /> : initials(displayLabel)}
        </AvatarFallback>
      </Avatar>
      <div className={`flex flex-col min-w-0 ${ours ? 'items-end' : 'items-start'}`}>
        {displayLabel && !isNote && (
          <div className="text-[10px] text-muted-foreground mb-1 px-1 flex items-center gap-1.5">
            <span>{displayLabel}</span>
            {meta.social_kind === 'comment' && <span className="opacity-70">· public comment</span>}
            {meta.hidden_on_platform === true && (
              <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-0.5">
                <EyeOff className="w-2.5 h-2.5" /> hidden
              </span>
            )}
          </div>
        )}
        <div className={`rounded-2xl px-3.5 py-2 text-left ${bubbleClass}`}>
          {isNote && <div className="flex items-center gap-1 text-[10px] text-amber-foreground mb-1"><Lock className="w-3 h-3" /> Private note</div>}
          {isAgent && <div className="flex items-center gap-1 text-[10px] text-primary mb-1"><Bot className="w-3 h-3" /> KAI assistant</div>}
          {/* `[Unsupported message]` is the CHANNEL's placeholder for media it did not hand over,
              not something the customer typed. Shown raw it reads as a fault in their phone;
              what it actually means is that they sent a file and we could not fetch it. Say the
              second thing — an operator who knows a file is missing can ask for it again. */}
          {m.body && (mediaPlaceholder ? (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground italic">
              <Paperclip className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>They sent a file that WhatsApp did not pass on. Ask them to resend it, or open the chat on your phone.</span>
            </div>
          ) : (
            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</div>
          ))}
          {/* A public comment answered in public stays public. These are the two ways out:
              answer the person privately, or take the comment down. Both are one-shot at the
              platform (Meta allows a single private reply per comment, inside a window), so
              they live on the comment itself rather than in a menu three clicks away. */}
          {meta.social_kind === 'comment' && (onPrivateReply || onToggleHidden) && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-border/50">
              {onPrivateReply && (
                <button
                  type="button"
                  onClick={() => onPrivateReply(m)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors"
                  title="Answer this person by DM instead of publicly under the post"
                >
                  <Reply className="w-3 h-3" /> Reply privately
                </button>
              )}
              {onToggleHidden && (
                <button
                  type="button"
                  onClick={() => onToggleHidden(m, meta.hidden_on_platform !== true)}
                  className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-amber-400 transition-colors"
                >
                  {meta.hidden_on_platform === true
                    ? <><Eye className="w-3 h-3" /> Unhide</>
                    : <><EyeOff className="w-3 h-3" /> Hide</>}
                </button>
              )}
            </div>
          )}
          {(m.attachments || []).map((a, i) => {
            const k = a.storage_object_path || a.url || '';
            return <AttachmentView key={k || i} att={a} href={urls[k] || a.url} />;
          })}
        </div>
        <div className="text-[10px] mt-1 px-1 text-muted-foreground flex items-center gap-1.5">
          <span>{formatDate(m.created_at, { withTime: true })}</span>
          {/* Only on OUR side, and only on a channel that reports back. An incoming message has
              no delivery state of ours to show, and an internal note never leaves the building. */}
          {ours && !isNote && <DeliveryState meta={meta} />}
        </div>
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
  // Not accent-coloured: eight accent headings down one narrow column make the labels louder
  // than the values under them, which is backwards for a panel you read to find a fact.
  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
    <span className="shrink-0">{icon}</span>
    <span>{children}</span>
    {count != null && <span className="text-xs text-muted-foreground font-normal">({count})</span>}
  </h3>
);

interface KitchenEstimate {
  reference?: string;
  currency?: string;
  subtotal?: number;
  dimensions?: Record<string, number>;
  lines?: { section: string; total: number }[];
  contact?: { name?: string | null; shape?: string | null };
  plan_id?: string | null;
  project_id?: string | null;
}

/**
 * Kitchen estimate — a configuration a visitor built on /tools/kitchen-cost.
 *
 * Same shape as order intake: what sits on the thread is a PROPOSAL, and nothing exists in
 * projects or quotes until a member approves. Approving builds the project plan; turning that
 * into a quote stays a second, deliberate click, because a quote is a priced document and
 * conjuring one behind the operator is exactly what the templates rule forbids.
 */
const KitchenEstimatePanel: React.FC<{ thread: InboxThread }> = ({ thread }) => {
  const { toast } = useToast();
  const est = (thread.metadata as { kitchen_estimate?: KitchenEstimate } | null)?.kitchen_estimate;
  const [busy, setBusy] = useState(false);
  const [planId, setPlanId] = useState<string | null>(est?.plan_id ?? null);
  const [projectId, setProjectId] = useState<string | null>(est?.project_id ?? null);

  if (!est) return null;
  const currency = est.currency || 'EUR';

  const approve = async () => {
    setBusy(true);
    try {
      const res = await projectPlansService.createFromKitchenEstimate(thread.id);
      setPlanId(res.plan_id);
      setProjectId(res.project_id);
      toast({
        title: res.already_exists ? 'Already approved' : 'Project plan created',
        description: 'Open the plan to adjust rates, then create the quote.',
      });
    } catch (e) {
      toast({ title: 'Could not create the plan', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const makeQuote = async () => {
    if (!planId) return;
    setBusy(true);
    try {
      const quoteId = await projectPlansService.createQuote(planId);
      window.location.href = `/quotes/${quoteId}`;
    } catch (e) {
      toast({ title: 'Could not create the quote', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
      setBusy(false);
    }
  };

  return (
    <div className="p-5 border-b border-hairline">
      <SectionTitle icon={<CookingPot className="h-4 w-4" />}>Kitchen estimate</SectionTitle>
      <div className="rounded-sm bg-surface-sunken border border-hairline p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-lg font-semibold tabular-nums">
            {formatMoney(est.subtotal ?? 0, currency)}
          </span>
          {est.reference && <Badge variant="outline" className="text-[10px]">{est.reference}</Badge>}
        </div>

        {est.dimensions && (
          <div className="text-xs text-muted-foreground">
            {Object.entries(est.dimensions).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(' · ')}
          </div>
        )}
        {est.contact?.shape && <div className="text-xs text-muted-foreground">{est.contact.shape}</div>}

        {(est.lines ?? []).filter((l) => l.total > 0).map((l) => (
          <div key={l.section} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground truncate">{l.section}</span>
            <span className="tabular-nums shrink-0">{formatMoney(l.total, currency)}</span>
          </div>
        ))}

        {planId ? (
          <div className="flex flex-col gap-2 pt-1">
            {projectId && (
              <a href={`/projects/${projectId}`} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                Open the project plan <ChevronRight className="h-3 w-3" />
              </a>
            )}
            <Button size="sm" disabled={busy} onClick={makeQuote}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create quote'}
            </Button>
          </div>
        ) : (
          <Button size="sm" className="w-full mt-1" disabled={busy} onClick={approve}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create project & plan'}
          </Button>
        )}
      </div>
    </div>
  );
};

/** One editable intake line. `line_no === null` marks a line the member added themselves. */
interface DraftLine {
  key: string;
  line_no: number | null;
  product_id: string | null;
  description: string;
  raw_text: string;
  quantity: string;
  price: string;
  priceTouched: boolean;
  needsReview: boolean;
  matchMethod: IntakeMatchMethod;
}

/**
 * Repoint one line at a different product. Runs the same MIVAA → ilike ladder the extractor used,
 * server-side, so the reviewer picks from the catalog the reading was drawn from rather than a
 * second, differently-behaved search.
 */
const IntakeProductPicker: React.FC<{
  threadId: string;
  onPick: (hit: { product_id: string; name: string }) => void;
}> = ({ threadId, onPick }) => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Array<{ product_id: string; name: string; score: number | null }>>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); return; }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await inboxApi.searchIntakeProducts(threadId, q);
        if (!cancelled) setHits(res.candidates);
      } catch {
        if (!cancelled) setHits([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, threadId]);

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the catalog…"
        aria-label="Search the catalog for a product"
        className="h-8 text-sm"
      />
      {searching && <div className="text-[11px] text-muted-foreground px-1">Searching…</div>}
      {!searching && query.trim().length >= 2 && hits.length === 0 && (
        <div className="text-[11px] text-muted-foreground px-1">
          Nothing matched. Leave the line as free text — an order can carry one.
        </div>
      )}
      <div className="max-h-56 overflow-y-auto">
        {hits.map((h) => (
          <button
            key={h.product_id}
            type="button"
            onClick={() => onPick(h)}
            className="w-full text-left text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover transition-colors"
          >
            <span className="block truncate">{h.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

/**
 * The per-line editor (#342 §4).
 *
 * `update_intake_items` and `search_intake_products` shipped with the rest of the intake and had
 * no caller — a handler nothing renders, which left a reviewer with only two moves: accept the
 * model's whole reading, or dismiss it. One wrong line meant dismissing four right ones.
 *
 * Two rules the shape of this follows from:
 *
 *  • **A price the member did not type is never sent back.** Supplying `unit_price` is exactly
 *    what stamps `unit_price_source='manual'`, and a line silently flipped to manual stops
 *    re-pricing when the customer is assigned — which is the one thing assigning a customer is
 *    for. So the payload carries a price only for a field that was actually touched.
 *  • **`line_no` is the server's handle on the previous reading**, not a display order. An
 *    existing line keeps its ORIGINAL number even after reordering or deletion above it; the
 *    server renumbers on save. A member-added line sends none, so it inherits nothing.
 *
 * The arithmetic here is display only. `update_intake_items` re-resolves every price server-side
 * and `recompute_order_totals` has the last word once the order exists — nothing computed in this
 * component is ever stored.
 */
const IntakeLineEditor: React.FC<{
  threadId: string;
  intake: OrderIntake;
  busy: boolean;
  onSaved: (intake: OrderIntake, totals: IntakeTotals) => void;
  onCancel: () => void;
}> = ({ threadId, intake, busy, onSaved, onCancel }) => {
  const { toast } = useToast();
  const nextKey = useRef(0);
  const makeKey = () => `l${nextKey.current++}`;

  const [draft, setDraft] = useState<DraftLine[]>(() =>
    intake.items.map((it) => ({
      key: makeKey(),
      line_no: it.line_no,
      product_id: it.product_id,
      description: it.description,
      raw_text: it.raw_text,
      quantity: String(it.quantity),
      price: it.unit_price == null ? '' : String(it.unit_price),
      priceTouched: false,
      needsReview: it.needs_review,
      matchMethod: it.match_method,
    })),
  );
  const [saving, setSaving] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const patch = (key: string, changes: Partial<DraftLine>) =>
    setDraft((rows) => rows.map((r) => (r.key === key ? { ...r, ...changes } : r)));

  const addLine = () =>
    setDraft((rows) => [...rows, {
      key: makeKey(), line_no: null, product_id: null, description: '', raw_text: '',
      quantity: '1', price: '', priceTouched: false, needsReview: true, matchMethod: 'manual',
    }]);

  const displayTotal = draft.reduce((sum, r) => {
    const q = Number(r.quantity);
    const p = Number(r.price);
    return sum + (Number.isFinite(q) && Number.isFinite(p) && r.price !== '' ? q * p : 0);
  }, 0);

  const save = async () => {
    if (draft.length === 0) {
      toast({
        title: 'An order needs at least one line',
        description: 'Dismiss the whole thing instead if nothing here is real.',
        variant: 'destructive',
      });
      return;
    }
    for (const [i, r] of draft.entries()) {
      const q = Number(r.quantity);
      if (!Number.isFinite(q) || q <= 0) {
        toast({ title: `Line ${i + 1} needs a quantity`, description: 'A quantity must be a positive number.', variant: 'destructive' });
        return;
      }
      if (!r.product_id && !r.description.trim()) {
        toast({ title: `Line ${i + 1} needs a description`, description: 'Pick a product, or say what it is in words.', variant: 'destructive' });
        return;
      }
    }

    setSaving(true);
    try {
      const items = draft.map((r) => ({
        ...(r.line_no === null ? {} : { line_no: r.line_no }),
        product_id: r.product_id,
        description: r.description.trim(),
        raw_text: r.raw_text,
        quantity: Number(r.quantity),
        // Touched only. An untouched field means "whatever the resolver said", not "this number".
        ...(r.priceTouched ? { unit_price: r.price.trim() === '' ? null : Number(r.price) } : {}),
      }));
      const res = await inboxApi.updateIntakeItems(threadId, items);
      onSaved(res.intake, res.totals);
      toast({ title: 'Lines saved', description: 'Prices were re-checked for anything you repointed.' });
    } catch (e) {
      toast({ title: 'Could not save the lines', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="space-y-2 mb-3">
        {draft.map((r, i) => (
          <div key={r.key} className="rounded-sm border border-hairline p-2 space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Input
                value={r.quantity}
                onChange={(e) => patch(r.key, { quantity: e.target.value })}
                inputMode="decimal"
                aria-label={`Quantity for line ${i + 1}`}
                className="h-8 w-14 text-sm text-right tabular-nums px-1.5"
              />
              <Popover open={openPicker === r.key} onOpenChange={(o) => setOpenPicker(o ? r.key : null)}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-left text-sm h-8 px-2 rounded-sm border border-hairline hover:bg-surface-hover transition-colors"
                  >
                    <span className="block truncate">
                      {r.description || <span className="text-muted-foreground">Pick a product…</span>}
                    </span>
                  </button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-2">
                  <IntakeProductPicker
                    threadId={threadId}
                    onPick={(hit) => {
                      // Repointing clears any manual price: the whole reason to repoint is to get
                      // THIS product's price for THIS customer, which only the resolver knows.
                      patch(r.key, {
                        product_id: hit.product_id,
                        description: hit.name,
                        price: '',
                        priceTouched: false,
                        matchMethod: 'manual',
                        needsReview: false,
                      });
                      setOpenPicker(null);
                    }}
                  />
                </PopoverContent>
              </Popover>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 shrink-0"
                aria-label={`Remove line ${i + 1}`}
                onClick={() => setDraft((rows) => rows.filter((x) => x.key !== r.key))}
              >
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>

            <div className="flex items-center gap-1.5">
              <Input
                value={r.price}
                onChange={(e) => patch(r.key, { price: e.target.value, priceTouched: true })}
                inputMode="decimal"
                placeholder="unit price"
                aria-label={`Unit price for line ${i + 1}`}
                className="h-7 w-24 text-xs text-right tabular-nums px-1.5"
              />
              <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate">
                {r.priceTouched
                  ? 'your price'
                  : r.price === ''
                    ? 'no price yet — the resolver will try'
                    : r.raw_text || 'from the price list'}
              </span>
            </div>
          </div>
        ))}
      </div>

      <Button size="sm" variant="outline" className="w-full mb-3" onClick={addLine} disabled={saving}>
        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add a line
      </Button>

      <div className="flex items-center justify-between text-sm border-t border-hairline pt-2.5 mb-3">
        <span className="text-muted-foreground">Total (excl. VAT)</span>
        <span className="tabular-nums" style={{ fontWeight: 600 }}>
          {formatMoney(displayTotal, intake.currency)}
        </span>
      </div>

      <div className="flex gap-2">
        <Button size="sm" className="flex-1" disabled={saving || busy} onClick={save}>
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Save lines'}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
      </div>
    </>
  );
};

/**
 * Order intake (#342) — the "assign / set as an actual order" surface.
 *
 * Deliberately small: fix the customer, fix the lines, approve. It is NOT a second order editor —
 * per-line supplier, warehouse, customs, discounts and dispatch all already live on the real
 * order, and the panel links there the moment one exists.
 */
const OrderIntakePanel: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  onChanged: () => void;
}> = ({ thread, context, onChanged }) => {
  const { toast } = useToast();
  const [intake, setIntake] = useState<OrderIntake | null>(null);
  const [totals, setTotals] = useState<IntakeTotals | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await inboxApi.getThreadIntake(thread.id);
      setIntake(res.intake);
      setTotals(res.totals);
      setCanApprove(res.can_approve);
    } catch {
      setIntake(null);
    } finally {
      setLoading(false);
    }
  }, [thread.id]);

  useEffect(() => { void load(); }, [load]);

  if (loading || !intake) return null;

  const needsCustomer = !intake.customer_contact_id && !intake.customer_company_id;
  const reviewCount = intake.items.filter((i) => i.needs_review).length;

  const assignThreadContact = async () => {
    if (!context?.contact?.id) return;
    setBusy(true);
    try {
      const res = await inboxApi.updateIntake(thread.id, { customer_contact_id: context.contact.id });
      setIntake(res.intake);
      setTotals(res.totals);
      // Prices are re-resolved server-side against the newly assigned customer, so the numbers
      // shown after this are that customer's, not the ones read before anyone was assigned.
      toast({ title: 'Customer assigned', description: 'Line prices were re-checked for this customer.' });
    } catch (e) {
      toast({ title: 'Could not assign', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      const res = await inboxApi.approveIntake(thread.id);
      await load();
      onChanged();
      // The confirmation is REPORTED, never assumed. An order the customer was never told about
      // is the failure this whole path exists to make visible (#342 §4a).
      const c: IntakeConfirmation = res.confirmation;
      if (c?.status === 'sent') {
        toast({
          title: `Order ${res.order_number ?? ''} created`.trim(),
          description: 'The customer has been sent a confirmation.',
        });
      } else {
        toast({
          title: `Order ${res.order_number ?? ''} created — customer NOT notified`.trim(),
          description: c?.detail || 'The confirmation could not be delivered. Reply on the thread to tell them.',
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Could not approve', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await inboxApi.rejectIntake(thread.id);
      await load();
      onChanged();
    } catch (e) {
      toast({ title: 'Could not dismiss', description: e instanceof Error ? e.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 border-b border-hairline">
      <SectionTitle icon={<ShoppingCart className="h-4 w-4" />} count={intake.items.length}>
        {intake.status === 'approved' ? 'Order created' : intake.status === 'rejected' ? 'Order dismissed' : 'Order to approve'}
      </SectionTitle>

      {intake.status === 'approved' && intake.order_id ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            This conversation became a pre-order. Confirm it, price the rest and dispatch from Finance.
          </p>
          {intake.confirmation && intake.confirmation.status !== 'sent' && (
            <div className="flex items-start gap-2 text-xs text-destructive mb-3">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>The customer was not notified. {intake.confirmation.detail}</span>
            </div>
          )}
          <a
            href={`/finance/orders/${intake.order_id}`}
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            Open in Finance <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </>
      ) : intake.status === 'rejected' ? (
        <p className="text-xs text-muted-foreground">
          Dismissed. A new message from this customer starts a fresh reading.
        </p>
      ) : editing ? (
        <IntakeLineEditor
          threadId={thread.id}
          intake={intake}
          busy={busy}
          onSaved={(next, nextTotals) => { setIntake(next); setTotals(nextTotals); setEditing(false); }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          <div className="space-y-1.5 mb-3">
            {intake.items.map((it: IntakeItem) => (
              <div key={it.line_no} className="flex items-start gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                <span className="text-muted-foreground shrink-0 tabular-nums">{it.quantity}×</span>
                <div className="flex-1 min-w-0">
                  <div className="truncate">{it.description}</div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                    {it.match_method === 'visual' && <ImageIcon className="w-3 h-3" />}
                    {it.needs_review
                      ? <span className="text-warning">{it.unit_price == null ? 'needs a price' : 'check this match'}</span>
                      : <span className="truncate">{it.raw_text}</span>}
                  </div>
                </div>
                <span className="text-xs shrink-0 tabular-nums">
                  {it.unit_price == null ? '—' : formatMoney(it.quantity * it.unit_price, intake.currency)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-sm border-t border-hairline pt-2.5 mb-3">
            <span className="text-muted-foreground">Total (excl. VAT)</span>
            <span className="tabular-nums" style={{ fontWeight: 600 }}>{formatMoney(totals?.net ?? 0, intake.currency)}</span>
          </div>

          {reviewCount > 0 && (
            <div className="flex items-start gap-2 text-xs text-warning mb-3">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>
                {reviewCount} line{reviewCount === 1 ? '' : 's'} need a look before this is right.
                Fix {reviewCount === 1 ? 'it' : 'them'} below rather than dismissing the rest.
              </span>
            </div>
          )}

          <Button size="sm" variant="outline" className="w-full mb-3" disabled={busy} onClick={() => setEditing(true)}>
            <Settings2 className="w-3.5 h-3.5 mr-1.5" /> Edit lines
          </Button>

          {needsCustomer && (
            <div className="mb-3">
              <p className="text-xs text-muted-foreground mb-2">
                Assign a customer before approving — the price depends on who is buying.
              </p>
              {context?.contact?.id && (
                <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={assignThreadContact}>
                  Use {context.contact.name || 'this contact'}
                </Button>
              )}
            </div>
          )}

          {canApprove && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={busy || needsCustomer}
                onClick={approve}
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Approve as pre-order'}
              </Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={reject}>
                Dismiss
              </Button>
            </div>
          )}
          {!canApprove && (
            <p className="text-[11px] text-muted-foreground">
              An owner, admin or sales manager approves orders.
            </p>
          )}
        </>
      )}
    </div>
  );
};

/**
 * What the CHANNEL knows about the person, as opposed to what our CRM knows.
 *
 * These are different questions and the drawer used to answer only the second one, so a WhatsApp
 * thread showed a CRM card for a contact that was itself created from the conversation — a
 * tautology, and on the numbers imported on 2026-08-24 a contact literally named
 * "8613360315779". The facts that decide what you may DO here (can we message them outside the
 * 24-hour window, have they sent STOP, which of our numbers did they reach) lived nowhere.
 *
 * Everything shown is something we hold or can derive. Nothing is inferred, and where WhatsApp
 * gives us nothing the panel says so rather than rendering an empty field — an empty field reads
 * as "this person has no company", not as "Meta does not tell us".
 */
const ChannelIdentityPanel: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  messages: InboxMessage[];
  isMember: boolean;
}> = ({ thread, context, messages, isMember }) => {
  const meta = (thread.metadata || {}) as Record<string, unknown>;
  const phone = String(meta.contact_phone || '').trim();
  const digits = phone.replace(/\D/g, '');
  const contact = context?.contact ?? null;
  const isWhatsApp = thread.channel === 'whatsapp';

  // The name WhatsApp itself reports, which is NOT the CRM name and is worth showing separately:
  // the CRM row is ours to edit and drifts, this is what the person calls themselves on WhatsApp.
  const waName = (thread.subject || '').trim();
  const waNameIsJustTheNumber = !waName || waName.replace(/\D/g, '') === digits;

  // A CRM row auto-created from the phone number and never named. It is not a customer record,
  // it is a placeholder, and showing it as though somebody filed it is how the CRM fills up with
  // 8 contacts called by their own phone number.
  const crmIsPlaceholder = !!contact
    && (!contact.name || contact.name.replace(/\D/g, '') === digits)
    && !contact.email;

  // Last INBOUND customer message — the clock Meta runs. Free-form replies are refused outside
  // 24 hours of it, which is why all 22 auto-replies to imported history failed delivery.
  const lastInbound = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      const dir = (m.metadata as Record<string, unknown> | null)?.direction;
      if (m.message_type === 'text' && dir === 'incoming') return m.created_at;
    }
    return null;
  }, [messages]);

  const windowState = useMemo(() => {
    if (!lastInbound) return null;
    const hrs = (Date.now() - new Date(lastInbound).getTime()) / 3_600_000;
    if (hrs >= 24) return { open: false, label: 'Closed', detail: 'Only an approved template can be sent.' };
    const left = 24 - hrs;
    return {
      open: true,
      label: left >= 1 ? `${Math.floor(left)}h left` : `${Math.max(1, Math.round(left * 60))}m left`,
      detail: 'You can reply freely until it closes.',
    };
  }, [lastInbound]);

  const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="border-b border-hairline px-4 py-4 flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0 rounded-sm">
          <AvatarFallback className={`text-sm rounded-sm ${avatarTint(waName || phone)}`}>
            {initials(waNameIsJustTheNumber ? (phone || '?') : waName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">
            {waNameIsJustTheNumber ? (phone || 'Unknown number') : waName}
          </div>
          <div className="text-xs text-muted-foreground truncate">
            {isWhatsApp ? 'WhatsApp' : 'Social'} · {phone || 'no number on file'}
          </div>
          {isWhatsApp && phone && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                {/* wa.me, not our relay: this opens the chat on the operator's OWN phone, which is
                    the point of a coexistence number — some conversations are handled there. */}
                <a href={`https://wa.me/${digits}`} target="_blank" rel="noreferrer">
                  <ExternalLink className="w-3 h-3 mr-1" />Open in WhatsApp
                </a>
              </Button>
              <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                <a href={`tel:${phone}`}><Phone className="w-3 h-3 mr-1" />Call</a>
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* The 24-hour service window. It decides whether the composer below will actually deliver,
          and until now nothing in the UI said so — a message typed outside it is accepted, gets a
          message id, and is refused by Meta a second later. */}
      {isWhatsApp && windowState && (
        <div className="p-5 border-b border-hairline space-y-2.5">
          <SectionTitle icon={<MessagesSquare className="h-4 w-4" />}>Service window</SectionTitle>
          <Row label="Free-form replies">
            <Badge variant={windowState.open ? 'success' : 'warning'} className="text-[10px]">
              {windowState.label}
            </Badge>
          </Row>
          <p className="text-[11px] text-muted-foreground">
            {windowState.detail} WhatsApp allows free replies for 24 hours after the customer’s last
            message; after that Meta accepts the send and then fails delivery.
          </p>
        </div>
      )}

      {/* What WhatsApp does and does not hand over. Stated, because the absence is the surprising
          part — the operator can see a photo and a business card on their phone and reasonably
          expects them here. */}
      {isWhatsApp && (
        <div className="p-5 border-b border-hairline space-y-2.5">
          <SectionTitle icon={<UserIcon className="h-4 w-4" />}>WhatsApp profile</SectionTitle>
          <Row label="Display name">
            {waNameIsJustTheNumber
              ? <span className="text-muted-foreground">Not sent</span>
              : <span className="truncate">{waName}</span>}
          </Row>
          <Row label="Number"><span className="tabular-nums">{phone || '—'}</span></Row>
          <p className="text-[11px] text-muted-foreground">
            Profile photo, “about”, and business details are not part of the WhatsApp Business API —
            Meta sends us the display name and the number only. What you see on the phone app comes
            from WhatsApp itself, and is not available to any integration.
          </p>
        </div>
      )}

      {/* Where it came in. Matters the moment there is more than one number, and it is the first
          thing support asks for. */}
      <div className="p-5 border-b border-hairline space-y-2.5">
        <SectionTitle icon={<Hash className="h-4 w-4" />}>Connection</SectionTitle>
        <Row label="Messages">{messages.length}</Row>
        {lastInbound && (
          <Row label="Last from them"><span className="tabular-nums">{formatDate(lastInbound)}</span></Row>
        )}
        {isMember && !!meta.zernio_conversation_id && (
          <Row label="Conversation id">
            <span className="text-[11px] font-mono text-muted-foreground break-all">
              {String(meta.zernio_conversation_id)}
            </span>
          </Row>
        )}
      </div>

      {/* CRM. The action the user asked for, and it is deliberately phrased by STATE: a contact
          auto-created from a phone number is not "linked", it is unfiled, and offering "View in
          CRM" for it sends someone to a record with nothing in it. */}
      <div className="p-5 space-y-2.5">
        <SectionTitle icon={<UserPlus className="h-4 w-4" />}>CRM</SectionTitle>
        {!contact && (
          <>
            <p className="text-xs text-muted-foreground">
              Nobody in the CRM is linked to this conversation. Search{' '}
              <span className="font-mono">{phone || 'the number'}</span> before adding anyone — the
              same person often already exists under a different spelling of their name.
            </p>
            {/* The contacts LIST, not `/crm/contacts/new`. A CRM party has to go through the
                duplicate search before it exists, and a button that jumps straight to a blank
                create form is how the same customer ends up in there three times. Same reason
                AgentResultCard refuses to deep-link that route. */}
            <Button asChild size="sm" variant="secondary" className="w-full">
              <a href="/crm?tab=contacts">
                <UserPlus className="w-3.5 h-3.5 mr-1.5" />Find or add in CRM
              </a>
            </Button>
          </>
        )}
        {contact && crmIsPlaceholder && (
          <>
            <p className="text-xs text-muted-foreground">
              A contact was created automatically from the phone number and has never been filled
              in — no name, no email. It will read as “{contact.name}” everywhere in the CRM until
              somebody names it.
            </p>
            <Button asChild size="sm" variant="secondary" className="w-full">
              <a href={`/crm/contacts/${contact.id}`}>
                <UserIcon className="w-3.5 h-3.5 mr-1.5" />Complete this contact
              </a>
            </Button>
          </>
        )}
        {contact && !crmIsPlaceholder && (
          <>
            <Row label="Contact"><span className="truncate">{contact.name || '—'}</span></Row>
            {contact.email && <Row label="Email"><span className="truncate">{contact.email}</span></Row>}
            <Button asChild size="sm" variant="outline" className="w-full mt-1">
              <a href={`/crm/contacts/${contact.id}`}>
                <ChevronRight className="w-3.5 h-3.5 mr-1.5" />Open in CRM
              </a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

const DetailsRail: React.FC<{
  thread: InboxThread;
  context: InboxThreadContext | null;
  participants: InboxParticipant[];
  labels: Map<string, ParticipantLabel>;
  isMember: boolean;
  messages?: InboxMessage[];
  onIntakeChanged?: () => void;
}> = ({ thread, context, participants, labels, isMember, messages = [], onIntakeChanged }) => {
  // A channel tab only where there IS a channel identity distinct from the CRM one. An internal
  // or email thread has nothing to put in it, and an empty tab is worse than no tab.
  const hasChannelIdentity = thread.channel === 'whatsapp' || thread.channel === 'social';
  const [tab, setTab] = useState<'profile' | 'channel'>('profile');
  const contact = context?.contact ?? null;
  const company = context?.company ?? null;
  const quotes = context?.quotes ?? [];
  const projects = context?.projects ?? [];
  const displayName = contact?.name || thread.subject || 'Conversation';
  const quotedTotal = quotes.reduce((s, q) => s + (q.grand_total || 0), 0);
  const subtitle = [contact?.position, company?.name].filter(Boolean).join(' · ');
  const metrics = context?.metrics ?? null;
  const invoices = context?.invoices ?? [];
  const requestedServices = inboxRequestedServices(thread);

  // Information block: who's handling it + status (real data, no fabricated priority/response-rate).
  const agentActive = thread.agent_state === 'active';
  const firstMember = participants.find((p) => p.participant_type === 'member' && p.status === 'active');
  const assignee = agentActive ? 'AI Assistant' : (firstMember ? (labels.get(firstMember.id)?.label || 'Team') : 'Unassigned');
  const statusLabel = thread.status === 'snoozed' ? 'Follow-up' : thread.status === 'closed' ? 'Done' : 'Open';
  void subtitle;

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="px-4 py-2.5 border-b border-hairline bg-surface-sunken flex items-center justify-between shrink-0">
        <span className="text-sm font-semibold">Customer profile</span>
      </div>
      {/* Underline tabs, per the design system — a filled pill here would carry the silhouette of
          a primary button on a panel whose only real action lives further down. */}
      {hasChannelIdentity && (
        <div className="px-4 border-b border-hairline shrink-0">
          <Tabs value={tab} onValueChange={(v) => setTab(v as 'profile' | 'channel')}>
            <TabsList className="h-auto bg-transparent p-0 gap-4">
              <TabsTrigger value="profile" className="px-0 text-xs">Profile</TabsTrigger>
              <TabsTrigger value="channel" className="px-0 text-xs">
                {thread.channel === 'whatsapp' ? 'WhatsApp' : 'Social'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
      {hasChannelIdentity && tab === 'channel' && (
        <ChannelIdentityPanel thread={thread} context={context} messages={messages} isMember={isMember} />
      )}
      {(!hasChannelIdentity || tab === 'profile') && (
    <div className="flex-1 overflow-y-auto">
      {/*
        Identity block. It used to open with a gradient cover banner and a gradient avatar
        floating on a coloured shadow — the marketing language, on the panel whose job is
        showing someone's phone number and what they owe. Flat, left-aligned and readable:
        the reader is scanning for a fact, not admiring a header.
      */}
      <div className="border-b border-hairline px-4 py-4 flex items-start gap-3">
        <Avatar className="h-12 w-12 shrink-0 rounded-sm">
          <AvatarFallback className={`text-sm rounded-sm ${avatarTint(displayName)}`}>{initials(displayName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold truncate">{displayName}</div>
          {contact?.position && <div className="text-xs text-muted-foreground truncate">{contact.position}</div>}
          {company?.name && (
            <div className="inline-flex items-center gap-1 mt-1 text-xs text-muted-foreground min-w-0">
              <Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{company.name}</span>
            </div>
          )}
          {(contact?.city || contact?.country) && (
            <div className="inline-flex items-center gap-1 mt-0.5 text-[11px] text-muted-foreground">
              <MapPin className="w-3 h-3 shrink-0" />{[contact?.city, contact?.country].filter(Boolean).join(', ')}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {contact?.is_client && <Badge variant="success" className="text-[10px]"><BadgeCheck className="w-3 h-3" />Client</Badge>}
            {contact?.lead_status && <Badge variant="neutral" className="text-[10px] capitalize">{contact.lead_status}</Badge>}
          </div>
          {/* The two things you actually do from a contact card, per the reference layouts.
              Rendered only when there is something to act on — a dead mailto: button is
              worse than no button. */}
          {(contact?.email || contact?.phone || contact?.mobile) && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {contact?.email && (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <a href={`mailto:${contact.email}`}><Mail className="w-3 h-3 mr-1" />Email</a>
                </Button>
              )}
              {(contact?.phone || contact?.mobile) && (
                <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                  <a href={`tel:${contact.phone || contact.mobile}`}><Phone className="w-3 h-3 mr-1" />Call</a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Information — status + who's handling it */}
      <div className="p-5 border-b border-hairline space-y-2.5">
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

      {/* Order intake (#342) — above Customer value, because an order waiting for approval is the
          most actionable thing on the thread. Renders nothing unless a proposal exists, and is
          members-only (inbox-api 404s the action for a customer participant). */}
      {isMember && <OrderIntakePanel thread={thread} context={context} onChanged={() => onIntakeChanged?.()} />}

      {/* Kitchen estimate from the public calculator — same placement rationale as order intake:
          an enquiry waiting to be turned into a plan is the most actionable thing on the thread. */}
      {isMember && <KitchenEstimatePanel thread={thread} />}

      {/* Customer value — lifetime value + open balance from the customer's invoices
          (via inbox-api). Falls back to quoted-total + project-count on older API
          responses / internal threads where finance metrics aren't returned. */}
      {(metrics || quotes.length > 0 || projects.length > 0) && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<Wallet className="h-4 w-4" />}>Customer value</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5">
            {/* tabular-nums, not the display serif: these are money, and two figures side by
                side have to line up on the decimal to be comparable at a glance. */}
            <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
              <div className="text-lg font-semibold tabular-nums">
                {money(metrics ? metrics.lifetime_value : quotedTotal, metrics?.currency || quotes[0]?.currency)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Lifetime' : `Quoted · ${quotes.length}`}</div>
            </div>
            <div className="rounded-sm bg-surface-sunken border border-hairline p-3">
              <div className={`text-lg font-semibold tabular-nums ${metrics && metrics.open_balance > 0 ? 'text-warning' : ''}`}>
                {metrics ? money(metrics.open_balance, metrics.currency) : projects.length}
              </div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{metrics ? 'Open balance' : `Project${projects.length === 1 ? '' : 's'}`}</div>
            </div>
          </div>
        </div>
      )}

      {/* Open invoices — the customer's unpaid invoices, soonest-due first. */}
      {invoices.length > 0 && (
        <div className="p-5 border-b border-hairline">
          <SectionTitle icon={<FileText className="h-4 w-4" />} count={metrics?.open_count}>Open invoices</SectionTitle>
          <div className="space-y-0.5">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate">{inv.number || 'Invoice'}</div>
                  {inv.due_at && <div className="text-[11px] text-muted-foreground">Due {formatDate(inv.due_at)}</div>}
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
          <div className="p-5 space-y-2.5 border-b border-hairline">
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
            <div className="p-5 space-y-2.5 border-b border-hairline">
              <SectionTitle icon={<Building2 className="h-4 w-4" />}>Company</SectionTitle>
              <Row icon={<Building2 className="w-3.5 h-3.5" />}><span className="font-medium">{company.name}</span></Row>
              {company.industry && <Row icon={<Tag className="w-3.5 h-3.5" />}>{company.industry}</Row>}
              {company.website && <Row icon={<Globe className="w-3.5 h-3.5" />}><a href={company.website} target="_blank" rel="noreferrer" className="hover:underline truncate">{company.website}</a></Row>}
              {company.vat_number && <Row icon={<Hash className="w-3.5 h-3.5" />}>VAT {company.vat_number}</Row>}
            </div>
          )}

          {/* Quotes */}
          <div className="p-5 border-b border-hairline">
            <SectionTitle icon={<FileText className="h-4 w-4" />} count={quotes.length}>Quotes</SectionTitle>
            {quotes.length === 0 ? (
              <div className="text-xs text-muted-foreground">No quotes for this contact yet.</div>
            ) : (
              <div className="space-y-0.5">
                {quotes.map((q) => (
                  <a key={q.id} href={`/quotes/${q.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                    <FileText className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{q.quote_number || q.name || 'Quote'}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{money(q.grand_total, q.currency)}</span>
                    {q.status && <span className={`text-[10px] capitalize shrink-0 ${statusTone(q.status)}`}>{q.status}</span>}
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
                  <a key={p.id} href={`/projects/${p.id}`} className="flex items-center gap-2 text-sm py-1.5 px-2 -mx-2 rounded-sm hover:bg-surface-hover transition-colors">
                    <FolderKanban className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="flex-1 min-w-0 truncate">{p.name || 'Project'}</span>
                    {p.status && <span className={`text-[10px] capitalize shrink-0 ${statusTone(p.status)}`}>{p.status}</span>}
                    <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        /* Internal thread (or no linked contact): show participants + thread meta. */
        <div className="p-5 border-b border-hairline">
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
                  {p.thread_role === 'owner' && <span className="text-[10px] text-muted-foreground capitalize">owner</span>}
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
      <Separator className="bg-hairline" />
      <div className="p-5 space-y-2.5">
        <SectionTitle icon={<MessageSquare className="h-4 w-4" />}>Conversation</SectionTitle>
        {/* SOURCE is the door it came through; CHANNEL is the transport a reply goes out on.
            Both are printed because they are different questions and a public-profile enquiry
            answers them differently — it arrived from a profile page and replies by email. */}
        <div className="flex items-start gap-2.5 text-sm">
          <span className="text-muted-foreground mt-0.5 shrink-0"><MessagesSquare className="w-3.5 h-3.5" /></span>
          <span className="flex items-center gap-1.5 flex-wrap min-w-0">
            <SourceTag source={inboxThreadSource(thread)} />
            <span className="text-xs text-muted-foreground">replies by <span className="capitalize">{thread.channel}</span></span>
          </span>
        </div>
        <Row icon={<Hash className="w-3.5 h-3.5" />}><span className="capitalize">{thread.status}</span></Row>
        {/* The one thing a public-profile enquiry carries that no channel does: which services
            the visitor ticked. It used to be the only reason the separate profile inbox existed. */}
        {requestedServices.length > 0 && (
          <div className="pt-1 space-y-1.5">
            <div className="text-[11px] text-muted-foreground">Asked about</div>
            <div className="flex flex-wrap gap-1">
              {requestedServices.map((s) => (
                <Badge key={s} variant="neutral" className="text-[10px]">{s}</Badge>
              ))}
            </div>
          </div>
        )}
        <div className="text-[11px] text-muted-foreground pt-0.5">Started {formatDate(thread.created_at, { withTime: true })}</div>
      </div>
    </div>
      )}
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    inboxApi.getAgentSettings(workspaceId)
      .then((r) => { setSettings(r.settings); setCanEdit(r.can_edit); })
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
        <Button variant="outline" size="icon" className="h-9 w-9" title="AI assistant settings">
          <Settings2 className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="space-y-4">
          <div>
            <div className="text-sm font-medium">AI assistant</div>
            <div className="text-xs text-muted-foreground">
              Applies to every customer conversation in this workspace. Replies run on the full
              assistant and are metered per turn, like a chat in the Studio — a short answer costs
              a fraction of a researched one.
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
                  {/* Off by default and spelled out, because the cost of a wrong guess here is
                      paid by the CUSTOMER, not by the operator: the assistant writes to them
                      under the business's name and a sent message cannot be unsent. */}
                  <div className="text-xs text-muted-foreground">
                    The assistant answers first, on its own, on every new customer conversation —
                    including WhatsApp numbers and social DMs. Off unless you turn it on.
                  </div>
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
          <Separator className="bg-hairline" />
          <MyEmailAddressSection workspaceId={workspaceId} />
        </div>
      </PopoverContent>
    </Popover>
  );
};

/**
 * The user's own inbound email address (#342). Their address, not the workspace's — mail sent to it
 * lands in this workspace's Inbox as an `email` thread.
 *
 * Allocation is a deliberate click rather than something that happens on first render: the address
 * is a published identity you print on a business card, so it appears when the person asks for it.
 */
const MyEmailAddressSection: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<UserEmailAddress | null>(null);
  const [domain, setDomain] = useState('');
  const [copied, setCopied] = useState(false);
  // Set when the derived handle is already someone else's. Nothing is allocated in that case and
  // the person picks their own, rather than being handed `basilis.kanonidis2@`.
  const [conflict, setConflict] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');

  useEffect(() => {
    let alive = true;
    // Reading allocates. A member who opens the Inbox can receive mail immediately, without
    // first finding and pressing a button — the address only ever comes back null when the
    // derived handle collides with someone else's and this person has to pick their own.
    inboxApi.getMyEmailAddress(workspaceId)
      .then((r) => {
        if (!alive) return;
        setAddress(r.address);
        setDomain(r.domain);
        if (!r.address && r.conflict) {
          setConflict(r.conflict === 'invalid'
            ? 'We could not build an address from your name. Please choose one.'
            : 'That name is taken. Choose another.');
          if (r.suggested_local_part) setChosen(r.suggested_local_part);
        }
      })
      .catch(() => { /* the address surface is optional chrome — never block the popover on it */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [workspaceId]);

  const REJECTION: Record<string, string> = {
    plus: 'A plus sign is reserved — it is how replies find their conversation.',
    reserved: 'That name is reserved. Please pick another.',
    shape: 'Use letters, numbers, dots, dashes and underscores, starting and ending with a letter or number.',
    empty: 'Please type a name.',
  };

  const allocate = async (localPart?: string) => {
    setBusy(true);
    try {
      const r = await inboxApi.getMyEmailAddress(workspaceId, localPart);
      if (!r.address) {
        // A conflict is an answer, not an error: two people share a name, so this one chooses.
        setConflict(r.invalid_reason ? (REJECTION[r.invalid_reason] ?? 'That name cannot be used.')
          : 'That name is taken. Choose another.');
        if (!localPart && r.suggested_local_part) setChosen(r.suggested_local_part);
        return;
      }
      setAddress(r.address);
      setConflict(null);
      toast({ title: 'Your email address is ready', description: r.address.full_address });
    } catch (e) {
      toast({ title: 'Could not create an address', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const copy = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address.full_address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard is best-effort; the address is selectable either way */ }
  };

  const toggleAutoReply = async (v: boolean) => {
    if (!address) return;
    const prev = address;
    setAddress({ ...address, auto_reply_enabled: v });
    try {
      const r = await inboxApi.setEmailAddressSettings({ auto_reply_enabled: v });
      setAddress(r.address);
    } catch (e) {
      setAddress(prev);
      toast({ title: 'Failed to save', description: (e as Error).message, variant: 'destructive' });
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-3">
      <div>
        <div className="text-sm font-medium">Your email address</div>
        <div className="text-xs text-muted-foreground">
          Mail sent here arrives in this Inbox. Replies go out from the workspace and thread back
          automatically.
        </div>
      </div>

      {!address && !conflict ? (
        // Reaching here means the read failed outright — the allocation itself cannot leave the
        // address null without also setting a conflict.
        <div className="text-xs text-muted-foreground">
          Your address could not be loaded. Reopen this panel to try again.
        </div>
      ) : !address ? (
        <div className="space-y-2">
          <div className="text-xs text-destructive">{conflict}</div>
          <div className="flex items-center gap-1.5">
            <Input
              value={chosen}
              onChange={(e) => setChosen(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && chosen.trim()) allocate(chosen.trim()); }}
              placeholder="firstname.lastname"
              className="h-8 text-xs"
              autoFocus
            />
            <span className="text-xs text-muted-foreground shrink-0">@{domain}</span>
          </div>
          <Button
            size="sm" variant="outline" className="w-full"
            disabled={busy || !chosen.trim()}
            onClick={() => allocate(chosen.trim())}
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Use this address'}
          </Button>
        </div>
      ) : (
        <>
          <button
            type="button"
            onClick={copy}
            className="w-full flex items-center gap-2 text-xs rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2 hover:bg-surface-hover transition-colors"
            title="Copy to clipboard"
          >
            <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            <span className="flex-1 truncate text-left">{address.full_address}</span>
            {copied ? <Check className="w-3.5 h-3.5 text-success shrink-0" /> : <Link2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
          </button>
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-sm">Assistant answers email</Label>
              <div className="text-xs text-muted-foreground">
                Replies to mail sent here without waiting for you.
              </div>
            </div>
            <Switch checked={address.auto_reply_enabled} onCheckedChange={toggleAutoReply} />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Already have an address customers use? Forward it here instead of changing your MX.
          </p>
        </>
      )}
    </div>
  );
};

/** Sidebar label management (owner/admin): create, recolor, delete workspace labels. */
/** Shared workspace-label CRUD (create / recolor / delete) with busy state + toast-on-error, used by
 *  both the manage popover and the per-thread assign popover. Mutators return true on success so the
 *  caller can clear its input only when the write actually landed. */
function useLabelCrud(workspaceId: string, onChanged: () => void) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn: () => Promise<unknown>, failTitle: string): Promise<boolean> => {
    setBusy(true);
    try { await fn(); onChanged(); return true; }
    catch (e) { toast({ title: failTitle, description: (e as Error).message, variant: 'destructive' }); return false; }
    finally { setBusy(false); }
  }, [onChanged, toast]);
  const create = useCallback((name: string, color: string) => run(() => inboxApi.createLabel(workspaceId, name, color), 'Could not create label'), [run, workspaceId]);
  const recolor = useCallback((id: string, color: string) => run(() => inboxApi.updateLabel(id, { color }), 'Failed'), [run]);
  const remove = useCallback((id: string) => run(() => inboxApi.deleteLabel(id), 'Could not delete label'), [run]);
  return { busy, run, create, recolor, remove };
}

const LabelManagerPopover: React.FC<{
  workspaceId: string;
  labels: InboxLabel[];
  onChanged: () => void;
}> = ({ workspaceId, labels, onChanged }) => {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);
  const { busy, create: createLabel, recolor, remove } = useLabelCrud(workspaceId, onChanged);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await createLabel(name, newColor)) setNewName('');
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
            <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-hover group">
              <Popover>
                <PopoverTrigger asChild>
                  <button className={`w-3 h-3 rounded-full shrink-0 ${(LABEL_COLORS.find((c) => c.key === l.color) || LABEL_COLORS[0]).dot}`} title="Change color" aria-label="Change label colour" />
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <div className="flex items-center gap-1.5">
                    {LABEL_COLORS.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => recolor(l.id, c.key)}
                        title={c.label}
                        aria-label={`Colour: ${c.label}`}
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
                aria-label={`Colour: ${c.label}`}
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
            <Button size="sm" className="h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
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
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0].key);
  const assignedIds = useMemo(() => new Set(assigned.map((l) => l.id)), [assigned]);
  const { busy, run, create: createLabel, remove } = useLabelCrud(workspaceId, onChanged);

  const toggle = (labelId: string) => {
    const next = new Set(assignedIds);
    if (next.has(labelId)) next.delete(labelId); else next.add(labelId);
    return run(() => inboxApi.setThreadLabels(threadId, [...next]), 'Failed');
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await createLabel(name, newColor)) setNewName('');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9" title="Labels">
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
              <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-surface-hover group">
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
                  aria-label={`Colour: ${c.label}`}
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
              <Button size="sm" className="h-8 shrink-0" onClick={create} disabled={busy || !newName.trim()}>
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
        q = q.ilike(CRM_SEARCH_COLUMN, foldedLike(term));
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
              <DialogTitle>Share This Conversation</DialogTitle>
              <DialogDescription>
                This customer has no account yet. Send them this private link — they can read and reply with no login.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <Input readOnly value={shareUrl} className="text-sm" onFocus={(e) => e.currentTarget.select()} />
              <Button className="shrink-0" onClick={() => { navigator.clipboard.writeText(shareUrl); toast({ title: 'Link copied' }); }}>
                Copy
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Close</Button>
              <Button onClick={() => createdThreadId && onCreated(createdThreadId)}>Open conversation</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>New Conversation</DialogTitle>
              <DialogDescription>Start a private team chat, or reach out to a customer.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-muted/40">
              {modeBtn('team', 'Team')}
              {modeBtn('customer', 'Customer')}
            </div>

            {mode === 'team' ? (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-topic" className="text-xs text-muted-foreground">Topic</label>
                  <Input id="inboxpage-topic" placeholder="e.g. Follow up on the Andronikos quote" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1.5">Who's in this conversation?</div>
                  <div className="max-h-48 overflow-y-auto space-y-1 rounded-sm border border-hairline p-1.5">
                    {members.map((m) => (
                      <label key={m.user_id} className="flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-sm hover:bg-surface-hover cursor-pointer transition-colors">
                        <Checkbox checked={selected.includes(m.user_id)}
                          onCheckedChange={(v) => setSelected((prev) => v === true ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id))} />
                        <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(m.label)}`}>{initials(m.label)}</AvatarFallback></Avatar>
                        {m.label}
                      </label>
                    ))}
                    {members.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No other team members in this workspace yet.</div>}
                  </div>
                  {selected.length === 0 && <p className="text-[11px] text-muted-foreground mt-1.5">Pick at least one teammate to start the conversation with.</p>}
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={createTeam} disabled={busy || selected.length === 0}>
                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Start conversation'}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-customer" className="text-xs text-muted-foreground">Customer</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                    <Input id="inboxpage-customer" placeholder="Search contacts by name or email" value={contactQuery} onChange={(e) => { setContactQuery(e.target.value); setContactId(null); }} className="pl-9" />
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-0.5 rounded-sm border border-hairline p-1.5">
                    {contacts.map((ct) => (
                      <button
                        key={ct.id}
                        onClick={() => setContactId(ct.id)}
                        className={`w-full flex items-center gap-2.5 text-sm px-2 py-1.5 rounded-lg transition-colors text-left ${contactId === ct.id ? 'bg-primary/15 text-primary' : 'hover:bg-surface-hover'}`}
                      >
                        <Avatar className="h-7 w-7"><AvatarFallback className={`text-[10px] ${avatarTint(ct.label)}`}>{initials(ct.label)}</AvatarFallback></Avatar>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{ct.label}</span>
                          {ct.email && <span className="block text-[11px] text-muted-foreground truncate">{ct.email}</span>}
                        </span>
                        {ct.hasAccount
                          ? <span className="inline-flex items-center text-[10px] shrink-0 text-muted-foreground"><BadgeCheck className="w-2.5 h-2.5 mr-0.5" />Account</span>
                          : <span className="text-[10px] shrink-0 text-muted-foreground">Link</span>}
                        {contactId === ct.id && <Check className="w-4 h-4 shrink-0" />}
                      </button>
                    ))}
                    {contacts.length === 0 && <div className="text-xs text-muted-foreground px-2 py-2">No contacts found.</div>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-subject-optional" className="text-xs text-muted-foreground">Subject (optional)</label>
                  <Input id="inboxpage-subject-optional" placeholder="What's this about?" value={custSubject} onChange={(e) => setCustSubject(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label htmlFor="inboxpage-first-message-optional" className="text-xs text-muted-foreground">First message (optional)</label>
                  <Textarea id="inboxpage-first-message-optional" placeholder="Write the first message to the customer…" value={custMessage} onChange={(e) => setCustMessage(e.target.value)} className="min-h-[72px] resize-none" />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Contacts with an account see this in their inbox. For others you'll get a private link to send them.
                </p>
                <DialogFooter>
                  <Button variant="outline" onClick={onClose}>Cancel</Button>
                  <Button onClick={createCustomer} disabled={busy || !contactId}>
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
          <DialogTitle>Add a Teammate</DialogTitle>
          <DialogDescription>They'll be able to read this conversation and reply to the customer.</DialogDescription>
        </DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {members.map((m) => (
            <button key={m.user_id} onClick={() => add(m.user_id)} disabled={!!busy}
              className="w-full flex items-center gap-2.5 text-sm px-2 py-2 rounded-sm hover:bg-surface-hover transition-colors">
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
