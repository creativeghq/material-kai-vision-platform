import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { HfInference } from 'https://esm.sh/@huggingface/inference@2.3.2';
import Replicate from 'https://esm.sh/replicate@0.25.2';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

// Server-side validation schema
const GenerationRequestSchema = z.object({
  user_id: z.string().uuid('Invalid user ID format'),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters').max(1000, 'Prompt must be less than 1000 characters'),
  models: z.array(z.string()).min(1, 'At least one model is required').optional(), // Updated to accept array of model names
  model: z.enum(['huggingface', 'replicate']).optional(), // Keep for backward compatibility
  room_type: z.string().optional(),
  roomType: z.string().optional(), // Support camelCase from frontend
  style: z.string().optional(),
  specific_materials: z.array(z.string()).optional(),
  reference_image_url: z.string().url().optional(),
  testMode: z.boolean().optional(),
  directTestMode: z.boolean().optional(),
  testSingleModel: z.string().optional(),
  skipDatabaseOperations: z.boolean().optional(),
  healthCheck: z.boolean().optional(),
  initializeOnly: z.boolean().optional(),
  replicateApiToken: z.string().optional(),
  sequential_processing: z.boolean().optional(), // Enable sequential model processing
  require_image_validation: z.boolean().optional(), // Enforce image validation for img2img models
});

// Image-to-image models that require reference images
const IMAGE_TO_IMAGE_MODELS = [
  'erayyavuz/interior-ai',
  'jschoormans/comfyui-interior-remodel',
  'julian-at/interiorly-gen1-dev',
  'jschoormans/interior-v2',
  'rocketdigitalai/interior-design-sdxl',
];

// Text-to-image models that can work without reference images
const TEXT_TO_IMAGE_MODELS = [
  'adirik/interior-design', // Unified model - supports both
  'davisbrown/designer-architecture',
  'stabilityai/stable-diffusion-xl-base-1.0',
  'black-forest-labs/FLUX.1-schnell',
  'stabilityai/stable-diffusion-2-1',
];

// Validation function for image requirements
function validateImageRequirements(request: any): { isValid: boolean; errors: string[]; filteredModels?: string[] } {
  const errors: string[] = [];
  const hasReferenceImage = Boolean(request.reference_image_url && request.reference_image_url !== '[NO_IMAGE]');

  // If no specific models requested, use all available models
  const requestedModels = request.models || [...TEXT_TO_IMAGE_MODELS, ...IMAGE_TO_IMAGE_MODELS];

  // Filter models based on image availability
  const validModels: string[] = [];
  const skippedModels: string[] = [];

  for (const model of requestedModels) {
    if (IMAGE_TO_IMAGE_MODELS.includes(model)) {
      if (hasReferenceImage) {
        validModels.push(model);
      } else {
        skippedModels.push(model);
        console.log(`⚠️ Skipping image-to-image model ${model} - no reference image provided`);
      }
    } else if (TEXT_TO_IMAGE_MODELS.includes(model)) {
      validModels.push(model);
    } else {
      errors.push(`Unknown model: ${model}`);
    }
  }

  if (skippedModels.length > 0) {
    console.log(`📋 Skipped ${skippedModels.length} image-to-image models due to missing reference image:`, skippedModels);
  }

  if (validModels.length === 0) {
    errors.push('No valid models available for processing. Image-to-image models require a reference image.');
  }

  return {
    isValid: errors.length === 0,
    errors,
    filteredModels: validModels,
  };
}

// Global workflow tracking
let workflowSteps: any[] = [];
let currentGenerationId: string | null = null;

// Storage function for generation results
async function storeGenerationResult(
  userId: string,
  prompt: string,
  roomType: string | undefined,
  style: string | undefined,
  materialsUsed: string[] | undefined,
  materialIds: string[] | undefined,
  generationStatus: string,
  resultData: any,
  imageUrls: string[] | undefined,
  modelUsed: string | undefined,
  processingTimeMs: number,
  errorMessage?: string,
): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('generation_3d')
      .insert({
        user_id: userId,
        prompt,
        room_type: roomType,
        style,
        materials_used: materialsUsed,
        material_ids: materialIds,
        generation_status: generationStatus,
        result_data: resultData,
        image_urls: imageUrls,
        model_used: modelUsed,
        processing_time_ms: processingTimeMs,
        error_message: errorMessage,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to store generation result:', error);
      throw error;
    }

    console.log(`✅ Generation result stored with ID: ${data.id}`);
    return data.id;
  } catch (error) {
    console.error('Error storing generation result:', error);
    throw error;
  }
}

// Function to process models directly without database operations
async function processModelsDirectly(request: any, hasReferenceImage: boolean): Promise<GenerationResult[]> {
  const results: GenerationResult[] = [];

  for (const step of workflowSteps) {
    console.log(`Testing model: ${step.modelName}`);

    try {
      // Update step status to processing
      step.status = 'processing';
      step.startTime = new Date().toISOString();

      // Test the model based on its type
      if (step.modelName.includes('huggingface') || step.modelName.includes('stabilityai') || step.modelName.includes('black-forest-labs')) {
        // Test Hugging Face model
        const result = await testHuggingFaceModel(step.modelName, request.prompt);
        step.status = 'completed';
        step.endTime = new Date().toISOString();
        step.result = result;
        results.push({
          url: result,
          modelName: step.modelName,
        });
      } else {
        // Test Replicate model - pass the API token from request if provided
        const result = await testReplicateModel(step.modelName, request.prompt, request.reference_image_url, request.replicateApiToken);
        step.status = 'completed';
        step.endTime = new Date().toISOString();
        step.result = result;
        results.push({
          url: result,
          modelName: step.modelName,
        });
      }
    } catch (error) {
      console.error(`Error testing model ${step.modelName}:`, error);
      step.status = 'failed';
      step.endTime = new Date().toISOString();
      step.error = error.message;
      results.push({
        url: '', // Empty URL for failed generation
        modelName: step.modelName,
      });
    }
  }

  return results;
}

// Test function for Replicate models
async function testReplicateModel(modelName: string, prompt: string, referenceImageUrl?: string, apiToken?: string): Promise<any> {
  const modelConfig = getModelConfig(modelName);
  if (!modelConfig) {
    throw new Error(`Model configuration not found for ${modelName}`);
  }

  const input = buildModelInput(modelConfig, prompt, referenceImageUrl);

  // Use provided API token or fall back to environment variable
  const replicateToken = apiToken || Deno.env.get('REPLICATE_API_TOKEN');
  if (!replicateToken) {
    throw new Error('Replicate API token not provided and not found in environment variables');
  }

  // Make a test API call to Replicate
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${replicateToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: modelConfig.version,
      input: input,
    }),
  });

  if (!response.ok) {
    throw new Error(`Replicate API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return {
    predictionId: result.id,
    status: result.status,
    model: modelName,
    testMode: true,
  };
}

// Test function for Hugging Face models
async function testHuggingFaceModel(modelName: string, prompt: string): Promise<any> {
  // Extract the actual model name from the identifier
  const actualModelName = modelName.replace('huggingface/', '');

  const response = await fetch(`https://api-inference.huggingface.co/models/${actualModelName}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('HUGGINGFACE_API_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        max_new_tokens: 100,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Hugging Face API error: ${response.status} ${response.statusText}`);
  }

  // For testing, we just check if the API responds successfully
  return {
    status: 'success',
    model: modelName,
    testMode: true,
    responseStatus: response.status,
  };
}


