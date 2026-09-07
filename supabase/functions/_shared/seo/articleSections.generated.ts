// GENERATED MIRROR of src/services/seo/articleSections.ts — do not edit here.
// Regenerate: npm run vocab:mirror (part of gen:all). Freshness is enforced by
// tests/unit/vocabularyMirrors.test.ts, which fails the build on any drift.

/**
 * How an article names its two structural sections — the FAQ and the closing — in the language
 * it is written in, and how every reader finds them again afterwards.
 *
 * WHY THIS EXISTS. The writer prompt said the FAQ heading was "exactly: Frequently Asked
 * Questions". That instruction is more specific than "write every word in Greek", so the model
 * obeyed it: two live articles came out with every heading in Greek except `## Frequently Asked
 * Questions` and `## Conclusion`, sitting in the middle of a Greek document for a Greek reader.
 * The PLANNER had already got it right — its outline said `Συχνές Ερωτήσεις (FAQ) για πλακάκια
 * μπάνιου Θεσσαλονίκη` — and the writer overrode the plan, because the structure rules outranked
 * both the plan and the language block.
 *
 * Fixing the prompt alone would have broken four things at once, which is why this module comes
 * with it. Every reader of that section keyed off the English string:
 *
 *   • the viewer's `FAQ_HEADING_REGEX` — a Greek heading renders as plain markdown, so the FAQ
 *     accordion silently disappears;
 *   • `analyze`'s `content.includes('frequently asked')` — twice: the article scores as HAVING NO
 *     FAQ, which raises a high-severity "FAQ section not found but planned" fix against an article
 *     that has one, and permanently docks the AEO score;
 *   • the PAA fix's `affectedSection`, which then names a heading the article does not contain;
 *   • `insertFaqEntry`'s fallback heading, which would write a fresh ENGLISH heading into a Greek
 *     article — reintroducing the defect from the other end.
 *
 * None of those raise. They are the silent-zero shape: a valid regex that matches nothing, a
 * `false` that is a plausible answer, a score that is merely lower than it should be.
 *
 * THE CONTRACT. `SECTION_LABELS` is the one table — the label to WRITE and the aliases to
 * RECOGNISE come from the same entry, so a language cannot be readable but unwritable. Recognition
 * is CONTAINS, not equals, because a good FAQ heading carries the keyword too (the planner's does).
 * When no label matches at all — a language not in the table — `findFaqSection` falls back to the
 * STRUCTURE: an H2 whose children are question-shaped headings. That degrades to something rather
 * than to nothing, which is the whole point.
 *
 * IMPORT-FREE on purpose: mirrored to Deno by `npm run vocab:mirror` (Vite resolves `@/`, Deno
 * resolves by URL, so a single import makes the copy unbuildable in the other runtime).
 */

/**
 * Lowercase, drop diacritics, and fold Greek final sigma, so `Συχνές Ερωτήσεις` and
 * `συχνες ερωτησεις` are one string.
 *
 * The sigma fold is not decoration. ς and σ are the same letter in two positions and
 * `toLowerCase` keeps them apart, while every Greek alias below ends a word with one — so
 * without it the table would match on whether somebody remembered to spell each entry twice.
 */
export function stripAccents(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\u03c2/g, '\u03c3')
    .trim();
}

export interface SectionLabels {
  /** What the writer should CALL the FAQ section in this language. */
  faq: string;
  /** What it should call the closing section. */
  conclusion: string;
  /** Other forms that mean the same thing, for recognition only. */
  faqAliases: string[];
  conclusionAliases: string[];
  /**
   * The placeholder the Gaps tab's "Add section" button leaves under a heading it just added.
   *
   * It goes INTO the customer's article, so it is the article's language or it is the same defect
   * one button along: the heading it sits under is a Greek keyword, and an English sentence
   * underneath it is the thing we just spent a fix removing.
   */
  todo: { answer: string; cover: string };
}

