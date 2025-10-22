import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface MultiVectorRequest {
  action: 'generate_embeddings' | 'search' | 'batch_generate' | 'get_statistics';
  entityType?: 'product' | 'chunk' | 'image';
  entityId?: string;
  entityIds?: string[];
  searchQuery?: {
    text?: string;
    imageData?: string;
    colors?: string[];
    texture?: string;
    application?: string;
    weights?: Record<string, number>;
    filters?: Record<string, any>;
    options?: Record<string, any>;
  };
  embeddingTypes?: string[];
  options?: {
    forceRegenerate?: boolean;
    batchSize?: number;
    includeMetadata?: boolean;
  };
}

interface MultiVectorResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    processingTime: number;
    action: string;
    timestamp: string;
    embeddingsGenerated?: string[];
    searchResults?: number;
  };
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const requestBody: MultiVectorRequest = await req.json()
    const startTime = Date.now()

    console.log(`🔄 Multi-vector operation: ${requestBody.action}`)

    let response: MultiVectorResponse

    switch (requestBody.action) {
      case 'generate_embeddings':
        response = await generateEmbeddings(supabase, requestBody)
        break
      
      case 'search':
        response = await performMultiVectorSearch(supabase, requestBody)
        break
      
      case 'batch_generate':
        response = await batchGenerateEmbeddings(supabase, requestBody)
        break
      
      case 'get_statistics':
        response = await getStatistics(supabase, requestBody)
        break
      
      default:
        response = {
          success: false,
          error: `Unknown action: ${requestBody.action}`,
          metadata: {
            processingTime: Date.now() - startTime,
            action: requestBody.action,
            timestamp: new Date().toISOString(),
          },
        }
    }

    // Add processing time to metadata
    if (response.metadata) {
      response.metadata.processingTime = Date.now() - startTime
    }

    return new Response(
      JSON.stringify(response),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: response.success ? 200 : 400,
      },
    )

  } catch (error) {
    console.error('❌ Multi-vector operation error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
        metadata: {
          processingTime: 0,
          action: 'unknown',
          timestamp: new Date().toISOString(),
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      },
    )
  }
})

/**
 * Generate embeddings for a single entity
 */
