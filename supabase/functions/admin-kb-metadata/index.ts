/**
 * Admin Knowledge Base Metadata API
 *
 * Centralized metadata management for chunks, images, and products
 * GET /admin-kb-metadata?workspace_id=xxx&entity_type=chunks|images|products
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
    const entityType = url.searchParams.get('entity_type'); // 'chunks', 'images', 'products', or null for all

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspace_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Fetching metadata for workspace: ${workspaceId}, entity_type: ${entityType || 'all'}`);

    const result: any = {
      workspace_id: workspaceId,
      metadata: {},
      summary: {
        total_entities: 0,
        entities_with_metadata: 0,
        metadata_fields: new Set<string>(),
      },
    };

    // Fetch chunks metadata
    if (!entityType || entityType === 'chunks') {
      const { data: chunks, error: chunksError } = await supabase
        .from('document_chunks')
        .select('id, content, metadata, coherence_score, boundary_quality, quality_score, quality_assessment')
        .eq('workspace_id', workspaceId)
        .not('metadata', 'is', null);

      if (chunksError) throw chunksError;

      result.metadata.chunks = chunks?.map((chunk) => ({
        id: chunk.id,
        content_preview: chunk.content?.substring(0, 100) + '...',
        metadata: chunk.metadata,
        quality: {
          coherence_score: chunk.coherence_score,
          boundary_quality: chunk.boundary_quality,
          quality_score: chunk.quality_score,
          quality_assessment: chunk.quality_assessment,
        },
      })) || [];

      result.summary.total_entities += chunks?.length || 0;
      result.summary.entities_with_metadata += chunks?.filter((c) => c.metadata).length || 0;
      
      // Collect metadata fields
      chunks?.forEach((chunk) => {
        if (chunk.metadata && typeof chunk.metadata === 'object') {
          Object.keys(chunk.metadata).forEach((key) => result.summary.metadata_fields.add(key));
        }
      });
    }

    // Fetch images metadata
    if (!entityType || entityType === 'images') {
      const { data: images, error: imagesError } = await supabase
        .from('document_images')
        .select('id, image_url, metadata, confidence, quality_score, page_number')
        .eq('workspace_id', workspaceId)
        .not('metadata', 'is', null);

      if (imagesError) throw imagesError;

      result.metadata.images = images?.map((image) => ({
        id: image.id,
        image_url: image.image_url,
        page_number: image.page_number,
        metadata: image.metadata,
        quality: {
          confidence: image.confidence,
          quality_score: image.quality_score,
        },
      })) || [];

      result.summary.total_entities += images?.length || 0;
      result.summary.entities_with_metadata += images?.filter((i) => i.metadata).length || 0;
      
      // Collect metadata fields
      images?.forEach((image) => {
        if (image.metadata && typeof image.metadata === 'object') {
          Object.keys(image.metadata).forEach((key) => result.summary.metadata_fields.add(key));
        }
      });
    }

    // Fetch products metadata
    if (!entityType || entityType === 'products') {
      const { data: products, error: productsError } = await supabase
        .from('products')
        .select('id, name, description, metadata, quality_score, confidence_score, completeness_score, quality_assessment')
        .eq('workspace_id', workspaceId)
        .not('metadata', 'is', null);

      if (productsError) throw productsError;

      result.metadata.products = products?.map((product) => ({
        id: product.id,
        name: product.name,
        description_preview: product.description?.substring(0, 100) + '...',
        metadata: product.metadata,
        quality: {
          quality_score: product.quality_score,
          confidence_score: product.confidence_score,
          completeness_score: product.completeness_score,
          quality_assessment: product.quality_assessment,
        },
      })) || [];

      result.summary.total_entities += products?.length || 0;
      result.summary.entities_with_metadata += products?.filter((p) => p.metadata).length || 0;
      
      // Collect metadata fields
      products?.forEach((product) => {
        if (product.metadata && typeof product.metadata === 'object') {
          Object.keys(product.metadata).forEach((key) => result.summary.metadata_fields.add(key));
        }
      });
    }

    // Convert Set to Array for JSON serialization
    result.summary.metadata_fields = Array.from(result.summary.metadata_fields);

    console.log(`✅ Fetched metadata: ${result.summary.total_entities} entities, ${result.summary.metadata_fields.length} unique fields`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error fetching metadata:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