/**
 * One entry per language the pipeline can write in.
 *
 * Adding a language is one entry, and it makes that language both writable and readable in the
 * same edit. The list is not exhaustive and does not need to be — an unlisted language still
 * writes correctly (the model is told to use its own language, not to look anything up here) and
 * is still found by the structural fallback below. The table is what lets us NAME the section when
 * we have to create one ourselves, which the model is not there for.
 */
export const SECTION_LABELS: Record<string, SectionLabels> = {
  en: {
    faq: 'Frequently Asked Questions',
    conclusion: 'Conclusion',
    faqAliases: ['faq', 'faqs', 'common questions', 'questions and answers'],
    conclusionAliases: ['next steps', 'summary', 'final thoughts', 'in conclusion', 'wrapping up'],
    todo: {
      answer: 'Answer this — searchers ask it and this article does not.',
      cover: 'Cover this — it is searched for and this article does not mention it.',
    },
  },
  el: {
    faq: 'Συχνές Ερωτήσεις',
    conclusion: 'Συμπέρασμα',
    faqAliases: ['συχνες ερωτησεις', 'ερωτησεις και απαντησεις', 'συνηθεις ερωτησεις'],
    conclusionAliases: ['συμπερασματα', 'επιλογος', 'επομενα βηματα', 'τελικες σκεψεις', 'συνοψη'],
    todo: {
      answer: 'Απαντήστε σε αυτό — το αναζητούν και το άρθρο δεν το απαντά.',
      cover: 'Καλύψτε αυτό — αναζητείται και το άρθρο δεν το αναφέρει.',
    },
  },
  es: {
    faq: 'Preguntas Frecuentes',
    conclusion: 'Conclusión',
    faqAliases: ['preguntas frecuentes', 'preguntas y respuestas'],
    conclusionAliases: ['conclusiones', 'proximos pasos', 'resumen'],
    todo: {
      answer: 'Responde a esto: la gente lo busca y este artículo no lo responde.',
      cover: 'Cubre esto: se busca y este artículo no lo menciona.',
    },
  },
  it: {
    faq: 'Domande Frequenti',
    conclusion: 'Conclusione',
    faqAliases: ['domande frequenti', 'domande e risposte'],
    conclusionAliases: ['conclusioni', 'prossimi passi', 'riepilogo'],
    todo: {
      answer: 'Rispondi a questa domanda: viene cercata e l’articolo non la copre.',
      cover: 'Tratta questo argomento: viene cercato e l’articolo non lo menziona.',
    },
  },
  de: {
    faq: 'Häufige Fragen',
    conclusion: 'Fazit',
    faqAliases: ['haufige fragen', 'haufig gestellte fragen', 'fragen und antworten'],
    conclusionAliases: ['zusammenfassung', 'nachste schritte', 'schlusswort'],
    todo: {
      answer: 'Beantworte das — danach wird gesucht, der Artikel sagt nichts dazu.',
      cover: 'Behandle das — danach wird gesucht, der Artikel erwähnt es nicht.',
    },
  },
  fr: {
    faq: 'Questions Fréquentes',
    conclusion: 'Conclusion',
    faqAliases: ['questions frequentes', 'questions frequemment posees', 'questions et reponses'],
    conclusionAliases: ['prochaines etapes', 'resume', 'pour conclure'],
    todo: {
      answer: 'Répondez à cette question : elle est recherchée et l’article n’y répond pas.',
      cover: 'Traitez ce sujet : il est recherché et l’article n’en parle pas.',
    },
  },
  pt: {
    faq: 'Perguntas Frequentes',
    conclusion: 'Conclusão',
    faqAliases: ['perguntas frequentes', 'perguntas e respostas'],
    conclusionAliases: ['conclusoes', 'proximos passos', 'resumo'],
    todo: {
      answer: 'Responda a isto: as pessoas procuram e este artigo não responde.',
      cover: 'Aborde isto: é procurado e este artigo não menciona.',
    },
  },
  nl: {
    faq: 'Veelgestelde Vragen',
    conclusion: 'Conclusie',
    faqAliases: ['veelgestelde vragen', 'vragen en antwoorden'],
    conclusionAliases: ['samenvatting', 'volgende stappen'],
    todo: {
      answer: 'Beantwoord dit — er wordt op gezocht en het artikel doet dat niet.',
      cover: 'Behandel dit — er wordt op gezocht en het artikel noemt het niet.',
    },
  },
  bg: {
    faq: 'Често задавани въпроси',
    conclusion: 'Заключение',
    faqAliases: ['често задавани въпроси', 'въпроси и отговори'],
    conclusionAliases: ['обобщение', 'следващи стъпки'],
    todo: {
      answer: 'Отговорете на това — търси се, а статията не отговаря.',
      cover: 'Покрийте това — търси се, а статията не го споменава.',
    },
  },
  ro: {
    faq: 'Întrebări Frecvente',
    conclusion: 'Concluzie',
    faqAliases: ['intrebari frecvente', 'intrebari si raspunsuri'],
    conclusionAliases: ['concluzii', 'pasi urmatori', 'rezumat'],
    todo: {
      answer: 'Răspunde la asta — se caută, iar articolul nu răspunde.',
      cover: 'Acoperă asta — se caută, iar articolul nu o menționează.',
    },
  },
};

