/** Article Suggestions: proposed edits the user previews, then applies (+) or dismisses (X). */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import type { ArticlePlan, ContentAnalysisResult } from '../../_shared/seo-types.ts';
import { resolveAndAssertSeoEntitled } from './entitlement.ts';
import { refundStage, reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';
import { normalizeContentBrief, briefList, type NormalizedBrief } from './content-brief.ts';
import { analyzeContent } from './analyze.ts';
import {
  loadOwnedArticle, storedArticlePlan, persistAnalysis, reconciledFaqSchema, type OwnedArticle,
} from './article-access.ts';
import { serpValue } from './untrusted.ts';
import { pageFacts, trimSlash } from './site-assets.ts';
import { sitePagesBlock, sitePagesDataLines, type SitePage } from './site-pages.ts';
import {
  applySuggestion, basisOf, mergeSuggestions, pickSuggestionItems, storedSuggestions, validateSuggestion,
  type ArticleSuggestion, type SuggestionItem,
} from './suggestion-rules.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

export const SUGGESTION_MODEL = 'claude-sonnet-5';
const MAX_INPUT_TOKENS = 30000;
const MAX_OUTPUT_TOKENS = 8000;
const MAX_LINKED_PAGES = 12;

const SCHEMA = {
  type: 'object',
  properties: {
    suggestions: {
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
  },
  required: ['suggestions'],
  additionalProperties: false,
};

type Extra = Record<string, unknown>;
const extraOf = (a: Pick<OwnedArticle, 'stages_data'>): Extra =>
  ((a.stages_data as { extra?: Extra } | null)?.extra ?? {}) as Extra;

async function caller(req: Request, body: any): Promise<{ userId: string } | { response: Response }> {
  const auth = await authenticate(req);
  if (!auth.success) return { response: jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401) };
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return { response: jsonResponse({ success: false, error: 'user_id is required' }, 400) };
  return { userId };
}

function candidateItems(extra: Extra, answerMissing: unknown): SuggestionItem[] {
  const points = (raw: unknown, source: 'coverage' | 'answer_check'): SuggestionItem[] =>
    (Array.isArray(raw) ? raw : [])
      .filter((m): m is { point: string } => typeof (m as { point?: unknown })?.point === 'string')
      .map((m) => ({ source, point: m.point }));
  const coverage = (extra.coverage as { missing?: unknown } | undefined)?.missing;
  const fixes = (extra.content_analysis as { fixes?: unknown } | undefined)?.fixes;
  const analysis: SuggestionItem[] = (Array.isArray(fixes) ? fixes : [])
    .filter((f) => f?.scope === 'section' && typeof f.anchor === 'string' && !!f.anchor && typeof f.suggestion === 'string')
    .map((f) => ({ source: 'analysis', point: f.suggestion, anchor: f.anchor, detail: typeof f.description === 'string' ? f.description : undefined }));
  return [...points(coverage, 'coverage'), ...points(answerMissing, 'answer_check'), ...analysis];
}

/** The article's own linked pages, with what each states. Scoped to the article's website. */
async function linkedPages(supabase: DbClient, articleId: string, extra: Extra): Promise<SitePage[]> {
  const targets = Array.isArray(extra.site_link_targets) ? extra.site_link_targets as { url?: unknown }[] : [];
  const urls = targets.map((t) => (typeof t?.url === 'string' ? t.url : '')).filter(Boolean).slice(0, MAX_LINKED_PAGES);
  if (!urls.length) return [];
  const { data: row } = await supabase.from('seo_articles').select('website_id').eq('id', articleId).maybeSingle();
  if (!row?.website_id) return [];
  const variants = [...new Set(urls.flatMap((u) => [trimSlash(u), `${trimSlash(u)}/`]))];
  const { data, error } = await supabase
    .from('user_website_pages')
    .select('url, title, description, content_text')
    .eq('website_id', row.website_id)
    .in('url', variants);
  if (error) {
    console.warn('[seo-suggestions] linked pages unreadable:', error.message);
    return [];
  }
  return ((data ?? []) as { url: string; title: string | null; description: string | null; content_text: string | null }[])
    .map((p) => ({ url: p.url, title: p.title, description: p.description, facts: pageFacts(p.content_text), similarity: 1, images: [] }));
}

function businessBlock(brief: NormalizedBrief | null): string {
  if (!brief) return '';
  const lines = [
    `Tone: ${briefList(brief.brandVoice.toneAttributes)}`,
    brief.brandVoice.writingStyle ? `Style: ${brief.brandVoice.writingStyle}` : '',
    brief.brandVoice.avoidList.length ? `Avoid: ${briefList(brief.brandVoice.avoidList)}` : '',
    ...brief.extraContext,
    brief.firsthandExperience?.credentials ? `Credentials: ${brief.firsthandExperience.credentials}` : '',
    ...(brief.firsthandExperience?.ownedExamples ?? []).map((e) => `Owned example: ${e}`),
  ].filter(Boolean).map((l) => serpValue(l, 600));
  return lines.length ? `\n<business_context>\n${lines.join('\n')}\n</business_context>` : '';
}

function itemsBlock(items: SuggestionItem[]): string {
  return items.map((it, i) => {
    const head = it.source === 'analysis'
      ? `${i + 1}. Analyzer finding: ${serpValue(it.point, 500)}${it.detail ? ` (${serpValue(it.detail, 300)})` : ''}\n   Paragraph: ${serpValue(it.anchor, 3000)}`
      : `${i + 1}. Readers expect: ${serpValue(it.point, 500)}`;
    return head;
  }).join('\n');
}

export async function handleSuggestions(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const who = await caller(req, body);
  if ('response' in who) return who.response;
  const { userId } = who;

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

    const extra = extraOf(article);
    const { data: checks, error: checkErr } = await supabase
      .from('seo_article_answer_checks')
      .select('missing')
      .eq('article_id', articleId)
      .eq('status', 'ok')
      .order('checked_at', { ascending: false })
      .limit(1);
    if (checkErr) console.warn('[seo-suggestions] answer checks unreadable:', checkErr.message);
    const existing = storedSuggestions(extra.suggestions);
    const items = pickSuggestionItems(candidateItems(extra, checks?.[0]?.missing), markdown, existing);
    if (!items.length) {
      return jsonResponse({
        success: true,
        data: { suggestions: existing, dropped: [], credits_used: 0, message: 'Nothing left to suggest: no open reader expectations or paragraph fixes.' },
      });
    }

    const brief = normalizeContentBrief(article.content_brief);
    const pages = await linkedPages(supabase, articleId, extra);
    const languageCode = typeof extra.language_code === 'string' ? extra.language_code : 'en';

    wallet = { userId, workspaceId: workspaceId ?? null, opType: 'seo_suggestions' };
    const ceiling = await tokenCeiling(supabase, SUGGESTION_MODEL, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, 25);
    const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article suggestions', { article_id: articleId, items: items.length });
    if (!hold.ok) return jsonResponse({ success: false, error: hold.error }, 402);
    reserved = ceiling;

    const res = await callClaudeMessages({
      model: SUGGESTION_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_suggestion_writer'),
      messages: [{
        role: 'user',
        content: [
          `Article language: ${languageCode}`,
          businessBlock(brief),
          `<items>\n${itemsBlock(items)}\n</items>`,
          sitePagesBlock(sitePagesDataLines(pages, 0)),
          `<article>\n${markdown.replace(/<\/?article>/gi, ' ').slice(0, 60000)}\n</article>`,
        ].join('\n'),
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_suggestions', userId, workspaceId: workspaceId ?? null, timeoutMs: 130_000 });
    const actual = await tokenCredits(supabase, SUGGESTION_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    // A refusal or a truncated reply is a failed run, never a reply to salvage.
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      throw new Error(res.stop_reason === 'refusal'
        ? 'The model declined to propose edits for this article — nothing was charged.'
        : 'The proposals ran past the length limit and were discarded — nothing was charged.');
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const raw = Array.isArray(out?.suggestions) ? out.suggestions : [];

    const now = new Date().toISOString();
    const fresh: ArticleSuggestion[] = [];
    const dropped: { item: number; reason: string }[] = [];
    const usedItems = new Set<number>();
    for (const r of raw) {
      const idx = Number(r?.item) - 1;
      const item = items[idx];
      if (!item || usedItems.has(idx)) {
        dropped.push({ item: idx + 1, reason: item ? 'a second proposal for the same item' : 'no such item' });
        continue;
      }
      const kind = r.kind === 'replace' ? 'replace' : 'insert';
      const anchor = String(r.anchor ?? '');
      const text = String(r.text ?? '');
      const proposal: Pick<ArticleSuggestion, 'kind' | 'find' | 'replace' | 'after' | 'markdown'> = kind === 'replace'
        ? { kind, find: anchor, replace: text }
        : { kind, after: anchor, markdown: text };
      const why = validateSuggestion(markdown, proposal);
      if (why) {
        dropped.push({ item: idx + 1, reason: why });
        continue;
      }
      usedItems.add(idx);
      fresh.push({
        id: crypto.randomUUID(),
        source: item.source,
        title: String(r.title ?? '').trim().slice(0, 120) || item.point.slice(0, 120),
        ...proposal,
        basis: basisOf(item),
        status: 'pending',
        created_at: now,
      });
    }

    // Re-read so a write that landed during the model call (an applied fix) is not overwritten.
    const { data: current, error: curErr } = await supabase.from('seo_articles').select('stages_data').eq('id', articleId).single();
    if (curErr) throw new Error(`Could not read the article to save suggestions: ${curErr.message}`);
    const stages = (current?.stages_data ?? {}) as Record<string, unknown>;
    const curExtra = (stages.extra ?? {}) as Extra;
    const suggestions = mergeSuggestions(storedSuggestions(curExtra.suggestions), fresh);
    const { error: writeErr } = await supabase
      .from('seo_articles')
      .update({ stages_data: { ...stages, extra: { ...curExtra, suggestions } } })
      .eq('id', articleId);
    if (writeErr) throw new Error(`Could not save the suggestions: ${writeErr.message}`);

    const creditsUsed = await settleStage(supabase, wallet, reserved, actual, { article_id: articleId, proposed: fresh.length, dropped: dropped.length });
    reserved = 0;
    return jsonResponse({ success: true, data: { suggestions, dropped, credits_used: creditsUsed } });
  } catch (error: any) {
    if (wallet && reserved > 0) await refundStage(supabase, wallet, reserved, String(error?.message ?? error));
    console.error('[seo-suggestions] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not produce suggestions' }, 500);
  }
}

async function loadSuggestion(req: Request, body: any) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const who = await caller(req, body);
  if ('response' in who) return who;
  const articleId = typeof body.article_id === 'string' ? body.article_id : null;
  const suggestionId = typeof body.suggestion_id === 'string' ? body.suggestion_id : null;
  if (!articleId || !suggestionId) {
    return { response: jsonResponse({ success: false, error: 'article_id and suggestion_id are required' }, 400) };
  }
  const loaded = await loadOwnedArticle(supabase, who.userId, articleId);
  if ('response' in loaded) return loaded;
  const { response: entResponse } = await resolveAndAssertSeoEntitled(supabase, who.userId);
  if (entResponse) return { response: entResponse };
  const all = storedSuggestions(extraOf(loaded.article).suggestions);
  const target = all.find((s) => s.id === suggestionId);
  if (!target) return { response: jsonResponse({ success: false, error: 'Not found' }, 404) };
  if (target.status !== 'pending') {
    return { response: jsonResponse({ success: false, error: `That suggestion was already ${target.status}.` }, 409) };
  }
  return { supabase, article: loaded.article, all, target };
}

const resolved = (all: ArticleSuggestion[], id: string, status: 'applied' | 'dismissed'): ArticleSuggestion[] =>
  all.map((s) => (s.id === id ? { ...s, status, resolved_at: new Date().toISOString() } : s));

export async function handleSuggestionApply(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const got = await loadSuggestion(req, body);
    if ('response' in got) return got.response;
    const { supabase, article, all, target } = got;

    const markdown = article.markdown_content ?? '';
    const why = validateSuggestion(markdown, target);
    if (why) {
      return jsonResponse({
        success: false,
        error: `This suggestion no longer fits the article (${why}) — it has been edited since. Suggest improvements again for current proposals.`,
      }, 409);
    }
    const next = applySuggestion(markdown, target);

    const brief = normalizeContentBrief(article.content_brief);
    const plan = storedArticlePlan(article) as ArticlePlan | null;
    let reanalysed: ContentAnalysisResult | null = null;
    if (plan) {
      try {
        reanalysed = analyzeContent(next, plan, undefined, brief, undefined);
      } catch (scoreErr) {
        console.error('[seo-suggestion-apply] re-score failed, saving the edit anyway:', scoreErr);
      }
    }

    const capturedAt = new Date().toISOString();
    // Snapshot written in the SAME statement as the new body, so revert_fix restores exactly this.
    const snapshot = {
      markdown_content: next,
      previous_markdown: markdown,
      previous_markdown_at: capturedAt,
      previous_markdown_label: `Suggestion: ${target.title}`.slice(0, 200),
      updated_at: capturedAt,
    };
    const suggestions = resolved(all, target.id, 'applied');
    const extraKeys = { ...reconciledFaqSchema(article, next), suggestions };
    let writeErr: string | null;
    if (reanalysed) {
      writeErr = (await persistAnalysis(supabase, article, reanalysed, snapshot, extraKeys)).error;
    } else {
      const stages = (article.stages_data ?? {}) as Record<string, unknown>;
      const { error } = await supabase
        .from('seo_articles')
        .update({ ...snapshot, stages_data: { ...stages, extra: { ...extraOf(article), ...extraKeys } } })
        .eq('id', article.id);
      writeErr = error?.message ?? null;
    }
    if (writeErr) throw new Error(`Could not save the article: ${writeErr}`);

    return jsonResponse({
      success: true,
      data: {
        article_id: article.id,
        markdown_content: next,
        seo_score: reanalysed?.overallScore ?? null,
        readability_score: reanalysed?.readabilityScore ?? null,
        analysis: reanalysed,
        suggestions,
        can_revert: true,
        reverts_to: capturedAt,
      },
    });
  } catch (error: any) {
    console.error('[seo-suggestion-apply] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not apply the suggestion' }, 500);
  }
}

export async function handleSuggestionDismiss(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const got = await loadSuggestion(req, body);
    if ('response' in got) return got.response;
    const { supabase, article, all, target } = got;
    const suggestions = resolved(all, target.id, 'dismissed');
    const stages = (article.stages_data ?? {}) as Record<string, unknown>;
    const { error } = await supabase
      .from('seo_articles')
      .update({ stages_data: { ...stages, extra: { ...extraOf(article), suggestions } } })
      .eq('id', article.id);
    if (error) throw new Error(`Could not save: ${error.message}`);
    return jsonResponse({ success: true, data: { article_id: article.id, suggestions } });
  } catch (error: any) {
    console.error('[seo-suggestion-dismiss] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not dismiss the suggestion' }, 500);
  }
}
