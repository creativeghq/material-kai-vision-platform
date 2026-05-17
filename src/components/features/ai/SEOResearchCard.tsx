/**
 * SEOResearchCard — inline chat card for the `seo_research_keyword` agent tool.
 *
 * Renders a single keyword's full SERP-research snapshot as a tabbed,
 * expandable summary: AI Overview, featured snippet, top competitors,
 * People Also Ask, related searches, related keywords with intent +
 * difficulty, and surface-level signals (video / news / shopping carousels,
 * knowledge graph, paid bidders).
 *
 * Data shape mirrors the `seo_research_card` chunk emitted from
 * `_shared/tools/seo-agent-tools.ts` → `condenseForLLM` + the full
 * `opportunities` array. Card surfaces both summary + drill-down.
 */

import { useState } from 'react';

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

  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-white/60">SEO research · Google {data.country} · {data.language}</div>
          <div className="text-base font-medium mt-0.5">{data.keyword}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-white/60">Signals</div>
          <div className="text-2xl font-medium leading-none">{data.opportunity_count}</div>
        </div>
      </div>

      {/* Tab strip */}
      <div className="flex gap-1 flex-wrap text-xs">
        {(['overview', 'competitors', 'keywords', 'paa', 'all'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1 rounded-full transition ${
              tab === t ? 'bg-primary text-primary-foreground' : 'bg-white/10 hover:bg-white/15'
            }`}
          >
            {t === 'paa' ? 'PAA' : t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div className="space-y-3">
          {/* AI Overview */}
          {ai && (
            <div className="bg-white/5 rounded p-3 border border-white/10">
              <div className="flex items-center gap-2 text-xs text-white/60 mb-1">
                <span>🤖 AI Overview</span>
                {ai.source?.brand_mentioned === true && (
                  <span className="text-green-400">brand cited ✓</span>
                )}
                {ai.source?.brand_mentioned === false && (
                  <span className="text-amber-400">brand NOT cited</span>
                )}
              </div>
              {ai.source?.ai_overview_text && (
                <div className="text-xs leading-relaxed max-h-32 overflow-y-auto">
                  "{String(ai.source.ai_overview_text).slice(0, 500)}{String(ai.source.ai_overview_text).length > 500 ? '…' : ''}"
                </div>
              )}
              {Array.isArray(ai.source?.cited_domains) && ai.source.cited_domains.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {ai.source.cited_domains.slice(0, 8).map((d: string) => (
                    <span key={d} className="text-[10px] bg-white/10 rounded-full px-2 py-0.5">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Featured snippet */}
          {fs && (
            <div className="bg-white/5 rounded p-3 border border-white/10">
              <div className="text-xs text-white/60 mb-1">⭐ Featured Snippet (position 0)</div>
              <div className="text-xs">
                Held by <span className="font-medium">{fs.source?.current_domain || 'unknown'}</span>
              </div>
              {fs.source?.current_description && (
                <div className="text-xs italic text-white/70 mt-1">
                  "{String(fs.source.current_description).slice(0, 240)}"
                </div>
              )}
            </div>
          )}

          {/* Knowledge graph */}
          {kg && (
            <div className="bg-white/5 rounded p-3 border border-white/10">
              <div className="text-xs text-white/60 mb-1">📇 Knowledge Panel</div>
              <div className="text-xs">
                {kg.source?.knowledge_graph_present
                  ? <>Present — <span className="font-medium">{kg.source?.title || '(unnamed)'}</span></>
                  : <span className="text-amber-400">Not shown — entity-authority opportunity</span>}
              </div>
            </div>
          )}

          {/* Side signals row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <SignalCell label="🎬 Video" present={!!videos} brandIn={videos?.source?.brand_present} />
            <SignalCell label="📰 News" present={news.length > 0} count={news.length} />
            <SignalCell label="💸 Paid bidders" present={paid.length > 0} count={paid.length} />
            <SignalCell label="🛒 Shopping" present={shopping.length > 0} count={shopping.length} />
          </div>

          {/* Domain snapshot */}
          {domain && domain.source?.configured && domain.source?.indexed_in_dataforseo && (
            <div className="bg-white/5 rounded p-3 border border-white/10">
              <div className="text-xs text-white/60 mb-1">🌐 Domain snapshot — {domain.source?.homepage_domain}</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <Stat label="Domain Rank" value={domain.source?.domain_rank} />
                <Stat label="Ranking kw" value={fmtNum(domain.source?.ranking_keywords_count)} />
                <Stat label="Est. traffic" value={fmtNum(domain.source?.estimated_organic_monthly_traffic)} />
                <Stat label="Backlinks" value={fmtNum(domain.source?.backlinks)} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* COMPETITORS TAB */}
      {tab === 'competitors' && (
        <div className="space-y-1.5">
          {competitors.length === 0 ? (
            <div className="text-xs text-white/60 py-4 text-center">No organic competitors returned.</div>
          ) : competitors.map((c) => (
            <a
              key={`${c.source?.rank}-${c.source?.url}`}
              href={c.source?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-white/5 hover:bg-white/10 rounded p-2 border border-white/10 transition"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-xs font-medium text-blue-300 w-6">#{c.source?.rank ?? '?'}</span>
                <span className="text-xs flex-1 truncate">{c.source?.domain}</span>
              </div>
              <div className="text-xs text-white/60 truncate ml-8">{c.source?.title}</div>
            </a>
          ))}
        </div>
      )}

      {/* KEYWORDS TAB */}
      {tab === 'keywords' && (
        <div className="space-y-1.5">
          {keywords.length === 0 ? (
            <div className="text-xs text-white/60 py-4 text-center">No related keywords returned.</div>
          ) : keywords.map((k, i) => (
            <div key={`${i}-${k.source?.keyword}`} className="bg-white/5 rounded p-2 border border-white/10">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium truncate">{k.source?.keyword}</span>
                <span className="text-xs text-white/60 whitespace-nowrap">
                  {fmtNum(k.source?.search_volume)} /mo
                </span>
              </div>
              <div className="flex gap-2 mt-1 text-[10px] text-white/60">
                {k.source?.difficulty != null && <span>KD {k.source.difficulty}/100</span>}
                {k.source?.intent && <span>· {k.source.intent}</span>}
                {k.source?.cpc != null && k.source.cpc > 0 && <span>· ${Number(k.source.cpc).toFixed(2)} CPC</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PAA TAB */}
      {tab === 'paa' && (
        <div className="space-y-2">
          {paa.length === 0 ? (
            <div className="text-xs text-white/60 py-4 text-center">No People Also Ask questions returned.</div>
          ) : paa.map((q, i) => (
            <div key={i} className="bg-white/5 rounded p-2 border border-white/10">
              <div className="text-xs font-medium">{q.title}</div>
            </div>
          ))}
          {related.length > 0 && (
            <div className="pt-2">
              <div className="text-xs text-white/60 mb-1">Related searches</div>
              <div className="flex flex-wrap gap-1">
                {related.map((r, i) => (
                  <span key={i} className="text-[11px] bg-white/10 rounded-full px-2 py-0.5">{r.title}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALL TAB — raw drill-down sorted by priority */}
      {tab === 'all' && (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {data.opportunities.map((o, i) => (
            <details key={i} className="bg-white/5 rounded border border-white/10">
              <summary className="px-2 py-1.5 cursor-pointer text-xs flex justify-between items-center">
                <span>
                  <span className="text-white/60 mr-1.5">{TYPE_LABELS[o.type] || o.type}</span>
                  <span>{o.title}</span>
                </span>
                <span className="text-[10px] text-white/40">p{Math.round(o.priority_score * 100)}</span>
              </summary>
              <div className="px-2 pb-2 text-[11px] text-white/70 space-y-1">
                <div>{o.rationale}</div>
                <div className="text-blue-300">→ {o.suggested_action}</div>
              </div>
            </details>
          ))}
        </div>
      )}

      {data.errors && Object.keys(data.errors).length > 0 && (
        <details className="text-xs text-amber-400/70">
          <summary className="cursor-pointer">⚠ Partial errors ({Object.keys(data.errors).length})</summary>
          <pre className="text-[10px] mt-1 whitespace-pre-wrap">{JSON.stringify(data.errors, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

function SignalCell({ label, present, count, brandIn }: { label: string; present: boolean; count?: number; brandIn?: boolean }) {
  return (
    <div className="bg-white/5 rounded p-2 border border-white/10">
      <div className="text-[10px] text-white/60">{label}</div>
      <div className="text-sm font-medium mt-0.5">
        {present ? (
          brandIn === true ? <span className="text-green-400">in carousel ✓</span>
            : brandIn === false ? <span className="text-amber-400">not in carousel</span>
            : count != null ? `${count} item${count === 1 ? '' : 's'}`
            : 'present'
        ) : <span className="text-white/40">none</span>}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-[10px] text-white/60">{label}</div>
      <div className="text-sm font-medium">{value ?? '—'}</div>
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
