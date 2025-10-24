import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

// Import standardized Edge Function response types
import {
  createSuccessResponse,
  createErrorResponse,
  createJSONResponse,
} from '../_shared/types.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

interface ClipIntegrationRequest {
  action: 'generate_product_embeddings' | 'calculate_similarity' | 'visual_search' | 'get_stats';
  productId?: string;
  productText?: string;
  imageId?: string;
  query?: {
    type: 'image_to_products' | 'text_to_images' | 'hybrid_multimodal';
    imageData?: string;
    textQuery?: string;
    similarityThreshold?: number;
    maxResults?: number;
  };
  options?: {
    forceRegenerate?: boolean;
    includeMetadata?: boolean;
  };
}

interface ClipIntegrationResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    processingTime: number;
    action: string;
    timestamp: string;
  };
}

/**
 * Calculate cosine similarity between two embeddings
 */
function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  const similarity = dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
  return Math.max(0, Math.min(1, similarity)); // Clamp to [0, 1]
}

/**
 * Generate CLIP embeddings for product text
 */
async function generateProductEmbeddings(
  productId: string,
  productText: string,
  options: { forceRegenerate?: boolean } = {},
): Promise<any> {
  try {
    console.log(`🔗 Generating CLIP embeddings for product: ${productId}`);

    // Check if embeddings already exist
    if (!options.forceRegenerate) {
      const { data: existing, error } = await supabase
        .from('products')
        .select('embedding, embedding_model, updated_at')
        .eq('id', productId)
        .single();

      if (!error && existing?.embedding) {
        console.log(`✅ Using existing CLIP embeddings for product: ${productId}`);
        return {
          embedding: JSON.parse(existing.embedding),
          model: existing.embedding_model || 'clip-vit-base-patch32',
          dimensions: JSON.parse(existing.embedding).length,
          confidence: 1.0,
          created_at: existing.updated_at,
          fromCache: true,
        };
      }
    }

    // Call MIVAA gateway for CLIP text embeddings
    const mivaaUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:8000';
    const response = await fetch(`${mivaaUrl}/api/embeddings/clip-text`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: productText,
        model: 'clip-vit-base-patch32',
        normalize: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA gateway error: ${response.statusText}`);
    }

    const result = await response.json();

    if (!result.success || !result.embedding) {
      throw new Error('Failed to generate CLIP embeddings');
    }

    const clipEmbedding = {
      embedding: result.embedding,
      model: result.model || 'clip-vit-base-patch32',
      dimensions: result.embedding.length,
      confidence: 1.0,
      created_at: new Date().toISOString(),
      fromCache: false,
    };

    // Store in products table
    const { error: updateError } = await supabase
      .from('products')
      .update({
        embedding: JSON.stringify(clipEmbedding.embedding),
        embedding_model: clipEmbedding.model,
        updated_at: new Date().toISOString(),
      })
      .eq('id', productId);

    if (updateError) {
      console.warn(`⚠️ Failed to store embedding for product ${productId}:`, updateError);
    }

    console.log(`✅ Generated and stored CLIP embeddings for product: ${productId}`);
    return clipEmbedding;

  } catch (error) {
    console.error(`❌ Error generating CLIP embeddings for product ${productId}:`, error);
    throw error;
  }
}

/**
 * Calculate real CLIP similarity between image and product
 */
async function calculateClipSimilarity(imageId: string, productId: string): Promise<any> {
  try {
    console.log(`🔍 Calculating CLIP similarity for image ${imageId} and product ${productId}`);

    // Get image CLIP embedding from material_visual_analysis
    const { data: imageAnalysis, error: imageError } = await supabase
      .from('material_visual_analysis')
      .select('clip_embedding, clip_model_version')
      .eq('material_id', imageId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (imageError || !imageAnalysis?.clip_embedding) {
      return {
        score: 0.5,
        confidence: 0.3,
        metadata: { reason: 'no_image_embedding' },
      };
    }

    // Get product CLIP embedding
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('embedding, embedding_model')
      .eq('id', productId)
      .single();

    if (productError || !product?.embedding) {
      return {
        score: 0.5,
        confidence: 0.3,
        metadata: { reason: 'no_product_embedding' },
      };
    }

    // Parse embeddings
    const imageEmbedding = JSON.parse(imageAnalysis.clip_embedding);
    const productEmbedding = JSON.parse(product.embedding);

    // Calculate cosine similarity
    const similarity = calculateCosineSimilarity(imageEmbedding, productEmbedding);

    // Calculate confidence based on embedding quality and model consistency
    const modelMatch = imageAnalysis.clip_model_version === product.embedding_model;
    const confidence = modelMatch ? 0.95 : 0.85;

    console.log(`✅ CLIP similarity: ${similarity.toFixed(3)} (confidence: ${confidence.toFixed(3)})`);

    return {
      score: similarity,
      confidence,
      metadata: {
        imageModel: imageAnalysis.clip_model_version,
        productModel: product.embedding_model,
        modelMatch,
        embeddingDimensions: imageEmbedding.length,
        method: 'clip_cosine_similarity',
      },
    };

  } catch (error) {
    console.error('❌ Error calculating CLIP similarity:', error);
    return { score: 0.5, confidence: 0.1, metadata: { error: error.message } };
  }
}

/**
 * Get CLIP integration statistics
 */
async function getClipStats(): Promise<any> {
  try {
    // Get product embedding stats
    const { data: productStats, error: productError } = await supabase
      .from('products')
      .select('embedding, embedding_model')
      .not('embedding', 'is', null);

    // Get image embedding stats
    const { data: imageStats, error: imageError } = await supabase
      .from('material_visual_analysis')
      .select('clip_embedding, clip_model_version')
      .not('clip_embedding', 'is', null);

    if (productError || imageError) {
      throw new Error(`Failed to fetch stats: ${productError?.message || imageError?.message}`);
    }

    const modelDistribution: Record<string, number> = {};
    let totalDimensions = 0;
    let embeddingCount = 0;

    // Process product embeddings
    if (productStats) {
      for (const product of productStats) {
        const model = product.embedding_model || 'unknown';
        modelDistribution[model] = (modelDistribution[model] || 0) + 1;

        try {
          const embedding = JSON.parse(product.embedding);
          totalDimensions += embedding.length;
          embeddingCount++;
        } catch (error) {
          console.warn('⚠️ Error parsing product embedding:', error);
        }
      }
    }

    // Process image embeddings
    if (imageStats) {
      for (const analysis of imageStats) {
        const model = analysis.clip_model_version || 'unknown';
        modelDistribution[model] = (modelDistribution[model] || 0) + 1;

        try {
          const embedding = JSON.parse(analysis.clip_embedding);
          totalDimensions += embedding.length;
          embeddingCount++;
        } catch (error) {
          console.warn('⚠️ Error parsing image embedding:', error);
        }
      }
    }

    return {
      productsWithEmbeddings: productStats?.length || 0,
      imagesWithEmbeddings: imageStats?.length || 0,
      totalEmbeddings: embeddingCount,
      averageEmbeddingDimensions: embeddingCount > 0 ? Math.round(totalDimensions / embeddingCount) : 0,
      modelDistribution,
      lastUpdated: new Date().toISOString(),
    };

  } catch (error) {
    console.error('❌ Error getting CLIP integration stats:', error);
    throw error;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const startTime = Date.now();
    const requestData: ClipIntegrationRequest = await req.json();

    console.log(`🚀 Enhanced CLIP Integration request: ${requestData.action}`);

    let result: any;

    switch (requestData.action) {
      case 'generate_product_embeddings':
        if (!requestData.productId || !requestData.productText) {
          throw new Error('Product ID and text are required for embedding generation');
        }
        result = await generateProductEmbeddings(
          requestData.productId,
          requestData.productText,
          requestData.options || {},
        );
        break;

      case 'calculate_similarity':
        if (!requestData.imageId || !requestData.productId) {
          throw new Error('Image ID and Product ID are required for similarity calculation');
        }
        result = await calculateClipSimilarity(requestData.imageId, requestData.productId);
        break;

      case 'get_stats':
        result = await getClipStats();
        break;

      default:
        throw new Error(`Unknown action: ${requestData.action}`);
    }

    const processingTime = Date.now() - startTime;

    const response: ClipIntegrationResponse = {
      success: true,
      data: result,
      metadata: {
        processingTime,
        action: requestData.action,
        timestamp: new Date().toISOString(),
      },
    };

    console.log(`✅ Enhanced CLIP Integration completed in ${processingTime}ms`);

    return createJSONResponse(response);

  } catch (error) {
    console.error('❌ Enhanced CLIP Integration error:', error);

    return createErrorResponse(
      error.message || 'Enhanced CLIP Integration failed',
      500,
      {
        timestamp: new Date().toISOString(),
        service: 'enhanced-clip-integration',
      },
    );
  }
});
