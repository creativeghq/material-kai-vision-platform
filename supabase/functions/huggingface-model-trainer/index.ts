import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const huggingFaceToken = Deno.env.get('HUGGING_FACE_ACCESS_TOKEN');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface TrainingRequest {
  training_type: 'clip_finetuning' | 'material_classification' | 'embedding_optimization';
  model_base: string; // e.g., 'openai/clip-vit-base-patch32'
  dataset_export_options: {
    include_materials: boolean;
    include_knowledge_base: boolean;
    category_filter?: string[];
    min_confidence?: number;
  };
  training_config: {
    batch_size?: number;
    learning_rate?: number;
    epochs?: number;
    output_model_name: string;
  };
}

interface DatasetExport {
  materials: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    image_url?: string;
    properties: any;
  }>;
  knowledge_entries: Array<{
    id: string;
    title: string;
    content: string;
    content_type: string;
    tags: string[];
    material_ids: string[];
  }>;
  metadata: {
    total_items: number;
    export_timestamp: string;
    categories: string[];
  };
}

// Export training data from Supabase
async function exportTrainingData(options: TrainingRequest['dataset_export_options']): Promise<DatasetExport> {
  console.log('Exporting training data with options:', options);

  const materials: DatasetExport['materials'] = [];
  const knowledge_entries: DatasetExport['knowledge_entries'] = [];

  // Export materials if requested
  if (options.include_materials) {
    let query = supabase
      .from('materials_catalog')
      .select('id, name, description, category, thumbnail_url, properties');

    // Apply category filter if specified
    if (options.category_filter && options.category_filter.length > 0) {
      query = query.in('category', options.category_filter);
    }

    const { data: materialsData, error: materialsError } = await query;

    if (materialsError) {
      throw new Error(`Failed to export materials: ${materialsError.message}`);
    }

    materials.push(...(materialsData || []).map(m => ({
      id: m.id,
      name: m.name,
      description: m.description || '',
      category: m.category,
      image_url: m.thumbnail_url,
      properties: m.properties || {}
    })));
  }

  // Export knowledge base if requested
  if (options.include_knowledge_base) {
    const { data: knowledgeData, error: knowledgeError } = await supabase
      .from('knowledge_base_entries')
      .select('id, title, content, content_type, tags, material_ids');

    if (knowledgeError) {
      throw new Error(`Failed to export knowledge base: ${knowledgeError.message}`);
    }

    knowledge_entries.push(...(knowledgeData || []).map(k => ({
      id: k.id,
      title: k.title,
      content: k.content,
      content_type: k.content_type,
      tags: k.tags || [],
      material_ids: k.material_ids || []
    })));
  }

  // Collect unique categories
  const categories = [...new Set(materials.map(m => m.category))];

  return {
    materials,
    knowledge_entries,
    metadata: {
      total_items: materials.length + knowledge_entries.length,
      export_timestamp: new Date().toISOString(),
      categories
    }
  };
}

// Create Hugging Face dataset
async function createHuggingFaceDataset(
  datasetExport: DatasetExport, 
  datasetName: string
): Promise<string> {
  console.log('Creating Hugging Face dataset:', datasetName);

  // Convert to Hugging Face dataset format
  const dataset = {
    train: {
      materials: datasetExport.materials.map(m => ({
        text: `${m.name}: ${m.description}`,
        category: m.category,
        properties: JSON.stringify(m.properties),
        image_url: m.image_url
      })),
      knowledge: datasetExport.knowledge_entries.map(k => ({
        text: `${k.title}: ${k.content}`,
        content_type: k.content_type,
        tags: k.tags.join(', '),
        material_references: k.material_ids.length
      }))
    },
    metadata: datasetExport.metadata
  };

  // Upload to Hugging Face Hub (using their API)
  const response = await fetch(`https://huggingface.co/api/datasets/${datasetName}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${huggingFaceToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: datasetName,
      description: `KAI Material Recognition Dataset - ${datasetExport.metadata.total_items} items`,
      private: false, // Set to true for private datasets
      data: dataset
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create HF dataset: ${error}`);
  }

  const result = await response.json();
  return result.url || `https://huggingface.co/datasets/${datasetName}`;
}

