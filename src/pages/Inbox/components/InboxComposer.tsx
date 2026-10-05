import React from 'react';
import { Send, Loader2, Paperclip, StickyNote, X, MessagesSquare, Reply, Sparkles, ShoppingCart, AlertTriangle, Package, Wrench } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { Label } from '@/components/core/ui/label';
import { slashCommandMatches, slashTokenAtCaret } from '../inboxSlashCommands';
import { formatDate, formatTime } from '@/utils/datetime';
import { CatalogPicker, EmojiPicker, SlashCommandMenu } from './ComposerPickers';
import type { InboxPageState } from '../useInboxPage';


export const InboxComposer: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    activeId,
    labels,
    activeThread,
    waWindow,
    draft,
    setDraft,
    isNote,
    setIsNote,
    composerRef,
    sending,
    attachment,
    setAttachment,
    replyTo,
    setReplyTo,
    aiDrafting,
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
    isMember,
    waBlocked,
    send,
    aiSuggest,
    chooseSlashCommand,
    togglePendingCard,
  } = s;
  return (
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
  );
};
