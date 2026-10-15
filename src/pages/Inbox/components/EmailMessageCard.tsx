import React, { useEffect, useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { castSeedForSender } from '@/utils/characterAvatar';
import { signInboxAttachment, type InboxMessage } from '@/services/inboxApi';
import { castAvatarSrc } from '../inboxFormat';
import { normalizeCid, referencedCids } from '@/utils/sanitizeEmailHtml';
import { useInlineImages } from '../useInlineImages';
import { AttachmentView } from './AttachmentView';
import { MessageBody } from './MessageBubble';
import { DeliveryState, type ParticipantLabel } from './InboxPrimitives';
import { emailRecipientsOf } from '../emailRecipients';
import type { MailOpens } from './OpenTracking';
import { MailMessageCard } from './MailMessageCard';

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
  const fromAddress = typeof meta.email_from === 'string' && meta.direction === 'incoming' ? meta.email_from : null;
  const name = info?.label ?? fromAddress ?? 'Unknown';
  const photo = info?.avatarUrl || castAvatarSrc(castSeedForSender(m, info?.label), info?.avatarSlot);
  const html = typeof meta.email_html === 'string' && meta.email_html.trim() ? meta.email_html : null;
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [plain, setPlain] = useState(false);
  const isPinned = typeof meta.pinned_at === 'string' && !!meta.pinned_at;
  const { to, cc } = emailRecipientsOf(meta);
  const inlineCids = useMemo(() => referencedCids(html), [html]);
  const inlineParts = (m.attachments || []).filter((a) => a.content_id && inlineCids.has(normalizeCid(a.content_id)));
  const inlineImages = useInlineImages(`${m.id}|${[...inlineCids].join(',')}`, inlineParts.map((a) => ({
    cid: a.content_id!, mime: a.content_type ?? '', size: a.size ?? 0,
    load: async () => {
      const u = await signInboxAttachment(a);
      if (!u) throw new Error('unsigned');
      return (await fetch(u)).blob();
    },
  })), !collapsed && !!html && !plain);
  const attachments = (m.attachments || []).filter((a) => !a.content_id || !inlineImages?.[normalizeCid(a.content_id)]);

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

  return (
    <MailMessageCard
      anchorId={`inbox-msg-${m.id}`}
      name={name}
      address={fromAddress}
      photoUrl={photo}
      isAgent={m.message_type === 'agent'}
      ours={ours}
      oursTag="us"
      date={m.created_at}
      to={to.map((address) => ({ address }))}
      cc={cc.map((address) => ({ address }))}
      html={html}
      text={m.body ?? null}
      renderText={(body) => <MessageBody body={body} threadId={m.thread_id} />}
      inlineImages={inlineImages}
      collapsed={collapsed}
      onToggle={onToggle}
      plain={plain}
      onPlainChange={setPlain}
      hasAttachments={attachments.length > 0}
      opens={opens}
      pinned={isPinned}
      starred={starred}
      forwarded={!!meta.forwarded_from}
      attachments={attachments.length > 0 && (
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
      footer={ours && <div className="text-[11px] text-muted-foreground"><DeliveryState meta={meta} /></div>}
      actions={{
        ours: true,
        onReply: onReplyTo ? () => onReplyTo(m) : undefined,
        onReact: onReact ? (e) => onReact(m, e) : undefined,
        onCopy: m.body ? () => { void navigator.clipboard.writeText(m.body ?? ''); toast({ title: 'Copied' }); } : undefined,
        onForward: onForward ? () => onForward(m) : undefined,
        onTogglePin: onTogglePin ? () => onTogglePin(m, !isPinned) : undefined,
        pinned: isPinned,
        onToggleStar: onToggleStar ? () => onToggleStar(m, !starred) : undefined,
        starred,
        onAddToNote: onAddToNote && m.body ? () => onAddToNote(m) : undefined,
        onDelete: onDelete ? () => onDelete(m) : undefined,
      }}
    />
  );
};
