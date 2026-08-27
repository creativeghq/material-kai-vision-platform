/**
 * SEOGenericCard — one renderer for every Wave 1B–3 chunk type.
 *
 * Strategy: each tool emits a chunk with `{ type, ...payload }`. Rather
 * than building 20+ separate React components, this single card detects
 * the chunk shape and picks the right inline mini-renderer. Saves ~2k LoC
 * vs one-card-per-tool and keeps AgentHub.tsx tidy.
 *
 * Surfaces render on THEME tokens (bg-card / text-foreground / muted / border)
 * so the same card is legible in the light canvas, the dark canvas AND the dark
 * chat bubble — never a hardcoded white-on-dark wash. Each section carries a
 * one-line plain-language primer so a non-technical reader knows what the raw
 * DataForSEO numbers mean and what to do with them; empty/absent values are
 * spelled out as words (and, where relevant, framed as an opportunity) instead
 * of bare "none"/null/raw field keys.
 *
 * Card kinds it handles (in order of declaration):
 *   - seo_keyword_difficulty_card / seo_keywords_card / seo_intent_card
 *   - seo_serp_audit_card
 *   - seo_url_audit_card
 *   - seo_domain_snapshot_card / seo_ranked_keywords_card / seo_domain_competitors_card
 *   - seo_keyword_gap_card / seo_traffic_estimation_card
 *   - seo_backlinks_summary_card / seo_backlinks_anchors_card / seo_referring_domains_card
 *   - seo_site_crawl_started_card / seo_site_crawl_status_card
 *   - seo_sentiment_card / seo_domain_tech_card
 *   - seo_llm_mentions_card
 *   - seo_youtube_card / seo_local_pack_card / seo_trends_card
 *   - seo_site_review_card / seo_brand_audit_card
 *   - seo_gsc_striking_distance_card / seo_gsc_movers_card
 *   - seo_onpage_issues_card
 *   - seo_backlinks_timeseries_card / seo_backlinks_competitors_card
 *   - seo_historical_rank_card / seo_keywords_for_site_card
 *   - seo_keyword_ideas_card / seo_related_keywords_card / seo_search_volume_card
 *   - seo_domain_intersection_card
 *   - seo_ai_overview_card / seo_google_maps_card / seo_gbp_info_card
 *   - seo_dataforseo_raw_card (escape-hatch fallback)
 *
 * Every `seo_*_card` chunk AgentHub emits must have a branch here. There is no
 * second dispatch table: AGENT_RESULT_TITLES is never consulted for these types,
 * because the `seo_*_card` branch in AgentHub catches them first. A missing
 * branch is therefore not a missing title — it is a raw JSON dump in the user's
 * chat. Guarded by tests/unit/seoCardCoverage.test.ts.
 */

import type { ReactNode } from 'react';

export interface SEOGenericCardData {
  type: string;
  [key: string]: any;
}

const fmtNum = (n: any): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
};

const fmtPct = (n: any): string => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v <= 1 && v >= 0) return `${Math.round(v * 100)}%`;
  return `${Math.round(v)}%`;
};

const GOOD = 'text-emerald-600 dark:text-emerald-400';
const WARN = 'text-amber-600 dark:text-amber-400';
const BAD = 'text-red-600 dark:text-red-400';