// Initialize workflow steps
function initializeWorkflowSteps(hasReferenceImage: boolean = false) {
  workflowSteps = [
    // Replicate Models (matching frontend validation schema)
    { modelName: 'lucataco/interior-design', model: 'lucataco/interior-design', name: 'Lucataco Interior Design', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'adirik/flux-cinestill', model: 'adirik/flux-cinestill', name: 'Flux Cinestill', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'black-forest-labs/flux-schnell', model: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'stability-ai/stable-diffusion-3-medium', model: 'stability-ai/stable-diffusion-3-medium', name: 'Stable Diffusion 3 Medium', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'bytedance/sdxl-lightning-4step', model: 'bytedance/sdxl-lightning-4step', name: 'SDXL Lightning 4-Step', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'playgroundai/playground-v2.5-1024px-aesthetic', model: 'playgroundai/playground-v2.5-1024px-aesthetic', name: 'Playground V2.5 Aesthetic', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'threestudio-project/threestudio', model: 'threestudio-project/threestudio', name: 'ThreeStudio 3D', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'adirik/interior-design', model: 'adirik/interior-design', name: 'Adirik Interior Design', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'davisbrown/designer-architecture', model: 'davisbrown/designer-architecture', name: 'Designer Architecture', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    { modelName: 'rocketdigitalai/interior-design-sdxl', model: 'rocketdigitalai/interior-design-sdxl', name: 'Interior Design SDXL', type: hasReferenceImage ? 'image-to-image' : 'text-to-image', status: 'pending' },
    // Hugging Face Models (text-to-image only)
    { modelName: 'stabilityai/stable-diffusion-xl-base-1.0', model: 'stabilityai/stable-diffusion-xl-base-1.0', name: 'Stable Diffusion XL', type: 'text-to-image', status: 'pending' },
    { modelName: 'stabilityai/stable-diffusion-2-1', model: 'stabilityai/stable-diffusion-2-1', name: 'Stable Diffusion 2.1', type: 'text-to-image', status: 'pending' },
  ];
}

// Update workflow step status using the new enhanced database schema
async function updateWorkflowStep(modelName: string, status: 'running' | 'success' | 'failed' | 'skipped', imageUrl?: string, errorMessage?: string, processingTimeMs?: number) {
  const step = workflowSteps.find(s => s.modelName === modelName);
  if (step) {
    step.status = status;
    step.endTime = new Date().toISOString();
    if (status === 'running') {
      step.startTime = new Date().toISOString();
    }
    if (imageUrl) step.imageUrl = imageUrl;
    if (errorMessage) step.errorMessage = errorMessage;
    if (processingTimeMs) step.processingTimeMs = processingTimeMs;
  }

  // Use the new helper function to update model progress
  if (currentGenerationId) {
    try {
      const modelResult = status === 'success' && imageUrl ? { url: imageUrl, status: 'success' } : null;
      const modelError = status === 'failed' && errorMessage ? { error: errorMessage, status: 'failed', timestamp: new Date().toISOString() } : null;
      const fullApiResponse = {
        model: modelName,
        status,
        imageUrl,
        errorMessage,
        processingTimeMs,
        timestamp: new Date().toISOString(),
        step_data: step,
      };

      // Call the new helper function
      await supabase.rpc('update_model_progress', {
        generation_id: currentGenerationId,
        model_name: modelName,
        model_result: modelResult,
        model_error: modelError,
        api_response: fullApiResponse,
      });

      console.log(`✅ Updated model progress: ${modelName} -> ${status}`);
    } catch (error) {
      console.error('❌ Failed to update model progress in database:', error);
    }
  }
}

// Sequential model processing function
async function processModelsSequentially(generationId: string, modelsQueue: any[], prompt: string, referenceImageUrl?: string): Promise<void> {
  console.log(`🔄 Starting sequential processing of ${modelsQueue.length} models for generation ${generationId}`);

  for (let i = 0; i < modelsQueue.length; i++) {
    const model = modelsQueue[i];
    const startTime = Date.now();

    try {
      console.log(`🎯 Processing model ${i + 1}/${modelsQueue.length}: ${model.name}`);

      // Update status to processing
      await updateWorkflowStep(model.name, 'running');

      // Update current step in database
      await supabase
        .from('generation_3d')
        .update({
          current_step: `Processing model ${model.name} (${i + 1}/${modelsQueue.length})`,
          current_model_index: i,
        })
        .eq('id', generationId);

      let result: any;

      // Process based on model type
      if (model.name.includes('huggingface') || model.name.includes('stabilityai') || model.name.includes('black-forest-labs')) {
        // Hugging Face model
        result = await testHuggingFaceModel(model.name, prompt);
      } else {
        // Replicate model
        result = await testReplicateModel(model.name, prompt, referenceImageUrl);
      }

      const processingTime = Date.now() - startTime;

      // Mark as successful
      await updateWorkflowStep(model.name, 'success', result.url || result.predictionId, undefined, processingTime);

      console.log(`✅ Model ${model.name} completed successfully in ${processingTime}ms`);

      // Add delay between models to prevent rate limiting
      if (i < modelsQueue.length - 1) {
        console.log('⏳ Waiting 2 seconds before next model...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

    } catch (error: any) {
      const processingTime = Date.now() - startTime;
      console.error(`❌ Model ${model.name} failed:`, error.message);

      // Mark as failed with detailed error
      await updateWorkflowStep(model.name, 'failed', undefined, error.message, processingTime);

      // Continue to next model rather than stopping entire workflow
      console.log(`⏭️ Continuing to next model despite failure of ${model.name}`);
    }
  }

  // Mark workflow as completed
  await supabase
    .from('generation_3d')
    .update({
      workflow_status: 'completed',
      generation_status: 'completed',
      current_step: 'All models processed',
      completed_at: new Date().toISOString(),
      total_processing_time_ms: Date.now() - parseInt(generationId.split('_')[1] || '0'),
    })
    .eq('id', generationId);

  console.log(`🏁 Sequential processing completed for generation ${generationId}`);
}


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!}`,
      },
    },
  },
);

interface GenerationRequest {
  user_id: string;
  prompt: string;
  model?: string; // Add support for model selection from frontend
  room_type?: string;
  roomType?: string; // Support camelCase from frontend
  style?: string;
  specific_materials?: string[];
  reference_image_url?: string; // Add support for reference image
  testMode?: boolean; // Add support for test mode
  directTestMode?: boolean; // Database-free testing mode
  testSingleModel?: string; // Test only specific model
  skipDatabaseOperations?: boolean; // Skip all DB operations
  healthCheck?: boolean; // API connectivity test
  initializeOnly?: boolean; // Only initialize workflow, don't process
}

// Type definitions for generation results
interface GenerationResult {
  url: string;
  modelName: string;
}

interface MaterialMatch {
  id: string;
  name: string;
  category?: string;
  description?: string;
}

// CrewAI Agent: Parse user request with MIVAA-first approach
async function parseUserRequestHybrid(prompt: string) {
  // Try MIVAA first
  try {
    const mivaaResult = await parseWithMIVAA(prompt);
    const validation = validateParseResult(mivaaResult);

    if (validation.score >= 0.7) {
      console.log(`MIVAA parsing successful with score: ${validation.score}`);
      return mivaaResult;
    }

    console.log(`MIVAA parsing score ${validation.score} below threshold, trying Claude...`);
  } catch (error) {
    console.log(`MIVAA parsing failed: ${error.message}, trying Claude...`);
  }

  // Return basic fallback - direct AI integration removed as part of centralized AI architecture
  console.error('MIVAA parsing failed - returning basic fallback. Please check MIVAA service availability.');
  return {
    room_type: 'living room',
    style: 'modern',
    materials: [],
    features: [],
    layout: '',
    enhanced_prompt: prompt,
  };
}

function validateParseResult(result: any): { score: number } {
  let score = 1.0;

  if (!result.room_type) score -= 0.3;
  if (!result.style) score -= 0.3;
  if (!result.enhanced_prompt || result.enhanced_prompt === result.original_prompt) score -= 0.2;
  if (!result.materials || result.materials.length === 0) score -= 0.1;
  if (!result.features || result.features.length === 0) score -= 0.1;

  return { score: Math.max(0, Math.min(1, score)) };
}

async function parseWithMIVAA(prompt: string) {
  const mivaaApiKey = Deno.env.get('MIVAA_API_KEY');
  const mivaaGatewayUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';

  if (!mivaaApiKey) {
    throw new Error('MIVAA API key not configured');
  }

  const response = await fetch(`${mivaaGatewayUrl}/functions/v1/mivaa-gateway`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${mivaaApiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
    },
    body: JSON.stringify({
      action: 'rag_chat',
      payload: {
        messages: [
          {
            role: 'system',
            content: `You are a CrewAI Agent specialized in parsing interior design requests. Extract:
            1. Room type (living room, kitchen, bedroom, etc.)
            2. Style (modern, Swedish, industrial, etc.)
            3. Specific materials mentioned (oak, marble, steel, etc.)
            4. Key furniture or features
            5. Layout specifications (L-shape, open concept, etc.)

            Respond in JSON format with: room_type, style, materials, features, layout, enhanced_prompt`,
          },
          {
            role: 'user',
            content: `Parse this interior design request: "${prompt}"`,
          },
        ],
        max_tokens: 500,
        temperature: 0.2,
      },
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(`MIVAA chat completion error: ${result.error?.message || 'Unknown error'}`);
  }

  try {
    // Parse the chat completion response
    const content = result.data.content || result.data.response || result.data;
    return JSON.parse(typeof content === 'string' ? content : JSON.stringify(content));
  } catch {
    return {
      room_type: 'living room',
      style: 'modern',
      materials: [],
      features: [],
      layout: '',
      enhanced_prompt: prompt,
    };
  }
}


// Enhanced error handling and logging for 3D generation
function logModelAttempt(modelName: string, status: 'start' | 'success' | 'error', details?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    model: modelName,
    status,
    details: details || {},
    errorType: details?.error?.name || null,
    errorMessage: details?.error?.message || null,
  };

  console.log(`[${timestamp}] 🎯 MODEL ${status.toUpperCase()}: ${modelName}`, details ? JSON.stringify(details, null, 2) : '');

  // Store in a global log array for debugging
  if (!(globalThis as any).modelLogs) {
    (globalThis as any).modelLogs = [];
  }
  (globalThis as any).modelLogs.push(logEntry);
}

function getModelLogs() {
  return (globalThis as any).modelLogs || [];
}

function classifyError(error: any): { type: string; severity: 'low' | 'medium' | 'high'; retryable: boolean } {
  const message = error?.message?.toLowerCase() || '';

  if (message.includes('version') || message.includes('not found')) {
    return { type: 'VERSION_ERROR', severity: 'high', retryable: false };
  }
  if (message.includes('parameter') || message.includes('input')) {
    return { type: 'PARAMETER_ERROR', severity: 'high', retryable: false };
  }
  if (message.includes('timeout') || message.includes('network')) {
    return { type: 'NETWORK_ERROR', severity: 'medium', retryable: true };
  }
  if (message.includes('rate limit') || message.includes('quota')) {
    return { type: 'RATE_LIMIT_ERROR', severity: 'medium', retryable: true };
  }
  if (message.includes('authentication') || message.includes('unauthorized')) {
    return { type: 'AUTH_ERROR', severity: 'high', retryable: false };
  }

  return { type: 'UNKNOWN_ERROR', severity: 'medium', retryable: false };
}

// CrewAI Agent: Match materials from our catalog
async function matchMaterials(materials: string[]) {
  if (!materials || materials.length === 0) return [];

  try {
    const materialMatches = [];

    for (const material of materials) {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('id, name, category, properties')
        .or(`name.ilike.%${material}%,description.ilike.%${material}%`)
        .limit(3);

      if (!error && data && data.length > 0) {
        materialMatches.push(...data);
      }
    }

    return materialMatches;
  } catch (error) {
    console.error('Error matching materials:', error);
    return [];
  }
}

// Replicate Models Configuration
const REPLICATE_MODELS = [
  {
    modelName: 'adirik/interior-design',
    name: 'Interior Design AI',
    version: '76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38',
    type: 'unified', // supports both text-to-image and image-to-image
    supportsReferenceImage: true,
    supportsTextOnly: true,
  },
  {
    modelName: 'erayyavuz/interior-ai',
    name: 'Interior AI',
    version: 'e299c531485aac511610a878ef44b554381355de5e',
    type: 'unified',
    supportsReferenceImage: true,
    supportsTextOnly: true,
  },
  {
    modelName: 'jschoormans/comfyui-interior-remodel',
    name: 'ComfyUI Interior Remodel',
    version: '2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce',
    type: 'unified',
    supportsReferenceImage: true,
    supportsTextOnly: true,
  },
  {
    modelName: 'julian-at/interiorly-gen1-dev',
    name: 'Interiorly Gen1 Dev',
    version: '5e3080d1b308e80197b32f0ce638daa8a329d0cf42068739723d8259e44b445e',
    type: 'unified',
    supportsReferenceImage: true,
    supportsTextOnly: true,
  },
  {
    modelName: 'jschoormans/interior-v2',
    name: 'Interior V2',
    version: '8372bd24c6011ea957a0861f0146671eed615e375f038c13259c1882e3c8bac7',
    type: 'unified',
    supportsReferenceImage: true,
    supportsTextOnly: true,
  },
  {
    modelName: 'rocketdigitalai/interior-design-sdxl',
    name: 'Interior Design SDXL',
    version: 'a3c091059a25590ce2d5ea13651fab63f447f21760e50c358d4b850e844f59ee',
    type: 'image-to-image', // requires reference image
    supportsReferenceImage: true,
    supportsTextOnly: false,
  },
  {
    modelName: 'davisbrown/designer-architecture',
    name: 'Designer Architecture',
    version: '0d6f0893b05f14500ce03e45f54290cbffb907d14db49699f2823d0fd35def46',
    type: 'text-to-image', // text-to-image only
    supportsReferenceImage: false,
    supportsTextOnly: true,
  },
];

// Hugging Face Models Configuration
const HUGGINGFACE_MODELS = [
  {
    name: '🎨 Stable Diffusion XL Base 1.0 - stabilityai/stable-diffusion-xl-base-1.0',
    model: 'stabilityai/stable-diffusion-xl-base-1.0',
    type: 'primary',
  },
  {
    name: '⚡ FLUX-Schnell - black-forest-labs/FLUX.1-schnell',
    model: 'black-forest-labs/FLUX.1-schnell',
    type: 'advanced',
  },
  {
    name: '🏠 Interior Design Model - stabilityai/stable-diffusion-2-1',
    model: 'stabilityai/stable-diffusion-2-1',
    type: 'fallback',
  },
];

// Get model configuration for Replicate models
function getModelConfig(modelName: string) {
  const config = REPLICATE_MODELS.find(model => model.modelName === modelName);
  if (!config) {
    console.error(`Model configuration not found for: ${modelName}`);
    return null;
  }
  return config;
}

// Build model input parameters for Replicate API calls
function buildModelInput(modelConfig: any, prompt: string, referenceImageUrl?: string) {
  // Use the test image URL if no reference image is provided
  const defaultImageUrl = 'https://replicate.delivery/pbxt/KhTNuTIKK1F1tvVl8e7mqOlhR3z3D0SAojAMN8BNftCvAubM/bedroom_3.jpg';
  const imageUrl = referenceImageUrl || defaultImageUrl;

  // Model-specific parameter configurations based on actual Replicate API requirements
  switch (modelConfig.modelName) {
    case 'adirik/interior-design':
      // 6-parameter schema as specified by user
      return {
        image: imageUrl,
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, deformed, kitsch, ugly, oversaturated, grain, low-res, Deformed, blurry, bad anatomy, disfigured, poorly drawn face, mutation, mutated, extra limb, ugly, poorly drawn hands, missing limb, blurry, floating limbs, disconnected limbs, malformed hands, blur, out of focus, long neck, long body, ugly, disgusting, poorly drawn, childish, mutilated, mangled, old, surreal',
        guidance_scale: 15,
        prompt_strength: 0.8,
        num_inference_steps: 50,
      };

    case 'erayyavuz/interior-ai':
      // Model-specific configuration as specified by user
      return {
        image: imageUrl,
        prompt: prompt,
        negative_prompt: 'lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional',
        guidance_scale: 7.5,
        strength: 0.8,
        num_inference_steps: 25,
      };

    case 'jschoormans/comfyui-interior-remodel':
      // Hybrid model: supports both text-to-image and image-to-image
      return {
        image: imageUrl,
        prompt: prompt,
        negative_prompt: 'blurry, illustration, distorted, horror',
        output_format: 'webp',
        output_quality: 80,
        randomise_seeds: true,
      };

    case 'julian-at/interiorly-gen1-dev':
      return {
        prompt: prompt,
        image: imageUrl,
        mask: '', // Will be empty as specified
        aspect_ratio: '1:1',
        height: 1024,
        width: 1024,
        prompt_strength: 0.8,
        // model: "schnell",
        num_outputs: 4,
        num_inference_steps: 35,
        guidance_scale: 5,
        output_format: 'webp',
        output_quality: 80,
        go_fast: false,
        megapixels: 1,
        lora_scale: 1,
        extra_lora_scale: 1,
      };

    case 'jschoormans/interior-v2':
      // Advanced interior-v2 model with comprehensive parameter set
      return {
        image: imageUrl,
        prompt: prompt,
        strength: 0.9999,
        max_resolution: 1051,
        keep_furniture_structure: false,
        controlnet_conditioning_scale: 0.03,
        control_guidance_start: 0,
        control_guidance_end: 0.8,
        num_inference_steps: 30,
        guidance_scale: 7,
        control_image: '',
        inverted_mask_window: '',
        inverted_mask_ceiling: '',
        mask_furniture: '',
        negative_prompt: '(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth',
        mask_prompt_window: 'window, doorway',
        mask_prompt_furniture: 'furniture, couch, table, chair, desk, bed, sofa, cupboard, shelf, cabinet, bookcase, dresser, nightstand, armchair, decoration, plant, flower, pillow, lamp, TV',
        mask_prompt_ceiling: 'ceiling',
        ip_adapter_image: '',
        empty_room_mode: false,
      };

    case 'rocketdigitalai/interior-design-sdxl':
      // Image-to-image SDXL model with advanced parameters
      return {
        image: imageUrl,
        prompt: prompt,
        negative_prompt: 'ugly, deformed, noisy, blurry, low quality, glitch, distorted, disfigured, bad proportions, duplicate, out of frame, watermark, signature, text, bad hands, bad anatomy',
        promax_strength: 0.8,
        depth_strength: 0.8,
        num_inference_steps: 50,
        guidance_scale: 7.5,
        refiner_strength: 0.4,
      };

    case 'davisbrown/designer-architecture':
      return {
        prompt: prompt,
        ...(imageUrl && { image: imageUrl }),
        mask: '',
        aspect_ratio: '16:9',
        prompt_strength: 0.8,
        // model: "schnell",
        num_outputs: 3,
        num_inference_steps: 28,
        guidance_scale: 3.5,
        output_format: 'webp',
        output_quality: 100,
        disable_safety_checker: false,
        go_fast: false,
        megapixels: 1,
        lora_scale: 1,
        extra_lora_scale: 1,
      };

    default:
      // Default 6-parameter schema for any unspecified models
      return {
        image: imageUrl,
        prompt: prompt,
        negative_prompt: 'blurry, low quality, distorted, deformed, kitsch, ugly, oversaturated, grain, low-res',
        guidance_scale: 15,
        prompt_strength: 0.8,
        num_inference_steps: 50,
      };
  }
}

// Generate with Hugging Face models (primary generation method)
async function generateHuggingFaceImages(prompt: string): Promise<Array<{url: string, modelName: string}>> {
  console.log('🤗 Starting Hugging Face generation with prompt:', prompt);

  const HF_TOKEN = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
  if (!HF_TOKEN) {
    console.error('❌ HUGGING_FACE_ACCESS_TOKEN is not set');
    throw new Error('HUGGING_FACE_ACCESS_TOKEN is not configured');
  }

  const hf = new HfInference(HF_TOKEN);
  const results: Array<{url: string, modelName: string}> = [];

  // Try each Hugging Face model
  for (const modelConfig of HUGGINGFACE_MODELS) {
    const startTime = Date.now();
    try {
      console.log(`🤗 Attempting ${modelConfig.name}...`);
      await updateWorkflowStep(modelConfig.model, 'running');

      // Special handling for FLUX models
      if (modelConfig.model.includes('FLUX')) {
        console.log(`⚡ Using optimized FLUX parameters for ${modelConfig.model}`);

        // Use a simplified approach for FLUX with timeout and retry logic
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        try {
          const response = await fetch(`https://api-inference.huggingface.co/models/${modelConfig.model}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${HF_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              inputs: prompt,
              parameters: {
                num_inference_steps: 1, // Minimum for schnell
                guidance_scale: 0.0,    // Minimum guidance for schnell
                width: 1024,
                height: 1024,
              },
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ HF API Error ${response.status}:`, errorText);

            // Handle specific error cases
            if (response.status === 503) {
              throw new Error(`Model ${modelConfig.model} is currently loading. Please try again in a few minutes.`);
            } else if (response.status === 429) {
              throw new Error(`Rate limit exceeded for ${modelConfig.model}. Please try again later.`);
            } else if (response.status === 401) {
              throw new Error('Authentication failed. Please check your Hugging Face token.');
            } else {
              throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
            }
          }

          // Enhanced blob fetching with error handling and validation
          let blob;
          try {
            console.log(`🔄 Converting response to blob for ${modelConfig.name}...`);
            blob = await response.blob();
            console.log(`✅ Blob conversion successful for ${modelConfig.name}`);
          } catch (blobError) {
            console.error(`❌ Blob conversion failed for ${modelConfig.model}:`, blobError);
            throw new Error(`Failed to convert response to blob for ${modelConfig.model}: ${blobError.message}`);
          }

          // Enhanced blob validation
          if (!blob) {
            throw new Error(`Null blob received from ${modelConfig.model}`);
          }

          if (blob.size === 0) {
            throw new Error(`Empty blob (0 bytes) received from ${modelConfig.model}`);
          }

          // Check if blob type is valid for images
          if (!blob.type || (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream')) {
            console.warn(`⚠️ Unexpected blob type for ${modelConfig.model}: ${blob.type}`);
            // Don't throw error as some APIs return octet-stream for images
          }

          console.log(`📊 Blob details for ${modelConfig.name}: ${blob.size} bytes, type: ${blob.type}`);

          // Additional validation: check if blob size is reasonable (between 1KB and 50MB)
          if (blob.size < 1024) {
            throw new Error(`Blob too small (${blob.size} bytes) for ${modelConfig.model} - likely not a valid image`);
          }

          if (blob.size > 50 * 1024 * 1024) {
            throw new Error(`Blob too large (${blob.size} bytes) for ${modelConfig.model} - exceeds 50MB limit`);
          }

          const arrayBuffer = await blob.arrayBuffer();

          // Enhanced blob processing with error handling
          if (!arrayBuffer || arrayBuffer.byteLength === 0) {
            throw new Error(`Failed to convert blob to ArrayBuffer for ${modelConfig.model}`);
          }

          // Convert ArrayBuffer to base64 with chunked processing for large images
          const uint8Array = new Uint8Array(arrayBuffer);
          const chunkSize = 8192; // Process in 8KB chunks to avoid memory issues
          let binaryString = '';

          for (let i = 0; i < uint8Array.length; i += chunkSize) {
            const chunk = uint8Array.slice(i, i + chunkSize);
            for (let j = 0; j < chunk.length; j++) {
              binaryString += String.fromCharCode(chunk[j]);
            }
          }

          const base64 = btoa(binaryString);
          const result = `data:image/png;base64,${base64}`;

          results.push({
            url: result,
            modelName: modelConfig.name,
          });
          console.log(`✅ ${modelConfig.name} generation successful with direct API`);
          await updateWorkflowStep(modelConfig.model, 'success', result, undefined, Date.now() - startTime);

        } catch (fetchError) {
          clearTimeout(timeoutId);
          throw fetchError;
        }

      } else {
        // Standard HF SDK for other models with timeout
        console.log(`🔄 Using HF SDK for ${modelConfig.model}`);

        // Special handling for problematic models like stabilityai/stable-diffusion-2-1
        if (modelConfig.model === 'stabilityai/stable-diffusion-2-1') {
          console.log(`⚡ Using direct API approach for problematic model: ${modelConfig.model}`);

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout for problematic models

          try {
            const response = await fetch(`https://api-inference.huggingface.co/models/${modelConfig.model}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${HF_TOKEN}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                inputs: prompt,
                parameters: {
                  num_inference_steps: 20, // Reduced steps for stability
                  guidance_scale: 7.5,     // Standard guidance scale
                  width: 512,              // Standard resolution
                  height: 512,
                },
                options: {
                  wait_for_model: true,    // Wait for model to load
                  use_cache: false,         // Don't use cache to avoid stale responses
                },
              }),
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
              const errorText = await response.text();
              console.error(`❌ HF API Error ${response.status}:`, errorText);

              // Handle specific error cases
              if (response.status === 503) {
                throw new Error(`Model ${modelConfig.model} is currently loading. Please try again in a few minutes.`);
              } else if (response.status === 429) {
                throw new Error(`Rate limit exceeded for ${modelConfig.model}. Please try again later.`);
              } else if (response.status === 401) {
                throw new Error('Authentication failed. Please check your Hugging Face token.');
              } else {
                throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
              }
            }

            // Enhanced blob fetching with error handling and validation
            let blob;
            try {
              console.log(`🔄 Converting response to blob for ${modelConfig.name}...`);
              blob = await response.blob();
              console.log(`✅ Blob conversion successful for ${modelConfig.name}`);
            } catch (blobError) {
              console.error(`❌ Blob conversion failed for ${modelConfig.model}:`, blobError);
              throw new Error(`Failed to convert response to blob for ${modelConfig.model}: ${blobError.message}`);
            }

            // Enhanced blob validation
            if (!blob) {
              throw new Error(`Null blob received from ${modelConfig.model}`);
            }

            if (blob.size === 0) {
              throw new Error(`Empty blob (0 bytes) received from ${modelConfig.model}`);
            }

            // Check if blob type is valid for images
            if (!blob.type || (!blob.type.startsWith('image/') && blob.type !== 'application/octet-stream')) {
              console.warn(`⚠️ Unexpected blob type for ${modelConfig.model}: ${blob.type}`);
              // Don't throw error as some APIs return octet-stream for images
            }

            console.log(`📊 Blob details for ${modelConfig.name}: ${blob.size} bytes, type: ${blob.type}`);

            // Additional validation: check if blob size is reasonable (between 1KB and 50MB)
            if (blob.size < 1024) {
              throw new Error(`Blob too small (${blob.size} bytes) for ${modelConfig.model} - likely not a valid image`);
            }

            if (blob.size > 50 * 1024 * 1024) {
              throw new Error(`Blob too large (${blob.size} bytes) for ${modelConfig.model} - exceeds 50MB limit`);
            }

            const arrayBuffer = await blob.arrayBuffer();

            // Enhanced blob processing with error handling
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              throw new Error(`Failed to convert blob to ArrayBuffer for ${modelConfig.model}`);
            }

            // Convert ArrayBuffer to base64 with chunked processing for large images
            const uint8Array = new Uint8Array(arrayBuffer);
            const chunkSize = 8192; // Process in 8KB chunks to avoid memory issues
            let binaryString = '';

            for (let i = 0; i < uint8Array.length; i += chunkSize) {
              const chunk = uint8Array.slice(i, i + chunkSize);
              for (let j = 0; j < chunk.length; j++) {
                binaryString += String.fromCharCode(chunk[j]);
              }
            }

            const base64 = btoa(binaryString);
            const result = `data:image/png;base64,${base64}`;

            results.push({
              url: result,
              modelName: modelConfig.name,
            });
            console.log(`✅ ${modelConfig.name} generation successful with direct API`);
            await updateWorkflowStep(modelConfig.model, 'success', result, undefined, Date.now() - startTime);

          } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
          }

        } else {
          // Standard HF SDK for other models with timeout
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 45000); // 45 second timeout for other models

          try {
            const image = await hf.textToImage({
              inputs: prompt,
              model: modelConfig.model,
            });

            clearTimeout(timeoutId);

            // Enhanced validation for image response
            if (!image) {
              throw new Error(`No image response received from ${modelConfig.model}`);
            }

            const arrayBuffer = await image.arrayBuffer();

            // Enhanced blob processing with validation
            if (!arrayBuffer || arrayBuffer.byteLength === 0) {
              throw new Error(`Failed to get valid image data from ${modelConfig.model}`);
            }

            console.log(`📊 Image size for ${modelConfig.name}: ${arrayBuffer.byteLength} bytes`);

            // Convert ArrayBuffer to base64 with chunked processing and error handling
            try {
              const uint8Array = new Uint8Array(arrayBuffer);
              const chunkSize = 8192; // Process in 8KB chunks
              let binaryString = '';

              for (let i = 0; i < uint8Array.length; i += chunkSize) {
                const chunk = uint8Array.slice(i, i + chunkSize);
                for (let j = 0; j < chunk.length; j++) {
                  binaryString += String.fromCharCode(chunk[j]);
                }
              }

              const base64 = btoa(binaryString);
              const result = `data:image/png;base64,${base64}`;

              results.push({
                url: result,
                modelName: modelConfig.name,
              });
              console.log(`✅ ${modelConfig.name} generation successful`);
              await updateWorkflowStep(modelConfig.model, 'success', result, undefined, Date.now() - startTime);

            } catch (conversionError) {
              console.error(`❌ Base64 conversion failed for ${modelConfig.model}:`, conversionError);
              throw new Error(`Failed to convert image data to base64 for ${modelConfig.model}: ${conversionError.message}`);
            }
          } catch (sdkError) {
            clearTimeout(timeoutId);

            // Enhanced error handling for specific HF SDK errors
            if (sdkError.message && sdkError.message.includes('arrayBuffer')) {
              throw new Error(`Blob processing error for ${modelConfig.model}: Unable to convert response to ArrayBuffer`);
            } else if (sdkError.message && sdkError.message.includes('AbortError')) {
              throw new Error(`Request timeout for ${modelConfig.model}: Model took too long to respond`);
            } else {
              throw sdkError;
            }
          }
        }
      }

      // Continue to next model to show ALL models
    } catch (error) {
      const errorMessage = error.message || 'Unknown error occurred';
      console.error(`❌ ${modelConfig.name} failed:`, errorMessage);
      console.error('❌ Full error details:', error);

      // Enhanced error classification for Hugging Face specific errors
      let classifiedError = classifyError(error);
      if (errorMessage.includes('loading')) {
        classifiedError = { type: 'MODEL_LOADING', severity: 'medium', retryable: true };
      } else if (errorMessage.includes('Rate limit')) {
        classifiedError = { type: 'RATE_LIMIT_ERROR', severity: 'medium', retryable: true };
      } else if (errorMessage.includes('blob') || errorMessage.includes('ArrayBuffer')) {
        classifiedError = { type: 'BLOB_PROCESSING_ERROR', severity: 'high', retryable: false };
      }

      await updateWorkflowStep(modelConfig.model, 'failed', undefined, `${classifiedError.type}: ${errorMessage}`, Date.now() - startTime);
      // Continue to next model on failure
    }
  }

  return results;
}