async function generateEmbeddings(
  supabase: any,
  request: MultiVectorRequest
): Promise<MultiVectorResponse> {
  try {
    const { entityType, entityId, embeddingTypes, options } = request

    if (!entityType || !entityId) {
      throw new Error('entityType and entityId are required')
    }

    // Get entity data
    let entityData
    let tableName = ''

    switch (entityType) {
      case 'product':
        tableName = 'products'
        const { data: product, error: productError } = await supabase
          .from('products')
          .select('*')
          .eq('id', entityId)
          .single()
        
        if (productError) throw productError
        entityData = product
        break

      case 'chunk':
        tableName = 'document_vectors'
        const { data: chunk, error: chunkError } = await supabase
          .from('document_vectors')
          .select('*')
          .eq('chunk_id', entityId)
          .single()
        
        if (chunkError) throw chunkError
        entityData = chunk
        break

      case 'image':
        tableName = 'document_images'
        const { data: image, error: imageError } = await supabase
          .from('document_images')
          .select('*')
          .eq('id', entityId)
          .single()
        
        if (imageError) throw imageError
        entityData = image
        break

      default:
        throw new Error(`Unsupported entity type: ${entityType}`)
    }

    if (!entityData) {
      throw new Error(`Entity not found: ${entityId}`)
    }

    // Generate embeddings (mock implementation)
    const embeddingsGenerated: string[] = []
    const updateData: any = {
      embedding_metadata: {
        generated_at: new Date().toISOString(),
        model_versions: {},
        generation_time_ms: 0,
        confidence_scores: {},
      },
    }

    // Mock embedding generation for each type
    const types = embeddingTypes || ['text', 'visual', 'multimodal', 'color', 'texture', 'application']
    
    for (const type of types) {
      switch (type) {
        case 'text':
          if (entityData.content || entityData.description || entityData.name) {
            // Mock 1536D text embedding
            updateData.text_embedding_1536 = Array(1536).fill(0).map(() => Math.random() - 0.5)
            embeddingsGenerated.push('text_1536')
          }
          break

        case 'visual':
          if (entityData.image_url || entityType === 'image') {
            // Mock 512D visual embedding
            updateData.visual_clip_embedding_512 = Array(512).fill(0).map(() => Math.random() - 0.5)
            embeddingsGenerated.push('visual_clip_512')
          }
          break

        case 'multimodal':
          if (updateData.text_embedding_1536 && updateData.visual_clip_embedding_512) {
            // Mock 2048D multimodal embedding (concatenation)
            updateData.multimodal_fusion_embedding_2048 = [
              ...updateData.text_embedding_1536,
              ...updateData.visual_clip_embedding_512
            ]
            embeddingsGenerated.push('multimodal_fusion_2048')
          }
          break

        case 'color':
          if (entityData.image_url || entityType === 'image') {
            // Mock 256D color embedding
            updateData.color_embedding_256 = Array(256).fill(0).map(() => Math.random() - 0.5)
            embeddingsGenerated.push('color_256')
          }
          break

        case 'texture':
          if (entityData.image_url || entityType === 'image') {
            // Mock 256D texture embedding
            updateData.texture_embedding_256 = Array(256).fill(0).map(() => Math.random() - 0.5)
            embeddingsGenerated.push('texture_256')
          }
          break

        case 'application':
          if (entityData.properties || entityData.specifications) {
            // Mock 512D application embedding
            updateData.application_embedding_512 = Array(512).fill(0).map(() => Math.random() - 0.5)
            embeddingsGenerated.push('application_512')
          }
          break
      }
    }

    // Update entity with new embeddings
    const { error: updateError } = await supabase
      .from(tableName)
      .update(updateData)
      .eq(entityType === 'chunk' ? 'chunk_id' : 'id', entityId)

    if (updateError) {
      throw updateError
    }

    return {
      success: true,
      data: {
        entityId,
        entityType,
        embeddingsGenerated,
        updateData: options?.includeMetadata ? updateData : undefined,
      },
      metadata: {
        processingTime: 0,
        action: 'generate_embeddings',
        timestamp: new Date().toISOString(),
        embeddingsGenerated,
      },
    }

  } catch (error) {
    console.error('❌ Embedding generation error:', error)
    return {
      success: false,
      error: error.message,
      metadata: {
        processingTime: 0,
        action: 'generate_embeddings',
        timestamp: new Date().toISOString(),
      },
    }
  }
}

/**
 * Perform multi-vector search
 */
async function performMultiVectorSearch(
  supabase: any,
  request: MultiVectorRequest
): Promise<MultiVectorResponse> {
  try {
    const { searchQuery } = request

    if (!searchQuery) {
      throw new Error('searchQuery is required')
    }

    // Mock search implementation
    // In a real implementation, this would:
    // 1. Generate query embeddings
    // 2. Perform vector similarity search
    // 3. Apply weights and filters
    // 4. Return ranked results

    const mockResults = [
      {
        id: 'mock-product-1',
        type: 'product',
        name: 'Mock Product 1',
        description: 'A mock product for testing',
        similarity: {
          overall: 0.85,
          text: 0.8,
          visual: 0.9,
          color: 0.7,
        },
        confidence: 0.85,
      },
      {
        id: 'mock-product-2',
        type: 'product',
        name: 'Mock Product 2',
        description: 'Another mock product',
        similarity: {
          overall: 0.75,
          text: 0.7,
          visual: 0.8,
          color: 0.6,
        },
        confidence: 0.75,
      },
    ]

    return {
      success: true,
      data: {
        results: mockResults,
        totalFound: mockResults.length,
        searchQuery,
      },
      metadata: {
        processingTime: 0,
        action: 'search',
        timestamp: new Date().toISOString(),
        searchResults: mockResults.length,
      },
    }

  } catch (error) {
    console.error('❌ Multi-vector search error:', error)
    return {
      success: false,
      error: error.message,
      metadata: {
        processingTime: 0,
        action: 'search',
        timestamp: new Date().toISOString(),
      },
    }
  }
}

/**
 * Batch generate embeddings for multiple entities
 */
