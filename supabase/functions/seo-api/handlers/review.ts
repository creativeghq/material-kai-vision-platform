/** Editor's review after the writer: claims vs our page facts, sums, language; every finding is applied as an exact edit. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { DEFAULT_CLAUDE_MODEL, callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { NormalizedBrief } from './content-brief.ts';
import { sitePagesBlock, sitePagesDataLines, type SitePage } from './site-pages.ts';
import { applyReviewEdits, pagesNamedIn, type ReviewEdit } from './site-assets.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

const REVIEW_MAX_INPUT_TOKENS = 14000;
const REVIEW_CONCURRENCY = 4;
const REVIEW_MAX_OUTPUT_TOKENS = 6000;
const CONSISTENCY_MODEL = 'claude-sonnet-5';
const CONSISTENCY_MAX_INPUT_TOKENS = 20000;
const KINDS = [
  'unsupported_claim', 'wrong_fact', 'arithmetic', 'relationship_claim', 'language', 'loanword',
  'photo_description', 'link', 'meta', 'contradiction',
];
const META_PART = '## META';

const SCHEMA = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          find: { type: 'string' },
          replace: { type: 'string' },
          kind: { type: 'string', enum: KINDS },
          note: { type: 'string' },
        },
        required: ['find', 'replace', 'kind', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits'],
  additionalProperties: false,
};

export interface ArticleMeta { title: string; metaTitle: string; metaDescription: string }

export interface ReviewReport {
  applied: ReviewEdit[];
  skipped: (ReviewEdit & { why: string })[];
  credits: number;
  failed?: string;
}

function businessContext(brief: NormalizedBrief | null): string {
  const lines = [
    ...(brief?.extraContext ?? []),
    brief?.firsthandExperience?.credentials ? `Credentials: ${brief.firsthandExperience.credentials}` : '',
    ...(brief?.firsthandExperience?.ownedExamples ?? []).map((e) => `Owned example: ${e}`),
  ].filter(Boolean);
  return lines.length ? `\n\nBUSINESS CONTEXT (what we may say about ourselves):\n${lines.join('\n')}` : '';
}

function sections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).map((s) => s.trim()).filter(Boolean);
}

/** A page the part names keeps its facts and photos; every other page is listed by URL and title only. */
function pagesFor(part: string, pages: SitePage[]): SitePage[] {
  const named = new Set(pagesNamedIn(part, pages).map((p) => p.url));
  return pages.map((p) => (named.has(p.url) ? p : { ...p, facts: null, description: null, images: [] }));
}

function applyMetaEdits(meta: ArticleMeta, edits: ReviewEdit[]): { meta: ArticleMeta; applied: ReviewEdit[]; skipped: (ReviewEdit & { why: string })[] } {
  const out = { ...meta };
  const applied: ReviewEdit[] = [];
  const skipped: (ReviewEdit & { why: string })[] = [];
  for (const e of edits) {
    const field = (['title', 'metaTitle', 'metaDescription'] as const).find((k) => out[k].split(e.find).length === 2);
    if (!field || !e.find || e.find === e.replace) {
      skipped.push({ ...e, why: 'text not found in the title or meta' });
      continue;
    }
    out[field] = out[field].replace(e.find, () => e.replace);
    applied.push(e);
  }
  return { meta: out, applied, skipped };
}