/** Opaque theme panel — legible on the cream light canvas AND the plum-black dark canvas. */
function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-card text-card-foreground rounded-xl p-4 border border-border space-y-2 ${className}`}>
      {children}
    </div>
  );
}

/** One-line "what is this / why it matters" explainer above a section. */
function Primer({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted-foreground leading-snug">{children}</p>;
}

function Empty({ children }: { children: ReactNode }) {
  return <div className="text-sm text-muted-foreground py-3 text-center">{children}</div>;
}

function Header({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base">{icon}</span>
      <div>
        <div className="text-sm font-medium text-foreground">{title}</div>
        {subtitle && <div className="text-[11px] text-muted-foreground">{subtitle}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value ?? '—'}</div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' }) {
  const cls = tone === 'green' ? `bg-emerald-500/10 border border-emerald-500/20 ${GOOD}`
    : tone === 'amber' ? `bg-amber-500/10 border border-amber-500/20 ${WARN}`
    : tone === 'red' ? `bg-red-500/10 border border-red-500/20 ${BAD}`
    : tone === 'blue' ? 'bg-primary/10 border border-primary/20 text-primary'
    : 'bg-muted border border-border text-muted-foreground';
  // `rounded-sm`, not `rounded-full`: a chip is not a status pip. The design
  // system reserves the pill silhouette for avatars, dots and pips.
  return <span className={`text-[11px] rounded-sm px-2 py-0.5 ${cls}`}>{children}</span>;
}

function ItemList({ rows, max = 8 }: { rows: Array<{ left: string; right?: string; sub?: string; href?: string }>; max?: number }) {
  return (
    <ul className="space-y-1">
      {rows.slice(0, max).map((r, i) => (
        <li key={i} className="text-xs bg-muted/40 rounded px-2 py-1 border border-border">
          <div className="flex justify-between items-baseline gap-2">
            {r.href ? (
              <a href={r.href} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex-1 text-primary">{r.left}</a>
            ) : (
              <span className="truncate flex-1 text-foreground">{r.left}</span>
            )}
            {r.right && <span className="text-muted-foreground whitespace-nowrap">{r.right}</span>}
          </div>
          {r.sub && <div className="text-[10px] text-muted-foreground truncate">{r.sub}</div>}
        </li>
      ))}
      {rows.length > max && (
        <li className="text-[10px] text-muted-foreground px-2">+ {rows.length - max} more</li>
      )}
    </ul>
  );
}

/**
 * Human-readable labels for DataForSEO OnPage `checks` booleans/counts.
 * Default polarity: the check is an ISSUE when true (URL audit) / non-zero (crawl).
 * `issueWhenFalse` flags the good-thing booleans that are a problem when OFF.
 */
const CHECK_META: Record<string, { label: string; issueWhenFalse?: boolean }> = {
  no_title: { label: 'Missing title tag' },
  no_description: { label: 'Missing meta description' },
  no_h1: { label: 'No H1 heading' },
  no_image_alt: { label: 'Images missing alt text' },
  no_image_title: { label: 'Images missing title attribute' },
  no_favicon: { label: 'No favicon' },
  no_content_encoding: { label: 'No gzip/brotli compression' },
  no_doctype: { label: 'Missing doctype' },
  no_encoding_meta_tag: { label: 'No charset meta tag' },
  high_loading_time: { label: 'Slow page load' },
  high_waiting_time: { label: 'Slow server response' },
  is_redirect: { label: 'Page is a redirect' },
  is_4xx_code: { label: 'Returns a 4xx error' },
  is_5xx_code: { label: 'Returns a 5xx error' },
  is_broken: { label: 'Broken page' },
  is_https: { label: 'Not served over HTTPS', issueWhenFalse: true },
  is_http: { label: 'Served over plain HTTP' },
  canonical: { label: 'No canonical tag', issueWhenFalse: true },
  seo_friendly_url: { label: 'URL is not SEO-friendly', issueWhenFalse: true },
  has_render_blocking_resources: { label: 'Render-blocking resources' },
  has_meta_refresh_redirect: { label: 'Uses meta-refresh redirect' },
  redirect_chain: { label: 'Part of a redirect chain' },
  canonical_chain: { label: 'Canonical chain' },
  duplicate_title_tag: { label: 'Duplicate title tag' },
  duplicate_meta_tags: { label: 'Duplicate meta tags' },
  duplicate_description: { label: 'Duplicate meta description' },
  duplicate_content: { label: 'Duplicate content' },
  title_too_long: { label: 'Title too long' },
  title_too_short: { label: 'Title too short' },
  low_content_rate: { label: 'Low text-to-HTML ratio' },
  high_content_rate: { label: 'Unusually high text-to-HTML ratio' },
  small_page_size: { label: 'Very small page' },
  large_page_size: { label: 'Very large page size' },
  low_readability_rate: { label: 'Poor readability' },
  irrelevant_description: { label: 'Description not relevant to content' },
  irrelevant_title: { label: 'Title not relevant to content' },
  irrelevant_meta_keywords: { label: 'Irrelevant meta keywords' },
  deprecated_html_tags: { label: 'Uses deprecated HTML tags' },
  flash: { label: 'Uses Flash' },
  frame: { label: 'Uses frames' },
  lorem_ipsum: { label: 'Placeholder (lorem ipsum) text' },
  has_misspelling: { label: 'Spelling errors' },
  broken_links: { label: 'Broken links' },
  broken_resources: { label: 'Broken resources' },
  links_external: { label: 'External links' },
  no_image_alt_text: { label: 'Images missing alt text' },
  duplicate_title: { label: 'Duplicate titles' },
  no_meta_description: { label: 'Missing meta descriptions' },
  no_content: { label: 'Pages with no content' },
  low_character_count: { label: 'Very thin content' },
  high_character_count: { label: 'Overly long pages' },
  small_page_size_pages: { label: 'Very small pages' },
  non_indexable: { label: 'Non-indexable pages' },
};

const humanizeCheckKey = (k: string): string => {
  const meta = CHECK_META[k];
  if (meta) return meta.label;
  const s = k.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Top-N positive-count entries of a `{key: count}` object, sorted desc. */
const topEntries = (obj: any, n: number): Array<[string, number]> => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj)
    .map(([k, v]) => [k, Number(v)] as [string, number])
    .filter(([, v]) => Number.isFinite(v) && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n);
};

/** cpc · competition · keyword-difficulty sub-line for a DataForSEO keyword item. */
const kwSubline = (kwData: any): string | undefined => {
  const info = kwData?.keyword_info || {};
  const kd = kwData?.keyword_properties?.keyword_difficulty;
  const parts: string[] = [];
  if (info.cpc != null && Number(info.cpc) > 0) parts.push(`$${Number(info.cpc).toFixed(2)} CPC`);
  if (info.competition != null && Number.isFinite(Number(info.competition))) parts.push(`${fmtPct(info.competition)} comp`);
  if (kd != null) parts.push(`KD ${kd}`);
  return parts.length ? parts.join(' · ') : undefined;
};

/** Accordion of FAILED on-page checks (booleans). Renders nothing when all pass. */
function FailedChecksAccordion({ checks, label = 'On-page issues' }: { checks: any; label?: string }) {
  if (!checks || typeof checks !== 'object') return null;
  const failed = Object.entries(checks).filter(([k, v]) => {
    const meta = CHECK_META[k];
    return meta?.issueWhenFalse ? v === false : v === true;
  });
  if (failed.length === 0) return null;
  return (
    <details className="group rounded-lg border border-border bg-muted/40">
      <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
        <span className="font-medium">{label} ({failed.length})</span>
        <span className="text-xs text-muted-foreground">tap to expand</span>
      </summary>
      <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
        <ul className="space-y-1">
          {failed.map(([k]) => (
            <li key={k} className="flex items-start gap-1.5 text-foreground">
              <span className={BAD}>•</span>
              <span>{humanizeCheckKey(k)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

/** Accordion of non-zero site-wide issue COUNTS (crawl summary). Renders nothing when all zero. */
function IssueCountsAccordion({ checks, label = 'Site-wide issues' }: { checks: any; label?: string }) {
  const rows = topEntries(checks, 40);
  if (rows.length === 0) return null;
  return (
    <details className="group rounded-lg border border-border bg-muted/40">
      <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
        <span className="font-medium">{label} ({rows.length})</span>
        <span className="text-xs text-muted-foreground">tap to expand</span>
      </summary>
      <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
        <ul className="space-y-1">
          {rows.map(([k, v]) => (
            <li key={k} className="flex justify-between items-baseline gap-2 text-foreground">
              <span className="truncate">{humanizeCheckKey(k)}</span>
              <span className={`${WARN} whitespace-nowrap`}>{fmtNum(v)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function SEOGenericCard({ data }: { data: SEOGenericCardData }) {
  const t = data.type;

  // ── Keyword cards ─────────────────────────────────────
  if (t === 'seo_keyword_difficulty_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📊" title="Keyword Difficulty" subtitle={`${items.length} of ${data.keywords_requested} keywords scored · ${data.country}`} />
        <Primer>Difficulty is a 0–100 score for how hard it is to rank on page 1 — lower is easier. Start with the low scorers for the fastest wins.</Primer>
        {items.length === 0 ? <Empty>No difficulty scores came back for these keywords.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.keyword,
            right: it.keyword_difficulty != null ? `${it.keyword_difficulty}/100` : 'not scored',
          }))} max={12} />
        )}
      </Card>
    );
  }

  if (t === 'seo_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🔎" title={`Keyword Suggestions for "${data.seed}"`} subtitle={`${items.length} results · ${data.country}`} />
        <Primer>Related search terms people actually type, with their monthly search volume. Higher volume = more potential traffic if you rank.</Primer>
        {items.length === 0 ? <Empty>No related keywords found for this seed term.</Empty> : (
          <ItemList rows={items.map((it: any) => {
            const kw = it.keyword_data?.keyword || it.keyword;
            const vol = it.keyword_data?.keyword_info?.search_volume ?? it.search_volume;
            return { left: kw, right: vol != null ? `${fmtNum(vol)} /mo` : 'no volume data', sub: kwSubline(it.keyword_data) };
          })} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_intent_card') {
    const items: any[] = data.items || [];
    const tone = (intent: string) => {
      const i = (intent || '').toLowerCase();
      if (i === 'transactional') return 'green';
      if (i === 'commercial') return 'blue';
      if (i === 'navigational') return 'amber';
      return undefined;
    };
    return (
      <Card>
        <Header icon="🎯" title="Search Intent Classification" subtitle={`${items.length} keywords classified`} />
        <Primer>What a searcher wants: <span className="font-medium">transactional</span> = ready to buy, <span className="font-medium">commercial</span> = comparing options, <span className="font-medium">informational</span> = researching, <span className="font-medium">navigational</span> = looking for a specific site. Match your page type to the intent.</Primer>
        {items.length === 0 ? <Empty>No intent classifications returned.</Empty> : (
          <ul className="space-y-1">
            {items.slice(0, 12).map((it: any, i: number) => {
              const intent = it.keyword_intent?.label || it.keyword_intent_info?.main_intent || 'unclassified';
              return (
                <li key={i} className="flex justify-between items-baseline gap-2 text-xs bg-muted/40 rounded px-2 py-1 border border-border">
                  <span className="truncate flex-1 text-foreground">{it.keyword}</span>
                  <Pill tone={tone(intent) as any}>{intent}</Pill>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    );
  }

  // ── SERP audit ────────────────────────────────────────
  if (t === 'seo_serp_audit_card') {
    const types = data.types_summary || {};
    const entries = Object.entries(types);
    return (
      <Card>
        <Header icon="🔬" title={`Live SERP — "${data.keyword}"`} subtitle={`${data.country} · ${(data.items || []).length} blocks`} />
        <Primer>A live snapshot of the Google results page: each chip is a result block Google shows (ads, videos, snippets, organic links) and how many of each. It tells you what kind of content wins this query.</Primer>
        {entries.length === 0 ? <Empty>No SERP feature blocks were detected.</Empty> : (
          <div className="flex flex-wrap gap-1">
            {entries.map(([k, v]: any) => (
              <Pill key={k}>{k.replace(/_/g, ' ')} · {v}</Pill>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // ── URL audit ─────────────────────────────────────────
  if (t === 'seo_url_audit_card') {
    const lh = data.sections?.lighthouse?.items?.[0];
    const cats = lh?.categories || {};
    const ip = data.sections?.instant_page?.items?.[0];
    return (
      <Card className="space-y-3">
        <Header icon="🌡" title="URL Audit" subtitle={data.url} />
        <Primer>Google Lighthouse health scores (0–100). Green ≥ 90 is good, amber 70–89 needs work, red &lt; 70 is a problem to fix. These feed directly into rankings and user experience.</Primer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['performance', 'accessibility', 'best-practices', 'seo'].map((k) => {
            const score = Math.round((cats[k]?.score ?? 0) * 100);
            const tone: any = score >= 90 ? 'green' : score >= 70 ? 'amber' : 'red';
            return (
              <div key={k} className="bg-muted/40 rounded p-2 border border-border">
                <div className="text-[10px] text-muted-foreground capitalize">{k.replace('-', ' ')}</div>
                <div className="text-2xl font-medium leading-tight">
                  <Pill tone={cats[k]?.score != null ? tone : undefined}>{cats[k]?.score != null ? score : 'n/a'}</Pill>
                </div>
              </div>
            );
          })}
        </div>
        {ip?.meta && (
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>Page title: {ip.meta.title || '(no title tag — add one)'}</div>
            <div>On-page score: {fmtNum(ip.page_metrics?.onpage_score?.value)}</div>
          </div>
        )}
        {ip?.meta && (ip.meta.internal_links_count != null || ip.meta.external_links_count != null || ip.meta.images_count != null) && (
          <div className="grid grid-cols-3 gap-2">
            {ip.meta.internal_links_count != null && <Stat label="Internal links" value={fmtNum(ip.meta.internal_links_count)} />}
            {ip.meta.external_links_count != null && <Stat label="External links" value={fmtNum(ip.meta.external_links_count)} />}
            {ip.meta.images_count != null && <Stat label="Images" value={fmtNum(ip.meta.images_count)} />}
          </div>
        )}
        <FailedChecksAccordion checks={ip?.page_metrics?.checks ?? ip?.checks} label="On-page issues" />
      </Card>
    );
  }

  // ── Domain snapshot ───────────────────────────────────
  if (t === 'seo_domain_snapshot_card') {
    const it: any = (data.items || [])[0] || {};
    const m = it.metrics?.organic || {};
    return (
      <Card>
        <Header icon="🌐" title={`Domain Snapshot — ${data.domain}`} subtitle={data.country || ''} />
        <Primer>A one-glance health check of this domain's organic footprint: how many keywords it ranks for, the traffic that earns, its authority rank and its backlink count.</Primer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Ranking keywords" value={fmtNum(m.count)} />
          <Stat label="Est. traffic /mo" value={fmtNum(m.etv)} />
          <Stat label="Domain rank" value={it.metrics_info?.rank ?? '—'} />
          <Stat label="Backlinks" value={fmtNum(it.backlinks_info?.backlinks)} />
        </div>
      </Card>
    );
  }

  if (t === 'seo_ranked_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📈" title={`Top Ranking Keywords — ${data.domain}`} subtitle={`${items.length} keywords`} />
        <Primer>The terms this domain already ranks for, with its Google position (#) and each term's monthly volume. Positions 4–15 are the quickest to push onto page 1.</Primer>
        {items.length === 0 ? <Empty>This domain isn't ranking for any tracked keywords yet.</Empty> : (
          <ItemList rows={items.map((it: any) => {
            const serp = it.ranked_serp_element?.serp_item || {};
            const rank = serp.rank_absolute;
            const vol = it.keyword_data?.keyword_info?.search_volume;
            const etv = serp.etv;
            return {
              left: `#${rank ?? '?'} · ${it.keyword_data?.keyword}`,
              right: vol ? `${fmtNum(vol)} /mo` : 'no volume data',
              sub: etv != null ? `~${fmtNum(etv)} est. visits/mo${serp.url ? ' · ' + serp.url : ''}` : (serp.url || undefined),
              href: serp.url || undefined,
            };
          })} max={12} />
        )}
      </Card>
    );
  }

  if (t === 'seo_domain_competitors_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="⚔️" title={`Competitors — ${data.domain}`} subtitle={`${items.length} domains`} />
        <Primer>Sites that rank for the same keywords as you — "shared kw" is how many terms you overlap on. These are the pages to study and out-write.</Primer>
        {items.length === 0 ? <Empty>No overlapping competitors found.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.domain,
            right: `${fmtNum(it.intersections)} shared kw`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_keyword_gap_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🎯" title={'Keyword Gap'} subtitle={`${data.your_domain} vs ${data.competitor_domain} · ${items.length} gaps`} />
        <Primer>Keywords the competitor ranks for but you don't — your ready-made content backlog. "comp #" is their position; grab the high-volume ones first.</Primer>
        {items.length === 0 ? <Empty>No gaps — you already cover what this competitor ranks for.</Empty> : (
          <ItemList rows={items.map((it: any) => {
            const rank = it.second_domain_serp_element?.rank_absolute;
            const vol = it.keyword_data?.keyword_info?.search_volume;
            return {
              left: it.keyword_data?.keyword,
              right: `comp #${rank ?? '?'} · ${vol ? fmtNum(vol) + '/mo' : 'no vol'}`,
              sub: kwSubline(it.keyword_data),
            };
          })} max={12} />
        )}
      </Card>
    );
  }

  if (t === 'seo_traffic_estimation_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🚦" title="Traffic Estimation" subtitle={`${items.length} domains · ${data.country || ''}`} />
        <Primer>Estimated organic visitors per month each domain earns from its current rankings — a proxy for how much SEO traffic is at stake.</Primer>
        {items.length === 0 ? <Empty>No traffic estimates returned.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.target,
            right: `${fmtNum(it.metrics?.organic?.etv)} organic / mo`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  // ── Backlinks ─────────────────────────────────────────
  if (t === 'seo_backlinks_summary_card') {
    const s = data.summary || {};
    const spam = Number(s.spam_score);
    return (
      <Card>
        <Header icon="🔗" title={`Backlinks — ${data.target}`} />
        <Primer>Links from other sites are a top ranking signal. More referring domains beats more raw backlinks. Spam score (0–100) flags toxic links — high is a risk worth cleaning up.</Primer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Backlinks" value={fmtNum(s.backlinks)} />
          <Stat label="Referring domains" value={fmtNum(s.referring_domains)} />
          <Stat label="Domain rank" value={s.rank ?? '—'} />
          <Stat label="Spam score" value={s.spam_score != null ? (
            <span className={Number.isFinite(spam) ? (spam >= 30 ? BAD : spam >= 15 ? WARN : GOOD) : ''}>{s.spam_score}</span>
          ) : '—'} />
        </div>
        {(s.referring_main_domains != null || s.referring_pages != null) && (
          <div className="grid grid-cols-2 gap-2">
            {s.referring_main_domains != null && <Stat label="Referring root domains" value={fmtNum(s.referring_main_domains)} />}
            {s.referring_pages != null && <Stat label="Referring pages" value={fmtNum(s.referring_pages)} />}
          </div>
        )}
        {(() => {
          const nofollow = s.referring_links_attributes?.nofollow ?? s.referring_links_types?.nofollow;
          const dofollow = (s.backlinks != null && nofollow != null) ? Number(s.backlinks) - Number(nofollow) : undefined;
          const tlds = topEntries(s.referring_links_tld, 5);
          const platforms = topEntries(s.referring_links_platform_types, 5);
          const hasFollow = dofollow != null || nofollow != null;
          if (!hasFollow && tlds.length === 0 && platforms.length === 0) return null;
          return (
            <details className="group rounded-lg border border-border bg-muted/40">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Link profile</span>
                <span className="text-xs text-muted-foreground">where your links come from</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 text-xs">
                {hasFollow && (
                  <div className="grid grid-cols-2 gap-2">
                    {dofollow != null && <Stat label={<span className={GOOD}>Dofollow</span>} value={fmtNum(dofollow)} />}
                    {nofollow != null && <Stat label="Nofollow" value={fmtNum(nofollow)} />}
                  </div>
                )}
                {tlds.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Top TLDs</div>
                    <ul className="space-y-0.5">
                      {tlds.map(([k, v]) => (
                        <li key={k} className="flex justify-between gap-2 text-foreground"><span>.{k}</span><span className="text-muted-foreground">{fmtNum(v)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
                {platforms.length > 0 && (
                  <div>
                    <div className="text-[10px] text-muted-foreground mb-0.5">Top platform types</div>
                    <ul className="space-y-0.5">
                      {platforms.map(([k, v]) => (
                        <li key={k} className="flex justify-between gap-2 text-foreground"><span className="capitalize">{k.replace(/_/g, ' ')}</span><span className="text-muted-foreground">{fmtNum(v)}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </details>
          );
        })()}
      </Card>
    );
  }

  if (t === 'seo_backlinks_anchors_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="⚓" title={`Top Anchor Texts — ${data.target}`} />
        <Primer>The clickable words other sites use to link to you. A healthy profile is mostly your brand and topic terms; lots of exact-match commercial anchors can look manipulative to Google.</Primer>
        {items.length === 0 ? <Empty>No anchor-text data available.</Empty> : (
          <ItemList rows={items.map((a: any) => ({
            left: a.anchor || '(bare URL — no anchor text)',
            right: `${fmtNum(a.backlinks)} links`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_referring_domains_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🌍" title={`Referring Domains — ${data.target}`} subtitle={`${items.length} domains`} />
        <Primer>The distinct sites that link to you, with each one's authority rank. Links from higher-rank domains pass more value.</Primer>
        {items.length === 0 ? <Empty>No referring domains found.</Empty> : (
          <ItemList rows={items.map((d: any) => ({
            left: d.domain,
            right: `rank ${d.rank ?? '—'} · ${fmtNum(d.backlinks)} links`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  // ── Site crawl ────────────────────────────────────────
  if (t === 'seo_site_crawl_started_card') {
    return (
      <Card>
        <Header icon="🕷" title={`Site Crawl Started — ${data.target}`} subtitle={`up to ${data.max_pages} pages · task ${(data.task_id || '').slice(0, 16)}`} />
        <Primer>A full-site technical scan is running in the background. It checks every page for broken links, duplicate titles and crawl errors — this can take a few minutes.</Primer>
        <div className="text-[11px] text-muted-foreground">Next step: ask for the crawl status with this task ID to see the results once it finishes.</div>
      </Card>
    );
  }

  if (t === 'seo_site_crawl_status_card') {
    const s = data.summary || {};
    const ready = data.status === 'finished';
    return (
      <Card>
        <Header icon={ready ? '✅' : '⏳'} title={ready ? 'Crawl finished' : `Crawl ${data.status}`} subtitle={`task ${(data.task_id || '').slice(0, 16)}`} />
        <Primer>{ready
          ? 'Site-wide technical health. Broken links and duplicate titles hurt rankings — treat any non-zero count here as a fix list.'
          : 'The crawl is still running. Check back in a moment for the full technical breakdown.'}</Primer>
        {ready && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <Stat label="Pages crawled" value={fmtNum(s.crawl_progress?.pages_crawled)} />
              <Stat label="Internal links" value={fmtNum(s.page_metrics?.links_internal)} />
              <Stat label="Broken links" value={<span className={Number(s.page_metrics?.broken_links) > 0 ? WARN : GOOD}>{fmtNum(s.page_metrics?.broken_links)}</span>} />
              <Stat label="Duplicate titles" value={<span className={Number(s.page_metrics?.duplicate_title) > 0 ? WARN : GOOD}>{fmtNum(s.page_metrics?.duplicate_title)}</span>} />
            </div>
            {s.page_metrics?.onpage_score != null && (
              <div className="grid grid-cols-2 gap-2">
                <Stat label="On-page score" value={fmtNum(s.page_metrics.onpage_score)} />
              </div>
            )}
            <IssueCountsAccordion checks={s.page_metrics?.checks} label="Site-wide issues" />
          </>
        )}
      </Card>
    );
  }

  // ── Content / domain analytics ────────────────────────
  if (t === 'seo_sentiment_card') {
    const d = data.distribution || {};
    const neg = Number(d.negative);
    return (
      <Card>
        <Header icon="❤️" title={`Sentiment — "${data.keyword}"`} />
        <Primer>How positive or negative the conversation around this term is. A high negative share is a reputation signal worth acting on.</Primer>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={<span className={GOOD}>Positive</span>} value={fmtPct(d.positive)} />
          <Stat label="Neutral" value={fmtPct(d.neutral)} />
          <Stat label={<span className={BAD}>Negative</span>} value={fmtPct(d.negative)} />
        </div>
        {Number.isFinite(neg) && (neg > 0.4 || neg > 40) && (
          <Primer>Negative sentiment is elevated — consider addressing the complaints driving it before investing in more visibility.</Primer>
        )}
      </Card>
    );
  }

  if (t === 'seo_domain_tech_card') {
    const tech: Record<string, any> = data.technologies || {};
    const keys = Object.keys(tech);
    return (
      <Card>
        <Header icon="🛠" title={`Tech Stack — ${data.domain}`} />
        <Primer>The frameworks, analytics and platforms detected on this site — useful for understanding a competitor's setup or spotting integration opportunities.</Primer>
        {keys.length === 0 ? <Empty>No technologies could be detected.</Empty> : (
          <div className="space-y-1">
            {keys.map((cat) => {
              const raw = tech[cat];
              const names: string[] = Array.isArray(raw)
                ? raw.map((n: any) => String(n))
                : raw && typeof raw === 'object'
                  ? (Object.values(raw) as any[]).flat().map((n: any) => String(n))
                  : [];
              return (
                <details key={cat} className="group rounded-lg border border-border bg-muted/40">
                  <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                    <span className="font-medium capitalize">{cat.replace(/_/g, ' ')}</span>
                    <span className="text-xs text-muted-foreground">{names.length}</span>
                  </summary>
                  <div className="px-2.5 pb-2.5 pt-0.5 flex flex-wrap gap-1 text-xs">
                    {names.length === 0
                      ? <span className="text-muted-foreground">No named technologies in this category.</span>
                      : names.map((n, i) => <Pill key={i}>{n}</Pill>)}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </Card>
    );
  }

  // ── Multi-engine SERP ─────────────────────────────────
  if (t === 'seo_youtube_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="▶️" title={`YouTube — "${data.keyword}"`} subtitle={`${items.length} videos`} />
        <Primer>Videos ranking for this term. If a video pack shows here, publishing your own video is a way to grab space competitors' text pages can't.</Primer>
        {items.length === 0 ? <Empty>No videos rank for this keyword — a gap you could fill.</Empty> : (
          <ItemList rows={items.map((v: any) => ({
            left: v.title,
            right: `${fmtNum(v.views)} views`,
            href: v.url,
          }))} max={8} />
        )}
      </Card>
    );
  }

  if (t === 'seo_local_pack_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📍" title={`Local Pack — "${data.keyword}"`} subtitle={`${items.length} places`} />
        <Primer>The map "3-pack" of local businesses Google shows for this term. Ratings and review counts drive who gets picked — a strong Google Business Profile is the lever here.</Primer>
        {items.length === 0 ? <Empty>No local pack appears for this query.</Empty> : (
          <ItemList rows={items.map((p: any) => ({
            left: p.title,
            right: p.rating?.value ? `★${p.rating.value} (${p.rating.votes_count || 0})` : 'no reviews yet',
            sub: p.address,
          }))} max={6} />
        )}
      </Card>
    );
  }

  if (t === 'seo_trends_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📉" title={'Google Trends'} subtitle={(data.keywords || []).join(', ')} />
        <Primer>Search interest over time for these terms — use it to spot rising topics to publish early on, or seasonality to time your content.</Primer>
        <div className="text-[11px] text-muted-foreground">{items.length} time-series data points returned. Open the conversation for the full trend curve.</div>
      </Card>
    );
  }

  // ── LLM mentions ──────────────────────────────────────
  if (t === 'seo_llm_mentions_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🤖" title={`LLM Mentions — "${data.keyword}"`} subtitle={`${items.length} pages cited by LLMs`} />
        <Primer>Pages that AI assistants (ChatGPT, Perplexity, Google AI) tend to cite for this topic. Earning a spot here is the new front page — being cited puts you in the AI answer.</Primer>
        {items.length === 0 ? <Empty>No pages are being cited by LLMs yet — an early-mover opportunity.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.title || it.url,
            right: it.domain,
            href: it.url,
          }))} max={8} />
        )}
      </Card>
    );
  }

  // ── Site review (composite) ───────────────────────────
  if (t === 'seo_site_review_card') {
    const sec = data.sections || {};
    const dr = sec.domain_rank_overview?.items?.[0]?.metrics?.organic || {};
    const rk = sec.ranked_keywords?.items || [];
    const cp = sec.competitors?.items || [];
    const bs = sec.backlinks_summary?.items?.[0] || {};
    return (
      <Card className="space-y-3">
        <Header icon="🔍" title={`Site Review — ${data.domain}`} subtitle={data.country || ''} />
        <Primer>A combined health report: organic footprint, backlink strength, best keywords and closest competitors — the top-line view of where this site stands.</Primer>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Ranking keywords" value={fmtNum(dr.count)} />
          <Stat label="Est. traffic /mo" value={fmtNum(dr.etv)} />
          <Stat label="Referring domains" value={fmtNum(bs.referring_domains)} />
          <Stat label="Backlinks" value={fmtNum(bs.backlinks)} />
        </div>
        {rk.length > 0 && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Top ranking keywords — your existing strengths to defend and build on</div>
            <ItemList rows={rk.map((it: any) => ({
              left: `#${it.ranked_serp_element?.serp_item?.rank_absolute ?? '?'} · ${it.keyword_data?.keyword}`,
              right: fmtNum(it.keyword_data?.keyword_info?.search_volume) + '/mo',
            }))} max={5} />
          </div>
        )}
        {cp.length > 0 && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Top competitors — study these pages to close gaps</div>
            <div className="flex flex-wrap gap-1">
              {cp.slice(0, 6).map((c: any) => <Pill key={c.domain}>{c.domain}</Pill>)}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ── Brand-search audit ────────────────────────────────
  if (t === 'seo_brand_audit_card') {
    const organic = (data.organic_top || []).length;
    return (
      <Card>
        <Header icon="🛡" title={`Brand Search — "${data.brand_name}"`} />
        <Primer>What Google shows when someone searches your brand by name. A Knowledge Panel and AI Overview are trust signals you want to own.</Primer>
        <div className="flex flex-wrap gap-1">
          <Pill tone={data.kp_present ? 'green' : 'amber'}>
            Knowledge Panel: {data.kp_present ? 'present' : 'not shown'}
          </Pill>
          <Pill tone={data.ai_overview_present ? 'green' : 'amber'}>
            AI Overview: {data.ai_overview_present ? 'present' : 'not shown'}
          </Pill>
          <Pill>{organic} organic listing{organic === 1 ? '' : 's'}</Pill>
        </div>
        {!data.kp_present && (
          <Primer>No Knowledge Panel yet — build entity authority (Wikipedia/Wikidata, consistent name-address-phone, schema markup) to earn one.</Primer>
        )}
        {Array.isArray(data.organic_top) && data.organic_top.length > 0 && (
          <div>
            <div className="text-[11px] text-muted-foreground mb-1">Listings you own — organic results on your brand-name search</div>
            <ItemList rows={data.organic_top.map((o: any) => ({
              left: o.title || o.domain || o.url,
              right: o.domain,
              href: o.url,
            }))} max={6} />
          </div>
        )}
      </Card>
    );
  }

  // ── Phase 12+ niche cards ─────────────────────────────
  if (t === 'seo_amazon_asin_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📦" title={`Amazon ASIN — ${data.asin}`} subtitle={`${items.length} ranked keywords`} />
        <Primer>The search terms this Amazon product ranks for, with its position and each term's volume. Weave the high-volume ones into your title and bullets.</Primer>
        {items.length === 0 ? <Empty>This product isn't ranking for tracked keywords yet.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: `#${it.ranked_serp_element?.serp_item?.rank_absolute ?? '?'} · ${it.keyword_data?.keyword}`,
            right: `${fmtNum(it.keyword_data?.keyword_info?.search_volume)}/mo`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_app_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📱" title={`${data.store === 'google_play' ? 'Google Play' : 'App Store'} — ${data.app_id}`} subtitle={`${items.length} keywords`} />
        <Primer>App-store search terms this app ranks for. Prioritise these in your app title, subtitle and keyword field to improve discovery.</Primer>
        {items.length === 0 ? <Empty>No app-store keywords returned.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.keyword_data?.keyword,
            right: `${fmtNum(it.keyword_data?.keyword_info?.search_volume)}/mo`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_trustpilot_search_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="⭐" title={`Trustpilot — "${data.keyword}"`} subtitle={`${items.length} listings`} />
        <Primer>Trustpilot review profiles ranking for this term. Ratings shape buyer trust — a strong review presence wins clicks over rivals.</Primer>
        {items.length === 0 ? <Empty>No Trustpilot listings found.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.title || it.domain,
            right: it.rating != null ? `${it.rating}★ (${fmtNum(it.reviews_count)})` : 'no rating',
            href: it.url,
          }))} max={6} />
        )}
      </Card>
    );
  }

  if (t === 'seo_pinterest_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📌" title={`Pinterest — "${data.keyword}"`} subtitle={`${items.length} pins`} />
        <Primer>Top pins for this term. Pinterest drives long-tail discovery for visual and lifestyle products — worth targeting if that's your market.</Primer>
        {items.length === 0 ? <Empty>No pins found for this keyword.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.title || it.description?.slice(0, 60) || '(untitled pin)',
            right: it.author || '',
            href: it.url,
          }))} max={6} />
        )}
      </Card>
    );
  }

  if (t === 'seo_reddit_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="👥" title={`Reddit — "${data.keyword}"`} subtitle={`${items.length} threads`} />
        <Primer>Reddit threads discussing this topic — a candid read on what real users care about, and where genuine (non-spammy) participation can build authority.</Primer>
        {items.length === 0 ? <Empty>No Reddit discussion found for this term.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.title,
            right: it.subreddit || '',
            href: it.url,
          }))} max={6} />
        )}
      </Card>
    );
  }

  if (t === 'seo_whois_card') {
    const it: any = data.item || {};
    return (
      <Card>
        <Header icon="🪪" title={`WHOIS — ${data.domain}`} />
        <Primer>Domain registration facts. An older registration date signals an established site; a recent one may explain a competitor's thin authority.</Primer>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat label="Registered" value={it.created_datetime?.slice(0, 10) || 'unknown'} />
          <Stat label="Expires" value={it.expiration_datetime?.slice(0, 10) || 'unknown'} />
          <Stat label="Registrar" value={it.registrar || 'unknown'} />
          <Stat label="First seen" value={it.first_seen?.slice(0, 10) || 'unknown'} />
        </div>
      </Card>
    );
  }

  if (t === 'seo_subdomains_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🌳" title={`Subdomains — ${data.domain}`} subtitle={`${items.length} found`} />
        <Primer>Separate sub-sites under this domain (blog., shop., help.) and the traffic each pulls — handy for seeing where a competitor's SEO value actually sits.</Primer>
        {items.length === 0 ? <Empty>No subdomains detected.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.subdomain,
            right: `${fmtNum(it.metrics?.organic?.count)} kw · ${fmtNum(it.metrics?.organic?.etv)} traffic`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_relevant_pages_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📄" title={`Top Pages — ${data.domain}`} subtitle={`${items.length} pages`} />
        <Primer>The individual pages pulling the most organic keywords on this domain — the content templates worth reverse-engineering.</Primer>
        {items.length === 0 ? <Empty>No ranking pages returned.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.page_address,
            right: `${fmtNum(it.metrics?.organic?.count)} kw`,
            href: it.page_address,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_historical_serps_card') {
    return (
      <Card>
        <Header icon="🕒" title={`Historical SERPs — "${data.keyword}"`} subtitle={`${(data.items || []).length} snapshots`} />
        <Primer>How the results page for this term has shifted over time — use it to see whether a competitor is gaining or slipping before you commit.</Primer>
        <div className="text-[11px] text-muted-foreground">{(data.items || []).length} snapshot(s) returned. Open the conversation for the full ranking history.</div>
      </Card>
    );
  }

  if (t === 'seo_keyword_overview_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📊" title="Keyword Overview" subtitle={`${items.length} keywords`} />
        <Primer>Volume (monthly searches) plus difficulty (KD, 0 easy → 100 hard) side by side — high volume with low KD is the sweet spot to target first.</Primer>
        {items.length === 0 ? <Empty>No keyword data returned.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.keyword,
            right: `${fmtNum(it.keyword_info?.search_volume)}/mo · KD ${it.keyword_properties?.keyword_difficulty ?? '—'}`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_ai_keyword_volume_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🤖" title="AI Search Volume" subtitle={`${items.length} keywords (LLM-search)`} />
        <Primer>How often these terms are asked inside AI assistants — the emerging channel beyond classic Google search. Content that answers these is what AI tools cite.</Primer>
        {items.length === 0 ? <Empty>No AI-search volume data returned.</Empty> : (
          <ItemList rows={items.map((it: any) => ({
            left: it.keyword,
            right: `${fmtNum(it.ai_search_volume)} /mo`,
          }))} max={10} />
        )}
      </Card>
    );
  }

  if (t === 'seo_categories_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="🏷" title={`Categories — ${data.domain}`} />
        <Primer>The topic categories Google associates with this domain — a quick read on what the site is seen as an authority in.</Primer>
        {items.length === 0 ? <Empty>No categories detected for this domain.</Empty> : (
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 16).map((it: any, i: number) => (
              <Pill key={i}>{it.category_name || it.name}</Pill>
            ))}
          </div>
        )}
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════════════
  // Wave 4 — the fourteen card types that had no renderer.
  //
  // All fourteen were listed in AGENT_RESULT_TITLES, which reads like coverage
  // and is not: AgentHub routes EVERY `seo_*_card` chunk to this component
  // before that map is ever consulted, so a type with no branch here fell
  // through to the bottom-of-file fallback and the user got a raw
  // `JSON.stringify(data)` dump in the chat. Among them were the most valuable
  // tools in the toolkit — AI Overview, Search Console striking-distance,
  // keyword ideas, search volume.
  // ══════════════════════════════════════════════════════════════════

  // ── Search Console: striking distance ─────────────────
  if (t === 'seo_gsc_striking_distance_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header
          icon="🎯"
          title={`Striking distance — ${data.website}`}
          subtitle={`${items.length} queries · last ${data.days ?? 28} days`}
        />
        <Primer>
          Queries you already rank for at positions 8–20 that people are genuinely searching. These are the
          cheapest wins available: Google already considers the page relevant, it just is not on page one yet.
        </Primer>
        {items.length === 0 ? (
          <Empty>No queries sit in the 8–20 band right now — nothing is one nudge away from page one.</Empty>
        ) : (
          <ItemList
            max={12}
            rows={items.map((i: any) => ({
              left: i.query,
              right: i.position != null ? `#${Math.round(i.position)}` : undefined,
              sub: `${fmtNum(i.impressions)} impressions · ${fmtPct(i.ctr)} CTR${i.clicks != null ? ` · ${fmtNum(i.clicks)} clicks` : ''}`,
            }))}
          />
        )}
      </Card>
    );
  }

  // ── Search Console: movers ────────────────────────────
  if (t === 'seo_gsc_movers_card') {
    const items: any[] = data.items || [];
    const gains = items.filter((i: any) => Number(i.delta) > 0);
    const drops = items.filter((i: any) => Number(i.delta) < 0);
    const row = (i: any) => ({
      left: i.query,
      right: `${Number(i.delta) > 0 ? '+' : ''}${Number(i.delta).toFixed(1)}`,
      sub: `now #${Math.round(i.position_now)}${i.position_before != null ? ` · was #${Math.round(i.position_before)}` : ''}`,
    });
    return (
      <Card>
        <Header icon="📈" title={`Rank movers — ${data.website}`} subtitle={`last ${data.days ?? 28} days vs the period before`} />
        <Primer>
          Average-position swings against the immediately-prior window. A positive number means the query moved
          UP toward #1. Read the drops first — they are usually a page that changed, or a competitor that
          published.
        </Primer>
        {items.length === 0 ? (
          <Empty>Nothing moved materially in this window.</Empty>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className={`text-[11px] font-medium mb-1 ${GOOD}`}>Gained ({gains.length})</div>
              {gains.length === 0 ? <Empty>None.</Empty> : <ItemList rows={gains.map(row)} max={6} />}
            </div>
            <div>
              <div className={`text-[11px] font-medium mb-1 ${BAD}`}>Slipped ({drops.length})</div>
              {drops.length === 0 ? <Empty>None.</Empty> : <ItemList rows={drops.map(row)} max={6} />}
            </div>
          </div>
        )}
      </Card>
    );
  }

  // ── On-page crawl issues ──────────────────────────────
  if (t === 'seo_onpage_issues_card') {
    const items: any[] = data.items || [];
    const kind = String(data.issue_type || '').replace(/_/g, ' ');
    return (
      <Card>
        <Header icon="🔧" title={`Site audit — ${kind}`} subtitle={`${items.length} affected pages`} />
        <Primer>
          Pages from the finished crawl matching this issue. Technical problems compound: one broken redirect
          chain can hide a whole section of the site from Google.
        </Primer>
        {items.length === 0 ? (
          <Empty>No pages hit this issue — that part of the crawl came back clean.</Empty>
        ) : (
          <ItemList
            max={12}
            rows={items.map((i: any) => ({
              left: i.url || i.page_address || i.title || i.from_url || '(no URL)',
              href: i.url || i.page_address || i.from_url,
              right: i.status_code != null ? String(i.status_code) : undefined,
              sub: i.title || i.meta?.title || i.location || i.to_url || undefined,
            }))}
          />
        )}
      </Card>
    );
  }

  // ── Backlinks over time ───────────────────────────────
  if (t === 'seo_backlinks_timeseries_card') {
    const items: any[] = data.items || [];
    const first: any = items[0] || {};
    const last: any = items[items.length - 1] || {};
    const a = Number(first.referring_domains);
    const b = Number(last.referring_domains);
    const rdGrowth = Number.isFinite(a) && Number.isFinite(b) ? b - a : null;
    return (
      <Card>
        <Header icon="🔗" title={`Backlink history — ${data.target}`} subtitle={`${items.length} monthly points`} />
        <Primer>
          How the link profile has grown or decayed month by month. Velocity matters more than the total: a site
          adding domains steadily is trusted differently from one that spiked once and stalled.
        </Primer>
        {items.length === 0 ? (
          <Empty>No history returned for this domain — usually means too few links to plot.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Referring domains" value={fmtNum(last.referring_domains)} />
              <Stat label="Backlinks" value={fmtNum(last.backlinks)} />
              <Stat
                label="Domains gained"
                value={rdGrowth == null ? '—' : <span className={rdGrowth >= 0 ? GOOD : BAD}>{rdGrowth >= 0 ? '+' : ''}{fmtNum(rdGrowth)}</span>}
              />
            </div>
            <ItemList
              max={6}
              rows={items.slice(-6).reverse().map((i: any) => ({
                left: i.date || `${i.year}-${String(i.month).padStart(2, '0')}`,
                right: `${fmtNum(i.referring_domains)} domains`,
                sub: `${fmtNum(i.backlinks)} backlinks${i.rank != null ? ` · rank ${i.rank}` : ''}`,
              }))}
            />
          </>
        )}
      </Card>
    );
  }

  // ── Backlink competitors ──────────────────────────────
  if (t === 'seo_backlinks_competitors_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="⚔️" title={`Link competitors — ${data.target}`} subtitle={`${items.length} domains`} />
        <Primer>
          Domains sharing the most referring sites with you. These are the real link-building rivals — and every
          domain linking to them but not to you is a warm prospect.
        </Primer>
        {items.length === 0 ? (
          <Empty>No overlapping link profiles found.</Empty>
        ) : (
          <ItemList
            max={10}
            rows={items.map((i: any) => ({
              left: i.target || i.domain,
              right: i.intersections != null ? `${fmtNum(i.intersections)} shared` : undefined,
              sub: `${fmtNum(i.backlinks)} backlinks${i.rank != null ? ` · rank ${i.rank}` : ''}`,
            }))}
          />
        )}
      </Card>
    );
  }

  // ── Historical rank overview ──────────────────────────
  if (t === 'seo_historical_rank_card') {
    const items: any[] = data.items || [];
    const point = (i: any) => i?.metrics?.organic || i?.organic || i || {};
    const last = point(items[items.length - 1]);
    return (
      <Card>
        <Header icon="🕰" title={`Visibility history — ${data.domain}`} subtitle={`${items.length} monthly points`} />
        <Primer>
          Ranking keywords and estimated traffic month by month — the rank-tracker view Search Console cannot
          give you, because it only reports queries you already earn impressions for.
        </Primer>
        {items.length === 0 ? (
          <Empty>No historical data for this domain in the selected market.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Keywords" value={fmtNum(last.count)} />
              <Stat label="Est. traffic" value={fmtNum(last.etv)} />
              <Stat label="Traffic value" value={last.estimated_paid_traffic_cost != null ? `$${fmtNum(last.estimated_paid_traffic_cost)}` : '—'} />
            </div>
            <ItemList
              max={6}
              rows={items.slice(-6).reverse().map((i: any) => {
                const m = point(i);
                return {
                  left: i.date || `${i.year}-${String(i.month).padStart(2, '0')}`,
                  right: `${fmtNum(m.count)} keywords`,
                  sub: `${fmtNum(m.etv)} est. visits`,
                };
              })}
            />
          </>
        )}
      </Card>
    );
  }

  // ── Keyword universe for a site ───────────────────────
  if (t === 'seo_keywords_for_site_card') {
    const items: any[] = data.items || [];
    const kw = (i: any) => i?.keyword_data?.keyword ?? i?.keyword ?? '';
    const vol = (i: any) => i?.keyword_data?.keyword_info?.search_volume ?? i?.search_volume;
    const pos = (i: any) => i?.ranked_serp_element?.serp_item?.rank_absolute ?? i?.rank_absolute ?? i?.position;
    const totalVol = items.reduce((s: number, i: any) => s + (Number(vol(i)) || 0), 0);
    return (
      <Card>
        <Header icon="🌐" title={`Keyword universe — ${data.domain}`} subtitle={`${items.length} keywords · ${fmtNum(totalVol)} monthly searches`} />
        <Primer>
          Everything the domain ranks for across positions 1–100, including the deep rankings Search Console
          buries. This is the full organic footprint, not just the part already earning clicks.
        </Primer>
        {items.length === 0 ? (
          <Empty>The domain does not rank in the top 100 for any keyword in this market yet.</Empty>
        ) : (
          <ItemList
            max={12}
            rows={items.map((i: any) => ({
              left: kw(i),
              right: pos(i) != null ? `#${pos(i)}` : undefined,
              sub: `${fmtNum(vol(i))}/mo${i?.keyword_data?.keyword_info?.cpc != null ? ` · $${Number(i.keyword_data.keyword_info.cpc).toFixed(2)} CPC` : ''}`,
            }))}
          />
        )}
      </Card>
    );
  }

  // ── Keyword ideas / related keywords / search volume ──
  if (t === 'seo_keyword_ideas_card' || t === 'seo_related_keywords_card' || t === 'seo_search_volume_card') {
    const items: any[] = data.items || [];
    const kw = (i: any) => i?.keyword_data?.keyword ?? i?.keyword ?? '';
    const info = (i: any) => i?.keyword_data?.keyword_info ?? i?.keyword_info ?? i ?? {};
    const kd = (i: any) =>
      i?.keyword_data?.keyword_properties?.keyword_difficulty ?? i?.keyword_properties?.keyword_difficulty ?? i?.keyword_difficulty;
    const intent = (i: any) =>
      i?.keyword_data?.search_intent_info?.main_intent ?? i?.search_intent_info?.main_intent;
    const totalVol = items.reduce((s: number, i: any) => s + (Number(info(i).search_volume) || 0), 0);

    const heading =
      t === 'seo_keyword_ideas_card'
        ? { icon: '💡', title: `Keyword ideas — ${(data.seeds || []).join(', ')}` }
        : t === 'seo_related_keywords_card'
          ? { icon: '🔀', title: `Related to "${data.keyword}"` }
          : { icon: '📊', title: 'Search volume & CPC' };

    const primer =
      t === 'seo_keyword_ideas_card'
        ? 'Keywords Google associates with your seeds, ranked by demand. Volume is the size of the prize; difficulty is whether it is winnable.'
        : t === 'seo_related_keywords_card'
          ? 'Semantically related queries — the vocabulary real searchers use for this topic. Covering them on one strong page usually beats one page each.'
          : 'Monthly demand and paid cost per keyword. A high CPC is a good sign: someone is paying for these clicks, which means they convert.';

    return (
      <Card>
        <Header icon={heading.icon} title={heading.title} subtitle={`${items.length} keywords · ${fmtNum(totalVol)} monthly searches`} />
        <Primer>{primer}</Primer>
        {items.length === 0 ? (
          <Empty>No keywords came back for this query in the selected market.</Empty>
        ) : (
          <ItemList
            max={14}
            rows={items.map((i: any) => {
              const inf = info(i);
              const bits = [
                inf.search_volume != null ? `${fmtNum(inf.search_volume)}/mo` : null,
                inf.cpc != null ? `$${Number(inf.cpc).toFixed(2)} CPC` : null,
                kd(i) != null ? `KD ${kd(i)}` : null,
                intent(i) || null,
              ].filter(Boolean);
              return {
                left: kw(i),
                right: inf.search_volume != null ? fmtNum(inf.search_volume) : undefined,
                sub: bits.join(' · ') || undefined,
              };
            })}
          />
        )}
      </Card>
    );
  }

  // ── Domain keyword intersection ───────────────────────
  if (t === 'seo_domain_intersection_card') {
    const items: any[] = data.items || [];
    const rank = (el: any) => el?.rank_absolute ?? el?.rank_group;
    return (
      <Card>
        <Header icon="🔎" title={`${data.target1} vs ${data.target2}`} subtitle={`${items.length} shared keywords`} />
        <Primer>
          Keywords BOTH domains rank for, with each position side by side. Where they beat you on a keyword you
          already rank for, the page exists — it just needs to be better.
        </Primer>
        {items.length === 0 ? (
          <Empty>These two domains do not compete on any keyword in this market.</Empty>
        ) : (
          <ItemList
            max={12}
            rows={items.map((i: any) => {
              const a = rank(i.first_domain_serp_element);
              const b = rank(i.second_domain_serp_element);
              const lead = a != null && b != null ? (a < b ? data.target1 : a > b ? data.target2 : 'tied') : null;
              return {
                left: i?.keyword_data?.keyword ?? i?.keyword ?? '',
                right: `${a != null ? `#${a}` : '—'} vs ${b != null ? `#${b}` : '—'}`,
                sub:
                  [
                    i?.keyword_data?.keyword_info?.search_volume != null
                      ? `${fmtNum(i.keyword_data.keyword_info.search_volume)}/mo`
                      : null,
                    lead && lead !== 'tied' ? `${lead} ahead` : lead,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined,
              };
            })}
          />
        )}
      </Card>
    );
  }

  // ── Google AI Overview ────────────────────────────────
  if (t === 'seo_ai_overview_card') {
    const items: any[] = data.items || [];
    const block: any = items.find((i: any) => i?.type === 'ai_overview') || items[0] || {};
    const refs: any[] = block.references || block.items || [];
    const text: string =
      block.text ||
      (Array.isArray(block.items) ? block.items.map((x: any) => x?.text).filter(Boolean).join(' ') : '') ||
      '';
    const present = !!text || refs.length > 0;
    return (
      <Card>
        <Header
          icon="✨"
          title={`AI Overview — "${data.keyword}"`}
          subtitle={present ? `${refs.length} cited sources` : 'not shown for this query'}
        />
        <Primer>
          When Google answers a query itself, ranking #1 stops guaranteeing the click. What matters instead is
          being one of the sources it cites.
        </Primer>
        {!present ? (
          <Empty>
            Google is not generating an AI Overview for this keyword — a strong organic position still earns the
            click here.
          </Empty>
        ) : (
          <>
            {text && (
              <p className="text-xs leading-relaxed text-muted-foreground border-l-2 border-primary/40 pl-2">
                {text.slice(0, 600)}
                {text.length > 600 ? '…' : ''}
              </p>
            )}
            {refs.length > 0 && (
              <ItemList
                max={8}
                rows={refs.map((r: any) => ({
                  left: r.title || r.url || r.source,
                  href: r.url,
                  sub: r.domain || undefined,
                }))}
              />
            )}
          </>
        )}
      </Card>
    );
  }

  // ── Google Maps pack ──────────────────────────────────
  if (t === 'seo_google_maps_card') {
    const items: any[] = data.items || [];
    return (
      <Card>
        <Header icon="📍" title={`Map results — "${data.keyword}"`} subtitle={`${items.length} listings`} />
        <Primer>
          The businesses Google shows on the map for this search. A national page cannot win these slots — they
          are decided by proximity, reviews and Business Profile completeness.
        </Primer>
        {items.length === 0 ? (
          <Empty>No map pack for this query — Google does not read it as a local search.</Empty>
        ) : (
          <ItemList
            max={10}
            rows={items.map((i: any) => ({
              left: i.title || i.name || '(unnamed)',
              href: i.url || (i.domain ? `https://${i.domain}` : undefined),
              right: i.rating?.value != null ? `★ ${i.rating.value}` : undefined,
              sub:
                [
                  i.address || i.address_info?.address,
                  i.rating?.votes_count != null ? `${fmtNum(i.rating.votes_count)} reviews` : null,
                  i.rank_absolute != null ? `#${i.rank_absolute}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || undefined,
            }))}
          />
        )}
      </Card>
    );
  }

  // ── Google Business Profile ───────────────────────────
  if (t === 'seo_gbp_info_card') {
    const i: any = data.item || {};
    const found = !!(i.title || i.address || i.phone);
    return (
      <Card>
        <Header icon="🏢" title={`Business Profile — "${data.keyword}"`} subtitle={i.category || undefined} />
        <Primer>
          The public Business Profile Google holds. Gaps here — no hours, no category, few reviews — cost local
          visibility directly, and every one of them is editable.
        </Primer>
        {!found ? (
          <Empty>No Business Profile found for this query.</Empty>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Stat label="Name" value={i.title} />
              <Stat
                label="Rating"
                value={i.rating?.value != null ? `★ ${i.rating.value} (${fmtNum(i.rating.votes_count)})` : 'No reviews yet'}
              />
              <Stat label="Phone" value={i.phone || 'Not listed'} />
              <Stat label="Category" value={i.category || 'Not set'} />
            </div>
            {(i.address || i.address_info?.address) && (
              <p className="text-[11px] text-muted-foreground">{i.address || i.address_info?.address}</p>
            )}
            {i.url && (
              <a href={i.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">
                {i.url}
              </a>
            )}
          </>
        )}
      </Card>
    );
  }

  // ── Escape-hatch raw ──────────────────────────────────
  if (t === 'seo_dataforseo_raw_card') {
    return (
      <Card>
        <Header icon="⚙️" title={`DataForSEO call: ${data.kind}`} subtitle={`${(data.items || []).length} items · $${(data.cost_usd || 0).toFixed(4)} · ${data.latency_ms}ms`} />
        <Primer>Raw results for a call this card doesn't have a purpose-built view for yet. Expand to inspect the first few records directly.</Primer>
        <details className="text-[11px] text-muted-foreground">
          <summary className="cursor-pointer hover:text-foreground">Show first 3 items</summary>
          <pre className="text-[10px] mt-1 max-h-40 overflow-auto whitespace-pre-wrap bg-muted/40 border border-border rounded p-2">
            {JSON.stringify((data.items || []).slice(0, 3), null, 2)}
          </pre>
        </details>
      </Card>
    );
  }

  // ── Fallback ──────────────────────────────────────────
  return (
    <Card className="text-xs text-muted-foreground">
      <div className="font-medium text-foreground">{data.type}</div>
      <Primer>This result type doesn't have a formatted view yet — here's the raw data it returned.</Primer>
      <pre className="text-[10px] mt-1 max-h-32 overflow-auto bg-muted/40 border border-border rounded p-2">{JSON.stringify(data, null, 2)}</pre>
    </Card>
  );
}
