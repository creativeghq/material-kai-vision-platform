import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SEO_ARTICLE_DEMO_DATA } from '../../src/data/demo/seo-article';
import { fixListState } from '../../src/components/features/ai/seoFixState';

/**
 * The demo article is the EXECUTABLE CONTRACT between the pipeline and the viewer.
 *
 * `DemoAgentResults` renders `<SEOArticleViewer initialArticle={SEO_ARTICLE_DEMO_DATA.data} />`
 * — the same component the real path uses. So the demo is not a mock of the viewer, it is a
 * finished article handed to the real thing, and it is the only place in the repo where the
 * complete shape of a completed article is written down. That makes it the reference: if the
 * demo renders every tab and a real article does not, the difference is the DATA.
 *
 * This matters because the two halves cannot see each other. The pipeline is Deno under
 * `supabase/functions`, the viewer is React under `src/`, and the field names that join them
 * (`optimize_data`, `brief_data`, `gaps_gains_data`, `research_tab_data`, `interlinking_data`)
 * are strings on both sides with nothing holding them equal. Renaming one is a silent
 * regression that shows up only when an article completes — which, at the time this file was
 * written, had never once happened.
 *
 * Three properties, each of which has already broken here at least once:
 *   1. viewer ↔ pipeline ↔ demo agree on the tab dataset names;
 *   2. every section score the analyzer emits has a human label, and no label is dead;
 *   3. everything the pipeline writes survives the write — as a real column, or folded into
 *      `stages_data.extra` and pulled back up by `hydrateArticle`.
 */

const ROOT = process.cwd();
const HANDLERS = join(ROOT, 'supabase/functions/seo-api/handlers');
const VIEWER = join(ROOT, 'src/components/features/ai/SEOArticleViewer.tsx');

const viewerSrc = readFileSync(VIEWER, 'utf-8');
const pipelineSrc = readFileSync(join(HANDLERS, 'pipeline.ts'), 'utf-8');
const analyzeSrc = readFileSync(join(HANDLERS, 'analyze.ts'), 'utf-8');

const demo = SEO_ARTICLE_DEMO_DATA.data as Record<string, unknown>;

/** The five per-tab payloads. Each one is a whole tab that renders or does not. */
const TAB_DATASETS = [
  'optimize_data',
  'brief_data',
  'gaps_gains_data',
  'research_tab_data',
  'interlinking_data',
] as const;

describe('the demo article and the real pipeline describe the same article', () => {
  it.each(TAB_DATASETS)('%s is present in the demo, written by the pipeline, read by the viewer', (key) => {
    // The demo is the reference: it is what a completed article looks like.
    expect(demo[key], `the demo fixture no longer carries ${key}`).toBeTruthy();

    // The pipeline must WRITE it under that exact name...
    expect(pipelineSrc, `pipeline never writes ${key}`).toContain(`${key}:`);

    // ...and the viewer must READ it under that exact name.
    expect(viewerSrc, `viewer never reads article.${key}`).toContain(`article.${key}`);
  });

  it('the viewer renders a tab for every dataset and no tab for one nothing produces', () => {
    // A tab whose data nothing writes is a permanent empty state; a dataset with no tab is
    // work the pipeline paid for and threw away.
    const rendered = TAB_DATASETS.filter((k) => viewerSrc.includes(`article.${k} && (`));
    expect(rendered.sort()).toEqual([...TAB_DATASETS].sort());
  });

  it('the scalar fields the viewer shows outside the tabs are written too', () => {
    // Title, metas, scores, word count, the FAQ questions and the markdown itself — what the
    // user sees before opening any tab. `meta_title` and `secondary_keywords` are written at
    // the PLAN stage, the rest at finalize, so this asserts against the whole file.
    const HEADLINE_FIELDS = [
      'title', 'slug', 'meta_title', 'meta_description', 'secondary_keywords',
      'markdown_content', 'word_count', 'seo_score', 'readability_score',
      'overall_score', 'reading_time_minutes', 'faq_schema', 'schema_markup',
      'keyword_density',
    ];
    for (const field of HEADLINE_FIELDS) {
      expect(demo, `the demo fixture no longer carries ${field}`).toHaveProperty(field);
      expect(pipelineSrc, `pipeline never writes ${field}`).toContain(`${field}:`);
    }
  });
});