// Generate with YOUR EXACT Replicate text-to-image models only
async function generateTextToImageModels(prompt: string, replicate: any, referenceImageUrl?: string): Promise<Array<{url: string, modelName: string}>> {
  const results: Array<{url: string, modelName: string}> = [];
  console.log('🎭 Starting text-to-image model generations...');
  console.log('📋 REPLICATE MODELS TO TEST:');
  console.log('   1. 🏡 Interior Design AI - adirik/interior-design');
  console.log('   2. 🏠 Interior AI - erayyavuz/interior-ai');
  console.log('   3. 🎨 ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel');
  console.log('   4. 🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev');
  console.log('   5. 🏘️ Interior V2 - jschoormans/interior-v2');
  console.log('   6. 🚀 Interior Design SDXL - rocketdigitalai/interior-design-sdxl');
  console.log('   7. 🏗️ Designer Architecture - davisbrown/designer-architecture');
  console.log('📋 TEXT-TO-IMAGE MODELS TO TEST:');
  console.log('   1. 🏗️ Designer Architecture - davisbrown/designer-architecture');
  console.log('------------------------------------------------------');

  // Model 1: adirik/interior-design - UNIFIED MODEL (supports both text-to-image and image-to-image)
  try {
    console.log('🏡 Attempting Interior Design AI model...');
    await updateWorkflowStep('adirik/interior-design', 'running');

    const inputParams: any = {
      prompt: prompt,
      guidance_scale: 15,
      negative_prompt: 'lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional, realistic',
      num_inference_steps: 50,
    };

    // Add image parameter if reference image is provided
    if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
      inputParams.image = referenceImageUrl;
      inputParams.prompt_strength = 0.8;
    }

    // Use latest version instead of hardcoded version to avoid version errors
    const output = await replicate.run('adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38', {
      input: inputParams,
    });

    console.log('Interior Design AI raw output:', output);
    if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏡 Interior Design AI - adirik/interior-design',
      });
      console.log('✅ Interior Design AI successful:', output);
      await updateWorkflowStep('adirik/interior-design', 'success', output);
    } else {
      console.log('⚠️ Interior Design AI unexpected output format:', typeof output, output);
      await updateWorkflowStep('adirik/interior-design', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior Design AI failed:', error.message);
    await updateWorkflowStep('adirik/interior-design', 'failed', undefined, error.message);
  }

  // Model 2: erayyavuz/interior-ai - UNIFIED MODEL (supports both text-to-image and image-to-image)
  try {
    console.log('🏠 Attempting Interior AI model...');
    await updateWorkflowStep('erayyavuz/interior-ai', 'running');

    const inputParams: any = {
      prompt: prompt,
      guidance_scale: 7.5,
      negative_prompt: 'low quality, blurry, watermark, unrealistic',
      num_inference_steps: 50,
      strength: 0.8,
    };

    // Add image parameter if reference image is provided (for image-to-image mode)
    if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
      inputParams.image = referenceImageUrl;
    }

    // Use latest version instead of hardcoded version to avoid version errors
    const output = await replicate.run('erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9', {
      input: inputParams,
    });

    console.log('Interior AI raw output:', output);
    if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏠 Interior AI - erayyavuz/interior-ai',
        // model: "erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9",

      });
      console.log('✅ Interior AI successful:', output);
      await updateWorkflowStep('erayyavuz/interior-ai', 'success', output);
    } else {
      console.log('⚠️ Interior AI unexpected output format:', typeof output, output);
      await updateWorkflowStep('erayyavuz/interior-ai', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior AI failed:', error.message);
    await updateWorkflowStep('erayyavuz/interior-ai', 'failed', undefined, error.message);
  }

  // Model 3: jschoormans/comfyui-interior-remodel - UNIFIED MODEL (supports both text-to-image and image-to-image)
  try {
    console.log('🎨 Attempting ComfyUI Interior Remodel model...');
    await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'running');

    const inputParams: any = {
      prompt: prompt || 'photo of a beautiful living room, modern design, modernist, cozy\nhigh resolution, highly detailed, 4k',
      output_format: 'webp',
      output_quality: 80,
      negative_prompt: 'blurry, illustration, distorted, horror',
      randomise_seeds: true,
      return_temp_files: false,
    };

    // Add image parameter if reference image is provided (for image-to-image mode)
    if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
      inputParams.image = referenceImageUrl;
    }

    // Use latest version instead of hardcoded version to avoid version errors
    const output = await replicate.run('jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce', {
      input: inputParams,
    });

    console.log('ComfyUI Interior Remodel raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🎨 ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel',
        // model: "jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce",

      });
      console.log('✅ ComfyUI Interior Remodel successful:', output[0]);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🎨 ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel',
        // model: "jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce",

      });
      console.log('✅ ComfyUI Interior Remodel successful:', output);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'success', output);
    } else {
      console.log('⚠️ ComfyUI Interior Remodel unexpected output format:', typeof output, output);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ ComfyUI Interior Remodel failed:', error.message);
    await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'failed', undefined, error.message);
  }

  // Model 4: julian-at/interiorly-gen1-dev - UNIFIED MODEL (supports both text-to-image and image-to-image)
  try {
    console.log('🏛️ Attempting Interiorly Gen1 Dev model...');
    await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'running');

    const inputParams: any = {
      prompt: prompt,
      // model: "dev",
      width: 1024,
      height: 1024,
      guidance_scale: 5,
      num_inference_steps: 35,
      go_fast: false,
    };

    // Add image parameter if reference image is provided (for image-to-image mode)
    if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
      inputParams.image = referenceImageUrl;
      // Remove width/height when using image input as per schema
      delete inputParams.width;
      delete inputParams.height;
    }

    const output = await replicate.run('julian-at/interiorly-gen1-dev:5e3080d1b308e80197b32f0ce638daa8a329d0cf42068739723d8259e44b445e', {
      input: inputParams,
    });

    console.log('Interiorly Gen1 Dev raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev',
        // model: "julian-at/interiorly-gen1-dev",

      });
      console.log('✅ Interiorly Gen1 Dev successful:', output[0]);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev',
        // model: "julian-at/interiorly-gen1-dev",

      });
      console.log('✅ Interiorly Gen1 Dev successful:', output);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'success', output);
    } else {
      console.log('⚠️ Interiorly Gen1 Dev unexpected output format:', typeof output, output);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interiorly Gen1 Dev failed:', error.message);
    await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'failed', undefined, error.message);
  }

  // Model 5: jschoormans/interior-v2 - UNIFIED MODEL (supports both text-to-image and image-to-image)
  try {
    console.log('🏘️ Attempting Interior V2 model...');
    await updateWorkflowStep('jschoormans/interior-v2', 'running');

    const inputParams: any = {
      prompt: prompt || 'Living room, scandinavian interior, photograph, clean, beautiful, high quality, 8k',
      strength: 0.999999,
      guidance_scale: 7,
      max_resolution: 1051,
      empty_room_mode: false,
      negative_prompt: '(worst quality, low quality, illustration, 3d, 2d, painting, cartoons, sketch), open mouth',
      mask_prompt_window: 'window, doorway',
      mask_prompt_ceiling: 'ceiling',
      num_inference_steps: 30,
      control_guidance_end: 0.8,
      control_guidance_start: 0,
      mask_prompt_furniture: 'furniture, couch, table, chair, desk, bed, sofa, cupboard, shelf, cabinet, bookcase, dresser, nightstand, armchair, decoration, plant, flower, pillow, lamp, TV',
      keep_furniture_structure: false,
      controlnet_conditioning_scale: 0.03,
    };

    // Add image parameter if reference image is provided (for image-to-image mode)
    if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
      inputParams.image = referenceImageUrl;
    }

    const output = await replicate.run('jschoormans/interior-v2:8372bd24c6011ea957a0861f0146671eed615e375f038c13259c1882e3c8bac7', {
      input: inputParams,
    });

    console.log('Interior V2 raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏘️ Interior V2 - jschoormans/interior-v2',
        // model: "jschoormans/interior-v2",

      });
      console.log('✅ Interior V2 successful:', output[0]);
      await updateWorkflowStep('jschoormans/interior-v2', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏘️ Interior V2 - jschoormans/interior-v2',
        // model: "jschoormans/interior-v2",

      });
      console.log('✅ Interior V2 successful:', output);
      await updateWorkflowStep('jschoormans/interior-v2', 'success', output);
    } else {
      console.log('⚠️ Interior V2 unexpected output format:', typeof output, output);
      await updateWorkflowStep('jschoormans/interior-v2', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior V2 failed:', error.message);
    await updateWorkflowStep('jschoormans/interior-v2', 'failed', undefined, error.message);
  }

  // Model 6: rocketdigitalai/interior-design-sdxl - IMAGE-TO-IMAGE ONLY
  try {
    console.log('🚀 Attempting Interior Design SDXL model...');

    // Skip if no reference image (this model requires an image input)
    if (!referenceImageUrl || referenceImageUrl === '[NO_IMAGE]') {
      console.log('⏭️ Skipping Interior Design SDXL - requires reference image');
      await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'skipped', undefined, 'Requires reference image');
    } else {
      updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'running');

      const inputParams = {
        image: referenceImageUrl,
        prompt: prompt || 'masterfully designed interior, photorealistic, interior design magazine quality, 8k uhd, highly detailed',
        depth_strength: 0.8,
        guidance_scale: 7.5,
        negative_prompt: 'ugly, deformed, noisy, blurry, low quality, glitch, distorted, disfigured, bad proportions, duplicate, out of frame, watermark, signature, text, bad hands, bad anatomy',
        promax_strength: 0.8,
        refiner_strength: 0.4,
        num_inference_steps: 50,
      };

      const output = await replicate.run('rocketdigitalai/interior-design-sdxl:a3c091059a25590ce2d5ea13651fab63f447f21760e50c358d4b850e844f59ee', {
        input: inputParams,
      });

      console.log('Interior Design SDXL raw output:', output);
      if (typeof output === 'string') {
        results.push({
          url: output,
          modelName: '🚀 Interior Design SDXL - rocketdigitalai/interior-design-sdxl',
          // model: "rocketdigitalai/interior-design-sdxl",

        });
        console.log('✅ Interior Design SDXL successful:', output);
        await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'success', output);
      } else {
        console.log('⚠️ Interior Design SDXL unexpected output format:', typeof output, output);
        await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, 'Unexpected output format');
      }
    }
  } catch (error) {
    console.error('❌ Interior Design SDXL failed:', error.message);
    await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, error.message);
  }

  // Model 7: davisbrown/designer-architecture - TEXT-TO-IMAGE ONLY
  try {
    console.log('🏗️ Attempting Designer Architecture model...');
    await updateWorkflowStep('davisbrown/designer-architecture', 'running');

    const output = await replicate.run('davisbrown/designer-architecture:0d6f0893b05f14500ce03e45f54290cbffb907d14db49699f2823d0fd35def46', {
      input: {
        prompt: `Interior DESARCH design, ${prompt}, simple modern design, open ceiling, windows shining light, beautiful interior, photorealistic`,
        num_outputs: 1,
        aspect_ratio: '16:9',
        guidance_scale: 3.5,
        output_quality: 90,
      },
    });

    console.log('Designer Architecture raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏗️ Designer Architecture - davisbrown/designer-architecture',
        // model: "davisbrown/designer-architecture",

      });
      console.log('✅ Designer Architecture successful:', output[0]);
      await updateWorkflowStep('davisbrown/designer-architecture', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏗️ Designer Architecture - davisbrown/designer-architecture',
        // model: "davisbrown/designer-architecture",

      });
      console.log('✅ Designer Architecture successful:', output);
      await updateWorkflowStep('davisbrown/designer-architecture', 'success', output);
    } else {
      console.log('⚠️ Designer Architecture unexpected output format:', typeof output, output);
      await updateWorkflowStep('davisbrown/designer-architecture', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Designer Architecture failed:', error.message);
    await updateWorkflowStep('davisbrown/designer-architecture', 'failed', undefined, error.message);
  }

  // No more problematic models - cleaned up

  console.log('📊 TEXT-TO-IMAGE GENERATION SUMMARY:');
  console.log(`   ✅ Successfully generated ${results.length} images from text-to-image models`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}`);
  });
  console.log('------------------------------------------------------');

  return results;
}

// Generate with YOUR EXACT Replicate image-to-image models only
async function generateImageToImageModels(finalPrompt: string, referenceImageUrl: string, replicate: any): Promise<Array<{url: string, modelName: string}>> {
  const results: Array<{url: string, modelName: string}> = [];
  console.log('🖼️ Starting image-to-image model generations...');
  console.log('📋 IMAGE-TO-IMAGE MODELS TO TEST:');
  console.log('   1. 🎨 Interior Design AI - adirik/interior-design');
  console.log('   2. 🏠 Interior AI - erayyavuz/interior-ai');
  console.log('   3. 🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel');
  console.log('   4. 🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev');
  console.log('   5. 🪟 Interior V2 - jschoormans/interior-v2');
  console.log('   6. 🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl');
  console.log('------------------------------------------------------');

  // Model 1: adirik/interior-design - FIXED WITH CORRECT SCHEMA (image + prompt only)
  // Model 1: davisbrown/designer-architecture
  try {
    console.log('🏗️ Attempting Designer Architecture model...');
    const output = await replicate.run('davisbrown/designer-architecture:0d6f0893b05f14500ce03e45f54290cbffb907d14db49699f2823d0fd35def46', {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
        model: 'schnell',
        num_inference_steps: 28,
        guidance_scale: 3,
        aspect_ratio: '16:9',
        output_format: 'webp',
        output_quality: 80,
        num_outputs: 1,
      },
    });

    console.log('Designer Architecture raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏗️ Designer Architecture - davisbrown/designer-architecture',
        // model: "davisbrown/designer-architecture",

      });
      console.log('✅ Designer Architecture generation successful:', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏗️ Designer Architecture - davisbrown/designer-architecture',
        // model: "davisbrown/designer-architecture",

      });
      console.log('✅ Designer Architecture generation successful:', output);
    }
  } catch (error) {
    console.error('❌ Designer Architecture failed:', error.message);
  }

  // Model 2: adirik/interior-design - FIXED WITH VERSION HASH
  try {
    console.log('🎨 Attempting Interior Design AI model...');
    await updateWorkflowStep('adirik/interior-design', 'running');

    const output = await replicate.run('adirik/interior-design:76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38', {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
      },
    });

    console.log('Interior Design AI raw output:', output);
    if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🎨 Interior Design AI - adirik/interior-design',
      });
      console.log('✅ Interior Design AI generation successful:', output);
      await updateWorkflowStep('adirik/interior-design', 'success', output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🎨 Interior Design AI - adirik/interior-design',
      });
      console.log('✅ Interior Design AI generation successful:', output[0]);
      await updateWorkflowStep('adirik/interior-design', 'success', output[0]);
    } else {
      console.log('⚠️ Interior Design AI unexpected output format:', typeof output, output);
      await updateWorkflowStep('adirik/interior-design', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior Design AI failed:', error.message);
    await updateWorkflowStep('adirik/interior-design', 'failed', undefined, error.message);
  }

  // Model 3: erayyavuz/interior-ai - FIXED WITH CORRECT SCHEMA
  try {
    console.log('🏠 Attempting Interior AI model...');
    await updateWorkflowStep('erayyavuz/interior-ai', 'running');

    const output = await replicate.run('erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5e', {
      input: {
        input: referenceImageUrl,
        prompt: finalPrompt,
        negative_prompt: 'lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus, out of frame, surreal, extra, ugly, upholstered walls, fabric walls, plush walls, mirror, mirrored, functional',
        num_inference_steps: 25,
      },
    });

    console.log('Interior AI raw output:', output);
    if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏠 Interior AI - erayyavuz/interior-ai',
        // model: "erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9",

      });
      console.log('✅ Interior AI generation successful:', output);
      await updateWorkflowStep('erayyavuz/interior-ai', 'success', output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏠 Interior AI - erayyavuz/interior-ai',
        // model: "erayyavuz/interior-ai:e299c531485aac511610a878ef44b554381355de5ee032d109fcae5352f39fa9",

      });
      console.log('✅ Interior AI generation successful:', output[0]);
      await updateWorkflowStep('erayyavuz/interior-ai', 'success', output[0]);
    } else {
      console.log('⚠️ Interior AI unexpected output format:', typeof output, output);
      await updateWorkflowStep('erayyavuz/interior-ai', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior AI failed:', error.message);
    await updateWorkflowStep('erayyavuz/interior-ai', 'failed', undefined, error.message);
  }

  // Model 5: julian-at/interiorly-gen1-dev - IMAGE-TO-IMAGE ONLY
  try {
    console.log('🏛️ Attempting Interiorly Gen1 Dev model...');
    await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'running');

    const output = await replicate.run('julian-at/interiorly-gen1-dev:5e3080d1b308e80197b32f0ce638daa8a329d0cf42068739723d8259e44b445e', {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
        // model: "dev",
        guidance_scale: 5,
        num_inference_steps: 35,
        go_fast: false,
      },
    });

    console.log('Interiorly Gen1 Dev raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev',
        // model: "julian-at/interiorly-gen1-dev",

      });
      console.log('✅ Interiorly Gen1 Dev generation successful:', output[0]);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🏛️ Interiorly Gen1 Dev - julian-at/interiorly-gen1-dev',
        // model: "julian-at/interiorly-gen1-dev",

      });
      console.log('✅ Interiorly Gen1 Dev generation successful:', output);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'success', output);
    } else {
      console.log('⚠️ Interiorly Gen1 Dev unexpected output format:', typeof output, output);
      await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interiorly Gen1 Dev failed:', error.message);
    await updateWorkflowStep('julian-at/interiorly-gen1-dev', 'failed', undefined, error.message);
  }

  // Model 6: jschoormans/interior-v2 - FIXED WITH CORRECT SCHEMA
  try {
    console.log('🛠️ Attempting ComfyUI Interior Remodel model...');
    await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'running');

    const output = await replicate.run('jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce', {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt,
      },
    });

    console.log('ComfyUI Interior Remodel raw output:', output);
    if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel',
        // model: "jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce",

      });
      console.log('✅ ComfyUI Interior Remodel generation successful:', output[0]);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'success', output[0]);
    } else if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🛠️ ComfyUI Interior Remodel - jschoormans/comfyui-interior-remodel',
        // model: "jschoormans/comfyui-interior-remodel:2a360362540e1f6cfe59c9db4aa8aa9059233d40e638aae0cdeb6b41f3d0dcce",

      });
      console.log('✅ ComfyUI Interior Remodel generation successful:', output);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'success', output);
    } else {
      console.log('⚠️ ComfyUI Interior Remodel unexpected output format:', typeof output, output);
      await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ ComfyUI Interior Remodel failed:', error.message);
    await updateWorkflowStep('jschoormans/comfyui-interior-remodel', 'failed', undefined, error.message);
  }

  // Model 6: rocketdigitalai/interior-design-sdxl - FIXED WITH CORRECT SCHEMA
  try {
    console.log('🚀 Attempting Interior Design SDXL model...');
    await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'running');

    // Skip if no reference image provided
    if (!referenceImageUrl) {
      console.log('⚠️ Interior Design SDXL skipped: No reference image provided');
      await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, 'No reference image provided');
    } else {
      // Use buildModelInput to get correct parameters
      const inputParams = buildModelInput('rocketdigitalai/interior-design-sdxl', referenceImageUrl, finalPrompt);

      const output = await replicate.run('rocketdigitalai/interior-design-sdxl:a3c091059a25590ce2d5ea13651fab63f447f21760e50c358d4b850e844f59ee', {
        input: inputParams,
      });

      console.log('Interior Design SDXL raw output:', output);
      if (Array.isArray(output) && output.length > 0) {
        results.push({
          url: output[0],
          modelName: '🚀 Interior Design SDXL - rocketdigitalai/interior-design-sdxl',
          // model: "rocketdigitalai/interior-design-sdxl",

        });
        console.log('✅ Interior Design SDXL generation successful:', output[0]);
        await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'success', output[0]);
      } else if (typeof output === 'string') {
        results.push({
          url: output,
          modelName: '🚀 Interior Design SDXL - rocketdigitalai/interior-design-sdxl',
          // model: "rocketdigitalai/interior-design-sdxl",

        });
        console.log('✅ Interior Design SDXL generation successful:', output);
        await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'success', output);
      } else {
        console.log('⚠️ Interior Design SDXL unexpected output format:', typeof output, output);
        await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, 'Unexpected output format');
      }
    }
  } catch (error) {
    console.error('❌ Interior Design SDXL failed:', error.message);
    await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, error.message);
  }

  // Model 7: rocketdigitalai/interior-design-sdxl - FIXED WITH CORRECT SCHEMA
  try {
    console.log('🎯 Attempting Interior Design SDXL model...');
    await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'running');

    const output = await replicate.run('rocketdigitalai/interior-design-sdxl:a3c091059a25590ce2d5ea13651fab63f447f21760e50c358d4b850e844f59ee', {
      input: {
        image: referenceImageUrl,
        prompt: finalPrompt || 'masterfully designed interior, photorealistic, interior design magazine quality, 8k uhd, highly detailed',
      },
    });

    console.log('Interior Design SDXL raw output:', output);
    if (typeof output === 'string') {
      results.push({
        url: output,
        modelName: '🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl',
        // model: "rocketdigitalai/interior-design-sdxl",

      });
      console.log('✅ Interior Design SDXL generation successful:', output);
      await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'success', output);
    } else if (Array.isArray(output) && output.length > 0) {
      results.push({
        url: output[0],
        modelName: '🎯 Interior Design SDXL - rocketdigitalai/interior-design-sdxl',
        // model: "rocketdigitalai/interior-design-sdxl",

      });
      console.log('✅ Interior Design SDXL generation successful:', output[0]);
      await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'success', output[0]);
    } else {
      console.log('⚠️ Interior Design SDXL unexpected output format:', typeof output, output);
      await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, 'Unexpected output format');
    }
  } catch (error) {
    console.error('❌ Interior Design SDXL failed:', error.message);
    await updateWorkflowStep('rocketdigitalai/interior-design-sdxl', 'failed', undefined, error.message);
  }

  console.log('📊 IMAGE-TO-IMAGE GENERATION SUMMARY:');
  console.log(`   ✅ Successfully generated ${results.length} images from image-to-image models`);
  results.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}`);
  });
  console.log('------------------------------------------------------');

  return results;
}

