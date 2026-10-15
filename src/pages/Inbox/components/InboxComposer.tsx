import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2, Paperclip, StickyNote, X, MessagesSquare, Reply, ReplyAll, Forward, Sparkles, ShoppingCart, AlertTriangle,
  Package, Wrench, ChevronDown, Type, Trash2, FileText, Image as ImageIcon, Plus,
} from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/core/ui/dropdown-menu';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { slashCommandMatches, slashTokenAtCaret } from '../inboxSlashCommands';
import { formatDate, formatTime } from '@/utils/datetime';
import { CatalogPicker, EmojiPicker, SlashCommandMenu } from './ComposerPickers';
import { WhatsAppTemplateDialog } from './WhatsAppTemplateDialog';
import { WhatsAppFormButton } from './WhatsAppFormDialog';
import { EmailFormatBar, EmailPreview } from './EmailFormatBar';
import { SendSplitButton } from './SendSplitButton';
import { ComposerInsertMenu } from './ComposerInsertMenu';
import { useFileDrop } from '../useFileDrop';
import { TrackOpensToggle } from './OpenTracking';
import { RewriteMenu } from './AssistTools';
import { addComposerFiles, composerTakesFiles } from '../composerAttachments';
import { formatBytes, RecipientInput } from '../gmail/mailParts';
import { ComposerSettingsPopover } from './ComposerSettingsPopover';
import { signaturePreviewText } from '../useComposerSettings';
import { useReplyAutocomplete } from '../useReplyAutocomplete';
import { Checkbox } from '@/components/core/ui/checkbox';
import { escapeHtml } from '@/utils/escapeHtml';
import { renderSignatureHtml, signatureDocument } from '@/utils/emailSignature';
import type { MailComposerModel } from '../composerModel';
import { FollowUpOnSend } from './FollowUpOnSend';
import { WritingScore } from './WritingScore';

const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', email: 'Email', social: 'Social', internal: 'Team chat' };
const FORMAT_KEY = 'inbox.composer.formatBar';
const MOD_KEY = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl';
const MODE_LABEL = { reply: 'Reply', all: 'Reply all', forward: 'Forward' } as const;

function readFormatPref(): boolean {
  let stored: string | null = null;
  try { stored = localStorage.getItem(FORMAT_KEY); } catch { /* per-viewer convenience only */ }
  return stored !== '0';
}

