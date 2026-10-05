import type { InboxSourceKey } from './inboxSource';

export type InboxMode = 'all' | 'platform' | 'whatsapp';
export type InboxFolder = 'starred' | 'sent';

export const INBOX_MODES: Array<{ key: InboxMode; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'platform', label: 'Platform' },
  { key: 'whatsapp', label: 'WhatsApp' },
];

const MODE_CHANNELS: Record<InboxMode, string[]> = {
  all: [],
  platform: ['email', 'internal', 'social'],
  whatsapp: ['whatsapp'],
};

const MODE_SOURCES: Record<InboxMode, InboxSourceKey[] | null> = {
  all: null,
  platform: ['public_profile', 'email', 'social_dm', 'social_comments', 'customer', 'dealer', 'team'],
  whatsapp: [],
};

export function parseInboxMode(raw: string | null | undefined): InboxMode {
  return raw === 'platform' || raw === 'whatsapp' ? raw : 'all';
}

export function modeChannels(mode: InboxMode): string[] {
  return MODE_CHANNELS[mode];
}

/** The sources a mode's sidebar lists; `null` is every source. */
export function modeSources(mode: InboxMode): InboxSourceKey[] | null {
  return MODE_SOURCES[mode];
}
