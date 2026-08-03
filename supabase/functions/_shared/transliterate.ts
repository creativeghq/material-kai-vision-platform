/**
 * transliterate.ts — deterministic Cyrillic/Greek → Latin transliteration.
 *
 * WHY THIS EXISTS: VIES is a proxy over each member state's own VAT register and returns the
 * company name in whatever script that register stores — Cyrillic for BG, Greek for EL/CY. There
 * is no language parameter (verified 2026-08-03 against the REST and SOAP endpoints, and against
 * `Accept-Language`, `lang`, `locale` and `language` — all ignored). So a Latin rendering has to
 * be derived on our side.
 *
 * WHAT THIS IS NOT: this produces a TRANSLITERATION, not a translation and not a trading name.
 * `Виваком България - ЕАД` becomes `Vivakom Bulgaria - EAD`, while the company actually trades
 * as "Vivacom". Treat the output as a readability aid for Latin-script users. The original string
 * stays authoritative — it is what has to appear on an invoice for VAT purposes.
 *
 * STANDARDS:
 *  - Bulgarian: the Transliteration Act (Закон за транслитерацията, 2009), incl. its two named
 *    exceptions — word-final "ия" → "ia", and "България" → "Bulgaria".
 *  - Greek: ELOT 743 / ISO 843 (the system used for Greek passports), incl. the αυ/ευ/ηυ voicing
 *    rule and the γ- and μπ- digraphs.
 *
 * Pure and dependency-free so it can be unit-tested outside Deno.
 */

export type DetectedScript = 'cyrillic' | 'greek' | 'latin' | 'none';

const CYRILLIC_RE = /[Ѐ-ӿ]/;
// Greek and Coptic + Greek Extended (polytonic, occasionally present in older register entries).
const GREEK_RE = /[Ͱ-Ͽἀ-῿]/;
const LATIN_RE = /[A-Za-z]/;

/**
 * Which script dominates `input`. Checked non-Latin first: register strings are frequently mixed
 * (`ЕАД` next to a Latin brand fragment), and the non-Latin part is the part that needs converting.
 */
export function detectScript(input: string | null | undefined): DetectedScript {
  if (!input) return 'none';
  if (CYRILLIC_RE.test(input)) return 'cyrillic';
  if (GREEK_RE.test(input)) return 'greek';
  if (LATIN_RE.test(input)) return 'latin';
  return 'none';
}

/* ------------------------------------------------------------------ Bulgarian */

/** Transliteration Act Art. 4. Keys are lowercase; casing is reapplied per word afterwards. */
const BG_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's',
  т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sht',
  ъ: 'a', ь: 'y', ю: 'yu', я: 'ya',
  // Not Bulgarian, but cheap insurance against a register row carrying a Russian/Serbian letter.
  ё: 'e', ы: 'y', э: 'e', і: 'i', ї: 'i', є: 'e', ѝ: 'i',
};

/** Transliterate one all-lowercase Bulgarian word. */
function bgWord(word: string): string {
  // Art. 6: the country's own name is spelled "Bulgaria", not the mechanical "Balgariya".
  if (word === 'българия') return 'bulgaria';

  let out = '';
  for (const ch of word) out += BG_MAP[ch] ?? ch;

  // Art. 5: word-final "ия" renders as "ia" (mechanically it would be "iya").
  if (word.endsWith('ия')) out = `${out.slice(0, -3)}ia`;
  return out;
}

/* ---------------------------------------------------------------------- Greek */

const GR_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's',
  ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
  // Accented and diaeresis forms collapse onto their base letter.
  ά: 'a', έ: 'e', ή: 'i', ί: 'i', ό: 'o', ύ: 'y', ώ: 'o',
  ϊ: 'i', ϋ: 'y', ΐ: 'i', ΰ: 'y',
};

/** Vowels that can open an αυ/ευ/ηυ pair, with their accented variants. */
const GR_AU_HEAD: Record<string, string> = { α: 'a', ά: 'a', ε: 'e', έ: 'e', η: 'i', ή: 'i' };
/** Second element of those pairs — a diaeresis (ϋ) deliberately breaks the pair. */
const GR_UPSILON = new Set(['υ', 'ύ']);
/** After αυ/ευ/ηυ these devoice the upsilon to "f"; anything else (or word-end) voices it to "v". */
const GR_VOICELESS = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ']);

