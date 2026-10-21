/** Counted facts about our own catalogue, read from the specs the crawler extracted per page. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { serpValue } from './untrusted.ts';

export interface CatalogueSummary {
  category_url: string;
  category_found: boolean;
  /** own: pages whose URL sits under the category page's; linked: every page it links to (other makers and categories included). */
  scope?: 'own' | 'linked';
  links: number;
  members: number;
  with_price: number;
  attributes: Record<string, { present: number; distinct?: number; values: Record<string, number> | null }>;
}

const MAX_CATEGORIES = 16;
const VALUES_PER_LABEL = 12;
const LABELS_PER_CATEGORY = 20;
const MAX_PRODUCT_LINES = 30;
/** The facts ride on every writer and reviewer call, so they get a total budget; link targets come first. */
const MAX_CATALOGUE_CHARS = 9000;

/** One category's summary as prompt lines; empty when no member page states a spec. */
export function catalogueSummaryLines(s: CatalogueSummary): string[] {
  if (!s.members) return [];
  const lines = [
    `Category page: ${serpValue(s.category_url, 300)}`,
    s.scope === 'own'
      ? `  ${s.members} product pages under this page state specs; ${s.with_price} of ${s.members} state their own price.`
      : `  ${s.members} pages this page links to state specs (they may be other makers' or other categories' pages, not this page's own range); ${s.with_price} of ${s.members} state their own price.`,
  ];
  const labels = Object.entries(s.attributes ?? {})
    .sort((a, b) => b[1].present - a[1].present)
    .slice(0, LABELS_PER_CATEGORY);
  for (const [label, a] of labels) {
    const entries = Object.entries(a.values ?? {}).sort((x, y) => y[1] - x[1]);
    const shown = entries.slice(0, VALUES_PER_LABEL)
      .map(([v, n]) => `${serpValue(v, 120)} (${n})`).join('; ');
    const distinct = a.distinct ?? entries.length;
    const more = distinct > VALUES_PER_LABEL ? `; +${distinct - Math.min(VALUES_PER_LABEL, entries.length)} other values` : '';
    lines.push(`  ${serpValue(label, 80)} — stated on ${a.present} of ${s.members}: ${shown}${more}`);
  }
  return lines;
}

export function renderCatalogueFacts(summaries: CatalogueSummary[], countedOn: Date): string | null {
  const all = summaries.map(catalogueSummaryLines).filter((l) => l.length);
  if (!all.length) return null;
  const bodies: string[][] = [];
  let size = 0;
  for (const lines of all) {
    const n = lines.join('\n').length;
    if (bodies.length && size + n > MAX_CATALOGUE_CHARS) continue;
    bodies.push(lines);
    size += n;
  }
  return [
    `CATALOGUE FACTS (counted from our own pages on ${countedOn.toISOString().slice(0, 10)})`,
    'Each count is how many of our product pages state that value, exactly as the page words it. Value (count).',
    'These counts cover ONLY the product pages each category page links to, which may be its first page of results. '
      + 'Never present them as the size of the whole catalogue or category ("we have N series") unless the category page\'s '
      + 'own Facts state that total; write "among the series listed" or use the category page\'s stated total instead.',
    ...bodies.flat(),
  ].join('\n');
}

/** Summaries for every category page among an article's link targets; null when none has members. */
export async function catalogueFactsFor(
  supabase: DbClient,
  websiteId: string,
  categoryUrls: string[],
): Promise<string | null> {
  const urls = [...new Set(categoryUrls.filter(Boolean))].slice(0, MAX_CATEGORIES);
  const summaries: CatalogueSummary[] = [];
  for (const url of urls) {
    const { data, error } = await supabase.rpc('site_catalogue_summary', {
      p_website_id: websiteId,
      p_category_url: url,
    });
    if (error) {
      console.warn(`[site-catalogue] summary unavailable for ${url}: ${error.message}`);
      continue;
    }
    if (data && typeof data === 'object') summaries.push(data as CatalogueSummary);
  }
  return renderCatalogueFacts(summaries, new Date());
}

/** One product page's stated specs as `Label: value` lines; empty when it states none. */
export function productSpecsLines(page: { specs?: unknown }): string[] {
  const specs = page.specs as { attributes?: Record<string, unknown>; price?: { amount?: unknown; currency?: unknown } | null } | null;
  if (!specs || typeof specs !== 'object') return [];
  const lines = Object.entries(specs.attributes ?? {})
    .filter(([, v]) => v != null && String(v).trim())
    .slice(0, MAX_PRODUCT_LINES)
    .map(([k, v]) => `${serpValue(k, 80)}: ${serpValue(v, 300)}`);
  const amount = Number(specs.price?.amount);
  if (Number.isFinite(amount) && amount > 0) {
    lines.push(`Price stated on the page: ${amount} ${serpValue(specs.price?.currency, 8)}`);
  }
  return lines;
}
