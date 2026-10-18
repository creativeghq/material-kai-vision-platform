import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Inbox as InboxIcon, Plus, Mail, Tag, Archive, Star, Send, FilePen, CalendarClock, TextSearch, UserRound, UserX, Copy, FileText, Phone, Globe } from 'lucide-react';
import { whatsAppNumberLabel } from '@/modules/messaging/services/messagingService';
import { threadWhatsAppAccount } from '../inboxFilters';
import { useToast } from '@/hooks/use-toast';
import { inboxApi } from '@/services/inboxApi';
import { visibleModes } from '../inboxModes';
import { Button } from '@/components/core/ui/button';
import { initials, labelDot } from '../inboxFormat';
import { NavRow, SidebarHeading } from './InboxPrimitives';
import { LabelManagerPopover, LabelSidebarRow } from './InboxLabels';
import type { InboxPageState } from '../useInboxPage';


export const InboxSidebar: React.FC<{ s: InboxPageState; variant?: 'rail' | 'drawer' }> = ({ s, variant = 'rail' }) => {
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
    waNumbers,
    waNumberFilter,
    setWaNumberFilter,
    setShowNew,
    isMember,
    loadThreads,
    loadLabels,
    inboxUnread,
    threadTotal,
    query,
    setShowMailbox,
    allWorkspaces,
    setAllWorkspaces,
  } = s;
  const drawer = variant === 'drawer';
  // In the drawer, picking where to go IS the end of the visit — even the row you are already on.
  const asideRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = asideRef.current;
    if (!drawer || !el) return;
    const close = (e: MouseEvent) => { if ((e.target as HTMLElement).closest('[data-nav-row]')) setShowMailbox(false); };
    el.addEventListener('click', close);
    return () => el.removeEventListener('click', close);
  }, [drawer, setShowMailbox]);
  const thenClose = (fn: () => void) => () => { fn(); if (drawer) setShowMailbox(false); };
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
  return (
    <aside ref={asideRef} className={drawer ? 'h-full flex flex-col overflow-hidden bg-card' : 'dashboard-card md:col-span-3 lg:col-span-2 hidden md:flex flex-col overflow-hidden p-0'}>
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
      {drawer && isPlatformOperator && (
        <div className="px-3 pt-3">
          <Button variant={allWorkspaces ? 'default' : 'outline'} size="sm" className="w-full" onClick={thenClose(() => setAllWorkspaces((v) => !v))}>
            <Globe className="w-4 h-4 mr-1.5" /> All workspaces
          </Button>
        </div>
      )}

      <div role="tablist" aria-label="Inbox source" className="flex items-center gap-3 px-3 border-b border-hairline shrink-0">
        {visibleModes(isPlatformOperator).map((m) => (
          <button key={m.key} role="tab" data-nav-row aria-selected={mode === m.key} onClick={() => setMode(m.key)} className="text-xs py-2">
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
            <Button className="w-full" onClick={thenClose(() => setShowNew(true))} disabled={!activeWorkspaceId}>
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
          <NavRow icon={<AlarmClock className="w-4 h-4 shrink-0" />} label="Follow up" active={view === 'followup'} onClick={() => goToView('followup')} />
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
          <NavRow icon={<CalendarClock className="w-4 h-4 shrink-0" />} label="Scheduled" active={false} onClick={thenClose(() => setShowScheduled(true))} />
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

        {mode === 'whatsapp' && waNumbers.length > 1 && (<>
        <SidebarHeading>Numbers</SidebarHeading>
        <nav className="px-2 pb-1 space-y-0.5">
          <NavRow
            icon={<Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
            label="Every number"
            dense
            active={!waNumberFilter}
            onClick={() => setWaNumberFilter(null)}
          />
          {waNumbers.map((n) => (
            <NavRow
              key={n.id}
              icon={<Phone className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
              label={whatsAppNumberLabel(n)}
              dense
              active={waNumberFilter === n.zernio_account_id}
              count={`${threads.filter((t) => threadWhatsAppAccount(t) === n.zernio_account_id).length}${more}`}
              onClick={() => setWaNumberFilter(waNumberFilter === n.zernio_account_id ? null : n.zernio_account_id)}
            />
          ))}
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
            <LabelSidebarRow
              key={l.id}
              workspaceId={activeWorkspaceId ?? ''}
              label={l}
              dot={labelDot(l.color)}
              count={labelCounts ? String(labelCounts[l.id] ?? 0) : undefined}
              active={labelIds.includes(l.id)}
              canManage={canManageLabels && !!activeWorkspaceId}
              onSelect={() => setLabelFilter(labelIds.length === 1 && labelIds[0] === l.id ? null : l.id)}
              onChanged={() => { loadLabels(); loadThreads({ silent: true }); }}
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