/** Everything that means "this is the FAQ section", in every language above, normalized. */
export const FAQ_HEADING_PATTERNS: string[] = [
  ...new Set(
    Object.values(SECTION_LABELS)
      .flatMap((l) => [l.faq, ...l.faqAliases])
      .map(stripAccents),
  ),
];

/** Everything that means "this is the closing section". */
export const CONCLUSION_HEADING_PATTERNS: string[] = [
  ...new Set(
    Object.values(SECTION_LABELS)
      .flatMap((l) => [l.conclusion, ...l.conclusionAliases])
      .map(stripAccents),
  ),
];

/** Drop the punctuation a heading can end with, so `Συχνές Ερωτήσεις:` still matches. */
function normalizeHeading(text: string): string {
  return stripAccents(text).replace(/[:\uff1a?;\u037e\u061f\uff1f.\u3001,]+$/, '').trim();
}

/**
 * Does this heading name the FAQ section?
 *
 * CONTAINS, not equals. A heading that carries the keyword as well as the label is the one the
 * planner asks for and the better heading for search — `Συχνές Ερωτήσεις (FAQ) για πλακάκια
 * μπάνιου Θεσσαλονίκη` is what it actually planned. An equality test rejects every one of those,
 * which is how a correct heading ends up unrecognised.
 */
export function isFaqHeading(headingText: string): boolean {
  const h = normalizeHeading(headingText);
  if (!h) return false;
  return FAQ_HEADING_PATTERNS.some((p) => h.includes(p));
}

/** Does this heading name the closing section? */
export function isConclusionHeading(headingText: string): boolean {
  const h = normalizeHeading(headingText);
  if (!h) return false;
  return CONCLUSION_HEADING_PATTERNS.some((p) => h.includes(p));
}

/**
 * Does this heading read as a QUESTION?
 *
 * Greek ends a question with `;` (and the look-alike U+037E), Arabic with `؟`, CJK with `？` — a
 * test for `?` alone answers "no" for every question in half the languages this pipeline writes.
 */
export function isQuestionHeading(headingText: string): boolean {
  return /[?;\u037e\u061f\uff1f]\s*$/.test(headingText.trim());
}

export interface FaqSectionLocation {
  /** Index of the `## …` line that opens the section. */
  headingLine: number;
  /** The heading's own text, without the `## `. This is what the article calls it. */
  headingText: string;
  /** Index of the line AFTER the section — the next H1/H2, or the end of the document. */
  endLine: number;
  /** How it was found: by its name, or by the shape of what is under it. */
  matchedBy: 'label' | 'structure';
}

const H2 = /^##\s+(.+?)\s*$/;
const H1_OR_H2 = /^#{1,2}\s+\S/;
const H3_OR_H4 = /^#{3,4}\s+(.+?)\s*$/;

