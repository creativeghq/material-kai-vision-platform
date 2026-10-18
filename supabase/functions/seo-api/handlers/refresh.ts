/** Refresh: compare an article with what ranks now and draft changes for approval (#401 W3.2). */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { emitFlowEvent } from '../../_shared/flow-events.ts';
import { runInBackground } from '../../_shared/background.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import type { ArticlePlan, KeywordResearchResult } from '../../_shared/seo-types.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { refundStage, reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';
import { loadOwnedArticle, storedArticlePlan } from './article-access.ts';
import { serpValue } from './untrusted.ts';
import { handleResearch } from './research.ts';
import {
  mergeSuggestions, pickSuggestionItems, storedSuggestions, validateSuggestion, basisOf,
  type ArticleSuggestion, type SuggestionItem,
} from './suggestion-rules.ts';

export const REFRESH_MODEL = 'claude-sonnet-5';
const MAX_INPUT_TOKENS = 40000;
const MAX_OUTPUT_TOKENS = 8000;
const RESEARCH_MAX_AGE_DAYS = 30;

const SCHEMA = {
  type: 'object',
  properties: {
    updates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'integer' },
          kind: { type: 'string', enum: ['insert', 'replace'] },
          title: { type: 'string' },
          anchor: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['item', 'kind', 'title', 'anchor', 'text'],
        additionalProperties: false,
      },
    },
    meta: {
      type: 'object',
      properties: { title: { type: ['string', 'null'] }, description: { type: ['string', 'null'] } },
      required: ['title', 'description'],
      additionalProperties: false,
    },
  },
  required: ['updates', 'meta'],
  additionalProperties: false,
};

type Extra = Record<string, unknown>;
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();

/** The research to compare against: the article's own when recent, else a fresh (or 30-day cached) run. */
async function currentResearch(
  supabase: DbClient, req: Request, extra: Extra, plan: ArticlePlan, userId: string, websiteId: string | null,
): Promise<KeywordResearchResult | null> {
  const id = typeof extra.keyword_research_id === 'string' ? extra.keyword_research_id : null;
  if (id) {
    const { data } = await supabase.from('seo_keyword_research').select('research_data, created_at').eq('id', id).maybeSingle();
    const fresh = data && Date.now() - new Date(String(data.created_at)).getTime() < RESEARCH_MAX_AGE_DAYS * 86_400_000;
    if (fresh && (data.research_data as KeywordResearchResult)?.rankingContent) return data.research_data as KeywordResearchResult;
  }
  const res = await handleResearch(req, {
    topic: plan.title || plan.primaryKeyword,
    target_keyword: plan.primaryKeyword,
    website_id: websiteId,
    user_id: userId,
    ...(typeof extra.language_code === 'string' ? { language_code: extra.language_code } : {}),
  });
  const out = await res.json().catch(() => null);
  if (!out?.success) throw new Error(`Could not research the keyword again: ${out?.error ?? `HTTP ${res.status}`}`);
  return out.data.research as KeywordResearchResult;
}

/** Newer pages of ours worth linking: the topic-plan group and articles published after this one. */
async function newerPages(
  supabase: DbClient, websiteId: string | null, articleId: string, keyword: string, publishedAt: string | null, markdown: string,
): Promise<{ url: string; title: string }[]> {
  if (!websiteId) return [];
  const out = new Map<string, string>();
  const { data: articles } = await supabase
    .from('seo_articles').select('id, title, published_url, published_at')
    .eq('website_id', websiteId).neq('id', articleId).not('published_url', 'is', null)
    .gte('published_at', publishedAt ?? '1970-01-01').limit(10);
  for (const a of (articles ?? []) as { title: string | null; published_url: string }[]) out.set(a.published_url, a.title ?? a.published_url);
  const { data: self } = await supabase.from('seo_topic_clusters').select('id, pillar_cluster_id')
    .eq('website_id', websiteId).ilike('primary_keyword', keyword.trim().replace(/[%_\\]/g, (c) => `\\${c}`)).maybeSingle();
  if (self) {
    const group = (self as { pillar_cluster_id: string | null; id: string }).pillar_cluster_id ?? (self as { id: string }).id;
    const { data: siblings } = await supabase.from('seo_topic_cluster_board').select('id, primary_keyword, published_url')
      .eq('website_id', websiteId).or(`id.eq.${group},pillar_cluster_id.eq.${group}`).not('published_url', 'is', null).limit(6);
    for (const s of (siblings ?? []) as { primary_keyword: string; published_url: string }[]) out.set(s.published_url, s.primary_keyword);
  }
  return [...out.entries()].filter(([url]) => !markdown.includes(url)).map(([url, title]) => ({ url, title })).slice(0, 4);
}

