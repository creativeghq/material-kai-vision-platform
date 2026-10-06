import React from 'react';
import { Inbox as InboxIcon, Globe } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Sheet, SheetContent, SheetTitle } from '@/components/core/ui/sheet';
import { scopedFilterValue } from '@/components/core/filters';
import { ForwardDialog } from './components/MessageBubble';
import { DetailsRail } from './components/DetailsRail';
import { NewThreadDialog } from './components/NewThreadDialog';
import { AddParticipantDialog } from './components/AddParticipantDialog';
import { useInboxPage } from './useInboxPage';
import { ConversationPane } from './components/ConversationPane';
import { ThreadListPane } from './components/ThreadListPane';
import { InboxSidebar } from './components/InboxSidebar';
import { ConversationActions } from './components/ConversationActions';
import { GmailInbox } from './gmail/GmailInbox';
import { ScheduledDialog } from './components/SendLater';

const InboxPage: React.FC = () => {
  const s = useInboxPage();
  const {
    activeWorkspaceId,
    mode,
    setMode,
    showScheduled,
    setShowScheduled,
    isPlatformOperator,
    threads,
    allWorkspaces,
    setAllWorkspaces,
    forwarding,
    setForwarding,
    activeId,
    filterValues,
    labelFilter,
    messages,
    participants,
    labels,
    activeThread,
    context,
    showNew,
    setShowNew,
    showAdd,
    setShowAdd,
    showDetails,
    setShowDetails,
    isMobile,
    isMember,
    loadThreads,
    openThread,
  } = s;
  const showMemberControls = isMember && !!activeThread;
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
        {mode === 'gmail' ? <GmailInbox mode={mode} setMode={setMode} /> : (<>
        {/* ── Column 0 · Mailbox sidebar (Compose · views · sources · labels) ── */}
        <InboxSidebar s={s} />

        {/* ── Column 1 · Message list ── */}
        <ThreadListPane s={s} />

        <ConversationPane s={s} />
        </>)}

        {/*
          There is no standing profile column. It used to be a fourth pane from 2xl up; the
          conversation is what an operator is actually working in, so the profile is a drawer
          at every width and the conversation keeps the room. It opens from the contact's name
          or the person icon in the conversation header — see the Sheet at the bottom of this
          component, which is now the ONLY renderer of DetailsRail.
        */}
      </div>

      {showScheduled && <ScheduledDialog onClose={() => setShowScheduled(false)} />}
      {showNew && activeWorkspaceId && (
        <NewThreadDialog
          workspaceId={activeWorkspaceId}
          initialMode={
            scopedFilterValue(filterValues, 'source') === 'email'
              ? 'email'
              : scopedFilterValue(filterValues, 'source') === 'whatsapp' || mode === 'whatsapp'
                ? 'whatsapp'
                : scopedFilterValue(filterValues, 'thread_type') === 'customer' || scopedFilterValue(filterValues, 'source') === 'customer'
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
            {showMemberControls && (
              <div className="md:hidden flex flex-wrap items-center gap-1.5 px-4 py-3 border-b border-hairline shrink-0">
                <ConversationActions s={s} />
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
                onOpenThread={(id) => { setShowDetails(false); void openThread(id); }}
              />
            </div>
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
};

export default InboxPage;
