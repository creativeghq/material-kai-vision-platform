/**
 * Did the person ASK for the myDATA feed, or did they ask for our expenses?
 * @see tests/unit/mydataIntent.test.ts
 */

/**
 * Every way a person names this feed, in both scripts.
 *
 * `ΑΑΔΕ` is written with Greek capitals that LOOK like Latin ones — Α/Δ/Ε here are U+0391/0394/0395,
 * not A/D/E. Someone typing on a Latin keyboard writes "AADE", and someone on a Greek one writes
 * "ΑΑΔΕ"; matching only one of them silently refuses half the people who ask.
 */
const FEED_TERMS: readonly string[] = [
  'mydata',
  'my data',          // as it gets typed and autocorrected
  'myaade',
  'my aade',
  'aade',
  'ΑΑΔΕ',
  'expenses inbox',
  'expense inbox',
  'inbound documents',
  'received documents',
  'filed against us',
];

/**
 * Fold the text so a match cannot be defeated by case or by the accents Greek is written with.
 * `Α` and `ά` are the same letter to a person typing quickly.
 */
function fold(text: string | null | undefined): string {
  return String(text ?? '')
    .normalize('NFD')
    // Strip combining marks — Greek tonos and dialytika, and Latin accents. Written as escapes
    // because a literal combining range in source is invisible to read and easy to break.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * True when the request names the myDATA / ΑΑΔΕ feed.
 *
 * Deliberately a SUBSTRING match on a small closed list rather than anything cleverer: the cost of
 * a false negative is a refusal that names the right word, and the cost of a false positive is
 * answering "how much did we spend" from a table of 1,864 unbooked documents.
 */
export function mentionsMyDataFeed(text: string | null | undefined): boolean {
  const t = fold(text);
  if (!t) return false;
  return FEED_TERMS.some((term) => t.includes(fold(term)));
}

/**
 * The turn's text, from the user's side only.
 *
 * The window is the last few USER messages, not just the latest: "show me the myDATA expenses"
 * followed by "only the ones we have not booked" is one request, and the second half names
 * nothing. Assistant turns are excluded on purpose — the agent's own prose says "myDATA" whenever
 * it explains where a number came from, and letting that count would make the gate open itself.
 */
export function userTurnText(messages: unknown, latest?: string | null, window = 3): string {
  const parts: string[] = [];
  if (Array.isArray(messages)) {
    const users = messages.filter(
      (m): m is { role: string; content: unknown } =>
        !!m && typeof m === 'object' && (m as { role?: string }).role === 'user',
    );
    for (const m of users.slice(-window)) {
      if (typeof m.content === 'string') parts.push(m.content);
      else if (Array.isArray(m.content)) {
        for (const c of m.content) {
          const text = (c as { text?: unknown })?.text;
          if (typeof text === 'string') parts.push(text);
        }
      }
    }
  }
  if (typeof latest === 'string' && latest) parts.push(latest);
  return parts.join('\n');
}
