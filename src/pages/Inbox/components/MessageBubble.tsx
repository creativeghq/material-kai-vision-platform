import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Lock, Paperclip, Bot, EyeOff, Eye, Reply, Trash2, MoreHorizontal, Forward, Pin, PinOff, Star, StickyNote as StickyNoteIcon, Smile, Copy } from 'lucide-react';
import { EmailHtmlView } from './EmailHtmlView';
import { InboxCatalogCards, readInboxCards } from '@/modules/messaging/components/InboxCatalogCards';
import { splitMessageLinks, messageUrls, shortenUrlForDisplay } from '@/utils/messageLinks';
import { castSeedForSender } from '@/utils/characterAvatar';
import { moodStyle } from '@/utils/conversationMood';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { inboxThreadSource } from '../inboxSource';
import { formatDate, formatTime } from '@/utils/datetime';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/core/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/core/ui/dropdown-menu';
import { inboxApi, signInboxAttachment, type InboxThread, type InboxMessage, type InboxLinkPreview } from '@/services/inboxApi';
import { avatarTint, castAvatarSrc, initials } from '../inboxFormat';
import { DeliveryState, ParticipantLabel, SourceTag } from './InboxPrimitives';
import { AttachmentView } from './AttachmentView';
import { ThreadEventCard, classifyThreadEvent } from './ThreadEventCard';

// ──────────────────────────────────────────────────────────────────────────
// Message bubble
// ──────────────────────────────────────────────────────────────────────────