/** Vowel pairs that render as a unit. Diaeresis forms are absent on purpose — they split. */
const GR_VOWEL_PAIRS: Record<string, string> = {
  ου: 'ou', ού: 'ou', οὐ: 'ou',
  αι: 'ai', αί: 'ai',
  ει: 'ei', εί: 'ei',
  οι: 'oi', οί: 'oi',
  υι: 'yi', υί: 'yi',
};

/** Consonant digraphs. μπ is handled separately — it depends on position in the word. */
const GR_CONSONANT_PAIRS: Record<string, string> = {
  γγ: 'ng', γξ: 'nx', γχ: 'nch', γκ: 'gk', ντ: 'nt',
};

/** Transliterate one all-lowercase Greek word per ELOT 743. */
function grWord(word: string): string {
  let out = '';
  let i = 0;
  while (i < word.length) {
    const ch = word[i];
    const next = word[i + 1] ?? '';
    const pair = ch + next;

    // μπ → "b" word-initially, "mp" elsewhere.
    if (pair === 'μπ') {
      out += i === 0 ? 'b' : 'mp';
      i += 2;
      continue;
    }
    if (GR_CONSONANT_PAIRS[pair]) {
      out += GR_CONSONANT_PAIRS[pair];
      i += 2;
      continue;
    }
    // αυ/ευ/ηυ voice or devoice depending on what follows.
    if (GR_AU_HEAD[ch] && GR_UPSILON.has(next)) {
      const after = word[i + 2] ?? '';
      const devoiced = after === '' || GR_VOICELESS.has(after);
      out += GR_AU_HEAD[ch] + (devoiced ? 'f' : 'v');
      i += 2;
      continue;
    }
    if (GR_VOWEL_PAIRS[pair]) {
      out += GR_VOWEL_PAIRS[pair];
      i += 2;
      continue;
    }
    out += GR_MAP[ch] ?? ch;
    i += 1;
  }
  return out;
}

/* ----------------------------------------------------------------- word casing */

/**
 * Reapply the source word's casing to its (lowercase) transliteration.
 *
 * Register names arrive in every casing — `ИНФОРМАЦИОННО ОБСЛУЖВАНЕ` shouting in caps next to a
 * title-cased `Виваком`. Deciding per word rather than per character is what keeps multi-character
 * outputs like "zh"/"sht" from coming out as "Zh" in the middle of an otherwise all-caps word.
 */
function applyCase(source: string, latin: string): string {
  const letters = [...source].filter((c) => c.toLowerCase() !== c.toUpperCase());
  if (letters.length === 0) return latin;

  const isAllUpper = letters.every((c) => c === c.toUpperCase());
  if (isAllUpper && letters.length > 1) return latin.toUpperCase();

  const startsUpper = letters[0] === letters[0].toUpperCase();
  if (startsUpper) return latin.charAt(0).toUpperCase() + latin.slice(1);
  return latin;
}

/* -------------------------------------------------------------------- public */

/**
 * Transliterate `input` to Latin, or return null when there is nothing to gain.
 *
 * Returns null for empty input, for the VIES "no data" sentinel `---`, and — importantly — for
 * text that is already Latin. A null means "the original is already readable"; callers should not
 * store a Latin copy in that case, so a populated `*_latin` column always signals a real
 * script conversion rather than a redundant duplicate.
 */
export function transliterateToLatin(input: string | null | undefined): string | null {
  if (!input) return null;
  const text = input.replace(/\s+/g, ' ').trim();
  if (!text || text === '---') return null;

  const script = detectScript(text);
  if (script !== 'cyrillic' && script !== 'greek') return null;

  const convert = script === 'cyrillic' ? bgWord : grWord;
  // Split on runs of letters so punctuation, digits and spacing survive untouched.
  const scriptLetters = script === 'cyrillic' ? /[Ѐ-ӿ]+/g : /[Ͱ-Ͽἀ-῿]+/g;
  const out = text.replace(scriptLetters, (word) => applyCase(word, convert(word.toLowerCase())));

  // If nothing actually changed there is no point storing a copy.
  return out === text ? null : out;
}
