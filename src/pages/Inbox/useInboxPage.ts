import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { INBOX_CARD_MAX, type InboxCardKind } from '@/modules/messaging/inboxCardKinds';
import { supabase } from '@/integrations/supabase/client';
import { messagingService } from '@/modules/messaging/services/messagingService';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { castSlotFor, nameGender } from '@/utils/characterAvatar';
import { fetchDisplayProfiles } from '@/services/displayProfilesService';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFilters } from '@/components/core/filters';
import { buildInboxFilters } from './inboxFilters';
import { channelForSource, inboxSourceKey, inboxThreadSource, type InboxSourceKey } from './inboxSource';
import { inboxApi, signInboxAttachment, type InboxThread, type InboxMessage, type InboxParticipant, type WhatsAppWindow, type InboxThreadContext, type InboxLabel, type InboxThreadStatus, type InboxCatalogItem } from '@/services/inboxApi';
import { dayBucket } from './inboxFormat';
import { ParticipantLabel } from './components/InboxPrimitives';
import { emailReplyRecipients, splitAddresses } from './emailRecipients';
import { modeChannels, modeSources, parseInboxMode, type InboxFolder, type InboxMode } from './inboxModes';
import { NONE_VALUE } from '@/components/core/filters';
import { bulkSummary, runBulk } from './inboxBulk';
import { formatDate, formatTime } from '@/utils/datetime';
import { useTrackOpens, type MailOpens } from './components/OpenTracking';









