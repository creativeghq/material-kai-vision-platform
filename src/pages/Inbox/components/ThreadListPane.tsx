import React from 'react';
import { Inbox as InboxIcon, Plus, Loader2, MessageSquare, Bot, Search, Mail, Archive, Clock, ShoppingCart } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub';
import { Badge } from '@/components/core/ui/badge';
import { statusTone } from '@/utils/statusTone';
import { Input } from '@/components/core/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { FilterBar } from '@/components/core/filters';
import { inboxSourceMeta, inboxThreadSource, SOURCE_FILTER_ORDER } from '../inboxSource';
import { type InboxThreadStatus } from '@/services/inboxApi';
import { timeAgo } from '../inboxFormat';
import { LabelChips, MobileChip, SourceWord, ThreadAvatar } from './InboxPrimitives';
import type { InboxPageState } from '../useInboxPage';


export const ThreadListPane: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    activeWorkspaceId,
    loadingThreads,
    query,
    setQuery,
    showArchived,
    setShowArchived,
    statusTab,
    setStatusTab,
    activeId,
    filterGroups,
    filterValues,
    setFilterValues,
    previewCount,
    unreadOnly,
    setUnreadOnly,
    sourceFilter,
    setSourceFilter,
    setShowNew,
    isMember,
    openThread,
    visibleThreads,
    groupedThreads,
    nextCursor,
    loadingMore,
    loadMoreThreads,
    sourceCounts,
    threadDisplayName,
  } = s;
  return (
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
        {!loadingThreads && nextCursor && (
          <div className="p-3 flex justify-center">
            <Button size="sm" variant="outline" onClick={loadMoreThreads} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load older conversations'}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
