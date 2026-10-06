import React, { useEffect, useState } from 'react';
import {
  Loader2, Paperclip, StickyNote, X, MessagesSquare, Reply, ReplyAll, Sparkles, ShoppingCart, AlertTriangle,
  Package, Wrench, ChevronDown, Type, Trash2, FileText, Image as ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { slashCommandMatches, slashTokenAtCaret } from '../inboxSlashCommands';
import { formatDate, formatTime } from '@/utils/datetime';
import { CatalogPicker, EmojiPicker, SlashCommandMenu } from './ComposerPickers';
import { WhatsAppTemplateDialog } from './WhatsAppTemplateDialog';
import { EmailFormatBar, EmailPreview } from './EmailFormatBar';
import { SendSplitButton } from './SendSplitButton';
import { ComposerInsertMenu } from './ComposerInsertMenu';
import { useFileDrop } from '../useFileDrop';
import { TrackOpensToggle } from './OpenTracking';
import { RewriteMenu } from './AssistTools';
import { addComposerFiles, composerTakesFiles } from '../composerAttachments';
import { formatBytes } from '../gmail/mailParts';
import { inboxApi } from '@/services/inboxApi';
import { ComposerSettingsPopover } from './ComposerSettingsPopover';
import { useReplyAutocomplete } from '../useReplyAutocomplete';
import { Checkbox } from '@/components/core/ui/checkbox';
import type { InboxPageState } from '../useInboxPage';

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', social: 'Social', internal: 'Team chat' };
const FORMAT_KEY = 'inbox.composer.formatBar';
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';

function readFormatPref(): boolean {
  let stored: string | null = null;
  try { stored = localStorage.getItem(FORMAT_KEY); } catch { /* per-viewer convenience only */ }
  return stored !== '0';
}

export const InboxComposer: React.FC<{ s: InboxPageState }> = ({ s }) => {
  const {
    activeId, labels, activeThread, waWindow, draft, setDraft, isNote, setIsNote, composerRef, sending,
    attachments, setAttachments, replyTo, setReplyTo, isEmailReply, emailRecipients, emailCc, setEmailCc,
    emailBcc, setEmailBcc, emailCopiesOpen, trackOpens, setTrackOpens, setEmailCopiesOpen, replyAll,
    templateOpen, setTemplateOpen, scheduleSend, emailPreview, setEmailPreview, openThread, threadDisplayName,
    aiDrafting, aiDraftShown, setAiDraftShown, draftSteer, setDraftSteer, draftSteerOpen, setDraftSteerOpen,
    pendingCards, setPendingCards, slashMenu, setSlashMenu, isMember, waBlocked, send, sendAndClose,
    discardDraft, aiSuggest, chooseSlashCommand, togglePendingCard, composerSettings, includeSignature, setIncludeSignature,
  } = s;
  const { toast } = useToast();
  const [formatOpen, setFormatOpen] = useState(readFormatPref);
  const takesFiles = composerTakesFiles(activeThread.channel, isNote);
  const addFiles = (incoming: File[]) => {
    if (!takesFiles || !incoming.length) return;
    const { files, refused } = addComposerFiles(attachments, incoming);
    setAttachments(files);
    if (refused) toast({ title: 'Some files were not attached', description: refused, variant: 'destructive' });
  };
  const { dragging, dropProps } = useFileDrop(addFiles);
  const [scrolled, setScrolled] = useState(false);
  const { suggestion, dismiss } = useReplyAutocomplete({
    optedIn: composerSettings.settings.autocomplete_enabled,
    enabled: isMember && !isNote && !waBlocked && !emailPreview && !slashMenu,
    threadId: activeId,
    draft,
    textareaRef: composerRef,
  });
  const signature = composerSettings.settings.email_signature.trim();
  useEffect(() => {
    if (takesFiles || !attachments.length) return;
    setAttachments([]);
    toast({ title: 'Files removed', description: 'A social reply carries text only. Attach files to a private note instead.' });
  }, [takesFiles, attachments.length, setAttachments, toast]);

  const meta = activeThread.metadata as Record<string, unknown> | null;
  const isPublicComment = activeThread.channel === 'social' && meta?.social_kind === 'comments';
  // Email is written in paragraphs, so Enter is a new line there and only Mod+Enter sends.
  const enterSends = !(activeThread.channel === 'email' && !isNote);
  const hasContent = !!draft.trim() || attachments.length > 0 || pendingCards.length > 0;
  const canSend = !sending && !waBlocked && hasContent;
  const dirty = hasContent || !!replyTo;

  const toggleFormat = () => {
    if (formatOpen) setEmailPreview(false);
    setFormatOpen((v) => {
      try { localStorage.setItem(FORMAT_KEY, v ? '0' : '1'); } catch { /* per-viewer convenience only */ }
      return !v;
    });
  };
  const discard = () => {
    if (draft.trim().length > 80 && !window.confirm('Discard this reply? The text will be lost.')) return;
    discardDraft();
    composerRef.current?.focus();
  };
  const toNote = () => { setIsNote(true); setPendingCards([]); setSlashMenu(null); };

  const recipient = isNote
    ? <span className="text-warning">Only your team sees this</span>
    : isEmailReply && emailRecipients
      ? (
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">To </span>
          <span className="font-medium text-foreground">{emailRecipients.to || '—'}</span>
          {emailRecipients.from && <span className="text-muted-foreground"> · from {emailRecipients.from}</span>}
        </span>
      )
      : (
        <span className="min-w-0 truncate text-muted-foreground">
          to <span className="font-medium text-foreground">{threadDisplayName(activeThread)}</span>
          {' · '}{CHANNEL_LABEL[activeThread.channel] ?? activeThread.channel}
        </span>
      );

  return (
    <div {...dropProps} className="border-t border-hairline bg-surface-sunken p-3 space-y-2 shrink-0">
      {isPublicComment && !isNote && (
        <div className="text-xs bg-pink-500/10 dark:bg-pink-500/15 border border-pink-500/25 dark:border-pink-500/30 text-pink-700 dark:text-pink-300 rounded-sm px-3 py-2 flex items-start gap-1.5">
          <MessagesSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            This posts publicly as a reply under your {String(meta?.platform ?? 'social')} post,
            visible to everyone. Keep order details and personal information out of it.
          </span>
        </div>
      )}

      {activeThread.channel === 'whatsapp' && waWindow && !waWindow.open && !isNote && (
        <div className="text-xs bg-[hsl(var(--warning-bg))] border border-warning/25 text-warning rounded-sm px-3 py-2">
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
          {isMember && (
            <div className="mt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setTemplateOpen(true)}>Send a template</Button>
            </div>
          )}
        </div>
      )}
      {templateOpen && activeId && (
        <WhatsAppTemplateDialog
          threadId={activeId}
          onClose={() => setTemplateOpen(false)}
          onSent={() => { setTemplateOpen(false); openThread(activeId); }}
        />
      )}
      {!aiDraftShown && !isNote && activeThread.agent_state === 'suggesting' && activeThread.agent_draft_error && (
        <div className="flex items-start gap-2 text-xs bg-[hsl(var(--warning-bg))] text-warning rounded-sm px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>The assistant could not draft a reply here: {activeThread.agent_draft_error}</span>
        </div>
      )}
      {!aiDraftShown && !isNote && activeThread.agent_draft && activeThread.agent_draft_is_current === false && (
        <div className="flex items-start gap-2 text-xs bg-card text-muted-foreground rounded-sm px-3 py-2">
          <Sparkles className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>A draft was written here, then they wrote again — it answered the earlier message, so it was set aside.</span>
        </div>
      )}

      <div className={`relative rounded-sm border transition-shadow focus-within:ring-[3px] ${
        isNote ? 'border-warning/40 bg-[hsl(var(--warning-bg))] focus-within:ring-warning/20' : 'border-hairline bg-card focus-within:border-primary focus-within:ring-primary/20'
      }${dragging && takesFiles ? ' ring-2 ring-primary/40' : ''}`}>
        {dragging && takesFiles && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-sm bg-card/90 text-sm text-primary pointer-events-none">
            <Paperclip className="w-4 h-4 mr-1.5" /> Drop files to attach
          </div>
        )}

        {/* Reply vs note is stated in words: sending a note to a customer is the costly mistake here. */}
        {isMember && (
          <div className="flex items-center gap-2 px-2 py-1.5 border-b border-hairline text-xs">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" className={`inline-flex items-center gap-1 rounded-sm px-1.5 py-1 font-semibold hover:bg-surface-hover ${isNote ? 'text-warning' : 'text-foreground'}`}>
                  {isNote ? <StickyNote className="w-3.5 h-3.5" /> : <Reply className="w-3.5 h-3.5" />}
                  {isNote ? 'Private note' : 'Reply'}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => setIsNote(false)}>
                  <Reply className="w-4 h-4 mr-2" /> Reply
                </DropdownMenuItem>
                {activeThread.channel === 'email' && !!emailRecipients?.replyAllCc.length && (
                  <DropdownMenuItem onSelect={() => { setIsNote(false); replyAll(); }} title={emailRecipients.replyAllCc.join(', ')}>
                    <ReplyAll className="w-4 h-4 mr-2" /> Reply all ({emailRecipients.replyAllCc.length})
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={toNote}>
                  <StickyNote className="w-4 h-4 mr-2" /> Private note
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {recipient}
            {isEmailReply && (
              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                <TrackOpensToggle on={trackOpens} onChange={setTrackOpens} className="h-6" />
                {!emailCopiesOpen && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setEmailCopiesOpen(true)}>Cc / Bcc</Button>
                )}
              </span>
            )}
          </div>
        )}

        {isEmailReply && emailCopiesOpen && (
          <div className="grid grid-cols-[2.5rem_1fr] items-center gap-1.5 px-3 py-1.5 border-b border-hairline text-xs">
            <Label htmlFor="inbox-cc" className="text-xs text-muted-foreground">Cc</Label>
            <Input id="inbox-cc" value={emailCc} onChange={(e) => setEmailCc(e.target.value)} placeholder="name@company.com, …" className="h-7 text-xs" />
            <Label htmlFor="inbox-bcc" className="text-xs text-muted-foreground">Bcc</Label>
            <Input id="inbox-bcc" value={emailBcc} onChange={(e) => setEmailBcc(e.target.value)} placeholder="name@company.com, …" className="h-7 text-xs" />
          </div>
        )}

        {aiDraftShown && !isNote && (
          <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 border-b border-primary/20">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI draft — review and edit before you send.</span>
            <button onClick={() => { setDraft(''); setAiDraftShown(false); }} className="inline-flex items-center gap-1 hover:underline shrink-0">
              <X className="w-3 h-3" /> Reject
            </button>
          </div>
        )}

        {replyTo && (
          <div className="flex items-start gap-2 mx-3 mt-2 rounded-sm border-l-2 border-primary bg-surface-sunken px-2.5 py-1.5">
            <Reply className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[11px]">
              <span className="block text-muted-foreground">
                Replying to {labels.get(replyTo.sender_participant_id ?? '')?.label ?? 'this message'}
              </span>
              <span className="block truncate">{replyTo.body || (replyTo.attachments?.length ? 'Attachment' : '—')}</span>
            </span>
            <button onClick={() => setReplyTo(null)} className="shrink-0 hover:text-foreground" title="Cancel reply">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {isEmailReply && formatOpen && (
          <div className="px-2 pt-1.5">
            <EmailFormatBar textareaRef={composerRef} value={draft} onChange={setDraft} preview={emailPreview} onPreview={setEmailPreview} />
          </div>
        )}

        <div className="relative">
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
          {isEmailReply && emailPreview ? (
            <div className="p-3"><EmailPreview value={draft} onEdit={() => setEmailPreview(false)} /></div>
          ) : (
            <div className="relative">
            {suggestion && !scrolled && (
              <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden px-3 py-2.5 text-sm whitespace-pre-wrap break-words">
                <span className="invisible">{draft}</span>
                <span className="text-muted-foreground/70">{suggestion}</span>
              </div>
            )}
            <Textarea
              ref={composerRef}
              resize="none"
              value={draft}
              onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
              onChange={(e) => {
                const v = e.target.value;
                setDraft(v);
                // A slash command is `/product` at the START of a line under the caret; a slash anywhere else is text.
                const tok = isMember && !isNote ? slashTokenAtCaret(v, e.target.selectionStart ?? v.length) : null;
                if (tok) setSlashMenu({ mode: 'commands', ...tok });
                else if (slashMenu?.mode === 'commands') setSlashMenu(null);
              }}
              onPaste={(e) => {
                const files = Array.from(e.clipboardData?.files ?? []);
                // Office copies a PNG rendition alongside the text; that is a text paste.
                if (!files.length || !takesFiles || e.clipboardData.types.includes('text/plain')) return;
                e.preventDefault();
                addFiles(files);
              }}
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (slashMenu?.mode === 'commands') {
                  if (e.key === 'Escape') { e.preventDefault(); setSlashMenu(null); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    const first = slashCommandMatches(slashMenu.query)[0];
                    if (first) { e.preventDefault(); chooseSlashCommand(first.kind); return; }
                  }
                }
                if (suggestion && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setDraft(draft + suggestion); dismiss(); return; }
                if (suggestion && e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
                if (e.key !== 'Enter') return;
                const mod = e.metaKey || e.ctrlKey;
                if (mod && e.shiftKey && isMember) { e.preventDefault(); if (canSend) void sendAndClose(); return; }
                if (mod || (enterSends && !e.shiftKey)) { e.preventDefault(); if (canSend) void send(); }
              }}
              placeholder={
                isNote ? 'Write a private note — only your team sees this…'
                  : waBlocked ? 'Reply window closed — template required'
                    : isMember ? 'Write a reply… type /product or /service to suggest one'
                      : 'Type a message…'
              }
              className="min-h-[76px] max-h-[40vh] [field-sizing:content] border-0 bg-transparent px-3 py-2.5 hover:border-0 focus-visible:ring-0 focus-visible:border-0"
              disabled={waBlocked}
            />
            </div>
          )}
        </div>

        {isEmailReply && signature && !emailPreview && (
          <div className="mx-3 mb-2 flex items-start gap-2 rounded-sm border-l-2 border-hairline pl-2.5">
            <Checkbox id="inbox-include-signature" checked={includeSignature} onCheckedChange={(v) => setIncludeSignature(v === true)} className="mt-0.5" aria-label="Include my signature" />
            <label htmlFor="inbox-include-signature" className={`min-w-0 flex-1 text-xs whitespace-pre-wrap ${includeSignature ? 'text-muted-foreground' : 'text-muted-foreground/50 line-through'}`}>
              {signature}
            </label>
          </div>
        )}

        {(attachments.length > 0 || pendingCards.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {attachments.map((f, i) => (
              <span key={`${f.name}-${f.size}-${f.lastModified}`} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken px-1.5 py-1 text-xs">
                {f.type.startsWith('image/') ? <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <FileText className="h-3.5 w-3.5 text-muted-foreground" />}
                <span className="max-w-[12rem] truncate">{f.name}</span>
                <span className="text-muted-foreground tabular-nums">{formatBytes(f.size)}</span>
                <button onClick={() => setAttachments(attachments.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-foreground" title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
            {pendingCards.map((c) => (
              <span key={c.product_id} className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken pl-1 pr-1.5 py-1 text-xs">
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

        <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5 border-t border-hairline">
          {isMember && !isNote && (
            <Popover open={draftSteerOpen} onOpenChange={setDraftSteerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  disabled={aiDrafting || waBlocked}
                  title="Let the assistant draft a reply you can edit before sending (1 credit)"
                  className="h-8 px-2 text-xs gap-1 text-primary"
                >
                  {aiDrafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Suggest reply
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3 space-y-2">
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
          {isMember && !isNote && (
            <>
              <RewriteMenu text={draft} disabled={waBlocked} onReplace={setDraft}
                run={async (mode, text) => (await inboxApi.assist(activeThread.id, mode, { text })).text} />
              <ComposerInsertMenu
                workspaceId={activeThread.workspace_id}
                currentText={draft}
                disabled={waBlocked}
                recipient={{ name: threadDisplayName(activeThread), email: emailRecipients?.to ?? null }}
                onInsert={(t) => setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${t}` : t))}
              />
              <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
            </>
          )}
          {isEmailReply && (
            <button type="button" onClick={toggleFormat} aria-pressed={formatOpen} title={formatOpen ? 'Hide formatting' : 'Show formatting'}
              className={`p-2 rounded-sm hover:bg-surface-hover ${formatOpen ? 'text-foreground bg-surface-hover' : 'text-muted-foreground'}`}>
              <Type className="w-4 h-4" />
            </button>
          )}
          <EmojiPicker disabled={waBlocked} onPick={(e) => setDraft((d) => d + e)} />
          {takesFiles && (
            <label className={`p-2 rounded-sm hover:bg-surface-hover ${waBlocked ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`} title="Attach files (or paste / drop them)">
              <Paperclip className="w-4 h-4 text-muted-foreground" />
              <input
                type="file" multiple className="hidden"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
                onChange={(e) => { addFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
              />
            </label>
          )}
          {isMember && !isNote && (
            <button
              type="button"
              onClick={() => setSlashMenu((m) => (m?.mode === 'picker' ? null : { mode: 'picker', kind: 'product' }))}
              disabled={waBlocked}
              className="p-2 rounded-sm hover:bg-surface-hover disabled:opacity-40"
              title="Suggest a product or service (or type /product, /service)"
              aria-pressed={slashMenu?.mode === 'picker'}
            >
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {isMember && <ComposerSettingsPopover settings={composerSettings.settings} save={composerSettings.save} />}

          <span className="ml-auto flex items-center gap-1.5">
            <span className="hidden xl:inline text-[11px] text-muted-foreground">
              {suggestion ? 'Tab to accept · Esc to dismiss'
                : enterSends ? 'Enter to send · Shift+Enter for a new line' : `${MOD_KEY}+Enter to send`}
            </span>
            {dirty && (
              <button type="button" onClick={discard} title="Discard this reply"
                className="p-2 rounded-sm text-muted-foreground hover:text-destructive hover:bg-surface-hover">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <SendSplitButton
              label={isNote ? 'Add note' : 'Send'}
              sending={sending}
              disabled={!canSend}
              modKey={MOD_KEY}
              onSend={() => { void send(); }}
              onSendAndClose={isMember ? () => { void sendAndClose(); } : undefined}
              onSchedule={isMember && !isNote && !waBlocked ? (d) => { void scheduleSend(d); } : undefined}
              scheduleBlockedReason={pendingCards.length ? 'Catalog cards cannot be scheduled — send now, or remove them first.' : null}
            />
          </span>
        </div>
      </div>
    </div>
  );
};
