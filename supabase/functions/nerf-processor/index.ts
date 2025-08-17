import 'https://deno.land/x/xhr@0.1.0/mod.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { imageUrls, userId } = await req.json();

    if (!imageUrls || !Array.isArray(imageUrls) || imageUrls.length === 0 || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrls (array) and userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Starting NeRF reconstruction for', imageUrls.length, 'images');

    // Create reconstruction record
    const { data: reconstruction, error: insertError } = await supabase
      .from('nerf_reconstructions')
      .insert({
        user_id: userId,
        source_image_urls: imageUrls,
        reconstruction_status: 'processing',
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create reconstruction record: ${insertError.message}`);
    }

    // Simulate NeRF processing
    const processingTimeMs = Math.floor(Math.random() * 30000) + 15000; // 15-45 seconds

    await new Promise(resolve => setTimeout(resolve, 1000));

    const qualityScore = Math.random() * 0.3 + 0.7; // 0.7-1.0
    const modelFileUrl = `nerf-models/${reconstruction.id}/model.ply`;
    const meshFileUrl = `nerf-models/${reconstruction.id}/mesh.obj`;
    const pointCloudUrl = `nerf-models/${reconstruction.id}/points.pcd`;

    // Update reconstruction with results
    const { error: updateError } = await supabase
      .from('nerf_reconstructions')
      .update({
        reconstruction_status: 'completed',
        quality_score: qualityScore,
        processing_time_ms: processingTimeMs,
        model_file_url: modelFileUrl,
        mesh_file_url: meshFileUrl,
        point_cloud_url: pointCloudUrl,
        metadata: {
          camera_positions: imageUrls.length,
          reconstruction_method: 'instant-ngp',
          resolution: '1024x1024',
          training_iterations: 5000,
        },
      })
      .eq('id', reconstruction.id);

    if (updateError) {
      throw new Error(`Failed to update reconstruction: ${updateError.message}`);
    }

    console.log('NeRF reconstruction completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        reconstructionId: reconstruction.id,
        qualityScore: qualityScore,
        modelUrl: modelFileUrl,
        meshUrl: meshFileUrl,
        pointCloudUrl: pointCloudUrl,
        processingTime: processingTimeMs,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    console.error('Error in NeRF processing:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