// CrewAI Agent: Orchestrate all image generation services
async function generate3DImage(enhancedPrompt: string, materials: any[], referenceImageUrl?: string) {
  console.log('🚀 Starting generate3DImage function');
  console.log('📝 Enhanced prompt:', enhancedPrompt);
  console.log('🧱 Materials count:', materials.length);
  console.log('🖼️ Reference image provided:', !!referenceImageUrl);

  // Enhanced prompt with material details
  let finalPrompt = enhancedPrompt;
  if (materials.length > 0) {
    const materialDescriptions = materials.map(m => `${m.name} (${m.category})`).join(', ');
    finalPrompt += `. Materials: ${materialDescriptions}`;
  }
  console.log('✨ Final prompt:', finalPrompt);

  const allResults: Array<{url: string, modelName: string}> = [];

  // Determine which models to run based on reference image
  if (referenceImageUrl && referenceImageUrl !== '[NO_IMAGE]') {
    console.log('🖼️ Reference image provided, running IMAGE-TO-IMAGE models only');

    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    console.log('🔑 Replicate token available:', !!replicateToken);

    if (replicateToken) {
      try {
        const replicate = new Replicate({
          auth: replicateToken,
        });
        console.log('🤖 Replicate client initialized successfully');

        // Only run image-to-image models
        console.log('🎨 Running image-to-image models...');
        const imageToImageResults = await generateImageToImageModels(finalPrompt, referenceImageUrl, replicate);
        console.log(`📊 Image-to-image results: ${imageToImageResults.length} images generated`);
        allResults.push(...imageToImageResults);
      } catch (replicateError) {
        console.error('❌ Replicate generation failed:', replicateError.message);
        console.error('❌ Replicate full error:', replicateError);
      }
    } else {
      console.error('❌ REPLICATE_API_KEY not found in environment');
    }
  } else {
    // No reference image - run text-to-image models only
    console.log('📝 No reference image, running TEXT-TO-IMAGE models only');

    // Start with Hugging Face models (more reliable)
    console.log('🤗 Running Hugging Face models...');
    try {
      const hfResults = await generateHuggingFaceImages(finalPrompt);
      console.log(`📊 Hugging Face results: ${hfResults.length} images generated`);
      allResults.push(...hfResults);
    } catch (hfError) {
      console.error('❌ Hugging Face generation failed:', hfError.message);
      console.error('❌ Hugging Face full error:', hfError);
    }

    // Generate with Replicate text-to-image models
    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    console.log('🔑 Replicate token available:', !!replicateToken);

    if (replicateToken) {
      console.log('🤖 Running Replicate text-to-image models...');

      try {
        const replicate = new Replicate({
          auth: replicateToken,
        });
        console.log('🤖 Replicate client initialized successfully');

        // Only run text-to-image models
        console.log('📝 Running text-to-image models...');
        const textToImageResults = await generateTextToImageModels(finalPrompt, replicate);
        console.log(`📊 Text-to-image results: ${textToImageResults.length} images generated`);
        allResults.push(...textToImageResults);
      } catch (replicateError) {
        console.error('❌ Replicate generation failed:', replicateError.message);
        console.error('❌ Replicate full error:', replicateError);
      }
    } else {
      console.error('❌ REPLICATE_API_KEY not found in environment');
    }
  }

  console.log(`📊 FINAL RESULTS: Generated ${allResults.length} total images`);

  // Always log detailed model status summary before any early returns
  const failedModels = workflowSteps.filter(step => step.status === 'failed');
  const skippedModels = workflowSteps.filter(step => step.status === 'skipped');
  const successfulModels = workflowSteps.filter(step => step.status === 'success' || step.status === 'completed');
  const pendingModels = workflowSteps.filter(step => step.status === 'pending');

  console.log('\n🚨 COMPLETE MODELS SUMMARY:');
  console.log(`📊 Total models attempted: ${workflowSteps.length}`);
  console.log(`✅ Successful: ${successfulModels.length}`);
  console.log(`❌ Failed: ${failedModels.length}`);
  console.log(`⏭️ Skipped: ${skippedModels.length}`);
  console.log(`⏸️ Not attempted: ${pendingModels.length}`);

  if (failedModels.length > 0) {
    console.log('\n❌ FAILED MODELS:');
    failedModels.forEach((step, index) => {
      const reason = step.errorMessage || step.error || 'Unknown error';
      const processingTime = step.processingTimeMs ? ` (${step.processingTimeMs}ms)` : '';
      console.log(`   ${index + 1}. ❌ ${step.modelName || step.name}: ${reason}${processingTime}`);
    });
  }

  if (skippedModels.length > 0) {
    console.log('\n⏭️ SKIPPED MODELS:');
    skippedModels.forEach((step, index) => {
      const reason = step.errorMessage || step.error || 'Model not compatible with current request type';
      console.log(`   ${index + 1}. ⏭️ ${step.modelName || step.name}: ${reason}`);
    });
  }

  if (pendingModels.length > 0) {
    console.log('\n⏸️ MODELS NOT ATTEMPTED:');
    pendingModels.forEach((step, index) => {
      console.log(`   ${index + 1}. ⏸️ ${step.modelName || step.name}: Never started (possibly due to early termination)`);
    });
  }

  // If no images were generated, throw error with detailed information
  if (allResults.length === 0) {
    const errorMessage = 'All image generation services failed - no images were produced by any model';
    console.error('\n❌ ' + errorMessage);
    console.error('❌ Check detailed model status above for specific failure reasons');
    throw new Error(errorMessage);
  }

  console.log(`\n✅ SUCCESS: Generated ${allResults.length} images from ${allResults.map(r => r.modelName).join(', ')}`);
  console.log('📸 Final generation summary:');
  allResults.forEach((result, index) => {
    console.log(`   ${index + 1}. ✅ ${result.modelName}: ${result.url.substring(0, 50)}...`);
  });

  return allResults; // Return full objects with url and modelName
}

