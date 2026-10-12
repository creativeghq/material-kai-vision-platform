/** Update article: re-check an existing article against its linked pages and the calendar, propose replacements. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { refundStage, reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';
import { loadOwnedArticle } from './article-access.ts';
import { serpValue } from './untrusted.ts';
import { hostOf, pageFacts, siteLinkUrls, trimSlash } from './site-assets.ts';
import { sitePagesBlock, sitePagesDataLines } from './site-pages.ts';
import { checkCoverage, type CoverageReport } from './coverage.ts';
import {
  basisOf, mergeSuggestions, pickSuggestionItems, storedSuggestions, validateSuggestion,
  type ArticleSuggestion, type SuggestionItem,
} from './suggestion-rules.ts';
import { findOutdated, type LinkedPageState } from './update-rules.ts';

export const UPDATE_MODEL = 'claude-sonnet-5';
const MAX_INPUT_TOKENS = 30000;
const MAX_OUTPUT_TOKENS = 6000;
const MAX_LINKED_PAGES = 20;

const SCHEMA = {
  type: 'object',
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'integer' },
          title: { type: 'string' },
          anchor: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['item', 'title', 'anchor', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['updates'],
  additionalProperties: false,
};

type Extra = Record<string, unknown>;

interface ArticleMeta {
  website_id: string | null;
  keyword_research_id: string | null;
}

async function linkedPageStates(supabase: DbClient, meta: ArticleMeta, extra: Extra, markdown: string): Promise<LinkedPageState[]> {
  if (!meta.website_id) return [];
  const { data: site } = await supabase.from('user_websites').select('url').eq('id', meta.website_id).maybeSingle();
  const host = typeof site?.url === 'string' ? hostOf(site.url) : null;
  const targets = Array.isArray(extra.site_link_targets) ? extra.site_link_targets as { url?: unknown }[] : [];
  const urls = [...new Set([
    ...targets.map((t) => (typeof t?.url === 'string' ? trimSlash(t.url) : '')),
    ...(host ? siteLinkUrls(markdown, host).map(trimSlash) : []),
  ].filter(Boolean))].slice(0, MAX_LINKED_PAGES);
  if (!urls.length) return [];
  const { data, error } = await supabase
    .from('user_website_pages')
    .select('url, title, content_text, is_active')
    .eq('website_id', meta.website_id)
    .in('url', urls.flatMap((u) => [u, `${u}/`]));
  if (error) throw new Error(`Could not read the linked pages: ${error.message}`);
  return ((data ?? []) as { url: string; title: string | null; content_text: string | null; is_active: boolean | null }[])
    .map((p) => ({ url: trimSlash(p.url), title: p.title, content: p.content_text, live: p.is_active !== false }));
}

function itemsBlock(items: SuggestionItem[]): string {
  return items.map((it, i) =>
    `${i + 1}. Statement: ${serpValue(it.anchor, 2000)}\n   Why it may be out of date: ${serpValue(it.detail ?? '', 600)}`).join('\n');
}

async function refreshedCoverage(
  supabase: DbClient, articleId: string, meta: ArticleMeta, extra: Extra, markdown: string,
  userId: string, workspaceId: string | null,
): Promise<CoverageReport | null> {
  const { data: checks, error } = await supabase
    .from('seo_article_answer_checks')
    .select('answer_text, checked_at')
    .eq('article_id', articleId)
    .eq('status', 'ok')
    .order('checked_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(`Could not read the answer checks: ${error.message}`);
  const check = checks?.[0] as { answer_text: string | null; checked_at: string } | undefined;
  const coveredAt = (extra.coverage as { checked_at?: unknown } | undefined)?.checked_at;
  if (!check?.answer_text || (typeof coveredAt === 'string' && coveredAt >= check.checked_at)) return null;
  const { data: research } = meta.keyword_research_id
    ? await supabase.from('seo_keyword_research').select('research_data').eq('id', meta.keyword_research_id).maybeSingle()
    : { data: null };
  return checkCoverage(supabase, {
    text: markdown,
    mustCover: {
      aiAnswer: check.answer_text,
      questions: ((research?.research_data as { readerQuestions?: string[] } | null)?.readerQuestions) ?? [],
      guideSections: [],
      paa: [],
    },
    languageCode: typeof extra.language_code === 'string' ? extra.language_code : null,
    userId, workspaceId,
  });
}

export async function handleUpdateArticle(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId;

  let wallet: StageWallet | null = null;
  let reserved = 0;
  try {
    const articleId = typeof body.article_id === 'string' ? body.article_id : null;
    if (!articleId) return jsonResponse({ success: false, error: 'article_id is required' }, 400);
    const loaded = await loadOwnedArticle(supabase, userId, articleId);
    if ('response' in loaded) return loaded.response;
    const article = loaded.article;
    const markdown = article.markdown_content ?? '';
    if (!markdown.trim()) return jsonResponse({ success: false, error: 'This article has no content yet.' }, 409);

    const { workspaceId, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId);
    if (entResponse) return entResponse;

    const { data: metaRow, error: metaErr } = await supabase.from('seo_articles').select('website_id').eq('id', articleId).single();
    if (metaErr) throw new Error(`Could not read the article: ${metaErr.message}`);
    const extra = ((article.stages_data as { extra?: Extra } | null)?.extra ?? {}) as Extra;
    const meta: ArticleMeta = {
      website_id: (metaRow as { website_id: string | null }).website_id,
      keyword_research_id: typeof extra.keyword_research_id === 'string' ? extra.keyword_research_id : null,
    };
    const { data: freshness, error: freshErr } = await supabase
      .from('seo_article_freshness')
      .select('is_due, refresh_interval_days')
      .eq('article_id', articleId)
      .maybeSingle();
    if (freshErr) throw new Error(`Could not read the article's refresh schedule: ${freshErr.message}`);
    const due = (freshness ?? null) as { is_due: boolean | null; refresh_interval_days: number | null } | null;

    const pages = await linkedPageStates(supabase, meta, extra, markdown);
    const { checked, outdated } = findOutdated({
      markdown, pages, now: new Date(),
      refreshDue: due?.is_due === true,
      intervalDays: due?.refresh_interval_days ?? null,
    });
    const existing = storedSuggestions(extra.suggestions);
    const items = pickSuggestionItems(
      outdated.map((o) => ({ source: 'update' as const, point: o.sentence, anchor: o.sentence, detail: o.reasons.join('; ') })),
      markdown,
      existing,
    );

    let updateCredits = 0;
    let actual: number | null = null;
    const fresh: ArticleSuggestion[] = [];
    const dropped: { item: number; reason: string }[] = [];
    if (items.length) {
      const named = new Set(outdated.filter((o) => items.some((i) => i.anchor === o.sentence)).flatMap((o) => o.pages));
      const facts = pages.filter((p) => named.has(p.url) && p.live)
        .map((p) => ({ url: p.url, title: p.title, description: null, facts: pageFacts(p.content), similarity: 1, images: [] }));
      const languageCode = typeof extra.language_code === 'string' ? extra.language_code : 'en';
      const today = new Date().toISOString().slice(0, 10);

      wallet = { userId, workspaceId: workspaceId ?? null, opType: 'seo_update' };
      const ceiling = await tokenCeiling(supabase, UPDATE_MODEL, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, 20);
      const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article update', { article_id: articleId, items: items.length });
      if (!hold.ok) return jsonResponse({ success: false, error: hold.error }, 402);
      reserved = ceiling;

      const res = await callClaudeMessages({
        model: UPDATE_MODEL,
        max_tokens: MAX_OUTPUT_TOKENS,
        system: await getToolPrompt(supabase, 'seo_article_updater'),
        messages: [{
          role: 'user',
          content: [
            `Article language: ${languageCode}`,
            `Today: ${today}`,
            `<items>\n${itemsBlock(items)}\n</items>`,
            sitePagesBlock(sitePagesDataLines(facts, 0)),
            `<article>\n${markdown.replace(/<\/?article>/gi, ' ').slice(0, 60000)}\n</article>`,
          ].join('\n'),
        }],
        output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      }, { task: 'seo_update', userId, workspaceId: workspaceId ?? null, timeoutMs: 130_000 });
      actual = await tokenCredits(supabase, UPDATE_MODEL, {
        inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
      });
      if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
        throw new Error(res.stop_reason === 'refusal'
          ? 'The model declined to review this article — nothing was charged.'
          : 'The review ran past the length limit and was discarded — nothing was charged.');
      }
      const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
      const raw = Array.isArray(out?.updates) ? out.updates : [];

      const now = new Date().toISOString();
      const used = new Set<number>();
      for (const r of raw) {
        const idx = Number(r?.item) - 1;
        const item = items[idx];
        if (!item || used.has(idx)) {
          dropped.push({ item: idx + 1, reason: item ? 'a second proposal for the same item' : 'no such item' });
          continue;
        }
        const proposal = { kind: 'replace' as const, find: String(r.anchor ?? ''), replace: String(r.text ?? '') };
        const why = validateSuggestion(markdown, proposal);
        if (why) {
          dropped.push({ item: idx + 1, reason: why });
          continue;
        }
        used.add(idx);
        fresh.push({
          id: crypto.randomUUID(),
          source: 'update',
          title: String(r.title ?? '').trim().slice(0, 120) || 'Bring up to date',
          ...proposal,
          basis: basisOf(item),
          status: 'pending',
          created_at: now,
        });
      }
      updateCredits = actual === null ? reserved : Math.round(actual * 100) / 100;
    }

    const coverage = await refreshedCoverage(supabase, articleId, meta, extra, markdown, userId, workspaceId ?? null);
    const credits = Math.round((updateCredits + (coverage?.credits ?? 0)) * 100) / 100;
    const reviewedAt = new Date().toISOString();
    const report = { checked, outdated: outdated.length, proposed: fresh.length, credits, pages_read: pages.length, refresh_due: due?.is_due === true };

    // Re-read so a write that landed during the model call is not overwritten; other sources' pending proposals stay.
    const { data: current, error: curErr } = await supabase.from('seo_articles').select('stages_data').eq('id', articleId).single();
    if (curErr) throw new Error(`Could not read the article to save the review: ${curErr.message}`);
    const stages = (current?.stages_data ?? {}) as Record<string, unknown>;
    const curExtra = (stages.extra ?? {}) as Extra;
    const stored = storedSuggestions(curExtra.suggestions);
    const otherPending = stored.filter((s) => s.status === 'pending' && s.source !== 'update');
    const suggestions = [...otherPending, ...mergeSuggestions(stored.filter((s) => !otherPending.includes(s)), fresh, ['update'])];
    const { error: writeErr } = await supabase
      .from('seo_articles')
      .update({
        last_reviewed_at: reviewedAt,
        refresh_notified_at: null,
        stages_data: {
          ...stages,
          extra: {
            ...curExtra,
            suggestions,
            update_report: report,
            ...(coverage && !coverage.failed ? { coverage } : {}),
          },
        },
      })
      .eq('id', articleId);
    if (writeErr) throw new Error(`Could not save the review: ${writeErr.message}`);
    if (wallet && reserved > 0) {
      await settleStage(supabase, wallet, reserved, actual, { article_id: articleId, proposed: fresh.length, dropped: dropped.length });
      reserved = 0;
    }

    return jsonResponse({
      success: true,
      data: {
        suggestions,
        update_report: report,
        last_reviewed_at: reviewedAt,
        dropped,
        coverage_refreshed: !!coverage && !coverage.failed,
        coverage_failed: coverage?.failed ?? null,
        credits_used: credits,
        message: items.length ? undefined : 'Nothing in this article looks out of date against its linked pages and the calendar.',
      },
    });
  } catch (error: any) {
    if (wallet && reserved > 0) await refundStage(supabase, wallet, reserved, String(error?.message ?? error));
    console.error('[seo-update-article] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not review the article' }, 500);
  }
}
