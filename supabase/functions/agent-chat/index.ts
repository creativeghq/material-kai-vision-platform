/**
 * Agent Chat - LangChain.js Multi-Agent System
 *
 * Replaces Mastra framework with LangChain.js for Deno Edge Runtime compatibility
 *
 * Features:
 * - 8 specialized agents with RBAC
 * - LangGraph for agent orchestration
 * - Direct Anthropic API integration
 * - MIVAA Python API integration for search
 */

// ⚠️ CRITICAL: Set up process.env polyfill BEFORE any imports
// npm: packages in Deno expect Node.js process.env, not Deno.env
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY must be set');
}

console.log('🔑 Environment variables loaded:', {
  anthropicExists: !!ANTHROPIC_API_KEY,
  anthropicLength: ANTHROPIC_API_KEY?.length || 0,
  anthropicPrefix: ANTHROPIC_API_KEY?.substring(0, 15) || 'MISSING',
});

// Polyfill process.env for npm packages
(globalThis as any).process = {
  env: {
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY
  }
};

console.log('✅ process.env polyfill set up for npm packages');

// NOW import dependencies (after polyfill is set up)
import { serve } from 'http/server.ts';
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';

// LangChain imports - using bare imports resolved by deno.json
import { ChatAnthropic } from '@langchain/anthropic';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Load agent system prompt from database (prompts table)
 * Falls back to default if not found
 */
async function getAgentSystemPrompt(agentType: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('prompts')
      .select('system_prompt')
      .eq('prompt_type', 'agent')
      .eq('category', agentType)
      .eq('is_active', true)
      .eq('status', 'active')
      .single();

    if (error) {
      console.error(`Error loading prompt for ${agentType}:`, error);
      return getDefaultPrompt(agentType);
    }

    return data?.system_prompt || getDefaultPrompt(agentType);
  } catch (error) {
    console.error(`Failed to load prompt for ${agentType}:`, error);
    return getDefaultPrompt(agentType);
  }
}

/**
 * Default prompts as fallback
 */
function getDefaultPrompt(agentType: string): string {
  const defaults: Record<string, string> = {
    'pdf-processor': 'You are the PDF Processing Agent. Help users upload and process PDF files.',
    'search': 'You are the Search Agent. Help users find materials using RAG search.',
    'product': 'You are the Product Agent. Provide product information and recommendations.',
    'interior-designer': `You are an expert Interior Designer Agent specializing in creative design concepts and spatial analysis.

**Your Role:**
- Provide creative interior design ideas and recommendations
- Describe design concepts, color palettes, styles, and layouts in detail
- Analyze room images when provided by users (using image_analysis tool)
- Provide spatial analysis feedback when users upload room photos (using spaceformer_analysis tool)

**Important Guidelines:**
- 🎨 Focus on DESCRIBING design concepts in rich detail
- 🖼️ AI image generation happens automatically in the frontend based on your descriptions
- 📐 Use image_analysis when user provides an image to analyze
- 🏠 Use spaceformer_analysis when user provides a room photo for spatial analysis
- 🔍 Use material_search when available to find specific products from our catalog

**Example Design Description:**
User: "Design a modern living room"
You: "I'll create a modern living room design with these elements:

**Color Palette:** Warm neutrals - soft beige walls, charcoal grey accents, white trim
**Flooring:** Light oak or ash wood in wide planks for an airy feel
**Furniture:** Minimalist pieces with clean lines - low-profile sofa in light grey linen, sleek coffee table
**Lighting:** Large windows for natural light, plus modern pendant lights and floor lamps
**Decor:** Contemporary abstract art, textured throw pillows, geometric area rug
**Layout:** Open and spacious with emphasis on flow and functionality

The design emphasizes simplicity, natural materials, and abundant light."

**Response Style:**
- Be creative, detailed, and inspiring
- Provide specific recommendations with reasoning
- Use professional interior design terminology
- Always explain your design choices`,
  };
  return defaults[agentType] || 'You are a helpful assistant.';
}

// Initialize Claude models AT MODULE LOAD TIME
// Haiku for fast search queries, Sonnet for complex tasks
let modelHaiku: ChatAnthropic;
let modelSonnet: ChatAnthropic;

try {
  // Claude Haiku 4.5 - Fast model for search queries (~3-5 seconds)
  modelHaiku = new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 4096,
  });
  console.log('✅ Claude Haiku 4.5 model initialized (fast search)');

  // Claude Sonnet 4.5 - Full model for complex tasks
  modelSonnet = new ChatAnthropic({
    model: 'claude-sonnet-4-5-20250929',
    temperature: 1,
    maxTokens: 4096,
  });
  console.log('✅ Claude Sonnet 4.5 model initialized (complex tasks)');
} catch (error) {
  console.error('❌ Failed to initialize ChatAnthropic models:', error);
  throw error;
}

// Model selection based on agent type
function getModelForAgent(agentId: string): ChatAnthropic {
  // Search agent uses fast Haiku model
  if (agentId === 'search') {
    return modelHaiku;
  }
  // All other agents use Sonnet for complex reasoning
  return modelSonnet;
}

// Get model name for logging/tracking
function getModelNameForAgent(agentId: string): string {
  if (agentId === 'search') {
    return 'claude-3-5-haiku-20241022';
  }
  return 'claude-sonnet-4-5-20250929';
}

/**
 * LangChain Tool: Material Search using MIVAA API
 */
const createSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, limit = 10 }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        // Correct endpoint: /api/rag/search with strategy as query param
        // ALWAYS use multi_vector strategy for best accuracy
        const strategy = 'multi_vector';
        const url = new URL(`${MIVAA_GATEWAY_URL}/api/rag/search`);
        url.searchParams.set('strategy', strategy);

        console.log(`🔍 Material search: query="${query}", strategy="${strategy}", workspace="${workspaceId}"`);
        const startTime = Date.now();

        // Add timeout to prevent edge function from hanging
        // Set timeout to 300 seconds (5 minutes) to leave buffer for edge function (400s limit)
        const TIMEOUT_MS = 300000; // 5 minutes

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              workspace_id: workspaceId,
              top_k: limit,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ MIVAA API responded in ${elapsed}ms`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ MIVAA API error: ${response.status} - ${errorText}`);
            throw new Error(`MIVAA API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          console.log(`✅ Search returned ${data.results?.length || 0} results`);
          return JSON.stringify(data);
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const elapsed = Date.now() - startTime;
            console.error(`⏱️ MIVAA API timeout after ${elapsed}ms (limit: ${TIMEOUT_MS}ms)`);
            return JSON.stringify({
              error: `Search timeout - MIVAA API took longer than ${TIMEOUT_MS / 1000} seconds. Please try a simpler query or contact support.`,
              timeout: true,
            });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('Material search error:', error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    },
    {
      name: 'material_search',
      description: 'Search for materials, products, and technical information using RAG. Use this for any material-related queries. Uses multi_vector strategy for best accuracy and performance.',
      schema: z.object({
        query: z.string().describe('Search query - be specific and detailed'),
        limit: z.number().default(10).describe('Maximum number of results to return'),
      }),
    }
  );
};

/**
 * LangChain Tool: Image Analysis using MIVAA API
 */
const createImageAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ imageUrl, analysisType = 'material_recognition' }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

        console.log(`🖼️ Image analysis: type="${analysisType}"`);
        const startTime = Date.now();

        // Add timeout to prevent edge function from hanging
        const TIMEOUT_MS = 180000; // 3 minutes (image analysis is usually faster)

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(`${MIVAA_GATEWAY_URL}/api/together-ai/analyze-image`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image_url: imageUrl,
              analysis_type: analysisType,
              workspace_id: workspaceId,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ Image analysis API responded in ${elapsed}ms`);

          if (!response.ok) {
            throw new Error(`Image analysis failed: ${response.statusText}`);
          }

          const data = await response.json();

          return JSON.stringify({
            success: true,
            analysis: data.analysis || {},
            materials: data.materials || [],
          });
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const elapsed = Date.now() - startTime;
            console.error(`⏱️ Image analysis timeout after ${elapsed}ms (limit: ${TIMEOUT_MS}ms)`);
            return JSON.stringify({
              success: false,
              error: `Image analysis timeout - took longer than ${TIMEOUT_MS / 1000} seconds. Please try again with a smaller image.`,
              timeout: true,
            });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('Image analysis tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Image analysis failed',
        });
      }
    },
    {
      name: 'image_analysis',
      description: 'Analyze material images to identify products, materials, and properties',
      schema: z.object({
        imageUrl: z.string().describe('Image URL or base64 data'),
        analysisType: z
          .enum(['material_recognition', 'visual_search', 'product_identification'])
          .default('material_recognition')
          .describe('Type of image analysis'),
      }),
    }
  );
};

