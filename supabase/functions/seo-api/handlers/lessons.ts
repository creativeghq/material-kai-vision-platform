/** Learn from the editor: the published page vs our draft, proposed as glossary pairs and rules for approval. */

import { createClient } from '@supabase/supabase-js';
import { jsonResponse } from '../../_shared/http.ts';
import { corsHeaders } from '../../_shared/cors.ts';
import { authenticate } from '../../_shared/auth.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { DbClient } from '../../_shared/supabase-client.ts';
import { loadOwnedArticle } from './article-access.ts';
import { changedSentences } from './draft-diff.ts';
import { pageFacts } from './site-assets.ts';
import { serpValue } from './untrusted.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const LESSON_MODEL = 'claude-sonnet-5';
const LESSON_MAX_INPUT_TOKENS = 14000;
const LESSON_MAX_OUTPUT_TOKENS = 8000;
const CATEGORIES = ['wording', 'greek', 'fact', 'claim_about_us', 'price', 'photo', 'link', 'coverage', 'structure', 'other'];

const SCHEMA = {
  type: 'object',
  properties: {
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['glossary', 'rule'] },
          category: { type: 'string', enum: CATEGORIES },
          from: { type: 'string' },
          to: { type: 'string' },
          rule: { type: 'string' },
          evidence_removed: { type: 'string' },
          evidence_added: { type: 'string' },
        },
        required: ['kind', 'category', 'from', 'to', 'rule', 'evidence_removed', 'evidence_added'],
        additionalProperties: false,
      },
    },
  },
  required: ['lessons'],
  additionalProperties: false,
};

export interface LessonArticle {
  id: string; user_id: string; workspace_id: string | null; markdown_content: string | null;
  stages_data: { extra?: Record<string, unknown> } | null;
}

export interface LessonReport { removed: number; added: number; proposed: number; credits: number; failed?: string }

