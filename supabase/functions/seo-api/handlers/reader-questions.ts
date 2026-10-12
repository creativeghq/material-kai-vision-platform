/** What readers ask about a topic, from the searches they type. Import-free (unit-tested). */

const QUESTION_WORDS: Record<string, string[]> = {
  el: [
    'πως', 'ποσο', 'ποσα', 'ποση', 'ποσες', 'ποιο', 'ποια', 'ποιος', 'ποιες', 'τι', 'γιατι', 'ποτε', 'που',
    'μπορω', 'μπορει', 'πρεπει', 'χρειαζεται', 'χρειαζομαι', 'διαφορα', 'καλυτερο', 'καλυτερα', 'η', 'vs',
  ],
  en: ['how', 'what', 'which', 'why', 'when', 'where', 'can', 'should', 'does', 'do', 'is', 'are', 'difference', 'best', 'vs', 'versus', 'cost'],
};

const GUIDE_FORM: Record<string, string> = {
  el: 'πώς να επιλέξω',
  en: 'how to choose',
  de: 'wie wählt man',
  fr: 'comment choisir',
  it: 'come scegliere',
  es: 'cómo elegir',
  pt: 'como escolher',
  nl: 'hoe kies je',
};

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');

/** A search phrased as a question or a comparison («πόσο κοστίζει…», «… ή …», "how much…"). */
export function isReaderQuestion(term: string, languageCode: string): boolean {
  const words = new Set(fold(term).split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  const vocabulary = QUESTION_WORDS[languageCode] ?? QUESTION_WORDS.en;
  // «ή» alone is a comparison only between two things, never as the first word.
  return vocabulary.some((w) => words.has(w) && !(w === 'η' && fold(term).startsWith('η ')));
}

/** The "how to choose" form of a topic, which returns guides where the topic itself returns shops. */
export function guideQuery(keyword: string, languageCode: string): string {
  return `${GUIDE_FORM[languageCode] ?? GUIDE_FORM.en} ${keyword}`;
}

/** The questions among the searches, most-searched first, without duplicates. */
export function readerQuestions(
  terms: { term: string; searchVolume?: number }[],
  languageCode: string,
  limit = 15,
): string[] {
  const seen = new Set<string>();
  return [...terms]
    .filter((t) => isReaderQuestion(t.term, languageCode))
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .filter((t) => !seen.has(fold(t.term)) && !!seen.add(fold(t.term)))
    .slice(0, limit)
    .map((t) => t.term);
}
