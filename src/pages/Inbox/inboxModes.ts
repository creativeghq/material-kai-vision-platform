import type { InboxSourceKey } from './inboxSource';

export type InboxMode = 'all' | 'platform' | 'whatsapp' | 'gmail';
export type InboxFolder = 'starred' | 'sent' | 'drafts';

export const INBOX_MODES: Array<{ key: InboxMode; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'platform', label: 'Platform' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'gmail', label: 'Gmail' },
];

const MODE_CHANNELS: Record<InboxMode, string[]> = {
  all: [],
  platform: ['email', 'internal', 'social'],
  whatsapp: ['whatsapp'],
  gmail: [],
};

const MODE_SOURCES: Record<InboxMode, InboxSourceKey[] | null> = {
  all: null,
  platform: ['public_profile', 'email', 'social_dm', 'social_comments', 'customer', 'dealer', 'team'],
  whatsapp: [],
  gmail: [],
};

/** Gmail is the operator's only, until Google verification lets tenants connect it. */
export function visibleModes(isOperator: boolean) {
  return INBOX_MODES.filter((m) => m.key !== 'gmail' || isOperator);
}

export function parseInboxMode(raw: string | null | undefined, isOperator = false): InboxMode {
  if (raw === 'gmail') return isOperator ? 'gmail' : 'all';
  return raw === 'platform' || raw === 'whatsapp' ? raw : 'all';
}

export function modeChannels(mode: InboxMode): string[] {
  return MODE_CHANNELS[mode];
}

/** The sources a mode's sidebar lists; `null` is every source. */
export function modeSources(mode: InboxMode): InboxSourceKey[] | null {
  return MODE_SOURCES[mode];
}
