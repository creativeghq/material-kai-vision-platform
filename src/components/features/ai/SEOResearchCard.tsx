/**
 * SEOResearchCard — the `seo_research_keyword` agent tool's artifact.
 *
 * Renders a single keyword's full SERP-research snapshot as a tabbed,
 * self-explaining report: a plain-language reading + recommended actions up
 * top, then AI Overview, featured snippet, knowledge panel, SERP-feature
 * signals, top competitors, People Also Ask, related searches and keyword
 * ideas.
 *
 * Surfaces render on THEME tokens (bg-card / text-foreground / muted / border)
 * so the same card is legible in the light canvas, the dark canvas AND the dark
 * chat bubble — never a hardcoded white-on-dark wash. Data shape mirrors the
 * `seo_research_card` chunk from `_shared/tools/seo-agent-tools.ts`.
 */

import { useState } from 'react';
import { safeHref } from '@/utils/safeUrl';

export interface SEOResearchCardData {
  keyword: string;
  country: string;
  language: string;
  opportunity_count: number;
  summary: {
    subject?: string;
    opportunity_count: number;
    types: Record<string, number>;
    ai_overview_present?: boolean;
    ai_overview_brand_mentioned?: boolean | null;
    featured_snippet_held_by?: string | null;
    knowledge_graph_present?: boolean | null;
    related_searches?: string[];
    top_paa?: string[];
    top_competitors?: Array<{ rank?: number; domain?: string; title?: string }>;
    top_keywords?: Array<{ keyword?: string; volume?: number; difficulty?: number | null; intent?: string | null }>;
  };
  opportunities: Array<{
    type: string;
    title: string;
    rationale: string;
    suggested_action: string;
    priority_score: number;
    source: Record<string, any>;
  }>;
  errors?: Record<string, string>;
  latency_ms?: number;
}

const TYPE_LABELS: Record<string, string> = {
  ai_overview: 'AI Overview',
  featured_snippet: 'Featured Snippet',
  pao_question: 'People Also Ask',
  related_search: 'Related Search',
  competitor_ranking: 'Top Competitor',
  keyword_opportunity: 'Keyword',
  video_carousel: 'Video Carousel',
  news_carousel: 'News Carousel',
  knowledge_graph: 'Knowledge Graph',
  paid_competitor: 'Paid Bidder',
  shopping_listing: 'Shopping',
  domain_snapshot: 'Domain Snapshot',
};

function findOne(ops: SEOResearchCardData['opportunities'], type: string) {
  return ops.find((o) => o.type === type);
}
function findAll(ops: SEOResearchCardData['opportunities'], type: string) {
  return ops.filter((o) => o.type === type);
}

