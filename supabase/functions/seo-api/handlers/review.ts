/** Editor's review after the writer: claims vs our page facts, sums, language; exact edits applied by match. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { DEFAULT_CLAUDE_MODEL, callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { NormalizedBrief } from './content-brief.ts';
import { sitePagesBlock, sitePagesDataLines, type SitePage } from './site-pages.ts';
import { applyReviewEdits, type ReviewEdit } from './site-assets.ts';
import { refundStage, reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

const REVIEW_MAX_INPUT_TOKENS = 40000;
const REVIEW_MAX_OUTPUT_TOKENS = 8000;
const KINDS = ['unsupported_claim', 'wrong_fact', 'arithmetic', 'relationship_claim', 'language', 'loanword'];

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
    unresolved: {
      type: 'array',
      items: {
        type: 'object',
        properties: { quote: { type: 'string' }, note: { type: 'string' } },
        required: ['quote', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['edits', 'unresolved'],
  additionalProperties: false,
};

export interface ReviewReport {
  applied: ReviewEdit[];
  skipped: (ReviewEdit & { why: string })[];
  unresolved: { quote: string; note: string }[];
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

/** Never throws: a review that cannot run leaves the article as written and says why. */
export async function reviewArticle(
  supabase: DbClient,
  opts: {
    markdown: string; sitePages: SitePage[]; brief: NormalizedBrief | null;
    languageCode: string | null; userId: string; workspaceId: string | null;
  },
): Promise<{ markdown: string; report: ReviewReport }> {
  const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_review' };
  const empty = (failed: string): { markdown: string; report: ReviewReport } =>
    ({ markdown: opts.markdown, report: { applied: [], skipped: [], unresolved: [], credits: 0, failed } });

  const ceiling = await tokenCeiling(supabase, DEFAULT_CLAUDE_MODEL, REVIEW_MAX_INPUT_TOKENS, REVIEW_MAX_OUTPUT_TOKENS, 90);
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article review');
  if (!hold.ok) return empty(`not reviewed: ${hold.error}`);

  let settled = false;
  try {
    const res = await callClaudeMessages({
      model: DEFAULT_CLAUDE_MODEL,
      max_tokens: REVIEW_MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_reviewer') + businessContext(opts.brief),
      messages: [{
        role: 'user',
        content: `Article language: ${opts.languageCode ?? 'en'}\n`
          + sitePagesBlock(sitePagesDataLines(opts.sitePages))
          + `\n<article>\n${opts.markdown}\n</article>`,
      }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_review', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 240_000 });

    const credits = await settleStage(supabase, wallet, ceiling, await tokenCredits(supabase, DEFAULT_CLAUDE_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    }));
    settled = true;
    // A refusal or a truncated / unparseable reply is a failed review, never a reply to salvage.
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      return { markdown: opts.markdown, report: { applied: [], skipped: [], unresolved: [], credits, failed: `review ${res.stop_reason}` } };
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const result = applyReviewEdits(opts.markdown, Array.isArray(out?.edits) ? out.edits : []);
    return {
      markdown: result.markdown,
      report: { applied: result.applied, skipped: result.skipped, unresolved: out?.unresolved ?? [], credits },
    };
  } catch (e) {
    if (!settled) await refundStage(supabase, wallet, ceiling, (e as Error).message);
    return empty(`review failed: ${(e as Error).message}`);
  }
}
