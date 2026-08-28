/**
 * The on-page check catalogue.
 *
 * Every audit already stores 52 boolean checks in `website_health_audits.onpage.checks`.
 * The panel showed only the FAILING ones as a list of issues, so a clean audit rendered
 * as an empty box — indistinguishable from an audit that never ran, and it never told
 * anyone what had actually been verified. "Tests seem like not have done anything or
 * reporting what is good and what is bad" is exactly that.
 *
 * So this turns the raw booleans into an INVENTORY: every check, passed or failed, with
 * a plain-language name and what the failure costs.
 *
 * POLARITY IS THE WHOLE PROBLEM. The provider does not return "pass/fail" — it returns a
 * fact, and whether that fact is good depends on the check:
 *
 *     is_https: true            GOOD  — the page is on HTTPS
 *     no_title: true            BAD   — the page has no <title>
 *     high_loading_time: true   BAD   — the page is slow
 *
 * Reading them all one way is how a dashboard congratulates a site for having no title.
 * `goodWhenTrue` is therefore mandatory per check, and an UNKNOWN key is reported as
 * unclassified rather than guessed — a wrong verdict is worse than an honest gap.
 */

export type CheckGroup = 'indexing' | 'content' | 'speed' | 'security' | 'markup' | 'links';

export interface OnPageCheck {
  key: string;
  label: string;
  group: CheckGroup;
  /** True when a `true` value is the DESIRED state. */
  goodWhenTrue: boolean;
  /** What the failing state costs. Shown only when the check fails. */
  cost?: string;
}

export const CHECK_GROUPS: Record<CheckGroup, string> = {
  indexing: 'Indexing & crawlability',
  content: 'Content',
  speed: 'Speed',
  security: 'Security',
  markup: 'Markup & metadata',
  links: 'Links & resources',
};

