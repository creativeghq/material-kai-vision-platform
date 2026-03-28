import { createClient } from '@supabase/supabase-js';
import { generateWithClaude } from '../_shared/ai-client.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { corsHeaders } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') || '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
);

interface SearchResult {
  id: string;
  name: string;
  description: string;
  category?: string;
  relevanceScore: number;
  semanticScore?: number;
  understandingScore?: number;
  qualityMetrics?: {
    precision?: number;
    recall?: number;
    mrr?: number;
  };
}

interface ReRankRequest {
  query: string;
  results: SearchResult[];
  maxResults?: number;
  includeExplanations?: boolean;
  model?: 'claude-sonnet-4-5' | 'claude-haiku-4-5';
}

interface ReRankResponse {
  rerankedResults: SearchResult[];
  explanations?: Record<string, string>;
  processingTimeMs: number;
  model: string;
  cost?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  let requestData: ReRankRequest;
  try {
    requestData = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON body' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { query, results, maxResults, includeExplanations = false, model = 'claude-sonnet-4-5' } = requestData;

    // Validate input
    if (!query || !results || !Array.isArray(results)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: query and results array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🤖 AI Re-ranking request: query="${query}", results=${results.length}, model=${model}`);

    // Prepare results context for Claude
    const resultsContext = results.map((result, index) => ({
      index,
      id: result.id,
      name: result.name,
      description: result.description,
      category: result.category,
      relevanceScore: result.relevanceScore,
      semanticScore: result.semanticScore,
      understandingScore: result.understandingScore,
      qualityMetrics: result.qualityMetrics,
    }));

    // Load prompt from database (editable via /admin/ai-configs)
    const systemPrompt = await getToolPrompt(supabase, 'ai_rerank');

    // Build full prompt with runtime data
    const prompt = `${systemPrompt}

Query: "${query}"

Results to analyze:
${JSON.stringify(resultsContext, null, 2)}
${includeExplanations ? '\nInclude a brief explanation for each result\'s ranking.' : ''}

Response format:
{
  "rankedIndices": [2, 0, 5, 1, ...],
  ${includeExplanations ? '"explanations": { "0": "explanation for result 0", "1": "explanation for result 1", ... }' : ''}
}`;

    // Map model selection to full model ID
    const modelId = model === 'claude-sonnet-4-5'
      ? 'claude-sonnet-4-5-20250929'
      : 'claude-haiku-4-5-20251001';

    // Call Claude via unified AI SDK client
    const aiResult = await generateWithClaude(prompt, {
      model: modelId,
      maxTokens: 4096,
      temperature: 0.1,
    });

    // Parse response
    let parsed: { rankedIndices?: number[]; explanations?: Record<string, string> };
    try {
      parsed = JSON.parse(aiResult.text);
    } catch {
      console.error('ai-rerank: Claude returned non-JSON response:', aiResult.text?.slice(0, 200));
      return new Response(
        JSON.stringify({ error: 'AI returned an invalid response. Please retry.' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const rankedIndices = parsed.rankedIndices || [];
    const explanations = parsed.explanations || {};

    // Reorder results based on Claude's ranking
    const rerankedResults = rankedIndices
      .slice(0, maxResults || results.length)
      .map((idx: number) => results[idx])
      .filter(Boolean); // Remove any invalid indices

    // Calculate cost (approximate)
    const { inputTokens, outputTokens } = aiResult.usage;
    const costPerMToken = model === 'claude-sonnet-4-5' ? 3.0 : 1.0;
    const cost = ((inputTokens + outputTokens) / 1_000_000) * costPerMToken;

    const processingTimeMs = Date.now() - startTime;

    console.log(`✅ AI Re-ranking complete: ${rerankedResults.length} results, ${processingTimeMs}ms, $${cost.toFixed(4)}`);

    const responseData: ReRankResponse = {
      rerankedResults,
      explanations: includeExplanations ? explanations : undefined,
      processingTimeMs,
      model,
      cost,
      usage: {
        inputTokens,
        outputTokens,
      },
    };

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ AI Re-ranking error:', error);

    return new Response(
      JSON.stringify({
        error: 'AI re-ranking failed',
        details: error.message,
        processingTimeMs: Date.now() - startTime,
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