/** A message body, with its links as links — and as the page they point at. */
export const MessageBody: React.FC<{ body: string; threadId: string | null }> = ({ body, threadId }) => {
  const segments = useMemo(() => splitMessageLinks(body), [body]);
  // The FIRST link only. A card per URL turns a message with five links into a wall nobody
  // reads, and the first one is the one the sentence is about.
  const previewUrl = useMemo(() => messageUrls(body, 1)[0] ?? null, [body]);
  const [preview, setPreview] = useState<InboxLinkPreview | null>(null);

  useEffect(() => {
    if (!previewUrl || !threadId) { setPreview(null); return; }
    let alive = true;
    // Never blocks or reports: a preview is an enrichment, and a thread that cannot reach the
    // preview endpoint must still render its messages. The reason lives on the row we cached.
    inboxApi.linkPreview(threadId, previewUrl)
      .then((r) => { if (alive) setPreview(r.preview); })
      .catch(() => { if (alive) setPreview(null); });
    return () => { alive = false; };
  }, [previewUrl, threadId]);

  const card = preview && preview.cache_status === 'ok' && (preview.title || preview.image_url)
    ? preview
    : null;

  return (
    <>
      <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
        {segments.map((seg, i) => (
          seg.kind === 'text' ? (
            <React.Fragment key={i}>{seg.value}</React.Fragment>
          ) : (
            <a
              key={i}
              href={seg.href}
              target="_blank"
              // `noopener` closes `window.opener` on a page we do not control; `nofollow` because
              // a customer's link is not our endorsement.
              rel="noopener noreferrer nofollow"
              title={seg.href}
              className="underline underline-offset-2 decoration-current/40 hover:decoration-current break-all"
            >
              {shortenUrlForDisplay(seg.value)}
            </a>
          )
        ))}
      </div>
      {card && (
        <a
          href={preview.final_url || previewUrl || '#'}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-2 block overflow-hidden rounded-sm border border-hairline bg-surface-sunken
                     no-underline hover:bg-surface-hover transition-colors"
        >
          {card.image_url && (
            /* The remote image, not a copy of it. Ours to store would mean fetching, billing and
               garbage-collecting somebody else's picture for a card; `no-referrer` keeps the
               reader's page out of that site's logs, and an image that fails to load removes
               itself rather than leaving a broken frame in the conversation. */
            <img
              src={card.image_url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-full max-h-44 object-cover bg-surface-hover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="px-3 py-2 space-y-0.5">
            {card.site_name && (
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground truncate">
                {card.site_name}
              </div>
            )}
            {card.title && (
              <div className="text-[13px] font-medium leading-snug line-clamp-2">{card.title}</div>
            )}
            {card.description && (
              <div className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
                {card.description}
              </div>
            )}
          </div>
        </a>
      )}
    </>
  );
};

/** Where does this message go? */
export const ForwardDialog: React.FC<{
  message: InboxMessage | null;
  threads: InboxThread[];
  currentThreadId: string | null;
  onClose: () => void;
  onForwarded: (toThreadId: string) => void;
}> = ({ message, threads, currentThreadId, onClose, onForwarded }) => {
  const { toast } = useToast();
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const options = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads
      .filter((t) => t.id !== currentThreadId && !t.archived_at)
      .filter((t) => !q || (t.subject || '').toLowerCase().includes(q))
      .slice(0, 50);
  }, [threads, currentThreadId, query]);

  const forward = async (toThreadId: string) => {
    if (!message || !currentThreadId) return;
    setBusy(toThreadId);
    try {
      await inboxApi.forwardMessage(currentThreadId, message.id, toThreadId);
      toast({ title: 'Forwarded' });
      onForwarded(toThreadId);
      onClose();
    } catch (e) {
      toast({ title: 'Could not forward', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={!!message} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Forward message</DialogTitle>
          <DialogDescription>
            It is sent as a new message in the conversation you pick, and marked as forwarded.
          </DialogDescription>
        </DialogHeader>
        {message?.body && (
          <div className="text-xs text-muted-foreground border border-hairline rounded-sm px-3 py-2 max-h-20 overflow-y-auto whitespace-pre-wrap break-words">
            {message.body}
          </div>
        )}
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="h-9"
        />
        <div className="max-h-64 overflow-y-auto -mx-1 px-1 space-y-0.5">
          {options.length === 0 ? (
            /* `filtered`, not `empty`: the conversations exist, this search excluded them. So it
               offers the way BACK — never a "start a conversation", which is how you end up with
               a second thread for a customer you already have one with. */
            <div className="px-2 py-6 text-center space-y-2">
              <div className="text-xs text-muted-foreground">
                {query.trim() ? 'No conversation matches that search.' : 'No other conversation to forward to.'}
              </div>
              {query.trim() && (
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>Clear search</Button>
              )}
            </div>
          ) : options.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!!busy}
              onClick={() => forward(t.id)}
              className="w-full text-left flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-surface-hover disabled:opacity-50"
            >
              <SourceTag source={inboxThreadSource(t)} />
              <span className="text-sm truncate flex-1 min-w-0">
                {t.subject || `${inboxThreadSource(t).label} conversation`}
              </span>
              {busy === t.id && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
            </button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

/**
 * The actions WhatsApp has on a message and this inbox did not: react, reply, copy.
 *
 * On hover rather than always-on — a row of buttons under every bubble turns a conversation into a
 * control panel, and the thing people read a thread for is the words. Keyboard-reachable because
 * hover-only is unusable without a mouse: the group is focusable and the bar shows on focus too.
 */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

export const MessageActions: React.FC<{
  onReply?: () => void;
  onReact?: (emoji: string) => void;
  onCopy?: () => void;
  /** Send it into another conversation. Member-only, so absent for a customer. */
  onForward?: () => void;
  /** Top of the conversation, for everyone. `pinned` flips the label and the icon. */
  onTogglePin?: () => void;
  pinned?: boolean;
  /** My own bookmark. Visible to nobody else — see `pin` for why they are different things. */
  onToggleStar?: () => void;
  starred?: boolean;
  /** Quote it into a private note in the composer. */
  onAddToNote?: () => void;
  /** Remove from THIS inbox. Never an unsend — the copy says so. */
  onDelete?: () => void;
  ours: boolean;
}> = ({
  onReply, onReact, onCopy, onForward, onTogglePin, pinned, onToggleStar, starred,
  onAddToNote, onDelete, ours,
}) => {
  const [pickingEmoji, setPickingEmoji] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /*
   * Three buttons and a menu, which is the shape WhatsApp uses and for its reason: react, reply
   * and copy are what you reach for constantly, and the rest are deliberate acts that are worth
   * one more click and a readable label. Eight icons in a row on a 36px bar would be a puzzle.
   */
  const hasMenu = !!(onForward || onTogglePin || onToggleStar || onAddToNote || onDelete);
  return (
    <div
      /*
       * Anchored on the side AWAY from the avatar, which is the opposite of where it started.
       * The row is `flex-row-reverse` for our own messages, so the avatar is on the RIGHT there
       * and on the LEFT for everyone else's — and the bar was pinned to `right` / `left`
       * respectively, i.e. on top of the avatar in both cases. On an incoming message that put
       * three 14px buttons over the sender's face and their name, which is why the actions read
       * as "ours only": on our side they landed over blank gutter and looked deliberate.
       */
      className={`absolute -top-3 ${ours ? 'left-2' : 'right-2'} z-20 items-center gap-0.5
                  rounded-full border border-hairline bg-card px-1 py-0.5 shadow-overlay
                  ${pickingEmoji || menuOpen ? 'flex' : 'hidden group-hover/msg:flex group-focus-within/msg:flex'}`}
    >
      {onReact && (
        <Popover open={pickingEmoji} onOpenChange={setPickingEmoji}>
          <PopoverTrigger asChild>
            <button type="button" title="React" className="p-1 rounded-full hover:bg-surface-hover">
              <Smile className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          {/* Opens back over the bubble rather than off the edge of the pane — mirrored with
              the anchor above, so flipping one without the other cannot push it out of view.
              Upward, because the default (`bottom`) drops the emoji row straight over the words
              you are reacting to; Radix flips it back down by itself at the top of the pane. */}
          <PopoverContent className="w-auto p-1.5" side="top" sideOffset={6} align={ours ? 'start' : 'end'}>
            <div className="flex gap-0.5">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e} type="button"
                  onClick={() => { onReact(e); setPickingEmoji(false); }}
                  className="text-lg leading-none rounded-sm px-1.5 py-1 hover:bg-surface-hover"
                >
                  {e}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
      )}
      {onReply && (
        <button type="button" title="Reply to this message" onClick={onReply}
                className="p-1 rounded-full hover:bg-surface-hover">
          <Reply className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      {onCopy && (
        <button type="button" title="Copy text" onClick={onCopy}
                className="p-1 rounded-full hover:bg-surface-hover">
          <Copy className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      {hasMenu && (
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button type="button" title="More" className="p-1 rounded-full hover:bg-surface-hover">
              <MoreHorizontal className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={ours ? 'start' : 'end'} className="w-52">
            {onForward && (
              <DropdownMenuItem onSelect={onForward}>
                <Forward className="w-3.5 h-3.5 mr-2" /> Forward
              </DropdownMenuItem>
            )}
            {onTogglePin && (
              <DropdownMenuItem onSelect={onTogglePin}>
                {pinned
                  ? <><PinOff className="w-3.5 h-3.5 mr-2" /> Unpin</>
                  : <><Pin className="w-3.5 h-3.5 mr-2" /> Pin to top</>}
              </DropdownMenuItem>
            )}
            {onToggleStar && (
              <DropdownMenuItem onSelect={onToggleStar}>
                <Star className={`w-3.5 h-3.5 mr-2 ${starred ? 'fill-current' : ''}`} />
                {starred ? 'Remove star' : 'Star'}
              </DropdownMenuItem>
            )}
            {onAddToNote && (
              <DropdownMenuItem onSelect={onAddToNote}>
                <StickyNoteIcon className="w-3.5 h-3.5 mr-2" /> Add text to note
              </DropdownMenuItem>
            )}
            {onDelete && (
              <>
                <DropdownMenuSeparator />
                {/* Named for what it does. A delivered WhatsApp message stays on the customer's
                    phone — the provider gives us no unsend — and "Delete" alone would have the
                    operator believe they had retracted something they had not. */}
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 className="w-3.5 h-3.5 mr-2" /> Remove from this inbox
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

export const MessageBubble: React.FC<{
  m: InboxMessage;
  info?: ParticipantLabel;
  myUserId: string | null;
  isCustomerThread: boolean;
  /** Re-read the thread after an attachment is fetched, so the file replaces the placeholder. */
  onAttachmentsRepaired?: () => void;
  /** Quote this message in the composer. */
  onReplyTo?: (m: InboxMessage) => void;
  /** React to it. One per person per message — a second replaces the first. */
  onReact?: (m: InboxMessage, emoji: string) => void;
  /** Present only on a social COMMENT thread — a DM has neither affordance. */
  onPrivateReply?: (m: InboxMessage) => void;
  onToggleHidden?: (m: InboxMessage, hidden: boolean) => void;
  /** Send it into another conversation. Member-only — absent means the menu item is not offered. */
  onForward?: (m: InboxMessage) => void;
  /** Pin is the CONVERSATION's ("read this first"); star is MINE. Two different things, two props. */
  onTogglePin?: (m: InboxMessage, pinned: boolean) => void;
  onToggleStar?: (m: InboxMessage, starred: boolean) => void;
  starred?: boolean;
  /** Quote it into a private note in the composer. */
  onAddToNote?: (m: InboxMessage) => void;
  onDelete?: (m: InboxMessage) => void;
  /** This message's own read mood, from the conversation analysis. Absent = never analysed. */
  mood?: string | null;
  /** The thread's workspace, for the expense a classified supplier invoice can become. */
  workspaceId?: string;
  /** Offered on a handoff event when the caller does not already own the conversation. */
  onTakeOver?: () => void;
}> = ({
  m, info, myUserId, isCustomerThread, onAttachmentsRepaired, onReplyTo, onReact,
  onPrivateReply, onToggleHidden, mood, onForward, onTogglePin, onToggleStar, starred,
  onAddToNote, onDelete, workspaceId, onTakeOver,
}) => {
  const { toast } = useToast();
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
  const emailHtml = typeof meta.email_html === 'string' && meta.email_html.trim() ? meta.email_html : null;
  const [showPlain, setShowPlain] = useState(false);
  // A channel placeholder standing in for media, with nothing attached to show for it. Both
  // halves matter: once the attachment IS captured, the bubble should render the file rather
  // than keep apologising for it.
  const mediaPlaceholder = meta.attachment_unresolved === true
    && (m.attachments || []).length === 0;
  // Emoji reacted onto THIS message. Written by the reaction.received webhook against the message
  // the reaction names, so they render on it rather than as a message of their own.
  const reactions: string[] = Array.isArray(meta.reactions)
    ? (meta.reactions as unknown[]).filter((r): r is string => typeof r === 'string' && !!r)
    : [];
  const externalAuthor = !m.sender_participant_id && typeof meta.author_handle === 'string'
    ? (meta.author_handle as string)
    : null;
  // A pin is on the message and visible to the whole team; a star is the caller's and arrives as
  // a prop, because it is resolved per person server-side.
  const isPinned = typeof meta.pinned_at === 'string' && !!meta.pinned_at;
  const isForwarded = !!meta.forwarded_from;
  const displayLabel = info?.label ?? externalAuthor ?? undefined;

  const event = isSystem ? classifyThreadEvent(m) : null;
  if (event) return <ThreadEventCard m={m} event={event} onTakeOver={onTakeOver} />;
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

  /* Bubbles carry weight now: a solid accent fill on our side, a clean raised card on theirs. */
  const bubbleClass = isNote
    ? 'bg-amber-bg/60 border border-amber/30 rounded-2xl rounded-tl-md'
    : isAgent
      ? 'bg-primary/10 border border-primary/25 rounded-2xl rounded-tl-md'
      : ours
        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-md shadow-overlay'
        : 'bg-card border border-hairline rounded-2xl rounded-bl-md shadow-overlay';

  /*
   * The message's own mood, as a bar UNDER the bubble.
   *
   * A border on all four sides fights the fill and turns every message into a boxed alert. A
   * single 3px bar along the bottom edge reads as an underline on the sentence — present when it
   * matters, invisible when the mood is neutral.
   *
   * Deliberately NOT shown on our own messages: it is the CUSTOMER's temperature being reported,
   * and colouring our replies with it would suggest we were the ones who sounded angry.
   */
  const moodStyleForMessage = (!ours && mood && mood !== 'neutral') ? moodStyle(mood) : null;

  return (
    /* `w-fit`, and it is load-bearing rather than tidiness. */
    <div
      id={`inbox-msg-${m.id}`}
      className={`group/msg relative flex w-fit gap-2.5 max-w-[82%] ${ours ? 'ml-auto flex-row-reverse' : ''}`}
    >
      {!isSystem && (
        <MessageActions
          ours={ours}
          onReply={onReplyTo ? () => onReplyTo(m) : undefined}
          onReact={onReact ? (e) => onReact(m, e) : undefined}
          onCopy={m.body ? () => {
            void navigator.clipboard.writeText(m.body ?? '');
            toast({ title: 'Copied' });
          } : undefined}
          onForward={onForward ? () => onForward(m) : undefined}
          onTogglePin={onTogglePin ? () => onTogglePin(m, !isPinned) : undefined}
          pinned={isPinned}
          onToggleStar={onToggleStar ? () => onToggleStar(m, !starred) : undefined}
          starred={starred}
          onAddToNote={onAddToNote && m.body ? () => onAddToNote(m) : undefined}
          onDelete={onDelete ? () => onDelete(m) : undefined}
        />
      )}
      {/*
        Avatar column: the face, with the timestamp beneath it.
        In the reference layout the time lives under the avatar rather than trailing the text —
        it keeps the bubble to just the words, and it gives every row the same left edge whatever
        length the message is.
      */}
      <div className="flex flex-col items-center gap-1 shrink-0 mt-5">
      <Avatar className="h-9 w-9 shrink-0 ring-1 ring-hairline">
        {/*
          * A member's own photo, which was never selected from user_profiles — so every operator
          * in every thread rendered as initials no matter what they had uploaded. Failing that, a
          * generated mark: the customer's real photo is not obtainable from WhatsApp at all, so a
          * row of grey initials is the permanent state rather than a brief one.
          */}
        {!isAgent && (
          <AvatarImage
            src={info?.avatarUrl || castAvatarSrc(castSeedForSender(m, displayLabel), info?.avatarSlot)}
            alt={displayLabel ?? ''}
            className="object-cover"
          />
        )}
        <AvatarFallback className={`text-[10px] ${isAgent ? 'bg-primary/15 text-primary' : avatarTint(displayLabel)}`}>
          {isAgent ? <Bot className="w-4 h-4" /> : initials(displayLabel)}
        </AvatarFallback>
      </Avatar>
        <span className="text-[10px] text-muted-foreground tabular-nums leading-none">
          {formatTime(m.created_at)}
        </span>
      </div>
      <div className={`flex flex-col min-w-0 gap-1 ${ours ? 'items-end' : 'items-start'}`}>
        {(isPinned || isForwarded || starred) && (
          /* Stated on the message, because all three are invisible otherwise and each changes
             how the words should be read: pinned means the team was asked to look at it,
             forwarded means they were written to somebody else, starred means I marked it. */
          <div className="text-[10px] text-muted-foreground px-1 flex items-center gap-2">
            {isPinned && <span className="inline-flex items-center gap-1"><Pin className="w-2.5 h-2.5" /> Pinned</span>}
            {isForwarded && <span className="inline-flex items-center gap-1"><Forward className="w-2.5 h-2.5" /> Forwarded</span>}
            {starred && <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400"><Star className="w-2.5 h-2.5 fill-current" /> Starred</span>}
          </div>
        )}
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
        <div className={`relative overflow-hidden px-4 py-2.5 text-left ${bubbleClass}`}>
          {/*
            The mood, as a bar along the bottom INSIDE the bubble.
            Inside rather than under, so it reads as part of the message rather than a separate
            element, and `overflow-hidden` lets it follow the bubble's own rounding instead of
            poking out square at the corners.
          */}
          {moodStyleForMessage && (
            <span
              aria-hidden
              className={`absolute inset-x-0 bottom-0 h-[3px] ${moodStyleForMessage.bar}`}
            />
          )}
          {isNote && <div className="flex items-center gap-1 text-[10px] text-amber-foreground mb-1"><Lock className="w-3 h-3" /> Private note</div>}
          {isAgent && <div className="flex items-center gap-1 text-[10px] text-primary mb-1"><Bot className="w-3 h-3" /> KAI assistant</div>}
          {/* `[Unsupported message]` is the CHANNEL's placeholder for media, not something the
              customer typed — shown raw it reads as a fault in their phone. We now fetch the file
              from Zernio's attachment endpoint, so this only survives when that fetch has not
              succeeded yet, and it says exactly that rather than telling anyone to give up. */}
          {emailHtml && !showPlain ? (
            <EmailHtmlView
              html={emailHtml}
              sender={typeof meta.email_from === 'string' ? meta.email_from : null}
              onShowText={m.body ? () => setShowPlain(true) : undefined}
            />
          ) : m.body && (mediaPlaceholder ? (
            <div className="flex items-start gap-1.5 text-sm text-muted-foreground italic">
              <Paperclip className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>They sent a file. It has not been retrieved yet — re-run the import for this conversation to fetch it.</span>
            </div>
          ) : (
            <>
              {emailHtml && (
                <button type="button" className="mb-1 text-xs text-muted-foreground underline-offset-2 hover:underline" onClick={() => setShowPlain(false)}>
                  Show formatted
                </button>
              )}
              <MessageBody body={m.body} threadId={m.thread_id} />
            </>
          ))}
          {/* Catalog cards, as the customer saw them: name, image, THEIR price, the same link. */}
          <InboxCatalogCards cards={readInboxCards(m)} />
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
            return (
              <AttachmentView
                key={k || i} att={a} href={urls[k] || a.url}
                messageId={m.id} threadId={m.thread_id} workspaceId={workspaceId}
                onRepaired={onAttachmentsRepaired}
              />
            );
          })}
        </div>
        {/* Reactions sit ON the message they belong to, overlapping its lower edge the way every
            chat app puts them — a reaction is about that message, and a row of its own would read
            as a reply. Stored by the reaction.received webhook against the reacted-to message. */}
        {reactions.length > 0 && (
          <div className={`-mt-2 z-10 flex gap-0.5 ${ours ? 'mr-2 self-end' : 'ml-2 self-start'}`}>
            {reactions.map((emoji, i) => (
              <span
                key={`${emoji}-${i}`}
                className="rounded-full border border-hairline bg-card px-1.5 py-0.5 text-[11px] leading-none shadow-overlay"
              >
                {emoji}
              </span>
            ))}
          </div>
        )}
        {/*
          The clock time now sits under the avatar, so this row carries only what that cannot:
          the DATE (a thread spans months and "09:00" alone is ambiguous), the delivery state,
          and the message's read mood in words for anyone who cannot use the colour.
        */}
        <div className="text-[10px] px-1 text-muted-foreground flex items-center gap-1.5 flex-wrap">
          <span>{formatDate(m.created_at)}</span>
          {/* Only on OUR side, and only on a channel that reports back. An incoming message has
              no delivery state of ours to show, and an internal note never leaves the building. */}
          {ours && !isNote && <DeliveryState meta={meta} />}
          {moodStyleForMessage && (
            <span className="inline-flex items-center gap-1">
              <span aria-hidden>·</span>
              <span aria-hidden>{moodStyleForMessage.face}</span>
              <span>{moodStyleForMessage.label}</span>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
