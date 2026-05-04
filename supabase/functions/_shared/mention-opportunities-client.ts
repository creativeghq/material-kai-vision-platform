/**
 * Shared client for the mention-monitoring `/opportunities-stateless` endpoint.
 *
 * Lets SEO-pipeline edge functions (seo-research, etc.) pull SERP-derived
 * signals (AI Overview text, featured-snippet target, PAA, related searches,
 * top organic, video / news / shopping carousels, knowledge-graph presence,
 * paid competitors) for an inline subject — no DB row, no per-user credits,
 * authenticated via the same `x-cron-secret` the cron jobs use.
 *
 * Failure mode: returns null. Callers are expected to log + degrade
 * gracefully — the SEO pipeline must never fail because of this.
 */

import type {
  MentionOpportunity,
  SerpSignalBlob,
} from './seo-types.ts';

interface FetchOpportunitiesParams {
  subjectLabel: string;
  brandName?: string | null;
  aliases?: string[];
  languageCodes?: string[];
  countryCodes?: string[];
  homepageDomain?: string | null;
  /** Subset of opportunity types. Default = all subject-driven types. */
  types?: string[];
  limitPerType?: number;
}

const DEFAULT_TYPES = [
  'keyword_opportunity',
  'pao_question',
  'ai_overview',
  'featured_snippet',
  'related_search',
  'competitor_ranking',
  'video_carousel',
  'news_carousel',
  'knowledge_graph',
  'paid_competitor',
  'shopping_listing',
];

export async function fetchOpportunitiesStateless(
  params: FetchOpportunitiesParams,
): Promise<SerpSignalBlob | null> {
  const backend = Deno.env.get('PYTHON_BACKEND_URL');
  const cronSecret = Deno.env.get('CRON_SECRET');
  if (!backend || !cronSecret) {
    console.warn(
      '[mention-opportunities] PYTHON_BACKEND_URL or CRON_SECRET unset — skipping enrichment',
    );
    return null;
  }
  const url = `${backend.replace(/\/+$/, '')}/api/v1/mention-monitoring/opportunities-stateless`;
  const body = {
    subject_label: params.subjectLabel,
    brand_name: params.brandName || undefined,
    aliases: params.aliases && params.aliases.length ? params.aliases : undefined,
    language_codes: params.languageCodes && params.languageCodes.length ? params.languageCodes : undefined,
    country_codes: params.countryCodes && params.countryCodes.length ? params.countryCodes : undefined,
    homepage_domain: params.homepageDomain || undefined,
    types: params.types || DEFAULT_TYPES,
    limit_per_type: params.limitPerType ?? 5,
    use_llm_summary: false,
  };
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cron-secret': cronSecret,
      },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn(`[mention-opportunities] fetch failed: ${(e as Error).message}`);
    return null;
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    console.warn(`[mention-opportunities] backend ${resp.status}: ${text.slice(0, 200)}`);
    return null;
  }
  let payload: any;
  try {
    payload = await resp.json();
  } catch {
    return null;
  }
  const data = payload?.data;
  if (!data || !Array.isArray(data.opportunities)) {
    return null;
  }
  const opportunities = data.opportunities as MentionOpportunity[];
  return projectOpportunities(opportunities, data.errors || {});
}

/**
 * Walks the opportunity array once and lifts the most-useful per-block
 * projections to the top of the SerpSignalBlob. Downstream stages that
 * just need "what's the AI Overview text?" get O(1) access.
 */
function projectOpportunities(
  opportunities: MentionOpportunity[],
  errors: Record<string, string>,
): SerpSignalBlob {
  const out: SerpSignalBlob = {
    opportunities,
    errors,
    fetchedAt: new Date().toISOString(),
  };

  for (const op of opportunities) {
    const src = op.source || {};
    switch (op.type) {
      case 'ai_overview': {
        out.aiOverviewText = (src.ai_overview_text as string) ?? null;
        const refs = (src.references as Array<Record<string, unknown>>) || [];
        out.aiOverviewReferences = refs.map((r) => ({
          url: r.url as string | undefined,
          domain: r.domain as string | undefined,
          title: r.title as string | undefined,
        }));
        out.aiOverviewBrandMentioned = !!src.brand_mentioned;
        break;
      }
      case 'featured_snippet': {
        out.featuredSnippetTarget = {
          domain: src.current_domain as string | undefined,
          description: src.current_description as string | undefined,
          url: src.current_url as string | undefined,
        };
        break;
      }
      case 'related_search': {
        if (!out.relatedSearches) out.relatedSearches = [];
        const term = src.related_term as string | undefined;
        if (term) out.relatedSearches.push(term);
        break;
      }
      case 'competitor_ranking': {
        if (!out.topCompetitors) out.topCompetitors = [];
        out.topCompetitors.push({
          rank: src.rank as number | undefined,
          domain: (src.domain as string) || '',
          url: src.url as string | undefined,
          title: src.title as string | undefined,
        });
        break;
      }
      case 'video_carousel': {
        out.videoCarouselPresent = !!src.brand_present;
        out.videoCarouselPlatforms = (src.platforms as Record<string, number>) || {};
        break;
      }
      case 'news_carousel': {
        if (!out.newsStories) out.newsStories = [];
        out.newsStories.push({
          source: src.source as string | undefined,
          domain: src.domain as string | undefined,
          url: src.url as string | undefined,
          title: src.title as string | undefined,
        });
        break;
      }
      case 'knowledge_graph': {
        out.knowledgeGraphPresent = !!src.knowledge_graph_present;
        break;
      }
      case 'paid_competitor': {
        if (!out.paidCompetitors) out.paidCompetitors = [];
        out.paidCompetitors.push({
          domain: (src.domain as string) || '',
          rank: src.rank as number | undefined,
          url: src.url as string | undefined,
        });
        break;
      }
      case 'shopping_listing': {
        if (!out.shoppingListings) out.shoppingListings = [];
        out.shoppingListings.push({
          seller: src.seller as string | undefined,
          domain: src.domain as string | undefined,
          price: src.price as number | string | undefined,
          currency: src.currency as string | undefined,
        });
        break;
      }
      case 'pao_question': {
        if (!out.paaAnswers) out.paaAnswers = [];
        const question = src.question as string | undefined;
        // pull the answer snippet if the rationale carries one
        const rationale = op.rationale || '';
        const m = rationale.match(/Current top answer snippet:\s*"([^"]+)"/);
        if (question) {
          out.paaAnswers.push({
            question,
            answerSnippet: m ? m[1] : undefined,
          });
        }
        break;
      }
      case 'keyword_opportunity': {
        if (!out.keywordIntents) out.keywordIntents = {};
        const kw = src.keyword as string | undefined;
        const intent = src.intent as string | undefined;
        if (kw && intent) out.keywordIntents[kw] = intent;
        break;
      }
      default:
        break;
    }
  }
  return out;
}