// Start training job on Hugging Face
async function startTrainingJob(
  request: TrainingRequest,
  datasetUrl: string
): Promise<string> {
  console.log('Starting training job for model:', request.training_config.output_model_name);

  // Determine training script based on type
  let trainingScript = '';
  
  switch (request.training_type) {
    case 'clip_finetuning':
      trainingScript = `
import torch
from transformers import CLIPProcessor, CLIPModel, Trainer, TrainingArguments
from datasets import load_dataset

# Load dataset
dataset = load_dataset("${datasetUrl}")

# Load base model
model = CLIPModel.from_pretrained("${request.model_base}")
processor = CLIPProcessor.from_pretrained("${request.model_base}")

# Training configuration
training_args = TrainingArguments(
    output_dir="./${request.training_config.output_model_name}",
    per_device_train_batch_size=${request.training_config.batch_size || 8},
    learning_rate=${request.training_config.learning_rate || 5e-5},
    num_train_epochs=${request.training_config.epochs || 3},
    logging_steps=10,
    save_steps=500,
    push_to_hub=True,
    hub_model_id="${request.training_config.output_model_name}",
)

# Fine-tune model
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    tokenizer=processor.tokenizer,
)

trainer.train()
trainer.push_to_hub()
`;
      break;

    case 'material_classification':
      trainingScript = `
import torch
from transformers import AutoImageProcessor, AutoModelForImageClassification, Trainer, TrainingArguments
from datasets import load_dataset

# Load dataset
dataset = load_dataset("${datasetUrl}")

# Load base model (EfficientNet)
model = AutoModelForImageClassification.from_pretrained("${request.model_base}")
processor = AutoImageProcessor.from_pretrained("${request.model_base}")

# Training configuration
training_args = TrainingArguments(
    output_dir="./${request.training_config.output_model_name}",
    per_device_train_batch_size=${request.training_config.batch_size || 16},
    learning_rate=${request.training_config.learning_rate || 3e-4},
    num_train_epochs=${request.training_config.epochs || 5},
    logging_steps=10,
    save_steps=500,
    push_to_hub=True,
    hub_model_id="${request.training_config.output_model_name}",
)

# Train classifier
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=dataset["train"],
    tokenizer=processor,
)

trainer.train()
trainer.push_to_hub()
`;
      break;

    default:
      throw new Error(`Unsupported training type: ${request.training_type}`);
  }

  // Create training job on Hugging Face Spaces
  const trainingResponse = await fetch('https://huggingface.co/api/spaces', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${huggingFaceToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `kai-training-${request.training_config.output_model_name}`,
      description: `Training job for ${request.training_type}`,
      private: false,
      sdk: 'gradio',
      app_file: trainingScript,
      hardware: 'cpu-basic' // or 'gpu-t4' for GPU training
    })
  });

  if (!trainingResponse.ok) {
    const error = await trainingResponse.text();
    throw new Error(`Failed to start training: ${error}`);
  }

  const trainingResult = await trainingResponse.json();
  return trainingResult.url;
}

// Log training job to database
async function logTrainingJob(
  request: TrainingRequest,
  datasetUrl: string,
  trainingUrl: string,
  userId: string
): Promise<void> {
  const { error } = await supabase
    .from('processing_queue')
    .insert({
      user_id: userId,
      job_type: 'model_training',
      input_data: {
        training_request: request,
        dataset_url: datasetUrl,
        training_url: trainingUrl
      },
      status: 'processing'
    });

  if (error) {
    console.error('Failed to log training job:', error);
  }
}

// Main request handler
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const requestBody: TrainingRequest = await req.json();
    console.log('Training request:', requestBody);

    // Extract user ID from auth header
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    
    let userId = 'anonymous';
    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      userId = user?.id || 'anonymous';
    }

    // Step 1: Export training data from Supabase
    console.log('Step 1: Exporting training data...');
    const datasetExport = await exportTrainingData(requestBody.dataset_export_options);

    // Step 2: Create Hugging Face dataset
    console.log('Step 2: Creating Hugging Face dataset...');
    const datasetName = `kai-materials-${Date.now()}`;
    const datasetUrl = await createHuggingFaceDataset(datasetExport, datasetName);

    // Step 3: Start training job
    console.log('Step 3: Starting training job...');
    const trainingUrl = await startTrainingJob(requestBody, datasetUrl);

    // Step 4: Log to database
    await logTrainingJob(requestBody, datasetUrl, trainingUrl, userId);

    const result = {
      success: true,
      dataset_url: datasetUrl,
      training_url: trainingUrl,
      dataset_stats: datasetExport.metadata,
      estimated_training_time: `${requestBody.training_config.epochs || 3} epochs (~2-4 hours)`,
      message: 'Training job started successfully. Check the training URL for progress.',
      timestamp: new Date().toISOString()
    };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Training setup error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Training setup failed', 
        details: error.message,
        timestamp: new Date().toISOString()
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});