import React from 'react';
import { AlarmClock, ChevronRight, Folder as FolderIcon, FolderOpen, Loader2, MessageSquare, Bot, Search, ArchiveRestore, Trash2, Clock, ShoppingCart, Send, Paperclip, Menu, X, PenSquare, Check, CheckCheck, MailOpen, RotateCcw, MoreVertical } from 'lucide-react';
import { visibleModes } from '../inboxModes';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Input } from '@/components/core/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { Checkbox } from '@/components/core/ui/checkbox';
import { UserAvatar } from '@/components/core/ui/UserAvatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/core/ui/alert-dialog';
import { labelDot } from '../inboxFormat';
import { FilterBar } from '@/components/core/filters';
import { inboxSourceMeta, inboxThreadSource } from '../inboxSource';
import { type InboxThread, type InboxThreadStatus } from '@/services/inboxApi';
import { whatsAppFolders } from '../whatsappFolders';
import { timeAgo } from '../inboxFormat';
import { formatDate } from '@/utils/datetime';
import { LabelChips, SourceWord, ThreadAvatar } from './InboxPrimitives';
import type { InboxPageState } from '../useInboxPage';
import { FollowUpStatsLine } from './FollowUpStatsLine';
import { BulkFollowUp } from './BulkFollowUp';
import { SwipeRow, type SwipeAction } from './SwipeRow';


const FOLDER_VIEW_KEY = 'inbox.whatsapp.layout';

const VIEW_TITLE: Record<string, string> = {
  all: 'Inbox', followup: 'Follow up', unread: 'Unread', starred: 'Starred', sent: 'Sent', drafts: 'Drafts', archived: 'Archived',
};
const LONG_PRESS_MS = 450;

const EMPTY_VIEW = {
  all: { title: 'No conversations yet', description: 'Email, WhatsApp, social and enquiries from your public profile all land here, each tagged with where it came from.' },
  followup: { title: 'Nothing to follow up', description: 'Use the clock on a conversation: Boomerang brings it back to the top on a day you pick, Automatic outreach sends your message then unless they reply first.' },
  archived: { title: 'Nothing archived', description: 'Deleted conversations rest here for 30 days before they are removed for good.' },
  starred: { title: 'Nothing starred', description: 'Star a message to keep its conversation here.' },
  sent: { title: 'Nothing sent yet', description: 'Conversations you have written in show up here.' },
  drafts: { title: 'No drafts', description: 'A reply you start and do not send is kept here, on every device, until you send it.' },
} as const;

