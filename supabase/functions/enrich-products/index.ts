import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

import {
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types.ts';
import { createAILogger } from '../_shared/ai-logger.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Initialize AI logger
const aiLogger = createAILogger(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

// Anthropic API configuration
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

/**
 * Product Enrichment Edge Function
 * Enriches chunks with product metadata and descriptions
 */
Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { chunk_ids, workspace_id, enrichment_rules } = await req.json();

    if (!chunk_ids || !Array.isArray(chunk_ids) || chunk_ids.length === 0) {
      return createErrorResponse('chunk_ids must be a non-empty array', 400);
    }

    if (!workspace_id) {
      return createErrorResponse('workspace_id is required', 400);
    }

    // Default enrichment rules
    const defaultRules = {
      extract_metadata: true,
      extract_specifications: true,
      find_related_products: true,
      link_images: true,
      generate_descriptions: true,
      min_confidence_score: 0.6,
      max_related_products: 5,
      max_specifications: 10,
      max_images_per_product: 5,
    };

    const rules = { ...defaultRules, ...enrichment_rules };

    // Fetch chunks from database
    const { data: chunks, error: chunksError } = await supabase
      .from('document_chunks')
      .select('*')
      .in('id', chunk_ids);

    if (chunksError) {
      return createErrorResponse(`Failed to fetch chunks: ${chunksError.message}`, 500);
    }

    if (!chunks || chunks.length === 0) {
      return createErrorResponse('No chunks found', 404);
    }

    // Enrich each chunk using Anthropic Claude
    const enrichments = [];
    for (const chunk of chunks) {
      try {
        const enrichment = await enrichChunkWithClaude(chunk, workspace_id, rules);
        enrichments.push(enrichment);
      } catch (error) {
        console.error(`Failed to enrich chunk ${chunk.id} with Claude:`, error);
        // Fallback to basic enrichment
        const enrichment = enrichChunk(chunk, workspace_id, rules);
        enrichments.push(enrichment);
      }
    }

    // Insert enrichments into database
    const { data: insertedEnrichments, error: insertError } = await supabase
      .from('product_enrichments')
      .insert(enrichments)
      .select();

    if (insertError) {
      return createErrorResponse(`Failed to insert enrichments: ${insertError.message}`, 500);
    }

    // Calculate statistics
    const stats = {
      total: enrichments.length,
      enriched: enrichments.filter(e => e.enrichment_status === 'enriched').length,
      failed: enrichments.filter(e => e.enrichment_status === 'failed').length,
      needs_review: enrichments.filter(e => e.enrichment_status === 'needs_review').length,
    };

    return createSuccessResponse({
      enrichments: insertedEnrichments,
      stats,
    });
  } catch (error) {
    console.error('Error in enrich-products function:', error);
    return createErrorResponse(
      `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
    );
  }
});

/**
 * Enrich a single chunk with product data using Anthropic Claude
 */
async function enrichChunkWithClaude(chunk: any, workspaceId: string, rules: any) {
  if (!ANTHROPIC_API_KEY) {
    // Fallback to basic enrichment if API key not available
    return enrichChunk(chunk, workspaceId, rules);
  }

  try {
    const content = chunk.content || '';

    const prompt = `You are an expert product analyst and technical writer. Analyze this product content and provide comprehensive enrichment:

CONTENT TO ANALYZE:
${content}

Provide enrichment in JSON format:
{
  "product_name": "<primary product name>",
  "product_category": "<category>",
  "product_description": "<1-2 sentence summary>",
  "specifications": {
    "<spec_name>": "<value>",
    "<spec_name>": "<value>"
  },
  "related_products": ["<related_product_1>", "<related_product_2>"],
  "confidence_score": <0-1>,
  "key_features": ["<feature1>", "<feature2>"],
  "use_cases": ["<use_case1>", "<use_case2>"]
}

Focus on:
1. Accurate product identification
2. Clear, professional descriptions
3. Comprehensive specifications
4. Related products that complement this one
5. High confidence only if information is clear`;

    const startTime = Date.now();
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      // Log failed AI call
      await aiLogger.logAICall({
        task: 'product_enrichment',
        model: 'claude-3-5-sonnet-20241022',
        latency_ms: latencyMs,
        action: 'fallback_to_rules',
        fallback_reason: 'Anthropic API error',
        error_message: `HTTP ${response.status}: ${response.statusText}`,
      });

      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const data = await response.json();
    const enrichmentText = data.content[0].text;
    const enrichmentData = JSON.parse(enrichmentText);

    const confidenceScore = enrichmentData.confidence_score || 0;

    // Log successful AI call
    await aiLogger.logClaudeCall(
      'product_enrichment',
      'claude-3-5-sonnet-20241022',
      data,
      latencyMs,
      confidenceScore,
      {
        model_confidence: 0.90,
        completeness: confidenceScore,
        consistency: 0.85,
        validation: 0.80,
      },
      confidenceScore >= 0.7 ? 'use_ai_result' : 'fallback_to_rules',
      undefined,
      confidenceScore < 0.7 ? 'Low confidence score' : undefined
    );
    const enrichmentStatus =
      confidenceScore >= 0.7
        ? 'enriched'
        : confidenceScore >= 0.4
          ? 'partial'
          : 'failed';

    return {
      chunk_id: chunk.id,
      workspace_id: workspaceId,
      enrichment_status: enrichmentStatus,
      product_name: enrichmentData.product_name || '',
      product_category: enrichmentData.product_category || '',
      product_description: enrichmentData.product_description || '',
      specifications: enrichmentData.specifications || {},
      related_products: enrichmentData.related_products || [],
      confidence_score: confidenceScore,
      enrichment_score: confidenceScore,
      enriched_at: new Date().toISOString(),
      metadata: {
        key_features: enrichmentData.key_features,
        use_cases: enrichmentData.use_cases,
        model_used: 'claude-3-5-sonnet-20241022',
      },
    };
  } catch (error) {
    console.error('Claude enrichment failed:', error);
    // Fallback to basic enrichment
    return enrichChunk(chunk, workspaceId, rules);
  }
}

/**
 * Enrich a single chunk with product data (basic enrichment)
 */
function enrichChunk(chunk: any, workspaceId: string, rules: any) {
  const content = chunk.content || '';

  // Extract product information
  const productName = extractProductName(content);
  const productCategory = extractProductCategory(content);
  const productDescription = extractProductDescription(content);
  const metadata = rules.extract_metadata ? extractMetadata(content) : undefined;
  const specifications = rules.extract_specifications ? extractSpecifications(content) : undefined;
  const relatedProducts = rules.find_related_products ? findRelatedProducts(content, rules.max_related_products) : undefined;

  // Calculate enrichment score
  const enrichmentScore = calculateEnrichmentScore(
    productName,
    productDescription,
    metadata,
    specifications,
  );

  // Determine enrichment status
  const enrichmentStatus = enrichmentScore >= rules.min_confidence_score ? 'enriched' : 'needs_review';

  return {
    chunk_id: chunk.id,
    workspace_id: workspaceId,
    enrichment_status: enrichmentStatus,
    product_name: productName,
    product_category: productCategory,
    product_description: productDescription,
    metadata,
    specifications,
    related_products: relatedProducts,
    confidence_score: enrichmentScore,
    enrichment_score: enrichmentScore,
    enriched_at: new Date().toISOString(),
  };
}

/**
 * Extract product name from content
 */
function extractProductName(content: string): string | undefined {
  const nameMatch = content.match(/(?:product|item|model)[\s:]*([^\n.]+)/i);
  return nameMatch ? nameMatch[1].trim() : undefined;
}

/**
 * Extract product category from content
 */
function extractProductCategory(content: string): string | undefined {
  const categories = [
    'electronics',
    'furniture',
    'clothing',
    'food',
    'books',
    'tools',
    'home',
    'sports',
  ];

  for (const category of categories) {
    if (content.toLowerCase().includes(category)) {
      return category;
    }
  }

  return 'other';
}

/**
 * Extract product description from content
 */
function extractProductDescription(content: string): string | undefined {
  const lines = content.split('\n');
  return lines.slice(0, 3).join(' ').substring(0, 500);
}

/**
 * Extract metadata from content
 */
function extractMetadata(content: string) {
  return {
    sku: extractField(content, /sku[\s:]*([^\n]+)/i),
    brand: extractField(content, /brand[\s:]*([^\n]+)/i),
    model: extractField(content, /model[\s:]*([^\n]+)/i),
    color: extractField(content, /color[\s:]*([^\n]+)/i),
    size: extractField(content, /size[\s:]*([^\n]+)/i),
  };
}

/**
 * Extract specifications from content
 */
function extractSpecifications(content: string) {
  const specs = [];
  const specPattern = /([^:]+):\s*([^\n]+)/g;
  let match;

  while ((match = specPattern.exec(content)) && specs.length < 10) {
    specs.push({
      name: match[1].trim(),
      value: match[2].trim(),
    });
  }

  return specs.length > 0 ? specs : undefined;
}

/**
 * Find related products from content
 */
function findRelatedProducts(content: string, maxCount: number): string[] | undefined {
  const products = [];
  const productPattern = /(?:also|related|similar)[\s:]*([^\n]+)/gi;
  let match;

  while ((match = productPattern.exec(content)) && products.length < maxCount) {
    products.push(match[1].trim());
  }

  return products.length > 0 ? products : undefined;
}

/**
 * Extract field from content using regex
 */
function extractField(content: string, pattern: RegExp): string | undefined {
  const match = content.match(pattern);
  return match ? match[1].trim() : undefined;
}

/**
 * Calculate enrichment score
 */
function calculateEnrichmentScore(
  productName: string | undefined,
  description: string | undefined,
  metadata: any,
  specifications: any,
): number {
  let score = 0;
  let maxScore = 0;

  if (productName) {
    score += 0.3;
  }
  maxScore += 0.3;

  if (description) {
    score += 0.2;
  }
  maxScore += 0.2;

  if (metadata && Object.keys(metadata).length > 0) {
    score += 0.2;
  }
  maxScore += 0.2;

  if (specifications && specifications.length > 0) {
    score += 0.3;
  }
  maxScore += 0.3;

  return maxScore > 0 ? Math.min(1, score / maxScore) : 0;
}