export const ON_PAGE_CHECKS: OnPageCheck[] = [
  // ── Indexing ──────────────────────────────────────────────────────────────
  { key: 'is_4xx_code', label: 'No 4xx error', group: 'indexing', goodWhenTrue: false, cost: 'The page returns a client error, so it cannot rank and visitors hit a dead end.' },
  { key: 'is_5xx_code', label: 'No 5xx error', group: 'indexing', goodWhenTrue: false, cost: 'The server is failing on this URL. Google backs off crawling a site that does this.' },
  { key: 'is_broken', label: 'Page loads', group: 'indexing', goodWhenTrue: false, cost: 'The page could not be fetched at all.' },
  { key: 'is_redirect', label: 'Not a redirect', group: 'indexing', goodWhenTrue: false, cost: 'This URL redirects, so link equity passes through an extra hop.' },
  { key: 'has_meta_refresh_redirect', label: 'No meta-refresh redirect', group: 'indexing', goodWhenTrue: false, cost: 'Meta-refresh redirects are not reliably followed and pass signal poorly. Use a 301.' },
  { key: 'canonical', label: 'Canonical tag present', group: 'indexing', goodWhenTrue: true, cost: 'Without one, duplicate URLs of this page compete with each other.' },
  { key: 'from_sitemap', label: 'Listed in sitemap', group: 'indexing', goodWhenTrue: true, cost: 'Not in the sitemap, so discovery relies entirely on internal links.' },
  { key: 'seo_friendly_url', label: 'SEO-friendly URL', group: 'indexing', goodWhenTrue: true, cost: 'The URL is hard to read, which costs click-through and shareability.' },
  { key: 'seo_friendly_url_characters_check', label: 'URL characters are clean', group: 'indexing', goodWhenTrue: true },
  { key: 'seo_friendly_url_dynamic_check', label: 'URL is not query-driven', group: 'indexing', goodWhenTrue: true },
  { key: 'seo_friendly_url_keywords_check', label: 'URL carries keywords', group: 'indexing', goodWhenTrue: true },
  { key: 'seo_friendly_url_relative_length_check', label: 'URL length is reasonable', group: 'indexing', goodWhenTrue: true },
  { key: 'is_www', label: 'www / non-www consistent', group: 'indexing', goodWhenTrue: true },

  // ── Content ───────────────────────────────────────────────────────────────
  { key: 'no_title', label: 'Has a title tag', group: 'content', goodWhenTrue: false, cost: 'The title is the single biggest on-page ranking and click-through factor. Without one Google invents its own.' },
  { key: 'title_too_long', label: 'Title length is right', group: 'content', goodWhenTrue: false, cost: 'The title is truncated in results, so the end of your message never gets read.' },
  { key: 'title_too_short', label: 'Title is not too short', group: 'content', goodWhenTrue: false, cost: 'A very short title wastes the most valuable line you get in the results page.' },
  { key: 'no_description', label: 'Has a meta description', group: 'content', goodWhenTrue: false, cost: 'Google writes its own snippet instead, usually less persuasive than one you control.' },
  { key: 'no_h1_tag', label: 'Has an H1 heading', group: 'content', goodWhenTrue: false, cost: 'No H1 leaves the page without a stated subject for either readers or crawlers.' },
  { key: 'has_meta_title', label: 'Meta title present', group: 'content', goodWhenTrue: true },
  { key: 'irrelevant_title', label: 'Title matches the content', group: 'content', goodWhenTrue: false, cost: 'The title promises something the page does not deliver, which reads as a bounce to Google.' },
  { key: 'irrelevant_description', label: 'Description matches the content', group: 'content', goodWhenTrue: false, cost: 'The snippet sets an expectation the page breaks.' },
  { key: 'irrelevant_meta_keywords', label: 'Meta keywords are relevant', group: 'content', goodWhenTrue: false },
  { key: 'low_content_rate', label: 'Enough text vs markup', group: 'content', goodWhenTrue: false, cost: 'Very little readable text for the amount of HTML — thin pages struggle to rank for anything specific.' },
  { key: 'high_content_rate', label: 'Text-to-markup not extreme', group: 'content', goodWhenTrue: false },
  { key: 'low_character_count', label: 'Enough content', group: 'content', goodWhenTrue: false, cost: 'Too little content to answer a query fully.' },
  { key: 'high_character_count', label: 'Content not excessive', group: 'content', goodWhenTrue: false },
  { key: 'low_readability_rate', label: 'Readable', group: 'content', goodWhenTrue: false, cost: 'Dense writing loses the reader before the call to action.' },
  { key: 'lorem_ipsum', label: 'No placeholder text', group: 'content', goodWhenTrue: false, cost: 'Placeholder text is live on the page.' },
  { key: 'no_image_alt', label: 'Images have alt text', group: 'content', goodWhenTrue: false, cost: 'Alt text is how image search and screen readers understand your pictures.' },
  { key: 'no_image_title', label: 'Images have title attributes', group: 'content', goodWhenTrue: false, cost: 'Minor, but a free extra signal about what the image shows.' },
  { key: 'duplicate_title_tag', label: 'Title is unique', group: 'content', goodWhenTrue: false, cost: 'Two pages claiming the same title compete with each other, and Google picks one.' },
  { key: 'duplicate_description', label: 'Description is unique', group: 'content', goodWhenTrue: false },
  { key: 'duplicate_meta_tags', label: 'No duplicate meta tags', group: 'content', goodWhenTrue: false },

  // ── Speed ─────────────────────────────────────────────────────────────────
  { key: 'high_loading_time', label: 'Loads quickly', group: 'speed', goodWhenTrue: false, cost: 'Slow pages lose visitors before they render, and speed is a confirmed ranking factor on mobile.' },
  { key: 'high_waiting_time', label: 'Server responds quickly', group: 'speed', goodWhenTrue: false, cost: 'The server is slow to respond before anything can even start rendering.' },
  { key: 'has_render_blocking_resources', label: 'No render-blocking resources', group: 'speed', goodWhenTrue: false, cost: 'Scripts or stylesheets are holding up the first paint. Defer or inline the critical ones.' },
  { key: 'large_page_size', label: 'Page size is reasonable', group: 'speed', goodWhenTrue: false, cost: 'A heavy page is slow on mobile data, which is where most traffic is.' },
  { key: 'size_greater_than_3mb', label: 'Under 3 MB', group: 'speed', goodWhenTrue: false, cost: 'Over 3 MB. Almost always uncompressed images.' },
  { key: 'small_page_size', label: 'Not suspiciously small', group: 'speed', goodWhenTrue: false, cost: 'So small it may be an error page or a shell that renders entirely in JavaScript.' },
  { key: 'no_content_encoding', label: 'Compression enabled', group: 'speed', goodWhenTrue: false, cost: 'Gzip or Brotli is off, so every visitor downloads several times more bytes than necessary.' },

  // ── Security ──────────────────────────────────────────────────────────────
  { key: 'is_https', label: 'Served over HTTPS', group: 'security', goodWhenTrue: true, cost: 'Browsers mark plain HTTP as “Not secure”, and it is a ranking signal.' },
  { key: 'is_http', label: 'Not plain HTTP', group: 'security', goodWhenTrue: false, cost: 'Served insecurely.' },
  { key: 'https_to_http_links', label: 'No insecure links', group: 'security', goodWhenTrue: false, cost: 'A secure page linking to insecure resources triggers mixed-content warnings.' },

  // ── Markup ────────────────────────────────────────────────────────────────
  { key: 'has_html_doctype', label: 'Has a doctype', group: 'markup', goodWhenTrue: true },
  { key: 'no_doctype', label: 'Doctype declared', group: 'markup', goodWhenTrue: false, cost: 'Without a doctype browsers fall back to quirks mode.' },
  { key: 'has_micromarkup', label: 'Structured data present', group: 'markup', goodWhenTrue: true, cost: 'No schema markup, so no rich results — no stars, prices, FAQs or breadcrumbs in search.' },
  { key: 'has_micromarkup_errors', label: 'Structured data is valid', group: 'markup', goodWhenTrue: false, cost: 'The schema markup has errors, so Google ignores it and you get no rich results anyway.' },
  { key: 'no_favicon', label: 'Has a favicon', group: 'markup', goodWhenTrue: false, cost: 'The favicon appears next to your result on mobile.' },
  { key: 'no_encoding_meta_tag', label: 'Charset declared', group: 'markup', goodWhenTrue: false, cost: 'Without a declared charset, accented and Greek characters can render as mojibake.' },
  { key: 'meta_charset_consistency', label: 'Charset is consistent', group: 'markup', goodWhenTrue: true },
  { key: 'deprecated_html_tags', label: 'No deprecated tags', group: 'markup', goodWhenTrue: false },
  { key: 'flash', label: 'No Flash', group: 'markup', goodWhenTrue: false, cost: 'Flash does not run in any current browser.' },
  { key: 'frame', label: 'No frames', group: 'markup', goodWhenTrue: false, cost: 'Content inside frames is poorly indexed.' },

  // ── Links ─────────────────────────────────────────────────────────────────
  { key: 'broken_links', label: 'No broken links', group: 'links', goodWhenTrue: false, cost: 'Dead links waste crawl budget and strand visitors.' },
  { key: 'broken_resources', label: 'No broken resources', group: 'links', goodWhenTrue: false, cost: 'Images, scripts or styles that fail to load — the page renders wrong for everyone.' },
];

