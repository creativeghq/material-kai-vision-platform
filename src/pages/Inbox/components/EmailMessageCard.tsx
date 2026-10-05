import React, { useEffect, useState } from 'react';
import { Bot, Forward, Paperclip, Pin, Star } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { formatDate, formatTime } from '@/utils/datetime';
import { castSeedForSender } from '@/utils/characterAvatar';
import { signInboxAttachment, type InboxMessage } from '@/services/inboxApi';
import { castAvatarSrc } from '../inboxFormat';
import { EmailHtmlView } from './EmailHtmlView';
import { AttachmentView } from './AttachmentView';
import { MessageActions, MessageBody } from './MessageBubble';
import { DeliveryState, type ParticipantLabel } from './InboxPrimitives';
import { MailAvatar, PersonChip } from '../gmail/mailParts';
import { emailRecipientsOf } from '../emailRecipients';
import { OpenReceipt, type MailOpens } from './OpenTracking';

const stamp = (iso: string) => `${formatDate(iso)} ${formatTime(iso)}`;

export const EmailMessageCard: React.FC<{
  m: InboxMessage;
  info?: ParticipantLabel;
  ours: boolean;
  collapsed: boolean;
  onToggle: () => void;
  workspaceId?: string;
  starred?: boolean;
  opens?: MailOpens;
  onAttachmentsRepaired?: () => void;
  onReplyTo?: (m: InboxMessage) => void;
  onReact?: (m: InboxMessage, emoji: string) => void;
  onForward?: (m: InboxMessage) => void;
  onTogglePin?: (m: InboxMessage, pinned: boolean) => void;
  onToggleStar?: (m: InboxMessage, starred: boolean) => void;
  onAddToNote?: (m: InboxMessage) => void;
  onDelete?: (m: InboxMessage) => void;
}> = ({ m, info, ours, collapsed, onToggle, workspaceId, starred, opens, onAttachmentsRepaired, onReplyTo, onReact, onForward, onTogglePin, onToggleStar, onAddToNote, onDelete }) => {
  const { toast } = useToast();
  const meta = (m.metadata ?? {}) as Record<string, unknown>;
  const isAgent = m.message_type === 'agent';
  const fromAddress = typeof meta.email_from === 'string' && meta.direction === 'incoming' ? meta.email_from : null;
  const name = info?.label ?? fromAddress ?? 'Unknown';
  const photo = info?.avatarUrl || castAvatarSrc(castSeedForSender(m, info?.label), info?.avatarSlot);
  const html = typeof meta.email_html === 'string' && meta.email_html.trim() ? meta.email_html : null;
  const [plain, setPlain] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const isPinned = typeof meta.pinned_at === 'string' && !!meta.pinned_at;
  const { to, cc } = emailRecipientsOf(meta);
  const attachments = m.attachments || [];

  useEffect(() => {
    if (collapsed) return;
    let alive = true;
    void (async () => {
      for (const a of m.attachments || []) {
        const u = await signInboxAttachment(a);
        const k = a.storage_object_path || a.url || '';
        if (alive && u && k) setUrls((p) => ({ ...p, [k]: u }));
      }
    })();
    return () => { alive = false; };
  }, [m, collapsed]);

  if (collapsed) {
    return (
      <button type="button" id={`inbox-msg-${m.id}`} onClick={onToggle}
        className="w-full flex items-center gap-3 py-2.5 px-1 border-b border-hairline text-left hover:bg-surface-hover">
        <MailAvatar name={name} email={fromAddress} photoUrl={photo} className="h-8 w-8" />
        <span className="text-sm font-medium shrink-0">{ours ? 'You' : name}</span>
        <span className="text-xs text-muted-foreground truncate flex-1">– {(m.body ?? '').replace(/\s+/g, ' ').slice(0, 160)}</span>
        {attachments.length > 0 && <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{stamp(m.created_at)}</span>
      </button>
    );
  }

  return (
    <article id={`inbox-msg-${m.id}`} className="relative group/msg py-4 border-b border-hairline space-y-3">
      <header className="flex flex-wrap items-start gap-3">
        <button type="button" onClick={onToggle} className="flex items-center gap-3 text-left min-w-0" title="Collapse">
          {isAgent
            ? <span className="h-10 w-10 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0"><Bot className="w-5 h-5" /></span>
            : <MailAvatar name={name} email={fromAddress} photoUrl={photo} className="h-10 w-10" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{isAgent ? 'KAI assistant' : ours ? `${name} (us)` : name}</span>
            <span className="block text-xs text-muted-foreground truncate">
              {fromAddress && !ours ? `${fromAddress} · ` : ''}{stamp(m.created_at)}
            </span>
            {ours && <OpenReceipt opens={opens} />}
          </span>
        </button>
        <div className="ml-auto flex flex-col items-end gap-1 min-w-0 max-w-full">
          {to.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground">To:</span>
              {to.slice(0, 4).map((a) => <PersonChip key={a} address={a} />)}
              {to.length > 4 && <span className="text-xs text-muted-foreground">+{to.length - 4}</span>}
            </div>
          )}
          {cc.length > 0 && (
            <div className="flex flex-wrap items-center justify-end gap-1">
              <span className="text-xs text-muted-foreground">Cc:</span>
              {cc.slice(0, 4).map((a) => <PersonChip key={a} address={a} />)}
              {cc.length > 4 && <span className="text-xs text-muted-foreground">+{cc.length - 4}</span>}
            </div>
          )}
        </div>
        <div className="absolute right-0 top-2">
          <MessageActions
            ours
            onReply={onReplyTo ? () => onReplyTo(m) : undefined}
            onReact={onReact ? (e) => onReact(m, e) : undefined}
            onCopy={m.body ? () => { void navigator.clipboard.writeText(m.body ?? ''); toast({ title: 'Copied' }); } : undefined}
            onForward={onForward ? () => onForward(m) : undefined}
            onTogglePin={onTogglePin ? () => onTogglePin(m, !isPinned) : undefined}
            pinned={isPinned}
            onToggleStar={onToggleStar ? () => onToggleStar(m, !starred) : undefined}
            starred={starred}
            onAddToNote={onAddToNote && m.body ? () => onAddToNote(m) : undefined}
            onDelete={onDelete ? () => onDelete(m) : undefined}
          />
        </div>
      </header>
      {(isPinned || starred || !!meta.forwarded_from) && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
          {isPinned && <span className="inline-flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</span>}
          {!!meta.forwarded_from && <span className="inline-flex items-center gap-1"><Forward className="w-3 h-3" /> Forwarded</span>}
          {starred && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><Star className="w-3 h-3 fill-current" /> Starred</span>}
        </div>
      )}
      {html && !plain
        ? <EmailHtmlView html={html} sender={fromAddress} onShowText={m.body ? () => setPlain(true) : undefined} />
        : m.body && (
          <div className="space-y-1">
            {html && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPlain(false)}>Show formatted</Button>}
            <MessageBody body={m.body} threadId={m.thread_id} />
          </div>
        )}
      {attachments.length > 0 && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">Attachments <span className="font-normal text-muted-foreground">({attachments.length} {attachments.length === 1 ? 'file' : 'files'})</span></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {attachments.map((a, i) => {
              const k = a.storage_object_path || a.url || '';
              return (
                <AttachmentView key={k || i} att={a} href={urls[k] || a.url} variant="card"
                  messageId={m.id} threadId={m.thread_id} workspaceId={workspaceId} onRepaired={onAttachmentsRepaired} />
              );
            })}
          </div>
        </div>
      )}
      {ours && <div className="text-[11px] text-muted-foreground"><DeliveryState meta={meta} /></div>}
    </article>
  );
};
