import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCheck, AlertTriangle } from 'lucide-react';
import { castSeedForThreadCounterparty } from '@/utils/characterAvatar';
import { moodStyle } from '@/utils/conversationMood';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/core/ui/avatar';
import type { InboxSource } from '../inboxSource';
import { signInboxAttachment, labelChipClass, type InboxThread, type InboxLabel } from '@/services/inboxApi';
import { avatarTint, castAvatarSrc, initials, labelDot } from '../inboxFormat';

export interface WorkspaceMemberOption { user_id: string; label: string; }

/** {label, kind, userId} keyed by participant id — drives sender names + bubble alignment. */
export interface ParticipantLabel {
  label: string;
  kind: 'member' | 'customer' | 'agent';
  userId: string | null;
  /** The member's own photo. `user_profiles.avatar_url` existed all along and was never selected. */
  avatarUrl?: string | null;
  /**
   * Which cast character stands in when there is no photo. Server-derived for a customer
   * (`inbox_participants.avatar_slot`), so the transcript cannot disagree with the header;
   * read from `user_profiles.full_name` for a member, which is a single source everywhere.
   */
  avatarSlot?: number | null;
}

/** Coloured label tags for a thread. Squared (`rounded-xs`) — a pill is a button silhouette. */
export const LabelChips: React.FC<{ labels?: InboxLabel[]; className?: string }> = ({ labels, className }) => {
  if (!labels || labels.length === 0) return null;
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className || ''}`}>
      {labels.map((l) => (
        <span key={l.id} className={`inline-flex items-center gap-1 text-[10px] leading-none px-1.5 py-0.5 rounded-xs border ${labelChipClass(l.color)}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${labelDot(l.color)}`} />
          {l.name}
        </span>
      ))}
    </div>
  );
};

/**
 * The source, rendered for a DENSE LIST ROW: a solid dot plus a plain coloured word.
 *
 * It used to be a tinted pill here. Two problems, and the redesign fixes both at once — the
 * tint that keeps a pill quiet is exactly the thing that makes its text hard to read, and at
 * twenty rows a tag per row gives every row the visual weight of a button (the same reason
 * `statusTone` exists and `docs/design-system.md` bans pill backgrounds inside table rows).
 */
export const SourceWord: React.FC<{ source: InboxSource; className?: string }> = ({ source, className }) => (
  <span className={`inline-flex items-center gap-1.5 text-[11px] leading-none ${source.tone.text} ${className || ''}`}>
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${source.tone.dot}`} />
    {source.label}
  </span>
);

/**
 * One row of the mailbox sidebar — a view, a source or a label. All three are the same object:
 * somewhere you GO, with an optional count of what is waiting there.
 *
 * `count` is a string, not a number, so a caller can hand it `200+` — the server pages at 200
 * and printing the ceiling as if it were a total is the quiet kind of wrong. `null` withholds
 * the count entirely, which is what a caller does when it genuinely does not know.
 */
export const NavRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  count?: string | null;
  /** Sources and labels sit a step quieter than the three top-level views. */
  dense?: boolean;
  /** Unread earns a solid count; everything else is a muted number. */
  emphasiseCount?: boolean;
}> = ({ icon, label, active, onClick, count, dense, emphasiseCount }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'true' : undefined}
    className={`w-full flex items-center gap-2.5 rounded-sm text-sm transition-colors ${
      dense ? 'px-2.5 py-1.5' : 'px-2.5 py-2'
    } ${active
      ? 'bg-surface-sunken text-foreground font-medium'
      : 'text-foreground/80 hover:bg-surface-hover'}`}
  >
    {icon}
    <span className="flex-1 text-left truncate">{label}</span>
    {count != null && (
      emphasiseCount
        ? <span className="text-[11px] rounded-xs bg-primary text-primary-foreground px-1.5 tabular-nums shrink-0">{count}</span>
        : <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">{count}</span>
    )}
  </button>
);

