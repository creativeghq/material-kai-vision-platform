/**
 * Value vocabularies — the edge-side reader for `public.reference_vocabularies` (issue #370).
 *
 * WHY THIS EXISTS. The 30 sourcing markets were a module-local const (`B2B_REGIONS`) used only to
 * interpolate a string into a web-search query. The model could not read it — not from the prompt,
 * not from the tool schema (`country`/`region` were bare `z.string()`), not from the tool
 * description, not from the KB. Asked to "search the countries list we have in place", the agent
 * searched the Knowledge Base three times, found nothing, then INVENTED a list and presented it as
 * the platform's, with Bulgaria in the wrong region and 13 markets missing. Nothing could catch
 * that: a wrong country list is a valid country list.
 *
 * The rule is the same one CLAUDE.md already states for prompts and the field registry — an
 * enumerable vocabulary is DATA. It must be editable without a deploy, and it must reach the tool
 * schema, the tool description and the picker form from ONE place. The frontend twin is
 * src/services/vocabularies.ts; both read this table and neither restates its contents.
 *
 * FAILURE MODE. `loadVocabulary` THROWS when the store is unreachable and returns an empty list
 * only when the vocabulary genuinely has no active rows. Those are different facts and callers
 * must be able to tell them apart — the whole defect above came from a missing list being
 * indistinguishable from an unreadable one. Never add a hardcoded fallback: a fallback is
 * invisible when it fires, and an admin's edit would then save and change nothing forever.
 */

// deno-lint-ignore-file no-explicit-any

export interface VocabularyTerm {
  value: string;
  label: string;
  group_key: string | null;
  group_label: string | null;
  sort_order: number;
  /** Free-form extras for the term, e.g. sourcing_markets rows carry language_code / language_name. */
  metadata?: Record<string, unknown> | null;
}

export class VocabularyStoreUnavailable extends Error {
  constructor(key: string, cause: string) {
    super(`Vocabulary store unavailable while loading "${key}": ${cause}`);
    this.name = 'VocabularyStoreUnavailable';
  }
}

/** Per-isolate cache. Vocabularies change at admin speed, not request speed. */
const CACHE = new Map<string, { at: number; terms: VocabularyTerm[] }>();
const TTL_MS = 5 * 60_000;

/**
 * Every active term of one vocabulary, in `sort_order`.
 * @throws VocabularyStoreUnavailable when the table cannot be read.
 */
export async function loadVocabulary(
  supabase: any,
  vocabularyKey: string,
  opts: { fresh?: boolean } = {},
): Promise<VocabularyTerm[]> {
  const hit = CACHE.get(vocabularyKey);
  if (!opts.fresh && hit && Date.now() - hit.at < TTL_MS) return hit.terms;

  const { data, error } = await supabase
    .from('reference_vocabularies')
    .select('value, label, group_key, group_label, sort_order, metadata')
    .eq('vocabulary_key', vocabularyKey)
    .eq('active', true)
    .order('sort_order', { ascending: true });

  if (error) throw new VocabularyStoreUnavailable(vocabularyKey, error.message);

  const terms = (data ?? []) as VocabularyTerm[];
  CACHE.set(vocabularyKey, { at: Date.now(), terms });
  return terms;
}

/** Just the values — the shape a `z.enum` wants. */
export async function loadVocabularyValues(supabase: any, vocabularyKey: string): Promise<string[]> {
  return (await loadVocabulary(supabase, vocabularyKey)).map((t) => t.value);
}

/** Distinct group keys, in first-appearance order. */
export function groupKeys(terms: VocabularyTerm[]): string[] {
  const seen: string[] = [];
  for (const t of terms) if (t.group_key && !seen.includes(t.group_key)) seen.push(t.group_key);
  return seen;
}

/** The terms of one group. */
export function termsInGroup(terms: VocabularyTerm[], groupKey: string): VocabularyTerm[] {
  return terms.filter((t) => t.group_key === groupKey);
}

/**
 * The vocabulary rendered for a TOOL DESCRIPTION, so the model can see the legal values instead
 * of guessing them. This is the half that was missing: the old description named the five region
 * keys and never said which countries were in them, so the agent could not answer "what countries
 * do we cover" without making it up.
 *
 * e.g. `cee (Central & Eastern Europe): Poland, Czech Republic, …`
 */
