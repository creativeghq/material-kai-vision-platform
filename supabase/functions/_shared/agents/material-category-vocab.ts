/** The material_category values the registry accepts: active `category_key`s plus their `controlled_vocab`. */

import type { DbClient } from '../supabase-client.ts';

export async function loadMaterialCategoryVocab(supabase: DbClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('material_categories')
    .select('category_key, controlled_vocab')
    .eq('is_active', true);
  if (error) throw new Error(`material_categories unreadable: ${error.message}`);
  const vocab = new Set<string>();
  for (const row of (data ?? []) as Array<{ category_key: string | null; controlled_vocab: string[] | null }>) {
    if (row.category_key) vocab.add(row.category_key.trim().toLowerCase());
    for (const v of row.controlled_vocab ?? []) if (v) vocab.add(v.trim().toLowerCase());
  }
  if (vocab.size === 0) throw new Error('material_categories returned no active vocabulary');
  return vocab;
}

/** The registry's value for `raw`, or null when the registry does not know it. */
export function resolveMaterialCategory(raw: unknown, vocab: Set<string>): string | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase();
  return key && vocab.has(key) ? key : null;
}