/** The mobile stand-in for one sidebar row. Squared, never a pill — see the call site. */
export const MobileChip: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-xs border transition-colors ${
      active ? 'bg-primary text-primary-foreground border-transparent' : 'border-hairline text-muted-foreground hover:bg-surface-hover'
    }`}
  >
    {children}
  </button>
);

/** Section heading in the sidebar, with an optional action pinned to its right. */
export const SidebarHeading: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="px-3 pt-3 pb-1.5 flex items-center justify-between gap-2">
    <span className="text-[11px] tracking-wide text-muted-foreground font-semibold">{children}</span>
    {action}
  </div>
);

/** The source where it stands ALONE and must name itself — header, rail. Squared tinted tag. */
export const SourceTag: React.FC<{ source: InboxSource; className?: string }> = ({ source, className }) => (
  <span className={`inline-flex items-center gap-1 text-[11px] leading-none px-1.5 py-1 rounded-xs border font-medium ${source.tone.tag} ${className || ''}`}>
    <source.Icon className="w-3 h-3 shrink-0" />
    {source.label}
  </span>
);

/** Did the customer actually GET it? */
export const DeliveryState: React.FC<{ meta: Record<string, unknown> }> = ({ meta }) => {
  const status = typeof meta.delivery_status === 'string' ? meta.delivery_status : null;
  if (!status) return null;

  if (status === 'failed' || status === 'relay_failed') {
    const code = meta.delivery_error_code;
    const detail = typeof meta.delivery_error_message === 'string' ? meta.delivery_error_message : null;
    const reason = [detail, code != null ? `(${String(code)})` : null].filter(Boolean).join(' ');
    return (
      <span
        className="inline-flex items-center gap-1 text-destructive"
        title={reason || 'WhatsApp did not report a reason.'}
      >
        <AlertTriangle className="w-2.5 h-2.5" />
        {status === 'relay_failed' ? 'Not sent' : 'Not delivered'}
        {reason && <span className="opacity-80">· {reason}</span>}
      </span>
    );
  }
  /*
   * Ticks, not words — the vocabulary every person using this already knows from the app the
   * message is going to. One grey tick left our server, two grey ticks reached the handset, two
   * accent ticks were opened. The word stays as the `title` and as the screen-reader text, so
   * nothing is lost for anyone who does not read the glyph.
   *
   * `CheckCheck` is one glyph, not two `Check`s side by side: two overlapping icons drift apart
   * at different font sizes and read as a rendering fault at 10px.
   */
  const tick = status === 'read'
    ? { Icon: CheckCheck, cls: 'text-primary', label: 'Read' }
    : status === 'delivered' ? { Icon: CheckCheck, cls: '', label: 'Delivered' }
    : status === 'sent' ? { Icon: Check, cls: 'opacity-70', label: 'Sent' }
    : null;
  if (!tick) return null;
  return (
    <span className={`inline-flex items-center ${tick.cls}`} title={tick.label}>
      <tick.Icon className="w-3 h-3" aria-hidden />
      <span className="sr-only">{tick.label}</span>
    </span>
  );
};

export const ThreadAvatar: React.FC<{
  thread?: Pick<InboxThread, 'id' | 'metadata' | 'counterparty_participant_id' | 'counterparty_avatar_slot'> | null;
  name: string;
  className?: string;
  fallbackClassName?: string;
  /** Show the read mood as a ring + face. Off by default — see the comment on the wrapper. */
  showMood?: boolean;
}> = ({ thread, name, className, fallbackClassName, showMood }) => {
  const wa = ((thread?.metadata as Record<string, unknown> | undefined)?.wa_profile ?? null) as
    Record<string, unknown> | null;
  const bucket = typeof wa?.avatar_bucket === 'string' ? wa.avatar_bucket : null;
  const path = typeof wa?.avatar_path === 'string' ? wa.avatar_path : null;
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!bucket || !path) { setUrl(null); return; }
    let alive = true;
    void signInboxAttachment({ storage_bucket: bucket, storage_object_path: path })
      .then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [bucket, path]);

  /*
   * No stored photo means there will never be one: WhatsApp hands a business no customer
   * profile picture on any endpoint that declares the field (measured 0/100 conversations,
   * 0/516 contacts). So this is not a placeholder waiting for something better — it is the
   * avatar, and it should look like it was designed rather than like a missing image.
   */
  const generated = useMemo(
    () => castAvatarSrc(castSeedForThreadCounterparty(thread, name), thread?.counterparty_avatar_slot),
    [thread?.counterparty_participant_id, thread?.counterparty_avatar_slot, thread?.id, name],
  );

  /* The mood the conversation was last read as, worn by the face. */
  const mood = showMood
    ? (((thread?.metadata as Record<string, unknown> | undefined)?.sentiment ?? null) as
        Record<string, unknown> | null)
    : null;
  const style = mood?.mood ? moodStyle(String(mood.mood)) : null;

  const avatar = (
    <Avatar className={className}>
      <AvatarImage src={url ?? generated} alt={name} className="object-cover" />
      {/* Only reached if the image itself fails to load — initials remain the floor. */}
      <AvatarFallback className={fallbackClassName ?? `text-xs ${avatarTint(name)}`}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!style) return avatar;
  return (
    <div className="relative shrink-0" title={`${style.label} — read from the conversation`}>
      <div className={`rounded-full ring-2 ring-offset-1 ring-offset-background ${style.ring}`}>
        {avatar}
      </div>
      <span
        aria-hidden
        className="absolute -bottom-1 -right-1 text-[11px] leading-none bg-card border border-hairline
                   rounded-full w-[18px] h-[18px] grid place-items-center"
      >
        {style.face}
      </span>
      <span className="sr-only">{style.label}</span>
    </div>
  );
};

// ──────────────────────────────────────────────────────────────────────────
// Column 3 · Details rail (CRM contact / company / quotes / projects / participants)
// ──────────────────────────────────────────────────────────────────────────

export const Row: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-start gap-2.5 text-sm">
    <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
    <span className="min-w-0 break-words">{children}</span>
  </div>
);

export const SectionTitle: React.FC<{ icon: React.ReactNode; children: React.ReactNode; count?: number }> = ({ icon, children, count }) => (
  // Not accent-coloured: eight accent headings down one narrow column make the labels louder
  // than the values under them, which is backwards for a panel you read to find a fact.
  <h3 className="text-sm font-semibold flex items-center gap-2 mb-3">
    <span className="shrink-0">{icon}</span>
    <span>{children}</span>
    {count != null && <span className="text-xs text-muted-foreground font-normal">({count})</span>}
  </h3>
);