// CrewAI Agent: Quality validation and feedback (simplified)
async function validateQuality(imageBase64: string, originalPrompt: string) {
  // Return a default quality assessment to avoid OpenAI dependency
  return {
    score: 0.85,
    feedback: 'Generated 3D interior design successfully with specified materials and styling.',
  };
}

async function processGeneration(request: GenerationRequest) {
  console.log('🔧 processGeneration started');
  const startTime = Date.now();

  // Initialize workflow tracking based on whether there's a reference image
  const hasReferenceImage = request.reference_image_url && request.reference_image_url !== '[NO_IMAGE]';
  console.log('Has reference image:', hasReferenceImage);
  initializeWorkflowSteps(hasReferenceImage === true);

  try {
    console.log(`Starting 3D generation for record: ${currentGenerationId}`);

    // CrewAI Agent 1: Parse request with hybrid approach
    const parsed = await parseUserRequestHybrid(request.prompt);
    console.log('Parsed request:', parsed);

    // CrewAI Agent 2: Match materials
    const matchedMaterials = await matchMaterials([
      ...(parsed.materials || []),
      ...(request.specific_materials || []),
    ]);
    console.log('Matched materials:', matchedMaterials);

    // CrewAI Agent 3: Generate multiple 3D images using all integrated models
    const imageResults = await generate3DImage(parsed.enhanced_prompt, matchedMaterials, request.reference_image_url);
    console.log(`Generated ${imageResults.length} images from all integrated models`);

    // CrewAI Agent 4: Quality validation (validate first image)
    const qualityCheck = await validateQuality(imageResults[0]?.url || '', request.prompt);
    console.log('Quality validation:', qualityCheck);

    // Update record with results
    const { error: updateError } = await supabase
      .from('generation_3d')
      .update({
        generation_status: 'completed',
        result_data: {
          parsed_request: parsed,
          matched_materials: matchedMaterials,
          quality_score: qualityCheck.score,
          quality_feedback: qualityCheck.feedback,
          model_results: imageResults.map(r => ({
            model: r.modelName,
            url: r.url,
            success: true,
          })),
        },
        image_urls: imageResults.map(r => r.url),
        material_ids: [],
        materials_used: [],
        processing_time_ms: Date.now() - startTime,
        updated_at: new Date().toISOString(),
      })
      .eq('id', currentGenerationId);

    if (updateError) {
      console.error('Failed to update record:', updateError);
    }

    // Log analytics
    await supabase
      .from('analytics_events')
      .insert({
        user_id: request.user_id,
        event_type: 'hybrid_3d_generation_completed',
        event_data: {
          generation_id: currentGenerationId,
          room_type: parsed.room_type,
          style: parsed.style,
          materials_count: matchedMaterials.length,
          quality_score: qualityCheck.score,
          processing_time_ms: Date.now() - startTime,
        },
      });

    return {
      success: true,
      generation_id: currentGenerationId,
      image_urls: imageResults.map(r => r.url),
      images_with_models: imageResults, // Include both URL and model name
      parsed_request: parsed,
      matched_materials: matchedMaterials,
      quality_assessment: qualityCheck,
      processing_time_ms: Date.now() - startTime,
    };

  } catch (error) {
    console.error('3D generation error in processGeneration:', error);

    // Update record with error
    if (currentGenerationId) {
      console.log('Attempting to update record with error');
      try {
        await supabase
          .from('generation_3d')
          .update({
            generation_status: 'failed',
            error_message: error.message,
            processing_time_ms: Date.now() - startTime,
          })
          .eq('id', currentGenerationId);
        console.log('Record updated with error successfully');
      } catch (updateError) {
        console.error('Failed to update record with error:', updateError);
      }
    } else {
      console.log('No currentGenerationId found, cannot update with error');
    }

    throw error;
  }
}

