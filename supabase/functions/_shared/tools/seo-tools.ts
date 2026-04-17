/**
 * SEO Article Pipeline Tools: callSEOFunction helper,
 * createSEOKeywordResearchTool, createSEOArticlePlannerTool,
 * createSEOArticleWriterTool, createSEOContentAnalyzerTool, createSEOPipelineTool
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// ═══════════════════════════════════════════════════════════════
// SEO Article Pipeline Tools
// ═══════════════════════════════════════════════════════════════

/** Helper to call SEO edge functions from agent tools */
export async function callSEOFunction(functionName: string, body: any, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
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
export const createSEOKeywordResearchTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, target_keyword, language_code, location_code }) => {
      try {
        onProgress?.(`Researching keywords for "${target_keyword}"...`);

        const result = await callSEOFunction('seo-research', {
          topic,
          target_keyword,
          language_code: language_code || 'en',
          location_code: location_code || 2840,
          user_id: userId,
        }, 60_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Keyword research failed' });
        }

        onProgress?.(`Found ${result.data?.research?.totalKeywords || 0} keywords for "${target_keyword}"`);

        return JSON.stringify({
          success: true,
          research_id: result.data?.research_id,
          summary: {
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
          },
        });
      } catch (error: any) {
        console.error('SEO keyword research error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_keyword_research',
      description: 'Research keywords for SEO article writing. Uses DataForSEO to find keyword volumes, difficulty, related keywords, People Also Ask questions, and SERP competitors. Always run this first before planning or writing an article.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable building materials")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        language_code: z.string().optional().describe('Language code, defaults to "en"'),
        location_code: z.number().optional().describe('DataForSEO location code, defaults to 2840 (US)'),
      }),
    }
  );
};

/**
 * SEO Tool: Article Planner
 * Calls seo-plan edge function → Gemini structured output
 */
export const createSEOArticlePlannerTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, target_keyword, keyword_research, content_brief }) => {
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
          return JSON.stringify({ success: false, error: result.error || 'Article planning failed' });
        }

        onProgress?.(`Article plan created: "${result.data?.plan?.metaTitle || target_keyword}"`);

        return JSON.stringify({
          success: true,
          plan: result.data?.plan,
        });
      } catch (error: any) {
        console.error('SEO article planning error:', error);
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
      }),
    }
  );
};

/**
 * SEO Tool: Article Writer
 * Calls seo-write edge function → Claude Sonnet
 */
export const createSEOArticleWriterTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ article_plan, content_brief }) => {
      try {
        onProgress?.('Writing article with Claude Sonnet...');

        const result = await callSEOFunction('seo-write', {
          article_plan,
          content_brief,
          user_id: userId,
        }, 120_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Article writing failed' });
        }

        onProgress?.(`Article written: ${result.data?.word_count || 0} words`);

        return JSON.stringify({
          success: true,
          markdown_content: result.data?.markdown_content,
          word_count: result.data?.word_count,
        });
      } catch (error: any) {
        console.error('SEO article writing error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_article_writer',
      description: 'Write a full SEO article from an article plan. Uses Claude Sonnet to generate high-quality long-form content following the plan structure. Requires an article plan from seo_article_planner tool.',
      schema: z.object({
        article_plan: z.any().describe('Full article plan from seo_article_planner tool'),
        content_brief: z.any().optional().describe('Optional content brief with brand voice and audience details'),
      }),
    }
  );
};

/**
 * SEO Tool: Content Analyzer
 * Calls seo-analyze edge function → scoring + optional auto-fix
 */
export const createSEOContentAnalyzerTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ content_markdown, article_plan, content_brief, auto_fix, max_iterations }) => {
      try {
        onProgress?.('Analyzing article content for SEO quality...');

        const result = await callSEOFunction('seo-analyze', {
          content_markdown,
          article_plan,
          content_brief,
          auto_fix: auto_fix ?? false,
          max_iterations: max_iterations ?? 2,
          user_id: userId,
        }, 180_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Content analysis failed' });
        }

        const analysis = result.data?.analysis;
        onProgress?.(`Analysis complete: score ${analysis?.overallScore || 0}/100`);

        return JSON.stringify({
          success: true,
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
    async ({ topic, target_keyword, content_brief, auto_fix, max_fix_iterations, content_type }) => {
      try {

        const result = await callSEOFunction('seo-pipeline', {
          topic,
          target_keyword,
          content_brief,
          auto_fix: auto_fix ?? true,
          max_fix_iterations: max_fix_iterations ?? 2,
          content_type: content_type || 'guide',
          user_id: userId,
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
        content_brief: z.any().optional().describe('Optional content brief with audience, brand voice, business context'),
        auto_fix: z.boolean().optional().describe('Auto-fix content if quality score is below 70 (default: true)'),
        max_fix_iterations: z.number().optional().describe('Max auto-fix iterations (default: 2)'),
        content_type: z.string().optional().describe('Article type: guide, listicle, comparison, how-to, case-study (default: guide)'),
      }),
    }
  );
};
