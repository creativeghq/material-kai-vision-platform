import React from 'react';
import { Inbox as InboxIcon, Plus, Mail, Tag, MessagesSquare, Archive } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { inboxSourceMeta, SOURCE_FILTER_ORDER } from '../inboxSource';
import { initials, labelDot } from '../inboxFormat';
import { NavRow, SidebarHeading } from './InboxPrimitives';
import { LabelManagerPopover } from './InboxLabels';
import type { InboxPageState } from '../useInboxPage';


export const InboxSidebar: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    activeWorkspaceId,
    activeWorkspace,
    showArchived,
    setShowArchived,
    wsLabels,
    canManageLabels,
    labelIds,
    unreadOnly,
    setUnreadOnly,
    setLabelFilter,
    sourceFilter,
    setSourceFilter,
    setShowNew,
    isMember,
    loadThreads,
    loadLabels,
    inboxUnread,
    sourceCounts,
    threadTotal,
  } = s;
  return (
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
            active={labelIds.length === 0}
            onClick={() => setLabelFilter(null)}
          />
          {wsLabels.map((l) => (
            <NavRow
              key={l.id}
              icon={<span className={`w-2 h-2 rounded-full shrink-0 ${labelDot(l.color)}`} />}
              label={l.name}
              dense
              active={labelIds.includes(l.id)}
              onClick={() => setLabelFilter(labelIds.length === 1 && labelIds[0] === l.id ? null : l.id)}
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
  );
};