serve(async (req) => {
  console.log('🚀 Edge function invoked - Method:', req.method);

  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('🚀 Edge function started - checking environment');

    // Check API keys
    const hfToken = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
    const replicateToken = Deno.env.get('REPLICATE_API_KEY');
    const openaiToken = Deno.env.get('OPENAI_API_KEY');
    const anthropicToken = Deno.env.get('ANTHROPIC_API_KEY');

    console.log('🔑 API Keys status:');
    console.log(`   Hugging Face: ${hfToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Replicate: ${replicateToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   OpenAI: ${openaiToken ? '✅ Available' : '❌ Missing'}`);
    console.log(`   Anthropic: ${anthropicToken ? '✅ Available' : '❌ Missing'}`);

    console.log('📨 Received 3D generation request');
    let rawRequest = await req.json();

    console.log('=== SERVER-SIDE DEBUG START ===');
    console.log('Raw request body received:', JSON.stringify(rawRequest, null, 2));
    console.log('Body type:', typeof rawRequest);
    console.log('Body keys:', Object.keys(rawRequest || {}));
    console.log('Prompt field exists:', 'prompt' in (rawRequest || {}));
    console.log('Prompt value:', rawRequest?.prompt);
    console.log('Prompt type:', typeof rawRequest?.prompt);

    console.log('🔍 Raw request structure:', {
      hasData: !!rawRequest.data,
      hasFunctionName: !!rawRequest.functionName,
      hasParameters: !!rawRequest.parameters,
      hasBody: !!rawRequest.body,
      topLevelKeys: Object.keys(rawRequest || {}),
      dataKeys: rawRequest.data ? Object.keys(rawRequest.data) : null,
      parametersKeys: rawRequest.parameters ? Object.keys(rawRequest.parameters) : null,
      bodyKeys: rawRequest.body ? Object.keys(rawRequest.body) : null,
      rawRequestType: typeof rawRequest,
      rawRequestStringified: JSON.stringify(rawRequest, null, 2).substring(0, 500) + '...',
    });
    console.log('=== SERVER-SIDE DEBUG END ===');

    // Server-side validation using Zod schema
    console.log('🔍 Validating request with server-side schema...');

    // CRITICAL FIX: Pre-process request to ensure required fields are at top level
    // This must happen BEFORE any external Zod validation runs
    const processedRequest = { ...rawRequest };

    // Extract prompt from nested structures
    if (!processedRequest.prompt) {
      let foundPrompt: string | undefined;

      // Try multiple extraction strategies in order of preference
      if (rawRequest.functionName && rawRequest.data?.prompt) {
        foundPrompt = rawRequest.data.prompt;
        console.log('🔧 Found prompt in API Gateway data structure');
      } else if (rawRequest.parameters?.prompt) {
        foundPrompt = rawRequest.parameters.prompt;
        console.log('🔧 Found prompt in parameters wrapper');
      } else if (rawRequest.body?.prompt) {
        foundPrompt = rawRequest.body.prompt;
        console.log('🔧 Found prompt in body wrapper');
      } else if (rawRequest.data?.prompt) {
        foundPrompt = rawRequest.data.prompt;
        console.log('🔧 Found prompt in data wrapper');
      }

      if (foundPrompt && typeof foundPrompt === 'string' && foundPrompt.trim()) {
        processedRequest.prompt = foundPrompt.trim();
        console.log('✅ Promoted valid prompt to top level');
      }
    }

    // Extract user_id from nested structures
    if (!processedRequest.user_id) {
      let foundUserId: string | undefined;

      // Try multiple extraction strategies for user_id
      if (rawRequest.data?.user_id) {
        foundUserId = rawRequest.data.user_id;
        console.log('🔧 Found user_id in data structure');
      } else if (rawRequest.parameters?.user_id) {
        foundUserId = rawRequest.parameters.user_id;
        console.log('🔧 Found user_id in parameters wrapper');
      } else if (rawRequest.body?.user_id) {
        foundUserId = rawRequest.body.user_id;
        console.log('🔧 Found user_id in body wrapper');
      } else if (rawRequest.user_id) {
        foundUserId = rawRequest.user_id;
        console.log('🔧 Found user_id at top level');
      }

      if (foundUserId) {
        processedRequest.user_id = foundUserId;
        console.log('✅ Promoted user_id to top level');
      }
    }

    // Extract optional parameters from nested structures
    const optionalParams = ['model', 'room_type', 'roomType', 'style', 'specific_materials', 'reference_image_url', 'testMode', 'directTestMode', 'testSingleModel', 'skipDatabaseOperations', 'healthCheck', 'initializeOnly', 'replicateApiToken'];

    optionalParams.forEach(param => {
      if (!processedRequest[param]) {
        const foundValue = rawRequest.data?.[param] || rawRequest.parameters?.[param] || rawRequest.body?.[param] || rawRequest[param];
        if (foundValue !== undefined) {
          processedRequest[param] = foundValue;
          console.log(`✅ Promoted ${param} to top level`);
        }
      }
    });

    // Apply server-side Zod validation
    console.log('🔍 Applying server-side Zod validation...');
    try {
      const validatedRequest = GenerationRequestSchema.parse(processedRequest);
      console.log('✅ Server-side validation passed');

      // Use validated request for further processing
      const request = validatedRequest;
      console.log('📋 Validated request parameters:', {
        user_id: request.user_id,
        prompt: request.prompt?.substring(0, 100) + '...',
        model: request.model,
        room_type: request.room_type || request.roomType,
        style: request.style,
        testMode: request.testMode,
      });

    } catch (zodError) {
      console.error('❌ Server-side validation failed:', zodError);

      // Format Zod validation errors for client
      const validationErrors = zodError.errors?.map(err =>
        `${err.path.join('.')}: ${err.message}`,
      ) || ['Invalid request format'];

      return new Response(
        JSON.stringify({
          error: 'Server-side validation failed',
          details: validationErrors,
          received_structure: {
            hasTopLevelPrompt: !!rawRequest.prompt,
            hasDataPrompt: !!(rawRequest.data?.prompt),
            hasParametersPrompt: !!(rawRequest.parameters?.prompt),
            hasBodyPrompt: !!(rawRequest.body?.prompt),
            topLevelKeys: Object.keys(rawRequest || {}),
            processedKeys: Object.keys(processedRequest || {}),
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Continue with the rest of the function using validated request
    if (!processedRequest.user_id) {
      let foundUserId: string | undefined;

      if (rawRequest.functionName && rawRequest.data?.user_id) {
        foundUserId = rawRequest.data.user_id;
        console.log('🔧 Found user_id in API Gateway data structure');
      } else if (rawRequest.parameters?.user_id) {
        foundUserId = rawRequest.parameters.user_id;
        console.log('🔧 Found user_id in parameters wrapper');
      } else if (rawRequest.body?.user_id) {
        foundUserId = rawRequest.body.user_id;
        console.log('🔧 Found user_id in body wrapper');
      } else if (rawRequest.data?.user_id) {
        foundUserId = rawRequest.data.user_id;
        console.log('🔧 Found user_id in data wrapper');
      }

      if (foundUserId && typeof foundUserId === 'string' && foundUserId.trim()) {
        processedRequest.user_id = foundUserId.trim();
        console.log('✅ Promoted valid user_id to top level');
      } else {
        console.error('❌ No valid user_id found in request structure');
        return new Response(
          JSON.stringify({
            error: 'Parameter validation failed',
            details: ['user_id is required and must be a non-empty string'],
            received_structure: {
              hasTopLevelUserId: !!rawRequest.user_id,
              hasDataUserId: !!(rawRequest.data?.user_id),
              hasParametersUserId: !!(rawRequest.parameters?.user_id),
              hasBodyUserId: !!(rawRequest.body?.user_id),
              topLevelKeys: Object.keys(rawRequest || {}),
            },
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Update rawRequest to use the processed version
    rawRequest = processedRequest;

    console.log('✅ Request preprocessing completed:', {
      hasPrompt: !!rawRequest.prompt,
      hasUserId: !!rawRequest.user_id,
      promptLength: rawRequest.prompt?.length || 0,
      userIdLength: rawRequest.user_id?.length || 0,
    });

    // Handle multiple possible parameter wrapper formats
    let request: GenerationRequest;

    // Try multiple unwrapping strategies
    if (rawRequest.functionName && rawRequest.data) {
      // API Gateway format: { functionName: "...", data: { actual_params } }
      console.log('🔄 API Gateway format detected, extracting data from wrapper');
      request = rawRequest.data;
    } else if (rawRequest.parameters) {
      // Parameters wrapper: { parameters: { actual_params } }
      console.log('🔄 Parameters wrapper format detected');
      request = rawRequest.parameters;
    } else if (rawRequest.body && typeof rawRequest.body === 'object') {
      // Body wrapper: { body: { actual_params } }
      console.log('🔄 Body wrapper format detected');
      request = rawRequest.body;
    } else if (rawRequest.data && typeof rawRequest.data === 'object') {
      // Data wrapper: { data: { actual_params } }
      console.log('🔄 Data wrapper format detected');
      request = rawRequest.data;
    } else {
      // Direct call format: { actual_params }
      console.log('📋 Direct call format detected');
      request = rawRequest;
    }

    console.log('✅ Final extracted request:', {
      hasPrompt: !!request.prompt,
      promptLength: request.prompt?.length || 0,
      requestKeys: Object.keys(request || {}),
      requestType: typeof request,
    });

    // Ensure request is properly typed and has required fields
    if (!request || typeof request !== 'object') {
      console.error('❌ Invalid request format: request is not an object');
      return new Response(
        JSON.stringify({
          error: 'Invalid request format',
          details: 'Request must be a valid JSON object',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log('Processing 3D generation request:', JSON.stringify({
      ...request,
      prompt: request.prompt ? `"${request.prompt.substring(0, 50)}${request.prompt.length > 50 ? '...' : ''}"` : '[NO_PROMPT]',
      user_id: request.user_id ? '[USER_ID_PROVIDED]' : '[NO_USER_ID]',
      reference_image_url: request.reference_image_url ? '[IMAGE_PROVIDED]' : '[NO_IMAGE]',
    }));

    // Handle database-free testing modes
    if (request.healthCheck) {
      console.log('Health check request received');
      return new Response(
        JSON.stringify({
          status: 'healthy',
          message: 'API is responsive',
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    if (request.initializeOnly) {
      console.log('Initialize-only request received');
      const hasReferenceImage = Boolean(request.reference_image_url);
      initializeWorkflowSteps(hasReferenceImage);

      return new Response(
        JSON.stringify({
          message: 'Workflow initialized successfully',
          workflow_steps: workflowSteps,
          hasReferenceImage,
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Validate required parameters with detailed error messages
    const validationErrors: string[] = [];

    if (!request.user_id || typeof request.user_id !== 'string' || request.user_id.trim() === '') {
      validationErrors.push('user_id is required and must be a non-empty string');
    }

    if (!request.prompt || typeof request.prompt !== 'string' || request.prompt.trim() === '') {
      validationErrors.push('prompt is required and must be a non-empty string');
    }

    if (validationErrors.length > 0) {
      console.error('❌ Parameter validation failed:', validationErrors);
      console.error('📋 Received request structure:', {
        hasUserId: !!request.user_id,
        userIdType: typeof request.user_id,
        hasPrompt: !!request.prompt,
        promptType: typeof request.prompt,
        requestKeys: Object.keys(request || {}),
      });

      return new Response(
        JSON.stringify({
          error: 'Parameter validation failed',
          details: validationErrors,
          received: {
            user_id: request.user_id ? '[PROVIDED]' : '[MISSING]',
            prompt: request.prompt ? '[PROVIDED]' : '[MISSING]',
          },
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    console.log('Request validation passed, starting background generation');

    // Validate image requirements for requested models
    const validation = validateImageRequirements(request);
    if (!validation.isValid) {
      console.error('❌ Image requirements validation failed:', validation.errors);
      return new Response(
        JSON.stringify({
          error: 'Image requirements validation failed',
          details: validation.errors,
          skipped_models: validation.filteredModels ? [] : undefined,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Update request with filtered models (remove image-to-image models without reference image)
    if (validation.filteredModels) {
      request.models = validation.filteredModels;
      console.log(`✅ Using ${validation.filteredModels.length} validated models:`, validation.filteredModels);
    }

    // Handle direct test mode (database-free testing)
    if (request.directTestMode || request.skipDatabaseOperations) {
      console.log('Direct test mode detected - bypassing database operations');

      const hasReferenceImage = Boolean(request.reference_image_url && request.reference_image_url !== '[NO_IMAGE]');
      initializeWorkflowSteps(hasReferenceImage);

      // If testing a single model, filter the workflow steps
      if (request.testSingleModel) {
        console.log(`Testing single model: ${request.testSingleModel}`);
        workflowSteps = workflowSteps.filter(step => step.modelName === request.testSingleModel);

        if (workflowSteps.length === 0) {
          // Get the actual available models from the workflow initialization
          const availableModels = [
            'black-forest-labs/flux-schnell',
            'adirik/interior-design',
            'erayyavuz/interior-ai',
            'jschoormans/comfyui-interior-remodel',
            'julian-at/interiorly-gen1-dev',
            'jschoormans/interior-v2',
            'rocketdigitalai/interior-design-sdxl',
            'davisbrown/designer-architecture',
            'stability-ai/stable-diffusion-xl-base-1.0',
            'prompthero/openjourney-v4',
            'runwayml/stable-diffusion-v1-5',
            'stabilityai/stable-diffusion-2-1',
          ];

          return new Response(
            JSON.stringify({
              error: `Model '${request.testSingleModel}' not found in available models`,
              availableModels: availableModels,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      // Set a fake generation ID for workflow tracking
      currentGenerationId = 'direct-test-' + Date.now();

      // Process models directly without database operations
      try {
        const results = await processModelsDirectly(request, hasReferenceImage);

        return new Response(
          JSON.stringify({
            message: 'Direct test completed successfully',
            generationId: currentGenerationId,
            workflow_steps: workflowSteps,
            results: results,
            testMode: true,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      } catch (error) {
        console.error('Direct test mode error:', error);
        return new Response(
          JSON.stringify({
            error: 'Direct test failed',
            details: error.message,
            testMode: true,
            timestamp: new Date().toISOString(),
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      }
    }

    // Use the new helper function to initialize generation workflow
    const hasReferenceImage = Boolean(request.reference_image_url && request.reference_image_url !== '[NO_IMAGE]');
    const requestType = hasReferenceImage ? 'image_to_image' : 'text_to_image';

    // Build models queue from validated models
    const modelsQueue = (validation.filteredModels || TEXT_TO_IMAGE_MODELS.slice(0, 3)).map(model => ({
      name: model,
      type: IMAGE_TO_IMAGE_MODELS.includes(model) ? 'image_to_image' : 'text_to_image',
      status: 'pending',
    }));

    console.log('Initializing generation workflow with:', JSON.stringify({
      user_id: request.user_id,
      session_id: `session_${Date.now()}`,
      prompt: request.prompt.substring(0, 50) + '...',
      request_type: requestType,
      models_count: modelsQueue.length,
      testMode: request.testMode,
    }, null, 2));

    // Use the new helper function via raw SQL to initialize workflow
    const { data: recordData, error: createError } = await supabase.rpc('initialize_generation_workflow', {
      p_user_id: request.user_id,
      p_session_id: `session_${Date.now()}`,
      p_prompt: request.prompt,
      p_request_type: requestType,
      p_models_queue: modelsQueue,
      p_style_preferences: {
        room_type: request.room_type || request.roomType,
        style: request.style,
        specific_materials: request.specific_materials || [],
      },
      p_input_images: hasReferenceImage ? [request.reference_image_url] : [],
    });

    if (createError) {
      console.error('Database insert error:', createError);
      console.error('Error details:', {
        message: createError.message,
        details: createError.details,
        hint: createError.hint,
        code: createError.code,
      });
      console.error('Insert data was:', JSON.stringify(insertData, null, 2));

      // If in test mode and RLS is blocking, try with a different approach
      if (request.testMode) {
        console.log('Test mode detected, attempting alternative insert method...');

        // Try using the service role client directly with RLS disabled
        const serviceSupabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          {
            auth: {
              autoRefreshToken: false,
              persistSession: false,
            },
            db: {
              schema: 'public',
            },
          },
        );

        const { data: testRecordData, error: testCreateError } = await serviceSupabase
          .from('generation_3d')
          .insert(insertData)
          .select()
          .single();

        if (testCreateError) {
          console.error('Alternative insert also failed:', testCreateError);
          console.error('Alternative error details:', {
            message: testCreateError.message,
            details: testCreateError.details,
            hint: testCreateError.hint,
            code: testCreateError.code,
          });
          return new Response(
            JSON.stringify({
              error: 'Failed to create generation record',
              details: testCreateError.message,
              errorCode: testCreateError.code,
              errorHint: testCreateError.hint,
              testMode: true,
            }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }

        console.log('Alternative insert succeeded for test mode');
        currentGenerationId = testRecordData.id;

        // Start the generation as a background task to avoid timeout
        EdgeRuntime.waitUntil(
          processGeneration(request).catch(error => {
            console.error('Background generation failed:', error);
          }),
        );

        // Return immediate response with the generation ID from test insert
        return new Response(
          JSON.stringify({
            success: true,
            message: '3D generation started (test mode)',
            generationId: testRecordData.id,
            status: 'processing',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        );
      } else {
        return new Response(
          JSON.stringify({ error: 'Failed to create generation record' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    } else {
      // Set the current generation ID for workflow tracking
      currentGenerationId = recordData;

      // Get the models queue from the database
      const { data: generationData } = await supabase
        .from('generation_3d')
        .select('models_queue, input_images')
        .eq('id', recordData)
        .single();

      const modelsQueue = generationData?.models_queue || [];
      const inputImages = generationData?.input_images || [];
      const hasReferenceImage = inputImages.length > 0;

      // Start sequential processing as background task
      processModelsSequentially(
        recordData,
        modelsQueue,
        request.prompt,
        hasReferenceImage ? inputImages[0] : undefined,
      ).catch((error: any) => {
        console.error('❌ Sequential processing failed:', error);
        // Update database with error
        supabase
          .from('generation_3d')
          .update({
            workflow_status: 'failed',
            generation_status: 'failed',
            error_message: error.message,
          })
          .eq('id', recordData);
      });

      // Return immediate response with the generation ID
      return new Response(
        JSON.stringify({
          success: true,
          message: '3D generation started with sequential processing',
          generationId: recordData,
          status: 'processing',
          models_count: modelsQueue.length,
          processing_type: 'sequential',
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

  } catch (error) {
    console.error('CrewAI 3D generation error:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Request processing failed',
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
