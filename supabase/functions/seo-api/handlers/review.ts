/** Editor's review after the writer: claims vs our page facts, sums, language; exact edits applied by match. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { DEFAULT_CLAUDE_MODEL, callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { NormalizedBrief } from './content-brief.ts';
import { sitePagesBlock, sitePagesDataLines, type SitePage } from './site-pages.ts';
import { applyReviewEdits, type ReviewEdit } from './site-assets.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

const REVIEW_MAX_INPUT_TOKENS = 14000;
const REVIEW_CONCURRENCY = 4;
const REVIEW_MAX_OUTPUT_TOKENS = 6000;
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

function sections(markdown: string): string[] {
  return markdown.split(/\n(?=## )/).map((s) => s.trim()).filter(Boolean);
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
  const parts = sections(opts.markdown);
  const perPart = await tokenCeiling(supabase, DEFAULT_CLAUDE_MODEL, REVIEW_MAX_INPUT_TOKENS, REVIEW_MAX_OUTPUT_TOKENS, 25);
  const ceiling = perPart * parts.length;
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO article review');
  if (!hold.ok) {
    return { markdown: opts.markdown, report: { applied: [], skipped: [], unresolved: [], credits: 0, failed: `not reviewed: ${hold.error}` } };
  }

  const system = await getToolPrompt(supabase, 'seo_reviewer') + businessContext(opts.brief);
  const facts = sitePagesBlock(sitePagesDataLines(opts.sitePages));
  const edits: ReviewEdit[] = [];
  const unresolved: { quote: string; note: string }[] = [];
  const priced: (number | null)[] = [];
  const failures: string[] = [];
  const queue = [...parts];
  const worker = async () => {
    for (let part = queue.shift(); part; part = queue.shift()) {
      try {
        const res = await callClaudeMessages({
          model: DEFAULT_CLAUDE_MODEL,
          max_tokens: REVIEW_MAX_OUTPUT_TOKENS,
          system,
          messages: [{
            role: 'user',
            content: `Article language: ${opts.languageCode ?? 'en'}\n${facts}\n`
              + `Review this ONE section of the article; the rest is reviewed separately.\n<article>\n${part}\n</article>`,
          }],
          output_config: { format: { type: 'json_schema', schema: SCHEMA } },
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
        if (Array.isArray(out?.edits)) edits.push(...out.edits);
        if (Array.isArray(out?.unresolved)) unresolved.push(...out.unresolved);
      } catch (e) {
        failures.push((e as Error).message.slice(0, 200));
      }
    }
  };
  await Promise.all(Array.from({ length: REVIEW_CONCURRENCY }, worker));

  const actual = priced.some((c) => c === null) ? null : priced.reduce<number>((s, c) => s + (c ?? 0), 0);
  const credits = await settleStage(supabase, wallet, ceiling, actual, { sections: parts.length, failed: failures.length });
  const result = applyReviewEdits(opts.markdown, edits);
  return {
    markdown: result.markdown,
    report: {
      applied: result.applied, skipped: result.skipped, unresolved, credits,
      ...(failures.length ? { failed: `${failures.length} of ${parts.length} sections not reviewed: ${failures[0]}` } : {}),
    },
  };
}
