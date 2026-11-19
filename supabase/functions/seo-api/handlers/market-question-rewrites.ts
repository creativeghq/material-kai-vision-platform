import { generateStructuredWithClaude, z } from '../../_shared/ai-client.ts';
import { loadPrompt } from '../../_shared/prompt-utils.ts';
import { refundCredits, reserveCredits } from '../../_shared/credit-reserve.ts';
import { wrapUntrusted } from '../../_shared/untrusted.ts';

// deno-lint-ignore no-explicit-any
type Loose = any;
type Status = 'ok' | 'no_data' | 'collector_failed' | 'not_collected';
interface CallOut { ok: boolean; error?: string; items: Loose[]; raw: Loose; cost: number | null }

const MODEL = 'claude-haiku-5-5';
/** Credits reserved per model turn, before the call (invariant 10); refunded when the call fails. */
const TURN_CREDITS = 2;
const OP = 'seo_ai_question_rewrite';
const MAX_TOPICS = 8;
const PER_TERM = 25;
const MAX_QUESTIONS = 60;

const TermsOut = z.object({
  topics: z.array(z.object({ topic: z.string(), english_terms: z.array(z.string()).max(3) })),
});
const RewriteOut = z.object({
  rewrites: z.array(z.object({ index: z.number().int(), keep: z.boolean(), question: z.string() })),
});

export interface RewriteResult { status: Status; note: string | null; metrics: Record<string, unknown> }

async function turn<T>(
  db: Loose, payer: string, workspaceId: string, prompt: string, schema: z.ZodType<T>, system: string,
): Promise<T> {
  const r = await reserveCredits(db, payer, workspaceId, TURN_CREDITS, OP);
  if (!r.ok) throw new Error(r.message || 'not enough credits');
  try {
    const out = await generateStructuredWithClaude(prompt, schema, {
      model: MODEL, systemPrompt: system, maxTokens: 4000, task: OP, userId: payer, workspaceId,
    });
    return out.output;
  } catch (e) {
    await refundCredits(db, payer, workspaceId, TURN_CREDITS, OP, { reason: 'model_call_failed' });
    throw e;
  }
}

/** #592: US ChatGPT questions rewritten for the market; the US volume stays on `translated_from`, never the row. */
export async function collectUsRewrites(
  db: Loose,
  site: { id: string; workspace_id: string },
  market: { country_code: string | null; language_code: string | null },
  topics: string[],
  payer: string | null,
  now: string,
  call: (kind: string, params: Record<string, unknown>) => Promise<CallOut>,
): Promise<RewriteResult> {
  const metrics: Record<string, unknown> = { topics: topics.slice(0, MAX_TOPICS), terms: [], found: 0, stored: 0 };
  if (!market.language_code || market.language_code === 'en') {
    return { status: 'not_collected', note: 'The market already speaks English, so its own corpus is the source.', metrics };
  }
  if (topics.length === 0) return { status: 'not_collected', note: 'No topic is set, so there was nothing to search the US corpus for.', metrics };
  if (!payer) return { status: 'not_collected', note: 'No one to bill for the rewrite, so it was not run.', metrics };

  let system: { terms: string; rewrite: string };
  try {
    system = {
      terms: await loadPrompt(db, 'tool', 'seo_ai_question_topic_terms'),
      rewrite: await loadPrompt(db, 'tool', 'seo_ai_question_rewrite'),
    };
  } catch (e) {
    return { status: 'collector_failed', note: `The rewrite prompts could not be loaded: ${(e as Error).message}`.slice(0, 500), metrics };
  }

  let termsByTopic: { topic: string; english_terms: string[] }[];
  try {
    const out = await turn(db, payer, site.workspace_id,
      `Topics (language ${market.language_code}):\n${wrapUntrusted('topics', topics.slice(0, MAX_TOPICS).join('\n'))}`,
      TermsOut, system.terms);
    const allowed = new Set(topics.map((t) => t.toLowerCase()));
    termsByTopic = out.topics.filter((t) => allowed.has(t.topic.toLowerCase()));
  } catch (e) {
    return { status: 'collector_failed', note: `The topics could not be put into English: ${(e as Error).message}`.slice(0, 500), metrics };
  }
  metrics.terms = termsByTopic;

  const found = new Map<string, { question: string; topic: string; volume: number | null }>();
  const errors: string[] = [];
  for (const t of termsByTopic) {
    for (const term of t.english_terms.slice(0, 3)) {
      const r = await call('ai_llm_mentions_search', {
        keyword: term, keyword_scope: ['question'], language_code: 'en', country_code: 'US',
        platform: 'chat_gpt', limit: PER_TERM, order_by: ['ai_search_volume,desc'],
      });
      if (!r.ok) { errors.push(`${term}: ${r.error ?? 'failed'}`); continue; }
      for (const it of r.items) {
        const q = typeof it?.question === 'string' ? it.question.trim() : '';
        if (q && !found.has(q.toLowerCase())) {
          found.set(q.toLowerCase(), { question: q, topic: t.topic, volume: typeof it?.ai_search_volume === 'number' ? it.ai_search_volume : null });
        }
      }
    }
  }
  const source = [...found.values()].sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0)).slice(0, MAX_QUESTIONS);
  metrics.found = source.length;
  const partial = errors.length ? `${errors.length} US searches failed: ${errors.join('; ')}`.slice(0, 500) : null;
  if (source.length === 0) {
    return errors.length
      ? { status: 'collector_failed', note: partial, metrics }
      : { status: 'no_data', note: 'The US ChatGPT corpus has no question containing these topics.', metrics };
  }

  let rewrites: z.infer<typeof RewriteOut>['rewrites'];
  try {
    const list = source.map((s, i) => `${i}. ${s.question}`).join('\n');
    const out = await turn(db, payer, site.workspace_id,
      `Target market: country ${market.country_code}, language ${market.language_code}.\n${wrapUntrusted('questions', list)}`,
      RewriteOut, system.rewrite);
    rewrites = out.rewrites;
  } catch (e) {
    return { status: 'collector_failed', note: `The questions could not be rewritten: ${(e as Error).message}`.slice(0, 500), metrics };
  }

  const rows = rewrites
    .filter((r) => r.keep && r.question.trim() && Number.isInteger(r.index) && r.index >= 0 && r.index < source.length)
    .map((r) => {
      const s = source[r.index];
      return {
        website_id: site.id, workspace_id: site.workspace_id, platform: 'chat_gpt',
        country_code: market.country_code, language_code: market.language_code,
        question: r.question.trim(), topics: [s.topic], ai_search_volume: null,
        our_sources: [], rival_sources: [], source_count: 0, answer: null, captured_at: now,
        translated_from: { question: s.question, country_code: 'US', language_code: 'en', ai_search_volume: s.volume },
      };
    });
  if (rows.length === 0) return { status: 'no_data', note: 'Every US question found was specific to the US.', metrics };
  const { error } = await db.from('website_ai_market_questions').upsert(rows, {
    onConflict: 'website_id,platform,country_code,language_code,question', ignoreDuplicates: true,
  });
  if (error) return { status: 'collector_failed', note: `The rewrites could not be stored: ${error.message}`.slice(0, 500), metrics };
  metrics.stored = rows.length;
  return { status: 'ok', note: partial, metrics };
}
