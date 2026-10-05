type MessageLike = { metadata?: Record<string, unknown> | null };

const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((a) => String(a ?? '').trim().toLowerCase()).filter(Boolean) : [];

export function emailReplyRecipients(messages: MessageLike[], threadMeta: Record<string, unknown> | null | undefined) {
  const ourMailbox = String(threadMeta?.email_to ?? '').toLowerCase();
  const last = [...messages].reverse().find((m) => m.metadata?.direction === 'incoming');
  const meta = last?.metadata ?? {};
  const to = list(meta.email_reply_to)[0] || String(meta.email_from ?? threadMeta?.email_from ?? '').toLowerCase();
  const sender = String(meta.email_from ?? '').toLowerCase();
  const skip = new Set([ourMailbox, to, sender].filter(Boolean));
  const [local, domain] = ourMailbox.split('@');
  const isOurs = (a: string) => skip.has(a) || (!!local && a.startsWith(`${local}+`) && a.endsWith(`@${domain}`));
  const others = [...new Set([...list(meta.email_to_all), ...list(meta.email_cc)])].filter((a) => !isOurs(a));
  return { to, from: ourMailbox, replyAllCc: others };
}

export function splitAddresses(text: string): string[] {
  return text.split(/[\s,;]+/).map((a) => a.trim()).filter(Boolean);
}