export function describeGroups(terms: VocabularyTerm[]): string {
  return groupKeys(terms)
    .map((g) => {
      const rows = termsInGroup(terms, g);
      const label = rows[0]?.group_label ?? g;
      return `${g} (${label}): ${rows.map((r) => r.value).join(', ')}`;
    })
    .join('; ');
}

/** Flat list for an "everything" sweep, in `sort_order`. */
export function allValues(terms: VocabularyTerm[]): string[] {
  return terms.map((t) => t.value);
}

/**
 * Fold a country string to a comparison key — lowercase, unaccented, punctuation-free, no leading
 * article. `Türkiye`, `TURKIYE` and `türkiye ` are one country, and so are `U.K.` and `uk`.
 *
 * Letters of ANY script survive, not just `a-z`: an ASCII-only class folds `Ελλάδα` and `Україна`
 * to the empty string, and an empty key does not mean "no match" — it means every unwritable name
 * collides with every other one, so a country resolves to whichever row the loop reached first.
 */
function marketKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip the combining marks NFD just split off
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
    .replace(/ /g, '');
}

/**
 * The market row a country STRING refers to, or null when it is not one of ours.
 *
 * `country` is deliberately a free string on the search tool — any country is searchable, not only
 * the markets we sweep — so what arrives is whatever the model typed. Matching it against `value`
 * alone meant `Czechia` matched NOTHING: the search still ran, still said "in Czechia", and
 * silently dropped the native-language clause that is the entire reason the row carries a
 * language. A country that resolves to no row looks exactly like one that genuinely has no
 * language, so nothing raised — the silent-zero shape, one layer down from the list itself.
 *
 * The alternative names are DATA (`metadata.aliases`), never a constant here, for the same reason
 * the markets are: a table of country names in a source file is another copy of the country list,
 * which is the thing tests/unit/vocabularyRegistry.test.ts exists to stop. An admin adding a
 * market adds its exonyms and ISO codes on the same row, with no deploy.
 *
 * Canonical names are matched in full BEFORE any alias, so one market's alias can never shadow
 * another market's real name.
 */
export function resolveMarket(
  terms: VocabularyTerm[],
  country: string | null | undefined,
): VocabularyTerm | null {
  const needle = country ? marketKey(country) : '';
  if (!needle) return null;

  for (const t of terms) {
    if (marketKey(t.value) === needle || marketKey(t.label) === needle) return t;
  }
  for (const t of terms) {
    const aliases = (t.metadata as { aliases?: unknown } | null | undefined)?.aliases;
    if (Array.isArray(aliases) && aliases.some((a) => typeof a === 'string' && marketKey(a) === needle)) {
      return t;
    }
  }
  return null;
}

/**
 * The geographic scope clause for a manufacturer-search query — ONE derivation, two readers
 * (`_shared/tools/b2b-tools.ts` and `flow-engine`).
 *
 * They had three different answers between them. b2b-tools expanded a region to its member
 * countries and named all 30 markets for a bare sweep; flow-engine emitted the raw region KEY
 * (`in the cee region` — meaningless to a web search) and, with nothing set, the vague
 * `across Europe and major global manufacturing hubs`. Same tool, same DB prompt, different
 * geography — so the same request answered differently depending on which caller ran it, and
 * neither was wrong in a way anything could detect.
 */
export function buildMarketScope(
  terms: VocabularyTerm[],
  sel: { country?: string | null; region?: string | null },
): string {
  // Canonicalised where we know the market, verbatim where we do not — `country` is a free string
  // precisely so a market we do not list stays searchable, and rewriting it would silently narrow
  // the search to somewhere the caller did not ask for.
  if (sel.country) return `in ${resolveMarket(terms, sel.country)?.value ?? sel.country}`;
  if (sel.region) {
    const rows = termsInGroup(terms, sel.region.toLowerCase());
    if (rows.length) {
      return `in the ${rows[0].group_label ?? sel.region} region (${rows.map((r) => r.value).join(', ')})`;
    }
    return `in the ${sel.region} region`;
  }
  const all = allValues(terms);
  return `across these ${all.length} markets: ${all.join(', ')}`;
}
