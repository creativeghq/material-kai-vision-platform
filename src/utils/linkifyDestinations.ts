import { destinationPhrases } from '@/config/appDestinations';

/**
 * Turn "go to Profile → Social Accounts" into a link that actually goes there.
 *
 * Agent replies name places in the platform constantly — it is how a tool says "I cannot do this
 * part, you can". Naming a place and then not linking to it leaves the reader to hunt through a
 * seventeen-tab settings page for a tab whose exact wording they only half remember. The
 * destinations are already declared once (`src/config/appDestinations.ts`); this turns the words
 * into the link.
 *
 * Rewrites the MARKDOWN, not the DOM, so the result flows through the normal renderer and the
 * link is a link in saved history too.
 *
 * What it must never touch:
 *   • code — fenced blocks and inline spans (a path inside code is being quoted, not offered)
 *   • anything already bracketed — an existing `[label](url)`, or a bare `[label]`
 *   • raw URLs and HTML tags
 */

const SEPARATOR_CLASS = '→|—>|->|›|»|▸|>';
// Separator as it appears BETWEEN two named segments. Spaces and tabs only — NOT `\s`, which
// eats newlines and would let a paragraph ending in "Profile" merge with the markdown blockquote
// "> Keys" on the next line into a link across both.
const SEPARATOR_PATTERN = `[ \\t]*(?:${SEPARATOR_CLASS})[ \\t]*`;

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A phrase matches whatever separator and casing the writer used: `Profile → Keys`,
 * `Profile -> keys` and `Profile > Keys` are the same destination.
 */
function phrasePattern(phrase: string): string {
  return phrase
    .split(new RegExp(SEPARATOR_PATTERN))
    // Spaces INSIDE a segment stay flexible too — "Social  Accounts" is the same place.
    .map((segment) => escapeRegExp(segment.trim()).replace(/ +/g, '[ \\t]+'))
    .join(SEPARATOR_PATTERN);
}

/** Spans the rewrite must leave exactly as they are. */
const PROTECTED = /(```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`|!?\[[^\]\n]*\](?:\([^)\n]*\))?|<[^>\n]+>|https?:\/\/\S+)/g;

/**
 * The model rarely quotes a tool's breadcrumb verbatim — it paraphrases, and the paraphrase it
 * reaches for is "the Social Accounts tab". So a destination that IS a tab answers to that name
 * too. Derived from the route rather than listed, so a new tab destination gets it for free.
 *
 * `tab` is required in the phrase: bare "Keys" or "Reviews" are ordinary words.
 */
function tabAliases(): Array<{ phrase: string; route: string }> {
  return destinationPhrases()
    .filter(({ route }) => route.includes('?tab='))
    .map(({ phrase, route }) => {
      const leaf = phrase.split(new RegExp(SEPARATOR_PATTERN)).pop()!.trim();
      return { phrase: `${leaf} tab`, route };
    });
}

/** Every phrase the rewrite recognises: registered breadcrumbs plus their "… tab" paraphrase. */
function knownPhrases(): Array<{ phrase: string; route: string }> {
  const seen = new Set<string>();
  return [
    // A single-segment name ("Inbox") would match the word in ordinary prose. The registry
    // requires two segments; this is the belt to those braces.
    ...destinationPhrases().filter(({ phrase }) => new RegExp(SEPARATOR_CLASS).test(phrase)),
    ...tabAliases(),
  ].filter(({ phrase }) => {
    const k = phrase.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

let cached: { key: string; re: RegExp | null } | null = null;

/** One alternation over every known phrase, longest first so the most specific one wins. */
function destinationRegex(): RegExp | null {
  const phrases = knownPhrases().sort((a, b) => b.phrase.length - a.phrase.length);
  const key = phrases.map((p) => p.phrase).join('|');
  if (cached?.key === key) return cached.re;
  const re = phrases.length
    ? new RegExp(`\\b(?:${phrases.map((p) => phrasePattern(p.phrase)).join('|')})\\b`, 'gi')
    : null;
  cached = { key, re };
  return re;
}

/** Route for a matched phrase, resolved the same separator-agnostic, case-insensitive way. */
function routeFor(matched: string): string | null {
  const normalize = (s: string) =>
    s.toLowerCase().replace(new RegExp(SEPARATOR_PATTERN, 'g'), '>').replace(/\s+/g, ' ').trim();
  const target = normalize(matched);
  for (const { phrase, route } of knownPhrases()) {
    if (normalize(phrase) === target) return route;
  }
  return null;
}

export function linkifyDestinations(markdown: string): string {
  if (!markdown) return markdown;
  const re = destinationRegex();
  if (!re) return markdown;

  // split() with a capturing group keeps the delimiters, so the protected spans come back
  // untouched at the odd indices and only the prose between them is rewritten.
  return markdown
    .split(PROTECTED)
    .map((part, i) => {
      if (i % 2 === 1) return part; // a protected span
      return part.replace(re, (matched) => {
        const route = routeFor(matched);
        // The label stays as the writer spelled it — the link is the addition, not a correction.
        return route ? `[${matched}](${route})` : matched;
      });
    })
    .join('');
}

export default linkifyDestinations;
