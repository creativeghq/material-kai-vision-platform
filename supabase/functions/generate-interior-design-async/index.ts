import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface GenerateRequest {
  prompt: string;
  room_type?: string;
  style?: string;
  width?: number;
  height?: number;
  image_url?: string; // Reference image for image-to-image
  user_id: string;
  workspace_id: string;
}

// ============================================
// COMPLETE MODEL CONFIGURATIONS
// ============================================

// REPLICATE MODELS - Text-to-Image
const REPLICATE_TEXT_TO_IMAGE = [
  {
    id: 'stability-ai/sdxl',
    name: 'Stable Diffusion XL',
    provider: 'replicate',
    capability: 'text-to-image',
    version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b',
    status: 'working'
  },
  {
    id: 'stability-ai/stable-diffusion',
    name: 'Stable Diffusion',
    provider: 'replicate',
    capability: 'text-to-image',
    version: 'latest',
    status: 'working'
  },
  {
    id: 'runwayml/stable-diffusion-v1-5',
    name: 'Stable Diffusion v1.5',
    provider: 'replicate',
    capability: 'text-to-image',
    version: 'latest',
    status: 'working'
  },
];

// REPLICATE MODELS - Image-to-Image (Interior Design Specific)
const REPLICATE_IMAGE_TO_IMAGE = [
  {
    id: 'jschoormans/comfyui-interior-remodel',
    name: 'ComfyUI Interior Remodel',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'working'
  },
  {
    id: 'julian-at/interiorly-gen1-dev',
    name: 'Interiorly Gen1 Dev',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'working'
  },
  {
    id: 'davisbrown/designer-architecture',
    name: 'Designer Architecture',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'working'
  },
  {
    id: 'adirik/interior-design',
    name: 'Adirik Interior Design',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'failing' // Known to have 422 errors
  },
  {
    id: 'erayyavuz/interior-ai',
    name: 'Eray Yavuz Interior AI',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'failing' // Known to have issues
  },
  {
    id: 'jschoormans/interior-v2',
    name: 'Interior V2',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'failing' // Known to have issues
  },
  {
    id: 'rocketdigitalai/interior-design-sdxl',
    name: 'Rocket Digital AI Interior Design SDXL',
    provider: 'replicate',
    capability: 'image-to-image',
    version: 'latest',
    status: 'failing' // Known to have 422 errors
  },
];

// HUGGING FACE MODELS - Text-to-Image
const HUGGINGFACE_TEXT_TO_IMAGE = [
  {
    id: 'stabilityai/stable-diffusion-xl-base-1.0',
    name: 'SDXL Base 1.0',
    provider: 'huggingface',
    capability: 'text-to-image',
    status: 'working'
  },
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    name: 'FLUX.1 Schnell',
    provider: 'huggingface',
    capability: 'text-to-image',
    status: 'working'
  },
  {
    id: 'stabilityai/stable-diffusion-2-1',
    name: 'Stable Diffusion 2.1',
    provider: 'huggingface',
    capability: 'text-to-image',
    status: 'working'
  },
];