function gapItems(markdown: string, research: KeywordResearchResult, links: { url: string; title: string }[]): SuggestionItem[] {
  const items: SuggestionItem[] = [];
  const rc = research.rankingContent;
  const headings = [...markdown.matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => norm(m[1]));
  const body = norm(markdown);
  const covered = (label: string) => {
    const l = norm(label);
    return !!l && (headings.some((h) => h.includes(l) || l.includes(h)) || body.includes(l));
  };
  if (rc && rc.read > 0) {
    const majority = Math.max(2, Math.ceil(rc.read / 2));
    for (const c of rc.common.filter((c) => c.pages >= majority && !covered(c.label)).slice(0, 4)) {
      items.push({ source: 'refresh', point: `The ranking pages have a section on "${c.label}" (${c.pages} of ${rc.read}); this article has none.`, detail: 'missing section' });
    }
    const terms = (rc.guidelines?.terms ?? []).filter((t) => t.pagesUsing >= majority && !body.includes(norm(t.term))).slice(0, 8);
    if (terms.length >= 3) {
      items.push({ source: 'refresh', point: `Most ranking pages use these terms and the article does not: ${terms.map((t) => t.term).join(', ')}.`, detail: 'missing terms' });
    }
  }
  const questions = [...(rc?.guidelines?.questions ?? []), ...(research.readerQuestions ?? [])];
  for (const q of questions.filter((q) => !covered(q)).slice(0, 3)) {
    items.push({ source: 'refresh', point: `Readers ask "${q}" and the article does not answer it.`, detail: 'unanswered question' });
  }
  for (const l of links) {
    items.push({ source: 'refresh', point: `Link our newer page "${l.title}" (${l.url}) where it helps the reader.`, detail: 'new internal link' });
  }
  return items;
}

export async function handleRefresh(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  if (body.background === true && auth.level === 'secret') {
    await runInBackground(runRefresh(req, body, userId), `seo-refresh:${body.article_id}`);
    return jsonResponse({ success: true, data: { accepted: true } }, 202);
  }
  return runRefresh(req, body, userId);
}