const BY_KEY = new Map(ON_PAGE_CHECKS.map((c) => [c.key, c]));

export interface CheckVerdict {
  check: OnPageCheck;
  /** True = the desired state. */
  passed: boolean;
}

/**
 * Turn the raw boolean map into verdicts.
 *
 * An unrecognised key goes to `unclassified` rather than being assumed good or bad:
 * the provider adds checks over time, and guessing the polarity of one we have never
 * seen is how a dashboard states the opposite of the truth with full confidence.
 */
export function buildCheckInventory(checks: Record<string, unknown> | null | undefined): {
  verdicts: CheckVerdict[];
  unclassified: string[];
  passed: number;
  failed: number;
} {
  const raw = checks ?? {};
  const verdicts: CheckVerdict[] = [];
  const unclassified: string[] = [];

  for (const [key, value] of Object.entries(raw)) {
    const check = BY_KEY.get(key);
    if (!check) { unclassified.push(key); continue; }
    if (typeof value !== 'boolean') { unclassified.push(key); continue; }
    verdicts.push({ check, passed: value === check.goodWhenTrue });
  }

  return {
    verdicts,
    unclassified: unclassified.sort(),
    passed: verdicts.filter((v) => v.passed).length,
    failed: verdicts.filter((v) => !v.passed).length,
  };
}
