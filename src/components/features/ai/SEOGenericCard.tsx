/**
 * SEOGenericCard — one renderer for every Wave 1B–3 chunk type.
 *
 * Strategy: each tool emits a chunk with `{ type, ...payload }`. Rather
 * than building 20+ separate React components, this single card detects
 * the chunk shape and picks the right inline mini-renderer. Saves ~2k LoC
 * vs one-card-per-tool and keeps AgentHub.tsx tidy.
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
 *   - seo_dataforseo_raw_card (escape-hatch fallback)
 */

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

function Header({ icon, title, subtitle }: { icon: string; title: string; subtitle?: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-base">{icon}</span>
      <div>
        <div className="text-sm font-medium">{title}</div>
        {subtitle && <div className="text-[11px] text-white/60">{subtitle}</div>}
      </div>
    </div>
  );
}

function Pill({ children, tone }: { children: React.ReactNode; tone?: 'green' | 'amber' | 'red' | 'blue' }) {
  const cls = tone === 'green' ? 'bg-green-500/20 text-green-300'
    : tone === 'amber' ? 'bg-amber-500/20 text-amber-300'
    : tone === 'red' ? 'bg-red-500/20 text-red-300'
    : tone === 'blue' ? 'bg-blue-500/20 text-blue-300'
    : 'bg-white/10';
  return <span className={`text-[11px] rounded-full px-2 py-0.5 ${cls}`}>{children}</span>;
}

function ItemList({ rows, max = 8 }: { rows: Array<{ left: string; right?: string; sub?: string; href?: string }>; max?: number }) {
  return (
    <ul className="space-y-1">
      {rows.slice(0, max).map((r, i) => (
        <li key={i} className="flex justify-between items-baseline gap-2 text-xs bg-white/5 rounded px-2 py-1 border border-white/10">
          {r.href ? (
            <a href={r.href} target="_blank" rel="noopener noreferrer" className="truncate hover:underline flex-1">{r.left}</a>
          ) : (
            <span className="truncate flex-1">{r.left}</span>
          )}
          {r.right && <span className="text-white/60 whitespace-nowrap">{r.right}</span>}
        </li>
      ))}
      {rows.length > max && (
        <li className="text-[10px] text-white/40 px-2">+ {rows.length - max} more</li>
      )}
    </ul>
  );
}

