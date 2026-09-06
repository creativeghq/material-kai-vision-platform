import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  normalizeContentBrief,
  briefValue,
  briefList,
  briefExtraContextBlock,
} from '../../supabase/functions/seo-api/handlers/content-brief.ts';

/**
 * `content_brief` reaches every SEO stage through a tool schema of `z.any()`, so the brief
 * the model composes is the brief the prompt builders get. They read it structurally —
 * `brief.audience.painPoints.join(', ')`, `brief.brandVoice.toneAttributes.join(', ')` —
 * sixteen dereferences across plan / write / analyze.
 *
 * On 2026-09-06 the marketing agent sent this, which is a perfectly good brief:
 *
 *   { market, audience: "<prose>", language, mustCover: [...], brandVoice: "<prose>",
 *     businessContext, provenance }
 *
 * and article 8b8d7383 died at 30% with `Cannot read properties of undefined (reading
 * 'join')`, after the debit. Two properties matter here:
 *
 *   1. no input shape throws — a brief is optional, additive prompt context, so a wrong
 *      shape must never be the reason a paid run fails; and
 *   2. what the caller wrote still REACHES the model. The builders only read the keys they
 *      know, so `mustCover` / `businessContext` / `market` — the only workspace-specific
 *      information in that request — would have been dropped even had it not crashed.
 */

/** The exact brief stored on article 8b8d7383-a6a9-415f-ba78-5749fbcf8454. */
const BRIEF_THAT_CRASHED_THE_PIPELINE = {
  market: 'Greece',
  audience: 'Ιδιοκτήτες που ανακαινίζουν μπάνιο και επαγγελματίες (μηχανικοί, εργολάβοι)',
  language: 'el-GR',
  mustCover: ['κεραμικά vs πορσελανάτα', 'αντιολισθηρότητα R9-R13', 'ενδεικτικό κόστος ανά τ.μ.'],
  brandVoice: 'Τεχνικά ακριβής, πρακτικός, χωρίς υπερβολές.',
  provenance: { aiDisclosure: 'ai_assisted', publisherName: 'Materials Hub' },
  businessContext: 'Materials Hub (materialshub.gr) — χονδρικό εμπόριο δομικών υλικών, Θεσσαλονίκη.',
};

/** A brief shaped exactly as `ContentBrief` declares. Must keep working unchanged. */
const WELL_FORMED_BRIEF = {
  businessObjective: 'lead_generation',
  conversionGoal: 'Quote request',
  audience: {
    primaryPersona: 'Renovating homeowner',
    knowledgeLevel: 'beginner',
    painPoints: ['Too many options', 'Unclear pricing'],
    decisionStage: 'consideration',
    contentPreferences: null,
  },
  brandVoice: {
    toneAttributes: ['practical', 'precise'],
    personalityTraits: ['direct'],
    writingStyle: 'Short paragraphs',
    terminologyPreferences: ['porcelain'],
    avoidList: ['cheap'],
    exampleContentUrls: [],
  },
  contentType: 'guide',
  callToAction: 'Request a quote',
  requiredPoints: ['R-rating'],
  internalLinksContext: ['/tiles'],
  clusterContext: { pillarTopic: 'Tiles', relatedArticles: ['Floor tiles'], differentiationNote: null },
  performanceFeedback: { previousArticleScores: [{ topIssue: 'thin intro' }], audienceFeedbackNotes: null },
};

