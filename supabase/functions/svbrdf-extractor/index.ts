import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { imageUrl, userId } = await req.json();

    if (!imageUrl || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: imageUrl and userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting SVBRDF extraction for image:', imageUrl);

    // Create extraction record
    const { data: extraction, error: insertError } = await supabase
      .from('svbrdf_extractions')
      .insert({
        user_id: userId,
        source_image_url: imageUrl,
        extraction_status: 'processing'
      })
      .select()
      .single();

    if (insertError) {
      throw new Error(`Failed to create extraction record: ${insertError.message}`);
    }

    // Simulate SVBRDF extraction process
    const extractedProperties = {
      albedo: { r: 0.7, g: 0.6, b: 0.5 },
      roughness: 0.4,
      metallic: 0.1,
      normal: { x: 0.5, y: 0.5, z: 1.0 },
      height: 0.2
    };

    // Generate mock URLs for extracted maps
    const maps = {
      albedo_map_url: `${imageUrl}_albedo.png`,
      normal_map_url: `${imageUrl}_normal.png`,
      roughness_map_url: `${imageUrl}_roughness.png`,
      metallic_map_url: `${imageUrl}_metallic.png`,
      height_map_url: `${imageUrl}_height.png`
    };

    // Update extraction with results
    const { error: updateError } = await supabase
      .from('svbrdf_extractions')
      .update({
        extraction_status: 'completed',
        extracted_properties: extractedProperties,
        confidence_score: 0.85,
        processing_time_ms: 2500,
        ...maps
      })
      .eq('id', extraction.id);

    if (updateError) {
      throw new Error(`Failed to update extraction: ${updateError.message}`);
    }

    console.log('SVBRDF extraction completed successfully');

    return new Response(
      JSON.stringify({
        success: true,
        extractionId: extraction.id,
        properties: extractedProperties,
        maps: maps,
        confidence: 0.85
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in SVBRDF extraction:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});