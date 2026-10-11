/**
 * SEO Article Pipeline Tools: callSEOFunction helper,
 * createSEOKeywordResearchTool, createSEOContentAnalyzerTool, createSEOPipelineTool
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
export const createSEOKeywordResearchTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, target_keyword, language_code, location_code, website_id }) => {
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

        return JSON.stringify({
          success: true,
          research_id: result.data?.research_id,
          summary,
        });
      } catch (error: any) {
        console.error('SEO keyword research error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_keyword_research',
      description: 'Research keywords for a topic. Uses DataForSEO to find keyword volumes, difficulty, related keywords, People Also Ask questions, and SERP competitors. To produce an article, call create_seo_article instead — it runs its own research.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable building materials")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        language_code: z.string().optional().describe('Language code. Omit unless the user names a market: the workspace business country decides (Greece → "el").'),
        location_code: z.number().optional().describe('DataForSEO location code. Omit unless the user names a market: the workspace business country decides (Greece → 2300).'),
        website_id: z.string().optional().describe('Connected website id to file this research under. Omit to use the workspace default connected website.'),
      }),
    }
  );
};

/**
 * SEO Tool: Content Analyzer
 * Calls seo-analyze edge function → scoring and a fix list; it never rewrites the article
 */
export const createSEOContentAnalyzerTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ content_markdown, article_plan, content_brief, article_id }) => {
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
      description: 'Analyze SEO article content for quality, keyword optimization, readability, and SEO best practices. Scores content 0-100 and lists issues for the editor; it does not change the article. Requires article content and plan.',
      schema: z.object({
        content_markdown: z.string().describe('The article content in markdown format'),
        article_plan: z.any().describe('The article plan used to write the content'),
        content_brief: z.any().optional().describe('Optional content brief'),
        article_id: z.string().optional().describe('Id of the stored seo_articles row, when re-analyzing an existing article. Lets the freshness signal read the real review date instead of scoring every article as brand new.'),
      }),
    }
  );
};

/**
 * SEO Tool: score a page that ALREADY EXISTS on the web (#401 G4).
 *
 * `seo_content_analyzer` above needs the markdown and the plan in hand, so it only ever ran on
 * drafts this pipeline generated. This one takes a URL.
 */
export const createSEOScoreUrlTool = (userId: string, onProgress?: (status: string) => void, onChunk?: ChunkSink) => {
  return tool(
    async ({ url, keyword }) => {
      try {
        onProgress?.(`Scoring ${url}...`);
        const result = await callSEOFunction('seo-score-url', { url, keyword, user_id: userId }, 120_000);

        if (!result.success) {
          // Pass the handler's own sentence through. It distinguishes "we could not fetch the
          // page" from "Search Console has no query for it" from "you are out of credits", and
          // flattening those into one failure is how a reader concludes the page is bad.
          onChunk?.({
            type: 'seo_score_url_card',
            url, status: result.status || 'failed',
            error: result.error || 'Could not score that page.',
            timestamp: Date.now(),
          });
          return JSON.stringify({ success: false, status: result.status, error: result.error });
        }

        const a = result.analysis;
        onChunk?.({
          type: 'seo_score_url_card',
          url: result.url,
          status: 'ok',
          fetched: result.fetched,
          keyword: result.keyword,
          keyword_source: result.keyword_source,
          overall_score: a?.overallScore,
          seo_score: a?.seoScore,
          readability_score: a?.readabilityScore,
          geo_score: a?.geoScore,
          fixes: a?.fixes || [],
          section_scores: a?.sectionScores,
          checks_skipped: result.checks_skipped || [],
          timestamp: Date.now(),
        });
        onProgress?.(`Scored ${result.url}: ${a?.overallScore ?? '—'}/100`);

        return JSON.stringify({
          success: true,
          url: result.url,
          keyword: result.keyword,
          keyword_source: result.keyword_source,
          overall_score: a?.overallScore,
          seo_score: a?.seoScore,
          geo_score: a?.geoScore,
          issues_count: a?.fixes?.length || 0,
          critical_issues: a?.fixes?.filter((f: any) => f.severity === 'critical')?.length || 0,
          fixes: a?.fixes?.slice(0, 10),
          // Tell the MODEL what was not measured, so it cannot present this as a complete audit.
          checks_skipped: result.checks_skipped || [],
        });
      } catch (error: any) {
        console.error('SEO score-url error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_score_url',
      description: 'Score a page that is already published on the web. Fetches the URL and runs the same 23-category content analysis and GEO (AI-citation) score used on our own drafts. Works on your pages and on competitors\'. Costs 1 credit per page, refunded if no score is produced. Checks that depend on an article plan (planned sections, target word count, planned FAQ, recommended schema) are skipped and listed — a live page has no plan and is not marked down for it.',
      schema: z.object({
        url: z.string().url().describe('Full https URL of the page to score.'),
        keyword: z.string().optional().describe('Keyword to score against. Defaults to the page\'s highest-impression Search Console query; required when Search Console has none for it, because Google withholds low-volume queries.'),
      }),
    }
  );
};

function textList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '').map((v) => v.trim());
  if (typeof raw === 'string' && raw.trim()) return [raw.trim()];
  return [];
}