export const InboxComposer: React.FC<{ m: MailComposerModel }> = ({ m }) => {
  const {
    threadId, workspaceId, channel, threadMeta: meta, recipientName, agent, waWindow, waBlocked, isMember, isMobile,
    draft, setDraft, composerRef, sending, isNote, setIsNote, attachments, setAttachments, replyQuote, clearReplyQuote,
    email, ai, cards, templates, composerSettings, followUp, send, sendAndClose, schedule, discard: discardDraft, refresh,
  } = m;
  const { toast } = useToast();
  const [formatOpen, setFormatOpen] = useState(readFormatPref);
  const takesFiles = composerTakesFiles(channel, isNote);
  const addFiles = (incoming: File[]) => {
    if (!takesFiles || !incoming.length) return;
    const { files, refused } = addComposerFiles(attachments, incoming);
    setAttachments(files);
    if (refused) toast({ title: 'Some files were not attached', description: refused, variant: 'destructive' });
  };
  const { dragging, dropProps } = useFileDrop(addFiles);
  const [scrolled, setScrolled] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  useEffect(() => { setToolsOpen(false); }, [threadId]);
  const mobileTools = toolsOpen ? 'max-md:flex max-md:order-last max-md:flex-wrap max-md:items-center max-md:gap-0.5' : 'max-md:hidden';
  const isEmailReply = !!email && !isNote;
  const slashMenu = cards?.slashMenu ?? null;
  const pendingCards = cards?.pending ?? [];
  const { suggestion, dismiss } = useReplyAutocomplete({
    optedIn: composerSettings.settings.autocomplete_enabled,
    enabled: m.autocomplete && isMember && !isNote && !waBlocked && !email?.preview && !slashMenu,
    threadId,
    draft,
    textareaRef: composerRef,
  });
  const signature = signaturePreviewText(composerSettings.settings);
  const signatureCard = composerSettings.settings.signature_card;
  const signatureHtml = useMemo(() => (signatureCard ? renderSignatureHtml(signatureCard, escapeHtml) : ''), [signatureCard]);
  useEffect(() => {
    if (takesFiles || !attachments.length) return;
    setAttachments([]);
    toast({ title: 'Files removed', description: 'A social reply carries text only. Attach files to a private note instead.' });
  }, [takesFiles, attachments.length, setAttachments, toast]);

  const isPublicComment = channel === 'social' && meta?.social_kind === 'comments';
  const leadBlocked = channel === 'social' && meta?.social_kind === 'lead' && !isNote;
  // Email is written in paragraphs, so Enter is a new line there and only Mod+Enter sends.
  const enterSends = !(channel === 'email' && !isNote);
  const forwarding = isEmailReply && email.composeMode === 'forward';
  const hasContent = !!draft.trim() || attachments.length > 0 || pendingCards.length > 0;
  const missingRecipient = isEmailReply && !!email.setTo && email.to.length === 0;
  const missingSubject = forwarding && !!email.setSubject && !(email.subject ?? '').trim();
  const canSend = !sending && !waBlocked && !leadBlocked && hasContent && !missingRecipient && !missingSubject;
  const dirty = hasContent || !!replyQuote;

  const toggleFormat = () => {
    if (formatOpen) email?.setPreview(false);
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
  const toNote = () => { setIsNote?.(true); cards?.setPending([]); cards?.setSlashMenu(null); };
  const pickMode = (mode: 'reply' | 'all' | 'forward') => { setIsNote?.(false); email?.setComposeMode?.(mode); };

  const recipient = isNote
    ? <span className="text-warning">Only your team sees this</span>
    : isEmailReply && !email.setTo
      ? (
        <span className="min-w-0 truncate">
          <span className="text-muted-foreground">To </span>
          <span className="font-medium text-foreground">{email.to.join(', ') || '—'}</span>
          {email.from && <span className="text-muted-foreground"> · from {email.from}</span>}
        </span>
      )
      : isEmailReply
        ? (email.from ? <span className="min-w-0 truncate text-muted-foreground">from {email.from}</span> : <span />)
        : (
          <span className="min-w-0 truncate text-muted-foreground">
            to <span className="font-medium text-foreground">{recipientName}</span>
            {' · '}{CHANNEL_LABEL[channel] ?? channel}
          </span>
        );

  return (
    <div {...dropProps} className="border-t border-hairline bg-card md:bg-surface-sunken p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] md:p-3 space-y-2 shrink-0">
      {isPublicComment && !isNote && (
        <div className="text-xs bg-pink-500/10 dark:bg-pink-500/15 border border-pink-500/25 dark:border-pink-500/30 text-pink-700 dark:text-pink-300 rounded-sm px-3 py-2 flex items-start gap-1.5">
          <MessagesSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            This posts publicly as a reply under your {String(meta?.platform ?? 'social')} post,
            visible to everyone. Keep order details and personal information out of it.
          </span>
        </div>
      )}

      {leadBlocked && (
        <div className="text-xs bg-orange-500/10 dark:bg-orange-500/15 border border-orange-500/25 dark:border-orange-500/30 text-orange-800 dark:text-orange-300 rounded-sm px-3 py-2">
          A lead form has no conversation to reply into. Contact them with the details they gave
          {meta?.contact_email ? ` (${String(meta.contact_email)})` : ''}{meta?.contact_phone ? ` (${String(meta.contact_phone)})` : ''},
          or add them to the CRM from the side panel. Internal notes are still allowed.
        </div>
      )}

      {channel === 'whatsapp' && waWindow && !waWindow.open && !isNote && (
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
          {isMember && templates && (
            <div className="mt-2">
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => templates.setOpen(true)}>Send a template</Button>
            </div>
          )}
        </div>
      )}
      {templates?.open && (
        <WhatsAppTemplateDialog
          threadId={threadId}
          onClose={() => templates.setOpen(false)}
          onSent={() => { templates.setOpen(false); refresh(); }}
        />
      )}
      {!ai.draftShown && !isNote && agent.state === 'suggesting' && agent.draftError && (
        <div className="flex items-start gap-2 text-xs bg-[hsl(var(--warning-bg))] text-warning rounded-sm px-3 py-2">
          <AlertTriangle className="w-3.5 h-3.5 mt-px shrink-0" />
          <span>The assistant could not draft a reply here: {agent.draftError}</span>
        </div>
      )}
      {!ai.draftShown && !isNote && agent.draft && agent.draftIsCurrent === false && (
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
                  {isNote ? <StickyNote className="w-3.5 h-3.5" />
                    : forwarding ? <Forward className="w-3.5 h-3.5" />
                      : email?.composeMode === 'all' ? <ReplyAll className="w-3.5 h-3.5" /> : <Reply className="w-3.5 h-3.5" />}
                  {isNote ? 'Private note' : email ? MODE_LABEL[email.composeMode] : 'Reply'}
                  <ChevronDown className="w-3 h-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem onSelect={() => pickMode('reply')}>
                  <Reply className="w-4 h-4 mr-2" /> Reply
                </DropdownMenuItem>
                {email && email.replyAllCount > 0 && (
                  <DropdownMenuItem onSelect={() => pickMode('all')}>
                    <ReplyAll className="w-4 h-4 mr-2" /> Reply all ({email.replyAllCount})
                  </DropdownMenuItem>
                )}
                {email?.setSubject && (
                  <DropdownMenuItem onSelect={() => pickMode('forward')}>
                    <Forward className="w-4 h-4 mr-2" /> Forward
                  </DropdownMenuItem>
                )}
                {setIsNote && (
                  <DropdownMenuItem onSelect={toNote}>
                    <StickyNote className="w-4 h-4 mr-2" /> Private note
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {recipient}
            {isEmailReply && (
              <span className="ml-auto flex items-center gap-1.5 shrink-0">
                <TrackOpensToggle on={email.trackOpens} onChange={email.setTrackOpens} className="h-6" />
                {!email.copiesOpen && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => email.setCopiesOpen(true)}>Cc / Bcc</Button>
                )}
              </span>
            )}
          </div>
        )}

        {isEmailReply && (email.setTo || email.copiesOpen || (forwarding && email.setSubject)) && (
          <div className="px-3 py-0.5 border-b border-hairline">
            {email.setTo && <RecipientInput id="mail-to" label="To" value={email.to} onChange={email.setTo} known={email.known} autoFocus={forwarding} />}
            {email.copiesOpen && (
              <>
                <RecipientInput id="mail-cc" label="Cc" value={email.cc} onChange={email.setCc} known={email.known} />
                <RecipientInput id="mail-bcc" label="Bcc" value={email.bcc} onChange={email.setBcc} known={email.known} />
              </>
            )}
            {forwarding && email.setSubject && (
              <div className="flex items-center gap-2 py-1">
                <label htmlFor="mail-subject" className="text-xs text-muted-foreground w-8 shrink-0">Subj.</label>
                <input id="mail-subject" value={email.subject ?? ''} onChange={(e) => email.setSubject?.(e.target.value)}
                  className="flex-1 bg-transparent text-sm outline-none py-1 max-md:text-base" />
              </div>
            )}
          </div>
        )}

        {ai.draftShown && !isNote && (
          <div className="flex items-center justify-between gap-2 text-xs bg-primary/10 text-primary px-3 py-1.5 border-b border-primary/20">
            <span className="inline-flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" /> AI draft — review and edit before you send.</span>
            <button onClick={() => { setDraft(''); ai.setDraftShown(false); }} className="inline-flex items-center gap-1 hover:underline shrink-0">
              <X className="w-3 h-3" /> Reject
            </button>
          </div>
        )}

        {replyQuote && (
          <div className="flex items-start gap-2 mx-3 mt-2 rounded-sm border-l-2 border-primary bg-surface-sunken px-2.5 py-1.5">
            <Reply className="w-3 h-3 mt-0.5 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[11px]">
              <span className="block text-muted-foreground">Replying to {replyQuote.label}</span>
              <span className="block truncate">{replyQuote.text}</span>
            </span>
            <button onClick={clearReplyQuote} className="shrink-0 hover:text-foreground" title="Cancel reply">
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {isEmailReply && formatOpen && (
          <div className="px-2 pt-1.5">
            <EmailFormatBar textareaRef={composerRef} value={draft} onChange={setDraft} preview={email.preview} onPreview={email.setPreview} />
          </div>
        )}

        <div className="relative">
          {slashMenu && cards && isMember && (
            <div className="absolute bottom-full left-0 mb-2 z-20 w-full max-w-md">
              {slashMenu.mode === 'commands' ? (
                <SlashCommandMenu query={slashMenu.query} onChoose={cards.choose} onClose={() => cards.setSlashMenu(null)} />
              ) : (
                <CatalogPicker
                  threadId={threadId}
                  kind={slashMenu.kind}
                  picked={pendingCards}
                  onKind={(kind) => cards.setSlashMenu({ mode: 'picker', kind })}
                  onToggle={cards.toggle}
                  onClose={() => { cards.setSlashMenu(null); composerRef.current?.focus(); }}
                />
              )}
            </div>
          )}
          {isEmailReply && email.preview ? (
            <div className="p-3"><EmailPreview value={draft} onEdit={() => email.setPreview(false)} /></div>
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
                const tok = cards && isMember && !isNote ? slashTokenAtCaret(v, e.target.selectionStart ?? v.length) : null;
                if (tok) cards?.setSlashMenu({ mode: 'commands', ...tok });
                else if (slashMenu?.mode === 'commands') cards?.setSlashMenu(null);
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
                if (slashMenu?.mode === 'commands' && cards) {
                  if (e.key === 'Escape') { e.preventDefault(); cards.setSlashMenu(null); return; }
                  if (e.key === 'Enter' || e.key === 'Tab') {
                    const first = slashCommandMatches(slashMenu.query)[0];
                    if (first) { e.preventDefault(); cards.choose(first.kind); return; }
                  }
                }
                if (suggestion && e.key === 'Tab' && !e.shiftKey) { e.preventDefault(); setDraft(draft + suggestion); dismiss(); return; }
                if (suggestion && e.key === 'Escape') { e.preventDefault(); dismiss(); return; }
                if (e.key !== 'Enter') return;
                const mod = e.metaKey || e.ctrlKey;
                if (mod && e.shiftKey && sendAndClose) { e.preventDefault(); if (canSend) void sendAndClose(); return; }
                if (mod || (enterSends && !e.shiftKey)) { e.preventDefault(); if (canSend) void send(); }
              }}
              placeholder={
                isNote ? 'Write a private note — only your team sees this…'
                  : waBlocked ? 'Reply window closed — template required'
                    : forwarding ? 'Add a note above the forwarded message…'
                      : isMember && cards ? 'Write a reply… type /product or /service to suggest one'
                        : isMember ? 'Write a reply…'
                          : 'Type a message…'
              }
              className="min-h-[44px] md:min-h-[76px] max-h-[30vh] md:max-h-[40vh] [field-sizing:content] border-0 bg-transparent px-3 py-2.5 max-md:text-base hover:border-0 focus-visible:ring-0 focus-visible:border-0"
              disabled={waBlocked}
            />
            </div>
          )}
        </div>

        {isEmailReply && signature && !email.preview && (
          <div className="mx-3 mb-2 flex items-start gap-2">
            <Checkbox id="inbox-include-signature" checked={email.includeSignature} onCheckedChange={(v) => email.setIncludeSignature(v === true)} className="mt-0.5" aria-label="Include my signature" />
            {signatureHtml ? (
              <iframe
                title="Email signature" sandbox="" srcDoc={signatureDocument(signatureHtml)}
                className={`h-40 min-w-0 flex-1 rounded-sm border border-hairline bg-white ${email.includeSignature ? '' : 'opacity-40'}`}
              />
            ) : (
              <label htmlFor="inbox-include-signature" className={`min-w-0 flex-1 text-xs whitespace-pre-wrap ${email.includeSignature ? 'text-muted-foreground' : 'text-muted-foreground/50 line-through'}`}>
                {signature}
              </label>
            )}
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
                <button onClick={() => cards?.toggle(c)} className="text-muted-foreground hover:text-foreground" title="Remove">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1.5 border-t border-hairline">
          <button
            type="button" onClick={() => setToolsOpen((v) => !v)} aria-expanded={toolsOpen}
            aria-label={toolsOpen ? 'Hide tools' : 'More tools'}
            className="md:hidden p-2 rounded-sm text-muted-foreground active:bg-surface-hover"
          >
            {toolsOpen ? <X className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
          </button>
          {toolsOpen && <span className="md:hidden order-last basis-full h-0" aria-hidden />}
          <span className={`${mobileTools} md:contents`}>
          {isMember && !isNote && (
            <Popover open={ai.steerOpen} onOpenChange={ai.setSteerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost" size="sm"
                  disabled={ai.drafting || waBlocked}
                  title="Let the assistant draft a reply you can edit before sending (1 credit)"
                  className="h-8 px-2 text-xs gap-1 text-primary"
                >
                  {ai.drafting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />} Suggest reply
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-3 space-y-2">
                <Label htmlFor="inbox-draft-steer" className="text-xs">What should the reply do? (optional)</Label>
                <Textarea
                  id="inbox-draft-steer"
                  value={ai.steer}
                  maxLength={1000}
                  onChange={(e) => ai.setSteer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ai.suggest(); } }}
                  placeholder="e.g. Offer the oak decking at the price on file and say we can deliver next week."
                  className="min-h-[72px] text-sm bg-card"
                  autoFocus
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">You review it before it is sent.</span>
                  <Button size="sm" className="h-8" onClick={() => void ai.suggest()} disabled={ai.drafting}>
                    <Sparkles className="w-3 h-3 mr-1.5" /> Draft
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          {isMember && !isNote && (
            <>
              <RewriteMenu text={draft} disabled={waBlocked} onReplace={setDraft} run={ai.rewrite} />
              <ComposerInsertMenu
                workspaceId={workspaceId}
                currentText={draft}
                disabled={waBlocked}
                recipient={{ name: recipientName, email: email?.to[0] ?? null }}
                onInsert={(t) => setDraft((d) => (d.trim() ? `${d.trimEnd()}\n\n${t}` : t))}
              />
              {channel === 'whatsapp' && (
                <WhatsAppFormButton threadId={threadId} disabled={waBlocked} onSent={refresh} />
              )}
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
          </span>
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
          <span className={`${mobileTools} md:contents`}>
          {isMember && !isNote && cards && (
            <button
              type="button"
              onClick={() => cards.setSlashMenu((cur) => (cur?.mode === 'picker' ? null : { mode: 'picker', kind: 'product' }))}
              disabled={waBlocked}
              className="p-2 rounded-sm hover:bg-surface-hover disabled:opacity-40"
              title="Suggest a product or service (or type /product, /service)"
              aria-pressed={slashMenu?.mode === 'picker'}
            >
              <ShoppingCart className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {isMember && <ComposerSettingsPopover settings={composerSettings.settings} save={composerSettings.save} />}
          </span>

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
            {isMember && !isNote && followUp && (toolsOpen || followUp.value || !isMobile) && (
              <FollowUpOnSend value={followUp.value} onChange={followUp.set} whatsappThreadId={followUp.whatsappThreadId} />
            )}
            {channel === 'email' && !isNote && <span className="max-md:hidden"><WritingScore body={draft} subject={forwarding ? email?.subject ?? null : null} /></span>}
            <SendSplitButton
              label={isNote ? 'Add note' : forwarding ? 'Forward' : 'Send'}
              sending={sending}
              disabled={!canSend}
              modKey={MOD_KEY}
              onSend={() => { void send(); }}
              onSendAndClose={sendAndClose ? () => { void sendAndClose(); } : undefined}
              onSchedule={schedule && !isNote && !waBlocked ? (d) => { void schedule(d); } : undefined}
              scheduleBlockedReason={pendingCards.length ? 'Catalog cards cannot be scheduled — send now, or remove them first.' : null}
            />
          </span>
        </div>
      </div>
    </div>
  );
};
