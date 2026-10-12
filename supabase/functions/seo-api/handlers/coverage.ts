/** What readers expect that a text does not answer: the answer engine's points, reader questions, the guides' shared sections. */

import type { DbClient } from '../../_shared/supabase-client.ts';
import { callClaudeMessages } from '../../_shared/ai-client.ts';
import { getToolPrompt } from '../../_shared/prompt-utils.ts';
import type { KeywordResearchResult } from '../../_shared/seo-types.ts';
import { serpValue } from './untrusted.ts';
import { reserveStage, settleStage, tokenCeiling, tokenCredits, type StageWallet } from './stage-billing.ts';

export const COVERAGE_MODEL = 'claude-sonnet-5';
const COVERAGE_MAX_INPUT_TOKENS = 16000;
const COVERAGE_MAX_OUTPUT_TOKENS = 2000;
const SOURCES = ['ai_answer', 'reader_question', 'guides', 'paa'];

const SCHEMA = {
  type: 'object',
  properties: {
    missing: {
      type: 'array',
      items: {
        type: 'object',
        properties: { point: { type: 'string' }, source: { type: 'string', enum: SOURCES } },
        required: ['point', 'source'],
        additionalProperties: false,
      },
    },
  },
  required: ['missing'],
  additionalProperties: false,
};

export interface MustCover { aiAnswer: string | null; questions: string[]; guideSections: string[]; paa: string[] }

export interface CoverageReport {
  missing: { point: string; source: string }[];
  checked: number;
  credits: number;
  checked_at: string;
  failed?: string;
}

const DISTINCTIVE_WHEN_NONE_SHARED = 8;

/** The sections most guides share; when they share none, each guide's own sections stand in. */
export function guideSectionsToCover(gc: KeywordResearchResult['guideContent']): string[] {
  if (!gc) return [];
  const common = (gc.common ?? []).map((c) => c.label);
  return common.length ? common : (gc.distinctive ?? []).slice(0, DISTINCTIVE_WHEN_NONE_SHARED).map((c) => c.label);
}

export function mustCoverFrom(research: KeywordResearchResult): MustCover {
  return {
    aiAnswer: research.aiModeAnswer?.text ?? research.serpSignals?.aiOverviewText ?? null,
    questions: research.readerQuestions ?? [],
    guideSections: guideSectionsToCover(research.guideContent),
    paa: research.paaQuestions ?? [],
  };
}

const itemCount = (m: MustCover) => (m.aiAnswer ? 1 : 0) + m.questions.length + m.guideSections.length + m.paa.length;

function mustCoverBlock(m: MustCover): string {
  const list = (title: string, items: string[]) =>
    items.length ? `\n${title}:\n${items.slice(0, 20).map((i) => `- ${serpValue(i, 300)}`).join('\n')}` : '';
  return [
    '<must_cover>',
    m.aiAnswer ? `ANSWER ENGINE (source ai_answer) — each point it makes is an item:\n${serpValue(m.aiAnswer, 3500)}` : '',
    list('READER QUESTIONS (source reader_question)', m.questions),
    list('SECTIONS THE GUIDES COVER (source guides)', m.guideSections),
    list('PEOPLE ALSO ASK (source paa)', m.paa),
    '</must_cover>',
  ].filter(Boolean).join('\n');
}

/** Never throws: a check that cannot run says so and lists nothing. */
export async function checkCoverage(
  supabase: DbClient,
  opts: { text: string; mustCover: MustCover; languageCode: string | null; userId: string; workspaceId: string | null },
): Promise<CoverageReport> {
  const checkedAt = new Date().toISOString();
  const checked = itemCount(opts.mustCover);
  if (!checked) return { missing: [], checked: 0, credits: 0, checked_at: checkedAt };

  const wallet: StageWallet = { userId: opts.userId, workspaceId: opts.workspaceId, opType: 'seo_coverage' };
  const ceiling = await tokenCeiling(supabase, COVERAGE_MODEL, COVERAGE_MAX_INPUT_TOKENS, COVERAGE_MAX_OUTPUT_TOKENS, 10);
  const hold = await reserveStage(supabase, wallet, ceiling, 'SEO coverage check');
  if (!hold.ok) return { missing: [], checked, credits: 0, checked_at: checkedAt, failed: `not checked: ${hold.error}` };

  let actual: number | null = null;
  try {
    const res = await callClaudeMessages({
      model: COVERAGE_MODEL,
      max_tokens: COVERAGE_MAX_OUTPUT_TOKENS,
      system: await getToolPrompt(supabase, 'seo_coverage_check'),
      messages: [{
        role: 'user',
        content: `Article language: ${opts.languageCode ?? 'en'}\n${mustCoverBlock(opts.mustCover)}\n<article>\n${serpValue(opts.text, 60000)}\n</article>`,
      }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    }, { task: 'seo_coverage', userId: opts.userId, workspaceId: opts.workspaceId, timeoutMs: 120_000 });
    actual = await tokenCredits(supabase, COVERAGE_MODEL, {
      inputTokens: Number(res.usage?.input_tokens ?? 0), outputTokens: Number(res.usage?.output_tokens ?? 0),
    });
    // A refusal or a truncated reply is a failed check, never a reply to salvage.
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') {
      const credits = await settleStage(supabase, wallet, ceiling, actual, { failed: res.stop_reason });
      return { missing: [], checked, credits, checked_at: checkedAt, failed: `check ${res.stop_reason}` };
    }
    const out = JSON.parse(res.content?.find((b) => b.type === 'text')?.text ?? '');
    const missing = Array.isArray(out?.missing) ? out.missing : [];
    const credits = await settleStage(supabase, wallet, ceiling, actual, { missing: missing.length });
    return { missing, checked, credits, checked_at: checkedAt };
  } catch (e) {
    const credits = await settleStage(supabase, wallet, ceiling, actual ?? 0, { failed: true });
    return { missing: [], checked, credits, checked_at: checkedAt, failed: (e as Error).message.slice(0, 200) };
  }
}