async function runRefresh(req: Request, body: any, userId: string): Promise<Response> {
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');

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
    const plan = storedArticlePlan(article) as ArticlePlan | null;
    if (!plan?.primaryKeyword) return jsonResponse({ success: false, error: 'This article has no stored plan, so it cannot be refreshed.' }, 409);

    const { workspaceId, response: entResponse } = await resolveAndAssertSeoEntitled(supabase, userId, article.workspace_id ?? null);
    if (entResponse) return entResponse;

    const { data: row, error: rowErr } = await supabase.from('seo_articles')
      .select('website_id, title, meta_description, published_at, publish_external_id').eq('id', articleId).single();
    if (rowErr) throw new Error(`Could not read the article: ${rowErr.message}`);
    const { data: fresh } = await supabase.from('seo_article_freshness').select('due_reason').eq('article_id', articleId).maybeSingle();
    const reason = typeof body.reason === 'string' ? body.reason : (fresh as { due_reason?: string | null } | null)?.due_reason ?? null;
    const extra = ((article.stages_data as { extra?: Extra } | null)?.extra ?? {}) as Extra;
    const languageCode = typeof extra.language_code === 'string' ? extra.language_code : 'en';

    const research = await currentResearch(supabase, req, extra, plan, userId, row.website_id);
    if (!research) throw new Error('No research to compare against.');
    const links = await newerPages(supabase, row.website_id, articleId, plan.primaryKeyword, row.published_at, markdown);
    const existing = storedSuggestions(extra.suggestions);
    const items = pickSuggestionItems(gapItems(markdown, research, links), markdown, existing);
    if (!items.length) {
      return jsonResponse({ success: true, data: { proposed: 0, credits_used: 0, message: 'The article already covers what the ranking pages cover, and links our newer pages.' } });
    }

    wallet = { userId, workspaceId: workspaceId ?? null, opType: 'seo_refresh' };
    const ceiling = await tokenCeiling(supabase, REFRESH_MODEL, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, 20);
    const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article refresh', { article_id: articleId, items: items.length });
    if (!hold.ok) return jsonResponse({ success: false, error: hold.error }, 402);
    reserved = ceiling;

    const res = await callClaudeMessages({
      model: REFRESH_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_article_refresher'),
      messages: [{
        role: 'user',
        content: [
          `Article language: ${languageCode}`,
          `Today: ${new Date().toISOString().slice(0, 10)}`,
          `Flagged because: ${reason ?? 'asked by hand'}`,
          `Current title: ${serpValue(row.title ?? plan.title ?? '', 200)}`,
          `Current meta description: ${serpValue(row.meta_description ?? '', 400)}`,
          `<items>\n${items.map((it, i) => `${i + 1}. ${serpValue(it.point, 1200)}`).join('\n')}\n</items>`,
          `<article>\n${markdown.replace(/<\/?article>/gi, ' ').slice(0, 60000)}\n</article>`,
        ].join('\n'),
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_refresh', userId, workspaceId: workspaceId ?? null, timeoutMs: 130_000 });
    const actual = await tokenCredits(supabase, REFRESH_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      throw new Error(res.stop_reason === 'refusal'
        ? 'The model declined to refresh this article — nothing was charged.'
        : 'The refresh ran past the length limit and was discarded — nothing was charged.');
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');

    const now = new Date().toISOString();
    const drafted: ArticleSuggestion[] = [];
    const dropped: { item: number; reason: string }[] = [];
    const used = new Set<number>();
    for (const r of (Array.isArray(out?.updates) ? out.updates : [])) {
      const idx = Number(r?.item) - 1;
      const item = items[idx];
      if (!item || used.has(idx)) { dropped.push({ item: idx + 1, reason: item ? 'a second change for the same item' : 'no such item' }); continue; }
      const proposal = r.kind === 'insert'
        ? { kind: 'insert' as const, after: String(r.anchor ?? ''), markdown: String(r.text ?? '') }
        : { kind: 'replace' as const, find: String(r.anchor ?? ''), replace: String(r.text ?? '') };
      const why = validateSuggestion(markdown, proposal);
      if (why) { dropped.push({ item: idx + 1, reason: why }); continue; }
      used.add(idx);
      drafted.push({
        id: crypto.randomUUID(), source: 'refresh', title: String(r.title ?? '').trim().slice(0, 120) || 'Refresh',
        ...proposal, basis: basisOf(item), status: 'pending', created_at: now,
      });
    }

    const metaTitle = typeof out?.meta?.title === 'string' && out.meta.title.trim() && out.meta.title.trim() !== row.title ? out.meta.title.trim().slice(0, 70) : null;
    const metaDesc = typeof out?.meta?.description === 'string' && out.meta.description.trim() && out.meta.description.trim() !== row.meta_description
      ? out.meta.description.trim().slice(0, 170) : null;
    const metaProposal = metaTitle || metaDesc ? { title: metaTitle, description: metaDesc, proposed_at: now, status: 'pending' as string } : null;

    const { data: current, error: curErr } = await supabase.from('seo_articles').select('stages_data').eq('id', articleId).single();
    if (curErr) throw new Error(`Could not read the article to save the refresh: ${curErr.message}`);
    const stages = (current?.stages_data ?? {}) as Record<string, unknown>;
    const curExtra = (stages.extra ?? {}) as Extra;
    const stored = storedSuggestions(curExtra.suggestions);
    const otherPending = stored.filter((s) => s.status === 'pending' && s.source !== 'refresh');
    const suggestions = [...otherPending, ...mergeSuggestions(stored.filter((s) => !otherPending.includes(s)), drafted, ['refresh'])];

    let metaApplied = false;
    if (metaProposal) metaApplied = await maybeAutoApplyMeta(supabase, { articleId, userId, workspaceId, row, metaProposal });

    const report = { ran_at: now, reason, items: items.length, proposed: drafted.length, dropped, meta_proposed: !!metaProposal, meta_applied: metaApplied };
    const { error: writeErr } = await supabase.from('seo_articles').update({
      refresh_notified_at: null,
      stages_data: {
        ...stages,
        extra: {
          ...curExtra,
          suggestions,
          refresh_report: report,
          ...(metaProposal ? { refresh_meta: { ...metaProposal, status: metaApplied ? 'applied' : 'pending' } } : {}),
        },
      },
    }).eq('id', articleId);
    if (writeErr) throw new Error(`Could not save the refresh: ${writeErr.message}`);
    await settleStage(supabase, wallet, reserved, actual, { article_id: articleId, proposed: drafted.length });
    reserved = 0;

    if (drafted.length || metaProposal) {
      await emitFlowEvent('seo.refresh_ready', {
        user_id: article.user_id ?? userId,
        workspace_id: article.workspace_id,
        title: `Refresh ready: "${row.title ?? plan.primaryKeyword}"`,
        body: `${drafted.length} change${drafted.length === 1 ? '' : 's'} drafted${metaProposal ? (metaApplied ? ', new title/meta applied' : ', new title/meta proposed') : ''}. Review them in the article.`,
        action_url: row.website_id ? `/websites/${row.website_id}?section=articles` : '/profile?tab=websites',
        type: 'info',
        article_id: articleId,
        article_title: row.title,
        target_keyword: plan.primaryKeyword,
        due_reason: reason,
        proposals: drafted.length,
        meta_applied: metaApplied,
      }).catch((e: unknown) => console.warn('[seo-refresh] event not emitted:', e instanceof Error ? e.message : String(e)));
    }

    return jsonResponse({ success: true, data: { ...report, suggestions, credits_used: actual ?? 0 } });
  } catch (error: any) {
    if (wallet && reserved > 0) await refundStage(supabase, wallet, reserved, String(error?.message ?? error));
    console.error('[seo-refresh] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not refresh the article' }, 500);
  }
}

/** Meta-only changes publish on their own only when the workspace allows it and the article is live on its CMS. */
async function maybeAutoApplyMeta(
  supabase: DbClient,
  ctx: {
    articleId: string; userId: string; workspaceId: string | null;
    row: { publish_external_id: string | null; published_at: string | null };
    metaProposal: { title: string | null; description: string | null };
  },
): Promise<boolean> {
  if (!ctx.workspaceId || !ctx.row.publish_external_id || !ctx.row.published_at) return false;
  const { data: settings } = await supabase.from('workspace_seo_settings').select('auto_apply_meta').eq('workspace_id', ctx.workspaceId).maybeSingle();
  if ((settings as { auto_apply_meta?: boolean } | null)?.auto_apply_meta !== true) return false;
  const update: Record<string, string> = {};
  if (ctx.metaProposal.title) update.title = ctx.metaProposal.title;
  if (ctx.metaProposal.description) update.meta_description = ctx.metaProposal.description;
  const { error } = await supabase.from('seo_articles').update(update).eq('id', ctx.articleId);
  if (error) { console.error('[seo-refresh] meta not applied:', error.message); return false; }
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/seo-publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ action: 'publish', article_id: ctx.articleId, status: 'publish', meta_only: true, user_id: ctx.userId }),
  }).catch(() => null);
  const out = res ? await res.json().catch(() => null) : null;
  if (!out?.success) console.warn('[seo-refresh] meta applied to the article but not republished:', out?.error ?? 'no response');
  return out?.success === true;
}