/** Never throws: a review that cannot run leaves the article as written and says why. */
export async function reviewArticle(
  supabase: DbClient,
  opts: {
    markdown: string; meta: ArticleMeta; sitePages: SitePage[]; brief: NormalizedBrief | null;
    languageCode: string | null; userId: string; workspaceId: string | null;
  },
): Promise<{ markdown: string; meta: ArticleMeta; report: ReviewReport }> {
  const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_review' };
  const metaPart = `${META_PART}\nTITLE: ${opts.meta.title}\nMETA TITLE: ${opts.meta.metaTitle}\nMETA DESCRIPTION: ${opts.meta.metaDescription}`;
  const parts = [...sections(opts.markdown), metaPart];
  const perPart = await tokenCeiling(supabase, DEFAULT_CLAUDE_MODEL, REVIEW_MAX_INPUT_TOKENS, REVIEW_MAX_OUTPUT_TOKENS, 25);
  const ceiling = perPart * parts.length;
  let system: string;
  try {
    system = await getToolPrompt(supabase, 'seo_reviewer') + businessContext(opts.brief);
  } catch (e) {
    return { markdown: opts.markdown, meta: opts.meta, report: { applied: [], skipped: [], credits: 0, failed: `not reviewed: ${(e as Error).message.slice(0, 200)}` } };
  }
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article review');
  if (!hold.ok) {
    return { markdown: opts.markdown, meta: opts.meta, report: { applied: [], skipped: [], credits: 0, failed: `not reviewed: ${hold.error}` } };
  }

  const bodyEdits: ReviewEdit[] = [];
  const metaEdits: ReviewEdit[] = [];
  const priced: (number | null)[] = [];
  const failures: string[] = [];
  const queue = [...parts];
  const worker = async () => {
    for (let part = queue.shift(); part; part = queue.shift()) {
      const isMeta = part.startsWith(META_PART);
      try {
        const facts = sitePagesBlock(sitePagesDataLines(isMeta ? pagesFor('', opts.sitePages) : pagesFor(part, opts.sitePages)));
        const res = await callClaudeMessages({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: REVIEW_MAX_OUTPUT_TOKENS,
          system,
          messages: [{
            role: 'user',
            content: `Article language: ${opts.languageCode ?? 'en'}\n${facts}\n`
              + (isMeta
                ? 'Review the article\'s TITLE, META TITLE and META DESCRIPTION below (the search snippet).\n'
                : 'Review this ONE section of the article; the rest is reviewed separately.\n')
              + `<article>\n${part}\n</article>`,
          }],
          output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
        }, { task: 'seo_review', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 180_000 });
        priced.push(await tokenCredits(supabase, DEFAULT_CLAUDE_MODEL, {
          inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
        }));
        // A refusal or a truncated / unparseable reply is a failed section, never a reply to salvage.
        if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
          failures.push(`section ${res.stop_reason}`);
          continue;
        }
        const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
        if (Array.isArray(out?.edits)) (isMeta ? metaEdits : bodyEdits).push(...out.edits);
      } catch (e) {
        failures.push((e as Error).message.slice(0, 200));
      }
    }
  };
  await Promise.all(Array.from({ length: REVIEW_CONCURRENCY }, worker));

  const actual = priced.some((c) => c === null) ? null : priced.reduce<number>((s, c) => s + (c ?? 0), 0);
  const credits = await settleStage(supabase, wallet, ceiling, actual, { sections: parts.length, failed: failures.length });
  const body = applyReviewEdits(opts.markdown, bodyEdits);
  const meta = applyMetaEdits(opts.meta, metaEdits);
  const consistency = await consistencyPass(supabase, { ...opts, markdown: body.markdown });
  return {
    markdown: consistency.markdown,
    meta: meta.meta,
    report: {
      applied: [...body.applied, ...meta.applied, ...consistency.applied],
      skipped: [...body.skipped, ...meta.skipped, ...consistency.skipped],
      credits: credits + consistency.credits,
      ...(failures.length || consistency.failed
        ? { failed: [failures.length ? `${failures.length} of ${parts.length} sections not reviewed: ${failures[0]}` : '', consistency.failed ?? ''].filter(Boolean).join('; ') }
        : {}),
    },
  };
}

/** One read of the whole article for contradictions between sections and against our pages; never throws. */
async function consistencyPass(
  supabase: DbClient,
  opts: { markdown: string; sitePages: SitePage[]; languageCode: string | null; userId: string; workspaceId: string | null },
): Promise<{ markdown: string; applied: ReviewEdit[]; skipped: (ReviewEdit & { why: string })[]; credits: number; failed?: string }> {
  const none = { markdown: opts.markdown, applied: [], skipped: [] };
  const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_consistency' };
  const ceiling = await tokenCeiling(supabase, CONSISTENCY_MODEL, CONSISTENCY_MAX_INPUT_TOKENS, REVIEW_MAX_OUTPUT_TOKENS, 10);
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article consistency check');
  if (!hold.ok) return { ...none, credits: 0, failed: `consistency not checked: ${hold.error}` };
  let actual: number | null = null;
  try {
    const res = await callClaudeMessages({
      model: CONSISTENCY_MODEL,
      max_tokens: REVIEW_MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_consistency_check'),
      messages: [{
        role: 'user',
        content: `Article language: ${opts.languageCode ?? 'en'}\n${sitePagesBlock(sitePagesDataLines(pagesFor(opts.markdown, opts.sitePages)))}\n<article>\n${opts.markdown}\n</article>`,
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_consistency', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 180_000 });
    actual = await tokenCredits(supabase, CONSISTENCY_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      return { ...none, credits: await settleStage(supabase, wallet, ceiling, actual, { failed: res.stop_reason }), failed: `consistency ${res.stop_reason}` };
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const result = applyReviewEdits(opts.markdown, Array.isArray(out?.edits) ? out.edits : []);
    return { ...result, credits: await settleStage(supabase, wallet, ceiling, actual, { edits: result.applied.length }) };
  } catch (e) {
    return { ...none, credits: await settleStage(supabase, wallet, ceiling, actual ?? 0, { failed: true }), failed: (e as Error).message.slice(0, 200) };
  }
}