export function SEOGenericCard({ data }: { data: SEOGenericCardData }) {
  const t = data.type;

  // ── Keyword cards ─────────────────────────────────────
  if (t === 'seo_keyword_difficulty_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📊" title="Keyword Difficulty" subtitle={`${items.length} of ${data.keywords_requested} keywords scored · ${data.country}`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.keyword,
          right: it.keyword_difficulty != null ? `${it.keyword_difficulty}/100` : '—',
        }))} max={12} />
      </div>
    );
  }

  if (t === 'seo_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🔎" title={`Keyword Suggestions for "${data.seed}"`} subtitle={`${items.length} results · ${data.country}`} />
        <ItemList rows={items.map((it: any) => {
          const kw = it.keyword_data?.keyword || it.keyword;
          const vol = it.keyword_data?.keyword_info?.search_volume ?? it.search_volume;
          return { left: kw, right: vol != null ? `${fmtNum(vol)} /mo` : '—' };
        })} max={10} />
      </div>
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
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🎯" title="Search Intent Classification" subtitle={`${items.length} keywords classified`} />
        <ul className="space-y-1">
          {items.slice(0, 12).map((it: any, i: number) => {
            const intent = it.keyword_intent?.label || it.keyword_intent_info?.main_intent || '—';
            return (
              <li key={i} className="flex justify-between items-baseline gap-2 text-xs bg-white/5 rounded px-2 py-1 border border-white/10">
                <span className="truncate flex-1">{it.keyword}</span>
                <Pill tone={tone(intent) as any}>{intent}</Pill>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  // ── SERP audit ────────────────────────────────────────
  if (t === 'seo_serp_audit_card') {
    const types = data.types_summary || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🔬" title={`Live SERP — "${data.keyword}"`} subtitle={`${data.country} · ${(data.items || []).length} blocks`} />
        <div className="flex flex-wrap gap-1">
          {Object.entries(types).map(([k, v]: any) => (
            <Pill key={k}>{k} · {v}</Pill>
          ))}
        </div>
      </div>
    );
  }

  // ── URL audit ─────────────────────────────────────────
  if (t === 'seo_url_audit_card') {
    const lh = data.sections?.lighthouse?.items?.[0];
    const cats = lh?.categories || {};
    const ip = data.sections?.instant_page?.items?.[0];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3">
        <Header icon="🌡" title="URL Audit" subtitle={data.url} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {['performance', 'accessibility', 'best-practices', 'seo'].map((k) => {
            const score = Math.round((cats[k]?.score ?? 0) * 100);
            const tone: any = score >= 90 ? 'green' : score >= 70 ? 'amber' : 'red';
            return (
              <div key={k} className="bg-white/5 rounded p-2 border border-white/10">
                <div className="text-[10px] text-white/60">{k.replace('-', ' ')}</div>
                <div className="text-2xl font-medium leading-tight">
                  <Pill tone={tone}>{cats[k]?.score != null ? score : '—'}</Pill>
                </div>
              </div>
            );
          })}
        </div>
        {ip?.meta && (
          <div className="text-[11px] text-white/60">
            <div>Title: {ip.meta.title}</div>
            <div>Words: {fmtNum(ip.page_metrics?.onpage_score?.value)}</div>
          </div>
        )}
      </div>
    );
  }

  // ── Domain snapshot ───────────────────────────────────
  if (t === 'seo_domain_snapshot_card') {
    const it: any = (data.items || [])[0] || {};
    const m = it.metrics?.organic || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🌐" title={`Domain Snapshot — ${data.domain}`} subtitle={data.country || ''} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><div className="text-[10px] text-white/60">Ranking kw</div><div className="text-sm font-medium">{fmtNum(m.count)}</div></div>
          <div><div className="text-[10px] text-white/60">Est. traffic</div><div className="text-sm font-medium">{fmtNum(m.etv)}</div></div>
          <div><div className="text-[10px] text-white/60">Domain rank</div><div className="text-sm font-medium">{it.metrics_info?.rank ?? '—'}</div></div>
          <div><div className="text-[10px] text-white/60">Backlinks</div><div className="text-sm font-medium">{fmtNum(it.backlinks_info?.backlinks)}</div></div>
        </div>
      </div>
    );
  }

  if (t === 'seo_ranked_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📈" title={`Top Ranking Keywords — ${data.domain}`} subtitle={`${items.length} keywords`} />
        <ItemList rows={items.map((it: any) => {
          const rank = it.ranked_serp_element?.serp_item?.rank_absolute;
          const vol = it.keyword_data?.keyword_info?.search_volume;
          return {
            left: `#${rank ?? '?'} · ${it.keyword_data?.keyword}`,
            right: vol ? `${fmtNum(vol)} /mo` : '—',
          };
        })} max={12} />
      </div>
    );
  }

  if (t === 'seo_domain_competitors_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="⚔️" title={`Competitors — ${data.domain}`} subtitle={`${items.length} domains`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.domain,
          right: `${fmtNum(it.intersections)} shared kw`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_keyword_gap_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🎯" title={'Keyword Gap'} subtitle={`${data.your_domain} vs ${data.competitor_domain} · ${items.length} gaps`} />
        <ItemList rows={items.map((it: any) => {
          const rank = it.second_domain_serp_element?.rank_absolute;
          const vol = it.keyword_data?.keyword_info?.search_volume;
          return {
            left: it.keyword_data?.keyword,
            right: `comp #${rank ?? '?'} · ${vol ? fmtNum(vol) + '/mo' : '—'}`,
          };
        })} max={12} />
      </div>
    );
  }

  if (t === 'seo_traffic_estimation_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🚦" title="Traffic Estimation" subtitle={`${items.length} domains · ${data.country || ''}`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.target,
          right: `${fmtNum(it.metrics?.organic?.etv)} organic / mo`,
        }))} max={10} />
      </div>
    );
  }

  // ── Backlinks ─────────────────────────────────────────
  if (t === 'seo_backlinks_summary_card') {
    const s = data.summary || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🔗" title={`Backlinks — ${data.target}`} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><div className="text-[10px] text-white/60">Backlinks</div><div className="text-sm font-medium">{fmtNum(s.backlinks)}</div></div>
          <div><div className="text-[10px] text-white/60">Referring</div><div className="text-sm font-medium">{fmtNum(s.referring_domains)}</div></div>
          <div><div className="text-[10px] text-white/60">Rank</div><div className="text-sm font-medium">{s.rank ?? '—'}</div></div>
          <div><div className="text-[10px] text-white/60">Spam score</div><div className="text-sm font-medium">{s.spam_score ?? '—'}</div></div>
        </div>
      </div>
    );
  }

  if (t === 'seo_backlinks_anchors_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="⚓" title={`Top Anchor Texts — ${data.target}`} />
        <ItemList rows={items.map((a: any) => ({
          left: a.anchor || '(empty anchor)',
          right: `${fmtNum(a.backlinks)} links`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_referring_domains_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🌍" title={`Referring Domains — ${data.target}`} subtitle={`${items.length} domains`} />
        <ItemList rows={items.map((d: any) => ({
          left: d.domain,
          right: `rank ${d.rank ?? '—'} · ${fmtNum(d.backlinks)} links`,
        }))} max={10} />
      </div>
    );
  }

  // ── Site crawl ────────────────────────────────────────
  if (t === 'seo_site_crawl_started_card') {
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🕷" title={`Site Crawl Started — ${data.target}`} subtitle={`up to ${data.max_pages} pages · task ${(data.task_id || '').slice(0, 16)}`} />
        <div className="text-[11px] text-white/60">Use seo_site_crawl_status with the task_id to poll for completion.</div>
      </div>
    );
  }

  if (t === 'seo_site_crawl_status_card') {
    const s = data.summary || {};
    const ready = data.status === 'finished';
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon={ready ? '✅' : '⏳'} title={`Crawl ${data.status}`} subtitle={`task ${(data.task_id || '').slice(0, 16)}`} />
        {ready && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div><div className="text-[10px] text-white/60">Pages</div><div className="text-sm font-medium">{fmtNum(s.crawl_progress?.pages_crawled)}</div></div>
            <div><div className="text-[10px] text-white/60">Internal links</div><div className="text-sm font-medium">{fmtNum(s.page_metrics?.links_internal)}</div></div>
            <div><div className="text-[10px] text-white/60">Broken links</div><div className="text-sm font-medium">{fmtNum(s.page_metrics?.broken_links)}</div></div>
            <div><div className="text-[10px] text-white/60">Duplicate titles</div><div className="text-sm font-medium">{fmtNum(s.page_metrics?.duplicate_title)}</div></div>
          </div>
        )}
      </div>
    );
  }

  // ── Content / domain analytics ────────────────────────
  if (t === 'seo_sentiment_card') {
    const d = data.distribution || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="❤️" title={`Sentiment — "${data.keyword}"`} />
        <div className="grid grid-cols-3 gap-2">
          <div><div className="text-[10px] text-green-400">Positive</div><div className="text-sm font-medium">{fmtPct(d.positive)}</div></div>
          <div><div className="text-[10px] text-white/60">Neutral</div><div className="text-sm font-medium">{fmtPct(d.neutral)}</div></div>
          <div><div className="text-[10px] text-red-400">Negative</div><div className="text-sm font-medium">{fmtPct(d.negative)}</div></div>
        </div>
      </div>
    );
  }

  if (t === 'seo_domain_tech_card') {
    const tech: Record<string, any> = data.technologies || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🛠" title={`Tech Stack — ${data.domain}`} />
        <div className="flex flex-wrap gap-1">
          {Object.keys(tech).slice(0, 16).map((k) => <Pill key={k}>{k}</Pill>)}
        </div>
      </div>
    );
  }

  // ── Multi-engine SERP ─────────────────────────────────
  if (t === 'seo_youtube_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="▶️" title={`YouTube — "${data.keyword}"`} subtitle={`${items.length} videos`} />
        <ItemList rows={items.map((v: any) => ({
          left: v.title,
          right: `${fmtNum(v.views)} views`,
          href: v.url,
        }))} max={8} />
      </div>
    );
  }

  if (t === 'seo_local_pack_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📍" title={`Local Pack — "${data.keyword}"`} subtitle={`${items.length} places`} />
        <ItemList rows={items.map((p: any) => ({
          left: p.title,
          right: p.rating?.value ? `★${p.rating.value} (${p.rating.votes_count || 0})` : '—',
          sub: p.address,
        }))} max={6} />
      </div>
    );
  }

  if (t === 'seo_trends_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📉" title={'Google Trends'} subtitle={(data.keywords || []).join(', ')} />
        <div className="text-[11px] text-white/60">{items.length} time-series buckets returned. Drill into the conversation for details.</div>
      </div>
    );
  }

  // ── LLM mentions ──────────────────────────────────────
  if (t === 'seo_llm_mentions_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🤖" title={`LLM Mentions — "${data.keyword}"`} subtitle={`${items.length} pages cited by LLMs`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.title || it.url,
          right: it.domain,
          href: it.url,
        }))} max={8} />
      </div>
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
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-3">
        <Header icon="🔍" title={`Site Review — ${data.domain}`} subtitle={data.country || ''} />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div><div className="text-[10px] text-white/60">Ranking kw</div><div className="text-sm font-medium">{fmtNum(dr.count)}</div></div>
          <div><div className="text-[10px] text-white/60">Est. traffic</div><div className="text-sm font-medium">{fmtNum(dr.etv)}</div></div>
          <div><div className="text-[10px] text-white/60">Referring</div><div className="text-sm font-medium">{fmtNum(bs.referring_domains)}</div></div>
          <div><div className="text-[10px] text-white/60">Backlinks</div><div className="text-sm font-medium">{fmtNum(bs.backlinks)}</div></div>
        </div>
        {rk.length > 0 && (
          <div>
            <div className="text-[11px] text-white/60 mb-1">Top ranking keywords</div>
            <ItemList rows={rk.map((it: any) => ({
              left: `#${it.ranked_serp_element?.serp_item?.rank_absolute ?? '?'} · ${it.keyword_data?.keyword}`,
              right: fmtNum(it.keyword_data?.keyword_info?.search_volume) + '/mo',
            }))} max={5} />
          </div>
        )}
        {cp.length > 0 && (
          <div>
            <div className="text-[11px] text-white/60 mb-1">Top competitors</div>
            <div className="flex flex-wrap gap-1">
              {cp.slice(0, 6).map((c: any) => <Pill key={c.domain}>{c.domain}</Pill>)}
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Brand-search audit ────────────────────────────────
  if (t === 'seo_brand_audit_card') {
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🛡" title={`Brand Search — "${data.brand_name}"`} />
        <div className="flex flex-wrap gap-1">
          <Pill tone={data.kp_present ? 'green' : 'amber'}>
            Knowledge Panel: {data.kp_present ? 'present' : 'missing'}
          </Pill>
          <Pill tone={data.ai_overview_present ? 'green' : 'amber'}>
            AI Overview: {data.ai_overview_present ? 'present' : 'absent'}
          </Pill>
          <Pill>{(data.organic_top || []).length} organic listings</Pill>
        </div>
      </div>
    );
  }

  // ── Phase 12+ niche cards ─────────────────────────────
  if (t === 'seo_amazon_asin_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📦" title={`Amazon ASIN — ${data.asin}`} subtitle={`${items.length} ranked keywords`} />
        <ItemList rows={items.map((it: any) => ({
          left: `#${it.ranked_serp_element?.serp_item?.rank_absolute ?? '?'} · ${it.keyword_data?.keyword}`,
          right: `${fmtNum(it.keyword_data?.keyword_info?.search_volume)}/mo`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_app_keywords_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📱" title={`${data.store === 'google_play' ? 'Google Play' : 'App Store'} — ${data.app_id}`} subtitle={`${items.length} keywords`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.keyword_data?.keyword,
          right: `${fmtNum(it.keyword_data?.keyword_info?.search_volume)}/mo`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_trustpilot_search_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="⭐" title={`Trustpilot — "${data.keyword}"`} subtitle={`${items.length} listings`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.title || it.domain,
          right: it.rating != null ? `${it.rating}★ (${fmtNum(it.reviews_count)})` : '—',
          href: it.url,
        }))} max={6} />
      </div>
    );
  }

  if (t === 'seo_pinterest_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📌" title={`Pinterest — "${data.keyword}"`} subtitle={`${items.length} pins`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.title || it.description?.slice(0, 60) || '(no title)',
          right: it.author || '',
          href: it.url,
        }))} max={6} />
      </div>
    );
  }

  if (t === 'seo_reddit_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="👥" title={`Reddit — "${data.keyword}"`} subtitle={`${items.length} threads`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.title,
          right: it.subreddit || '',
          href: it.url,
        }))} max={6} />
      </div>
    );
  }

  if (t === 'seo_whois_card') {
    const it: any = data.item || {};
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🪪" title={`WHOIS — ${data.domain}`} />
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div><div className="text-[10px] text-white/60">Registered</div><div>{it.created_datetime?.slice(0, 10) || '—'}</div></div>
          <div><div className="text-[10px] text-white/60">Expires</div><div>{it.expiration_datetime?.slice(0, 10) || '—'}</div></div>
          <div><div className="text-[10px] text-white/60">Registrar</div><div>{it.registrar || '—'}</div></div>
          <div><div className="text-[10px] text-white/60">First seen</div><div>{it.first_seen?.slice(0, 10) || '—'}</div></div>
        </div>
      </div>
    );
  }

  if (t === 'seo_subdomains_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🌳" title={`Subdomains — ${data.domain}`} subtitle={`${items.length} found`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.subdomain,
          right: `${fmtNum(it.metrics?.organic?.count)} kw · ${fmtNum(it.metrics?.organic?.etv)} traffic`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_relevant_pages_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📄" title={`Top Pages — ${data.domain}`} subtitle={`${items.length} pages`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.page_address,
          right: `${fmtNum(it.metrics?.organic?.count)} kw`,
          href: it.page_address,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_historical_serps_card') {
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🕒" title={`Historical SERPs — "${data.keyword}"`} subtitle={`${(data.items || []).length} snapshots`} />
        <div className="text-[11px] text-white/60">SERP snapshots returned. Drill into the conversation for ranking-history detail.</div>
      </div>
    );
  }

  if (t === 'seo_keyword_overview_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="📊" title="Keyword Overview" subtitle={`${items.length} keywords`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.keyword,
          right: `${fmtNum(it.keyword_info?.search_volume)}/mo · KD ${it.keyword_properties?.keyword_difficulty ?? '—'}`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_ai_keyword_volume_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🤖" title="AI Search Volume" subtitle={`${items.length} keywords (LLM-search)`} />
        <ItemList rows={items.map((it: any) => ({
          left: it.keyword,
          right: `${fmtNum(it.ai_search_volume)} /mo`,
        }))} max={10} />
      </div>
    );
  }

  if (t === 'seo_categories_card') {
    const items: any[] = data.items || [];
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="🏷" title={`Categories — ${data.domain}`} />
        <div className="flex flex-wrap gap-1">
          {items.slice(0, 16).map((it: any, i: number) => (
            <Pill key={i}>{it.category_name || it.name}</Pill>
          ))}
        </div>
      </div>
    );
  }

  // ── Escape-hatch raw ──────────────────────────────────
  if (t === 'seo_dataforseo_raw_card') {
    return (
      <div className="bg-white/5 rounded-lg p-4 border border-white/10 space-y-2">
        <Header icon="⚙️" title={`DataForSEO call: ${data.kind}`} subtitle={`${(data.items || []).length} items · $${(data.cost_usd || 0).toFixed(4)} · ${data.latency_ms}ms`} />
        <details className="text-[11px] text-white/70">
          <summary className="cursor-pointer">Show first 3 items</summary>
          <pre className="text-[10px] mt-1 max-h-40 overflow-auto whitespace-pre-wrap">
            {JSON.stringify((data.items || []).slice(0, 3), null, 2)}
          </pre>
        </details>
      </div>
    );
  }

  // ── Fallback ──────────────────────────────────────────
  return (
    <div className="bg-white/5 rounded-lg p-4 border border-white/10 text-xs text-white/60">
      <div className="font-medium">{data.type}</div>
      <pre className="text-[10px] mt-1 max-h-32 overflow-auto">{JSON.stringify(data, null, 2)}</pre>
    </div>
  );
}
