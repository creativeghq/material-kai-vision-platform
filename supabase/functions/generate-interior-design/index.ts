import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

interface GenerateRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  width?: number;
  height?: number;
  image_url?: string; // Optional reference image for image-to-image models
}

interface ModelResult {
  model_id: string;
  model_name: string;
  provider: 'replicate' | 'huggingface';
  image_urls: string[];
  processing_time_ms: number;
  success: boolean;
  error?: string;
}

// Model configurations
const REPLICATE_MODELS = {
  // Text-to-image models
  'stability-ai/sdxl': {
    name: 'Stable Diffusion XL',
    version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    capabilities: ['text-to-image'],
  },
  // Image-to-image models (only used when image_url is provided)
  'jschoormans/comfyui-interior-remodel': {
    name: 'ComfyUI Interior Remodel',
    version: 'latest',
    capabilities: ['image-to-image'],
  },
};

const HUGGINGFACE_MODELS = {
  // Text-to-image models
  'stabilityai/stable-diffusion-xl-base-1.0': {
    name: 'SDXL Base 1.0',
    capabilities: ['text-to-image'],
  },
  'black-forest-labs/FLUX.1-schnell': {
    name: 'FLUX.1 Schnell',
    capabilities: ['text-to-image'],
  },
  'stabilityai/stable-diffusion-2-1': {
    name: 'Stable Diffusion 2.1',
    capabilities: ['text-to-image'],
  },
};

// Helper function to generate with Replicate
async function generateWithReplicate(
  modelId: string,
  config: any,
  prompt: string,
  imageUrl: string | undefined,
  width: number,
  height: number,
  apiToken: string
): Promise<ModelResult> {
  const startTime = Date.now();

  try {
    console.log(`🔵 Replicate: Starting ${modelId}...`);

    const input: any = {
      prompt,
      width,
      height,
      num_inference_steps: 25,
      guidance_scale: 7.5,
      num_outputs: 1,
    };

    // Add image for image-to-image models
    if (imageUrl) {
      input.image = imageUrl;
    }

    const prediction = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: config.version,
        input,
      }),
    });

    if (!prediction.ok) {
      throw new Error(`API error: ${prediction.status}`);
    }

    const predictionData = await prediction.json();

    // Poll for completion (max 60 attempts = 5 minutes)
    let result = predictionData;
    for (let i = 0; i < 60; i++) {
      if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
        break;
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${predictionData.id}`, {
        headers: {
          'Authorization': `Token ${apiToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (statusResponse.ok) {
        result = await statusResponse.json();
      }
    }

    if (result.status !== 'succeeded') {
      throw new Error(`Generation failed: ${result.error || result.status}`);
    }

    const imageUrls = Array.isArray(result.output) ? result.output : [result.output];
    const processingTime = Date.now() - startTime;

    console.log(`✅ Replicate: ${modelId} completed in ${processingTime}ms`);

    return {
      model_id: modelId,
      model_name: config.name,
      provider: 'replicate',
      image_urls: imageUrls,
      processing_time_ms: processingTime,
      success: true,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Replicate: ${modelId} failed:`, error);

    return {
      model_id: modelId,
      model_name: config.name,
      provider: 'replicate',
      image_urls: [],
      processing_time_ms: processingTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Helper function to generate with Hugging Face
async function generateWithHuggingFace(
  modelId: string,
  config: any,
  prompt: string,
  width: number,
  height: number,
  apiKey: string
): Promise<ModelResult> {
  const startTime = Date.now();

  try {
    console.log(`🟡 Hugging Face: Starting ${modelId}...`);

    const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          num_inference_steps: 20,
          guidance_scale: 7.5,
          width,
          height,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    // Hugging Face returns image as blob
    const imageBlob = await response.blob();

    // Convert blob to base64 data URL
    const arrayBuffer = await imageBlob.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = `data:image/png;base64,${base64}`;

    const processingTime = Date.now() - startTime;

    console.log(`✅ Hugging Face: ${modelId} completed in ${processingTime}ms`);

    return {
      model_id: modelId,
      model_name: config.name,
      provider: 'huggingface',
      image_urls: [dataUrl],
      processing_time_ms: processingTime,
      success: true,
    };
  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error(`❌ Hugging Face: ${modelId} failed:`, error);

    return {
      model_id: modelId,
      model_name: config.name,
      provider: 'huggingface',
      image_urls: [],
      processing_time_ms: processingTime,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, room_type, style, width = 768, height = 768, image_url }: GenerateRequest = await req.json();

    // Get API keys from environment
    const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
    const HUGGINGFACE_API_KEY = Deno.env.get('HUGGINGFACE_API_KEY');

    if (!REPLICATE_API_TOKEN && !HUGGINGFACE_API_KEY) {
      throw new Error('No API keys configured');
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

    console.log('🎨 Multi-model generation starting...');
    console.log('📝 Enhanced prompt:', enhancedPrompt);
    console.log('🖼️ Has reference image:', !!image_url);

    // Filter models based on whether we have an image
    const hasImage = !!image_url;
    const requiredCapability = hasImage ? 'image-to-image' : 'text-to-image';

    // Prepare model generation tasks
    const generationTasks: Promise<ModelResult>[] = [];

    // Add Replicate models
    if (REPLICATE_API_TOKEN) {
      for (const [modelId, config] of Object.entries(REPLICATE_MODELS)) {
        if (config.capabilities.includes(requiredCapability)) {
          generationTasks.push(
            generateWithReplicate(modelId, config, enhancedPrompt, image_url, width, height, REPLICATE_API_TOKEN)
          );
        }
      }
    }

    // Add Hugging Face models (only for text-to-image)
    if (HUGGINGFACE_API_KEY && !hasImage) {
      for (const [modelId, config] of Object.entries(HUGGINGFACE_MODELS)) {
        if (config.capabilities.includes(requiredCapability)) {
          generationTasks.push(
            generateWithHuggingFace(modelId, config, enhancedPrompt, width, height, HUGGINGFACE_API_KEY)
          );
        }
      }
    }

    console.log(`🚀 Running ${generationTasks.length} models in parallel...`);

    // Run all models in parallel
    const results = await Promise.allSettled(generationTasks);

    // Process results
    const modelResults: ModelResult[] = [];
    const allImageUrls: string[] = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        modelResults.push(result.value);
        if (result.value.success) {
          allImageUrls.push(...result.value.image_urls);
        }
      } else {
        console.error(`Model ${index} failed:`, result.reason);
      }
    });

    const successfulModels = modelResults.filter(r => r.success).length;
    console.log(`✅ ${successfulModels}/${modelResults.length} models succeeded`);

    return new Response(
      JSON.stringify({
        success: allImageUrls.length > 0,
        image_urls: allImageUrls,
        model_results: modelResults,
        total_models: modelResults.length,
        successful_models: successfulModels,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error in multi-model generation:', error);
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

