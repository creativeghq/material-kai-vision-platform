import { useMemo, type RefObject } from 'react';
import { inboxApi, type InboxCatalogItem, type WhatsAppWindow } from '@/services/inboxApi';
import type { InboxCardKind } from '@/modules/messaging/inboxCardKinds';
import type { SendFollowUpPlan } from './components/FollowUpOnSend';
import type { useComposerSettings } from './useComposerSettings';
import type { InboxPageState } from './useInboxPage';
import { splitAddresses } from './emailRecipients';
import type { RewriteMode } from './components/AssistTools';

export type ComposeMode = 'reply' | 'all' | 'forward';
export type SlashMenu =
  | null
  | { mode: 'commands'; query: string; start: number; end: number }
  | { mode: 'picker'; kind: InboxCardKind };

export interface ComposerEmail {
  composeMode: ComposeMode;
  setComposeMode?: (m: ComposeMode) => void;
  replyAllCount: number;
  to: string[];
  setTo?: (v: string[]) => void;
  from?: string | null;
  cc: string[];
  setCc: (v: string[]) => void;
  bcc: string[];
  setBcc: (v: string[]) => void;
  copiesOpen: boolean;
  setCopiesOpen: (v: boolean) => void;
  subject?: string;
  setSubject?: (v: string) => void;
  known?: Map<string, { name: string | null; photo_url?: string | null }>;
  trackOpens: boolean;
  setTrackOpens: (v: boolean) => void;
  preview: boolean;
  setPreview: (v: boolean) => void;
  includeSignature: boolean;
  setIncludeSignature: (v: boolean) => void;
}

/**
 * Everything the composer reads, from whichever mailbox it is attached to. The Inbox builds it
 * from its page state; the Gmail view from its own. A capability left out is a control not shown.
 */
export interface MailComposerModel {
  threadId: string;
  workspaceId: string;
  channel: string;
  threadMeta: Record<string, unknown> | null;
  recipientName: string;
  agent: { state: string | null; draft: string | null; draftIsCurrent: boolean | null; draftError: string | null };
  waWindow: WhatsAppWindow | null;
  waBlocked: boolean;
  isMember: boolean;
  isMobile: boolean;
  autocomplete: boolean;
  draft: string;
  setDraft: (v: string | ((d: string) => string)) => void;
  composerRef: RefObject<HTMLTextAreaElement | null>;
  sending: boolean;
  isNote: boolean;
  setIsNote?: (v: boolean) => void;
  attachments: File[];
  setAttachments: (v: File[]) => void;
  replyQuote: { label: string; text: string } | null;
  clearReplyQuote: () => void;
  email: ComposerEmail | null;
  ai: {
    drafting: boolean;
    draftShown: boolean;
    draftAvoidHits: string[];
    setDraftShown: (v: boolean) => void;
    steer: string;
    setSteer: (v: string) => void;
    steerOpen: boolean;
    setSteerOpen: (v: boolean) => void;
    suggest: () => void | Promise<void>;
    rewrite: (mode: RewriteMode, text: string) => Promise<string>;
  };
  cards: {
    pending: InboxCatalogItem[];
    setPending: (v: InboxCatalogItem[]) => void;
    slashMenu: SlashMenu;
    setSlashMenu: (v: SlashMenu | ((m: SlashMenu) => SlashMenu)) => void;
    choose: (kind: InboxCardKind) => void;
    toggle: (item: InboxCatalogItem) => void;
  } | null;
  templates: { open: boolean; setOpen: (v: boolean) => void } | null;
  composerSettings: ReturnType<typeof useComposerSettings>;
  followUp: { value: SendFollowUpPlan | null; set: (v: SendFollowUpPlan | null) => void; whatsappThreadId: string | null } | null;
  send: () => Promise<boolean>;
  sendAndClose?: () => void | Promise<void>;
  schedule?: (d: Date) => void | Promise<void>;
  discard: () => void;
  refresh: () => void;
}

