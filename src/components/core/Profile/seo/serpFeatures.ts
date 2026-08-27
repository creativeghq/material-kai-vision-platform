/**
 * The SERP feature inventory.
 *
 * A keyword research run records `serpFeatureTypes` — every block type Google
 * actually returned for the query. One stored run here holds
 * `["ai_overview","organic","people_also_ask","popular_products","local_pack",
 * "images","product_considerations","related_searches"]` and the UI rendered
 * none of it: the keyword-research tab showed the keyword, a count and a date.
 *
 * This file turns that raw list into an INVENTORY rather than a list of hits,
 * and that difference is the whole point. Google gives a keyword a fixed set of
 * possible blocks; which ones are ABSENT is as actionable as which are present:
 *
 *   - no featured snippet on an informational query is an opening, not a blank
 *   - an image pack you are not in is a channel you are ignoring
 *   - a local pack on a commercial query means the buyer wants a nearby seller,
 *     and a national page will not win it however good the copy is
 *
 * So every feature below is always rendered, with a present/absent verdict and a
 * line saying what that verdict means for the person reading it — the same rule
 * the metric tiles follow.
 *
 * Keys are DataForSEO's `item.type` values from `/serp/google/organic/live/advanced`.
 */

export type SerpFeatureGroup = 'answer' | 'visual' | 'commercial' | 'social' | 'navigational';

export interface SerpFeatureDescriptor {
  /** DataForSEO block type. */
  key: string;
  label: string;
  group: SerpFeatureGroup;
  /** What the block is, for someone who does not live in a SERP. */
  what: string;
  /** What its PRESENCE means you should do. */
  ifPresent: string;
  /** What its ABSENCE means. Empty when absence carries no signal. */
  ifAbsent?: string;
}

export const SERP_FEATURE_GROUPS: Record<SerpFeatureGroup, string> = {
  answer: 'Answer blocks',
  visual: 'Visual & video',
  commercial: 'Commercial',
  social: 'Social & discussion',
  navigational: 'Navigation & refinement',
};

