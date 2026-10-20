// deno-lint-ignore no-explicit-any
type Loose = any;

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export interface MarketQuestion {
  platform: string; question: string; topics: string[]; ai_search_volume: number | null;
  our_sources: { url: string; title: string | null; position: number | null }[];
  rival_sources: { domain: string; url: string; position: number | null }[];
  source_count: number; answer: string | null;
  first_response_at: string | null; last_response_at: string | null;
}

export function isOurDomain(d: unknown, domain: string): boolean {
  const h = String(d ?? '').toLowerCase().replace(/^www\./, '');
  return h === domain || h.endsWith(`.${domain}`);
}

export function ourSources(sources: Loose[], domain: string): MarketQuestion['our_sources'] {
  return sources.filter((x) => isOurDomain(x?.domain, domain)).map((x) => ({
    url: String(x?.url ?? ''), title: typeof x?.title === 'string' ? x.title : null, position: num(x?.position),
  }));
}

function rivalSources(sources: Loose[], domain: string): MarketQuestion['rival_sources'] {
  const seen = new Set<string>();
  const out: MarketQuestion['rival_sources'] = [];
  for (const x of sources) {
    if (!x?.domain || isOurDomain(x.domain, domain)) continue;
    const host = String(x.domain).toLowerCase().replace(/^www\./, '');
    if (seen.has(host)) continue;
    seen.add(host);
    out.push({ domain: host, url: String(x?.url ?? ''), position: num(x?.position) });
    if (out.length === 8) break;
  }
  return out;
}

/** Folds every topic's corpus answer into one row per question, keeping each topic that found it. */
export function mergeMarketQuestions(
  byTopic: { topic: string; items: Loose[] }[], domain: string, platform: string,
): MarketQuestion[] {
  const out = new Map<string, MarketQuestion>();
  for (const { topic, items } of byTopic) {
    for (const it of items) {
      const question = typeof it?.question === 'string' ? it.question.trim() : '';
      if (!question) continue;
      const key = question.toLowerCase();
      const seen = out.get(key);
      if (seen) {
        if (!seen.topics.includes(topic)) seen.topics.push(topic);
        continue;
      }
      const sources: Loose[] = Array.isArray(it?.sources) ? it.sources : [];
      out.set(key, {
        platform: String(it?.platform ?? platform),
        question,
        topics: [topic],
        ai_search_volume: num(it?.ai_search_volume),
        our_sources: ourSources(sources, domain),
        rival_sources: rivalSources(sources, domain),
        source_count: sources.length,
        answer: typeof it?.answer === 'string' ? it.answer.slice(0, 4000) : null,
        first_response_at: typeof it?.first_response_at === 'string' ? it.first_response_at : null,
        last_response_at: typeof it?.last_response_at === 'string' ? it.last_response_at : null,
      });
    }
  }
  return [...out.values()];
}
