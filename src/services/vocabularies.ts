/**
 * Value vocabularies — the frontend reader for `public.reference_vocabularies` (issue #370).
 *
 * The edge twin is supabase/functions/_shared/vocabularies.ts. Both read the same table; neither
 * restates its contents. This replaces `COMMON_MARKETS` and `COUNTRY_CODES`, two hand-written
 * lists in ToolkitFormModal that disagreed with the 30 markets the b2b tool actually searched —
 * the picker offered Australia and Canada and omitted Poland, Turkey, Serbia and Romania, i.e.
 * every market we actually source from.
 *
 * Kept byte-honest by tests/unit/vocabularyRegistry.test.ts, which fails if a second copy of a
 * vocabulary reappears in the repo. That is the `escapeHtml` lesson: three copies drifted to
 * three different answers precisely because convention was the only thing holding them together.
 *
 * FAILURE MODE: `loadVocabulary` throws when the table cannot be read and returns [] only when the
 * vocabulary is genuinely empty. Callers must not paper over the difference with a default list —
 * a fallback is invisible when it fires, and an admin's edit would then change nothing forever.
 */
import { supabase } from '@/integrations/supabase/client';

export interface VocabularyTerm {
  value: string;
  label: string;
  group_key: string | null;
  group_label: string | null;
  sort_order: number;
}

export class VocabularyStoreUnavailable extends Error {
  constructor(key: string, cause: string) {
    super(`Vocabulary store unavailable while loading "${key}": ${cause}`);
    this.name = 'VocabularyStoreUnavailable';
  }
}

/** Vocabularies change at admin speed; one fetch per key per session is plenty. */
const inflight = new Map<string, Promise<VocabularyTerm[]>>();

/**
 * Every active term of one vocabulary, in `sort_order`.
 * @throws VocabularyStoreUnavailable when the table cannot be read.
 */
export function loadVocabulary(vocabularyKey: string): Promise<VocabularyTerm[]> {
  const cached = inflight.get(vocabularyKey);
  if (cached) return cached;

  const p = (async () => {
    const { data, error } = await supabase
      .from('reference_vocabularies')
      .select('value, label, group_key, group_label, sort_order')
      .eq('vocabulary_key', vocabularyKey)
      .eq('active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      inflight.delete(vocabularyKey); // a failed fetch must not be cached as an answer
      throw new VocabularyStoreUnavailable(vocabularyKey, error.message);
    }
    return (data ?? []) as VocabularyTerm[];
  })();

  inflight.set(vocabularyKey, p);
  return p;
}

/** Drop the cache — for admin screens that have just edited a vocabulary. */
export function invalidateVocabulary(vocabularyKey?: string): void {
  if (vocabularyKey) inflight.delete(vocabularyKey);
  else inflight.clear();
}

/** Terms grouped for a `<Select>` with option groups, in `sort_order`. */
export function groupTerms(terms: VocabularyTerm[]): Array<{ key: string; label: string; terms: VocabularyTerm[] }> {
  const out: Array<{ key: string; label: string; terms: VocabularyTerm[] }> = [];
  for (const t of terms) {
    const key = t.group_key ?? '';
    let bucket = out.find((g) => g.key === key);
    if (!bucket) {
      bucket = { key, label: t.group_label ?? '', terms: [] };
      out.push(bucket);
    }
    bucket.terms.push(t);
  }
  return out;
}

/** The vocabulary key for the B2B sourcing markets — the 30 the search actually sweeps. */
export const SOURCING_MARKETS = 'sourcing_markets';