export function SEOResearchCard({ data }: { data: SEOResearchCardData }) {
  const [tab, setTab] = useState<'overview' | 'competitors' | 'keywords' | 'paa' | 'all'>('overview');

  const ai = findOne(data.opportunities, 'ai_overview');
  const fs = findOne(data.opportunities, 'featured_snippet');
  const kg = findOne(data.opportunities, 'knowledge_graph');
  const competitors = findAll(data.opportunities, 'competitor_ranking');
  const keywords = findAll(data.opportunities, 'keyword_opportunity');
  const paa = findAll(data.opportunities, 'pao_question');
  const related = findAll(data.opportunities, 'related_search');
  const videos = findOne(data.opportunities, 'video_carousel');
  const news = findAll(data.opportunities, 'news_carousel');
  const paid = findAll(data.opportunities, 'paid_competitor');
  const shopping = findAll(data.opportunities, 'shopping_listing');
  const domain = findOne(data.opportunities, 'domain_snapshot');

  // Plain-language reading of the SERP — only assert what the data shows.
  const reading: string[] = [];
  if (ai) {
    reading.push(ai.source?.brand_mentioned === true
      ? 'Google shows an AI Overview and cites you in it.'
      : ai.source?.brand_mentioned === false
        ? 'Google shows an AI Overview but does not cite you — a visibility gap.'
        : 'Google shows an AI Overview for this query.');
  }
  if (fs?.source?.current_domain) {
    reading.push(`The featured snippet (position 0) is held by ${fs.source.current_domain}.`);
  }
  if (kg && !kg.source?.knowledge_graph_present) {
    reading.push('No knowledge panel appears — an entity-authority opportunity.');
  }
  if (videos?.source?.brand_present === false) reading.push('A video carousel runs here and you are not in it.');

  // "What to do" — the highest-priority opportunities that carry an action.
  const actions = data.opportunities
    .filter((o) => o.suggested_action && o.suggested_action.trim().length > 0)
    .sort((a, b) => (b.priority_score ?? 0) - (a.priority_score ?? 0))
    .slice(0, 4);

  return (
    <div className="bg-card text-card-foreground rounded-xl p-4 border border-border space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-muted-foreground">SEO research · Google {data.country} · {data.language}</div>
          <div className="text-base font-semibold mt-0.5">{data.keyword}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">SERP signals</div>
          <div className="text-2xl font-semibold leading-none">{data.opportunity_count}</div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 flex-wrap text-xs">
        {(['overview', 'competitors', 'keywords', 'paa', 'all'] as const).map((t) => {
          const count = t === 'competitors' ? competitors.length : t === 'keywords' ? keywords.length : t === 'paa' ? paa.length : 0;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1 transition ${
                tab === t
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-primary/10 hover:text-foreground'
              }`}
            >
              {t === 'paa' ? 'PAA' : t.charAt(0).toUpperCase() + t.slice(1)}
              {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {/* Plain-language reading */}
          {reading.length > 0 && (
            <p className="text-sm leading-relaxed">{reading.join(' ')}</p>
          )}

          {/* What to do — top actionable opportunities */}
          {actions.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                What to do next
              </div>
              <ol className="space-y-2">
                {actions.map((o, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                      {i + 1}
                    </span>
                    <span>
                      <span className="font-medium">{o.title}</span>
                      <span className="block text-xs text-muted-foreground">{o.suggested_action}</span>
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* SERP-feature signals — each one explained */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <SignalCell
              label="Video carousel"
              status={videos ? (videos.source?.brand_present === true ? 'good' : videos.source?.brand_present === false ? 'opportunity' : 'info') : 'neutral'}
              value={videos ? (videos.source?.brand_present === true ? 'You appear' : videos.source?.brand_present === false ? 'Present — not you' : 'Present') : 'None'}
              desc={videos
                ? (videos.source?.brand_present === false ? 'A video pack ranks here — publishing video could win a slot.' : 'Google shows a video pack for this query.')
                : 'No video pack — text results dominate.'}
            />
            <SignalCell
              label="News pack"
              status={news.length > 0 ? 'info' : 'neutral'}
              value={news.length > 0 ? `${news.length} result${news.length === 1 ? '' : 's'}` : 'None'}
              desc={news.length > 0 ? 'Freshness matters — recent coverage can rank.' : 'No news pack — not a trending query.'}
            />
            <SignalCell
              label="Paid advertisers"
              status={paid.length > 0 ? 'opportunity' : 'good'}
              value={paid.length > 0 ? `${paid.length} bidding` : 'None'}
              desc={paid.length > 0 ? 'Advertisers are paying for this term — commercial intent.' : 'No paid competition — cheaper to own organically.'}
            />
            <SignalCell
              label="Shopping listings"
              status={shopping.length > 0 ? 'info' : 'neutral'}
              value={shopping.length > 0 ? `${shopping.length} listing${shopping.length === 1 ? '' : 's'}` : 'None'}
              desc={shopping.length > 0 ? 'Product listings show — transactional query.' : 'No shopping pack.'}
            />
          </div>

          {/* SERP-feature detail accordions — surface the actual carousel/pack items */}
          {Array.isArray(videos?.source?.videos) && videos.source.videos.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Videos in the carousel ({videos.source.videos.length})</span>
                <span className="text-xs text-muted-foreground">where to publish</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
                {videos.source.platforms && typeof videos.source.platforms === 'object' && (
                  <div className="flex flex-wrap gap-1 pb-1">
                    {Object.entries(videos.source.platforms as Record<string, any>).map(([p, n]) => (
                      <span key={p} className="text-[10px] bg-background border border-border rounded-full px-2 py-0.5">{p}: {String(n)}</span>
                    ))}
                  </div>
                )}
                {videos.source.videos.map((v: any, i: number) => (
                  <div key={i} className="leading-snug">
                    {v.url ? (
                      <a href={safeHref(v.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{v.title || v.url}</a>
                    ) : (
                      <span>{v.title}</span>
                    )}
                    {(v.creator || v.platform || v.duration) && (
                      <span className="text-muted-foreground">
                        {' — '}
                        {[v.creator, v.platform, v.duration].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {news.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Top stories ({news.length})</span>
                <span className="text-xs text-muted-foreground">news pack</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1 text-xs">
                {news.map((n, i) => (
                  <div key={i} className="leading-snug">
                    {n.source?.url ? (
                      <a href={safeHref(n.source.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{n.source.title || n.title}</a>
                    ) : (
                      <span>{n.source?.title || n.title}</span>
                    )}
                    {(n.source?.source || n.source?.timestamp) && (
                      <span className="text-muted-foreground"> — {[n.source?.source, n.source?.timestamp].filter(Boolean).join(' · ')}</span>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}

          {paid.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Advertisers bidding ({paid.length})</span>
                <span className="text-xs text-muted-foreground">paid competition</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1.5 text-xs">
                {paid.map((p, i) => (
                  <div key={i} className="leading-snug">
                    <div>
                      {p.source?.url ? (
                        <a href={safeHref(p.source.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{p.source.domain}</a>
                      ) : (
                        <span className="font-medium">{p.source?.domain}</span>
                      )}
                      {p.source?.title && <span className="text-foreground"> — {p.source.title}</span>}
                    </div>
                    {p.source?.description && <div className="text-muted-foreground">{p.source.description}</div>}
                  </div>
                ))}
              </div>
            </details>
          )}

          {shopping.length > 0 && (
            <details className="group rounded-lg border border-border bg-muted/40">
              <summary className="cursor-pointer list-none px-2.5 py-2 text-sm flex items-center justify-between gap-2">
                <span className="font-medium">Shopping listings ({shopping.length})</span>
                <span className="text-xs text-muted-foreground">transactional</span>
              </summary>
              <div className="px-2.5 pb-2.5 pt-0.5 space-y-1.5 text-xs">
                {shopping.map((s, i) => (
                  <div key={i} className="leading-snug">
                    <div>
                      {s.source?.url ? (
                        <a href={safeHref(s.source.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">{s.source.title}</a>
                      ) : (
                        <span className="font-medium">{s.source?.title}</span>
                      )}
                    </div>
                    <div className="text-muted-foreground">
                      {[
                        s.source?.price != null ? `${s.source.price}${s.source.currency ? ` ${s.source.currency}` : ''}` : null,
                        s.source?.seller,
                        s.source?.rating_value != null ? `★ ${s.source.rating_value}` : null,
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* AI Overview detail */}
          {ai && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <span className="font-medium">AI Overview</span>
                {ai.source?.brand_mentioned === true && <span className={GOOD}>cites you ✓</span>}
                {ai.source?.brand_mentioned === false && <span className={WARN}>does not cite you</span>}
              </div>
              {ai.source?.ai_overview_text && (
                <div className="text-xs leading-relaxed max-h-32 overflow-y-auto text-muted-foreground">
                  “{String(ai.source.ai_overview_text).slice(0, 500)}{String(ai.source.ai_overview_text).length > 500 ? '…' : ''}”
                </div>
              )}
              {Array.isArray(ai.source?.references) && ai.source.references.length > 0 ? (
                <div className="mt-2">
                  <div className="text-[11px] text-muted-foreground mb-1">Sources Google cited:</div>
                  <div className="space-y-0.5">
                    {ai.source.references.map((r: any, i: number) => (
                      <div key={i} className="text-xs leading-snug">
                        {r.url ? (
                          <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{r.title || r.domain || r.url}</a>
                        ) : (
                          <span>{r.title || r.domain}</span>
                        )}
                        {(r.domain || r.source) && (r.title || r.url) && (
                          <span className="text-muted-foreground"> — {r.domain || r.source}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : Array.isArray(ai.source?.cited_domains) && ai.source.cited_domains.length > 0 && (
                <div className="mt-2">
                  <div className="text-[11px] text-muted-foreground mb-1">Sources Google cited:</div>
                  <div className="flex flex-wrap gap-1">
                    {ai.source.cited_domains.slice(0, 8).map((d: string) => (
                      <span key={d} className="text-[10px] bg-background border border-border rounded-full px-2 py-0.5">{d}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Featured snippet */}
          {fs && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-1">Featured snippet · position 0</div>
              <div className="text-sm">
                Held by{' '}
                {fs.source?.current_url ? (
                  <a href={safeHref(fs.source.current_url)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{fs.source?.current_domain || 'unknown'}</a>
                ) : (
                  <span className="font-medium">{fs.source?.current_domain || 'unknown'}</span>
                )}
                {fs.source?.current_domain && <span className="text-muted-foreground"> — win it by answering more directly.</span>}
              </div>
              {fs.source?.current_title && (
                <div className="text-xs font-medium mt-1">{fs.source.current_title}</div>
              )}
              {fs.source?.current_description && (
                <div className="text-xs italic text-muted-foreground mt-1">
                  “{String(fs.source.current_description).slice(0, 240)}”
                </div>
              )}
            </div>
          )}

          {/* Knowledge panel */}
          {kg && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-1">Knowledge panel</div>
              <div className="text-sm">
                {kg.source?.knowledge_graph_present
                  ? <>Present — {kg.source?.url
                      ? <a href={safeHref(kg.source.url)} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline">{kg.source?.title || '(unnamed entity)'}</a>
                      : <span className="font-medium">{kg.source?.title || '(unnamed entity)'}</span>}</>
                  : <span className={WARN}>Not shown — build entity authority (Wikipedia, Wikidata, consistent NAP) to earn one.</span>}
              </div>
              {kg.source?.knowledge_graph_present && kg.source?.subtitle && (
                <div className="text-xs text-muted-foreground mt-0.5">{kg.source.subtitle}</div>
              )}
              {kg.source?.knowledge_graph_present && kg.source?.description && (
                <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{kg.source.description}</div>
              )}
            </div>
          )}

          {/* Domain snapshot */}
          {domain && domain.source?.configured && domain.source?.indexed_in_dataforseo && (
            <div className="rounded-lg border border-border bg-muted/40 p-3">
              <div className="text-xs text-muted-foreground mb-2">Your domain · {domain.source?.homepage_domain}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Stat label="Domain rank" value={domain.source?.domain_rank} />
                <Stat label="Ranking keywords" value={fmtNum(domain.source?.ranking_keywords_count)} />
                <Stat label="Est. traffic /mo" value={fmtNum(domain.source?.estimated_organic_monthly_traffic)} />
                <Stat label="Backlinks" value={fmtNum(domain.source?.backlinks)} />
                <Stat label="Referring domains" value={fmtNum(domain.source?.referring_domains)} />
                <Stat
                  label="Traffic value /mo"
                  value={domain.source?.estimated_traffic_value_usd != null
                    ? `$${fmtNum(domain.source.estimated_traffic_value_usd)}`
                    : '—'}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPETITORS TAB */}
      {tab === 'competitors' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Who ranks organically for this keyword — these are the pages to out-write.</p>
          {competitors.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No organic competitors returned.</div>
          ) : competitors.map((c) => (
            <a
              key={`${c.source?.rank}-${c.source?.url}`}
              href={safeHref(c.source?.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-muted/40 hover:bg-muted rounded-lg p-2.5 border border-border transition"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-semibold text-primary w-7">#{c.source?.rank ?? '?'}</span>
                <span className="text-sm flex-1 truncate">{c.source?.domain}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate ml-9">{c.source?.title}</div>
              {c.source?.description && (
                <div className="text-xs text-muted-foreground/80 ml-9 mt-0.5 line-clamp-2">{c.source.description}</div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* KEYWORDS TAB */}
      {tab === 'keywords' && (
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Related terms worth targeting — volume is monthly searches; KD is ranking difficulty (0 easy → 100 hard).</p>
          {keywords.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No related keywords returned.</div>
          ) : keywords.map((k, i) => (
            <div key={`${i}-${k.source?.keyword}`} className="bg-muted/40 rounded-lg p-2.5 border border-border">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium truncate">{k.source?.keyword}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {fmtNum(k.source?.search_volume)} /mo
                </span>
              </div>
              <div className="flex gap-2 mt-1 text-[11px] text-muted-foreground">
                {k.source?.difficulty != null && <span>KD {k.source.difficulty}/100</span>}
                {k.source?.intent && <span>· {k.source.intent} intent</span>}
                {k.source?.cpc != null && k.source.cpc > 0 && <span>· ${Number(k.source.cpc).toFixed(2)} CPC</span>}
                {k.source?.competition != null && <span>· {k.source.competition} competition</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PAA TAB */}
      {tab === 'paa' && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Questions real users ask Google — answer these on-page to capture the “People Also Ask” box.</p>
          {paa.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center">No People Also Ask questions returned.</div>
          ) : paa.map((q, i) => (
            q.rationale ? (
              <details key={i} className="group bg-muted/40 rounded-lg border border-border">
                <summary className="cursor-pointer list-none px-2.5 py-2 text-sm font-medium flex items-center justify-between gap-2">
                  <span className="min-w-0">{q.title}</span>
                  <span className="text-xs text-muted-foreground shrink-0 group-open:hidden">answer</span>
                </summary>
                <div className="px-2.5 pb-2.5 pt-0.5 text-xs text-muted-foreground leading-relaxed">{q.rationale}</div>
              </details>
            ) : (
              <div key={i} className="bg-muted/40 rounded-lg p-2.5 border border-border">
                <div className="text-sm font-medium">{q.title}</div>
              </div>
            )
          ))}
          {related.length > 0 && (
            <div className="pt-2">
              <div className="text-xs text-muted-foreground mb-1">Related searches</div>
              <div className="flex flex-wrap gap-1">
                {related.map((r, i) => (
                  <span key={i} className="text-[11px] bg-muted border border-border rounded-full px-2 py-0.5">{r.title}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALL TAB — every signal, sorted by priority, with rationale + action */}
      {tab === 'all' && (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          <p className="text-xs text-muted-foreground">Every SERP signal we detected, most important first. Expand for why it matters and what to do.</p>
          {data.opportunities.map((o, i) => (
            <details key={i} className="bg-muted/40 rounded-lg border border-border">
              <summary className="px-2.5 py-2 cursor-pointer text-sm flex justify-between items-center gap-2">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground mr-1.5">{TYPE_LABELS[o.type] || o.type}</span>
                  <span>{o.title}</span>
                </span>
                <span className="text-[10px] text-muted-foreground shrink-0">priority {Math.round(o.priority_score * 100)}</span>
              </summary>
              <div className="px-2.5 pb-2.5 text-xs text-muted-foreground space-y-1">
                {o.rationale && <div>{o.rationale}</div>}
                {o.suggested_action && <div className="text-primary font-medium">→ {o.suggested_action}</div>}
              </div>
            </details>
          ))}
        </div>
      )}

      {data.errors && Object.keys(data.errors).length > 0 && (
        <details className="text-xs text-amber-600 dark:text-amber-400">
          <summary className="cursor-pointer">Some sources were unavailable ({Object.keys(data.errors).length})</summary>
          <ul className="mt-1 space-y-0.5 list-disc pl-4 text-muted-foreground">
            {Object.entries(data.errors).map(([k, v]) => (
              <li key={k}><span className="font-medium">{k}:</span> {String(v)}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const GOOD = 'text-emerald-600 dark:text-emerald-400';
const WARN = 'text-amber-600 dark:text-amber-400';

function SignalCell({ label, status, value, desc }: {
  label: string;
  status: 'good' | 'opportunity' | 'neutral' | 'info';
  value: string;
  desc: string;
}) {
  const valueClass =
    status === 'good' ? GOOD
    : status === 'opportunity' ? WARN
    : status === 'neutral' ? 'text-muted-foreground'
    : 'text-foreground';
  return (
    <div className="bg-muted/40 rounded-lg p-2.5 border border-border">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`text-xs font-semibold ${valueClass}`}>{value}</span>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1 leading-snug">{desc}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold">{value ?? '—'}</div>
    </div>
  );
}

function fmtNum(n: any): string {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}
