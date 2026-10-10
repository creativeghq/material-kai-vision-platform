/** Is this message an automatic reply (out of office, vacation, autoresponder)? Such a message is not them answering. */
const AUTO_SUBJECT = [
  /^\s*(auto(matic)?[\s-]*(reply|response|antwort)|autoreply|out of (the )?office|ooo\b|away from (the )?office|vacation reply|abwesenheitsnotiz|réponse automatique|absence du bureau|risposta automatica|fuori ufficio|respuesta automática)/i,
  /^\s*(αυτόματη απάντηση|εκτός γραφείου|απουσία από το γραφείο)/i,
];

export interface AutoReplyHeaders {
  autoSubmitted?: string | null;
  precedence?: string | null;
  xAutoreply?: string | null;
  xAutorespond?: string | null;
  subject?: string | null;
}

export function isAutoReply(h: AutoReplyHeaders): boolean {
  const autoSubmitted = String(h.autoSubmitted ?? '').trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== 'no') return true;
  if (['auto_reply', 'auto-reply'].includes(String(h.precedence ?? '').trim().toLowerCase())) return true;
  if (String(h.xAutoreply ?? '').trim() || String(h.xAutorespond ?? '').trim()) return true;
  return AUTO_SUBJECT.some((r) => r.test(String(h.subject ?? '')));
}

export const AUTO_REPLY_GMAIL_HEADERS = ['Auto-Submitted', 'Precedence', 'X-Autoreply', 'X-Autorespond', 'Subject']
  .map((h) => `&metadataHeaders=${h}`).join('');

export function isAutoReplyFromHeaderList(headers: Array<{ name: string; value: string }>): boolean {
  const get = (n: string) => headers.find((x) => x.name.toLowerCase() === n.toLowerCase())?.value ?? null;
  return isAutoReply({
    autoSubmitted: get('Auto-Submitted'), precedence: get('Precedence'), xAutoreply: get('X-Autoreply'),
    xAutorespond: get('X-Autorespond'), subject: get('Subject'),
  });
}