// Determine which models to use based on whether we have a reference image
function getModelsToUse(hasReferenceImage: boolean, includeFailingModels = false) {
  if (hasReferenceImage) {
    // Image-to-image: Use Replicate interior design models
    const models = includeFailingModels
      ? REPLICATE_IMAGE_TO_IMAGE
      : REPLICATE_IMAGE_TO_IMAGE.filter(m => m.status === 'working');

    console.log(`📸 Image-to-image mode: ${models.length} models selected`);
    return models;
  } else {
    // Text-to-image: Use both Replicate and Hugging Face models
    const models = [...REPLICATE_TEXT_TO_IMAGE, ...HUGGINGFACE_TEXT_TO_IMAGE];
    console.log(`📝 Text-to-image mode: ${models.length} models selected`);
    return models;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { prompt, room_type, style, width = 768, height = 768, image_url, user_id, workspace_id }: GenerateRequest = await req.json();

    // Determine which models to use
    const hasReferenceImage = !!image_url;
    const modelsToUse = getModelsToUse(hasReferenceImage);

    console.log(`🎨 Creating async generation job with ${modelsToUse.length} models...`);
    console.log(`📸 Reference image: ${hasReferenceImage ? 'YES' : 'NO'}`);

    // Build enhanced prompt
    let enhancedPrompt = prompt;
    if (room_type) enhancedPrompt = `${room_type} interior: ${enhancedPrompt}`;
    if (style) enhancedPrompt += `, ${style} style`;
    enhancedPrompt += ', high quality, professional interior design, well-lit, detailed';

    // Create job record with placeholder images
    const { data: job, error: jobError } = await supabase
      .from('generation_3d')
      .insert({
        user_id,
        workspace_id,
        prompt,
        room_type,
        style,
        generation_status: 'processing',
        progress_percentage: 0,
        workflow_status: 'generating',
        request_type: hasReferenceImage ? 'image-to-image' : 'text-to-image',
        // Store model queue and results
        models_queue: modelsToUse.map(m => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
          capability: m.capability,
        })),
        models_results: modelsToUse.map(m => ({
          model_id: m.id,
          model_name: m.name,
          provider: m.provider,
          capability: m.capability,
          status: 'pending',
          image_urls: [],
        })),
        input_images: hasReferenceImage ? { reference: image_url } : null,
        style_preferences: { enhanced_prompt: enhancedPrompt },
      })
      .select()
      .single();

    if (jobError || !job) {
      throw new Error(`Failed to create job: ${jobError?.message}`);
    }

    console.log(`✅ Job created: ${job.id}`);

    // Start background processing (don't await)
    processModelsInBackground(job.id, enhancedPrompt, width, height, image_url, modelsToUse);

    // Return job ID immediately with model info
    return new Response(
      JSON.stringify({
        success: true,
        job_id: job.id,
        model_count: modelsToUse.length,
        models: modelsToUse.map(m => ({
          id: m.id,
          name: m.name,
          provider: m.provider,
        })),
        estimated_time_minutes: modelsToUse.length * 2.5, // ~2.5 min per model
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('❌ Error creating job:', error);
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

// Background processing function
async function processModelsInBackground(
  jobId: string,
  prompt: string,
  width: number,
  height: number,
  imageUrl: string | undefined,
  modelsToUse: any[]
) {
  console.log(`🚀 Starting background processing for job ${jobId} with ${modelsToUse.length} models`);

  const REPLICATE_API_TOKEN = Deno.env.get('REPLICATE_API_TOKEN');
  const HUGGINGFACE_API_KEY = Deno.env.get('HUGGINGFACE_API_KEY');

  let completedModels = 0;

  // Process each model
  for (const model of modelsToUse) {
    try {
      console.log(`🔵 Processing ${model.name}...`);

      // Generate image (simplified - you'll need to add actual API calls)
      const generatedImageUrl = await generateImage(model, prompt, width, height, imageUrl, REPLICATE_API_TOKEN, HUGGINGFACE_API_KEY);

      completedModels++;
      const progress = Math.round((completedModels / modelsToUse.length) * 100);

      // Update job with this model's result
      await updateJobWithModelResult(jobId, model.id, generatedImageUrl, progress);

      console.log(`✅ ${model.name} completed (${progress}%)`);
    } catch (error) {
      console.error(`❌ ${model.name} failed:`, error);
      await updateJobWithModelError(jobId, model.id, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  // Mark job as completed
  await supabase
    .from('generation_3d')
    .update({
      generation_status: 'completed',
      progress_percentage: 100,
      completed_at: new Date().toISOString(),
    })
    .eq('id', jobId);

  console.log(`🏁 Job ${jobId} completed`);
}

// ============================================
// IMAGE GENERATION IMPLEMENTATION
// ============================================

async function generateImage(
  model: any,
  prompt: string,
  width: number,
  height: number,
  referenceImageUrl: string | undefined,
  replicateToken: string | undefined,
  hfToken: string | undefined
): Promise<string> {
  if (model.provider === 'replicate') {
    return await generateWithReplicate(model, prompt, width, height, referenceImageUrl, replicateToken!);
  } else if (model.provider === 'huggingface') {
    return await generateWithHuggingFace(model, prompt, width, height, hfToken!);
  } else {
    throw new Error(`Unknown provider: ${model.provider}`);
  }
}

// Replicate API implementation
async function generateWithReplicate(
  model: any,
  prompt: string,
  width: number,
  height: number,
  imageUrl: string | undefined,
  apiToken: string
): Promise<string> {
  console.log(`🔵 Replicate: Starting ${model.name}...`);

  // Build input based on model capability
  const input: any = {
    prompt,
    num_inference_steps: 25,
    guidance_scale: 7.5,
    num_outputs: 1,
  };

  // Add dimensions for text-to-image models
  if (model.capability === 'text-to-image') {
    input.width = width;
    input.height = height;
  }

  // Add image for image-to-image models
  if (model.capability === 'image-to-image' && imageUrl) {
    input.image = imageUrl;
    input.strength = 0.8;
  }

  // Create prediction
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: model.version,
      input,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Replicate API error (${response.status}): ${error}`);
  }

  const prediction = await response.json();
  console.log(`⏳ Replicate: Prediction created ${prediction.id}`);

  // Poll for completion (max 60 attempts = 5 minutes)
  let result = prediction;
  for (let i = 0; i < 60; i++) {
    if (result.status === 'succeeded' || result.status === 'failed' || result.status === 'canceled') {
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds

    const statusResponse = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
      headers: {
        'Authorization': `Token ${apiToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (statusResponse.ok) {
      result = await statusResponse.json();
      console.log(`⏳ Replicate: ${model.name} status: ${result.status}`);
    }
  }

  if (result.status !== 'succeeded') {
    throw new Error(`Generation failed: ${result.error || result.status}`);
  }

  // Extract image URL
  const imageUrls = Array.isArray(result.output) ? result.output : [result.output];
  const generatedImageUrl = imageUrls[0];

  if (!generatedImageUrl) {
    throw new Error('No image URL in response');
  }

  console.log(`✅ Replicate: ${model.name} completed`);
  return generatedImageUrl;
}

// Hugging Face API implementation
async function generateWithHuggingFace(
  model: any,
  prompt: string,
  width: number,
  height: number,
  apiToken: string
): Promise<string> {
  console.log(`🟡 Hugging Face: Starting ${model.name}...`);

  const response = await fetch(`https://api-inference.huggingface.co/models/${model.id}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        width,
        height,
        num_inference_steps: 25,
        guidance_scale: 7.5,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hugging Face API error (${response.status}): ${error}`);
  }

  // HF returns image as blob
  const blob = await response.blob();

  // Upload to Supabase Storage
  const fileName = `${model.id.replace('/', '-')}-${Date.now()}.png`;
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('ai-generations')
    .upload(fileName, blob, {
      contentType: 'image/png',
      cacheControl: '3600',
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('ai-generations')
    .getPublicUrl(uploadData.path);

  console.log(`✅ Hugging Face: ${model.name} completed`);
  return publicUrl;
}

async function updateJobWithModelResult(jobId: string, modelId: string, imageUrl: string, progress: number) {
  // Fetch current job data
  const { data: job } = await supabase
    .from('generation_3d')
    .select('models_results')
    .eq('id', jobId)
    .single();

  if (!job) return;

  const modelResults = (job.models_results as any) || [];

  // Update the specific model's result
  const updatedResults = modelResults.map((m: any) => {
    if (m.model_id === modelId) {
      return {
        ...m,
        status: 'completed',
        image_urls: [imageUrl],
        completed_at: new Date().toISOString(),
      };
    }
    return m;
  });

  // Update job
  await supabase
    .from('generation_3d')
    .update({
      models_results: updatedResults,
      progress_percentage: progress,
    })
    .eq('id', jobId);
}

async function updateJobWithModelError(jobId: string, modelId: string, error: string) {
  // Fetch current job data
  const { data: job } = await supabase
    .from('generation_3d')
    .select('models_results')
    .eq('id', jobId)
    .single();

  if (!job) return;

  const modelResults = (job.models_results as any) || [];

  // Update the specific model's result with error
  const updatedResults = modelResults.map((m: any) => {
    if (m.model_id === modelId) {
      return {
        ...m,
        status: 'failed',
        error,
        completed_at: new Date().toISOString(),
      };
    }
    return m;
  });

  // Update job
  await supabase
    .from('generation_3d')
    .update({
      models_results: updatedResults,
    })
    .eq('id', jobId);
}

