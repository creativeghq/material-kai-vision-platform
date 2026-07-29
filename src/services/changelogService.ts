/**
 * Changelog — the single reader for `changelog_entries`.
 *
 * Two surfaces render this data: the in-app Profile → Subscription tab (`ChangelogList`) and the
 * public `/changelog` page. They look nothing alike, but they must never disagree about *which*
 * entries are published or how they group — so the query, the category vocabulary and the
 * month-grouping all live here rather than being written twice.
 *
 * Only rows with a non-null `published_at` are ever returned. Drafts are invisible to both
 * surfaces, and to anonymous visitors the RLS policy enforces the same thing server-side.
 */
import { supabase } from '@/integrations/supabase/client';

export type ChangelogCategory = 'api' | 'feature' | 'fix' | 'breaking' | 'platform';

export interface ChangelogEntry {
  id: string;
  slug: string;
  title: string;
  body_md: string;
  category: ChangelogCategory | null;
  published_at: string;
}

export interface ChangelogMonth {
  /** `YYYY-MM`, used as a stable React key and anchor id. */
  key: string;
  /** Localised label, e.g. "July 2026". */
  label: string;
  items: ChangelogEntry[];
}

/** Display metadata per category. `platform` is the fallback for a null/unknown value. */
export const CHANGELOG_CATEGORY_LABEL: Record<ChangelogCategory, string> = {
  api: 'API',
  feature: 'Feature',
  fix: 'Fix',
  breaking: 'Breaking',
  platform: 'Platform',
};

export const CHANGELOG_CATEGORY_CLASS: Record<ChangelogCategory, string> = {
  api: 'bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30',
  feature: 'bg-violet-500/15 text-violet-700 dark:text-violet-300 border-violet-500/30',
  fix: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
  breaking: 'bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30',
  platform: 'bg-muted text-foreground border-border',
};

export const changelogCategory = (c: ChangelogCategory | null): ChangelogCategory => c ?? 'platform';

/** Fetch published entries, newest first. */
export async function fetchChangelog(limit = 100): Promise<ChangelogEntry[]> {
  const { data, error } = await supabase
    .from('changelog_entries')
    .select('id, slug, title, body_md, category, published_at')
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data || []) as ChangelogEntry[];
}

/** Group entries into months, preserving the newest-first order they arrived in. */
export function groupByMonth(entries: ChangelogEntry[]): ChangelogMonth[] {
  const byMonth: Record<string, ChangelogEntry[]> = {};
  for (const e of entries) {
    const d = new Date(e.published_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    (byMonth[key] ||= []).push(e);
  }
  return Object.entries(byMonth).map(([key, items]) => {
    const [y, m] = key.split('-').map(Number);
    const label = new Date(y, m - 1, 1).toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
    return { key, label, items };
  });
}

export const formatChangelogDate = (iso: string): string =>
  new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
