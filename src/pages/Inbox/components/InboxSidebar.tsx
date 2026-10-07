import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Inbox as InboxIcon, Plus, Mail, Tag, MessagesSquare, Archive, Star, Send, FilePen, CalendarClock, TextSearch, UserRound, UserX, Copy, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { inboxApi } from '@/services/inboxApi';
import { visibleModes, modeSources } from '../inboxModes';
import { Button } from '@/components/core/ui/button';
import { inboxSourceMeta, SOURCE_FILTER_ORDER } from '../inboxSource';
import { initials, labelDot } from '../inboxFormat';
import { NavRow, SidebarHeading } from './InboxPrimitives';
import { LabelManagerPopover } from './InboxLabels';
import type { InboxPageState } from '../useInboxPage';


export const InboxSidebar: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    isPlatformOperator,
    activeWorkspaceId,
    activeWorkspace,
    wsLabels,
    labelCounts,
    canManageLabels,
    labelIds,
    setLabelFilter,
    mode,
    setMode,
    view,
    goToView,
    assignmentView,
    setAssignmentView,
    setShowScheduled,
    showMessageSearch,
    setShowMessageSearch,
    threads,
    myUserId,
    nextCursor,
    sourceFilter,
    setSourceFilter,
    setShowNew,
    isMember,
    loadThreads,
    loadLabels,
    inboxUnread,
    sourceCounts,
    threadTotal,
    query,
  } = s;
  const unfiltered = !assignmentView && !sourceFilter && !String(query ?? '').trim();
  const more = nextCursor ? '+' : '';
  const mineCount = unfiltered ? `${threads.filter((t) => t.assigned_user_id === myUserId).length}${more}` : undefined;
  const unassignedCount = unfiltered ? `${threads.filter((t) => !t.assigned_user_id).length}${more}` : undefined;
  const { toast } = useToast();
  const [address, setAddress] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== 'platform' || !activeWorkspaceId) return;
    let cancelled = false;
    inboxApi.getMyEmailAddress(activeWorkspaceId)
      .then((r) => { if (!cancelled) setAddress(r.address?.is_active ? r.address.full_address : null); })
      .catch(() => { if (!cancelled) setAddress(null); });
    return () => { cancelled = true; };
  }, [mode, activeWorkspaceId]);
  const allowedSources = modeSources(mode);
  const sources = allowedSources ? SOURCE_FILTER_ORDER.filter((k) => allowedSources.includes(k)) : SOURCE_FILTER_ORDER;
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

      <div role="tablist" aria-label="Inbox source" className="flex items-center gap-3 px-3 border-b border-hairline shrink-0">
        {visibleModes(isPlatformOperator).map((m) => (
          <button key={m.key} role="tab" aria-selected={mode === m.key} onClick={() => setMode(m.key)} className="text-xs py-2">
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {mode === 'platform' && address && (
          <div className="px-3 pt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1" title={address}>{address}</span>
            <button
              type="button"
              className="shrink-0 hover:text-foreground"
              title="Copy your address"
              onClick={() => { void navigator.clipboard.writeText(address); toast({ title: 'Address copied' }); }}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
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
            label="Inbox"
            active={view === 'all'}
            count={view === 'all' ? threadTotal : null}
            onClick={() => goToView('all')}
          />
          <NavRow
            icon={<Mail className="w-4 h-4 shrink-0" />}
            label="Unread"
            active={view === 'unread'}
            count={inboxUnread > 0 && view === 'all' ? `${inboxUnread}${nextCursor ? '+' : ''}` : null}
            emphasiseCount
            onClick={() => goToView('unread')}
          />
          <NavRow icon={<Star className="w-4 h-4 shrink-0" />} label="Starred" active={view === 'starred'} onClick={() => goToView('starred')} />
          <NavRow icon={<FilePen className="w-4 h-4 shrink-0" />} label="Drafts" active={view === 'drafts'} onClick={() => goToView('drafts')} />
          <NavRow icon={<Send className="w-4 h-4 shrink-0" />} label="Sent" active={view === 'sent'} onClick={() => goToView('sent')} />
          <NavRow icon={<CalendarClock className="w-4 h-4 shrink-0" />} label="Scheduled" active={false} onClick={() => setShowScheduled(true)} />
          <NavRow icon={<TextSearch className="w-4 h-4 shrink-0" />} label="Search messages" active={showMessageSearch} onClick={() => setShowMessageSearch(!showMessageSearch)} />
          <NavRow icon={<Archive className="w-4 h-4 shrink-0" />} label="Archived" active={view === 'archived'} onClick={() => goToView('archived')} />
        </nav>

        {isMember && (
          <>
            <SidebarHeading>Assignment</SidebarHeading>
            <nav className="px-2 pb-1 space-y-0.5">
              <NavRow
                icon={<UserRound className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                label="Mine" dense active={assignmentView === 'mine'}
                count={mineCount}
                onClick={() => setAssignmentView(assignmentView === 'mine' ? null : 'mine')}
              />
              <NavRow
                icon={<UserX className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
                label="Unassigned" dense active={assignmentView === 'unassigned'}
                count={unassignedCount}
                onClick={() => setAssignmentView(assignmentView === 'unassigned' ? null : 'unassigned')}
              />
            </nav>
          </>
        )}

        {/*
          Sources — the door each conversation came through, which is the axis this inbox is
          actually organised on since the profile-enquiry merge. It was reachable only from
          inside the filter modal, so the one thing that distinguishes a "Hire me" enquiry
          from cold mail took two clicks and a read to find.
        */}
        {sources.length > 0 && (<>
        <SidebarHeading>Sources</SidebarHeading>
        <nav className="px-2 pb-1 space-y-0.5">
          <NavRow
            icon={<MessagesSquare className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
            label="Every source"
            dense
            active={!sourceFilter}
            onClick={() => setSourceFilter(null)}
          />
          {sources.map((key) => {
            const meta = inboxSourceMeta(key);
            const n = sourceCounts?.get(key) ?? null;
            // An empty source is hidden only when every page is loaded; the row you are on never vanishes.
            if (sourceCounts && !n && !nextCursor && sourceFilter !== key) return null;
            return (
              <NavRow
                key={key}
                icon={<span className={`w-2 h-2 rounded-full shrink-0 ${meta.tone.dot}`} />}
                label={meta.label}
                dense
                active={sourceFilter === key}
                count={n != null ? `${n}${nextCursor ? '+' : ''}` : null}
                onClick={() => setSourceFilter(sourceFilter === key ? null : key)}
              />
            );
          })}
        </nav>
        </>)}

        {mode === 'whatsapp' && (
          <nav className="px-2 pt-2 pb-1">
            <Link
              to="/profile?tab=social-accounts&section=wa-templates"
              className="w-full flex items-center gap-2.5 rounded-sm text-sm px-2.5 py-1.5 text-foreground/80 hover:bg-surface-hover"
            >
              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              Message templates
            </Link>
          </nav>
        )}

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
              count={labelCounts ? String(labelCounts[l.id] ?? 0) : undefined}
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
