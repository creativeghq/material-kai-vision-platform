import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface GenerateRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  width?: number;
  height?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, room_type, style, width = 768, height = 768 }: GenerateRequest = await req.json();

    // Get Replicate API key from environment
    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
    if (!REPLICATE_API_TOKEN) {
      throw new Error('REPLICATE_API_TOKEN not configured');
    }

    // Build enhanced prompt
    let enhancedPrompt = prompt;
    if (room_type) {
      enhancedPrompt = `${room_type} interior: ${enhancedPrompt}`;
    }
    if (style) {
      enhancedPrompt += `, ${style} style`;
    }
    enhancedPrompt += ', high quality, professional interior design, well-lit, detailed';

    console.log('🎨 Generating interior design with prompt:', enhancedPrompt);

    // Use Stable Diffusion XL for interior design
    // Model: stability-ai/sdxl
    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b', // SDXL
        input: {
          prompt: enhancedPrompt,
          width,
          height,
          num_inference_steps: 25,
          guidance_scale: 7.5,
          num_outputs: 1,
        },
      }),
    });

    if (!prediction.ok) {
      const error = await prediction.text();
      throw new Error(`Replicate API error: ${prediction.status} - ${error}`);
    }

    const predictionData = await prediction.json();
    console.log('✅ Prediction created:', predictionData.id);

    // Poll for completion (max 60 attempts = 5 minutes)
    let result = predictionData;
    for (let i = 0; i < 60; i++) {
      if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
        break;
      }

      // Wait 5 seconds before next poll
      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionData.id}`, {
        headers: {
          'Authorization': `Token ${REPLICATE_API_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });

      if (!statusResponse.ok) {
        throw new Error(`Failed to get prediction status: ${statusResponse.status}`);
      }

      result = await statusResponse.json();
      console.log(`⏳ Prediction status: ${result.status}`);
    }

    if (result.status === 'failed') {
      throw new Error(`Image generation failed: ${result.error}`);
    }

    if (result.status !== 'succeeded') {
      throw new Error('Image generation timed out');
    }

    // Extract image URLs from output
    const imageUrls = Array.isArray(result.output) ? result.output : [result.output];

    console.log('✅ Image generation completed:', imageUrls);

    return new Response(
      JSON.stringify({
        success: true,
        image_urls: imageUrls,
        prediction_id: result.id,
        processing_time_ms: result.metrics?.predict_time ? result.metrics.predict_time * 1000 : undefined,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error generating interior design:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

