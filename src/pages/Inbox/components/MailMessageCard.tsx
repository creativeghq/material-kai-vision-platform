import React, { useState } from 'react';
import { Bot, Forward, Paperclip, Pin, Star } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { formatDate, formatTime } from '@/utils/datetime';
import { EmailHtmlView } from './EmailHtmlView';
import { MessageActions } from './MessageBubble';
import { MailAvatar, PersonChip } from '../gmail/mailParts';
import { OpenReceipt, type MailOpens } from './OpenTracking';

const stamp = (iso: string | null) => (iso ? `${formatDate(iso)} ${formatTime(iso)}` : '—');

export interface MailPerson { address: string; name?: string | null; photoUrl?: string | null }

/** One email in a conversation — the same card for an Inbox email thread and the Gmail view. */
export const MailMessageCard: React.FC<{
  anchorId?: string;
  name: string;
  address: string | null;
  photoUrl?: string | null;
  isAgent?: boolean;
  ours: boolean;
  oursTag?: string;
  date: string | null;
  to: MailPerson[];
  cc: MailPerson[];
  html: string | null;
  text: string | null;
  renderText?: (text: string) => React.ReactNode;
  inlineImages?: Readonly<Record<string, string>>;
  collapsed: boolean;
  onToggle?: () => void;
  hasAttachments: boolean;
  attachments?: React.ReactNode;
  opens?: MailOpens | null;
  pinned?: boolean;
  starred?: boolean;
  forwarded?: boolean;
  footer?: React.ReactNode;
  plain?: boolean;
  onPlainChange?: (v: boolean) => void;
  actions: React.ComponentProps<typeof MessageActions>;
}> = ({
  anchorId, name, address, photoUrl, isAgent, ours, oursTag = 'you', date, to, cc, html, text, renderText, inlineImages,
  collapsed, onToggle, hasAttachments, attachments, opens, pinned, starred, forwarded, footer, actions,
  plain: plainProp, onPlainChange,
}) => {
  const [plainOwn, setPlainOwn] = useState(false);
  const plain = plainProp ?? plainOwn;
  const setPlain = onPlainChange ?? setPlainOwn;
  const shownName = isAgent ? 'KAI assistant' : name;

  if (collapsed) {
    return (
      <button type="button" id={anchorId} onClick={onToggle}
        className="w-full flex items-center gap-3 py-2.5 px-1 border-b border-hairline text-left hover:bg-surface-hover">
        <MailAvatar name={name} email={address} photoUrl={photoUrl} className="h-8 w-8" />
        <span className="text-sm font-medium shrink-0">{ours ? 'You' : shownName}</span>
        <span className="text-xs text-muted-foreground truncate flex-1">– {(text ?? '').replace(/\s+/g, ' ').slice(0, 160)}</span>
        {hasAttachments && <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{stamp(date)}</span>
      </button>
    );
  }

  const people = (label: string, list: MailPerson[]) => list.length > 0 && (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {list.slice(0, 4).map((a) => <PersonChip key={a.address} address={a.address} name={a.name ?? null} photoUrl={a.photoUrl ?? null} />)}
      {list.length > 4 && <span className="text-xs text-muted-foreground">+{list.length - 4}</span>}
    </div>
  );

  return (
    <article id={anchorId} className="relative group/msg py-4 border-b border-hairline last:border-b-0 space-y-3">
      <header className="flex flex-wrap items-start gap-3 pr-8">
        <button type="button" onClick={onToggle} disabled={!onToggle} className="flex items-center gap-3 text-left min-w-0" title={onToggle ? 'Collapse' : undefined}>
          {isAgent
            ? <span className="h-10 w-10 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0"><Bot className="w-5 h-5" /></span>
            : <MailAvatar name={name} email={address} photoUrl={photoUrl} className="h-10 w-10" />}
          <span className="min-w-0">
            <span className="block text-sm font-semibold truncate">{ours && !isAgent ? `${shownName} (${oursTag})` : shownName}</span>
            <span className="block text-xs text-muted-foreground truncate">
              {address && !ours ? `${address} · ` : ''}{stamp(date)}
            </span>
            {ours && <OpenReceipt opens={opens ?? undefined} />}
          </span>
        </button>
        <div className="ml-auto flex flex-col items-end gap-1 min-w-0 max-w-full">
          {people('To', to)}
          {people('Cc', cc)}
        </div>
        <div className="absolute right-0 top-2">
          <MessageActions {...actions} />
        </div>
      </header>
      {(pinned || starred || forwarded) && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-3">
          {pinned && <span className="inline-flex items-center gap-1"><Pin className="w-3 h-3" /> Pinned</span>}
          {forwarded && <span className="inline-flex items-center gap-1"><Forward className="w-3 h-3" /> Forwarded</span>}
          {starred && <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-300"><Star className="w-3 h-3 fill-current" /> Starred</span>}
        </div>
      )}
      {html && !plain
        ? <EmailHtmlView html={html} sender={address} onShowText={text ? () => setPlain(true) : undefined} inlineImages={inlineImages} />
        : text && (
          <div className="space-y-1">
            {html && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPlain(false)}>Show formatted</Button>}
            {renderText ? renderText(text) : <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">{text}</div>}
          </div>
        )}
      {attachments}
      {footer}
    </article>
  );
};