export const SERP_FEATURES: SerpFeatureDescriptor[] = [
  // ── Answer blocks ────────────────────────────────────────────────────────
  {
    key: 'ai_overview',
    label: 'AI Overview',
    group: 'answer',
    what: 'Google answers the query itself at the top of the page, citing a handful of sources.',
    ifPresent:
      'Ranking #1 no longer guarantees the click. Being one of the cited sources is the goal — that means clear, extractable answers near the top of the page.',
    ifAbsent: 'Google is not answering this itself yet, so a strong organic position still earns the click.',
  },
  {
    key: 'featured_snippet',
    label: 'Featured snippet',
    group: 'answer',
    what: 'One result promoted above the rest with an extracted answer.',
    ifPresent: 'Someone owns position zero. Matching the question format they answered is the way to take it.',
    ifAbsent:
      'No snippet is being shown — an unclaimed one is often the cheapest win on the page. A direct, self-contained answer near the top can create it.',
  },
  {
    key: 'people_also_ask',
    label: 'People Also Ask',
    group: 'answer',
    what: 'The expanding list of related questions Google shows mid-page.',
    ifPresent: 'These are the real follow-up questions. Answering them on the page earns both the block and the depth.',
    ifAbsent: 'Google sees this as a single-intent query rather than the start of a research journey.',
  },
  {
    key: 'knowledge_graph',
    label: 'Knowledge panel',
    group: 'answer',
    what: 'The entity card on the right — a brand, product, place or person Google recognises.',
    ifPresent: 'Google treats the subject as a known entity. Whoever owns that panel owns the query.',
    ifAbsent: 'Google does not recognise a definitive entity here, which leaves the framing open.',
  },
  {
    key: 'product_considerations',
    label: 'Product considerations',
    group: 'answer',
    what: 'Google\'s summary of the attributes buyers weigh for this product.',
    ifPresent:
      'This is Google telling you which specs the buyer cares about. A page that does not address them reads as incomplete.',
  },
  // ── Visual & video ───────────────────────────────────────────────────────
  {
    key: 'images',
    label: 'Image pack',
    group: 'visual',
    what: 'A row of images embedded in the results page.',
    ifPresent:
      'The buyer wants to SEE this. Named, compressed, properly alt-texted product photography on an indexable page is the entry ticket.',
    ifAbsent: 'Google is not treating this as a visual query, so imagery will not win extra placement.',
  },
  {
    key: 'video',
    label: 'Video results',
    group: 'visual',
    what: 'Individual video results in the organic list.',
    ifPresent: 'Video ranks here. A short demonstration can occupy a slot that text cannot reach.',
  },
  {
    key: 'video_carousel',
    label: 'Video carousel',
    group: 'visual',
    what: 'A scrollable strip of videos, usually YouTube.',
    ifPresent:
      'A whole band of the page is video. Without one you are competing for a smaller share of the remaining space.',
  },
  {
    key: 'google_flights',
    label: 'Flights',
    group: 'visual',
    what: 'Google\'s own flight widget.',
    ifPresent: 'A vertical Google serves itself — organic upside is limited.',
  },
  // ── Commercial ───────────────────────────────────────────────────────────
  {
    key: 'shopping',
    label: 'Shopping ads',
    group: 'commercial',
    what: 'Paid product listings with price and merchant.',
    ifPresent:
      'Commercial intent is confirmed and competitors are paying for it. Organic sits below the fold for many searchers.',
    ifAbsent: 'No one is bidding shopping here — organic gets the full commercial attention.',
  },
  {
    key: 'popular_products',
    label: 'Popular products',
    group: 'commercial',
    what: 'An organic product carousel drawn from Merchant Center and structured data.',
    ifPresent:
      'Product markup and a Merchant Center feed can put your items in this strip without paying for the click.',
    ifAbsent: 'Google is not surfacing a product carousel for this query.',
  },
  {
    key: 'paid',
    label: 'Text ads',
    group: 'commercial',
    what: 'Sponsored text results above or below the organic list.',
    ifPresent: 'Competitors are paying for this query, which is usually a signal it converts.',
    ifAbsent: 'No advertiser is bidding — often a cheaper organic target, sometimes a sign of low commercial value.',
  },
  {
    key: 'local_pack',
    label: 'Local pack',
    group: 'commercial',
    what: 'The map with three nearby businesses.',
    ifPresent:
      'The buyer wants someone nearby. A national page cannot win this — it needs a Business Profile and local signals.',
    ifAbsent: 'Not a local-intent query, so proximity is not a ranking factor here.',
  },
  {
    key: 'commercial_units',
    label: 'Commercial units',
    group: 'commercial',
    what: 'Merchant and offer modules Google assembles itself.',
    ifPresent: 'Structured product data is being consumed directly — feed quality shows up on the page.',
  },
  // ── Social & discussion ──────────────────────────────────────────────────
  {
    key: 'discussions_and_forums',
    label: 'Discussions & forums',
    group: 'social',
    what: 'Threads from Reddit, Quora and forums, surfaced as a block.',
    ifPresent:
      'Google judges that people trust peers more than brands on this query. Genuine participation reaches places a landing page cannot.',
  },
  { key: 'twitter', label: 'Posts', group: 'social', what: 'Recent social posts.', ifPresent: 'Freshness matters on this query.' },
  {
    key: 'top_stories',
    label: 'Top stories',
    group: 'social',
    what: 'A news carousel.',
    ifPresent: 'This is a news-sensitive query — coverage and recency outrank evergreen depth.',
  },
  // ── Navigation & refinement ──────────────────────────────────────────────
  {
    key: 'related_searches',
    label: 'Related searches',
    group: 'navigational',
    what: 'The refinement links at the foot of the page.',
    ifPresent: 'Google\'s own map of where this query goes next — a free content plan.',
  },
  {
    key: 'refine_products',
    label: 'Product refinements',
    group: 'navigational',
    what: 'Filter chips for narrowing the product set.',
    ifPresent: 'The buyer is still narrowing down. Category and filter pages can capture the refined query.',
  },
  {
    key: 'find_results_on',
    label: 'Find results on',
    group: 'navigational',
    what: 'Links out to marketplaces and large sites.',
    ifPresent: 'Google is routing searchers to marketplaces. Presence on those platforms may matter more than rank.',
  },
  {
    key: 'organic',
    label: 'Organic results',
    group: 'navigational',
    what: 'The standard blue links.',
    ifPresent: 'The classic ten. Everything else on the page competes with them for attention.',
  },
];

const BY_KEY = new Map(SERP_FEATURES.map((f) => [f.key, f]));

export interface SerpFeatureVerdict {
  descriptor: SerpFeatureDescriptor;
  present: boolean;
}

/**
 * Build the full inventory: every catalogued feature with a present/absent
 * verdict, plus any block type the run saw that this catalogue does not know.
 *
 * The unknown bucket matters — Google ships new block types constantly, and
 * silently dropping one we have no copy for is how a surface stops reflecting
 * reality without anyone noticing.
 */
export function buildSerpInventory(featureTypes: string[] | null | undefined): {
  verdicts: SerpFeatureVerdict[];
  unknown: string[];
} {
  const seen = new Set((featureTypes ?? []).filter(Boolean));
  return {
    verdicts: SERP_FEATURES.map((descriptor) => ({ descriptor, present: seen.has(descriptor.key) })),
    unknown: [...seen].filter((k) => !BY_KEY.has(k)).sort(),
  };
}

export function humanizeFeatureKey(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