describe('normalizeContentBrief', () => {
  it('survives the brief that actually killed the run', () => {
    const brief = normalizeContentBrief(BRIEF_THAT_CRASHED_THE_PIPELINE);
    expect(brief).not.toBeNull();
    // The dereference behind "Cannot read properties of undefined (reading 'join')".
    expect(() => brief!.audience.painPoints.join(', ')).not.toThrow();
    expect(() => brief!.brandVoice.toneAttributes.join(', ')).not.toThrow();
    expect(() => brief!.brandVoice.avoidList.join(', ')).not.toThrow();
  });

  it('keeps prose written into a field declared as an object', () => {
    const brief = normalizeContentBrief(BRIEF_THAT_CRASHED_THE_PIPELINE)!;
    // `audience` and `brandVoice` are the declared keys with the wrong TYPE — coerced into
    // the field that carries prose, not discarded.
    expect(brief.audience.primaryPersona).toContain('Ιδιοκτήτες');
    expect(brief.brandVoice.writingStyle).toContain('Τεχνικά');
  });

  it('carries the keys the caller invented through to the prompt', () => {
    const brief = normalizeContentBrief(BRIEF_THAT_CRASHED_THE_PIPELINE)!;
    const block = briefExtraContextBlock(brief);

    // Everything workspace-specific in that request lived in keys ContentBrief does not
    // declare. Dropping them silently is how a filled-in brief changes nothing.
    expect(block).toContain('Greece');
    expect(block).toContain('R9-R13');
    expect(block).toContain('materialshub.gr');
    expect(block).toContain('el-GR');

    // ...and only those: a declared key must not be duplicated into the extra block.
    expect(brief.extraContext.join('\n')).not.toContain('Τεχνικά');
  });

  it('leaves a well-formed brief exactly as it was', () => {
    const brief = normalizeContentBrief(WELL_FORMED_BRIEF)!;
    expect(brief.businessObjective).toBe('lead_generation');
    expect(brief.audience).toMatchObject(WELL_FORMED_BRIEF.audience);
    expect(brief.brandVoice).toMatchObject(WELL_FORMED_BRIEF.brandVoice);
    expect(brief.clusterContext).toMatchObject(WELL_FORMED_BRIEF.clusterContext);
    expect(brief.performanceFeedback!.previousArticleScores).toEqual([
      { title: null, score: null, topIssue: 'thin intro' },
    ]);
    expect(brief.requiredPoints).toEqual(['R-rating']);
    expect(brief.extraContext).toEqual([]);
  });

  it('never throws, whatever arrives', () => {
    const inputs: unknown[] = [
      null, undefined, '', 'just a sentence', 42, true, [], ['a', 'b'], {},
      { audience: 42 },
      { audience: { painPoints: 'one string' } },
      { brandVoice: { toneAttributes: null, avoidList: { nested: 'object' } } },
      { clusterContext: 'not an object' },
      { performanceFeedback: { previousArticleScores: 'nope' } },
      { performanceFeedback: { previousArticleScores: ['a bare string'] } },
      { provenance: [] },
      { firsthandExperience: { proprietaryData: 'one measurement' } },
      { requiredPoints: [null, undefined, 3, 'real'] },
    ];

    for (const input of inputs) {
      const brief = normalizeContentBrief(input);
      if (brief === null) continue;
      expect(() => {
        brief.audience.painPoints.join(', ');
        brief.brandVoice.toneAttributes.join(', ');
        brief.brandVoice.personalityTraits.join('. ');
        brief.brandVoice.avoidList.join(', ');
        brief.brandVoice.terminologyPreferences.join(', ');
        brief.requiredPoints.map((p) => p);
        brief.internalLinksContext.join(', ');
        brief.clusterContext?.relatedArticles.join(', ');
        brief.performanceFeedback?.previousArticleScores.map((a) => a.topIssue).join(', ');
        brief.firsthandExperience?.proprietaryData.join(', ');
        briefExtraContextBlock(brief);
      }, `threw on ${JSON.stringify(input)}`).not.toThrow();
    }
  });

  it('is idempotent — the pipeline normalizes, then every stage normalizes again', () => {
    // The pipeline stores the normalized brief on the article row and hands it to each
    // stage, so this function sees its own output on every real run. Without `extraContext`
    // being a known key the second pass folds the whole list back into one run-on bullet.
    const once = normalizeContentBrief(BRIEF_THAT_CRASHED_THE_PIPELINE)!;
    const twice = normalizeContentBrief(once)!;
    const thrice = normalizeContentBrief(twice)!;

    expect(twice).toEqual(once);
    expect(thrice).toEqual(once);
    expect(briefExtraContextBlock(twice)).toBe(briefExtraContextBlock(once));
    expect(twice.extraContext.join('\n')).not.toContain('Extra context');
  });

  it('keeps an invented key whose value has structure', () => {
    // `asText` returns null for an object, so a one-level renderer flattened
    // `{ competitors: [{...}] }` to nothing and dropped it — the same defect one level down.
    const brief = normalizeContentBrief({
      competitors: [{ name: 'Tile Co', url: 'https://tile.example' }],
      constraints: { budget: 'mid', deadline: '2026-10-01' },
    })!;
    const block = briefExtraContextBlock(brief);
    expect(block).toContain('Tile Co');
    expect(block).toContain('tile.example');
    expect(block).toContain('mid');
    expect(block).not.toContain('[object Object]');
  });

  it('treats a brief sent as bare prose as business context, not as nothing', () => {
    const brief = normalizeContentBrief('We sell wholesale tiles in Thessaloniki.')!;
    expect(briefExtraContextBlock(brief)).toContain('Thessaloniki');
  });

  it('returns null only when there is genuinely nothing', () => {
    for (const empty of [null, undefined, '', '   ', []]) {
      expect(normalizeContentBrief(empty)).toBeNull();
    }
  });

  it('narrows the enums the writer branches on, and drops a value it does not know', () => {
    // `brief.audience.knowledgeLevel === 'beginner'` switches a whole instruction on. A free
    // -text level must not silently read as one of the four.
    expect(normalizeContentBrief({ audience: { knowledgeLevel: 'BEGINNER' } })!.audience.knowledgeLevel)
      .toBe('beginner');
    expect(normalizeContentBrief({ audience: { knowledgeLevel: 'quite good' } })!.audience.knowledgeLevel)
      .toBeNull();
    expect(normalizeContentBrief({ provenance: { aiDisclosure: 'invented' } })!.provenance!.aiDisclosure)
      .toBeNull();
  });

  it('keeps an absent value out of the prompt as words, never as a blank or "undefined"', () => {
    expect(briefValue(null)).toBe('Not specified');
    expect(briefValue('')).toBe('Not specified');
    expect(briefValue('beginner')).toBe('beginner');
    expect(briefList([])).toBe('Not specified');
    expect(briefList(['a', 'b'])).toBe('a, b');
  });

  it('omits the extra block entirely when there is nothing extra', () => {
    expect(briefExtraContextBlock(null)).toBe('');
    expect(briefExtraContextBlock(normalizeContentBrief(WELL_FORMED_BRIEF))).toBe('');
    // An invented key whose value is empty says nothing — it must not print a bare label.
    expect(briefExtraContextBlock(normalizeContentBrief({ market: '', notes: [] }))).toBe('');
  });
});

