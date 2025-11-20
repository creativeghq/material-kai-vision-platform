import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Anthropic from 'npm:@anthropic-ai/sdk@0.67.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SearchResult {
  id: string;
  name: string;
  description: string;
  category?: string;
  relevanceScore: number;
  semanticScore?: number;
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

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Parse request
    const requestData: ReRankRequest = await req.json();
    const { query, results, maxResults, includeExplanations = false, model = 'claude-sonnet-4-5' } = requestData;

    // Validate input
    if (!query || !results || !Array.isArray(results)) {
      return new Response(
        JSON.stringify({ error: 'Invalid request: query and results array required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from Supabase secrets (server-side only, never exposed to client)
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured in Supabase secrets');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🤖 AI Re-ranking request: query="${query}", results=${results.length}, model=${model}`);

    // Initialize Anthropic client
    const anthropic = new Anthropic({ apiKey });

    // Prepare results context for Claude
    const resultsContext = results.map((result, index) => ({
      index,
      id: result.id,
      name: result.name,
      description: result.description,
      category: result.category,
      relevanceScore: result.relevanceScore,
      semanticScore: result.semanticScore,
      qualityMetrics: result.qualityMetrics,
    }));

    // Create prompt for Claude
    const prompt = `You are an expert search relevance analyzer. Analyze these search results for the query: "${query}"

Results to analyze:
${JSON.stringify(resultsContext, null, 2)}

Your task:
1. Deeply understand the user's search intent
2. Evaluate each result's relevance, quality, and usefulness
3. Re-rank results from most to least relevant
${includeExplanations ? '4. Provide a brief explanation for each result\'s ranking' : ''}

Response format:
{
  "rankedIndices": [2, 0, 5, 1, ...],
  ${includeExplanations ? '"explanations": { "0": "explanation for result 0", "1": "explanation for result 1", ... }' : ''}
}`;

    // Call Claude Sonnet
    const response = await anthropic.messages.create({
      model: model === 'claude-sonnet-4-5' ? 'claude-sonnet-4-20250514' : 'claude-4-5-haiku-20250514',
      max_tokens: 4096,
      temperature: 0.1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    // Parse response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const parsed = JSON.parse(content.text);
    const rankedIndices = parsed.rankedIndices || [];
    const explanations = parsed.explanations || {};

    // Reorder results based on Claude's ranking
    const rerankedResults = rankedIndices
      .slice(0, maxResults || results.length)
      .map((idx: number) => results[idx])
      .filter(Boolean); // Remove any invalid indices

    // Calculate cost (approximate)
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const costPerMToken = model === 'claude-sonnet-4-5' ? 3.0 : 1.0; // $3/1M for Sonnet, $1/1M for Haiku
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