export const ThreadListPane: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    isPlatformOperator,
    activeWorkspaceId,
    loadingThreads,
    query,
    setQuery,
    showArchived,
    statusTab,
    setStatusTab,
    followUpKind,
    setFollowUpKind,
    followUpCounts,
    activeId,
    filterGroups,
    filterValues,
    setFilterValues,
    previewCount,
    mode,
    setMode,
    view,
    goToView,
    sourceFilter,
    setShowNew,
    isMember,
    openThread,
    visibleThreads,
    groupedThreads,
    nextCursor,
    loadingMore,
    loadMoreThreads,
    selectedIds,
    toggleSelected,
    clearSelection,
    setSelectedIds,
    runBulkAction,
    bulkBusy,
    canManageLabels,
    wsLabels,
    threadDisplayName,
    labelIds,
    setShowMailbox,
    inboxUnread,
    isMobile,
    quickAction,
    loadThreads,
  } = s;
  const selecting = selectedIds.size > 0;
  const [pull, setPull] = React.useState(0);
  const [refreshing, setRefreshing] = React.useState(false);
  const pullStart = React.useRef<{ x: number; y: number; vertical: boolean | null } | null>(null);
  const PULL_TRIGGER = 64;
  const swipeFor = (t: InboxThread): { left?: SwipeAction; right?: SwipeAction } => {
    if (view === 'archived') return { right: { label: 'Restore', Icon: ArchiveRestore, tone: 'info', run: () => { void quickAction(t.id, 'restore'); } } };
    return {
      left: { label: 'Delete', Icon: Trash2, tone: 'danger', run: () => { void quickAction(t.id, 'archive'); } },
      right: t.status === 'closed'
        ? { label: 'Reopen', Icon: RotateCcw, tone: 'info', run: () => { void quickAction(t.id, 'open'); } }
        : { label: 'Done', Icon: CheckCheck, tone: 'success', run: () => { void quickAction(t.id, 'done'); } },
    };
  };
  const [searchOpen, setSearchOpen] = React.useState(false);
  // Long-press selects, the way a phone list does; the click that ends the press must not also open.
  const press = React.useRef<{ timer: ReturnType<typeof setTimeout> | null; fired: boolean }>({ timer: null, fired: false });
  const cancelPress = () => {
    if (press.current.timer) clearTimeout(press.current.timer);
    press.current.timer = null;
  };
  React.useEffect(() => cancelPress, []);
  const pressHandlers = (id: string) => ({
    onTouchStart: (e: React.TouchEvent) => {
      cancelPress();
      press.current.fired = false;
      if (e.touches.length > 1) return;
      press.current.timer = setTimeout(() => {
        press.current.timer = null;
        press.current.fired = true;
        toggleSelected(id);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
    },
    onTouchMove: cancelPress,
    onTouchEnd: cancelPress,
    onTouchCancel: cancelPress,
    onContextMenu: (e: React.MouseEvent) => { if (press.current.fired) e.preventDefault(); },
  });
  const sourceLabel = sourceFilter ? inboxSourceMeta(sourceFilter as Parameters<typeof inboxSourceMeta>[0]).label : null;
  const [folderView, setFolderView] = React.useState<boolean>(() => {
    let stored: string | null = null;
    try { stored = localStorage.getItem(FOLDER_VIEW_KEY); } catch { /* storage blocked: default view */ }
    return stored !== 'list';
  });
  const chooseFolderView = (on: boolean) => {
    setFolderView(on);
    try { localStorage.setItem(FOLDER_VIEW_KEY, on ? 'folders' : 'list'); } catch { /* per-viewer convenience only */ }
  };
  const [openFolders, setOpenFolders] = React.useState<Set<string>>(new Set());
  const toggleFolder = (id: string) => setOpenFolders((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const showFolders = mode === 'whatsapp' && folderView && view === 'all' && !String(query ?? '').trim() && labelIds.length === 0;
  const renderRow = (t: InboxThread) => {
              const name = threadDisplayName(t);
              const active = activeId === t.id;
              const source = inboxThreadSource(t);
              // Unassigned is STATED, not left blank: blank also reads as "did not render".
              const assignee = t.assigned_user_id ? (t.assignee_name ?? 'Assigned') : null;
              const orderPending = (t.metadata as { order_intake?: { status?: string } } | null)
                ?.order_intake?.status === 'pending_review';
              const selected = selectedIds.has(t.id);
              return (
                <SwipeRow key={t.id} enabled={isMobile && isMember && !selecting} {...swipeFor(t)}>
                <div className="group relative">
                <span className={`absolute left-1 top-1/2 -translate-y-1/2 z-10 hidden ${selecting || selected ? 'md:flex' : 'md:group-hover:flex'}`}>
                  <Checkbox aria-label={`Select ${name}`} checked={selected} onCheckedChange={() => toggleSelected(t.id)} />
                </span>
                <button
                  {...pressHandlers(t.id)}
                  onClick={() => {
                    if (press.current.fired) { press.current.fired = false; return; }
                    if (selectedIds.size > 0) toggleSelected(t.id); else void openThread(t.id);
                  }}
                  className={`w-full text-left select-none md:select-auto [-webkit-touch-callout:none] md:[-webkit-touch-callout:default] ${selecting ? 'px-4 md:pl-8' : 'px-4 md:group-hover:pl-8'} py-3 flex gap-3 border-l-2 border-b border-hairline transition-colors active:bg-surface-hover ${selected ? 'bg-primary/[0.06]' : ''} ${active ? 'md:bg-surface-hover md:border-l-primary border-l-transparent' : 'border-l-transparent hover:bg-surface-hover'}`}
                >
                  {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- touch shortcut; the row and its long-press stay the accessible way in */}
                  <div
                    className="relative shrink-0 mt-0.5"
                    onClick={(e) => {
                      if (!isMobile || !isMember) return;
                      e.stopPropagation();
                      // The click that ends a long-press already selected it.
                      if (press.current.fired) { press.current.fired = false; return; }
                      toggleSelected(t.id);
                      navigator.vibrate?.(10);
                    }}
                  >
                    {isMobile && selected ? (
                      <span className="h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-6 h-6" />
                      </span>
                    ) : <ThreadAvatar thread={t} name={name} className="h-12 w-12 md:h-9 md:w-9" showMood />}
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
                      <span className={`flex-1 truncate text-[15px] md:text-sm ${t.unread ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>{name}</span>
                      <span className={`text-xs md:text-[11px] shrink-0 tabular-nums ${t.unread ? 'text-primary font-medium md:font-normal md:text-muted-foreground' : 'text-muted-foreground'}`}>{timeAgo(t.last_message_at)}</span>
                    </div>
                    {t.channel === 'email' && t.subject && t.subject !== name && (
                      <div className={`text-sm truncate ${t.unread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}>{t.subject}</div>
                    )}
                    {t.last_message_preview && (
                      <div className={`text-sm md:text-xs truncate mt-0.5 ${t.unread ? 'text-foreground/70' : 'text-muted-foreground'}`}>{t.last_message_preview}</div>
                    )}
                    <div className="flex items-center gap-x-2 gap-y-1 mt-1.5 flex-wrap">
                      <SourceWord source={source} className="hidden md:inline-flex" />
                      {t.has_attachments && (
                        <span className="hidden md:inline-flex items-center gap-1 rounded-sm border border-hairline bg-card px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
                          <Paperclip className="w-3 h-3" />Files
                        </span>
                      )}
                      {assignee ? (
                        <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-foreground/80 truncate max-w-[9rem]" title={`Assigned to ${assignee}`}>
                          <UserAvatar userId={t.assigned_user_id} name={assignee} className="h-4 w-4 text-[8px]" />
                          <span className="truncate">{assignee}</span>
                        </span>
                      ) : (
                        <span className="hidden md:inline text-[11px] text-muted-foreground">Unassigned</span>
                      )}
                      {t.outreach?.length ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-foreground/80" title={t.outreach[0].preview}>
                          <Send className="w-3 h-3" />Sends {formatDate(t.outreach[0].send_at)}{t.outreach.length > 1 ? ` (+${t.outreach.length - 1})` : ''}
                        </span>
                      ) : t.follow_up_at && !t.follow_up_fired_at ? (
                        <span className="inline-flex items-center gap-1 text-[11px] text-foreground/80">
                          {t.follow_up_message ? <Send className="w-3 h-3" /> : <AlarmClock className="w-3 h-3" />}
                          {t.follow_up_message ? 'Sends' : 'Back'} {formatDate(t.follow_up_at)}
                        </span>
                      ) : t.status !== 'open' && !t.archived_at && <span className={`text-[11px] capitalize ${statusTone(t.status)}`}>{t.status === 'snoozed' ? 'follow up' : t.status}</span>}
                      {t.agent_state === 'active' && (
                        <span className="inline-flex items-center gap-1 text-[11px] leading-none text-primary"><Bot className="w-3 h-3" />AI</span>
                      )}
                      {t.waiting_on === 'us' && (
                        <Badge variant="warning" className="text-[10px] py-0">
                          <Clock className="w-2.5 h-2.5" />
                          Waiting {timeAgo(t.waiting_since || t.last_message_at)}
                          {(t.unanswered_count ?? 0) > 1 ? ` · ${t.unanswered_count} msgs` : ''}
                        </Badge>
                      )}
                      {orderPending && (
                        <Badge variant="warning" className="text-[10px] py-0">
                          <ShoppingCart className="w-2.5 h-2.5" />Order
                        </Badge>
                      )}
                      <LabelChips labels={t.labels} />
                    </div>
                  </div>
                </button>
                </div>
                </SwipeRow>
              );
  };

  const folders = showFolders ? whatsAppFolders(visibleThreads, wsLabels) : [];

  return (
    <div className={`md:dashboard-card bg-card md:col-span-4 lg:col-span-3 flex-1 min-h-0 md:flex-none flex flex-col overflow-hidden p-0 ${activeId ? 'hidden md:flex' : 'flex'}`}>
      <div className="md:hidden flex items-center gap-1 h-14 px-1.5 border-b border-hairline bg-card shrink-0">
        {selecting ? (
          <>
            <button type="button" aria-label="Cancel selection" onClick={clearSelection}
              className="h-11 w-11 flex items-center justify-center rounded-sm text-foreground active:bg-surface-hover">
              <X className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 px-1 text-lg font-semibold tabular-nums">{selectedIds.size}</div>
            {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
            {view === 'archived' ? (
              <button type="button" aria-label="Restore" disabled={bulkBusy} onClick={() => runBulkAction('restore')}
                className="h-11 w-11 flex items-center justify-center rounded-sm active:bg-surface-hover disabled:opacity-40">
                <ArchiveRestore className="w-5 h-5" />
              </button>
            ) : (
              <>
                <button type="button" aria-label="Mark read" disabled={bulkBusy} onClick={() => runBulkAction('read')}
                  className="h-11 w-11 flex items-center justify-center rounded-sm active:bg-surface-hover disabled:opacity-40">
                  <MailOpen className="w-5 h-5" />
                </button>
                <button type="button" aria-label={statusTab === 'closed' && view === 'all' ? 'Reopen' : 'Mark done'} disabled={bulkBusy}
                  onClick={() => runBulkAction(statusTab === 'closed' && view === 'all' ? 'open' : 'done')}
                  className="h-11 w-11 flex items-center justify-center rounded-sm active:bg-surface-hover disabled:opacity-40">
                  {statusTab === 'closed' && view === 'all' ? <RotateCcw className="w-5 h-5" /> : <CheckCheck className="w-5 h-5" />}
                </button>
                <button type="button" aria-label="Delete" disabled={bulkBusy} onClick={() => runBulkAction('archive')}
                  className="h-11 w-11 flex items-center justify-center rounded-sm text-destructive active:bg-surface-hover disabled:opacity-40">
                  <Trash2 className="w-5 h-5" />
                </button>
                <BulkFollowUp disabled={bulkBusy} onPlan={(plan) => runBulkAction('follow_up', undefined, plan)} />
              </>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="More actions" className="h-11 w-11 flex items-center justify-center rounded-sm active:bg-surface-hover">
                  <MoreVertical className="w-5 h-5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setSelectedIds(new Set(visibleThreads.map((t) => t.id)))}>
                  Select all ({visibleThreads.length})
                </DropdownMenuItem>
                {view !== 'archived' && (
                  <DropdownMenuItem onSelect={() => runBulkAction('assign_me')}>Assign to me</DropdownMenuItem>
                )}
                {view !== 'archived' && wsLabels.map((l) => (
                  <DropdownMenuItem key={l.id} onSelect={() => runBulkAction('label', l.id)}>
                    <span className={`w-2 h-2 rounded-full mr-2 ${labelDot(l.color)}`} />Label: {l.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ) : searchOpen ? (
          <>
            <button type="button" aria-label="Close search" onClick={() => { setSearchOpen(false); setQuery(''); }}
              className="h-11 w-11 flex items-center justify-center rounded-sm text-muted-foreground active:bg-surface-hover">
              <X className="w-5 h-5" />
            </button>
            <Input
              autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations" className="h-10 flex-1 text-base"
            />
          </>
        ) : (
          <>
            <button type="button" aria-label="Open mailbox" onClick={() => setShowMailbox(true)}
              className="h-11 w-11 flex items-center justify-center rounded-sm text-foreground active:bg-surface-hover">
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex-1 min-w-0 px-1">
              <div className="text-lg font-semibold leading-tight truncate">
                {VIEW_TITLE[view] ?? 'Inbox'}{sourceLabel ? <span className="text-muted-foreground font-normal"> · {sourceLabel}</span> : null}
              </div>
              {inboxUnread > 0 && view === 'all' && (
                <div className="text-xs text-primary leading-tight tabular-nums">{inboxUnread}{nextCursor ? '+' : ''} unread</div>
              )}
            </div>
            <button type="button" aria-label="Search conversations" onClick={() => setSearchOpen(true)}
              className="h-11 w-11 flex items-center justify-center rounded-sm text-foreground active:bg-surface-hover">
              <Search className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
      <div className="px-3 pt-1 pb-2 md:p-3 border-b border-hairline bg-card md:bg-surface-sunken space-y-2 md:space-y-3 shrink-0">
        <div className="hidden md:flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="Search conversations"
              className="pl-9 h-9"
            />
          </div>
        </div>
        <div role="tablist" aria-label="Inbox source" className="flex md:hidden items-center gap-5 overflow-x-auto border-b border-hairline -mx-3 px-3">
          {visibleModes(isPlatformOperator).map((m) => (
            <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)} className="text-sm py-2.5 shrink-0">
              {m.label}
            </button>
          ))}
        </div>
        {/* Status tabs (Open / Follow-up / Done) narrow the working set; they are hidden in the
            Unread / Archived views, where status is not the axis. The filter bar stays put in
            every view — it is what carries the Unread toggle. */}
        {selectedIds.size > 0 ? (
          <div className={`${view === 'archived' ? 'flex' : 'hidden md:flex'} flex-wrap items-center gap-1.5 text-xs`}>
            <Checkbox
              aria-label="Select every conversation shown"
              checked={selectedIds.size === visibleThreads.length ? true : 'indeterminate'}
              onCheckedChange={(v) => setSelectedIds(v === true ? new Set(visibleThreads.map((t) => t.id)) : new Set())}
            />
            <span className="font-medium tabular-nums mr-1">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulkAction('read')}>Mark read</Button>
            {statusTab === 'closed' && view === 'all'
              ? <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulkAction('open')}>Reopen</Button>
              : <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulkAction('done')}>Done</Button>}
            {wsLabels.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy}>Label</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {wsLabels.map((l) => (
                    <DropdownMenuItem key={l.id} onSelect={() => runBulkAction('label', l.id)}>
                      <span className={`w-2 h-2 rounded-full mr-2 ${labelDot(l.color)}`} />{l.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulkAction('assign_me')}>Assign to me</Button>
            {view !== 'archived' && <BulkFollowUp disabled={bulkBusy} onPlan={(plan) => runBulkAction('follow_up', undefined, plan)} />}
            {view !== 'archived' ? (
              <Button size="sm" variant="outline" className="h-7 text-xs hover:text-destructive" disabled={bulkBusy} title="Delete — moves to Archived for 30 days, then permanently removed" onClick={() => runBulkAction('archive')}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
              </Button>
            ) : (
              <>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={bulkBusy} onClick={() => runBulkAction('restore')}>
                  <ArchiveRestore className="w-3.5 h-3.5 mr-1" />Restore
                </Button>
                {canManageLabels && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:text-destructive" disabled={bulkBusy}>
                        <Trash2 className="w-3.5 h-3.5 mr-1" />Delete forever
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedIds.size} conversation{selectedIds.size === 1 ? '' : 's'} permanently?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Every message, note and attachment in them is removed now and cannot be restored.
                          It only leaves this Inbox: the other person still has their copy.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => { void runBulkAction('delete_forever'); }}>Delete forever</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </>
            )}
            {bulkBusy && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
            <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={clearSelection}>Clear</Button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {view === 'all' || view === 'followup' ? (
            <div className="space-y-1.5">
            <Tabs value={statusTab} onValueChange={(v) => {
              if (v === 'snoozed') { goToView('followup'); return; }
              goToView('all');
              setStatusTab(v as InboxThreadStatus);
            }}>
              {/* No active-state override: the underline treatment is global, on
                  [role="tab"] in index.css. A filled pill here would read as a button. */}
              <TabsList className="h-auto gap-3 bg-transparent p-0">
                <TabsTrigger value="open" className="text-xs px-0 py-1">Open</TabsTrigger>
                <TabsTrigger value="snoozed" className="text-xs px-0 py-1">Follow up</TabsTrigger>
                <TabsTrigger value="closed" className="text-xs px-0 py-1">Done</TabsTrigger>
              </TabsList>
            </Tabs>
            {view === 'followup' && <FollowUpStatsLine refreshKey={visibleThreads.length} />}
            {view === 'followup' && (
              <div role="tablist" aria-label="Follow-up kind" className="flex items-center gap-3 text-xs">
                {(['boomerang', 'outreach'] as const).map((k) => (
                  <button key={k} role="tab" aria-selected={followUpKind === k} onClick={() => setFollowUpKind(k)} className="py-1">
                    {k === 'boomerang' ? 'Boomerang' : 'Automatic outreach'}
                    {followUpCounts && <span className="text-muted-foreground tabular-nums"> {followUpCounts[k]}{nextCursor ? '+' : ''}</span>}
                  </button>
                ))}
              </div>
            )}
            </div>
          ) : <span />}
          {mode === 'whatsapp' && (
            <div role="tablist" aria-label="WhatsApp layout" className="flex items-center gap-3 text-xs">
              <button role="tab" aria-selected={folderView} onClick={() => chooseFolderView(true)} className="py-1 inline-flex items-center gap-1">
                <FolderIcon className="w-3 h-3" />Folders
              </button>
              <button role="tab" aria-selected={!folderView} onClick={() => chooseFolderView(false)} className="py-1">List</button>
            </div>
          )}
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
        )}
      </div>
      <div
        className="flex-1 overflow-y-auto overscroll-contain"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollHeight - el.scrollTop - el.clientHeight < 200 && nextCursor && !loadingMore) void loadMoreThreads();
        }}
        onTouchStart={(e) => {
          pullStart.current = isMobile && e.currentTarget.scrollTop <= 0 && !refreshing
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY, vertical: null } : null;
        }}
        onTouchMove={(e) => {
          const p = pullStart.current;
          if (!p) return;
          const dx = e.touches[0].clientX - p.x;
          const d = e.touches[0].clientY - p.y;
          if (p.vertical === null && (Math.abs(dx) > 10 || Math.abs(d) > 10)) p.vertical = Math.abs(d) > Math.abs(dx);
          if (!p.vertical) return;
          setPull(d > 0 && e.currentTarget.scrollTop <= 0 ? Math.min(d * 0.5, PULL_TRIGGER * 1.4) : 0);
        }}
        onTouchEnd={() => {
          pullStart.current = null;
          if (pull >= PULL_TRIGGER) {
            setRefreshing(true);
            navigator.vibrate?.(10);
            void loadThreads({ silent: true }).finally(() => { setRefreshing(false); setPull(0); });
          } else setPull(0);
        }}
      >
        {(pull > 0 || refreshing) && (
          <div className="md:hidden flex items-center justify-center text-muted-foreground transition-[height]"
            style={{ height: refreshing ? 48 : pull }} aria-live="polite">
            <Loader2 className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
              style={refreshing ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(pull / PULL_TRIGGER, 1) }} />
            <span className="sr-only">{refreshing ? 'Refreshing' : 'Pull to refresh'}</span>
          </div>
        )}
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
              title={EMPTY_VIEW[view === 'all' || view === 'unread' ? 'all' : view].title}
              description={EMPTY_VIEW[view === 'all' || view === 'unread' ? 'all' : view].description}
            />
          )
        ) : showFolders ? folders.map((f) => {
          const open = openFolders.has(f.id) || f.threads.some((t) => t.id === activeId);
          const fresh = f.unread > 0;
          const latestName = f.latest ? threadDisplayName(f.latest) : '';
          return (
            <div key={f.id} className="border-b border-hairline">
              <button
                type="button"
                onClick={() => toggleFolder(f.id)}
                aria-expanded={open}
                className={`w-full text-left px-4 py-3 flex gap-3 border-l-2 transition-colors ${
                  fresh ? 'bg-[hsl(var(--success-bg))] border-l-[hsl(var(--success))]' : 'border-l-transparent hover:bg-surface-hover'}`}
              >
                <span className={`relative h-9 w-9 shrink-0 rounded-sm flex items-center justify-center ${
                  fresh ? 'bg-success text-success-foreground' : 'bg-surface-sunken text-muted-foreground'}`}>
                  {open ? <FolderOpen className="w-4 h-4" /> : <FolderIcon className="w-4 h-4" />}
                  {f.color && <span className={`absolute -right-0.5 -bottom-0.5 w-2.5 h-2.5 rounded-full border-2 border-card ${labelDot(f.color)}`} />}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`flex-1 truncate text-sm ${fresh ? 'font-semibold text-foreground' : 'text-foreground/90'}`}>{f.name}</span>
                    {fresh && (
                      <span className="text-[11px] rounded-xs bg-success text-success-foreground px-1.5 tabular-nums">{f.unread} new</span>
                    )}
                    <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                      {f.threads.length} · {f.latest ? timeAgo(f.latest.last_message_at) : ''}
                    </span>
                  </div>
                  {f.latest?.last_message_preview && (
                    <div className={`text-xs truncate mt-0.5 ${fresh ? 'text-[hsl(var(--success))] font-medium' : 'text-muted-foreground'}`}>
                      {latestName}: {f.latest.last_message_preview}
                    </div>
                  )}
                </div>
                <ChevronRight className={`w-4 h-4 mt-2.5 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-90' : ''}`} />
              </button>
              {open && <div className="pl-3 bg-surface-sunken/40">{f.threads.map((t) => renderRow(t))}</div>}
            </div>
          );
        }) : groupedThreads.map(([bucket, items]) => (
          <div key={bucket}>
            <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground/70 font-medium">{bucket}</div>
            {items.map((t) => renderRow(t))}
          </div>
        ))}
        {!loadingThreads && nextCursor && (
          <div className="p-3 flex justify-center">
            <Button size="sm" variant="outline" onClick={loadMoreThreads} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load older conversations'}
            </Button>
          </div>
        )}
        {isMember && <div className="h-20 md:hidden" aria-hidden />}
      </div>
      {isMember && selectedIds.size === 0 && (
        <Button
          onClick={() => setShowNew(true)} disabled={!activeWorkspaceId} aria-label="New conversation"
          className="md:hidden fixed right-4 bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] z-30 h-14 w-14 p-0 shadow-overlay"
        >
          <PenSquare className="w-5 h-5" />
        </Button>
      )}
    </div>
  );
};