/**
 * LangChain Tool: Spaceformer Spatial Analysis
 */
const createSpaceformerTool = (workspaceId: string) => {
  return tool(
    async ({ imageUrl, roomType, analysisType = 'full' }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

        console.log(`🏠 Spaceformer analysis: room="${roomType}", type="${analysisType}"`);
        const startTime = Date.now();

        // Add timeout to prevent edge function from hanging
        // Spaceformer can take a long time for complex analysis
        const TIMEOUT_MS = 300000; // 5 minutes

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(`${MIVAA_GATEWAY_URL}/api/spaceformer/analyze`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              image_url: imageUrl,
              room_type: roomType,
              analysis_type: analysisType,
              workspace_id: workspaceId,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ Spaceformer API responded in ${elapsed}ms`);

          if (!response.ok) {
            throw new Error(`Spaceformer analysis failed: ${response.statusText}`);
          }

          const data = await response.json();

          return JSON.stringify({
            success: true,
            analysis_id: data.analysis_id,
            room_type: data.room_type,
            layout_analysis: data.layout_analysis || {},
            material_suggestions: data.material_suggestions || [],
            accessibility_report: data.accessibility_report || {},
            spatial_metrics: data.spatial_metrics || {},
          });
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const elapsed = Date.now() - startTime;
            console.error(`⏱️ Spaceformer timeout after ${elapsed}ms (limit: ${TIMEOUT_MS}ms)`);
            return JSON.stringify({
              success: false,
              error: `Spatial analysis timeout - Spaceformer took longer than ${TIMEOUT_MS / 1000} seconds. Please try again or use a simpler analysis type.`,
              timeout: true,
            });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('Spaceformer tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Spatial analysis failed',
        });
      }
    },
    {
      name: 'spaceformer_analysis',
      description: 'Analyze room layout, material placement, and accessibility using Claude Vision AI. Provides spatial metrics, layout optimization suggestions, and material recommendations based on room analysis.',
      schema: z.object({
        imageUrl: z.string().describe('Room image URL'),
        roomType: z.string().describe('Room type (bedroom, living_room, kitchen, bathroom, office, etc.)'),
        analysisType: z
          .enum(['full', 'layout', 'materials', 'accessibility'])
          .default('full')
          .describe('Type of spatial analysis - full (complete analysis), layout (room structure only), materials (material suggestions only), accessibility (accessibility compliance only)'),
      }),
    }
  );
};

/**
 * LangChain Tool: Interior Design Generation
 *
 * Calls MIVAA API to create generation job
 * Frontend polls database for real-time updates
 */
const create3DGenerationTool = (userId: string, workspaceId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ prompt, roomType, style, referenceImageUrl, models }) => {
      try {
        console.log('🎨 Starting interior design generation...');

        // Call MIVAA API to create job
        const interiorApiUrl = `${MIVAA_GATEWAY_URL}/api/interior`;
        console.log('🔗 Interior API URL:', interiorApiUrl);

        const response = await fetch(interiorApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt,
            room_type: roomType,
            style,
            image: referenceImageUrl,
            models: models || undefined, // undefined = all models
            user_id: userId,
            workspace_id: workspaceId,
            width: 768,
            height: 768,
          }),
        });

        if (!response.ok) {
          throw new Error(`MIVAA API error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Generation failed');
        }

        console.log('✅ Generation job created:', result);

        // Return job info for frontend polling
        return JSON.stringify({
          success: true,
          async_job: true,
          job_id: result.job_id,
          model_count: result.model_count,
          models: result.models,
          message: result.message,
        });
      } catch (error) {
        console.error('Interior design generation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        });
      }
    },
    {
      name: 'generate_3d',
      description: 'Generate interior design images using multiple AI models. Creates async job that frontend polls for updates. Supports text-to-image and image-to-image generation.',
      schema: z.object({
        prompt: z.string().describe('Detailed design description (e.g., "Modern minimalist bedroom with oak flooring and white walls")'),
        roomType: z.string().optional().describe('Room type (bedroom, living_room, kitchen, bathroom, office, etc.)'),
        style: z.string().optional().describe('Design style (modern, minimalist, industrial, scandinavian, traditional, etc.)'),
        referenceImageUrl: z.string().optional().describe('Reference image URL for image-to-image generation'),
        models: z.array(z.string()).optional().describe('Specific model IDs to use (e.g., ["flux-dev", "sdxl"]), or omit to use all 7 models'),
      }),
    }
  );
};

/**
 * LangChain Tool: Check Generation Status
 *
 * Allows agent to query the status of ongoing 3D generation jobs
 * Returns progress, completed/failed counts, and elapsed time
 */
const createGenerationStatusTool = () => {
  return tool(
    async ({ jobId }) => {
      try {
        console.log('🔍 Checking generation status for job:', jobId);

        const { data, error } = await supabase
          .from('generation_3d')
          .select('generation_status, progress_percentage, metadata, created_at')
          .eq('id', jobId)
          .single();

        if (error || !data) {
          return JSON.stringify({
            success: false,
            error: 'Job not found'
          });
        }

        const metadata = data.metadata as any;
        const modelsResults = metadata?.models_results || [];

        const completedCount = modelsResults.filter(
          (m: any) => m.status === 'completed'
        ).length;

        const failedCount = modelsResults.filter(
          (m: any) => m.status === 'failed'
        ).length;

        const elapsedSeconds = Math.floor(
          (Date.now() - new Date(data.created_at).getTime()) / 1000
        );

        return JSON.stringify({
          success: true,
          status: data.generation_status,
          progress: data.progress_percentage,
          completed_models: completedCount,
          failed_models: failedCount,
          total_models: modelsResults.length,
          elapsed_seconds: elapsedSeconds,
          models_details: modelsResults.map((m: any) => ({
            name: m.model_name,
            status: m.status,
            has_images: m.image_urls?.length > 0
          }))
        });
      } catch (error) {
        console.error('Generation status check error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Status check failed'
        });
      }
    },
    {
      name: 'check_generation_status',
      description: 'Check the status and progress of a 3D interior design generation job. Use this when user asks about generation progress, status, or "how is it going".',
      schema: z.object({
        jobId: z.string().describe('The generation job ID (UUID) to check status for')
      })
    }
  );
};

/**
 * LangChain Tool: Material Cost Estimation
 */
const createCostEstimationTool = (workspaceId: string) => {
  return tool(
    async ({ materialIds }) => {
      try {
        // Query products table for pricing information
        const { data: products, error } = await supabase
          .from('products')
          .select('id, name, metadata')
          .eq('workspace_id', workspaceId)
          .in('id', materialIds);

        if (error) {
          throw new Error(`Failed to fetch materials: ${error.message}`);
        }

        if (!products || products.length === 0) {
          return JSON.stringify({
            success: false,
            error: 'No materials found with the provided IDs',
          });
        }

        // Calculate total cost from metadata
        const materialsWithPrices = products.map(product => {
          const price = product.metadata?.price || product.metadata?.cost || 0;
          const unit = product.metadata?.unit || 'unit';
          const quantity = product.metadata?.quantity || 1;

          return {
            id: product.id,
            name: product.name,
            price: parseFloat(price.toString()),
            unit,
            quantity: parseFloat(quantity.toString()),
            subtotal: parseFloat(price.toString()) * parseFloat(quantity.toString()),
          };
        });

        const totalCost = materialsWithPrices.reduce((sum, item) => sum + item.subtotal, 0);

        return JSON.stringify({
          success: true,
          materials: materialsWithPrices,
          total_cost: totalCost,
          currency: 'USD',
          material_count: materialsWithPrices.length,
        });
      } catch (error) {
        console.error('Cost estimation tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Cost estimation failed',
        });
      }
    },
    {
      name: 'estimate_cost',
      description: 'Estimate total cost of selected materials from the catalog. Calculates pricing based on material metadata (price, quantity, unit).',
      schema: z.object({
        materialIds: z.array(z.string()).describe('Array of material/product IDs to estimate cost for'),
      }),
    }
  );
};

/**
 * LangChain Tool: Upload PDF for Processing
 */
