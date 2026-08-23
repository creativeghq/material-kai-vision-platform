/**
 * SEO Article Pipeline Tools: callSEOFunction helper,
 * createSEOKeywordResearchTool, createSEOArticlePlannerTool,
 * createSEOArticleWriterTool, createSEOContentAnalyzerTool, createSEOPipelineTool
 *
 * Workflow chunks: each tool emits workflow_plan (research only — first step)
 * and workflow_step_progress chunks so the WorkflowWizardCard / Tracker
 * advance step-by-step. Run_id stability comes from the agent passing
 * `_workflow_run_id` (extracted from `[workflow:seo-article/<step>:<run_id>]`
 * prefix in the user message) to every tool. Falls back to the research_id
 * generated on the first call when `_workflow_run_id` is absent.
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createWorkflowEmitter, STEPS } = await import('./_workflow-chunks.ts');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type ChunkSink = ((chunk: any) => void) | undefined;

// ═══════════════════════════════════════════════════════════════
// SEO Article Pipeline Tools
// ═══════════════════════════════════════════════════════════════

/** Helper to call the unified seo-api edge function from agent tools.
 *  Legacy callers pass functionName='seo-X' — we map that to action='X' on /seo-api. */
export async function callSEOFunction(functionName: string, body: any, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // Convert legacy seo-X name → action; e.g. seo-toolkit-research → toolkit_research
  const action = functionName.replace(/^seo-/, '').replace(/-/g, '_');
  const payload = { action, ...body };

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/seo-api`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      const errText = await response.text().catch(() => response.statusText);
      return { success: false, error: `${functionName} failed (${response.status}): ${errText || response.statusText}` };
    }
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: `${functionName} timed out after ${timeoutMs / 1000}s` };
    }
    return { success: false, error: error.message };
  }
}

/**
 * SEO Tool: Keyword Research
 * Calls seo-research edge function → DataForSEO API
 */
export const createSEOKeywordResearchTool = (userId: string, onProgress?: (status: string) => void, onChunk?: ChunkSink) => {
  return tool(
    async ({ topic, target_keyword, language_code, location_code, website_id, _workflow_run_id }) => {
      // Workflow run_id strategy: prefer agent-passed _workflow_run_id (extracted
      // from `[workflow:seo-article/research:<run_id>]` prefix). Fall back to a
      // generated UUID — the frontend's run_id migration handler will reattach
      // it to the locally-booted wizard run on the first workflow_plan chunk.
      const runId = _workflow_run_id || crypto.randomUUID();
      const emitter = createWorkflowEmitter({ onChunk, definition_id: 'seo-article', run_id: runId });
      emitter.plan({ title: target_keyword, subtitle: topic });
      emitter.step({ step_id: STEPS.SEO_ARTICLE[0], status: 'running', status_line: `Researching keywords for "${target_keyword}"…`, input: { topic, target_keyword, language_code, location_code } });
      try {
        onProgress?.(`Researching keywords for "${target_keyword}"...`);

        const result = await callSEOFunction('seo-research', {
          topic,
          target_keyword,
          language_code: language_code || 'en',
          location_code: location_code || 2840,
          user_id: userId,
          website_id: website_id || undefined,
        }, 60_000);

        if (!result.success) {
          emitter.step({ step_id: STEPS.SEO_ARTICLE[0], status: 'failed', error_message: result.error || 'Keyword research failed' });
          return JSON.stringify({ success: false, error: result.error || 'Keyword research failed' });
        }

        onProgress?.(`Found ${result.data?.research?.totalKeywords || 0} keywords for "${target_keyword}"`);

        const summary = {
          total_keywords: result.data?.research?.totalKeywords || 0,
          total_volume: result.data?.research?.totalAddressableVolume || 0,
          clusters: result.data?.research?.clusters?.length || 0,
          top_keywords: result.data?.research?.keywords?.slice(0, 10)?.map((k: any) => ({
            keyword: k.keyword,
            volume: k.searchVolume,
            difficulty: k.difficulty,
            opportunity: k.opportunityScore,
          })),
          paa_questions: result.data?.research?.paaQuestions?.slice(0, 5),
          competitors: result.data?.research?.competitors?.slice(0, 5)?.map((c: any) => ({
            url: c.url,
            title: c.title,
            position: c.position,
          })),
        };

        emitter.step({
          step_id: STEPS.SEO_ARTICLE[0],
          status: 'done',
          status_line: `${summary.total_keywords} keywords · ${summary.total_volume.toLocaleString?.() || summary.total_volume} total volume`,
          output: { research_id: result.data?.research_id, total_keywords: summary.total_keywords, total_volume: summary.total_volume },
        });

        return JSON.stringify({
          success: true,
          research_id: result.data?.research_id,
          _workflow_run_id: runId,
          summary,
        });
      } catch (error: any) {
        console.error('SEO keyword research error:', error);
        emitter.step({ step_id: STEPS.SEO_ARTICLE[0], status: 'failed', error_message: error.message });
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_keyword_research',
      description: 'Research keywords for SEO article writing. Uses DataForSEO to find keyword volumes, difficulty, related keywords, People Also Ask questions, and SERP competitors. Always run this first before planning or writing an article. Pass _workflow_run_id when running inside the seo-article wizard.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable building materials")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        language_code: z.string().optional().describe('Language code, defaults to "en"'),
        location_code: z.number().optional().describe('DataForSEO location code, defaults to 2840 (US)'),
        website_id: z.string().optional().describe('Connected website id to file this research under. Omit to use the workspace default connected website.'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id passed by the wizard. Extract from `[workflow:seo-article/research:<run_id>]` prefix.'),
      }),
    }
  );
};

/**
 * SEO Tool: Article Planner
 * Calls seo-plan edge function → Gemini structured output
 */
export const createSEOArticlePlannerTool = (userId: string, onProgress?: (status: string) => void, onChunk?: ChunkSink) => {
  return tool(
    async ({ topic, target_keyword, keyword_research, content_brief, _workflow_run_id }) => {
      const runId = _workflow_run_id || crypto.randomUUID();
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'seo-article', run_id: runId }) : null;
      emitter?.step({ step_id: STEPS.SEO_ARTICLE[1], status: 'running', status_line: `Planning article structure for "${target_keyword}"…`, input: { topic, target_keyword } });
      try {
        onProgress?.(`Planning article structure for "${target_keyword}"...`);

        const result = await callSEOFunction('seo-plan', {
          topic,
          target_keyword,
          keyword_research,
          content_brief,
          user_id: userId,
        }, 60_000);

        if (!result.success) {
          emitter?.step({ step_id: STEPS.SEO_ARTICLE[1], status: 'failed', error_message: result.error || 'Article planning failed' });
          return JSON.stringify({ success: false, error: result.error || 'Article planning failed' });
        }

        onProgress?.(`Article plan created: "${result.data?.plan?.metaTitle || target_keyword}"`);

        emitter?.step({
          step_id: STEPS.SEO_ARTICLE[1],
          status: 'done',
          status_line: `Plan ready: ${result.data?.plan?.metaTitle || target_keyword}`,
          output: { plan_title: result.data?.plan?.metaTitle, sections: result.data?.plan?.sections?.length },
        });

        return JSON.stringify({
          success: true,
          _workflow_run_id: runId,
          plan: result.data?.plan,
        });
      } catch (error: any) {
        console.error('SEO article planning error:', error);
        emitter?.step({ step_id: STEPS.SEO_ARTICLE[1], status: 'failed', error_message: error.message });
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_article_planner',
      description: 'Create a detailed article plan/outline from keyword research data. Uses Gemini to generate structured article plan with headings, sections, meta tags, and keyword targets. Requires keyword research data from seo_keyword_research tool.',
      schema: z.object({
        topic: z.string().describe('The article topic'),
        target_keyword: z.string().describe('Primary target keyword'),
        keyword_research: z.any().describe('Full keyword research result from seo_keyword_research tool'),
        content_brief: z.any().optional().describe('Optional content brief with brand voice, audience, and business context'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from the wizard prefix.'),
      }),
    }
  );
};

/**
 * SEO Tool: Article Writer
 * Calls seo-write edge function → Claude Opus
 */
export const createSEOArticleWriterTool = (userId: string, onProgress?: (status: string) => void, onChunk?: ChunkSink) => {
  return tool(
    async ({ article_plan, content_brief, _workflow_run_id }) => {
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'seo-article', run_id: _workflow_run_id }) : null;
      emitter?.step({ step_id: STEPS.SEO_ARTICLE[2], status: 'running', status_line: 'Writing article with Claude Opus…' });
      try {
        onProgress?.('Writing article with Claude Opus...');

        const result = await callSEOFunction('seo-write', {
          article_plan,
          content_brief,
          user_id: userId,
        }, 120_000);

        if (!result.success) {
          emitter?.step({ step_id: STEPS.SEO_ARTICLE[2], status: 'failed', error_message: result.error || 'Article writing failed' });
          return JSON.stringify({ success: false, error: result.error || 'Article writing failed' });
        }

        onProgress?.(`Article written: ${result.data?.word_count || 0} words`);
        emitter?.step({
          step_id: STEPS.SEO_ARTICLE[2],
          status: 'done',
          status_line: `${result.data?.word_count || 0} words written`,
          output: { word_count: result.data?.word_count },
        });

        return JSON.stringify({
          success: true,
          _workflow_run_id,
          markdown_content: result.data?.markdown_content,
          word_count: result.data?.word_count,
        });
      } catch (error: any) {
        console.error('SEO article writing error:', error);
        emitter?.step({ step_id: STEPS.SEO_ARTICLE[2], status: 'failed', error_message: error.message });
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_article_writer',
      description: 'Write a full SEO article from an article plan. Uses Claude Opus to generate high-quality long-form content following the plan structure. Requires an article plan from seo_article_planner tool.',
      schema: z.object({
        article_plan: z.any().describe('Full article plan from seo_article_planner tool'),
        content_brief: z.any().optional().describe(
          'Optional content brief with brand voice and audience details. Include `firsthandExperience` {proprietaryData[], ownedExamples[], methodology, credentials} when the user has their own data, products or projects to cite — it is the only input to the writer that is not derived from the competing pages. Never invent its contents.',
        ),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from the wizard prefix.'),
      }),
    }
  );
};

/**
 * SEO Tool: Content Analyzer
 * Calls seo-analyze edge function → scoring + optional auto-fix
 */
export const createSEOContentAnalyzerTool = (userId: string, onProgress?: (status: string) => void, onChunk?: ChunkSink) => {
  return tool(
    async ({ content_markdown, article_plan, content_brief, auto_fix, max_iterations, article_id, _workflow_run_id }) => {
      const emitter = _workflow_run_id ? createWorkflowEmitter({ onChunk, definition_id: 'seo-article', run_id: _workflow_run_id }) : null;
      emitter?.step({ step_id: STEPS.SEO_ARTICLE[3], status: 'running', status_line: 'Analyzing article…' });
      try {
        onProgress?.('Analyzing article content for SEO quality...');

        const result = await callSEOFunction('seo-analyze', {
          content_markdown,
          article_plan,
          content_brief,
          // Lets the handler derive the freshness date from the stored row. Without it
          // the GEO freshness signal has nothing to measure and scores every article as
          // brand new — a constant dressed as a measurement.
          article_id,
          auto_fix: auto_fix ?? false,
          max_iterations: max_iterations ?? 2,
          user_id: userId,
        }, 180_000);

        if (!result.success) {
          emitter?.step({ step_id: STEPS.SEO_ARTICLE[3], status: 'failed', error_message: result.error || 'Content analysis failed' });
          return JSON.stringify({ success: false, error: result.error || 'Content analysis failed' });
        }

        const analysis = result.data?.analysis;
        onProgress?.(`Analysis complete: score ${analysis?.overallScore || 0}/100`);
        emitter?.step({
          step_id: STEPS.SEO_ARTICLE[3],
          status: 'done',
          status_line: `Score ${analysis?.overallScore || 0}/100 · ${analysis?.fixes?.length || 0} issues`,
          output: { overall_score: analysis?.overallScore, issues_count: analysis?.fixes?.length || 0, iterations: result.data?.iterations || 0 },
        });
        emitter?.finished({ status: 'done', summary: `SEO article complete — score ${analysis?.overallScore || 0}/100.` });

        return JSON.stringify({
          success: true,
          _workflow_run_id,
          overall_score: analysis?.overallScore,
          seo_score: analysis?.seoScore,
          readability_score: analysis?.readabilityScore,
          issues_count: analysis?.fixes?.length || 0,
          critical_issues: analysis?.fixes?.filter((f: any) => f.severity === 'critical')?.length || 0,
          fixes: analysis?.fixes?.slice(0, 10),
          improved_content: result.data?.improved_content,
          iterations: result.data?.iterations || 0,
        });
      } catch (error: any) {
        console.error('SEO content analysis error:', error);
        emitter?.step({ step_id: STEPS.SEO_ARTICLE[3], status: 'failed', error_message: error.message });
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_content_analyzer',
      description: 'Analyze SEO article content for quality, keyword optimization, readability, and SEO best practices. Scores content 0-100 and identifies issues. Can auto-fix content if score is below 70. Requires article content and plan.',
      schema: z.object({
        content_markdown: z.string().describe('The article content in markdown format'),
        article_plan: z.any().describe('The article plan used to write the content'),
        content_brief: z.any().optional().describe('Optional content brief'),
        auto_fix: z.boolean().optional().describe('Auto-fix content if score is below 70 (default: false)'),
        max_iterations: z.number().optional().describe('Max fix iterations (default: 2, max: 3)'),
        article_id: z.string().optional().describe('Id of the stored seo_articles row, when re-analyzing an existing article. Lets the freshness signal read the real review date instead of scoring every article as brand new.'),
        _workflow_run_id: z.string().optional().describe('Workflow run_id from the wizard prefix.'),
      }),
    }
  );
};

/**
 * SEO Tool: Full Pipeline (Async)
 * Calls seo-pipeline edge function → runs all stages, returns article_id immediately
 * Emits article_generation_started chunk for frontend polling
 */
export const createSEOPipelineTool = (userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ topic, target_keyword, content_brief, auto_fix, max_fix_iterations, content_type, website_id }) => {
      try {

        const result = await callSEOFunction('seo-pipeline', {
          topic,
          target_keyword,
          content_brief,
          auto_fix: auto_fix ?? true,
          max_fix_iterations: max_fix_iterations ?? 2,
          content_type: content_type || 'guide',
          user_id: userId,
          website_id: website_id || undefined,
        }, 300_000); // 5 min timeout for full pipeline

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Pipeline failed' });
        }

        const articleId = result.data?.article_id;

        // Emit chunk for frontend to start polling
        try {
          onChunk?.({
            type: 'article_generation_started',
            article_id: articleId,
            topic: topic,
            target_keyword: target_keyword,
            estimated_time_seconds: 120,
          });
        } catch (e) {
          console.error('Failed to send article_generation_started chunk:', e);
        }

        return JSON.stringify({
          success: true,
          article_id: articleId,
          message: `SEO article pipeline started for "${target_keyword}". The article is being generated in the background — you can track progress in the viewer above.`,
        });
      } catch (error: any) {
        console.error('SEO pipeline error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'create_seo_article',
      description: 'Run the full SEO article pipeline: keyword research → planning → writing → analysis with auto-fix. This is an async operation — it creates an article record and processes in the background. Use this when the user wants a complete SEO article generated end-to-end. For individual steps, use the specific tools instead.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable architecture")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        content_brief: z.any().optional().describe(
          'Optional content brief with audience, brand voice, business context. Two blocks materially change the output and are worth asking the user for: ' +
          '`provenance` {authorName, authorTitle, authorBio, authorUrl, publisherName, reviewedBy, aiDisclosure: "ai_generated"|"ai_assisted"|"human_written"} — emits schema.org author/publisher and a visible byline; ' +
          '`firsthandExperience` {proprietaryData[], ownedExamples[], methodology, credentials} — the user\'s own measurements, products and projects. ' +
          'Every other input to the article is derived from the pages it is competing against, so this is the only information Google cannot already get from the incumbents. ' +
          'NEVER invent values for either block — ask the user, or omit them and let the analyzer report the gap.',
        ),
        auto_fix: z.boolean().optional().describe('Auto-fix content if quality score is below 70 (default: true)'),
        max_fix_iterations: z.number().optional().describe('Max auto-fix iterations (default: 2)'),
        content_type: z.string().optional().describe('Article type: guide, listicle, comparison, how-to, case-study (default: guide)'),
        website_id: z.string().optional().describe('Connected website id to file this article under (drives inter-linking from that site). Omit to use the workspace default connected website.'),
      }),
    }
  );
};
