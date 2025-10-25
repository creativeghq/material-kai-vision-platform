/**
 * Admin Knowledge Base Quality Dashboard API
 *
 * Provides daily quality metrics and KPIs from quality_metrics_daily table
 * GET /admin-kb-quality-dashboard?workspace_id=xxx&days=30
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
    const days = parseInt(url.searchParams.get('days') || '30');

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspace_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Fetching quality dashboard for workspace: ${workspaceId}, last ${days} days`);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    // Fetch daily metrics
    const { data: dailyMetrics, error: metricsError } = await supabase
      .from('quality_metrics_daily')
      .select('*')
      .eq('workspace_id', workspaceId)
      .gte('metric_date', startDate.toISOString().split('T')[0])
      .lte('metric_date', endDate.toISOString().split('T')[0])
      .order('metric_date', { ascending: true });

    if (metricsError) throw metricsError;

    const result: any = {
      workspace_id: workspaceId,
      period: {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
        days: days,
      },
      current_kpis: {},
      trends: {},
      daily_metrics: dailyMetrics || [],
      alerts: [],
    };

    if (dailyMetrics && dailyMetrics.length > 0) {
      // Get latest metrics (most recent day)
      const latest = dailyMetrics[dailyMetrics.length - 1];
      
      result.current_kpis = {
        chunks: {
          avg_quality: latest.avg_chunk_quality,
          total_processed: latest.total_chunks_processed,
          below_threshold: latest.chunks_below_threshold,
          below_threshold_percentage: latest.total_chunks_processed > 0 
            ? ((latest.chunks_below_threshold / latest.total_chunks_processed) * 100).toFixed(2)
            : '0.00',
        },
        images: {
          avg_quality: latest.avg_image_quality,
          total_extracted: latest.total_images_extracted,
          below_threshold: latest.images_below_threshold,
          below_threshold_percentage: latest.total_images_extracted > 0
            ? ((latest.images_below_threshold / latest.total_images_extracted) * 100).toFixed(2)
            : '0.00',
        },
        products: {
          avg_quality: latest.avg_product_quality,
          total_created: latest.total_products_created,
          below_threshold: latest.products_below_threshold,
          below_threshold_percentage: latest.total_products_created > 0
            ? ((latest.products_below_threshold / latest.total_products_created) * 100).toFixed(2)
            : '0.00',
        },
        embeddings: {
          total_generated: latest.total_embeddings_generated,
          failures: latest.embedding_generation_failures,
          failure_rate: latest.total_embeddings_generated > 0
            ? ((latest.embedding_generation_failures / latest.total_embeddings_generated) * 100).toFixed(2)
            : '0.00',
        },
        detections: {
          total: latest.total_detections,
          accuracy: latest.detection_accuracy,
        },
      };

      // Calculate trends (compare first and last day)
      if (dailyMetrics.length > 1) {
        const first = dailyMetrics[0];
        
        const calculateTrend = (current: number | null, previous: number | null): string => {
          if (current === null || previous === null || previous === 0) return 'stable';
          const change = ((current - previous) / previous) * 100;
          if (change > 5) return 'improving';
          if (change < -5) return 'declining';
          return 'stable';
        };

        result.trends = {
          chunk_quality: {
            trend: calculateTrend(latest.avg_chunk_quality, first.avg_chunk_quality),
            change_percentage: first.avg_chunk_quality && latest.avg_chunk_quality
              ? (((latest.avg_chunk_quality - first.avg_chunk_quality) / first.avg_chunk_quality) * 100).toFixed(2)
              : '0.00',
          },
          image_quality: {
            trend: calculateTrend(latest.avg_image_quality, first.avg_image_quality),
            change_percentage: first.avg_image_quality && latest.avg_image_quality
              ? (((latest.avg_image_quality - first.avg_image_quality) / first.avg_image_quality) * 100).toFixed(2)
              : '0.00',
          },
          product_quality: {
            trend: calculateTrend(latest.avg_product_quality, first.avg_product_quality),
            change_percentage: first.avg_product_quality && latest.avg_product_quality
              ? (((latest.avg_product_quality - first.avg_product_quality) / first.avg_product_quality) * 100).toFixed(2)
              : '0.00',
          },
          detection_accuracy: {
            trend: calculateTrend(latest.detection_accuracy, first.detection_accuracy),
            change_percentage: first.detection_accuracy && latest.detection_accuracy
              ? (((latest.detection_accuracy - first.detection_accuracy) / first.detection_accuracy) * 100).toFixed(2)
              : '0.00',
          },
        };
      }

      // Generate alerts based on thresholds
      const alerts = [];

      if (latest.avg_chunk_quality && latest.avg_chunk_quality < 0.6) {
        alerts.push({
          severity: 'high',
          category: 'chunk_quality',
          message: `Average chunk quality (${latest.avg_chunk_quality.toFixed(2)}) is below threshold (0.6)`,
          recommendation: 'Review chunking strategy and quality scoring parameters',
        });
      }

      if (latest.avg_image_quality && latest.avg_image_quality < 0.5) {
        alerts.push({
          severity: 'high',
          category: 'image_quality',
          message: `Average image quality (${latest.avg_image_quality.toFixed(2)}) is below threshold (0.5)`,
          recommendation: 'Review image extraction and validation processes',
        });
      }

      if (latest.avg_product_quality && latest.avg_product_quality < 0.7) {
        alerts.push({
          severity: 'medium',
          category: 'product_quality',
          message: `Average product quality (${latest.avg_product_quality.toFixed(2)}) is below threshold (0.7)`,
          recommendation: 'Review product enrichment and quality scoring',
        });
      }

      if (latest.embedding_generation_failures && latest.total_embeddings_generated) {
        const failureRate = (latest.embedding_generation_failures / latest.total_embeddings_generated) * 100;
        if (failureRate > 5) {
          alerts.push({
            severity: 'medium',
            category: 'embeddings',
            message: `Embedding generation failure rate (${failureRate.toFixed(2)}%) is above threshold (5%)`,
            recommendation: 'Check embedding service health and API quotas',
          });
        }
      }

      if (latest.detection_accuracy && latest.detection_accuracy < 0.8) {
        alerts.push({
          severity: 'medium',
          category: 'detection_accuracy',
          message: `Detection accuracy (${latest.detection_accuracy.toFixed(2)}) is below threshold (0.8)`,
          recommendation: 'Review and retrain detection models',
        });
      }

      result.alerts = alerts;
    }

    console.log(`✅ Quality dashboard fetched: ${dailyMetrics?.length || 0} days of data, ${result.alerts.length} alerts`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error fetching quality dashboard:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

