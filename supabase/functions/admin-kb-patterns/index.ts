/**
 * Admin Knowledge Base Patterns & Insights API
 *
 * Detects patterns, anomalies, and generates insights from quality data
 * GET /admin-kb-patterns?workspace_id=xxx
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Pattern {
  type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  affected_entities: number;
  recommendation: string;
  data?: any;
}

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

    console.log(`📊 Detecting patterns for workspace: ${workspaceId}`);

    const patterns: Pattern[] = [];
    const anomalies: Pattern[] = [];

    // 1. Detect low-quality chunk patterns
    const { data: lowQualityChunks, error: chunksError } = await supabase
      .from('chunk_validation_scores')
      .select('chunk_id, overall_validation_score, validation_status, issues')
      .eq('workspace_id', workspaceId)
      .lt('overall_validation_score', 0.5);

    if (!chunksError && lowQualityChunks && lowQualityChunks.length > 0) {
      // Analyze common issues
      const issueTypes: Record<string, number> = {};
      lowQualityChunks.forEach((chunk) => {
        if (chunk.issues && Array.isArray(chunk.issues)) {
          chunk.issues.forEach((issue: any) => {
            const issueType = issue.type || issue.category || 'unknown';
            issueTypes[issueType] = (issueTypes[issueType] || 0) + 1;
          });
        }
      });

      patterns.push({
        type: 'low_quality_chunks',
        description: `${lowQualityChunks.length} chunks have quality scores below 0.5`,
        severity: lowQualityChunks.length > 50 ? 'high' : lowQualityChunks.length > 20 ? 'medium' : 'low',
        affected_entities: lowQualityChunks.length,
        recommendation: 'Review chunking strategy, adjust semantic boundaries, or improve source document quality',
        data: {
          common_issues: issueTypes,
          avg_score: (lowQualityChunks.reduce((sum, c) => sum + (c.overall_validation_score || 0), 0) / lowQualityChunks.length).toFixed(3),
        },
      });
    }

    // 2. Detect low-quality image patterns
    const { data: lowQualityImages, error: imagesError } = await supabase
      .from('image_validations')
      .select('image_id, quality_score, validation_status, issues')
      .eq('workspace_id', workspaceId)
      .lt('quality_score', 0.5);

    if (!imagesError && lowQualityImages && lowQualityImages.length > 0) {
      const issueTypes: Record<string, number> = {};
      lowQualityImages.forEach((image) => {
        if (image.issues && Array.isArray(image.issues)) {
          image.issues.forEach((issue: any) => {
            const issueType = issue.type || issue.category || 'unknown';
            issueTypes[issueType] = (issueTypes[issueType] || 0) + 1;
          });
        }
      });

      patterns.push({
        type: 'low_quality_images',
        description: `${lowQualityImages.length} images have quality scores below 0.5`,
        severity: lowQualityImages.length > 30 ? 'high' : lowQualityImages.length > 10 ? 'medium' : 'low',
        affected_entities: lowQualityImages.length,
        recommendation: 'Review image extraction settings, check source PDF quality, or adjust validation thresholds',
        data: {
          common_issues: issueTypes,
          avg_score: (lowQualityImages.reduce((sum, i) => sum + (i.quality_score || 0), 0) / lowQualityImages.length).toFixed(3),
        },
      });
    }

    // 3. Detect incomplete products pattern
    const { data: incompleteProducts, error: productsError } = await supabase
      .from('products')
      .select('id, name, completeness_score, quality_assessment, metadata')
      .eq('workspace_id', workspaceId)
      .lt('completeness_score', 0.7);

    if (!productsError && incompleteProducts && incompleteProducts.length > 0) {
      // Analyze missing fields
      const missingFields: Record<string, number> = {};
      incompleteProducts.forEach((product) => {
        if (!product.name || product.name.trim() === '') {
          missingFields['name'] = (missingFields['name'] || 0) + 1;
        }
        if (!product.metadata || Object.keys(product.metadata).length === 0) {
          missingFields['metadata'] = (missingFields['metadata'] || 0) + 1;
        }
      });

      patterns.push({
        type: 'incomplete_products',
        description: `${incompleteProducts.length} products have completeness scores below 0.7`,
        severity: incompleteProducts.length > 20 ? 'high' : incompleteProducts.length > 10 ? 'medium' : 'low',
        affected_entities: incompleteProducts.length,
        recommendation: 'Improve product enrichment process, add more metadata extraction rules, or enhance LLM prompts',
        data: {
          missing_fields: missingFields,
          avg_completeness: (incompleteProducts.reduce((sum, p) => sum + (p.completeness_score || 0), 0) / incompleteProducts.length).toFixed(3),
        },
      });
    }

    // 4. Detect embedding coverage gaps
    const { count: totalChunks } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId);

    const { count: chunksWithEmbeddings } = await supabase
      .from('embeddings')
      .select('*', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('entity_type', 'chunk');

    if (totalChunks && chunksWithEmbeddings !== null) {
      const coveragePercentage = (chunksWithEmbeddings / totalChunks) * 100;
      
      if (coveragePercentage < 80) {
        patterns.push({
          type: 'low_embedding_coverage',
          description: `Only ${coveragePercentage.toFixed(1)}% of chunks have embeddings`,
          severity: coveragePercentage < 50 ? 'high' : 'medium',
          affected_entities: totalChunks - chunksWithEmbeddings,
          recommendation: 'Run embedding generation for missing chunks, check embedding service health',
          data: {
            total_chunks: totalChunks,
            chunks_with_embeddings: chunksWithEmbeddings,
            coverage_percentage: coveragePercentage.toFixed(2),
          },
        });
      }
    }

    // 5. Detect anomalies in quality trends (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentMetrics, error: metricsError } = await supabase
      .from('quality_metrics_daily')
      .select('metric_date, avg_chunk_quality, avg_image_quality, avg_product_quality, detection_accuracy')
      .eq('workspace_id', workspaceId)
      .gte('metric_date', sevenDaysAgo.toISOString().split('T')[0])
      .order('metric_date', { ascending: true });

    if (!metricsError && recentMetrics && recentMetrics.length > 2) {
      // Calculate average and standard deviation
      const calculateStats = (values: number[]) => {
        const avg = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);
        return { avg, stdDev };
      };

      // Check chunk quality anomalies
      const chunkQualityValues = recentMetrics.map((m) => m.avg_chunk_quality).filter((v) => v !== null) as number[];
      if (chunkQualityValues.length > 2) {
        const stats = calculateStats(chunkQualityValues);
        const latest = chunkQualityValues[chunkQualityValues.length - 1];
        
        if (Math.abs(latest - stats.avg) > 2 * stats.stdDev) {
          anomalies.push({
            type: 'chunk_quality_anomaly',
            description: `Chunk quality (${latest.toFixed(3)}) deviates significantly from recent average (${stats.avg.toFixed(3)})`,
            severity: 'medium',
            affected_entities: 0,
            recommendation: 'Investigate recent changes in chunking process or source document quality',
            data: {
              current_value: latest,
              average: stats.avg.toFixed(3),
              std_deviation: stats.stdDev.toFixed(3),
            },
          });
        }
      }
    }

    // 6. Detect high error rate pattern
    const { data: errorLogs, error: logsError } = await supabase
      .from('quality_scoring_logs')
      .select('event, created_at')
      .eq('event', 'update_error')
      .gte('created_at', sevenDaysAgo.toISOString())
      .limit(1000);

    if (!logsError && errorLogs && errorLogs.length > 50) {
      patterns.push({
        type: 'high_error_rate',
        description: `${errorLogs.length} quality scoring errors in the last 7 days`,
        severity: errorLogs.length > 200 ? 'high' : 'medium',
        affected_entities: errorLogs.length,
        recommendation: 'Review error logs, check database connectivity, and validate quality scoring service health',
        data: {
          error_count: errorLogs.length,
          period: '7 days',
        },
      });
    }

    const result = {
      workspace_id: workspaceId,
      patterns: patterns,
      anomalies: anomalies,
      summary: {
        total_patterns: patterns.length,
        total_anomalies: anomalies.length,
        high_severity_count: [...patterns, ...anomalies].filter((p) => p.severity === 'high').length,
        medium_severity_count: [...patterns, ...anomalies].filter((p) => p.severity === 'medium').length,
        low_severity_count: [...patterns, ...anomalies].filter((p) => p.severity === 'low').length,
      },
    };

    console.log(`✅ Detected ${patterns.length} patterns and ${anomalies.length} anomalies`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error detecting patterns:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