/** Where the section that starts at `headingLine` ends — the next H1/H2, or the document end. */
function sectionEnd(lines: string[], headingLine: number): number {
  for (let i = headingLine + 1; i < lines.length; i++) {
    if (H1_OR_H2.test(lines[i].trim())) return i;
  }
  return lines.length;
}

/**
 * Find the article's FAQ section.
 *
 * Two passes, and the order matters. The LABEL pass is precise, so it runs alone whenever it
 * finds anything — that keeps a body section that merely discusses questions from being promoted
 * into an accordion. The STRUCTURE pass runs only when no heading in the document names an FAQ at
 * all, which is the case this exists for: an article written in a language the table does not
 * list. An H2 with two or more question-shaped sub-headings under it is an FAQ section in any
 * language, and finding it beats rendering the questions as flat prose.
 */
export function findFaqSection(markdown: string): FaqSectionLocation | null {
  const lines = markdown.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(H2);
    if (m && isFaqHeading(m[1])) {
      return {
        headingLine: i,
        headingText: m[1],
        endLine: sectionEnd(lines, i),
        matchedBy: 'label',
      };
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].trim().match(H2);
    if (!m || isConclusionHeading(m[1])) continue;
    const end = sectionEnd(lines, i);
    let questions = 0;
    let other = 0;
    for (let j = i + 1; j < end; j++) {
      const sub = lines[j].trim().match(H3_OR_H4);
      if (!sub) continue;
      if (isQuestionHeading(sub[1])) questions += 1;
      else other += 1;
    }
    // All of them, not most: a how-to section with one question-shaped step is not an FAQ.
    if (questions >= 2 && other === 0) {
      return { headingLine: i, headingText: m[1], endLine: end, matchedBy: 'structure' };
    }
  }

  return null;
}

/**
 * Index of the `## …` line that opens the closing section, or -1.
 *
 * The LAST one, not the first. Callers use this to mean "put the new material above the closing
 * copy", and the closing section is at the end by definition — while the aliases that identify it
 * ("summary", "συνοψη", "riepilogo") are perfectly ordinary words for a mid-article H2. Taking the
 * first match files a new section above a cost summary halfway up the page and leaves the actual
 * conclusion below everything, which is the placement this was added to avoid.
 */
export function findConclusionLine(markdown: string): number {
  const lines = markdown.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const m = lines[i].trim().match(H2);
    if (m && isConclusionHeading(m[1])) return i;
  }
  return -1;
}

/**
 * Which language is this document written in, judged only by its SCRIPT.
 *
 * Deliberately narrow. A script tells you Greek from Latin and nothing else — Spanish, Italian and
 * English are one alphabet — so this answers for the scripts that map to exactly one language the
 * table lists, and returns null otherwise. Guessing "en" from latin letters is how a Spanish
 * article gets an English heading, which is the defect this module exists to remove.
 */
export function scriptLanguage(text: string): string | null {
  const greek = (text.match(/[\u0370-\u03ff\u1f00-\u1fff]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  const cyrillic = (text.match(/[\u0400-\u04ff]/g) || []).length;
  const total = greek + latin + cyrillic;
  if (total < 40) return null;
  if (greek / total > 0.5) return 'el';
  return null;
}

/**
 * The heading to WRITE when we have to create a section ourselves.
 *
 * Order: the language the article was commissioned in, then the script it is actually written in,
 * then English. The stored code comes first because it is a stated intent rather than an
 * inference; the script check is what saves an article written before the code was recorded.
 */
export function sectionLabelsFor(
  languageCode?: string | null,
  markdown?: string | null,
): SectionLabels {
  const base = String(languageCode ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (base && SECTION_LABELS[base]) return SECTION_LABELS[base];
  const detected = markdown ? scriptLanguage(markdown) : null;
  if (detected && SECTION_LABELS[detected]) return SECTION_LABELS[detected];
  return SECTION_LABELS.en;
}