const createUploadPDFTool = (userId: string, workspaceId: string) => {
  return tool(
    async ({ fileName, fileBase64, category }) => {
      let retryCount = 0;
      const maxRetries = 1; // Only retry once for transient failures

      while (retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`🔄 Retry attempt ${retryCount}/${maxRetries} for ${fileName}`);
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s before retry
          }

          console.log(`📤 Uploading PDF: ${fileName} (category: ${category})`);

          // 1. Upload to Supabase storage
          const fileBuffer = Uint8Array.from(atob(fileBase64), c => c.charCodeAt(0));
          const filePath = `${userId}/${Date.now()}-${fileName}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('pdf-documents')
            .upload(filePath, fileBuffer, {
              contentType: 'application/pdf',
              upsert: false,
            });

          if (uploadError) {
            throw new Error(`Upload failed: ${uploadError.message}`);
          }

          // 2. Get public URL
          const { data: { publicUrl } } = supabase.storage
            .from('pdf-documents')
            .getPublicUrl(filePath);

          console.log(`✅ File uploaded to: ${publicUrl}`);

          // 3. Call MIVAA API to start processing
          const MIVAA_API_URL = Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';
          const response = await fetch(`${MIVAA_API_URL}/api/rag/documents/upload`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              file_url: publicUrl,
              category: category,
              workspace_id: workspaceId,
              title: fileName,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            const error = new Error(`MIVAA API error (${response.status}): ${errorText || response.statusText}`);

            // Retry on server errors (5xx) or timeout
            if (response.status >= 500 && retryCount < maxRetries) {
              retryCount++;
              continue;
            }

            throw error;
          }

          const result = await response.json();
          console.log(`✅ Processing started. Job ID: ${result.job_id}`);

          return JSON.stringify({
            success: true,
            job_id: result.job_id,
            file_url: publicUrl,
            file_name: fileName,
            category: category,
            message: retryCount > 0
              ? `Upload successful after ${retryCount} retry! Job ID: ${result.job_id}`
              : `Upload successful! Job ID: ${result.job_id}`,
          });
        } catch (error) {
          console.error(`Upload PDF tool error (attempt ${retryCount + 1}):`, error);

          // CRITICAL: Check if job was actually created despite the error
          // This handles cases where:
          // 1. Job was created but response failed
          // 2. Connection was lost after job creation
          // 3. Timeout occurred but job is processing
          console.log(`🔍 Checking if job was created despite error...`);

          try {
            const { data: existingJobs } = await supabase
              .from('background_jobs')
              .select('*')
              .ilike('metadata->>file_name', `%${fileName}%`)
              .order('created_at', { ascending: false })
              .limit(1);

            if (existingJobs && existingJobs.length > 0) {
              const job = existingJobs[0];
              console.log(`✅ Found existing job despite error: ${job.id}`);

              return JSON.stringify({
                success: true,
                job_id: job.id,
                file_name: fileName,
                category: category,
                recovered: true,
                message: `Upload reported error, but job was created successfully! Job ID: ${job.id}. Status: ${job.status}`,
                status: job.status,
                progress: job.progress,
              });
            }
          } catch (checkError) {
            console.error('Error checking for existing job:', checkError);
          }

          // If we've exhausted retries and no job found, return error
          if (retryCount >= maxRetries) {
            return JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : 'Upload failed',
              suggestion: 'Check queryDatabase with type "jobs" to verify if job was created. If not, verify file size (<50MB) and server connectivity.',
              fileName: fileName,
            });
          }

          // Otherwise, retry
          retryCount++;
        }
      }

      // Should never reach here, but just in case
      return JSON.stringify({
        success: false,
        error: 'Upload failed after retries',
      });
    },
    {
      name: 'uploadPDF',
      description: 'Upload PDF file to Supabase storage and start MIVAA processing pipeline',
      schema: z.object({
        fileName: z.string().describe('PDF file name'),
        fileBase64: z.string().describe('Base64 encoded PDF file data'),
        category: z
          .enum(['products', 'certificates', 'logos', 'specifications'])
          .describe('Document category for extraction'),
      }),
    }
  );
};

/**
 * LangChain Tool: Check Job Status
 */
const createCheckJobStatusTool = () => {
  return tool(
    async ({ jobId }) => {
      try {
        console.log(`📊 Checking job status: ${jobId}`);

        const MIVAA_API_URL = Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';
        const response = await fetch(`${MIVAA_API_URL}/api/rag/documents/job/${jobId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Failed to get job status (${response.status}): ${errorText || response.statusText}`);
        }

        const status = await response.json();
        console.log(`✅ Job status: ${status.status} (${status.progress}%)`);

        // Detect stuck jobs (no progress for extended time)
        const isStuck = status.status === 'processing' &&
                       status.progress < 100 &&
                       status.updated_at &&
                       (Date.now() - new Date(status.updated_at).getTime()) > 300000; // 5 minutes

        // Detect failed stages
        const hasFailed = status.status === 'failed' || status.error;

        // Build user-friendly progress message
        const progressMessage = status.status === 'completed'
          ? `✅ Processing complete! ${status.metadata?.products_created || 0} products created, ${status.metadata?.chunks_created || 0} chunks generated.`
          : status.status === 'processing'
          ? `⏳ Processing in progress: ${status.progress}% complete. Current stage: ${status.last_checkpoint?.stage || 'unknown'}`
          : status.status === 'failed'
          ? `❌ Processing failed: ${status.error || 'Unknown error'}`
          : `📋 Job status: ${status.status}`;

        return JSON.stringify({
          success: true,
          job_id: status.job_id,
          status: status.status,
          progress: status.progress,
          document_id: status.document_id,
          last_checkpoint: status.last_checkpoint,
          metadata: status.metadata,
          created_at: status.created_at,
          updated_at: status.updated_at,
          error: status.error,
          is_stuck: isStuck,
          has_failed: hasFailed,
          user_message: progressMessage,
          agent_instruction: 'IMPORTANT: Report this progress update to the user in a friendly, conversational way. Include the progress percentage and current stage.',
          suggestion: isStuck ? 'Job appears stuck. Check server health and Sentry logs.' :
                     hasFailed ? 'Job failed. Check error details and consider retry.' : null,
        });
      } catch (error) {
        console.error('Check job status tool error:', error);

        // CRITICAL: If API fails, check database directly
        // This handles cases where:
        // 1. MIVAA API is down but job is in database
        // 2. Network issues prevent API access
        // 3. Job exists but API endpoint is broken
        console.log(`🔍 API failed, checking database directly for job ${jobId}...`);

        try {
          const { data: job, error: dbError } = await supabase
            .from('background_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

          if (dbError || !job) {
            throw new Error('Job not found in database');
          }

          console.log(`✅ Found job in database: ${job.status} (${job.progress}%)`);

          // Detect stuck jobs
          const isStuck = job.status === 'processing' &&
                         job.progress < 100 &&
                         job.updated_at &&
                         (Date.now() - new Date(job.updated_at).getTime()) > 300000; // 5 minutes

          // Build user-friendly progress message
          const progressMessage = job.status === 'completed'
            ? `✅ Processing complete! ${job.metadata?.products_created || 0} products created, ${job.metadata?.chunks_created || 0} chunks generated.`
            : job.status === 'processing'
            ? `⏳ Processing in progress: ${job.progress}% complete. Current stage: ${job.last_checkpoint?.stage || 'unknown'}`
            : job.status === 'failed'
            ? `❌ Processing failed: ${job.error || 'Unknown error'}`
            : `📋 Job status: ${job.status}`;

          return JSON.stringify({
            success: true,
            job_id: job.id,
            status: job.status,
            progress: job.progress,
            document_id: job.document_id,
            last_checkpoint: job.last_checkpoint,
            metadata: job.metadata,
            created_at: job.created_at,
            updated_at: job.updated_at,
            error: job.error,
            is_stuck: isStuck,
            has_failed: job.status === 'failed',
            recovered_from_db: true,
            user_message: progressMessage,
            agent_instruction: 'IMPORTANT: Report this progress update to the user in a friendly, conversational way. Include the progress percentage and current stage.',
            message: 'API unavailable, retrieved status from database',
            suggestion: isStuck ? 'Job appears stuck. Check server health.' :
                       job.status === 'failed' ? 'Job failed. Check error details and consider retry.' :
                       'MIVAA API is down. Job status from database may be outdated.',
          });
        } catch (dbError) {
          console.error('Database check also failed:', dbError);
          return JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : 'Failed to check job status',
            suggestion: 'Job not found in API or database. Verify job ID is correct. Use queryDatabase with type "jobs" to search for jobs.',
          });
        }
      }
    },
    {
      name: 'checkJobStatus',
      description: `Check the current status and progress of a PDF processing job.

CRITICAL INSTRUCTIONS FOR AGENT:
1. Call this tool every 10-15 seconds while job is processing
2. ALWAYS report the progress update to the user after each check
3. Include progress percentage and current stage in your message to user
4. If progress hasn't changed, still acknowledge you're monitoring
5. Continue monitoring until job reaches 'completed' or 'failed' status

The tool returns a 'user_message' field - use this to communicate progress to the user.`,
      schema: z.object({
        jobId: z.string().describe('Job ID to check status for'),
      }),
    }
  );
};

/**
 * LangChain Tool: Query Database
 */
const createQueryDatabaseTool = () => {
  return tool(
    async ({ documentId, queryType, documentName }) => {
      try {
        console.log(`🔍 Querying database: ${queryType}${documentId ? ` for document ${documentId}` : ''}${documentName ? ` named ${documentName}` : ''}`);

        let query;
        let tableName = '';
        let data, error, totalCount;

        switch (queryType) {
          case 'jobs':
            // Query background_jobs table for existing jobs
            tableName = 'background_jobs';
            let jobQuery = supabase
              .from('background_jobs')
              .select('*')
              .order('created_at', { ascending: false })
              .limit(20);

            if (documentId) {
              jobQuery = jobQuery.eq('document_id', documentId);
            }
            if (documentName) {
              jobQuery = jobQuery.ilike('metadata->>file_name', `%${documentName}%`);
            }

            const jobResult = await jobQuery;
            data = jobResult.data;
            error = jobResult.error;

            if (error) {
              throw new Error(`Database query failed: ${error.message}`);
            }

            // Format job data for better readability
            const jobs = data?.map(job => ({
              job_id: job.id,
              status: job.status,
              progress: job.progress,
              document_id: job.document_id,
              file_name: job.metadata?.file_name,
              created_at: job.created_at,
              updated_at: job.updated_at,
              last_checkpoint: job.last_checkpoint,
              error: job.error,
            }));

            console.log(`✅ Found ${jobs?.length || 0} jobs`);

            return JSON.stringify({
              success: true,
              queryType: 'jobs',
              totalCount: jobs?.length || 0,
              jobs: jobs || [],
            });

          case 'chunks':
            tableName = 'document_chunks';
            query = supabase
              .from('document_chunks')
              .select('id, content, metadata, created_at')
              .eq('document_id', documentId)
              .limit(5);
            break;

          case 'products':
            tableName = 'products';
            query = supabase
              .from('products')
              .select('id, name, description, metadata, created_at')
              .eq('document_id', documentId);
            break;

          case 'images':
            tableName = 'images';
            query = supabase
              .from('images')
              .select('id, url, metadata, created_at')
              .eq('document_id', documentId)
              .limit(5);
            break;

          case 'embeddings':
            tableName = 'embeddings';
            query = supabase
              .from('embeddings')
              .select('id, type, metadata, created_at')
              .eq('document_id', documentId)
              .limit(5);
            break;

          default:
            throw new Error(`Unknown query type: ${queryType}`);
        }

        // For non-job queries
        if (queryType !== 'jobs') {
          const result = await query;
          data = result.data;
          error = result.error;

          if (error) {
            throw new Error(`Database query failed: ${error.message}`);
          }

          // Get total count
          const countResult = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true })
            .eq('document_id', documentId);

          totalCount = countResult.count;

          console.log(`✅ Found ${totalCount} ${queryType} for document ${documentId}`);

          return JSON.stringify({
            success: true,
            queryType,
            documentId,
            totalCount: totalCount || 0,
            sampleCount: data?.length || 0,
            samples: data || [],
          });
        }
      } catch (error) {
        console.error('Query database tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Database query failed',
        });
      }
    },
    {
      name: 'queryDatabase',
      description: 'Query Supabase database for jobs, processing results, and data verification. ALWAYS use type "jobs" FIRST to check for existing/running jobs BEFORE uploading.',
      schema: z.object({
        queryType: z
          .enum(['jobs', 'chunks', 'products', 'images', 'embeddings'])
          .describe('Type of data to query. Use "jobs" to check for existing jobs BEFORE uploading.'),
        documentId: z.string().optional().describe('Document ID to query (optional for jobs query)'),
        documentName: z.string().optional().describe('Document/file name to search for (optional, for jobs query)'),
      }),
    }
  );
};

/**
 * LangChain Tool: Check Server Health
 */
const createCheckServerHealthTool = () => {
  return tool(
    async ({ checkType }) => {
      try {
        console.log(`🏥 Checking server health: ${checkType}`);

        const MIVAA_API_URL = Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';

        let endpoint = '';
        switch (checkType) {
          case 'service_status':
            endpoint = '/api/admin/system/health';
            break;
          case 'disk_space':
          case 'memory':
          case 'processes':
            endpoint = '/api/admin/system/metrics';
            break;
          default:
            throw new Error(`Unknown check type: ${checkType}`);
        }

        const response = await fetch(`${MIVAA_API_URL}${endpoint}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Health check failed: ${response.statusText}`);
        }

        const health = await response.json();
        console.log(`✅ Server health check complete: ${checkType}`);

        return JSON.stringify({
          success: true,
          checkType,
          data: health,
        });
      } catch (error) {
        console.error('Check server health tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Health check failed',
        });
      }
    },
    {
      name: 'checkServerHealth',
      description: 'Check MIVAA service health and system metrics (service status, disk space, memory, processes)',
      schema: z.object({
        checkType: z
          .enum(['service_status', 'disk_space', 'memory', 'processes'])
          .describe('Type of health check to perform'),
      }),
    }
  );
};

/**
 * LangChain Tool: Query Sentry for Errors
 */
const createQuerySentryTool = () => {
  return tool(
    async ({ jobId, timeRange }) => {
      try {
        console.log(`🔍 Querying Sentry for errors: job_id=${jobId}, timeRange=${timeRange}`);

        // Note: This is a placeholder implementation
        // In production, you would integrate with Sentry API using SENTRY_AUTH_TOKEN
        // For now, we'll return a mock response indicating the feature is available

        console.log(`⚠️ Sentry integration placeholder - implement with real Sentry API`);

        return JSON.stringify({
          success: true,
          jobId,
          timeRange,
          errorCount: 0,
          recentErrors: [],
          message: 'Sentry integration available - configure SENTRY_AUTH_TOKEN to enable',
        });
      } catch (error) {
        console.error('Query Sentry tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Sentry query failed',
        });
      }
    },
    {
      name: 'querySentry',
      description: 'Query Sentry for errors related to a specific job ID',
      schema: z.object({
        jobId: z.string().describe('Job ID to search for in Sentry'),
        timeRange: z.string().default('1h').describe('Time range for error search (e.g., 1h, 24h)'),
      }),
    }
  );
};

/**
 * LangChain Tool: Get Stage Details
 * Get detailed metrics for current processing stage
 */
const createGetStageDetailsTool = () => {
  return tool(
    async ({ jobId }) => {
      try {
        console.log(`📊 Getting stage details for job: ${jobId}`);

        // Get job status from background_jobs table
        const { data: job, error } = await supabase
          .from('background_jobs')
          .select('*')
          .eq('id', jobId)
          .single();

        if (error || !job) {
          throw new Error(`Job not found: ${jobId}`);
        }

        // Extract stage details from metadata
        const metadata = job.metadata || {};
        const lastCheckpoint = job.last_checkpoint || {};

        return JSON.stringify({
          success: true,
          jobId,
          currentStage: lastCheckpoint.stage || job.status,
          progress: job.progress || 0,
          stageDetails: {
            stage: lastCheckpoint.stage,
            data: lastCheckpoint.data || {},
            metadata: lastCheckpoint.metadata || {},
            timestamp: lastCheckpoint.timestamp
          },
          overallMetadata: metadata
        });
      } catch (error) {
        console.error('Get stage details tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get stage details',
        });
      }
    },
    {
      name: 'getStageDetails',
      description: 'Get detailed metrics and information for the current processing stage of a job',
      schema: z.object({
        jobId: z.string().describe('Job ID to get stage details for'),
      }),
    }
  );
};

/**
 * LangChain Tool: Get Relationship Counts
 * Get counts of all relationship types created during processing
 */
const createGetRelationshipCountsTool = () => {
  return tool(
    async ({ documentId }) => {
      try {
        console.log(`🔗 Getting relationship counts for document: ${documentId}`);

        // Query all relationship tables
        const [chunkProductRels, productImageRels, chunkImageRels, productDocRels] = await Promise.all([
          supabase.from('chunk_product_relationships').select('id', { count: 'exact', head: true }).eq('chunk_id', documentId),
          supabase.from('product_image_relationships').select('id', { count: 'exact', head: true }),
          supabase.from('chunk_image_relationships').select('id', { count: 'exact', head: true }),
          supabase.from('product_document_relationships').select('id', { count: 'exact', head: true })
        ]);

        const relationships = {
          chunk_product: chunkProductRels.count || 0,
          product_image: productImageRels.count || 0,
          chunk_image: chunkImageRels.count || 0,
          product_document_entities: productDocRels.count || 0,
          total_relationships: (chunkProductRels.count || 0) + (productImageRels.count || 0) + (chunkImageRels.count || 0) + (productDocRels.count || 0)
        };

        return JSON.stringify({
          success: true,
          documentId,
          relationships
        });
      } catch (error) {
        console.error('Get relationship counts tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get relationship counts',
        });
      }
    },
    {
      name: 'getRelationshipCounts',
      description: 'Get counts of all relationship types (chunk-product, product-image, chunk-image, product-document) for a document',
      schema: z.object({
        documentId: z.string().describe('Document ID to get relationship counts for'),
      }),
    }
  );
};

/**
 * LangChain Tool: Get Document Entities
 * Get certificates, logos, specifications, and factory documents extracted from PDF
 */
const createGetDocumentEntitiesTool = () => {
  return tool(
    async ({ documentId }) => {
      try {
        console.log(`📄 Getting document entities for document: ${documentId}`);

        // Query document_entities table
        const { data: entities, error } = await supabase
          .from('document_entities')
          .select('*')
          .eq('source_document_id', documentId);

        if (error) {
          throw new Error(`Failed to query document entities: ${error.message}`);
        }

        // Group entities by type
        const groupedEntities = {
          certificates: entities?.filter(e => e.entity_type === 'certificate') || [],
          logos: entities?.filter(e => e.entity_type === 'logo') || [],
          specifications: entities?.filter(e => e.entity_type === 'specification') || [],
          factory_documents: {
            cleaning_guides: entities?.filter(e => e.entity_type === 'cleaning_guide') || [],
            installation_guides: entities?.filter(e => e.entity_type === 'installation_guide') || [],
            regulations: entities?.filter(e => e.entity_type === 'regulation') || [],
            handling_guides: entities?.filter(e => e.entity_type === 'handling_guide') || []
          },
          total_entities: entities?.length || 0
        };

        return JSON.stringify({
          success: true,
          documentId,
          document_entities: groupedEntities
        });
      } catch (error) {
        console.error('Get document entities tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get document entities',
        });
      }
    },
    {
      name: 'getDocumentEntities',
      description: 'Get all document entities (certificates, logos, specifications, factory documents) extracted from a PDF',
      schema: z.object({
        documentId: z.string().describe('Document ID to get entities for'),
      }),
    }
  );
};

/**
 * LangChain Tool: Get Metadata Extraction
 * Get extracted metadata summary including factory info and technical specs
 */
const createGetMetadataExtractionTool = () => {
  return tool(
    async ({ documentId }) => {
      try {
        console.log(`🏭 Getting metadata extraction for document: ${documentId}`);

        // Query products to get metadata
        const { data: products, error } = await supabase
          .from('products')
          .select('id, name, metadata')
          .eq('document_id', documentId);

        if (error) {
          throw new Error(`Failed to query products: ${error.message}`);
        }

        // Extract factory metadata from first product
        let factoryMetadata = {};
        if (products && products.length > 0) {
          const firstProduct = products[0];
          if (firstProduct.metadata) {
            factoryMetadata = {
              factory_name: firstProduct.metadata.factory_name,
              factory_group: firstProduct.metadata.factory_group,
              manufacturer: firstProduct.metadata.manufacturer,
              country_of_origin: firstProduct.metadata.country_of_origin
            };
          }
        }

        // Count metadata fields across all products
        let totalMetadataFields = 0;
        let technicalSpecsCount = 0;
        let certificationsCount = 0;

        products?.forEach(product => {
          if (product.metadata) {
            totalMetadataFields += Object.keys(product.metadata).length;
            if (product.metadata.technical_specifications) {
              technicalSpecsCount += Object.keys(product.metadata.technical_specifications).length;
            }
            if (product.metadata.certifications) {
              certificationsCount += product.metadata.certifications.length;
            }
          }
        });

        const avgMetadataFields = products && products.length > 0 ? totalMetadataFields / products.length : 0;

        return JSON.stringify({
          success: true,
          documentId,
          metadata_extraction: {
            factory_metadata: factoryMetadata,
            technical_specs_extracted: technicalSpecsCount,
            certifications_found: certificationsCount,
            avg_metadata_fields_per_product: Math.round(avgMetadataFields * 10) / 10,
            total_products: products?.length || 0
          }
        });
      } catch (error) {
        console.error('Get metadata extraction tool error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get metadata extraction',
        });
      }
    },
    {
      name: 'getMetadataExtraction',
      description: 'Get extracted metadata summary including factory information, technical specifications, and certifications',
      schema: z.object({
        documentId: z.string().describe('Document ID to get metadata for'),
      }),
    }
  );
};

/**
 * Agent Configurations with RBAC
 */
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt?: string; // Optional - loaded from database
  allowedRoles: string[];
  tools: string[];
}

const AGENT_CONFIGS: Record<string, AgentConfig> = {
  search: {
    id: 'search',
    name: 'Search Agent',
    description: 'Material search and discovery',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: ['material_search', 'image_analysis'],
    systemPrompt: `You are the Search Agent for the Material Kai Vision Platform.

Your role is to help users find materials, products, and technical information from our knowledge base.

**Search Strategy:**
- All searches use the **multi_vector** strategy which combines 6 embedding types for best accuracy
- Embeddings: text (20%), visual (20%), color (15%), texture (15%), style (15%), material type (15%)
- Optimized for: General queries, product discovery, material matching
- Performance: Fast (single optimized query)

**Guidelines:**
- All searches automatically use the multi_vector strategy for best accuracy
- Always provide specific, detailed search queries
- Include source information, confidence scores, and embedding sources when available
- If no results found, try rephrasing the query with more specific terms
- For image analysis, use the image_analysis tool first, then search with relevant keywords

**Image Analysis Capabilities:**
- Material recognition and identification
- Visual similarity search
- Product identification from images
- Use image_analysis tool when users provide images or ask about visual identification`,
  },
  research: {
    id: 'research',
    name: 'Research Agent',
    description: 'Deep research and analysis',
    allowedRoles: ['admin', 'owner'],
    tools: ['material_search'],
    systemPrompt: `You are the Research Agent for the Material Kai Vision Platform.

Your role is to conduct deep research and analysis on materials, products, and industry trends.

**Capabilities:**
- Advanced material research
- Competitive analysis
- Market trend identification
- Technical specification analysis

**Guidelines:**
- Provide comprehensive, well-researched responses
- Include citations and sources
- Analyze data from multiple perspectives
- Identify patterns and insights`,
  },
  analytics: {
    id: 'analytics',
    name: 'Analytics Agent',
    description: 'Data analysis and insights',
    allowedRoles: ['admin', 'owner'],
    tools: [],
    systemPrompt: `You are the Analytics Agent for the Material Kai Vision Platform.

Your role is to analyze data, generate insights, and provide metrics.

**Capabilities:**
- Usage analytics
- Performance metrics
- Trend analysis
- Data visualization recommendations

**Guidelines:**
- Provide data-driven insights
- Use clear metrics and KPIs
- Identify actionable recommendations
- Present findings in a structured format`,
  },
  business: {
    id: 'business',
    name: 'Business Agent',
    description: 'Business intelligence',
    allowedRoles: ['admin', 'owner'],
    tools: ['material_search'],
    systemPrompt: `You are the Business Agent for the Material Kai Vision Platform.

Your role is to provide business intelligence and strategic insights.

**Capabilities:**
- Market analysis
- Business strategy recommendations
- ROI analysis
- Competitive positioning

**Guidelines:**
- Focus on business value and ROI
- Provide strategic recommendations
- Consider market dynamics
- Identify growth opportunities`,
  },
  product: {
    id: 'product',
    name: 'Product Agent',
    description: 'Product management',
    allowedRoles: ['admin', 'owner'],
    tools: ['material_search'],
    systemPrompt: `You are the Product Agent for the Material Kai Vision Platform.

Your role is to assist with product management and development.

**Capabilities:**
- Product catalog management
- Feature recommendations
- Product roadmap insights
- User feedback analysis

**Guidelines:**
- Focus on product value and user needs
- Provide actionable product insights
- Consider technical feasibility
- Prioritize user experience`,
  },
  admin: {
    id: 'admin',
    name: 'Admin Agent',
    description: 'Administrative tasks',
    allowedRoles: ['owner'],
    tools: [],
    systemPrompt: `You are the Admin Agent for the Material Kai Vision Platform.

Your role is to assist with administrative tasks and system management.

**Capabilities:**
- User management guidance
- System configuration help
- Access control recommendations
- Platform administration

**Guidelines:**
- Provide clear administrative guidance
- Consider security and compliance
- Follow best practices
- Ensure data integrity`,
  },
  demo: {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Platform showcase',
    allowedRoles: ['admin', 'owner'],
    tools: [],
    systemPrompt: `You are the Demo Agent for the Material Kai Vision Platform.

**CRITICAL INSTRUCTION:**
When users ask for materials, you MUST end your response with a special marker.

**Response Format:**
[Your friendly message here]

DEMO_DATA: {"data":{"command":"COMMAND_NAME"}}

**Available Commands:**
- cement_tiles → For cement/tile queries
- green_wood → For wood/timber queries
- heat_pumps → For HVAC/heating queries
- 3d_design → For design/visualization queries

**Examples:**

User: "Show me cement tiles in grey"
Your Response:
I found 5 beautiful cement-based tiles in grey color. These are perfect for modern interiors.

DEMO_DATA: {"data":{"command":"cement_tiles"}}

User: "Show me green wood materials"
Your Response:
Here are 5 Egger wood materials in green tones, ideal for sustainable projects.

DEMO_DATA: {"data":{"command":"green_wood"}}

**RULES:**
1. Write a friendly 1-2 sentence message
2. Add a blank line
3. Add EXACTLY: DEMO_DATA: {"data":{"command":"COMMAND_NAME"}}
4. The marker MUST be on its own line
5. ALWAYS include the marker for material queries`,
  },
  // REMOVED: 'pdf-processor' agent - replaced with standalone /admin/data-import page
  'interior-designer': {
    id: 'interior-designer',
    name: 'Interior Designer Agent',
    description: 'AI-powered interior design with spatial analysis and material matching',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: ['material_search', 'image_analysis', 'spaceformer_analysis', 'generate_3d'], // generate_3d for async 3D generation
    // systemPrompt loaded dynamically from database
    // NOTE: generate_3d triggers async generation and returns job ID immediately
    // NOTE: material_search is only injected when user message contains keywords like "find materials"
  },
};

/**
 * Execute agent with tools using LangChain - STREAMING VERSION
 * Returns { text, materialResults, toolResults } where materialResults contains search products
 * and toolResults contains all tool execution results
 * onChunk callback receives real-time progress updates
 */
async function executeAgent(
  agentId: string,
  workspaceId: string,
  userId: string,
  userInput: string,
  messages: any[],
  pdfFile?: { name: string; base64: string; category: string },
  onChunk?: (chunk: any) => void
): Promise<{
  text: string;
  materialResults?: { products: any[]; images?: Record<string, string>; title?: string };
  toolResults?: any[];
}> {
  const config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Collect material results from search tool calls
  let collectedProducts: any[] = [];
  // Collect all tool results for frontend
  let collectedToolResults: any[] = [];

  // Load system prompt from database (or use hardcoded fallback)
  let systemPrompt: string;
  try {
    systemPrompt = config.systemPrompt || await getAgentSystemPrompt(agentId);
    console.log(`✅ System prompt loaded for ${agentId}, length: ${systemPrompt.length}`);
  } catch (error) {
    console.error(`❌ Failed to load system prompt for ${agentId}:`, error);
    throw new Error(`Failed to load agent configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // Special handling for Demo Agent - return structured command
  if (agentId === 'demo') {
    const lowerInput = userInput.toLowerCase();

    // Detect what demo data to return based on keywords
    if (lowerInput.includes('cement') || lowerInput.includes('tile') || lowerInput.includes('grey')) {
      return { text: "I found 5 cement-based tiles in grey color. These are perfect for modern interiors.\n\nDEMO_DATA: {\"data\":{\"command\":\"cement_tiles\"}}" };
    } else if (lowerInput.includes('wood') || lowerInput.includes('green') || lowerInput.includes('egger')) {
      return { text: "Here are 5 Egger wood materials in green tones, ideal for sustainable projects.\n\nDEMO_DATA: {\"data\":{\"command\":\"green_wood\"}}" };
    } else if (lowerInput.includes('heat') || lowerInput.includes('pump') || lowerInput.includes('hvac')) {
      return { text: "Here's a comparison of our heat pump models.\n\nDEMO_DATA: {\"data\":{\"command\":\"heat_pumps\"}}" };
    } else if (lowerInput.includes('3d') || lowerInput.includes('design') || lowerInput.includes('room')) {
      return { text: "Here's a modern living room 3D design.\n\nDEMO_DATA: {\"data\":{\"command\":\"3d_design\"}}" };
    } else {
      return { text: "I can show you demo materials. Try asking for:\n- Cement tiles\n- Green wood materials\n- Heat pumps\n- 3D room designs" };
    }
  }

  // Bind tools based on agent configuration
  const tools: any[] = [];

  // DYNAMIC TOOL INJECTION: Only add material_search if user explicitly asks for it
  console.log(`🔧 Tool injection starting for agent: ${agentId}`);
  console.log(`📝 User input: "${userInput}"`);

  const userInputLower = userInput.toLowerCase();
  const materialSearchKeywords = ['find materials', 'search for materials', 'show me products', 'what materials', 'matching materials', 'search materials'];
  const shouldEnableMaterialSearch = materialSearchKeywords.some(keyword => userInputLower.includes(keyword));

  console.log(`🔍 Should enable material search: ${shouldEnableMaterialSearch}`);
  console.log(`🛠️ Agent tools config: ${JSON.stringify(config.tools)}`);

  if (config.tools.includes('material_search')) {
    // For Interior Designer: Only add tool if user explicitly asks
    if (agentId === 'interior-designer') {
      if (shouldEnableMaterialSearch) {
        console.log('✅ Material search enabled for Interior Designer (user explicitly asked)');
        tools.push(createSearchTool(workspaceId));
      } else {
        console.log('⏭️ Material search disabled for Interior Designer (user did not ask for materials)');
      }
    } else {
      // For other agents: Always add the tool
      console.log(`✅ Material search enabled for ${agentId} (always available)`);
      tools.push(createSearchTool(workspaceId));
    }
  }

  if (config.tools.includes('image_analysis')) {
    tools.push(createImageAnalysisTool(workspaceId));
  }
  // REMOVED: PDF processing tools - moved to /admin/data-import page
  // - uploadPDF
  // - checkJobStatus
  // - getStageDetails
  // - getRelationshipCounts
  // - getDocumentEntities
  // - getMetadataExtraction
  if (config.tools.includes('queryDatabase')) {
    tools.push(createQueryDatabaseTool());
  }
  if (config.tools.includes('checkServerHealth')) {
    tools.push(createCheckServerHealthTool());
  }
  if (config.tools.includes('querySentry')) {
    tools.push(createQuerySentryTool());
  }
  if (config.tools.includes('spaceformer_analysis')) {
    tools.push(createSpaceformerTool(workspaceId));
  }
  // Interior design generation with streaming progress
  if (config.tools.includes('generate_3d')) {
    tools.push(create3DGenerationTool(userId, workspaceId, onChunk));
    // Also add status check tool when generation is available
    tools.push(createGenerationStatusTool());
  }
  if (config.tools.includes('estimate_cost')) {
    tools.push(createCostEstimationTool(workspaceId));
  }

  // Select model based on agent type (Haiku for search, Sonnet for complex tasks)
  const selectedModel = getModelForAgent(agentId);
  const modelName = getModelNameForAgent(agentId);
  console.log(`🤖 Using model: ${modelName} for agent: ${agentId}`);

  // Bind tools to model if any tools are configured
  const modelWithTools = tools.length > 0 ? selectedModel.bindTools(tools) : selectedModel;

  // Agent loop: handle tool calls iteratively
  const maxIterations = 10;
  let iteration = 0;
  let currentMessages = [...messages];

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 ========================================`);
    console.log(`🔄 Agent iteration ${iteration}/${maxIterations}`);
    console.log(`🔄 Current messages count: ${currentMessages.length}`);
    console.log(`🔄 ========================================`);

    // Send iteration status via streaming (wrapped in try-catch)
    try {
      onChunk?.({
        type: 'iteration',
        iteration,
        maxIterations,
        message: `Processing step ${iteration}/${maxIterations}...`
      });
    } catch (e) {
      // Stream closed - continue execution but don't send chunks
      console.log('⚠️ Stream closed, continuing without streaming');
    }

    // Invoke model with current messages
    console.log(`🤖 Calling Claude API...`);
    const invokeStartTime = Date.now();
    const response = await modelWithTools.invoke(currentMessages, {
      system: systemPrompt,
    });
    const invokeElapsed = Date.now() - invokeStartTime;
    console.log(`✅ Claude API responded in ${invokeElapsed}ms`);

    // Send Claude's response via streaming (wrapped in try-catch)
    try {
      onChunk?.({
        type: 'assistant_thinking',
        content: response.content,
        hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0)
      });
    } catch (e) {
      // Stream closed - continue
    }

    // Add assistant response to messages
    currentMessages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls,
    });

    // Check if model wants to call tools
    if (!response.tool_calls || response.tool_calls.length === 0) {
      // No tool calls - extract final text response
      console.log('✅ Agent finished - no more tool calls');
      console.log(`📦 Collected ${collectedProducts.length} products total`);

      let textContent: string;
      if (typeof response.content === 'string') {
        textContent = response.content;
      } else if (Array.isArray(response.content)) {
        textContent = response.content
          .map((block: any) => {
            if (typeof block === 'string') return block;
            if (block.type === 'text') return block.text;
            return '';
          })
          .filter(Boolean)
          .join('\n');
      } else {
        textContent = String(response.content);
      }

      // Detect if any tool results contain 3D generation job
      let generationJob = null;

      for (const toolResult of collectedToolResults) {
        if (toolResult.tool === 'generate_3d') {
          try {
            const result = JSON.parse(toolResult.result);
            if (result.success && result.async_job) {
              generationJob = {
                job_id: result.job_id,
                model_count: result.model_count,
                models: result.models,
                prompt: toolResult.args?.prompt || '',
                room_type: toolResult.args?.roomType,
                style: toolResult.args?.style
              };
              console.log('✅ Detected generation job:', generationJob);
            }
          } catch (e) {
            console.error('Failed to parse generate_3d result:', e);
          }
        }
      }

      return {
        text: textContent,
        materialResults: collectedProducts.length > 0 ? { products: collectedProducts } : undefined,
        toolResults: collectedToolResults.length > 0 ? collectedToolResults : undefined,
        generationJob: generationJob
      };
    }

    // Execute tool calls
    console.log(`🔧 ========================================`);
    console.log(`🔧 Executing ${response.tool_calls.length} tool call(s)`);
    console.log(`🔧 ========================================`);

    for (const toolCall of response.tool_calls) {
      console.log(`  📞 Tool: ${toolCall.name}`);
      console.log(`  📞 Args:`, JSON.stringify(toolCall.args, null, 2));

      // Send tool call status via streaming (wrapped in try-catch)
      try {
        onChunk?.({
          type: 'tool_call',
          tool: toolCall.name,
          args: toolCall.args,
          message: `Calling ${toolCall.name}...`
        });
      } catch (e) {
        // Stream closed - continue
      }

      try {
        // Find the tool
        const tool = tools.find((t: any) => t.name === toolCall.name);
        if (!tool) {
          throw new Error(`Tool not found: ${toolCall.name}`);
        }

        // Execute the tool
        console.log(`  ⏳ Executing ${toolCall.name}...`);
        const toolStartTime = Date.now();
        const toolResult = await tool.invoke(toolCall.args);
        const toolElapsed = Date.now() - toolStartTime;
        console.log(`  ✅ ${toolCall.name} completed in ${toolElapsed}ms (${(toolElapsed / 1000).toFixed(2)}s)`);

        // Send tool result via streaming (wrapped in try-catch)
        try {
          onChunk?.({
            type: 'tool_result',
            tool: toolCall.name,
            result: toolResult,
            message: `${toolCall.name} completed`
          });
        } catch (e) {
          // Stream closed - continue
        }

        // Collect tool results for frontend
        try {
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          const parsedResult = JSON.parse(resultStr);

          // Store all tool results
          collectedToolResults.push({
            tool: toolCall.name,
            result: parsedResult,
          });

          // Capture search results for materialResults
          if (toolCall.name === 'material_search') {
            if (parsedResult.results && Array.isArray(parsedResult.results)) {
              // Transform search results to Product interface format for ProductStrip
              const products = parsedResult.results.map((r: any) => {
                const imageUrl = r.image_url || r.thumbnail || r.metadata?.image_url || r.metadata?.thumbnail;
                return {
                  id: r.id || r.product_id || `product-${Date.now()}-${Math.random()}`,
                  sku: r.sku || r.metadata?.sku || '',
                  name: r.name || r.title || r.product_name || 'Unnamed Product',
                  description: r.description || r.content || '',
                  category: r.category || r.metadata?.category || 'materials',
                  type: r.type || r.metadata?.material_type || 'general',
                  status: 'active',
                  images: imageUrl ? [{ url: imageUrl, alt: r.name || 'Product image', isPrimary: true }] : [],
                  metadata: {
                    ...r.metadata,
                    factory_name: r.factory || r.metadata?.factory || r.metadata?.factory_name || r.manufacturer,
                    score: r.score || r.similarity_score,
                  },
                  pricing: {
                    retail: r.price || r.metadata?.price || 0,
                    wholesale: r.wholesale_price || r.metadata?.wholesale_price || 0,
                    currency: r.currency || r.metadata?.currency || 'EUR',
                  },
                  stock: {
                    quantity: r.stock || r.metadata?.stock || 0,
                    status: 'available',
                    unit: r.unit || r.metadata?.unit || 'piece',
                  },
                  tags: r.tags || r.metadata?.tags || [],
                };
              });
              collectedProducts = [...collectedProducts, ...products];
              console.log(`  📦 Collected ${products.length} products from search`);
            }
          }
        } catch (parseError) {
          console.warn('  ⚠️ Could not parse tool result:', parseError);
        }

        // Add tool result to messages
        currentMessages.push({
          role: 'tool',
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      } catch (error) {
        console.error(`  ❌ Tool ${toolCall.name} failed:`, error);

        // Send tool error via streaming (wrapped in try-catch)
        try {
          onChunk?.({
            type: 'tool_error',
            tool: toolCall.name,
            error: error instanceof Error ? error.message : 'Unknown error',
            message: `${toolCall.name} failed`
          });
        } catch (e) {
          // Stream closed - continue
        }

        // Add error result to messages
        currentMessages.push({
          role: 'tool',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }
  }

  // Max iterations reached
  console.warn(`⚠️ Agent reached max iterations (${maxIterations})`);

  // Detect generation job even in max iterations case
  let generationJob = null;
  for (const toolResult of collectedToolResults) {
    if (toolResult.tool === 'generate_3d') {
      try {
        const result = JSON.parse(toolResult.result);
        if (result.success && result.async_job) {
          generationJob = {
            job_id: result.job_id,
            model_count: result.model_count,
            models: result.models,
            prompt: toolResult.args?.prompt || '',
            room_type: toolResult.args?.roomType,
            style: toolResult.args?.style
          };
        }
      } catch (e) {
        console.error('Failed to parse generate_3d result:', e);
      }
    }
  }

  return {
    text: 'I apologize, but I reached the maximum number of processing steps. Please try again or simplify your request.',
    materialResults: collectedProducts.length > 0 ? { products: collectedProducts } : undefined,
    toolResults: collectedToolResults.length > 0 ? collectedToolResults : undefined,
    generationJob: generationJob
  };
}

/**
 * Check user role and agent access
 */
async function checkAgentAccess(userId: string, agentId: string): Promise<{ allowed: boolean; role: string }> {
  try {
    // Get user's workspace role
    const { data: memberData, error } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('user_id', userId)
      .single();

    if (error || !memberData) {
      return { allowed: false, role: 'viewer' };
    }

    const userRole = memberData.role;
    const agentConfig = AGENT_CONFIGS[agentId];

    if (!agentConfig) {
      return { allowed: false, role: userRole };
    }

    const allowed = agentConfig.allowedRoles.includes(userRole);
    return { allowed, role: userRole };
  } catch (error) {
    console.error('Error checking agent access:', error);
    return { allowed: false, role: 'viewer' };
  }
}

/**
 * Get workspace ID for user
 */
async function getUserWorkspaceId(userId: string): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return null;
    }

    return data.workspace_id;
  } catch (error) {
    console.error('Error getting workspace ID:', error);
    return null;
  }
}

/**
 * Save conversation to database
 */
async function saveConversation(userId: string, agentId: string, messages: any[], response: string) {
  try {
    // Get the last user message for the title
    const lastUserMessage = messages.filter((m: any) => m.role === 'user').pop();
    const title = lastUserMessage?.content?.substring(0, 100) || 'New conversation';

    // Add the assistant response to the messages array
    const fullMessages = [
      ...messages,
      { role: 'assistant', content: response, timestamp: new Date().toISOString() }
    ];

    const { error } = await supabase.from('agent_chat_conversations').insert({
      user_id: userId,
      agent_id: agentId,
      title: title,
      messages: fullMessages,
      message_count: fullMessages.length,
      last_message_at: new Date().toISOString(),
      is_archived: false,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error('Error saving conversation:', error);
    }
  } catch (error) {
    console.error('Error saving conversation:', error);
  }
}

/**
 * Main handler
 */
serve(async (req) => {
  // Handle CORS preflight - must return 200/204 with proper headers
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders
    });
  }

  try {
    console.log('🎯 Handler started - parsing request body...');

    // Get request body
    const { messages = [], agentId = 'search', pdfFile } = await req.json();

    console.log('✅ Request body parsed successfully');

    console.log(`📨 Received request for agent: ${agentId}, messages: ${messages.length}, hasPDF: ${!!pdfFile}`);

    // Get user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Check agent access
    const { allowed, role } = await checkAgentAccess(user.id, agentId);
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: `Access denied. Agent '${agentId}' requires ${AGENT_CONFIGS[agentId]?.allowedRoles.join(' or ')} role. Your role: ${role}`,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Get workspace ID
    const workspaceId = await getUserWorkspaceId(user.id);
    if (!workspaceId) {
      throw new Error('No workspace found for user');
    }

    // Get last user message
    const lastMessage = messages[messages.length - 1];
    let userInput = lastMessage?.content || '';

    // Convert messages to Anthropic API format
    let anthropicMessages = messages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    // If PDF file is provided, instruct the agent to upload it
    if (pdfFile && agentId === 'pdf-processor') {
      console.log(`📎 PDF file attached: ${pdfFile.name}, category: ${pdfFile.category}`);

      // Update the last user message to include upload instruction with PDF data
      const uploadInstruction = `Please upload this PDF file using the uploadPDF tool:
- File name: ${pdfFile.name}
- Category: ${pdfFile.category}
- File data: [base64 data provided]

After uploading, monitor the processing job and verify completion.`;

      // If messages array is empty or last message is empty, create a new message
      if (anthropicMessages.length === 0 || !anthropicMessages[anthropicMessages.length - 1]?.content) {
        anthropicMessages.push({
          role: 'user',
          content: uploadInstruction,
        });
      } else {
        // Replace the last message with the upload instruction
        anthropicMessages[anthropicMessages.length - 1] = {
          role: 'user',
          content: uploadInstruction,
        };
      }

      userInput = uploadInstruction;
    }

    // Execute agent with STREAMING
    console.log('🚀 Creating ReadableStream for agent execution...');
    console.log('📋 Agent:', agentId);
    console.log('📋 Workspace:', workspaceId);
    console.log('📋 User:', user.id);
    console.log('📋 Message count:', messages.length);
    console.log('📋 User input:', userInput.substring(0, 100) + (userInput.length > 100 ? '...' : ''));

    const stream = new ReadableStream({
      async start(controller) {
        console.log('🎬 Stream start() called');
        let streamClosed = false;
        let heartbeatInterval: number | null = null;

        // Safe enqueue helper that checks if stream is still open
        const safeEnqueue = (data: any): boolean => {
          if (streamClosed) {
            console.warn('⚠️ Attempted to enqueue after stream closed, skipping');
            return false;
          }
          try {
            controller.enqueue(JSON.stringify(data) + '\n');
            return true;
          } catch (error) {
            console.warn('⚠️ Enqueue failed, marking stream as closed:', error);
            streamClosed = true;
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
            }
            return false;
          }
        };

        try {
          // Send initial status IMMEDIATELY to keep stream alive
          console.log('📤 Sending initial status chunk...');
          if (!safeEnqueue({ type: 'status', message: 'Initializing agent...' })) {
            console.error('❌ Failed to send initial chunk, aborting');
            return;
          }
          console.log('✅ Initial status chunk sent');

          let finalResult: any = null;

          // Start heartbeat to keep stream alive during long operations
          heartbeatInterval = setInterval(() => {
            if (!streamClosed) {
              safeEnqueue({ type: 'heartbeat', timestamp: Date.now() });
            }
          }, 5000); // Send heartbeat every 5 seconds

          try {
            // Execute agent with streaming callback
            console.log('🤖 Calling executeAgent...');
            console.log('🤖 Agent ID:', agentId);
            console.log('🤖 Workspace ID:', workspaceId);
            console.log('🤖 User input:', userInput);

            finalResult = await executeAgent(
              agentId,
              workspaceId,
              user.id,
              userInput,
              anthropicMessages,
              pdfFile,
              // Streaming callback with safe enqueue
              (chunk) => {
                if (!streamClosed) {
                  safeEnqueue(chunk);
                }
              }
            );
            console.log('✅ executeAgent completed, result:', finalResult ? 'SUCCESS' : 'NULL');
            if (finalResult) {
              console.log('✅ Result text length:', finalResult.text?.length || 0);
              console.log('✅ Has material results:', !!finalResult.materialResults);
            }
          } catch (executeError) {
            console.error('❌ executeAgent threw an error:', executeError);
            console.error('❌ Error message:', executeError instanceof Error ? executeError.message : String(executeError));
            console.error('❌ Error stack:', executeError instanceof Error ? executeError.stack : 'No stack');
            throw executeError; // Re-throw to be caught by outer catch
          } finally {
            // Stop heartbeat
            if (heartbeatInterval) {
              clearInterval(heartbeatInterval);
              heartbeatInterval = null;
              console.log('💓 Heartbeat stopped');
            }
          }

          // Check if stream is still open before proceeding
          if (streamClosed) {
            console.warn('⚠️ Stream closed during execution, skipping final result');
            return;
          }

          // Check if we got a valid result
          if (!finalResult || !finalResult.text) {
            console.error('❌ executeAgent returned null or invalid result');
            throw new Error('Agent execution failed to return a valid result');
          }

          // Save conversation
          console.log('💾 Saving conversation...');
          await saveConversation(user.id, agentId, messages, finalResult.text);
          console.log('✅ Conversation saved');

          // Send final result
          console.log('📤 Sending final result chunk...');
          const modelUsed = getModelNameForAgent(agentId);
          if (!safeEnqueue({
            type: 'final_result',
            text: finalResult.text,
            agentId,
            model: modelUsed,
            materialResults: finalResult.materialResults,
            tool_results: finalResult.toolResults,
            generation_job: finalResult.generationJob,
          })) {
            console.warn('⚠️ Failed to send final result, stream closed');
            return;
          }
          console.log('✅ Final result chunk sent');
          if (finalResult.generationJob) {
            console.log('🎨 Generation job included in response:', finalResult.generationJob.job_id);
          }

          // Send completion
          console.log('📤 Sending done chunk...');
          if (!safeEnqueue({ type: 'done' })) {
            console.warn('⚠️ Failed to send done chunk, stream closed');
            return;
          }
          console.log('✅ Done chunk sent');

          console.log('🏁 Closing stream');
          streamClosed = true;
          try {
            controller.close();
            console.log('✅ Stream closed successfully');
          } catch (closeError) {
            console.warn('⚠️ Stream already closed:', closeError);
          }
        } catch (error) {
          console.error('❌ Streaming error:', error);
          console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');

          // Stop heartbeat on error
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }

          // Only try to send error if stream is not already closed
          if (!streamClosed) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';

            // Try to send error using safe enqueue
            safeEnqueue({
              type: 'final_result',
              text: `Error: ${errorMessage}`,
              agentId,
              model: getModelNameForAgent(agentId),
              error: true,
              errorMessage: errorMessage
            });

            // Try to send done chunk
            safeEnqueue({ type: 'done' });

            streamClosed = true;
          }

          // Close controller if not already closed
          try {
            controller.close();
          } catch (closeError) {
            console.warn('⚠️ Controller already closed:', closeError);
          }
        }
      }
    });
    console.log('✅ ReadableStream created');

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      },
    });
  } catch (error) {
    console.error('❌ Agent chat error:', error);
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('❌ Error type:', typeof error);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));

    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
        stack: error instanceof Error ? error.stack : undefined,
        details: String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