describe('every section score the analyzer emits reaches the screen with a name', () => {
  /** Keys of the object `buildSectionScores` returns. */
  function analyzerSectionKeys(): string[] {
    const start = analyzeSrc.indexOf('function buildSectionScores');
    expect(start, 'analyze.ts no longer has buildSectionScores').toBeGreaterThan(-1);
    const body = analyzeSrc.slice(start, analyzeSrc.indexOf('\n}', start));
    const returnAt = body.indexOf('return {');
    return [...body.slice(returnAt).matchAll(/^\s{4}([a-zA-Z0-9]+):\s*(?:makeScore|\{)/gm)].map((m) => m[1]);
  }

  /** Keys of the viewer's `SECTION_NAMES` label map. */
  function viewerSectionKeys(): string[] {
    const start = viewerSrc.indexOf('const SECTION_NAMES');
    expect(start, 'the viewer no longer has SECTION_NAMES').toBeGreaterThan(-1);
    const body = viewerSrc.slice(start, viewerSrc.indexOf('\n};', start));
    return [...body.matchAll(/^\s{2}([a-zA-Z0-9]+):\s*'/gm)].map((m) => m[1]);
  }

  it('finds a non-trivial number of section scores on both sides', () => {
    // A regex that silently matches nothing would make every assertion below vacuous.
    expect(analyzerSectionKeys().length).toBeGreaterThan(5);
    expect(viewerSectionKeys().length).toBeGreaterThan(5);
  });

  it('has a label for every emitted key, and no label for a key nothing emits', () => {
    // Two registries in two runtimes. An unlabelled key renders as a raw identifier next to
    // properly-named rows; a dead label is a row the user has been promised and never sees.
    expect(new Set(viewerSectionKeys())).toEqual(new Set(analyzerSectionKeys()));
  });
});

describe('what the pipeline writes actually survives the write', () => {
  /**
   * PostgREST rejects the WHOLE statement when any one column is unknown, so a single
   * non-column in an update payload lands NOTHING and takes the real columns down with it.
   * That is why finished articles used to have `title = NULL`, no markdown and a status
   * stuck mid-pipeline while the endpoint returned `{success: true}`.
   *
   * `updateArticle` splits the payload against `ARTICLE_COLUMNS` and folds the remainder into
   * `stages_data.extra`; the viewer's `hydrateArticle` folds it back up. Both halves of that
   * arrangement have to exist, or the fields go nowhere.
   */
  it('routes every final field through the column allowlist, not straight at the table', () => {
    const finalWrite = pipelineSrc.slice(pipelineSrc.indexOf("status: 'completed',") - 2000);
    expect(pipelineSrc, 'pipeline no longer declares ARTICLE_COLUMNS').toContain('const ARTICLE_COLUMNS');
    expect(pipelineSrc, 'the allowlist is not applied').toContain('function splitByColumn');
    expect(finalWrite, 'the completion write bypasses updateArticle').toContain('await updateArticle(');
  });

  it('the viewer folds stages_data.extra back up, or none of the tabs ever have data', () => {
    expect(viewerSrc, 'hydrateArticle is gone').toContain('function hydrateArticle');
    expect(viewerSrc).toContain("(row?.stages_data as any)?.extra");
    // Both entry points: the one-shot fetch AND the progress poll. Hydrating only one of them
    // makes a finished article render its tabs or not depending on whether the user was
    // watching while it completed.
    const hydrateCalls = viewerSrc.match(/hydrateArticle\(data\)/g) ?? [];
    expect(hydrateCalls.length, 'an entry point loads an article without hydrating it').toBe(2);
  });

  it('a real column still wins over a stale copy in extra', () => {
    // `extra` is the fallback, never an override — otherwise an early stage's copy masks the
    // finished one and the article renders as it looked halfway through.
    const fn = viewerSrc.slice(viewerSrc.indexOf('function hydrateArticle'));
    expect(fn.slice(0, fn.indexOf('\n}'))).toContain('=== null || merged[key] === undefined');
  });
});

/**
 * The Apply card must say why it is empty.
 *
 * The card rendered `null` whenever no fix was applicable, and every fix in the database was
 * inapplicable — analyses produced before the analyzer learned to anchor carry no `scope` and no
 * `anchor`, so the filter matched nothing. The result: an Apply/Revert feature that was built,
 * tested against the handler, deployed, and did not exist on screen. Nothing could see it. The
 * handler tests passed (they call the edge function directly), the types were satisfied (a fix
 * with no `scope` is a valid fix), and the UI has no assertion that says "be visible".
 *
 * `fixListState` is the whole verdict, exported so it can be tested as a value rather than
 * inferred from a render.
 */
describe('the Apply card explains itself rather than disappearing', () => {
  const fix = (over: Record<string, unknown> = {}) => ({
    category: 'readability',
    severity: 'medium',
    description: 'A long paragraph.',
    suggestion: 'Break this paragraph into two or three shorter ones.',
    affectedSection: null,
    ...over,
  });

  it('an analysis older than anchoring reads as STALE, not as "nothing to do"', () => {
    // The exact shape found in every stored article: fixes present, not one carrying a scope.
    const state = fixListState({ fixes: [fix(), fix({ category: 'links' })] });
    expect(state.kind).toBe('stale');
  });

  it('a fix anchored to a paragraph is applicable', () => {
    const state = fixListState({ fixes: [fix({ scope: 'section', anchor: 'A long paragraph of prose.' })] });
    expect(state.kind).toBe('applicable');
    expect(state.kind === 'applicable' && state.fixes).toHaveLength(1);
  });

  it('a scoped analysis with nothing anchored is document-only, which is a different sentence', () => {
    // "We looked and none of these can be fixed by rewriting one paragraph" is a real answer.
    // "Your analysis is too old to say" is a different one, and it has a button that fixes it.
    const state = fixListState({
      fixes: [fix({ scope: 'config', category: 'provenance' }), fix({ scope: 'document', category: 'links' })],
    });
    expect(state.kind).toBe('document-only');
  });

  it('separates a clean article from one that was never analysed', () => {
    expect(fixListState({ fixes: [] }).kind).toBe('clean');
    expect(fixListState(null).kind).toBe('unanalysed');
    expect(fixListState({}).kind).toBe('unanalysed');
    expect(fixListState({ fixes: 'not an array' }).kind).toBe('unanalysed');
  });

  it('an anchor that is present but empty does not count as applicable', () => {
    // `anchor: ''` would splice against every position in the document.
    expect(fixListState({ fixes: [fix({ scope: 'section', anchor: '' })] }).kind).toBe('document-only');
  });

  it('the card has no early return — every state renders something', () => {
    const card = viewerSrc.slice(viewerSrc.indexOf('function ApplicableFixes('));
    const body = card.slice(0, card.indexOf('\n}\n'));
    expect(
      body,
      'ApplicableFixes must not return null. It did, for every article that existed, which is '
      + 'how a shipped feature stayed invisible.',
    ).not.toMatch(/return null/);
  });

  it('every empty state has copy, so a new one cannot render a blank card', () => {
    // The map is keyed by the union minus `applicable`, so TypeScript already refuses a missing
    // entry — but only while the map stays exhaustive by TYPE. Assert the four exist by name.
    const copy = readFileSync(join(ROOT, 'src/components/features/ai/seoFixState.ts'), 'utf-8');
    const block = copy.slice(copy.indexOf('FIX_STATE_COPY'));
    for (const kind of ['stale', "'document-only'", 'clean', 'unanalysed']) {
      expect(block, `no copy for the ${kind} state`).toContain(kind);
    }
  });

  it('offers the way out of the stale state', () => {
    // An empty state that names a problem and offers no action is the empty-state rule broken.
    expect(viewerSrc).toContain("action: 'reanalyze'");
    expect(viewerSrc).toMatch(/onReanalyze/);
  });
});

/**
 * A write that changes the article body must also refresh the fix list, or the list describes
 * text that is no longer there — and the anchor of the fix just applied is precisely the text
 * that is gone. Pressing it again could only ever return "that paragraph is no longer in the
 * article", which is true, correct, and a dead end.
 */
describe('applying or reverting a fix refreshes the analysis it invalidated', () => {
  const applySrc = readFileSync(join(HANDLERS, 'apply-fix.ts'), 'utf-8');

  it('both handlers persist the re-derived analysis, not just the score', () => {
    expect((applySrc.match(/persistAnalysis\(/g) ?? []).length, 'apply and revert must both persist').toBe(2);
  });

  it('and hand it back, so the screen does not need a reload to agree with the database', () => {
    expect((applySrc.match(/analysis: reanalysed/g) ?? []).length).toBe(2);
    expect(viewerSrc).toContain('content_analysis: data.data.analysis ?? prev.content_analysis');
  });

  it('the re-analysis reads the brief on both paths', () => {
    // Revert passed `null` where apply passed the real brief, so the same text scored differently
    // depending on which direction you arrived from — the provenance and firsthand-experience
    // checks read the brief.
    const revert = applySrc.slice(applySrc.indexOf('export async function handleRevertFix'));
    expect(revert).toContain('normalizeContentBrief(article.content_brief)');
    expect(revert, 'a brief-less re-score gives a different answer for identical text').not.toContain('undefined, null, undefined');
  });

  it('re-analysis never rewrites the article body', () => {
    // What makes it safe to offer unconditionally. A "refresh" that silently edited the article
    // would make the honest answer too expensive to act on.
    const reanalyze = readFileSync(join(HANDLERS, 'reanalyze.ts'), 'utf-8');
    expect(reanalyze).not.toMatch(/markdown_content:/);
    expect(reanalyze, 'the analyzer is pure TypeScript; charging for it would be charging for nothing')
      .not.toMatch(/debit_credits/);
  });

  it('and it checks ownership the way every other article route does', () => {
    const reanalyze = readFileSync(join(HANDLERS, 'reanalyze.ts'), 'utf-8');
    expect(reanalyze).toContain('loadOwnedArticle');
    const access = readFileSync(join(HANDLERS, 'article-access.ts'), 'utf-8');
    // 404 on a foreign article, never 403 — invariant 1.
    expect(access).toContain('userCanAccessWorkspace');
    expect((access.match(/'Not found'/g) ?? []).length).toBeGreaterThanOrEqual(3);
    // The status literal, not the word: the file explains WHY it never returns 403.
    expect(access, 'a foreign article must 404, never 403 — 403 confirms the id exists').not.toMatch(/,\s*403\)/);
  });
});