/** Never throws. Stamps the article so the same published version is not read twice. */
export async function extractLessons(
  supabase: DbClient,
  a: LessonArticle,
  page: { url: string; content_text: string },
): Promise<LessonReport> {
  const empty = { removed: 0, added: 0, proposed: 0, credits: 0 };
  if (!a.workspace_id || !a.markdown_content) return { ...empty, failed: 'no workspace or draft' };
  const language = String(a.stages_data?.extra?.language_code ?? 'en');
  const diff = changedSentences(a.markdown_content, pageFacts(page.content_text, 60000) ?? '');
  const report: LessonReport = { ...empty, removed: diff.removed.length, added: diff.added.length };
  if (!diff.removed.length && !diff.added.length) return await stamp(supabase, a, report);

  const wallet: StageWallet = { userId: a.user_id, workspaceId: a.workspace_id, opType: 'seo_lessons' };
  const ceiling = await tokenCeiling(supabase, LESSON_MODEL, LESSON_MAX_INPUT_TOKENS, LESSON_MAX_OUTPUT_TOKENS, 10);
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO lessons from the published article');
  if (!hold.ok) return { ...report, failed: `not read: ${hold.error}` };

  let actual: number | null = null;
  try {
    const list = (title: string, xs: string[]) => `${title}:\n${xs.map((x) => `- ${serpValue(x, 400)}`).join('\n')}`;
    const res = await callClaudeMessages({
      model: LESSON_MODEL,
      max_tokens: LESSON_MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_lesson_extractor'),
      messages: [{
        role: 'user',
        content: `Article language: ${language}\n<draft_vs_published>\n${list('REMOVED OR CHANGED (our draft)', diff.removed)}\n\n${list('ADDED OR CHANGED (published)', diff.added)}\n</draft_vs_published>`,
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_lessons', userId: a.user_id, workspaceId: a.workspace_id, timeoutMs: 120_000 });
    actual = await tokenCredits(supabase, LESSON_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      report.credits = await settleStage(supabase, wallet, ceiling, actual, { failed: res.stop_reason });
      return { ...report, failed: `lessons ${res.stop_reason}` };
    }
    const lessons = (JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '')?.lessons ?? []) as Record<string, string>[];
    for (const l of lessons) {
      const glossary = l.kind === 'glossary';
      if (glossary ? !(l.from?.trim() && l.to?.trim()) : !l.rule?.trim()) continue;
      const { error } = await supabase.from('seo_writer_lessons').insert({
        workspace_id: a.workspace_id,
        article_id: a.id,
        language_code: language,
        kind: glossary ? 'glossary' : 'rule',
        category: CATEGORIES.includes(l.category) ? l.category : 'other',
        from_text: glossary ? l.from.trim() : null,
        to_text: glossary ? l.to.trim() : null,
        rule_text: glossary ? null : l.rule.trim(),
        evidence: { removed: l.evidence_removed, added: l.evidence_added, page: page.url },
      });
      // 23505: the same lesson is already proposed or decided for this workspace.
      if (error && error.code !== '23505') throw new Error(`lesson not stored: ${error.message}`);
      if (!error) report.proposed += 1;
    }
    report.credits = await settleStage(supabase, wallet, ceiling, actual, { proposed: report.proposed });
    return await stamp(supabase, a, report);
  } catch (e) {
    report.credits = await settleStage(supabase, wallet, ceiling, actual ?? 0, { failed: true });
    return { ...report, failed: (e as Error).message.slice(0, 200) };
  }
}

async function stamp(supabase: DbClient, a: LessonArticle, report: LessonReport): Promise<LessonReport> {
  const { data: current } = await supabase.from('seo_articles').select('stages_data').eq('id', a.id).single();
  const stored = (current?.stages_data ?? {}) as { extra?: Record<string, unknown> };
  const stagesData = { ...stored, extra: { ...(stored.extra ?? {}), lessons: { ...report, read_at: new Date().toISOString() } } };
  const { error } = await supabase.from('seo_articles').update({ stages_data: stagesData }).eq('id', a.id);
  return error ? { ...report, failed: `not stamped: ${error.message}` } : report;
}

/** The approved lessons of a workspace, as lines for the writer's and the reviewer's business context. */
export async function approvedLessonLines(supabase: DbClient, workspaceId: string, languageCode: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('seo_writer_lessons')
    .select('kind, from_text, to_text, rule_text')
    .eq('workspace_id', workspaceId)
    .eq('language_code', languageCode)
    .eq('status', 'approved')
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return [];
  return (data ?? []).map((l: { kind: string; from_text: string | null; to_text: string | null; rule_text: string | null }) =>
    l.kind === 'glossary' ? `House glossary: write «${l.to_text}», never «${l.from_text}».` : `House rule: ${l.rule_text}`);
}

export async function handleLessons(req: Request, body: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const auth = await authenticate(req);
  if (!auth.success || !auth.userId) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
  if (typeof body.article_id !== 'string') return jsonResponse({ success: false, error: 'article_id is required' }, 400);
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const owned = await loadOwnedArticle(supabase, auth.userId, body.article_id);
  if ('response' in owned) return owned.response;
  const { data: a } = await supabase
    .from('seo_articles').select('id, user_id, workspace_id, website_id, slug, markdown_content, stages_data').eq('id', body.article_id).single();
  const { data: pages } = a?.website_id && a?.slug
    ? await supabase.from('user_website_pages').select('url, content_text').eq('website_id', a.website_id)
      .or(`url.like.%/${a.slug},url.like.%/${a.slug}/`).not('content_text', 'is', null).limit(1)
    : { data: [] };
  const page = pages?.[0] as { url: string; content_text: string } | undefined;
  if (!page) return jsonResponse({ success: false, error: 'This article is not published on its website yet.' }, 409);
  return jsonResponse({ success: true, data: await extractLessons(supabase, a as LessonArticle, page) });
}
