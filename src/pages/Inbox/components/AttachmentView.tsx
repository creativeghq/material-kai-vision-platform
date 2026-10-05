import React, { useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Loader2, Paperclip, Search, FileText, Wallet, Sparkles, AlertTriangle, ExternalLink, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { messagingService } from '@/modules/messaging/services/messagingService';
import { INBOX_DOCUMENT_KIND_LABELS, INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE, INBOX_DOCUMENT_KIND_LOW_CONFIDENCE } from '@/modules/messaging/inboxDocumentKinds';
import { NewExpenseDialog } from '@/modules/finance/components/NewExpenseDialog';
import { AttachmentActionsMenu } from './AttachmentActions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/core/ui/dialog';
import { inboxApi, type InboxAttachment } from '@/services/inboxApi';
import { enrichmentReasonText } from '../inboxFormat';

export const AttachmentLightbox: React.FC<{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  href?: string;
  name: string;
  kind: 'image' | 'pdf';
  /** The stored object, for the agent hand-off — which needs a durable URL, not a signed one. */
  att?: InboxAttachment;
}> = ({ open, onOpenChange, href, name, kind, att }) => {
  // The agent is handed a PUBLIC url, not the signed one the lightbox renders. A signed URL
  // expires in an hour and the agent may act on it later — a visual search that 403s halfway
  // through is a worse answer than not offering the button. `generation-images` is public-read,
  // so the object already has a stable address.
  const publicUrl = att?.storage_bucket && att?.storage_object_path
    ? supabase.storage.from(att.storage_bucket).getPublicUrl(att.storage_object_path).data.publicUrl
    : null;
  return (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-5xl w-[92vw] p-0 overflow-hidden">
      <DialogHeader className="px-4 py-2.5 border-b border-hairline bg-surface-sunken">
        <DialogTitle className="text-sm font-semibold truncate pr-8">{name}</DialogTitle>
        <DialogDescription className="sr-only">Full view of the attached {kind}</DialogDescription>
      </DialogHeader>
      <div className="bg-surface-sunken flex items-center justify-center" style={{ height: '78vh' }}>
        {href && kind === 'image' && (
          // `contain`, not `cover`: a cropped photo of a damaged tile is a photo of the wrong bit.
          <img src={href} alt={name} className="max-h-full max-w-full object-contain" />
        )}
        {href && kind === 'pdf' && (
          <iframe src={href} title={name} className="w-full h-full border-0" />
        )}
      </div>
      <div className="px-4 py-2.5 border-t border-hairline flex justify-end gap-2">
        {/* A real download, not just "open in a tab": the operator wants the file on disk to send
            to a supplier or drop into a quote. `download` on a signed same-origin URL saves it
            under the message's own filename rather than a storage UUID. */}
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <a href={href} download={name}>
            <Download className="w-3 h-3 mr-1.5" />Download
          </a>
        </Button>
        {/* Hand the photo to the agent's visual search. A customer sending a picture of a tile
            and asking "do you have this" is the single commonest thing on a materials WhatsApp,
            and answering it meant describing the photo into a different screen by hand. */}
        {kind === 'image' && publicUrl && (
          <Button asChild variant="secondary" size="sm" className="h-8 text-xs">
            <a href={`/agent-hub?agent=kai&image=${encodeURIComponent(publicUrl)}&prompt=${encodeURIComponent(
              'Find products in our catalogue that match this image — closest visual matches first, '
              + 'with the product name and code for each.',
            )}`}>
              <Search className="w-3 h-3 mr-1.5" />Find matching products
            </a>
          </Button>
        )}
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <a href={href} target="_blank" rel="noreferrer">
            <ExternalLink className="w-3 h-3 mr-1.5" />Open original
          </a>
        </Button>
      </div>
    </DialogContent>
  </Dialog>
  );
};

/**
 * The words in a voice note, under its player.
 *
 * Written by the inbound reader as the note arrives; this renders what the row holds, and offers
 * the same reader for a note filed before it existed or one that failed. The assistant reads the
 * identical text (see `describeAttachmentForAssistant`), so what you see here is what it was told.
 */
export const AttachmentTranscript: React.FC<{
  att: InboxAttachment;
  threadId?: string;
  messageId?: string;
  onRefreshed?: () => void;
}> = ({ att, threadId, messageId, onRefreshed }) => {
  const [running, setRunning] = useState(false);
  const { toast } = useToast();
  const t = att.transcript;
  const canRun = !!threadId && !!messageId;

  const run = async () => {
    if (!threadId || !messageId) return;
    setRunning(true);
    try {
      const r = await inboxApi.enrichAttachments({ thread_id: threadId, message_id: messageId, force: true });
      const mine = r.results.find((x) => x.wrote === 'transcript');
      if (mine?.status === 'ok') onRefreshed?.();
      else {
        toast({
          title: 'Could not transcribe it',
          description: mine?.transcript?.error ?? enrichmentReasonText(mine?.transcript?.reason),
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Could not transcribe it', description: (e as Error).message, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  if (t?.status === 'ok' && t.text) {
    return (
      <div className="mt-1.5 max-w-[420px] rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2">
        <div className="mb-0.5 text-[10px] font-semibold text-muted-foreground">Transcript</div>
        <p className="whitespace-pre-wrap break-words text-xs">{t.text}</p>
      </div>
    );
  }
  const why = t?.status === 'failed'
    ? (t.error ?? 'transcription failed')
    : t?.status === 'skipped' ? enrichmentReasonText(t.reason) : null;
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="truncate">{why ? `Not transcribed: ${why}` : 'Not transcribed yet'}</span>
      {canRun && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" disabled={running} onClick={run}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="mr-1 h-3 w-3" />Transcribe</>}
        </Button>
      )}
    </div>
  );
};

/**
 * What a PDF or photo IS, under its card: the kind the reader decided, how sure it was, the facts
 * printed on it — and, for a supplier invoice or receipt, the one action that follows from it.
 *
 * The expense opens with the supplier and a description PREFILLED and the amount EMPTY: the
 * document's total is gross and the form's amount is net, and guessing the VAT split books a
 * cost with its tax folded into the net. The total is named in the description instead.
 */
export const AttachmentDocumentTag: React.FC<{
  att: InboxAttachment;
  family: 'pdf' | 'image';
  threadId?: string;
  messageId?: string;
  workspaceId?: string;
  onRefreshed?: () => void;
}> = ({ att, family, threadId, messageId, workspaceId, onRefreshed }) => {
  const [running, setRunning] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const { toast } = useToast();
  const d = att.document;
  const canRun = !!threadId && !!messageId;

  const run = async () => {
    if (!threadId || !messageId) return;
    setRunning(true);
    try {
      const r = await inboxApi.enrichAttachments({ thread_id: threadId, message_id: messageId, force: true });
      const mine = r.results.find((x) => x.wrote === 'document');
      if (mine?.status === 'ok') onRefreshed?.();
      else {
        toast({
          title: 'Could not read it',
          description: mine?.document?.error ?? enrichmentReasonText(mine?.document?.skip_reason),
          variant: 'destructive',
        });
      }
    } catch (e) {
      toast({ title: 'Could not read it', description: (e as Error).message, variant: 'destructive' });
    } finally { setRunning(false); }
  };

  if (d?.status === 'ok' && d.kind) {
    // A photo tagged "Photo" tells the operator nothing; every other verdict on an image does.
    if (family === 'image' && d.kind === 'photo') return null;
    const label = INBOX_DOCUMENT_KIND_LABELS[d.kind] ?? d.kind;
    const pct = typeof d.confidence === 'number' ? Math.round(d.confidence * 100) : null;
    const unsure = typeof d.confidence === 'number' && d.confidence < INBOX_DOCUMENT_KIND_LOW_CONFIDENCE;
    const bookable = INBOX_DOCUMENT_KINDS_BOOKABLE_AS_EXPENSE.includes(d.kind) && !!workspaceId;
    const money = typeof d.total === 'number' ? formatMoney(d.total, d.currency ?? 'EUR') : null;
    const facts = [d.issuer, d.document_number ? `no. ${d.document_number}` : null, d.document_date, money]
      .filter((x): x is string => !!x).join(' · ');
    // Named, never asserted as ours: it is a number on somebody's PDF until a person confirms it
    // against the supplier. Shown here so the operator knows the expense form will carry it, and
    // masked because this line sits in a conversation view.
    const bankWord = d.bank?.iban
      ? `bank details printed · IBAN ending ${d.bank.iban.slice(-4)}`
      : d.bank?.account_ref ? 'bank details printed' : null;
    const description = `${label}${d.document_number ? ` ${d.document_number}` : ''}`
      + `${d.issuer ? ` from ${d.issuer}` : ''}${d.document_date ? ` dated ${d.document_date}` : ''}`
      + `${money ? ` — total on document ${money} (gross, VAT not split)` : ''}`
      + ` · from Inbox attachment${att.name ? ` ${att.name}` : ''}`;
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant={unsure ? 'warning' : 'info'} title={d.reason}>
          {label}{pct !== null ? ` · ${pct}%` : ''}{unsure ? ' · unsure' : ''}
        </Badge>
        {facts && <span className="max-w-[280px] truncate text-muted-foreground" title={facts}>{facts}</span>}
        {bankWord && <Badge variant="neutral" className="text-[10px] py-0">{bankWord}</Badge>}
        {bookable && workspaceId && (
          <>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => setExpenseOpen(true)}>
              <Wallet className="mr-1 h-3 w-3" />Add as expense
            </Button>
            <NewExpenseDialog
              workspaceId={workspaceId}
              open={expenseOpen}
              onOpenChange={setExpenseOpen}
              onCreated={() => { setExpenseOpen(false); toast({ title: 'Expense recorded' }); }}
              prefill={{
                description,
                supplier: d.issuer ? { name: d.issuer } : undefined,
                // The account this document says to pay into, carried to the one screen that
                // knows WHOSE it is. A checksum-valid IBAN is added to that party's bank accounts.
                bankDetails: d.bank ? {
                  bank: d.bank,
                  source: 'inbox_attachment',
                  sourceRef: { message_id: messageId, thread_id: threadId, attachment_name: att.name },
                  documentLabel: `${label}${d.document_number ? ` ${d.document_number}` : ''}`
                    + `${d.document_date ? ` dated ${d.document_date}` : ''} · from an Inbox attachment`,
                  issuerName: d.issuer,
                  confidence: d.confidence,
                } : undefined,
              }}
            />
          </>
        )}
      </div>
    );
  }

  const why = d?.status === 'failed'
    ? (d.error ?? 'reading failed')
    : d?.status === 'skipped' ? enrichmentReasonText(d.skip_reason) : null;
  // A PDF that was never read is offered the reader; a photo that was never read is a photo.
  if (!why && family === 'image') return null;
  return (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
      <span className="truncate">{why ? `Not read: ${why}` : 'Not read yet'}</span>
      {canRun && (
        <Button size="sm" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" disabled={running} onClick={run}>
          {running ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Sparkles className="mr-1 h-3 w-3" />Read it</>}
        </Button>
      )}
    </div>
  );
};

export const AttachmentView: React.FC<{
  att: InboxAttachment;
  href?: string;
  /** For the retry: repair is scoped to the one message rather than the whole workspace. */
  messageId?: string;
  /** For the attachment reader (transcribe / classify), which is scoped the same way. */
  threadId?: string;
  /** The thread's workspace — the expense a supplier invoice becomes is booked there. */
  workspaceId?: string;
  onRepaired?: () => void;
  /** Email layout: a fixed-size card with a thumbnail or icon, name and size, in a grid. */
  variant?: 'inline' | 'card';
}> = ({ att, href, messageId, threadId, workspaceId, onRepaired, variant = 'inline' }) => {
  const name = att.name || 'attachment';
  const ct = (att.content_type || '').toLowerCase();
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const [zoom, setZoom] = useState(false);
  const [fetching, setFetching] = useState(false);
  const { toast } = useToast();

  // The family, whether or not it arrived as a real MIME type.
  //
  // WhatsApp media comes through as a bare `"image"` — not `"image/jpeg"` — and every test here
  // was `startsWith('image/')`, which a bare family fails. Two real photos rendered as a paperclip
  // labelled "attachment" because of the missing slash.
  const family = ct.includes('/') ? ct.split('/')[0] : ct;
  const kind = family === 'image' || family === 'photo' || family === 'sticker'
      || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif'].includes(ext) ? 'image'
    : family === 'video' || ['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? 'video'
    : family === 'audio' || family === 'voice' || family === 'ptt'
      || ['mp3', 'ogg', 'wav', 'm4a', 'opus'].includes(ext) ? 'audio'
    : ct === 'application/pdf' || family === 'document' || ext === 'pdf' ? 'pdf'
    : 'file';

  // NOT RETRIEVED: the row still holds the provider's own URL rather than a path in our storage.
  const notRetrieved = (att as { fetch_failed?: boolean }).fetch_failed
    || (!att.storage_object_path && !!att.url);
  if (notRetrieved) {
    return (
      <div className="flex items-center gap-2 mt-1.5 rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-warning" />
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium">
            {kind === 'image' ? 'Photo' : kind === 'video' ? 'Video' : 'File'} not downloaded yet
          </span>
          <span className="block text-[10px] text-muted-foreground">
            It is still on WhatsApp — we hold a link that needs our server to fetch it.
          </span>
        </span>
        {messageId && (
          <Button
            size="sm" variant="outline" className="h-7 text-[11px] shrink-0"
            disabled={fetching}
            onClick={async () => {
              setFetching(true);
              try {
                const r = await messagingService.repairAttachments({ messageId });
                if (r.repaired > 0) { onRepaired?.(); }
                else { toast({ title: 'Could not fetch it', description: r.message, variant: 'destructive' }); }
              } catch (e) {
                toast({ title: 'Could not fetch it', description: (e as Error).message, variant: 'destructive' });
              } finally { setFetching(false); }
            }}
          >
            {fetching ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Fetch'}
          </Button>
        )}
      </div>
    );
  }

  // No signed URL yet (still minting) or none obtainable. Say which — a bare filename that does
  // nothing when clicked reads as a broken link rather than as a file still loading.
  if (!href) {
    return (
      <div className="flex items-center gap-1 text-xs mt-1 text-muted-foreground">
        <Paperclip className="w-3 h-3 shrink-0" />
        <span className="truncate">{name}</span>
        <span className="opacity-70">· preparing…</span>
      </div>
    );
  }

  if (variant === 'card' && (kind === 'image' || kind === 'pdf' || kind === 'file')) {
    const size = att.size ? (att.size >= 1048576 ? `${(att.size / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(att.size / 1024))} KB`) : '';
    const Icon = kind === 'pdf' ? FileText : Paperclip;
    const open = () => (kind === 'file' ? window.open(href, '_blank', 'noopener,noreferrer') : setZoom(true));
    return (
      <div className="rounded-sm border border-hairline bg-card overflow-hidden">
        <button type="button" onClick={open} className="block w-full aspect-[4/3] bg-surface-sunken relative" title={name}>
          {kind === 'image'
            ? <img src={href} alt={name} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
            : <Icon className={`absolute inset-0 m-auto w-8 h-8 ${kind === 'pdf' ? 'text-destructive' : 'text-muted-foreground'}`} />}
        </button>
        <div className="group/att flex items-center gap-1.5 px-2 py-1.5 text-xs">
          <span className="truncate flex-1" title={name}>{name}</span>
          {size && <span className="text-muted-foreground tabular-nums shrink-0">{size}</span>}
          <AttachmentActionsMenu href={href} name={name} contentType={att.content_type} />
        </div>
        {kind !== 'file' && (
          <div className="px-2 pb-1.5">
            <AttachmentDocumentTag
              att={att} family={kind} threadId={threadId} messageId={messageId} workspaceId={workspaceId} onRefreshed={onRepaired}
            />
          </div>
        )}
        {kind !== 'file' && <AttachmentLightbox open={zoom} onOpenChange={setZoom} href={href} name={name} kind={kind} att={att} />}
      </div>
    );
  }

  if (kind === 'image') {
    return (
      <>
        {/* A button, not a link: opening a new tab loses the conversation you are reading. The
            thumbnail is the message — a photo of the damaged tile IS what the customer said. */}
        <span className="relative block w-fit group/att">
        <span className="absolute top-2.5 right-1 z-10 rounded-sm bg-card/90 md:opacity-0 md:group-hover/att:opacity-100 transition-opacity">
          <AttachmentActionsMenu href={href} name={name} contentType={att.content_type} />
        </span>
        <button type="button" onClick={() => setZoom(true)} className="block mt-1.5 group">
          <img
            src={href}
            alt={name}
            loading="lazy"
            className="max-h-64 w-auto max-w-full rounded-sm border border-hairline object-contain
                       group-hover:border-primary/40 transition-colors"
          />
        </button>
        </span>
        <AttachmentDocumentTag
          att={att} family="image" threadId={threadId} messageId={messageId} workspaceId={workspaceId} onRefreshed={onRepaired}
        />
        <AttachmentLightbox open={zoom} onOpenChange={setZoom} href={href} name={name} kind="image" att={att} />
      </>
    );
  }
  if (kind === 'video') {
    // `controls` and nothing else: no autoplay, because a thread of six clips would all start at
    // once the moment it opens.
    return <video src={href} controls preload="metadata" className="mt-1.5 max-h-64 w-full rounded-sm border border-hairline" />;
  }
  if (kind === 'audio') {
    return (
      <>
        <audio src={href} controls preload="metadata" className="mt-1.5 w-full max-w-[260px]" />
        <AttachmentTranscript att={att} threadId={threadId} messageId={messageId} onRefreshed={onRepaired} />
      </>
    );
  }
  if (kind === 'pdf') {
    // A PDF is unreadable at bubble width, so the bubble gets a card and the READING happens in
    // the same full-view modal the images use. Not a new tab: you are reviewing a conversation,
    // and losing your place in it to look at a spec sheet is the thing that makes people stop.
    return (
      <>
        <div className="flex items-center gap-1 mt-1.5 group/att">
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="flex flex-1 min-w-0 items-center gap-2 rounded-sm border border-hairline bg-surface-sunken px-2.5 py-2 text-left hover:border-primary/40 transition-colors"
        >
          <FileText className="w-4 h-4 shrink-0 text-destructive" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-medium truncate">{name}</span>
            <span className="block text-[10px] text-muted-foreground">
              PDF{att.size ? ` · ${Math.max(1, Math.round(att.size / 1024))} KB` : ''} · click to read
            </span>
          </span>
        </button>
        <AttachmentActionsMenu href={href} name={name} contentType={att.content_type} />
        </div>
        <AttachmentDocumentTag
          att={att} family="pdf" threadId={threadId} messageId={messageId} workspaceId={workspaceId} onRefreshed={onRepaired}
        />
        <AttachmentLightbox open={zoom} onOpenChange={setZoom} href={href} name={name} kind="pdf" att={att} />
      </>
    );
  }
  return (
    <span className="flex items-center gap-1 mt-1">
      <a href={href} target="_blank" rel="noreferrer"
         className="flex items-center gap-1 text-xs underline text-primary min-w-0">
        <Paperclip className="w-3 h-3 shrink-0" /> <span className="truncate">{name}</span>
      </a>
      <AttachmentActionsMenu href={href} name={name} contentType={att.content_type} />
    </span>
  );
};
