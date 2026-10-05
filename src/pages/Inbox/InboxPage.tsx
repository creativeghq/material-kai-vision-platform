import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Inbox as InboxIcon, Send, Plus, Loader2, MessageSquare, Paperclip, StickyNote, UserPlus, X, Bot, Search, Mail, Tag, Globe, User as UserIcon, MessagesSquare, ArrowLeft, CheckCircle2, Reply, Archive, ArchiveRestore, Trash2, Sparkles, Link2, Pin, CalendarClock, Clock, ShoppingCart, AlertTriangle, Package, Wrench } from 'lucide-react';
import { INBOX_CARD_MAX, type InboxCardKind } from '@/modules/messaging/inboxCardKinds';
import { supabase } from '@/integrations/supabase/client';
import { marketplaceService } from '@/services/marketplaceService';
import { messagingService } from '@/modules/messaging/services/messagingService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { castSlotFor, nameGender } from '@/utils/characterAvatar';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Sheet, SheetContent, SheetTitle } from '@/components/core/ui/sheet';
import { Label } from '@/components/core/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { FilterBar, scopedFilterValue, useFilters } from '@/components/core/filters';
import { buildInboxFilters } from './inboxFilters';
import { slashCommandMatches, slashTokenAtCaret } from './inboxSlashCommands';
import { channelForSource, inboxSourceKey, inboxSourceMeta, inboxThreadSource, SOURCE_FILTER_ORDER, type InboxSourceKey } from './inboxSource';
import { formatDate, formatTime } from '@/utils/datetime';
import { inboxApi, signInboxAttachment, type InboxThread, type InboxMessage, type InboxParticipant, type WhatsAppWindow, type InboxThreadContext, type InboxLabel, type InboxThreadStatus, type InboxCatalogItem } from '@/services/inboxApi';
import { askJarvisAboutThreadPrompt, avatarTint, dayBucket, initials, labelDot, timeAgo } from './inboxFormat';
import { LabelChips, MobileChip, NavRow, ParticipantLabel, SidebarHeading, SourceTag, SourceWord, ThreadAvatar } from './components/InboxPrimitives';
import { ForwardDialog, MessageBubble } from './components/MessageBubble';
import { CatalogPicker, EmojiPicker, SlashCommandMenu } from './components/ComposerPickers';
import { DetailsRail } from './components/DetailsRail';
import { InboxAgentSettingsButton } from './components/InboxAgentSettings';
import { LabelAssignButton, LabelManagerPopover } from './components/InboxLabels';
import { FollowUpButton } from './components/FollowUpButton';
import { NewThreadDialog } from './components/NewThreadDialog';
import { AddParticipantDialog } from './components/AddParticipantDialog';

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
  /** MY starred messages on the open thread. Personal — resolved for the caller by get_thread. */
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  /** The message being forwarded, while the destination is being chosen. */
  const [forwarding, setForwarding] = useState<InboxMessage | null>(null);
  const [canManageLabels, setCanManageLabels] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('thread'));

  // One bag for every secondary dimension. `label` is a request parameter on listThreads
  // (server-applied) and `source` is half of one — it narrows the request to that source's
  // channel and then separates same-channel sources client-side. The rest are matched
  // client-side against the loaded page. Assignee options come off the loaded threads, so the
  // group def depends on them too.
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
  /** Focused after "Add text to note" fills the box — the point is to type the thought next. */
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  /** The message being answered. WhatsApp renders it as the quoted block above our reply. */
  const [replyTo, setReplyTo] = useState<InboxMessage | null>(null);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [aiDraftShown, setAiDraftShown] = useState(false);
  /** The member's steer for "Draft with AI" — what the reply should offer or say. Optional. */
  const [draftSteer, setDraftSteer] = useState('');
  const [draftSteerOpen, setDraftSteerOpen] = useState(false);
  /** Catalog cards queued for the next send — picked through `/product` or `/service`. */
  const [pendingCards, setPendingCards] = useState<InboxCatalogItem[]>([]);
  /**
   * The composer's slash menu: the command list while `/…` is being typed at the start of a line,
   * or the catalog picker once a command (or the toolbar button) chose a kind.
   */
  const [slashMenu, setSlashMenu] = useState<
    null
    | { mode: 'commands'; query: string; start: number; end: number }
    | { mode: 'picker'; kind: InboxCardKind }
  >(null);
  /**
   * One token per composer send, minted on the first attempt and kept across a failure. A
   * message with cards is several WhatsApp sends; if one fails after others went, the retry
   * carries the same token and inbox-api resumes the missing parts instead of storing a second
   * message and delivering the first parts twice.
   */
  const sendToken = useRef<string | null>(null);

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

  /**
   * `/inbox?thread=…&say=…` seeds the composer and sends NOTHING.
   *
   * How a quote or a pay link reaches a customer on the channel they actually use. Sending it
   * from the finance screen would be posting to a customer from a surface with no sight of the
   * conversation or Meta's 24-hour window; this puts the operator in the thread with the text
   * ready, which is where both of those are already handled.
   */
  useEffect(() => {
    const say = searchParams.get('say');
    if (!say) return;
    setDraft(say.slice(0, 4000));
    setIsNote(false);
    const p = new URLSearchParams(searchParams);
    p.delete('say');
    setSearchParams(p, { replace: true });
  }, [searchParams, setSearchParams]);
  /** True while a send is in flight. See `send` — a ref, because the state read is stale there. */
  const sendInFlight = useRef(false);
  const isMobile = useIsMobile();

  // Mobile drill-in: return from the open conversation to the thread list.
  const backToList = useCallback(() => {
    setActiveId(null);
    setActiveThread(null);
    setMessages([]);
    setShowDetails(false);
    setPendingCards([]);
    setSlashMenu(null);
    setDraftSteer('');
    sendToken.current = null;
    setSearchParams((p) => { p.delete('thread'); return p; }, { replace: true });
  }, [setSearchParams]);

  useEffect(() => { supabase.auth.getUser().then(({ data }) => setMyUserId(data.user?.id ?? null)); }, []);

  // Members (business roles + operator) get the full controls; an outsider gets read/reply only.
  const isMember = useMemo(
    () => isPlatformOperator || persona !== 'guest',
    [isPlatformOperator, persona],
  );

  const waBlocked = activeThread?.channel === 'whatsapp' && !!waWindow && !waWindow.open && !isNote;

  /**
   * `silent` is the difference between "the operator asked for a different list" and "something
   * happened in the background", and it is not cosmetic.
   */
  const loadThreads = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingThreads(true);
    try {
      const { threads } = await inboxApi.listThreads({
        ...(channelFilter ? { channel: channelFilter } : {}),
        ...(allWorkspaces && isPlatformOperator ? { scope: 'all' as const } : {}),
        ...(showArchived ? { archived: true } : {}),
        ...(labelFilter ? { label_id: labelFilter } : {}),
      });
      setThreads(threads);
    } catch (e) {
      // A background refresh that fails says nothing: the rows on screen are still the last
      // good answer, and a toast per dropped socket event would be its own kind of blink.
      if (!opts?.silent) {
        toast({ title: 'Could not load inbox', description: (e as Error).message, variant: 'destructive' });
      }
    } finally {
      if (!opts?.silent) setLoadingThreads(false);
    }
  }, [channelFilter, allWorkspaces, isPlatformOperator, showArchived, labelFilter, toast]);

  useEffect(() => { void loadThreads(); }, [loadThreads]);

  /** Go and get the profile photos, once, when some thread is missing one. */
  const avatarSyncDone = useRef(false);
  useEffect(() => {
    if (avatarSyncDone.current || !activeWorkspaceId || !threads.length) return;
    const missing = threads.some((t) => {
      if (t.channel !== 'whatsapp') return false;
      const wa = ((t.metadata as Record<string, unknown> | undefined)?.wa_profile ?? null) as
        Record<string, unknown> | null;
      return !wa || typeof wa.avatar_path !== 'string';
    });
    if (!missing) return;
    avatarSyncDone.current = true;
    void messagingService.syncAvatars(activeWorkspaceId)
      // Reload only when something actually landed — a no-op refresh on every inbox open is
      // a wasted round trip and a visible flicker for nothing.
      .then((r) => { if (r.stored > 0) loadThreads({ silent: true }); })
      // Never a toast: a photo failing must not interrupt reading messages. But not swallowed
      // either — a silent catch here is how "the avatars do not work" becomes unanswerable.
      .catch((e) => console.warn('[inbox] profile photo sync failed:', (e as Error).message));
  }, [threads, activeWorkspaceId, loadThreads]);

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
    // The composer's queued cards, slash menu, AI steer and send token belong to the thread they
    // were started on — carried over, three products picked for one customer go to the next.
    setPendingCards([]);
    setSlashMenu(null);
    setDraftSteer('');
    setDraftSteerOpen(false);
    sendToken.current = null;
    try {
      const { thread, participants, messages, whatsapp_window, starred_message_ids } = await inboxApi.getThread(id);
      setActiveThread(thread);
      setParticipants(participants);
      setMessages(messages);
      setWaWindow(whatsapp_window);
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));

      // A reply the assistant wrote while nobody was looking. Only when it still answers the
      // customer's LATEST message — `agent_draft_is_current` is derived server-side against the
      // same definition the draft cron claims on. A stale draft answers the previous question,
      // and it is a perfectly valid string, so the only safe thing to do with one is leave it
      // out of the composer.
      if (thread.agent_draft && thread.agent_draft_is_current) {
        setDraft(thread.agent_draft);
        setIsNote(false);
        setAiDraftShown(true);
      }

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
      const profMap: Record<string, { full_name?: string; email?: string; avatar_url?: string }> = {};
      if (memberIds.length) {
        const profs = await fetchDisplayProfiles(memberIds);
        for (const prof of profs) {
          profMap[prof.userId] = {
            full_name: prof.fullName ?? undefined,
            email: prof.email ?? undefined,
            avatar_url: prof.avatarUrl ?? undefined,
          };
        }
      }
      /** OUR side's photo. */
      let channelAvatarUrl: string | null = null;
      const threadChannelId = (thread.metadata as Record<string, unknown> | undefined)?.channel_id;
      if (typeof threadChannelId === 'string' && threadChannelId) {
        const { data: chan } = await supabase
          .from('messaging_channels').select('config').eq('id', threadChannelId).maybeSingle();
        const cfg = ((chan as { config?: Record<string, unknown> } | null)?.config ?? {}) as Record<string, unknown>;
        if (typeof cfg.avatar_bucket === 'string' && typeof cfg.avatar_path === 'string') {
          channelAvatarUrl = await signInboxAttachment({
            storage_bucket: cfg.avatar_bucket, storage_object_path: cfg.avatar_path,
          }).catch(() => null);
        }
      }

      setStarredIds(new Set(starred_message_ids || []));

      const customerName = ctx?.contact?.name || thread.subject || 'Customer';
      const next = new Map<string, ParticipantLabel>();
      for (const p of participants) {
        if (p.participant_type === 'member') {
          const isMe = p.user_id && p.user_id === myUserId;
          const prof = p.user_id ? profMap[p.user_id] : undefined;
          next.set(p.id, {
            // Their NAME, not "You". A shared inbox is read by the whole team, and a
            // transcript that says "You" answers a different question for every reader —
            // the one thing it never tells anyone is which colleague replied.
            label: prof?.full_name || prof?.email || (isMe ? 'You' : 'Team member'),
            kind: 'member', userId: p.user_id, avatarUrl: prof?.avatar_url ?? channelAvatarUrl,
            // Resolved here rather than server-side, and it is not the exception it looks like:
            // a member's name has exactly ONE source — `user_profiles.full_name`, read in this
            // one place — so there is no second string for a second screen to disagree with. A
            // customer's does not, which is why theirs arrives as a number.
            avatarSlot: castSlotFor(p.id, nameGender(prof?.full_name)),
          });
        } else if (p.participant_type === 'customer') {
          // Server-derived — see `InboxParticipant.avatar_slot`. Never re-answered from
          // `customerName`: the header reads `thread.subject` and this reads the CRM name, and
          // the day those two disagree about a name is the day one person gets two faces.
          next.set(p.id, {
            label: customerName, kind: 'customer', userId: p.user_id,
            avatarSlot: p.avatar_slot ?? null,
          });
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

  /**
   * Per-message moods for the OPEN thread, from the cached conversation reading.
   *
   * Read straight off the thread rather than fetched: the analysis already stored it, and a
   * second request for something we hold would be a round trip per thread open.
   */
  const messageMoods = useMemo(() => {
    const sentiment = ((activeThread?.metadata as Record<string, unknown> | undefined)?.sentiment ?? null) as
      Record<string, unknown> | null;
    const map = sentiment?.message_moods;
    return (map && typeof map === 'object' ? map : {}) as Record<string, string>;
  }, [activeThread]);

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_threads' },
          () => loadThreads({ silent: true }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadThreads]);

  /** Opening a conversation lands at the BOTTOM. Every time, without animating there. */
  const listRef = useRef<HTMLDivElement>(null);
  /** False once the reader scrolls up deliberately — see the handler below. */
  const stickToBottom = useRef(true);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }, []);

  // Opening a thread: jump, and hold the bottom while attachments finish laying out. An image
  // that decodes 300ms later would otherwise push the last message back off screen.
  useEffect(() => {
    if (!activeId || loadingThread) return;
    stickToBottom.current = true;
    scrollToBottom(false);
    // Twice more across paint, for content that sizes after the first frame.
    const r1 = requestAnimationFrame(() => scrollToBottom(false));
    const t1 = setTimeout(() => scrollToBottom(false), 120);

    const el = listRef.current;
    if (!el) return () => { cancelAnimationFrame(r1); clearTimeout(t1); };
    // Media has no single "done" event we can await, and each attachment signs its URL
    // separately, so the pane keeps growing for a while. Watch the box instead of guessing.
    const ro = new ResizeObserver(() => { if (stickToBottom.current) scrollToBottom(false); });
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    const stop = setTimeout(() => ro.disconnect(), 4000);
    return () => { cancelAnimationFrame(r1); clearTimeout(t1); clearTimeout(stop); ro.disconnect(); };
  }, [activeId, loadingThread, scrollToBottom]);

  // A new message in an already-open thread: follow it, but only if the reader is still at the
  // bottom. Yanking someone out of the history they are reading is worse than a missed message,
  // and they can see there is a new one.
  useEffect(() => {
    if (stickToBottom.current) scrollToBottom(true);
  }, [messages, scrollToBottom]);

  const send = useCallback(async () => {
    if (!activeId || (!draft.trim() && !attachment && pendingCards.length === 0)) return;
    // Re-entrancy guard, on a ref rather than the `sending` state.
    if (sendInFlight.current) return;
    sendInFlight.current = true;
    setSending(true);
    if (!sendToken.current) sendToken.current = crypto.randomUUID();
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
        // A private note quotes nothing on the platform — there is no platform message to quote.
        reply_to_message_id: !isNote && replyTo ? replyTo.id : undefined,
        // Picks only. The card the customer sees — price included — is resolved by inbox-api.
        cards: !isNote && pendingCards.length ? pendingCards.map((c) => ({ kind: c.kind, product_id: c.product_id })) : undefined,
        client_token: sendToken.current ?? undefined,
      });
      sendToken.current = null;
      setDraft('');
      setAttachment(null);
      setPendingCards([]);
      setSlashMenu(null);
      setReplyTo(null);
      setAiDraftShown(false);
      // Human takeover: a member's text reply pauses the assistant server-side — reflect it locally.
      if (!isNote && isMember && activeThread?.agent_state === 'active') {
        setActiveThread((t) => (t ? { ...t, agent_state: 'paused' } : t));
      }
    } catch (e) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      sendInFlight.current = false;
      setSending(false);
    }
  }, [activeId, draft, attachment, pendingCards, isNote, isMember, activeThread, replyTo, toast]);

  // "Help me write" — the assistant drafts the next reply into the composer for review/edit/send.
  // The steer, when the member typed one, tells it WHAT the reply should do.
  const aiSuggest = useCallback(async () => {
    if (!activeId) return;
    setAiDrafting(true);
    setDraftSteerOpen(false);
    try {
      const { draft: suggestion } = await inboxApi.suggestReply(activeId, draftSteer);
      setDraft(suggestion);
      setIsNote(false);
      setAiDraftShown(true);
    } catch (e) {
      toast({ title: 'Could not draft a reply', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setAiDrafting(false);
    }
  }, [activeId, draftSteer, toast]);

  /**
   * `/product` chosen (by Enter, Tab or click): drop exactly the token that opened the menu —
   * wherever in the draft it was typed — and open the picker.
   */
  const chooseSlashCommand = useCallback((kind: InboxCardKind) => {
    setSlashMenu((menu) => {
      if (menu?.mode === 'commands') {
        const { start, end } = menu;
        setDraft((d) => d.slice(0, start) + d.slice(end));
      }
      return { mode: 'picker', kind };
    });
  }, []);

  const togglePendingCard = useCallback((item: InboxCatalogItem) => {
    setPendingCards((cur) => {
      if (cur.some((c) => c.product_id === item.product_id)) return cur.filter((c) => c.product_id !== item.product_id);
      if (cur.length >= INBOX_CARD_MAX) return cur;
      return [...cur, item];
    });
  }, []);

  /*
   * The five things you can do TO one message, beyond replying to it.
   *
   * All five re-open the thread rather than patching a message in place. A pin, a star and a
   * removal each change what the transcript should render, and re-reading is one request against
   * a screen the operator is already looking at — where a hand-maintained local copy is how a
   * pinned banner ends up disagreeing with the message it names.
   */
  const togglePin = useCallback(async (m: InboxMessage, pinned: boolean) => {
    if (!activeId) return;
    try {
      await inboxApi.pinMessage(activeId, m.id, pinned);
      void openThread(activeId);
    } catch (e) { toast({ title: 'Could not pin', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeId, openThread, toast]);

  const toggleStar = useCallback(async (m: InboxMessage, starred: boolean) => {
    if (!activeId) return;
    // Optimistic, and only here: a star is mine alone, so there is no other reader to disagree
    // with, and a bookmark that waits for a round trip feels broken.
    setStarredIds((prev) => {
      const next = new Set(prev);
      if (starred) next.add(m.id); else next.delete(m.id);
      return next;
    });
    try {
      await inboxApi.starMessage(activeId, m.id, starred);
    } catch (e) {
      setStarredIds((prev) => {
        const next = new Set(prev);
        if (starred) next.delete(m.id); else next.add(m.id);
        return next;
      });
      toast({ title: 'Could not star', description: (e as Error).message, variant: 'destructive' });
    }
  }, [activeId, toast]);

  const deleteMessage = useCallback(async (m: InboxMessage) => {
    if (!activeId) return;
    try {
      await inboxApi.deleteMessage(activeId, m.id);
      // Said plainly, because the obvious reading of "removed" is the wrong one: the customer
      // still has it. WhatsApp gives us no unsend, and an operator who thinks they retracted
      // something they did not will act on that belief.
      toast({
        title: 'Removed from this inbox',
        description: 'It stays on the recipient\'s phone — WhatsApp gives us no way to unsend it.',
      });
      void openThread(activeId);
    } catch (e) { toast({ title: 'Could not remove', description: (e as Error).message, variant: 'destructive' }); }
  }, [activeId, openThread, toast]);

  /*
   * "Add text to note" — the message, quoted into a private note in the composer.
   *
   * It fills the box rather than writing the note, because the point of pulling a customer's
   * words into a note is to say something ABOUT them. Posting the quote on its own would leave
   * the operator with a note nobody needed and the thought still untyped.
   */
  const addToNote = useCallback((m: InboxMessage) => {
    if (!m.body) return;
    const quoted = m.body.split('\n').map((line) => `> ${line}`).join('\n');
    setIsNote(true);
    setDraft((d) => (d ? `${quoted}\n\n${d}` : `${quoted}\n\n`));
    composerRef.current?.focus();
  }, []);

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

  /*
   * The most recently pinned message, for the banner above the transcript.
   *
   * The LATEST rather than a list: a pin means "read this first", and a stack of six of them is
   * a second inbox. Older pins keep their marker on the message itself, so nothing is lost —
   * the banner is the one the team was asked to look at most recently.
   */
  const pinnedMessage = useMemo(() => {
    const pinned = messages
      .filter((m) => {
        const at = (m.metadata as Record<string, unknown> | undefined)?.pinned_at;
        return typeof at === 'string' && !!at;
      })
      .sort((a, b) => String((b.metadata as Record<string, unknown>).pinned_at)
        .localeCompare(String((a.metadata as Record<string, unknown>).pinned_at)));
    return pinned[0] ?? null;
  }, [messages]);

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
      {/* Three settings, cycled in order of how much the assistant is trusted with: nothing,
          draft-for-review, answer-directly. `suggesting` is the one that was documented and never
          built — without it the only way to get help was to open each thread and press Draft. */}
      <Button
        variant={activeThread.agent_state === 'active' ? 'default'
          : activeThread.agent_state === 'suggesting' ? 'secondary' : 'outline'}
        size="icon" className="h-9 w-9"
        title={
          activeThread.agent_state === 'active'
            ? 'The AI answers this conversation directly — click to stop it entirely'
            : activeThread.agent_state === 'suggesting'
              ? 'The AI drafts replies here for you to review — click to let it answer directly'
              : activeThread.agent_state === 'paused'
                ? 'You took over — click to have the AI draft replies for you again'
                : 'Have the AI draft replies here for you to review before sending'
        }
        onClick={async () => {
          const next = activeThread.agent_state === 'suggesting' ? 'active'
            : activeThread.agent_state === 'active' ? 'off' : 'suggesting';
          try {
            await inboxApi.setAgent(activeThread.id, next);
            setActiveThread({ ...activeThread, agent_state: next });
            toast({
              title: next === 'off' ? 'Assistant off for this conversation'
                : next === 'suggesting' ? 'The AI will draft replies here'
                  : 'The AI will answer this conversation directly',
              description: next === 'suggesting'
                ? 'You will find a reply waiting to edit and send. Nothing goes out without you.'
                : next === 'active'
                  ? 'Replies are sent to the customer without review.'
                  : undefined,
            });
          } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
        }}
      >
        <Bot className="w-4 h-4" />
      </Button>
      <InboxAgentSettingsButton workspaceId={activeThread.workspace_id} />
      {/* JARVIS reads the thread itself (manage_inbox action:"read" — transcript + the customer's
          orders, quotes and open invoices), so the prompt names the conversation and nothing
          else. Sent as a real operator turn in the Agent Hub, not as a customer-audience draft. */}
      <Button variant="outline" size="icon" className="h-9 w-9" title="Ask JARVIS about this conversation" asChild>
        <a href={`/agent-hub?agent=kai&prompt=${encodeURIComponent(askJarvisAboutThreadPrompt(activeThread))}`}>
          <Sparkles className="w-4 h-4" />
        </a>
      </Button>
      <LabelAssignButton
        workspaceId={activeThread.workspace_id}
        threadId={activeThread.id}
        labels={wsLabels}
        assigned={activeThreadLabels}
        canManage={canManageLabels}
        onChanged={() => { loadThreads(); loadLabels(); }}
      />
      <FollowUpButton
        thread={activeThread}
        onChanged={() => { void openThread(activeThread.id); loadThreads({ silent: true }); }}
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
        {/* The words the TABS use, because they are the same three values and a control that
            names them differently from the thing you filter by is two vocabularies for one
            enum. "Snoozed" also promised something that did not exist until follow-ups had a
            date: a thread that comes back on its own. */}
        <option value="open">Open</option>
        <option value="snoozed">Follow-up</option>
        <option value="closed">Done</option>
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
                canManageLabels && activeWorkspaceId ? (
                  <LabelManagerPopover
                    workspaceId={activeWorkspaceId}
                    labels={wsLabels}
                    onChanged={() => { loadLabels(); loadThreads({ silent: true }); }}
                    trigger={(
                      <button
                        type="button"
                        className="w-full flex items-center gap-1.5 px-2.5 py-2 rounded-sm text-[11px]
                                   text-muted-foreground hover:bg-surface-hover hover:text-foreground text-left"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        Create your first label
                      </button>
                    )}
                  />
                ) : (
                  <div className="text-[11px] text-muted-foreground px-2.5 py-2">
                    No labels yet. Ask a workspace owner or admin to create some.
                  </div>
                )
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
                        <ThreadAvatar thread={t} name={name} className="h-9 w-9" showMood />
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
                          {/* Same reasoning as the order badge below: "the customer spoke last and
                              nobody answered" is a JOB, not a description, and it was invisible
                              from the list — `unread` only says whether anyone LOOKED. That is how
                              33 conversations reached a week without a reply while the mailbox
                              showed 67 identically-open threads. The age is measured from the
                              FIRST unanswered message, so it is how long they have really waited. */}
                          {t.waiting_on === 'us' && (
                            <Badge variant="warning" className="text-[10px] py-0">
                              <Clock className="w-2.5 h-2.5" />
                              Waiting {timeAgo(t.waiting_since || t.last_message_at)}
                              {(t.unanswered_count ?? 0) > 1 ? ` · ${t.unanswered_count} msgs` : ''}
                            </Badge>
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
                  <ThreadAvatar
                    thread={activeThread}
                    name={threadDisplayName(activeThread)}
                    className="h-10 w-10"
                    fallbackClassName={`text-sm ${avatarTint(threadDisplayName(activeThread))}`}
                    showMood
                  />
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

              {activeThread.follow_up_at && !activeThread.follow_up_fired_at && (
                /* Above the scroller, like the pin: a follow-up you cannot see is the shelf
                   this feature exists to replace. It states the three things that decide what
                   to do — when, what you wrote to your future self, and whether a message is
                   going out on its own. */
                <div className="shrink-0 flex items-start gap-2 px-4 py-2 border-b border-hairline
                                bg-[hsl(var(--warning-bg))] text-warning">
                  <CalendarClock className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="font-medium">
                      Following up {formatDate(activeThread.follow_up_at)} at {formatTime(activeThread.follow_up_at)}
                      {activeThread.follow_up_message ? ' — sending automatically' : ''}
                    </div>
                    {activeThread.follow_up_note && (
                      <div className="opacity-90 truncate">{activeThread.follow_up_note}</div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="text-xs underline underline-offset-2 shrink-0"
                    onClick={async () => {
                      try {
                        await inboxApi.clearFollowUp(activeThread.id);
                        void openThread(activeThread.id);
                        loadThreads({ silent: true });
                      } catch (e) {
                        toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' });
                      }
                    }}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {activeThread.follow_up_error && (
                /* The chase did NOT go out. Louder than the banner above and kept until the
                   next follow-up is set, because the operator now has to do by hand the thing
                   they scheduled — and the commonest reason (Meta's 24h window) is fixable
                   only by them. */
                <div className="shrink-0 flex items-start gap-2 px-4 py-2 border-b border-hairline
                                bg-destructive/10 text-destructive text-xs">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">
                    Your follow-up message was not sent — {activeThread.follow_up_error}
                  </span>
                </div>
              )}
              {pinnedMessage && (
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`inbox-msg-${pinnedMessage.id}`);
                    const box = listRef.current;
                    if (!el || !box) return;
                    // Measured rather than `scrollIntoView`, which this file bars: the
                    // open-at-the-bottom fix exists because a `scrollIntoView` keyed on
                    // `messages` fought the initial scroll, and keeping the API out is what
                    // stops that shape returning. Deltas of two rects need no positioned
                    // ancestor and no assumption about layout.
                    const delta = el.getBoundingClientRect().top - box.getBoundingClientRect().top;
                    box.scrollTop += delta - 24;
                    // Reading it counts as reading it: the operator has left the bottom
                    // deliberately, and auto-scroll must not yank them back on the next message.
                    stickToBottom.current = false;
                  }}
                  className="shrink-0 w-full text-left flex items-start gap-2 px-4 py-2
                             border-b border-hairline bg-surface-sunken hover:bg-surface-hover
                             transition-colors"
                  title="Jump to the pinned message"
                >
                  <Pin className="w-3.5 h-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                      Pinned
                    </span>
                    <span className="block text-xs truncate">
                      {pinnedMessage.body
                        || (pinnedMessage.attachments?.length ? 'Attachment' : 'Message')}
                    </span>
                  </span>
                </button>
              )}

              <div
                ref={listRef}
                className="flex-1 overflow-y-auto p-4 space-y-3"
                onScroll={(e) => {
                  // "Near enough" rather than exact: a fractional scrollHeight (any zoom level,
                  // any sub-pixel row height) never satisfies an equality check, so an exact
                  // test would decide the reader had scrolled up while they sat at the bottom.
                  const el = e.currentTarget;
                  stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                }}
              >
                {loadingThread ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : messages.map((m) => (
                  <MessageBubble
                    key={m.id} m={m}
                    info={m.sender_participant_id ? labels.get(m.sender_participant_id) : undefined}
                    myUserId={myUserId}
                    // Keyed by message id, resolved server-side from the model's indices — the
                    // client never re-derives that mapping, because an off-by-one here paints the
                    // wrong bubble, which looks like a working feature giving a wrong answer.
                    mood={messageMoods[m.id]}
                    isCustomerThread={activeThread.thread_type !== 'internal'}
                    workspaceId={activeThread.workspace_id}
                    onAttachmentsRepaired={() => { void openThread(activeThread.id); }}
                    onReplyTo={(msg) => setReplyTo(msg)}
                    onReact={async (msg, emoji) => {
                      try {
                        await inboxApi.reactMessage(activeThread.id, msg.id, emoji);
                        void openThread(activeThread.id);
                      } catch (e) {
                        toast({ title: 'Could not react', description: (e as Error).message, variant: 'destructive' });
                      }
                    }}
                    onPrivateReply={isCommentThread && isMember ? handlePrivateReply : undefined}
                    onToggleHidden={isCommentThread && isMember ? handleToggleHidden : undefined}
                    // Member-only, all of them except the star: forwarding writes into another
                    // conversation, pinning and removing change what the whole team sees. A star
                    // is nobody else's business, so a customer on a shared thread keeps it.
                    onForward={isMember ? (msg) => setForwarding(msg) : undefined}
                    onTogglePin={isMember ? togglePin : undefined}
                    onToggleStar={toggleStar}
                    starred={starredIds.has(m.id)}
                    onAddToNote={isMember ? addToNote : undefined}
                    onDelete={isMember ? deleteMessage : undefined}
                  />
                ))}
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
                    {/*
                      * SAY WHAT THIS IS BASED ON, AND WHAT STILL WORKS.
                      * The old copy asserted "the 24-hour reply window has closed" and stopped
                      * there. The operator who reported this had sent a message from their
                      * handset twenty minutes earlier and watched it get read, so the banner read
                      * as flatly false — and the reason it is not is an asymmetry nothing on
                      * screen mentioned.
                      */}
                    {waWindow.last_inbound_at ? (
                      <>
                        WhatsApp 24-hour reply window has closed — this customer last wrote on{' '}
                        {formatDate(waWindow.last_inbound_at)} at {formatTime(waWindow.last_inbound_at)}.
                        Only a message from THEM re-opens it: your own replies do not, including
                        the ones you send from your phone.
                      </>
                    ) : waWindow.source === 'unknown' ? (
                      <>
                        We could not check when this customer last wrote, so freeform replies are
                        blocked until we can. Try again in a moment.
                      </>
                    ) : (
                      <>
                        This customer has never written to us on WhatsApp, so no 24-hour reply
                        window has opened.
                      </>
                    )}{' '}
                    Meta blocks freeform replies sent from here — an approved template is required
                    to {waWindow.last_inbound_at ? 're-open' : 'open'} the conversation.{' '}
                    <strong>You can still message them from the WhatsApp Business app on your
                    phone</strong>, which is not subject to this window; it will sync back into
                    this thread. (Internal notes are still allowed.)
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
                        // A private note relays nowhere, so it carries no cards for a customer.
                        onClick={() => { setIsNote(true); setPendingCards([]); setSlashMenu(null); }}
                        aria-pressed={isNote}
                        className={`inline-flex items-center gap-1 text-xs px-2.5 py-1.5 border-l border-hairline transition-colors ${isNote ? 'bg-[hsl(var(--warning-bg))] text-warning' : 'text-muted-foreground hover:bg-surface-hover'}`}
                      >
                        <StickyNote className="w-3 h-3" /> Private note
                      </button>
                    </div>
                    {!isNote && (
                      <Popover open={draftSteerOpen} onOpenChange={setDraftSteerOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant="secondary" size="sm"
                            disabled={aiDrafting || waBlocked}
                            title="Let the assistant draft a reply you can edit before sending (1 credit)"
                            className="ml-auto h-8"
                          >
                            {aiDrafting ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1.5" />} Draft with AI
                          </Button>
                        </PopoverTrigger>
                        {/* The steer is optional: Draft with nothing typed is the old one-click
                            behaviour. With one, the assistant is told what the reply should DO —
                            "offer the oak decking", "say it ships Monday" — which it otherwise
                            cannot know from the transcript alone. */}
                        <PopoverContent align="end" className="w-80 p-3 space-y-2">
                          <Label htmlFor="inbox-draft-steer" className="text-xs">What should the reply do? (optional)</Label>
                          <Textarea
                            id="inbox-draft-steer"
                            value={draftSteer}
                            maxLength={1000}
                            onChange={(e) => setDraftSteer(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void aiSuggest(); } }}
                            placeholder="e.g. Offer the oak decking at the price on file and say we can deliver next week."
                            className="min-h-[72px] text-sm bg-card"
                            autoFocus
                          />
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] text-muted-foreground">You review it before it is sent.</span>
                            <Button size="sm" className="h-8" onClick={() => void aiSuggest()} disabled={aiDrafting}>
                              <Sparkles className="w-3 h-3 mr-1.5" /> Draft
                            </Button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                )}
                {/* Why there is no draft waiting. An empty composer on a `suggesting` thread is
                    indistinguishable from nobody having written in, which is the whole reason the
                    reason gets stored rather than logged. */}
                {!aiDraftShown && !isNote && activeThread?.agent_state === 'suggesting'
                  && activeThread?.agent_draft_error && (
                  <div className="flex items-start gap-2 text-xs bg-[hsl(var(--warning-bg))] text-warning rounded-sm px-3 py-2">
                    <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>The assistant could not draft a reply here: {activeThread.agent_draft_error}</span>
                  </div>
                )}
                {/* A draft that was overtaken by a newer customer message. It answers the previous
                    question, so it is never loaded — but vanishing without a word reads as the
                    assistant having done nothing. */}
                {!aiDraftShown && !isNote && activeThread?.agent_draft
                  && activeThread?.agent_draft_is_current === false && (
                  <div className="flex items-start gap-2 text-xs bg-surface-sunken text-muted-foreground rounded-sm px-3 py-2">
                    <Sparkles className="w-3.5 h-3.5 mt-px shrink-0" />
                    <span>A draft was written here, then they wrote again — it answered the earlier message, so it was set aside.</span>
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
                {replyTo && (
                  <div className="flex items-start gap-2 mb-2 rounded-sm border-l-2 border-primary bg-surface-sunken px-2.5 py-1.5">
                    <Reply className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-[11px]">
                      <span className="block text-muted-foreground">
                        Replying to {labels.get(replyTo.sender_participant_id ?? '')?.label ?? 'this message'}
                      </span>
                      <span className="block truncate">
                        {replyTo.body || (replyTo.attachments?.length ? 'Attachment' : '—')}
                      </span>
                    </span>
                    <button onClick={() => setReplyTo(null)} className="shrink-0 hover:text-foreground" title="Cancel reply">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {attachment && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="w-3 h-3" /> {attachment.name}
                    <button onClick={() => setAttachment(null)} className="hover:text-foreground"><X className="w-3 h-3" /></button>
                  </div>
                )}
                {/* The cards queued for this send. What the customer gets is resolved on send —
                    the chip shows the list price for orientation, the card shows THEIR price. */}
                {pendingCards.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pendingCards.map((c) => (
                      <span key={c.product_id} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-card pl-1 pr-1.5 py-1 text-xs">
                        {c.image_url
                          ? <img src={c.image_url} alt="" className="h-5 w-5 rounded-xs object-cover" />
                          : (c.kind === 'service' ? <Wrench className="h-3.5 w-3.5 text-muted-foreground" /> : <Package className="h-3.5 w-3.5 text-muted-foreground" />)}
                        <span className="max-w-[14rem] truncate">{c.name}</span>
                        <button onClick={() => togglePendingCard(c)} className="text-muted-foreground hover:text-foreground" title="Remove">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="relative">
                  {/* `/product` and `/service`: the command list while the token is typed, the
                      picker once one is chosen. Anchored above the composer so it never covers
                      the words being written. */}
                  {slashMenu && isMember && activeId && (
                    <div className="absolute bottom-full left-0 mb-2 z-20 w-full max-w-md">
                      {slashMenu.mode === 'commands' ? (
                        <SlashCommandMenu query={slashMenu.query} onChoose={chooseSlashCommand} onClose={() => setSlashMenu(null)} />
                      ) : (
                        <CatalogPicker
                          threadId={activeId}
                          kind={slashMenu.kind}
                          picked={pendingCards}
                          onKind={(kind) => setSlashMenu({ mode: 'picker', kind })}
                          onToggle={togglePendingCard}
                          onClose={() => { setSlashMenu(null); composerRef.current?.focus(); }}
                        />
                      )}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="shrink-0">
                      <EmojiPicker
                        disabled={waBlocked}
                        onPick={(e) => setDraft((d) => d + e)}
                      />
                    </div>
                    <label className="cursor-pointer p-2.5 rounded-sm hover:bg-surface-hover shrink-0">
                      <Paperclip className="w-4 h-4 text-muted-foreground" />
                      {/* `accept` names what the channel can actually carry, so the picker does not
                          offer a file the send will reject. */}
                      <input
                        type="file" className="hidden"
                        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                        onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {isMember && !isNote && (
                      <button
                        type="button"
                        onClick={() => setSlashMenu((m) => (m?.mode === 'picker' ? null : { mode: 'picker', kind: 'product' }))}
                        disabled={waBlocked}
                        className="p-2.5 rounded-sm hover:bg-surface-hover shrink-0 disabled:opacity-50"
                        title="Suggest a product or service (or type /product, /service)"
                        aria-pressed={slashMenu?.mode === 'picker'}
                      >
                        <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                      </button>
                    )}
                    <Textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => {
                        const v = e.target.value;
                        setDraft(v);
                        // A slash command is `/`, `/pro`, `/product` at the START of a line, under
                        // the caret. A slash anywhere else is a slash (a URL, "and/or"). The token's
                        // range is kept so choosing a command removes exactly that text.
                        const tok = isMember && !isNote ? slashTokenAtCaret(v, e.target.selectionStart ?? v.length) : null;
                        if (tok) setSlashMenu({ mode: 'commands', ...tok });
                        else if (slashMenu?.mode === 'commands') setSlashMenu(null);
                      }}
                      onKeyDown={(e) => {
                        if (slashMenu?.mode === 'commands') {
                          if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(null); return; }
                          if (e.key === 'Enter' || e.key === 'Tab') {
                            const first = slashCommandMatches(slashMenu.query)[0];
                            if (first) { e.preventDefault(); chooseSlashCommand(first.kind); return; }
                          }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!waBlocked && !sending) send(); }
                      }}
                      placeholder={isNote ? 'Write a private note (only your team sees this)…' : waBlocked ? 'Reply window closed — template required' : isMember ? 'Type a message… (/product, /service to suggest one)' : 'Type a message…'}
                      className={`flex-1 min-h-[44px] max-h-32 resize-none bg-card ${isNote ? 'border-warning/40 focus-visible:ring-warning/30' : ''}`}
                      disabled={waBlocked}
                    />
                    <Button className="h-9 w-9 p-0 shrink-0" onClick={send} disabled={sending || waBlocked || (!draft.trim() && !attachment && pendingCards.length === 0)}>
                      {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    </Button>
                  </div>
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
          initialMode={
            scopedFilterValue(filterValues, 'thread_type') === 'customer' || scopedFilterValue(filterValues, 'source') === 'customer'
              ? 'customer'
              : 'team'
          }
          scopedLabelId={labelFilter}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); loadThreads(); openThread(id); }}
        />
      )}
      <ForwardDialog
        message={forwarding}
        threads={threads}
        currentThreadId={activeId}
        onClose={() => setForwarding(null)}
        // The destination thread is where the message now IS, so it moves to the top of the
        // list — refreshed silently, since the operator did not ask to look at a spinner.
        onForwarded={() => { void loadThreads({ silent: true }); }}
      />
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

export default InboxPage;