async function batchGenerateEmbeddings(
  supabase: any,
  request: MultiVectorRequest
): Promise<MultiVectorResponse> {
  try {
    const { entityType, entityIds, embeddingTypes, options } = request

    if (!entityType || !entityIds || entityIds.length === 0) {
      throw new Error('entityType and entityIds are required')
    }

    const batchSize = options?.batchSize || 5
    const results = []
    let successful = 0
    let failed = 0

    // Process in batches
    for (let i = 0; i < entityIds.length; i += batchSize) {
      const batch = entityIds.slice(i, i + batchSize)
      
      for (const entityId of batch) {
        try {
          const result = await generateEmbeddings(supabase, {
            action: 'generate_embeddings',
            entityType,
            entityId,
            embeddingTypes,
            options,
          })
          
          results.push(result)
          if (result.success) {
            successful++
          } else {
            failed++
          }
        } catch (error) {
          results.push({
            success: false,
            error: error.message,
            metadata: {
              processingTime: 0,
              action: 'generate_embeddings',
              timestamp: new Date().toISOString(),
            },
          })
          failed++
        }
      }

      // Small delay between batches
      if (i + batchSize < entityIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }

    return {
      success: true,
      data: {
        successful,
        failed,
        results,
        totalProcessed: entityIds.length,
      },
      metadata: {
        processingTime: 0,
        action: 'batch_generate',
        timestamp: new Date().toISOString(),
      },
    }

  } catch (error) {
    console.error('❌ Batch generation error:', error)
    return {
      success: false,
      error: error.message,
      metadata: {
        processingTime: 0,
        action: 'batch_generate',
        timestamp: new Date().toISOString(),
      },
    }
  }
}

/**
 * Get embedding statistics
 */
async function getStatistics(
  supabase: any,
  request: MultiVectorRequest
): Promise<MultiVectorResponse> {
  try {
    // Get statistics from database
    const { data: productStats } = await supabase
      .from('products')
      .select('id, text_embedding_1536, visual_clip_embedding_512, multimodal_fusion_embedding_2048, color_embedding_256, texture_embedding_256, application_embedding_512')

    const { data: chunkStats } = await supabase
      .from('document_vectors')
      .select('chunk_id, text_embedding_1536, visual_clip_embedding_512')

    const { data: imageStats } = await supabase
      .from('document_images')
      .select('id, visual_clip_embedding_512, color_embedding_256, texture_embedding_256')

    const statistics = {
      products: {
        total: productStats?.length || 0,
        withTextEmbeddings: productStats?.filter(p => p.text_embedding_1536).length || 0,
        withVisualEmbeddings: productStats?.filter(p => p.visual_clip_embedding_512).length || 0,
        withMultimodalEmbeddings: productStats?.filter(p => p.multimodal_fusion_embedding_2048).length || 0,
        withColorEmbeddings: productStats?.filter(p => p.color_embedding_256).length || 0,
        withTextureEmbeddings: productStats?.filter(p => p.texture_embedding_256).length || 0,
        withApplicationEmbeddings: productStats?.filter(p => p.application_embedding_512).length || 0,
      },
      chunks: {
        total: chunkStats?.length || 0,
        withTextEmbeddings: chunkStats?.filter(c => c.text_embedding_1536).length || 0,
        withVisualEmbeddings: chunkStats?.filter(c => c.visual_clip_embedding_512).length || 0,
      },
      images: {
        total: imageStats?.length || 0,
        withVisualEmbeddings: imageStats?.filter(i => i.visual_clip_embedding_512).length || 0,
        withColorEmbeddings: imageStats?.filter(i => i.color_embedding_256).length || 0,
        withTextureEmbeddings: imageStats?.filter(i => i.texture_embedding_256).length || 0,
      },
    }

    return {
      success: true,
      data: statistics,
      metadata: {
        processingTime: 0,
        action: 'get_statistics',
        timestamp: new Date().toISOString(),
      },
    }

  } catch (error) {
    console.error('❌ Statistics error:', error)
    return {
      success: false,
      error: error.message,
      metadata: {
        processingTime: 0,
        action: 'get_statistics',
        timestamp: new Date().toISOString(),
      },
    }
  }
}