export function useInboxComposerModel(s: InboxPageState): MailComposerModel | null {
  const {
    activeId, activeThread, labels, replyTo, setReplyTo, emailRecipients, emailCc, setEmailCc, emailBcc, setEmailBcc,
    isNote, isMember,
  } = s;
  const known = useMemo(() => new Map<string, { name: string | null }>(), []);
  if (!activeId || !activeThread) return null;
  const isEmail = activeThread.channel === 'email' && isMember;
  const ccList = splitAddresses(emailCc);
  const allCc = (emailRecipients?.replyAllCc ?? []).map((a) => a.toLowerCase());
  const isAll = allCc.length > 0 && allCc.every((a) => ccList.some((c) => c.toLowerCase() === a));
  return {
    threadId: activeThread.id,
    workspaceId: activeThread.workspace_id,
    channel: activeThread.channel,
    threadMeta: (activeThread.metadata as Record<string, unknown> | null) ?? null,
    recipientName: s.threadDisplayName(activeThread),
    agent: {
      state: activeThread.agent_state ?? null,
      draft: activeThread.agent_draft ?? null,
      draftIsCurrent: activeThread.agent_draft_is_current ?? null,
      draftError: activeThread.agent_draft_error ?? null,
    },
    waWindow: s.waWindow,
    waBlocked: s.waBlocked,
    isMember,
    isMobile: s.isMobile,
    autocomplete: true,
    draft: s.draft,
    setDraft: s.setDraft,
    composerRef: s.composerRef,
    sending: s.sending,
    isNote,
    setIsNote: s.setIsNote,
    attachments: s.attachments,
    setAttachments: s.setAttachments,
    replyQuote: replyTo
      ? { label: labels.get(replyTo.sender_participant_id ?? '')?.label ?? 'this message', text: replyTo.body || (replyTo.attachments?.length ? 'Attachment' : '—') }
      : null,
    clearReplyQuote: () => setReplyTo(null),
    email: isEmail ? {
      composeMode: isAll ? 'all' : 'reply',
      replyAllCount: allCc.length,
      setComposeMode: (mode) => {
        if (mode === 'all') s.replyAll();
        else setEmailCc(ccList.filter((c) => !allCc.includes(c.toLowerCase())).join(', '));
      },
      to: emailRecipients?.to ? [emailRecipients.to] : [],
      from: emailRecipients?.from ?? null,
      cc: ccList,
      setCc: (v) => setEmailCc(v.join(', ')),
      bcc: splitAddresses(emailBcc),
      setBcc: (v) => setEmailBcc(v.join(', ')),
      copiesOpen: s.emailCopiesOpen,
      setCopiesOpen: s.setEmailCopiesOpen,
      known,
      trackOpens: s.trackOpens,
      setTrackOpens: s.setTrackOpens,
      preview: s.emailPreview,
      setPreview: s.setEmailPreview,
      includeSignature: s.includeSignature,
      setIncludeSignature: s.setIncludeSignature,
    } : null,
    ai: {
      drafting: s.aiDrafting,
      draftShown: s.aiDraftShown,
      draftAvoidHits: s.aiDraftAvoidHits,
      setDraftShown: s.setAiDraftShown,
      steer: s.draftSteer,
      setSteer: s.setDraftSteer,
      steerOpen: s.draftSteerOpen,
      setSteerOpen: s.setDraftSteerOpen,
      suggest: s.aiSuggest,
      rewrite: async (mode, text) => (await inboxApi.assist(activeThread.id, mode, { text })).text,
    },
    cards: {
      pending: s.pendingCards,
      setPending: s.setPendingCards,
      slashMenu: s.slashMenu,
      setSlashMenu: s.setSlashMenu,
      choose: s.chooseSlashCommand,
      toggle: s.togglePendingCard,
    },
    templates: { open: s.templateOpen, setOpen: s.setTemplateOpen },
    composerSettings: s.composerSettings,
    followUp: activeThread.channel !== 'internal'
      ? { value: s.sendFollowUp, set: s.setSendFollowUp, whatsappThreadId: activeThread.channel === 'whatsapp' ? activeThread.id : null }
      : null,
    send: s.send,
    sendAndClose: isMember ? s.sendAndClose : undefined,
    schedule: isMember ? s.scheduleSend : undefined,
    discard: s.discardDraft,
    refresh: () => { void s.openThread(activeThread.id); },
  };
}
