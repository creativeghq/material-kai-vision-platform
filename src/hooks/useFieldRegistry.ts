import { useEffect, useMemo, useState } from 'react';

import {
  type DisplaySection,
  type FieldRegistrySnapshot,
  categoryHasField,
  categoryHasSection,
  isInternalFieldKey,
  loadFieldRegistry,
  sectionsForCategory,
} from '@/services/fieldRegistryService';

export interface FieldRegistryView {
  /** True once the registry is loaded. While false, callers must not render unclassified keys. */
  ready: boolean;
  error: Error | null;
  snapshot: FieldRegistrySnapshot | null;
  /** The Details-tab sections for a category, in display order. */
  sections: (categoryKey: string) => DisplaySection[];
  hasSection: (categoryKey: string, sectionKey: string) => boolean;
  hasField: (categoryKey: string, fieldName: string) => boolean;
  /**
   * Whether a jsonb key is internal. `null` = cannot judge (registry has never seen the key
   * and the pattern did not load) — withhold, do not render.
   */
  isInternalField: (key: string) => boolean | null;
}

/**
 * Reads the product field registry (`material_metadata_fields`) once per session and hands
 * back the two answers the product modal needs: which sections a category has, and whether a
 * key found in the product's jsonb is safe to show (#368 PD-1/PD-5).
 *
 * `ready === false` is not "no restrictions" — it is "no answer yet". A surface that renders
 * arbitrary keys must show none of them until this is true, because the alternative is a
 * filter that silently does nothing whenever the fetch is slow or fails.
 */
export function useFieldRegistry(): FieldRegistryView {
  const [snapshot, setSnapshot] = useState<FieldRegistrySnapshot | null>(null);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadFieldRegistry()
      .then((s) => { if (!cancelled) setSnapshot(s); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e : new Error(String(e))); });
    return () => { cancelled = true; };
  }, []);

  return useMemo<FieldRegistryView>(() => ({
    ready: snapshot !== null,
    error,
    snapshot,
    sections: (categoryKey) => (snapshot ? sectionsForCategory(snapshot, categoryKey) : []),
    hasSection: (categoryKey, sectionKey) =>
      (snapshot ? categoryHasSection(snapshot, categoryKey, sectionKey) : false),
    hasField: (categoryKey, fieldName) =>
      (snapshot ? categoryHasField(snapshot, categoryKey, fieldName) : false),
    isInternalField: (key) => (snapshot ? isInternalFieldKey(snapshot, key) : null),
  }), [snapshot, error]);
}
