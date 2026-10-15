/** The SERP feature inventory. */

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
  /** What gets a site INTO the block. Only for blocks the tracker can attribute. */
  howToGetIn?: string;
  /** False when the block is not drawn from the organic ranking (map pack, entity card). */
  needsRanking?: boolean;
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
    howToGetIn:
      'Answer the question in the first 2–3 sentences of a page that already ranks, with headings phrased as the question and facts Google can quote verbatim.',
  },
  {
    key: 'featured_snippet',
    label: 'Featured snippet',
    group: 'answer',
    what: 'One result promoted above the rest with an extracted answer.',
    ifPresent: 'Someone owns position zero. Matching the question format they answered is the way to take it.',
    ifAbsent:
      'No snippet is being shown — an unclaimed one is often the cheapest win on the page. A direct, self-contained answer near the top can create it.',
    howToGetIn:
      'A 40–60 word direct answer, a list or a table directly under a heading that repeats the query, on a page in the top 10.',
  },
  {
    key: 'people_also_ask',
    label: 'People Also Ask',
    group: 'answer',
    what: 'The expanding list of related questions Google shows mid-page.',
    ifPresent: 'These are the real follow-up questions. Answering them on the page earns both the block and the depth.',
    ifAbsent: 'Google sees this as a single-intent query rather than the start of a research journey.',
    howToGetIn:
      'Add the listed questions as H2/H3s on the ranking page, each answered in its first sentence.',
  },
  {
    key: 'knowledge_graph',
    label: 'Knowledge panel',
    group: 'answer',
    what: 'The entity card on the right — a brand, product, place or person Google recognises.',
    ifPresent: 'Google treats the subject as a known entity. Whoever owns that panel owns the query.',
    ifAbsent: 'Google does not recognise a definitive entity here, which leaves the framing open.',
    howToGetIn:
      'Built from entity signals: Organization schema, a consistent name/address everywhere, and profiles Google trusts (Wikidata, business registries, social).',
    needsRanking: false,
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
    howToGetIn:
      'Original photos on the ranking page with descriptive file names, alt text and ImageObject/Product schema.',
  },
  {
    key: 'video',
    label: 'Video results',
    group: 'visual',
    what: 'Individual video results in the organic list.',
    ifPresent: 'Video ranks here. A short demonstration can occupy a slot that text cannot reach.',
    howToGetIn:
      'A short video on YouTube (or embedded with VideoObject schema) whose title matches the query.',
  },
  {
    key: 'video_carousel',
    label: 'Video carousel',
    group: 'visual',
    what: 'A scrollable strip of videos, usually YouTube.',
    ifPresent:
      'A whole band of the page is video. Without one you are competing for a smaller share of the remaining space.',
    howToGetIn:
      'A short video on YouTube (or embedded with VideoObject schema) whose title matches the query.',
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
    howToGetIn:
      'Paid only — needs a Merchant Center feed and a Shopping campaign.',
    needsRanking: false,
  },
  {
    key: 'popular_products',
    label: 'Popular products',
    group: 'commercial',
    what: 'An organic product carousel drawn from Merchant Center and structured data.',
    ifPresent:
      'Product markup and a Merchant Center feed can put your items in this strip without paying for the click.',
    ifAbsent: 'Google is not surfacing a product carousel for this query.',
    howToGetIn:
      'Product schema with price and availability, plus a Google Merchant Center feed.',
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
    howToGetIn:
      'Comes from the Google Business Profile, not the website ranking: a verified profile with the right category, address in the target city, photos and reviews.',
    needsRanking: false,
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
    howToGetIn:
      'Needs news-style articles: fresh, dated, Article schema, and a site Google treats as a news source.',
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
    key: 'people_also_search',
    label: 'People also search for',
    group: 'navigational',
    what: 'Alternative searches Google offers after someone returns from a result.',
    ifPresent: 'Searchers bounce back and try a variant — the variants are queries worth a page of their own.',
  },
  {
    key: 'google_reviews',
    label: 'Google reviews',
    group: 'social',
    what: 'Star ratings and review snippets pulled from Google Business Profiles.',
    ifPresent: 'Reputation is on the results page itself — the review count and rating are part of the first impression.',
  },
  {
    key: 'short_videos',
    label: 'Short videos',
    group: 'visual',
    what: 'A strip of vertical short-form videos (Shorts, TikTok, Reels).',
    ifPresent: 'Short-form video earns a slot here that a page cannot.',
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

export function serpFeatureDescriptor(key: string): SerpFeatureDescriptor | undefined {
  return BY_KEY.get(key);
}

export function serpFeatureLabel(key: string): string {
  return BY_KEY.get(key)?.label ?? humanizeFeatureKey(key);
}

/** Share of the ANSWERED checks on one capture day; null when none answered — unknown, not 0%. */
export function captureShare(p: { answered: number; present: number; owned: number }): {
  present: number | null;
  owned: number | null;
} {
  if (!p.answered) return { present: null, owned: null };
  return { present: p.present / p.answered, owned: p.owned / p.answered };
}
