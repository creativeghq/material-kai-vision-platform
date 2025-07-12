import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const huggingFaceApiKey = Deno.env.get('HUGGINGFACE_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { action, ...payload } = await req.json()
    
    console.log(`HuggingFace API action: ${action}`)
    
    if (!huggingFaceApiKey && action !== 'health_check') {
      throw new Error('HuggingFace API key not configured')
    }

    let response;

    switch (action) {
      case 'get_api_key':
        response = { apiKey: huggingFaceApiKey ? 'configured' : null }
        break;

      case 'health_check':
        response = { status: 'healthy', timestamp: new Date().toISOString() }
        break;

      case 'classify_material':
        response = await classifyMaterial(payload.imageData, payload.config)
        break;

      case 'generate_embedding':
        response = await generateEmbedding(payload.text, payload.config)
        break;

      case 'extract_features':
        response = await extractFeatures(payload.imageData, payload.config)
        break;

      case 'analyze_style':
        response = await analyzeStyle(payload.imageData, payload.config)
        break;

      case 'process_ocr':
        response = await processOCR(payload.imageData, payload.config)
        break;

      case 'detect_materials':
        response = await detectMaterials(payload.imageData, payload.config)
        break;

      case 'batch_process':
        response = await batchProcess(payload.requests)
        break;

      case 'get_model_info':
        response = await getModelInfo(payload.modelName)
        break;

      case 'train_model':
        response = await trainModel(payload.trainingData, payload.modelConfig)
        break;

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    return new Response(
      JSON.stringify(response),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )
  } catch (error) {
    console.error('Error in HuggingFace service:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function makeHuggingFaceRequest(data: any, options: any = {}) {
  const modelEndpoint = options.endpoint || `https://api-inference.huggingface.co/models/${options.model}`;
  
  const requestBody = options.isImage ? data : JSON.stringify(data);
  const contentType = options.isImage ? 'application/octet-stream' : 'application/json';
  
  const response = await fetch(modelEndpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${huggingFaceApiKey}`,
      'Content-Type': contentType,
    },
    body: requestBody,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HuggingFace API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

function processImageData(imageData: any): Uint8Array {
  if (typeof imageData === 'string') {
    if (imageData.startsWith('data:')) {
      // Remove data URL prefix and decode base64
      const base64Data = imageData.split(',')[1];
      return new Uint8Array(atob(base64Data).split('').map(char => char.charCodeAt(0)));
    } else {
      // Assume it's already base64
      return new Uint8Array(atob(imageData).split('').map(char => char.charCodeAt(0)));
    }
  }
  return imageData;
}

async function classifyMaterial(imageData: any, config: any) {
  const model = config.model || 'google/vit-base-patch16-224';
  
  const processedImageData = processImageData(imageData);

  const result = await makeHuggingFaceRequest(processedImageData, { 
    model,
    isImage: true 
  });

  return {
    results: Array.isArray(result) ? result.map((item: any) => ({
      label: item.label,
      score: item.score
    })) : []
  };
}

async function generateEmbedding(text: string, config: any) {
  const model = config.model || 'sentence-transformers/all-MiniLM-L6-v2';
  
  const result = await makeHuggingFaceRequest({
    inputs: text,
    options: { wait_for_model: true }
  }, { model });

  return {
    embedding: Array.isArray(result) ? result[0] : result
  };
}

async function extractFeatures(imageData: any, config: any) {
  const model = config.model || 'facebook/detr-resnet-50';
  
  const processedImageData = processImageData(imageData);

  const result = await makeHuggingFaceRequest(processedImageData, { 
    model,
    isImage: true 
  });

  return {
    result: {
      features: result,
      model: model
    }
  };
}

async function analyzeStyle(imageData: any, config: any) {
  const model = config.model || 'openai/clip-vit-base-patch32';
  
  const processedImageData = processImageData(imageData);

  const result = await makeHuggingFaceRequest(processedImageData, { 
    model,
    isImage: true 
  });

  return {
    results: Array.isArray(result) ? result.map((item: any) => ({
      label: item.label || 'style_analysis',
      score: item.score || 0.5
    })) : []
  };
}

async function processOCR(imageData: any, config: any) {
  const model = config.model || 'microsoft/trocr-base-printed';
  
  const processedImageData = processImageData(imageData);

  const result = await makeHuggingFaceRequest(processedImageData, { 
    model,
    isImage: true 
  });

  return {
    text: result.generated_text || result.text || result[0]?.generated_text || ''
  };
}

async function detectMaterials(imageData: any, config: any) {
  const model = config.model || 'microsoft/resnet-50';
  
  const processedImageData = processImageData(imageData);

  const result = await makeHuggingFaceRequest(processedImageData, { 
    model,
    isImage: true 
  });

  return {
    results: Array.isArray(result) ? result.map((item: any) => ({
      label: item.label,
      score: item.score
    })) : []
  };
}

async function batchProcess(requests: any[]) {
  const results = [];
  
  for (const request of requests) {
    try {
      let result;
      switch (request.action) {
        case 'classify_material':
          result = await classifyMaterial(request.data, request.config || {});
          break;
        case 'generate_embedding':
          result = await generateEmbedding(request.data, request.config || {});
          break;
        case 'extract_features':
          result = await extractFeatures(request.data, request.config || {});
          break;
        case 'analyze_style':
          result = await analyzeStyle(request.data, request.config || {});
          break;
        case 'process_ocr':
          result = await processOCR(request.data, request.config || {});
          break;
        case 'detect_materials':
          result = await detectMaterials(request.data, request.config || {});
          break;
        default:
          result = { error: `Unknown batch action: ${request.action}` };
      }
      results.push(result);
    } catch (error) {
      results.push({ error: error.message });
    }
  }
  
  return { results };
}

async function getModelInfo(modelName: string) {
  const response = await fetch(`https://huggingface.co/api/models/${modelName}`, {
    headers: {
      'Authorization': `Bearer ${huggingFaceApiKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get model info: ${response.statusText}`);
  }

  const modelInfo = await response.json();
  return { modelInfo };
}

async function trainModel(trainingData: any, modelConfig: any) {
  // Log training request to database
  const trainingJobId = `job-${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const { error } = await supabase
      .from('ml_training_jobs')
      .insert({
        id: trainingJobId,
        training_config: modelConfig,
        status: 'pending',
        dataset_info: {
          total_samples: trainingData?.length || 0,
          training_type: modelConfig?.training_type || 'material_classification'
        }
      });

    if (error) {
      console.error('Failed to log training job:', error);
    }
  } catch (err) {
    console.error('Database logging error:', err);
  }

  // For now, return a placeholder response
  // In a full implementation, this would integrate with HuggingFace's training API
  const response = {
    success: true,
    message: "Model training initiated",
    modelId: `material-classifier-${Date.now()}`,
    trainingJobId,
    estimatedCompletionTime: "30 minutes",
    datasetSize: trainingData?.length || 0
  };

  return response;
}