describe('the handlers normalize instead of dereferencing the raw body', () => {
  // A normalizer nothing calls is the same as no normalizer, and one call site left reading
  // `body.content_brief` structurally reopens the whole class.
  const HANDLER_DIR = 'supabase/functions/seo-api/handlers';
  const HANDLERS = ['plan.ts', 'write.ts', 'analyze.ts', 'pipeline.ts'] as const;

  it.each(HANDLERS)('%s normalizes the brief', (file) => {
    const src = readFileSync(join(process.cwd(), HANDLER_DIR, file), 'utf-8');
    expect(src, `${file} never calls normalizeContentBrief`).toContain('normalizeContentBrief(');
  });

  it.each(HANDLERS)('%s never reaches into an un-normalized brief', (file) => {
    const src = readFileSync(join(process.cwd(), HANDLER_DIR, file), 'utf-8');
    // `body.content_brief` may only be READ to hand to the normalizer. Any property access
    // on it is the bug this file exists for.
    const raw = src.match(/body\.content_brief[?.]*\.\w+/g) ?? [];
    expect(raw, `${file} dereferences body.content_brief directly: ${raw.join(', ')}`).toEqual([]);
  });

  it('plan.ts budgets for reasoning tokens on a thinking model', () => {
    // Gemini counts thinking against maxOutputTokens. At 4096 the split was 3,929 reasoning
    // + 151 text and every plan was cut off mid-JSON with finishReason MAX_TOKENS, reported
    // as "No object generated: could not parse the response."
    const src = readFileSync(join(process.cwd(), HANDLER_DIR, 'plan.ts'), 'utf-8');
    const budget = src.match(/const PLAN_MAX_OUTPUT_TOKENS = (\d+)/);
    expect(budget, 'plan.ts no longer declares PLAN_MAX_OUTPUT_TOKENS').not.toBeNull();
    // Room for the observed reasoning burn plus a full plan, not just one of them.
    expect(Number(budget![1])).toBeGreaterThanOrEqual(8192);
    expect(src).toContain('maxTokens: PLAN_MAX_OUTPUT_TOKENS');
  });

  it('write.ts budgets for a language that is not English, and says so when it overruns', () => {
    // Prose truncation is silent in a way the plan stage's was not: a cut-off article is a
    // valid string, so `analyze` scores it, auto-fixes it and the pipeline publishes it with
    // a byline. 8192 was a fine ceiling for a 2,000-word English article and not for the
    // Greek one this pipeline was first asked for (~2.5–3.5 tokens/word).
    const src = readFileSync(join(process.cwd(), HANDLER_DIR, 'write.ts'), 'utf-8');
    const budget = src.match(/const WRITE_MAX_OUTPUT_TOKENS = (\d+)/);
    expect(budget, 'write.ts no longer declares WRITE_MAX_OUTPUT_TOKENS').not.toBeNull();
    expect(Number(budget![1])).toBeGreaterThanOrEqual(16000);
    expect(src).toContain('maxTokens: WRITE_MAX_OUTPUT_TOKENS');
    expect(src, 'a truncated article is accepted silently').toContain("finishReason === 'length'");
  });

  it('plan.ts expresses the outline without a recursive schema', () => {
    // `z.lazy` self-reference cannot be sent to Google: the provider logged "Recursive
    // reference detected ... Defaulting to any" on every call, so `subsections` reached the
    // model with no schema at all.
    const src = readFileSync(join(process.cwd(), HANDLER_DIR, 'plan.ts'), 'utf-8');
    expect(src).not.toContain('z.lazy(');
  });
});

