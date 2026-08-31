/**
 * Did the person ASK for the myDATA feed, or did they ask for our expenses?
 *
 * Two sets of rows answer to the word "expenses" and they are not interchangeable. Our books hold
 * what we have recorded — six, in the workspace this was measured in. `inbound_documents` holds
 * what suppliers have filed against us at ΑΑΔΕ — 1,866, of which 1,864 have never been booked.
 * Answering the first question with the second is not a near miss; it is a different set, three
 * orders of magnitude out, and it reads like an answer either way.
 *
 * Giving the agent a feed tool made that failure available in the OTHER direction, and it took it.
 * Measured against claude-opus-5 with the real tool descriptions: "What expenses do we have?" and
 * "List the last 10 expenses by supplier" called BOTH tools, and "Give me the first 5 expenses by
 * supplier" called the feed and never touched the ledger at all. 6/9 prompts routed correctly.
 *
 * So the rule is not a hint in a description — a description is a suggestion to a model, and this
 * one has to hold. The FEED is reachable only when the request names it. Everything else is the
 * ledger. `list_mydata_expenses` refuses and says which tool to use instead, so the model corrects
 * inside the same turn rather than answering from the wrong table.
 *
 * Pure and import-free so both runtimes and the unit tier can use it unchanged.
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
