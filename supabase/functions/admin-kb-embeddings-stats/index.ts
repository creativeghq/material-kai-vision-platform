/**
 * Admin Knowledge Base Embeddings Stats API
 *
 * Provides statistics about embeddings coverage and quality
 * GET /admin-kb-embeddings-stats?workspace_id=xxx
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse query parameters
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspace_id');

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspace_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Fetching embeddings stats for workspace: ${workspaceId}`);

    const result: any = {
      workspace_id: workspaceId,
      total_embeddings: 0,
      by_type: {},
      by_model: {},
      coverage: {},
      quality: {},
    };

    // 1. Get embeddings from embeddings table
    const { data: embeddings, error: embeddingsError } = await supabase
      .from('embeddings')
      .select('id, entity_type, entity_id, model, embedding_type, created_at')
      .eq('workspace_id', workspaceId);

    if (embeddingsError) throw embeddingsError;

    result.total_embeddings = embeddings?.length || 0;

    // Group by type
    if (embeddings && embeddings.length > 0) {
      const byType: Record<string, number> = {};
      const byModel: Record<string, number> = {};
      const byEmbeddingType: Record<string, number> = {};

      embeddings.forEach((emb) => {
        // By entity type
        byType[emb.entity_type] = (byType[emb.entity_type] || 0) + 1;
        
        // By model
        if (emb.model) {
          byModel[emb.model] = (byModel[emb.model] || 0) + 1;
        }
        
        // By embedding type
        if (emb.embedding_type) {
          byEmbeddingType[emb.embedding_type] = (byEmbeddingType[emb.embedding_type] || 0) + 1;
        }
      });

      result.by_type = byType;
      result.by_model = byModel;
      result.by_embedding_type = byEmbeddingType;
    }

    // 2. Calculate coverage (entities with embeddings vs total entities)
    
    // Chunks coverage
    const { count: totalChunks } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const chunksWithEmbeddings = embeddings?.filter((e) => e.entity_type === 'chunk').length || 0;
    
    result.coverage.chunks = {
      total: totalChunks || 0,
      with_embeddings: chunksWithEmbeddings,
      coverage_percentage: totalChunks ? ((chunksWithEmbeddings / totalChunks) * 100).toFixed(2) : '0.00',
    };

    // Images coverage
    const { count: totalImages } = await supabase
      .from('document_images')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const imagesWithEmbeddings = embeddings?.filter((e) => e.entity_type === 'image').length || 0;
    
    result.coverage.images = {
      total: totalImages || 0,
      with_embeddings: imagesWithEmbeddings,
      coverage_percentage: totalImages ? ((imagesWithEmbeddings / totalImages) * 100).toFixed(2) : '0.00',
    };

    // Products coverage
    const { count: totalProducts } = await supabase
      .from('products')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const productsWithEmbeddings = embeddings?.filter((e) => e.entity_type === 'product').length || 0;
    
    result.coverage.products = {
      total: totalProducts || 0,
      with_embeddings: productsWithEmbeddings,
      coverage_percentage: totalProducts ? ((productsWithEmbeddings / totalProducts) * 100).toFixed(2) : '0.00',
    };

    // 3. Get document_vectors stats
    const { data: docVectors, error: docVectorsError } = await supabase
      .from('document_vectors')
      .select('id, chunk_id, vector_type, model_name, created_at')
      .eq('workspace_id', workspaceId);

    if (docVectorsError) throw docVectorsError;

    if (docVectors && docVectors.length > 0) {
      const vectorsByType: Record<string, number> = {};
      const vectorsByModel: Record<string, number> = {};

      docVectors.forEach((vec) => {
        if (vec.vector_type) {
          vectorsByType[vec.vector_type] = (vectorsByType[vec.vector_type] || 0) + 1;
        }
        if (vec.model_name) {
          vectorsByModel[vec.model_name] = (vectorsByModel[vec.model_name] || 0) + 1;
        }
      });

      result.document_vectors = {
        total: docVectors.length,
        by_type: vectorsByType,
        by_model: vectorsByModel,
      };
    }

    // 4. Quality metrics (from embedding stability analysis if available)
    const { data: stabilityData, error: stabilityError } = await supabase
      .from('embedding_stability_metrics')
      .select('avg_stability_score, anomaly_count, total_embeddings_analyzed')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!stabilityError && stabilityData) {
      result.quality = {
        avg_stability_score: stabilityData.avg_stability_score,
        anomaly_count: stabilityData.anomaly_count,
        total_analyzed: stabilityData.total_embeddings_analyzed,
      };
    }

    console.log(`✅ Embeddings stats fetched: ${result.total_embeddings} total embeddings`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error fetching embeddings stats:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