export function useInboxPage() {
  const { activeWorkspaceId, activeWorkspace, isPlatformOperator } = useWorkspace();
  const { persona } = usePermissions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [query, setQuery] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setServerSearch(query.trim().length >= 2 ? query.trim() : ''), 300);
    return () => clearTimeout(t);
  }, [query]);
  const [allWorkspaces, setAllWorkspaces] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [folder, setFolder] = useState<InboxFolder | null>(null);
  const mode = parseInboxMode(searchParams.get('src'), isPlatformOperator);
  const [statusTab, setStatusTab] = useState<InboxThreadStatus>('open');
  const [wsLabels, setWsLabels] = useState<InboxLabel[]>([]);
  /** MY starred messages on the open thread. Personal — resolved for the caller by get_thread. */
  const [starredIds, setStarredIds] = useState<Set<string>>(new Set());
  const [messageOpens, setMessageOpens] = useState<Record<string, MailOpens>>({});
  const [trackOpens, setTrackOpens] = useTrackOpens();
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
  const labelIds = useMemo(() => {
    const raw = filterValues.label as string | string[] | undefined;
    return Array.isArray(raw) ? raw : raw ? [raw] : [];
  }, [filterValues.label]);
  const labelFilter = labelIds.length === 1 ? labelIds[0] : null;
  // The Unread mailbox folder and the modal's Unread toggle are the same constraint.
  const unreadOnly = filterValues.unread === true;
  const setUnreadOnly = useCallback(
    (on: boolean) => setFilterValues({ ...filterValues, unread: on ? true : undefined }),
    [filterValues, setFilterValues],
  );
  const setLabelFilter = useCallback(
    (id: string | null) => setFilterValues({ ...filterValues, label: id ? [id] : undefined }),
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
  const [emailCc, setEmailCc] = useState('');
  const [emailBcc, setEmailBcc] = useState('');
  const [emailCopiesOpen, setEmailCopiesOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState(false);
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
  const seededSay = useRef<string | null>(null);
  const draftLoadedFor = useRef<string | null>(null);
  const draftSnapshot = useRef('');

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
    seededSay.current = say.slice(0, 4000);
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
  const listRequest = useMemo(() => ({
    ...(channelFilter ? { channel: channelFilter } : {}),
    ...(modeChannels(mode).length ? { channels: modeChannels(mode) } : {}),
    ...(folder ? { folder } : {}),
    ...(allWorkspaces && isPlatformOperator ? { scope: 'all' as const } : {}),
    ...(showArchived ? { archived: true } : {}),
    ...(labelIds.length ? { label_ids: labelIds } : {}),
    ...(serverSearch ? { search: serverSearch } : {}),
  }), [channelFilter, mode, folder, allWorkspaces, isPlatformOperator, showArchived, labelIds, serverSearch]);

  const setMode = useCallback((next: InboxMode) => {
    setSearchParams((p) => { if (next === 'all') p.delete('src'); else p.set('src', next); return p; }, { replace: true });
    const allowed = modeSources(next);
    if (sourceFilter && allowed && !allowed.includes(sourceFilter as never)) setSourceFilter(null);
  }, [setSearchParams, sourceFilter, setSourceFilter]);

  type InboxView = 'all' | 'unread' | 'archived' | InboxFolder;
  const view: InboxView = showArchived ? 'archived' : folder ?? (unreadOnly ? 'unread' : 'all');
  const goToView = useCallback((next: InboxView) => {
    setShowArchived(next === 'archived');
    setFolder(next === 'starred' || next === 'sent' || next === 'drafts' ? next : null);
    if ((next === 'unread') !== unreadOnly) setUnreadOnly(next === 'unread');
  }, [unreadOnly, setUnreadOnly]);

  const assignmentView: 'mine' | 'unassigned' | null = filterValues.mine === true
    ? 'mine'
    : Array.isArray(filterValues.assignee) && filterValues.assignee.length === 1 && filterValues.assignee[0] === NONE_VALUE
      ? 'unassigned' : null;
  const setAssignmentView = useCallback((next: 'mine' | 'unassigned' | null) => {
    setFilterValues({
      ...filterValues,
      mine: next === 'mine' ? true : undefined,
      assignee: next === 'unassigned' ? [NONE_VALUE] : undefined,
    });
  }, [filterValues, setFilterValues]);

  const loadThreads = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoadingThreads(true);
    try {
      const { threads, next_cursor } = await inboxApi.listThreads(listRequest);
      setThreads(threads);
      setNextCursor(next_cursor ?? null);
    } catch (e) {
      // A background refresh that fails says nothing: the rows on screen are still the last
      // good answer, and a toast per dropped socket event would be its own kind of blink.
      if (!opts?.silent) {
        toast({ title: 'Could not load inbox', description: (e as Error).message, variant: 'destructive' });
      }
    } finally {
      if (!opts?.silent) setLoadingThreads(false);
    }
  }, [listRequest, toast]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((cur) => { const next = new Set(cur); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);
  useEffect(() => { setSelectedIds(new Set()); }, [listRequest]);

  const runBulkAction = useCallback(async (action: 'read' | 'done' | 'open' | 'archive' | 'label', labelId?: string) => {
    const byId = new Map(threads.map((t) => [t.id, t]));
    const onThread = (id: string) => (byId.get(id)?.assignees ?? []).some((a) => a.user_id === myUserId);
    const ids = action === 'read' ? [...selectedIds].filter(onThread) : [...selectedIds];
    const skipped = selectedIds.size - ids.length;
    if (bulkBusy || !selectedIds.size) return;
    if (!ids.length) {
      toast({ title: 'Nothing to mark read', description: 'You are not on any of these conversations, so they have no read state for you.' });
      return;
    }
    setBulkBusy(true);
    const verbs = { read: 'Marked read', done: 'Marked done', open: 'Reopened', archive: 'Archived', label: 'Labelled' } as const;
    try {
      const r = await runBulk(ids, (id) => {
        if (action === 'read') return inboxApi.markRead(id);
        if (action === 'done') return inboxApi.setStatus(id, 'closed');
        if (action === 'open') return inboxApi.setStatus(id, 'open');
        if (action === 'archive') return inboxApi.archiveThread(id);
        const current = (byId.get(id)?.labels ?? []).map((l) => l.id);
        return current.includes(labelId as string) ? Promise.resolve() : inboxApi.setThreadLabels(id, [...current, labelId as string]);
      });
      const summary = bulkSummary(verbs[action], r);
      const skipNote = skipped ? `${skipped} skipped: you are not on them.` : undefined;
      toast({
        title: summary.title,
        description: [summary.description, skipNote].filter(Boolean).join(' ') || undefined,
        variant: summary.failed ? 'destructive' : undefined,
      });
      setSelectedIds(new Set(r.failed.map((f) => f.id)));
      await loadThreads({ silent: true });
    } finally { setBulkBusy(false); }
  }, [selectedIds, bulkBusy, threads, myUserId, toast, loadThreads]);

  const loadMoreThreads = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const { threads: more, next_cursor } = await inboxApi.listThreads({ ...listRequest, before: nextCursor });
      setThreads((cur) => [...cur, ...more.filter((t) => !cur.some((c) => c.id === t.id))]);
      setNextCursor(next_cursor ?? null);
    } catch (e) {
      toast({ title: 'Could not load more conversations', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoadingMore(false); }
  }, [nextCursor, loadingMore, listRequest, toast]);

  useEffect(() => { if (mode !== 'gmail') void loadThreads(); }, [loadThreads, mode]);

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
    if (!wsLabels.length || !labelIds.length) return;
    const known = labelIds.filter((id) => wsLabels.some((l) => l.id === id));
    if (known.length !== labelIds.length) setFilterValues({ ...filterValues, label: known.length ? known : undefined });
  }, [wsLabels, labelIds, filterValues, setFilterValues]);

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
    draftLoadedFor.current = null;
    lastSeenTail.current = { id: null, count: 0 };
    setOlderCursor(null);
    setFarPinned(null);
    setDraft('');
    setAiDraftShown(false);
    try {
      const { thread, participants, messages, whatsapp_window, starred_message_ids, older_cursor, pinned_message, message_opens } = await inboxApi.getThread(id);
      setOlderCursor(older_cursor ?? null);
      setFarPinned(pinned_message ?? null);
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
      const seeded = seededSay.current;
      seededSay.current = null;
      const { data: saved, error: savedErr } = await supabase.from('inbox_drafts')
        .select('body, email_cc, email_bcc').eq('thread_id', id).maybeSingle();
      if (savedErr) console.warn('[inbox] could not load the saved draft', savedErr.message);
      if (seeded) {
        setDraft(seeded);
        setIsNote(false);
      } else if (saved && (saved.body || saved.email_cc || saved.email_bcc)) {
        setDraft(saved.body);
        setEmailCc(saved.email_cc);
        setEmailBcc(saved.email_bcc);
        if (saved.email_cc || saved.email_bcc) setEmailCopiesOpen(true);
        setIsNote(false);
      } else if (thread.agent_draft && thread.agent_draft_is_current) {
        setDraft(thread.agent_draft);
        setIsNote(false);
        setAiDraftShown(true);
      }
      draftSnapshot.current = JSON.stringify(seeded
        ? [seeded, '', '']
        : saved && (saved.body || saved.email_cc || saved.email_bcc) ? [saved.body, saved.email_cc, saved.email_bcc] : ['', '', '']);
      draftLoadedFor.current = id;

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
      setMessageOpens(message_opens ?? {});

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
  const contentRef = useRef<HTMLDivElement>(null);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [farPinned, setFarPinned] = useState<InboxMessage | null>(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const prependAnchor = useRef<number | null>(null);
  const lastSeenTail = useRef<{ id: string | null; count: number }>({ id: null, count: 0 });
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

    const el = contentRef.current ?? listRef.current;
    if (!el) return () => { cancelAnimationFrame(r1); clearTimeout(t1); };
    // Media and email frames size after paint; the CONTENT box grows with all of them.
    const ro = new ResizeObserver(() => { if (stickToBottom.current) scrollToBottom(false); });
    ro.observe(el);
    const stop = setTimeout(() => ro.disconnect(), 6000);
    return () => { cancelAnimationFrame(r1); clearTimeout(t1); clearTimeout(stop); ro.disconnect(); };
  }, [activeId, loadingThread, scrollToBottom]);

  // A new message in an already-open thread: follow it, but only if the reader is still at the
  // bottom. Yanking someone out of the history they are reading is worse than a missed message,
  // and they can see there is a new one.
  useLayoutEffect(() => {
    const el = listRef.current;
    const tail = messages[messages.length - 1]?.id ?? null;
    const prev = lastSeenTail.current;
    lastSeenTail.current = { id: tail, count: messages.length };
    if (el && prependAnchor.current !== null) {
      el.scrollTop = el.scrollHeight - prependAnchor.current;
      prependAnchor.current = null;
      return;
    }
    if (!stickToBottom.current || tail === prev.id) return;
    const oneNew = prev.id !== null && messages.length === prev.count + 1;
    scrollToBottom(oneNew);
  }, [messages, scrollToBottom]);

  const loadOlderMessages = useCallback(async () => {
    if (!activeId || !olderCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const r = await inboxApi.getOlderMessages(activeId, olderCursor);
      const el = listRef.current;
      if (el) prependAnchor.current = el.scrollHeight - el.scrollTop;
      setMessages((cur) => [...r.messages.filter((m) => !cur.some((c) => c.id === m.id)), ...cur]);
      setOlderCursor(r.older_cursor ?? null);
      if (r.starred_message_ids?.length) setStarredIds((cur) => new Set([...cur, ...r.starred_message_ids!]));
      if (r.message_opens) setMessageOpens((cur) => ({ ...cur, ...r.message_opens }));
    } catch (e) {
      toast({ title: 'Could not load older messages', description: (e as Error).message, variant: 'destructive' });
    } finally { setLoadingOlder(false); }
  }, [activeId, olderCursor, loadingOlder, toast]);

  useEffect(() => {
    const threadId = activeId;
    if (!threadId || !myUserId || isNote || !isMember || aiDraftShown || draftLoadedFor.current !== threadId) return;
    const body = draft;
    const cc = emailCc;
    const bcc = emailBcc;
    const snapshot = JSON.stringify([body, cc, bcc]);
    if (snapshot === draftSnapshot.current) return;
    let pending = true;
    const save = async () => {
      pending = false;
      draftSnapshot.current = snapshot;
      const empty = !body.trim() && !cc.trim() && !bcc.trim();
      const { error } = empty
        ? await supabase.from('inbox_drafts').delete().eq('user_id', myUserId).eq('thread_id', threadId)
        : await supabase.from('inbox_drafts').upsert({
          user_id: myUserId, thread_id: threadId, body: body.slice(0, 20000), email_cc: cc, email_bcc: bcc,
          updated_at: new Date().toISOString(),
        });
      if (error) console.warn('[inbox] draft not saved', error.message);
    };
    const timer = setTimeout(() => { void save(); }, 800);
    return () => { clearTimeout(timer); if (pending) void save(); };
  }, [draft, emailCc, emailBcc, activeId, myUserId, isNote, isMember, aiDraftShown]);

  const isEmailReply = activeThread?.channel === 'email' && isMember && !isNote;
  const emailRecipients = useMemo(
    () => (activeThread?.channel === 'email' ? emailReplyRecipients(messages, activeThread.metadata as Record<string, unknown> | null) : null),
    [activeThread, messages],
  );
  useEffect(() => { setEmailCc(''); setEmailBcc(''); setEmailCopiesOpen(false); setTemplateOpen(false); setEmailPreview(false); }, [activeId]);
  const replyAll = useCallback(() => {
    if (!emailRecipients?.replyAllCc.length) return;
    setEmailCc((cur) => [...new Set([...splitAddresses(cur), ...emailRecipients.replyAllCc])].join(', '));
    setEmailCopiesOpen(true);
  }, [emailRecipients]);

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
      const tracked = isEmailReply && trackOpens;
      const sent = await inboxApi.sendMessage({
        thread_id: activeId,
        body: draft.trim() || undefined,
        attachments,
        message_type: isNote ? 'note' : 'text',
        // A private note quotes nothing on the platform — there is no platform message to quote.
        reply_to_message_id: !isNote && replyTo ? replyTo.id : undefined,
        // Picks only. The card the customer sees — price included — is resolved by inbox-api.
        cards: !isNote && pendingCards.length ? pendingCards.map((c) => ({ kind: c.kind, product_id: c.product_id })) : undefined,
        client_token: sendToken.current ?? undefined,
        ...(isEmailReply ? { email_cc: splitAddresses(emailCc), email_bcc: splitAddresses(emailBcc) } : {}),
        ...(tracked ? { track_opens: true } : {}),
      });
      if (tracked && sent?.message?.id) setMessageOpens((cur) => ({ ...cur, [sent.message.id]: { count: 0, first_opened_at: null, last_opened_at: null } }));
      sendToken.current = null;
      setDraft('');
      setAttachment(null);
      setPendingCards([]);
      setSlashMenu(null);
      setReplyTo(null);
      setAiDraftShown(false);
      setEmailCc('');
      setEmailBcc('');
      setEmailCopiesOpen(false);
      setEmailPreview(false);
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
  }, [activeId, draft, attachment, pendingCards, isNote, isMember, activeThread, replyTo, isEmailReply, emailCc, emailBcc, trackOpens, toast]);

  const [showScheduled, setShowScheduled] = useState(false);
  const scheduleSend = useCallback(async (sendAt: Date) => {
    if (!activeId || isNote || (!draft.trim() && !attachment)) return;
    if (pendingCards.length) {
      toast({ title: 'Catalog cards cannot be scheduled', description: 'Send them now, or remove them to schedule the text.', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      let attachments;
      if (attachment) {
        const buf = new Uint8Array(await attachment.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        attachments = [{ filename: attachment.name, content_type: attachment.type || 'application/octet-stream', data_base64: btoa(bin) }];
      }
      await inboxApi.scheduleMessage({
        thread_id: activeId, send_at: sendAt.toISOString(), body: draft.trim() || undefined, attachments,
        reply_to_message_id: replyTo ? replyTo.id : undefined,
        ...(isEmailReply ? { email_cc: splitAddresses(emailCc), email_bcc: splitAddresses(emailBcc), track_opens: trackOpens } : {}),
      });
      toast({ title: 'Scheduled', description: `It goes out ${formatDate(sendAt.toISOString())} ${formatTime(sendAt.toISOString())}.` });
      setDraft(''); setAttachment(null); setReplyTo(null); setEmailCc(''); setEmailBcc(''); setEmailCopiesOpen(false);
    } catch (e) {
      toast({ title: 'Could not schedule', description: (e as Error).message, variant: 'destructive' });
    } finally { setSending(false); }
  }, [activeId, isNote, draft, attachment, pendingCards, replyTo, isEmailReply, emailCc, emailBcc, trackOpens, toast]);

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
    if (q && query.trim() !== serverSearch) list = list.filter((t) =>
      (t.subject || '').toLowerCase().includes(q) || (t.last_message_preview || '').toLowerCase().includes(q));
    // Folder + status semantics: Unread ignores status (the unread predicate itself already ran
    // in the filter matcher); Archived is its own view; otherwise the Open / Follow-up (snoozed) /
    // Done (closed) tab narrows the working set.
    if (!unreadOnly && !showArchived && !folder) list = list.filter((t) => t.status === statusTab);
    return list;
  }, [matchedThreads, query, serverSearch, unreadOnly, showArchived, folder, statusTab]);

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

  const threadTotal = nextCursor ? `${threads.length}+` : String(threads.length);

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
    return pinned[0] ?? farPinned;
  }, [messages, farPinned]);

  // The per-thread member action cluster (AI toggle, settings, add teammate,
  // status). Reused inline in the desktop header and inside the mobile details
  // sheet so the controls stay reachable without crowding the mobile header.


  return {
    activeWorkspaceId,
    activeWorkspace,
    isPlatformOperator,
    persona,
    toast,
    searchParams,
    setSearchParams,
    myUserId,
    setMyUserId,
    threads,
    setThreads,
    loadingThreads,
    setLoadingThreads,
    query,
    setQuery,
    allWorkspaces,
    setAllWorkspaces,
    showArchived,
    setShowArchived,
    statusTab,
    setStatusTab,
    wsLabels,
    setWsLabels,
    starredIds,
    setStarredIds,
    messageOpens,
    trackOpens,
    setTrackOpens,
    forwarding,
    setForwarding,
    canManageLabels,
    setCanManageLabels,
    activeId,
    setActiveId,
    filterGroups,
    filterValues,
    setFilterValues,
    matchedThreads,
    previewCount,
    channelFilter,
    labelFilter,
    labelIds,
    mode,
    setMode,
    view,
    goToView,
    folder,
    assignmentView,
    setAssignmentView,
    nextCursor,
    loadingMore,
    loadMoreThreads,
    selectedIds,
    toggleSelected,
    clearSelection,
    setSelectedIds,
    runBulkAction,
    bulkBusy,
    unreadOnly,
    setUnreadOnly,
    setLabelFilter,
    sourceFilter,
    setSourceFilter,
    messages,
    setMessages,
    participants,
    setParticipants,
    labels,
    setLabels,
    activeThread,
    setActiveThread,
    waWindow,
    setWaWindow,
    context,
    setContext,
    loadingThread,
    setLoadingThread,
    draft,
    setDraft,
    isNote,
    setIsNote,
    composerRef,
    sending,
    setSending,
    attachment,
    setAttachment,
    replyTo,
    setReplyTo,
    isEmailReply,
    emailRecipients,
    emailCc,
    setEmailCc,
    emailBcc,
    setEmailBcc,
    emailCopiesOpen,
    setEmailCopiesOpen,
    replyAll,
    templateOpen,
    setTemplateOpen,
    scheduleSend,
    showScheduled,
    setShowScheduled,
    emailPreview,
    setEmailPreview,
    aiDrafting,
    setAiDrafting,
    aiDraftShown,
    setAiDraftShown,
    draftSteer,
    setDraftSteer,
    draftSteerOpen,
    setDraftSteerOpen,
    pendingCards,
    setPendingCards,
    slashMenu,
    setSlashMenu,
    sendToken,
    showNew,
    setShowNew,
    showAdd,
    setShowAdd,
    showDetails,
    setShowDetails,
    sendInFlight,
    isMobile,
    backToList,
    isMember,
    waBlocked,
    loadThreads,
    avatarSyncDone,
    loadLabels,
    openThread,
    messageMoods,
    listRef,
    contentRef,
    olderCursor,
    loadingOlder,
    loadOlderMessages,
    stickToBottom,
    scrollToBottom,
    send,
    aiSuggest,
    chooseSlashCommand,
    togglePendingCard,
    togglePin,
    toggleStar,
    deleteMessage,
    addToNote,
    archiveActive,
    restoreActive,
    visibleThreads,
    groupedThreads,
    activeThreadLabels,
    inboxUnread,
    sourceCounts,
    threadTotal,
    isCommentThread,
    handlePrivateReply,
    handleToggleHidden,
    threadDisplayName,
    activeCount,
    pinnedMessage,
  };
}

export type InboxPageState = ReturnType<typeof useInboxPage>;