/** Folds the form's three plain-text inputs into the brief the pipeline reads, keeping what the model sent. */
export function mergeArticleInputs(
  contentBrief: unknown,
  inputs: { writer_notes?: string; must_cover?: string; link_pages?: string },
): unknown {
  const notes = inputs.writer_notes?.trim();
  const rawPoints = inputs.must_cover ?? '';
  const mustCover = rawPoints
    .split(rawPoints.includes('\n') ? /\r?\n/ : /,/)
    .map((p) => p.replace(/^\s*[-*•]\s*/, '').trim())
    .filter(Boolean);
  const links = (inputs.link_pages ?? '').split(/[\s,]+/).map((u) => u.trim()).filter(Boolean);
  if (!notes && mustCover.length === 0 && links.length === 0) return contentBrief;

  const isObject = !!contentBrief && typeof contentBrief === 'object' && !Array.isArray(contentBrief);
  const base: Record<string, unknown> = isObject ? { ...(contentBrief as Record<string, unknown>) } : {};
  const prose = isObject ? [] : textList(contentBrief).map((t) => `Business context: ${t}`);
  base.extraContext = [
    ...textList(base.extraContext),
    ...prose,
    ...(notes ? [notes] : []),
    ...links.map((u) => `Link this page of ours: ${u}`),
  ];
  base.requiredPoints = [...textList(base.requiredPoints), ...mustCover];
  return base;
}

/**
 * SEO Tool: Full Pipeline (Async)
 * Calls seo-pipeline edge function → runs all stages, returns article_id immediately
 * Emits article_generation_started chunk for frontend polling
 */
export const createSEOPipelineTool = (userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ topic, target_keyword, content_brief, content_type, website_id, language_code, location_code, allow_duplicate, writer_notes, must_cover, link_pages }) => {
      try {

        const result = await callSEOFunction('seo-pipeline', {
          topic,
          target_keyword,
          content_brief: mergeArticleInputs(content_brief, { writer_notes, must_cover, link_pages }),
          content_type: content_type || 'guide',
          user_id: userId,
          website_id: website_id || undefined,
          // The pipeline defaults these to 2840/'en' — the US in English. `seo_keyword_research`
          // has always accepted them and this tool never did, so a run asked for "for Greece"
          // researched American SERPs and planned the article against them. Nothing failed:
          // US competitor headings for a Greek keyword are a plausible research result.
          language_code: language_code || undefined,
          location_code: location_code || undefined,
          allow_duplicate: allow_duplicate === true,
          // 30s, not 300s. `seo-pipeline` now creates the row and hands the stages to
          // `EdgeRuntime.waitUntil`, so this call returns as soon as the article id exists —
          // a second or two. The old 5-minute budget was for a handler that ran all five
          // stages inline, and it could never be honoured anyway: agent-chat kills any tool
          // at 90s (`Tool 'create_seo_article' timed out after 90s`, Sentry KAI-T5), so the
          // number here only ever described an intention.
        }, 30_000);

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
      description: 'Create an SEO article — the only way to write one. Runs keyword research → reading the pages of our own site on the topic → plan → write → editor review → analysis report. Async: it creates the article record and processes in the background. Call it ONCE per article.',
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
        content_type: z.string().optional().describe('Article type: guide, listicle, comparison, how-to, case-study (default: guide)'),
        website_id: z.string().optional().describe('Connected website id to file this article under (drives inter-linking from that site). Omit to use the workspace default connected website.'),
        language_code: z.string().optional().describe('Language the article is researched and written in, e.g. "el" for Greek. Set it only when the user names a market; omitted, the workspace\'s business country decides (Greece → "el").'),
        location_code: z.number().optional().describe('DataForSEO location code for the market, e.g. 2300 (Greece), 2826 (UK), 2276 (Germany). Set it together with language_code only when the user names a market; omitted, the business country decides.'),
        allow_duplicate: z.boolean().optional().describe('The pipeline refuses a keyword this website already has an article on. Set true ONLY when the user explicitly asks to rewrite that article.'),
        writer_notes: z.string().optional().describe('Angle or instructions for the writer, in the words of the user. Pass their text as-is.'),
        must_cover: z.string().optional().describe('Points the article must cover, one per line or comma-separated. Pass the text of the user as-is.'),
        link_pages: z.string().optional().describe('URLs of our own pages the article must link to, separated by spaces, commas or new lines.'),
      }),
    }
  );
};
