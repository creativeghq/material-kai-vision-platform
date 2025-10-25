/**
 * Admin Knowledge Base Quality Scores API
 *
 * Aggregates quality scores from all quality tables
 * GET /admin-kb-quality-scores?workspace_id=xxx
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

    console.log(`📊 Fetching quality scores for workspace: ${workspaceId}`);

    const result: any = {
      workspace_id: workspaceId,
      kpis: {},
      distributions: {},
      trends: {},
    };

    // 1. Chunk Quality Scores from chunk_validation_scores
    const { data: chunkValidations, error: chunkValidationsError } = await supabase
      .from('chunk_validation_scores')
      .select('overall_validation_score, content_quality_score, boundary_quality_score, semantic_coherence_score, completeness_score, validation_status')
      .eq('workspace_id', workspaceId);

    if (chunkValidationsError) throw chunkValidationsError;

    if (chunkValidations && chunkValidations.length > 0) {
      const avgOverall = chunkValidations.reduce((sum, v) => sum + (v.overall_validation_score || 0), 0) / chunkValidations.length;
      const avgContent = chunkValidations.reduce((sum, v) => sum + (v.content_quality_score || 0), 0) / chunkValidations.length;
      const avgBoundary = chunkValidations.reduce((sum, v) => sum + (v.boundary_quality_score || 0), 0) / chunkValidations.length;
      const avgSemantic = chunkValidations.reduce((sum, v) => sum + (v.semantic_coherence_score || 0), 0) / chunkValidations.length;
      const avgCompleteness = chunkValidations.reduce((sum, v) => sum + (v.completeness_score || 0), 0) / chunkValidations.length;

      result.kpis.chunks = {
        total_validated: chunkValidations.length,
        avg_overall_score: avgOverall.toFixed(3),
        avg_content_quality: avgContent.toFixed(3),
        avg_boundary_quality: avgBoundary.toFixed(3),
        avg_semantic_coherence: avgSemantic.toFixed(3),
        avg_completeness: avgCompleteness.toFixed(3),
        valid_count: chunkValidations.filter((v) => v.validation_status === 'valid').length,
        invalid_count: chunkValidations.filter((v) => v.validation_status === 'invalid').length,
        needs_review_count: chunkValidations.filter((v) => v.validation_status === 'needs_review').length,
      };

      // Distribution
      result.distributions.chunks = {
        excellent: chunkValidations.filter((v) => (v.overall_validation_score || 0) >= 0.9).length,
        good: chunkValidations.filter((v) => (v.overall_validation_score || 0) >= 0.7 && (v.overall_validation_score || 0) < 0.9).length,
        fair: chunkValidations.filter((v) => (v.overall_validation_score || 0) >= 0.5 && (v.overall_validation_score || 0) < 0.7).length,
        poor: chunkValidations.filter((v) => (v.overall_validation_score || 0) < 0.5).length,
      };
    }

    // 2. Image Quality Scores from image_validations
    const { data: imageValidations, error: imageValidationsError } = await supabase
      .from('image_validations')
      .select('quality_score, relevance_score, ocr_confidence, validation_status')
      .eq('workspace_id', workspaceId);

    if (imageValidationsError) throw imageValidationsError;

    if (imageValidations && imageValidations.length > 0) {
      const avgQuality = imageValidations.reduce((sum, v) => sum + (v.quality_score || 0), 0) / imageValidations.length;
      const avgRelevance = imageValidations.reduce((sum, v) => sum + (v.relevance_score || 0), 0) / imageValidations.length;
      const avgOcr = imageValidations.reduce((sum, v) => sum + (v.ocr_confidence || 0), 0) / imageValidations.length;

      result.kpis.images = {
        total_validated: imageValidations.length,
        avg_quality_score: avgQuality.toFixed(3),
        avg_relevance_score: avgRelevance.toFixed(3),
        avg_ocr_confidence: avgOcr.toFixed(3),
        valid_count: imageValidations.filter((v) => v.validation_status === 'valid').length,
        invalid_count: imageValidations.filter((v) => v.validation_status === 'invalid').length,
        needs_review_count: imageValidations.filter((v) => v.validation_status === 'needs_review').length,
      };

      // Distribution
      result.distributions.images = {
        excellent: imageValidations.filter((v) => (v.quality_score || 0) >= 0.9).length,
        good: imageValidations.filter((v) => (v.quality_score || 0) >= 0.7 && (v.quality_score || 0) < 0.9).length,
        fair: imageValidations.filter((v) => (v.quality_score || 0) >= 0.5 && (v.quality_score || 0) < 0.7).length,
        poor: imageValidations.filter((v) => (v.quality_score || 0) < 0.5).length,
      };
    }

    // 3. Product Quality Scores from products table
    const { data: products, error: productsError } = await supabase
      .from('products')
      .select('quality_score, confidence_score, completeness_score, quality_assessment')
      .eq('workspace_id', workspaceId)
      .not('quality_score', 'is', null);

    if (productsError) throw productsError;

    if (products && products.length > 0) {
      const avgQuality = products.reduce((sum, p) => sum + (p.quality_score || 0), 0) / products.length;
      const avgConfidence = products.reduce((sum, p) => sum + (p.confidence_score || 0), 0) / products.length;
      const avgCompleteness = products.reduce((sum, p) => sum + (p.completeness_score || 0), 0) / products.length;

      result.kpis.products = {
        total_scored: products.length,
        avg_quality_score: avgQuality.toFixed(3),
        avg_confidence_score: avgConfidence.toFixed(3),
        avg_completeness_score: avgCompleteness.toFixed(3),
        excellent_count: products.filter((p) => p.quality_assessment === 'excellent').length,
        good_count: products.filter((p) => p.quality_assessment === 'good').length,
        fair_count: products.filter((p) => p.quality_assessment === 'fair').length,
        poor_count: products.filter((p) => p.quality_assessment === 'poor').length,
      };

      // Distribution
      result.distributions.products = {
        excellent: products.filter((p) => (p.quality_score || 0) >= 0.9).length,
        good: products.filter((p) => (p.quality_score || 0) >= 0.7 && (p.quality_score || 0) < 0.9).length,
        fair: products.filter((p) => (p.quality_score || 0) >= 0.5 && (p.quality_score || 0) < 0.7).length,
        poor: products.filter((p) => (p.quality_score || 0) < 0.5).length,
      };
    }

    // 4. Document Quality Metrics
    const { data: docMetrics, error: docMetricsError } = await supabase
      .from('document_quality_metrics')
      .select('average_coherence_score, average_image_quality, overall_quality_score, quality_assessment')
      .eq('workspace_id', workspaceId);

    if (docMetricsError) throw docMetricsError;

    if (docMetrics && docMetrics.length > 0) {
      const avgCoherence = docMetrics.reduce((sum, d) => sum + (d.average_coherence_score || 0), 0) / docMetrics.length;
      const avgImageQuality = docMetrics.reduce((sum, d) => sum + (d.average_image_quality || 0), 0) / docMetrics.length;
      const avgOverall = docMetrics.reduce((sum, d) => sum + (d.overall_quality_score || 0), 0) / docMetrics.length;

      result.kpis.documents = {
        total_documents: docMetrics.length,
        avg_coherence_score: avgCoherence.toFixed(3),
        avg_image_quality: avgImageQuality.toFixed(3),
        avg_overall_quality: avgOverall.toFixed(3),
      };
    }

    console.log(`✅ Quality scores aggregated successfully`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error fetching quality scores:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

