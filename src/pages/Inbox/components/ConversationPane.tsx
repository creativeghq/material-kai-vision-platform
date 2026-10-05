import React, { useEffect, useState } from 'react';
import { Loader2, MessageSquare, User as UserIcon, ArrowLeft, Archive, Pin, CalendarClock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { inboxThreadSource } from '../inboxSource';
import { formatDate, formatTime } from '@/utils/datetime';
import { inboxApi } from '@/services/inboxApi';
import { avatarTint } from '../inboxFormat';
import { LabelChips, SourceTag, ThreadAvatar } from './InboxPrimitives';
import { MessageBubble } from './MessageBubble';
import { EmailMessageCard } from './EmailMessageCard';
import type { InboxPageState } from '../useInboxPage';
import { InboxComposer } from './InboxComposer';
import { ConversationActions } from './ConversationActions';

export const ConversationPane: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    toast,
    myUserId,
    starredIds,
    setForwarding,
    activeId,
    messages,
    labels,
    activeThread,
    loadingThread,
    setReplyTo,
    setShowDetails,
    backToList,
    isMember,
    loadThreads,
    openThread,
    messageMoods,
    listRef,
    contentRef,
    olderCursor,
    loadingOlder,
    loadOlderMessages,
    stickToBottom,
    togglePin,
    toggleStar,
    deleteMessage,
    addToNote,
    activeThreadLabels,
    isCommentThread,
    handlePrivateReply,
    handleToggleHidden,
    threadDisplayName,
    activeCount,
    pinnedMessage,
  } = s;
  const showMemberControls = isMember && !!activeThread;
  const isEmail = activeThread?.channel === 'email';
  const [openMail, setOpenMail] = useState<Set<string>>(new Set());
  useEffect(() => { setOpenMail(new Set()); }, [activeId]);
  const mailIds = isEmail ? messages.filter((x) => x.message_type === 'text' || x.message_type === 'agent').map((x) => x.id) : [];
  const lastMailId = mailIds[mailIds.length - 1];
  return (
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
            {showMemberControls && <div className="hidden md:flex items-center gap-1.5"><ConversationActions s={s} /></div>}
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
            className="flex-1 overflow-y-auto overflow-x-hidden p-4"
            onScroll={(e) => {
              // "Near enough" rather than exact: a fractional scrollHeight (any zoom level,
              // any sub-pixel row height) never satisfies an equality check, so an exact
              // test would decide the reader had scrolled up while they sat at the bottom.
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
              if (el.scrollTop < 120 && olderCursor && !loadingOlder) void loadOlderMessages();
            }}
          >
            <div ref={contentRef} className="space-y-3">
            {olderCursor && !loadingThread && (
              <div className="flex justify-center py-1">
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={loadingOlder} onClick={() => { void loadOlderMessages(); }}>
                  {loadingOlder ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Load earlier messages'}
                </Button>
              </div>
            )}
            {isEmail && !loadingThread && (
              <h1 className="font-sans text-xl sm:text-2xl font-semibold leading-tight break-words pb-1">
                {activeThread.subject || threadDisplayName(activeThread)}
              </h1>
            )}
            {loadingThread ? (
              <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : messages.map((m) => (isEmail && (m.message_type === 'text' || m.message_type === 'agent') ? (
              <EmailMessageCard
                key={m.id} m={m}
                info={m.sender_participant_id ? labels.get(m.sender_participant_id) : undefined}
                ours={(() => {
                  const info = m.sender_participant_id ? labels.get(m.sender_participant_id) : undefined;
                  return activeThread.thread_type !== 'internal'
                    ? (info?.kind === 'member' || info?.kind === 'agent')
                    : (info?.userId != null && info.userId === myUserId);
                })()}
                collapsed={m.id !== lastMailId && !openMail.has(m.id)}
                onToggle={() => setOpenMail((cur) => {
                  const n = new Set(cur);
                  if (n.has(m.id)) n.delete(m.id); else n.add(m.id);
                  return n;
                })}
                workspaceId={activeThread.workspace_id}
                starred={starredIds.has(m.id)}
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
                onForward={isMember ? (msg) => setForwarding(msg) : undefined}
                onTogglePin={isMember ? togglePin : undefined}
                onToggleStar={toggleStar}
                onAddToNote={isMember ? addToNote : undefined}
                onDelete={isMember ? deleteMessage : undefined}
              />
            ) : (
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
            )))}
            </div>
          </div>

          {/* Composer */}
          <InboxComposer s={s} />
        </>
      )}
    </div>
  );
};
