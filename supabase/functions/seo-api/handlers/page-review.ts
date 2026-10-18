/** Page review: one existing page of our site, its measured facts, and copy-ready proposals (#399). */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate, userHasWorkspaceCapability } from '../../_shared/auth.ts';
import { assertEntitled } from '../../_shared/entitlement.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import { runInBackground } from '../../_shared/background.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { buildCheckInventory } from '../../_shared/seo/onPageChecks.generated.ts';
import {
  PAGE_REVIEW_DESCRIPTION_MAX, PAGE_REVIEW_TITLE_MAX, PAGE_REVIEW_VERDICTS,
  type PageRecommendationKind, type PageReviewVerdict,
} from '../../_shared/seo/pageReviewVocabulary.generated.ts';
import { refundStage, reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';
import { serpValue } from './untrusted.ts';
import { clampAtWord, keepKnownLinks } from './page-review-rules.ts';

export const PAGE_REVIEW_MODEL = 'claude-sonnet-5';
const MAX_INPUT_TOKENS = 16000;
const MAX_OUTPUT_TOKENS = 3000;
const MAX_PAGE_CHARS = 20000;

const NULLABLE_TEXT = { type: ['string', 'null'] };
const FIELD = {
  type: 'object',
  properties: { proposed: NULLABLE_TEXT, reason: { type: 'string' } },
  required: ['proposed', 'reason'],
  additionalProperties: false,
};
const SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: [...PAGE_REVIEW_VERDICTS] },
    summary: { type: 'string' },
    title: FIELD,
    description: FIELD,
    h1: FIELD,
    content_gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, why: { type: 'string' }, source_query: NULLABLE_TEXT },
        required: ['question', 'why', 'source_query'],
        additionalProperties: false,
      },
    },
    internal_links: {
      type: 'array',
      items: {
        type: 'object',
        properties: { to_url: { type: 'string' }, anchor: { type: 'string' }, reason: { type: 'string' } },
        required: ['to_url', 'anchor', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdict', 'summary', 'title', 'description', 'h1', 'content_gaps', 'internal_links'],
  additionalProperties: false,
};

interface Rec { kind: PageRecommendationKind; current_value: string | null; proposed_value: string; rationale: string; evidence?: Record<string, unknown> }

const bare = (u: string) => u.replace(/\/+$/, '');
const normText = (s: string | null | undefined) => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();

export async function handlePageReview(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await authenticate(req);
  if (!auth.success) return jsonResponse({ success: false, error: auth.error || 'Unauthorized' }, 401);
  const userId = auth.userId ?? (auth.level === 'secret' ? body.user_id : null);
  if (!userId) return jsonResponse({ success: false, error: 'user_id is required' }, 400);
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '') as DbClient;
  if (body.background === true && auth.level === 'secret') {
    await runInBackground(runPageReview(supabase, body, userId), `seo-page-review:${body.page_id}`);
    return jsonResponse({ success: true, data: { accepted: true } }, 202);
  }
  return runPageReview(supabase, body, userId);
}

export async function runPageReview(supabase: DbClient, body: any, userId: string): Promise<Response> {
  let wallet: StageWallet | null = null;
  let reserved = 0;
  try {
    const pageId = typeof body.page_id === 'string' ? body.page_id : null;
    if (!pageId) return jsonResponse({ success: false, error: 'page_id is required' }, 400);
    const { data: page, error: pageErr } = await supabase.from('user_website_pages')
      .select('id, website_id, user_id, url, title, description, h1, lang, word_count, http_status, content_text, links_to, fetched_at, embedding')
      .eq('id', pageId).maybeSingle();
    if (pageErr) throw new Error(`Could not read the page: ${pageErr.message}`);
    if (!page) return jsonResponse({ success: false, error: 'Page not found' }, 404);
    const { data: website } = await supabase.from('user_websites')
      .select('id, workspace_id, user_id, display_name, url').eq('id', page.website_id).maybeSingle();
    if (!website || !(await userHasWorkspaceCapability(supabase, userId, website.workspace_id, 'marketing.seo'))) {
      return jsonResponse({ success: false, error: 'Page not found' }, 404);
    }
    const ent = await assertEntitled(supabase, website.workspace_id, 'seo-toolkit');
    if (!ent.ok) return ent.response;
    if (!page.content_text?.trim()) {
      return jsonResponse({
        success: false, status: 'not_fetched',
        error: 'This page has not been read yet, so there is nothing to review. Refetch it first.',
      }, 409);
    }

    const [{ data: queries, error: queriesErr }, { data: audit, error: auditErr }, siblings] = await Promise.all([
      supabase.rpc('get_page_gsc_queries', { p_website_id: page.website_id, p_page: page.url, p_days: 90 }),
      supabase.from('website_page_audits').select('checks, onpage_score, created_at')
        .eq('page_id', page.id).not('onpage_score', 'is', null)
        .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      siblingPages(supabase, page, website.user_id),
    ]);
    if (queriesErr) throw new Error(`Could not read the page's Search Console queries: ${queriesErr.message}`);
    if (auditErr) throw new Error(`Could not read the page's last audit: ${auditErr.message}`);
    const gsc = ((queries ?? []) as { query: string; impressions: number; clicks: number; position: number | null }[]).slice(0, 25);
    const failing = audit?.checks
      ? buildCheckInventory(audit.checks as Record<string, unknown>).verdicts.filter((v) => !v.passed).map((v) => v.check.label)
      : [];

    wallet = { userId, workspaceId: website.workspace_id, opType: 'seo_page_review' };
    const ceiling = await tokenCeiling(supabase, PAGE_REVIEW_MODEL, MAX_INPUT_TOKENS, MAX_OUTPUT_TOKENS, 10);
    const hold = await reserveStage(supabase, wallet, ceiling, `SEO page review: ${page.url}`, { page_id: page.id });
    if (!hold.ok) return jsonResponse({ success: false, code: 'insufficient_credits', error: hold.error }, 402);
    reserved = ceiling;

    const res = await callClaudeMessages({
      model: PAGE_REVIEW_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_page_reviewer'),
      messages: [{
        role: 'user',
        content: [
          `URL: ${serpValue(page.url, 500)}`,
          `Site: ${serpValue(website.display_name ?? website.url, 200)}`,
          `Page language: ${page.lang ?? 'unknown (infer it from the text)'}`,
          `Current title: ${serpValue(page.title ?? '(none)', 300)}`,
          `Current meta description: ${serpValue(page.description ?? '(none)', 500)}`,
          `Current H1: ${serpValue(page.h1 ?? '(none)', 300)}`,
          `Word count: ${page.word_count ?? 'unknown'}`,
          gsc.length
            ? `<search_queries>\n${gsc.map((q) => `- "${serpValue(q.query, 200)}": ${q.impressions} impressions, ${q.clicks} clicks, position ${q.position ?? '?'}${q.position && q.position >= 4 && q.position <= 20 ? ' (striking distance)' : ''}`).join('\n')}\n</search_queries>`
            : 'Search queries: none recorded for this page in 90 days.',
          audit ? `Failing on-page checks: ${failing.length ? failing.join('; ') : 'none'}` : 'On-page audit: not run for this page.',
          siblings.length
            ? `<sibling_pages>\n${siblings.map((s) => `- ${s.url} — ${serpValue(s.title ?? '', 200)}`).join('\n')}\n</sibling_pages>`
            : 'Sibling pages: none found.',
          `<page_content>\n${page.content_text.replace(/<\/?page_content>/gi, ' ').slice(0, MAX_PAGE_CHARS)}\n</page_content>`,
        ].join('\n'),
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_page_review', userId, workspaceId: website.workspace_id, timeoutMs: 120_000 });
    const actual = await tokenCredits(supabase, PAGE_REVIEW_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      throw new Error(res.stop_reason === 'refusal'
        ? 'The model declined to review this page. Nothing was charged.'
        : 'The review ran past the length limit and was discarded. Nothing was charged.');
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const verdict: PageReviewVerdict = (PAGE_REVIEW_VERDICTS as readonly string[]).includes(out?.verdict) ? out.verdict : 'improve';

    const recs: Rec[] = [];
    const field = (kind: 'title' | 'description' | 'h1', current: string | null, max: number | null) => {
      const f = out?.[kind];
      const proposed = typeof f?.proposed === 'string' && f.proposed.trim() ? (max ? clampAtWord(f.proposed, max) : f.proposed.trim()) : null;
      if (proposed && normText(proposed) !== normText(current)) {
        recs.push({ kind, current_value: current, proposed_value: proposed, rationale: String(f.reason ?? '').trim() });
      }
    };
    field('title', page.title, PAGE_REVIEW_TITLE_MAX);
    field('description', page.description, PAGE_REVIEW_DESCRIPTION_MAX);
    field('h1', page.h1, 120);
    for (const g of (Array.isArray(out?.content_gaps) ? out.content_gaps : []).slice(0, 5)) {
      if (!String(g?.question ?? '').trim()) continue;
      recs.push({
        kind: 'content_gap', current_value: null, proposed_value: String(g.question).trim(),
        rationale: String(g.why ?? '').trim(), evidence: g.source_query ? { source_query: g.source_query } : {},
      });
    }
    const proposedLinks: { to_url: string; anchor?: string; reason?: string }[] = Array.isArray(out?.internal_links) ? out.internal_links : [];
    const links = keepKnownLinks(proposedLinks, siblings, page.links_to ?? []);
    for (const l of links.slice(0, 4)) {
      recs.push({
        kind: 'internal_link', current_value: null, proposed_value: bare(l.to_url),
        rationale: String(l.reason ?? '').trim(), evidence: { anchor: String(l.anchor ?? '').trim() },
      });
    }

    const charged = actual ?? reserved;
    const { data: reviewId, error: saveErr } = await supabase.rpc('save_page_review', {
      p_page_id: page.id, p_user_id: userId, p_verdict: verdict,
      p_summary: String(out?.summary ?? '').trim(), p_model: PAGE_REVIEW_MODEL, p_credits: charged,
      p_inputs: { queries: gsc.length, failing_checks: failing.length, siblings: siblings.length, audited: !!audit },
      p_recommendations: recs,
    });
    if (saveErr) throw new Error(`Could not save the review: ${saveErr.message}`);
    await settleStage(supabase, wallet, reserved, actual, { page_id: page.id, review_id: reviewId, proposals: recs.length });
    reserved = 0;

    return jsonResponse({
      success: true,
      data: {
        review_id: reviewId, page_id: page.id, website_id: page.website_id, url: page.url, verdict,
        summary: String(out?.summary ?? '').trim(), recommendations: recs,
        dropped_links: proposedLinks.length - links.length,
        inputs: { queries: gsc.length, failing_checks: failing.length, siblings: siblings.length, audited: !!audit },
        credits_used: charged,
      },
    });
  } catch (error: any) {
    if (wallet && reserved > 0) await refundStage(supabase, wallet, reserved, String(error?.message ?? error));
    console.error('[seo-page-review] Error:', error);
    return jsonResponse({ success: false, error: error?.message || 'Could not review the page' }, 500);
  }
}

/** The 8 pages of the same site closest to this one by its own embedding. */
async function siblingPages(
  supabase: DbClient, page: { id: string; website_id: string; url: string; embedding: unknown }, ownerId: string,
): Promise<{ url: string; title: string | null }[]> {
  if (!page.embedding) return [];
  const { data, error } = await supabase.rpc('match_user_website_pages', {
    p_query_embedding: page.embedding, p_user_id: ownerId, p_website_id: page.website_id, p_limit: 9, p_match_threshold: 0.55,
  });
  if (error) {
    console.warn('[seo-page-review] sibling pages unavailable:', error.message);
    return [];
  }
  return ((data ?? []) as { page_id: string; url: string; title: string | null }[])
    .filter((p) => p.page_id !== page.id && bare(p.url) !== bare(page.url))
    .slice(0, 8)
    .map((p) => ({ url: p.url, title: p.title }));
}