describe('create_seo_article can say which market it is for', () => {
  it('offers language_code and location_code', () => {
    // The pipeline defaults to 2840/'en' (the US, in English). `seo_keyword_research` has
    // always taken these and the pipeline tool did not, so "for Greece" researched American
    // SERPs — a plausible-looking result that nothing could flag.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/_shared/tools/seo-tools.ts'),
      'utf-8',
    );
    const tool = src.slice(src.indexOf('createSEOPipelineTool'));
    expect(tool).toContain('language_code');
    expect(tool).toContain('location_code');
  });

  it('reaches the stages that WRITE, not only the one that researches', () => {
    // `language_code` is a DataForSEO parameter, so it was wired to research and nowhere
    // else: the output language was an emergent property of Greek research rather than an
    // instruction. The tool description promises "researched and written in".
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/seo-api/handlers/pipeline.ts'),
      'utf-8',
    );
    for (const stage of ["'plan'", "'write'"]) {
      const at = src.indexOf(`callStage(${stage}`);
      expect(at, `pipeline no longer calls callStage(${stage})`).toBeGreaterThan(-1);
      const call = src.slice(at, src.indexOf('}, ', at));
      expect(call, `${stage} stage is not told the language`).toContain('language_code');
    }
  });

  it('gives the plan stage as long as the stages either side of it', () => {
    // The 60s cap was set when the plan call had a budget it could not finish in anyway.
    // Losing this race does not cancel handlePlan: it completes, keeps its 2 credits, and
    // the pipeline fails holding a plan that exists.
    const src = readFileSync(
      join(process.cwd(), 'supabase/functions/seo-api/handlers/pipeline.ts'),
      'utf-8',
    );
    const planCall = src.slice(src.indexOf("callStage('plan'"));
    const timeout = planCall.match(/\}, (\d[\d_]*)\);/);
    expect(timeout, 'plan stage has no explicit timeout').not.toBeNull();
    expect(Number(timeout![1].replace(/_/g, ''))).toBeGreaterThanOrEqual(180_000);
  });
});
