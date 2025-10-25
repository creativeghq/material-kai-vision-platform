/**
 * Admin Knowledge Base Detections API
 *
 * Tracks detection events from quality_scoring_logs
 * GET /admin-kb-detections?workspace_id=xxx&detection_type=product|image|chunk&start_date=xxx&end_date=xxx
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
    const detectionType = url.searchParams.get('detection_type'); // 'product', 'image', 'chunk', or null for all
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');

    if (!workspaceId) {
      return new Response(
        JSON.stringify({ error: 'workspace_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`📊 Fetching detections for workspace: ${workspaceId}, type: ${detectionType || 'all'}`);

    // Build query
    let query = supabase
      .from('quality_scoring_logs')
      .select('id, chunk_id, entity_id, detection_type, event, confidence, details, created_at')
      .order('created_at', { ascending: false });

    // Note: quality_scoring_logs doesn't have workspace_id, so we need to join or filter differently
    // For now, we'll fetch all and filter by entity workspace_id later
    // This is a limitation we should address in the future

    if (detectionType) {
      query = query.eq('detection_type', detectionType);
    }

    if (startDate) {
      query = query.gte('created_at', startDate);
    }

    if (endDate) {
      query = query.lte('created_at', endDate);
    }

    const { data: detections, error: detectionsError } = await query.limit(1000);

    if (detectionsError) throw detectionsError;

    const result: any = {
      workspace_id: workspaceId,
      total_detections: detections?.length || 0,
      detections: [],
      summary: {
        by_type: {},
        by_event: {},
        avg_confidence: 0,
        high_confidence_count: 0,
        low_confidence_count: 0,
      },
    };

    if (detections && detections.length > 0) {
      // Process detections
      result.detections = detections.map((d) => ({
        id: d.id,
        entity_id: d.entity_id || d.chunk_id,
        detection_type: d.detection_type || 'chunk',
        event: d.event,
        confidence: d.confidence,
        details: d.details,
        created_at: d.created_at,
      }));

      // Calculate summary
      const byType: Record<string, number> = {};
      const byEvent: Record<string, number> = {};
      let totalConfidence = 0;
      let confidenceCount = 0;
      let highConfidenceCount = 0;
      let lowConfidenceCount = 0;

      detections.forEach((d) => {
        // By type
        const type = d.detection_type || 'chunk';
        byType[type] = (byType[type] || 0) + 1;

        // By event
        if (d.event) {
          byEvent[d.event] = (byEvent[d.event] || 0) + 1;
        }

        // Confidence stats
        if (d.confidence !== null && d.confidence !== undefined) {
          totalConfidence += d.confidence;
          confidenceCount++;
          
          if (d.confidence >= 0.8) {
            highConfidenceCount++;
          } else if (d.confidence < 0.5) {
            lowConfidenceCount++;
          }
        }
      });

      result.summary.by_type = byType;
      result.summary.by_event = byEvent;
      result.summary.avg_confidence = confidenceCount > 0 ? (totalConfidence / confidenceCount).toFixed(3) : 0;
      result.summary.high_confidence_count = highConfidenceCount;
      result.summary.low_confidence_count = lowConfidenceCount;
    }

    // Get timeline data (detections per day for last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: timelineData, error: timelineError } = await supabase
      .from('quality_scoring_logs')
      .select('created_at, detection_type')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!timelineError && timelineData) {
      const timeline: Record<string, number> = {};
      
      timelineData.forEach((d) => {
        const date = new Date(d.created_at).toISOString().split('T')[0];
        timeline[date] = (timeline[date] || 0) + 1;
      });

      result.timeline = timeline;
    }

    console.log(`✅ Fetched ${result.total_detections} detections`);

    return new Response(
      JSON.stringify(result),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('❌ Error fetching detections:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

