export const CALLOUT_KINDS = ['tldr', 'key', 'definition', 'example', 'info', 'warning', 'quote'] as const;

export type CalloutKind = (typeof CALLOUT_KINDS)[number];

export const CALLOUT_KIND_PATTERN = CALLOUT_KINDS.join('|');
