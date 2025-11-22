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
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// LangChain imports - using correct npm package names for Deno
import { ChatAnthropic } from 'npm:@langchain/anthropic@0.3.11';
import { tool } from 'npm:@langchain/core@0.3.29/tools';
import { z } from 'npm:zod@3.24.1';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Load agent system prompt from database
 * Falls back to default if not found
 */
async function getAgentSystemPrompt(agentType: string): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('material_agents')
      .select('system_prompt')
      .eq('agent_type', agentType)
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
  };
  return defaults[agentType] || 'You are a helpful assistant.';
}

// Initialize Claude model AT MODULE LOAD TIME
// It will auto-read ANTHROPIC_API_KEY from process.env
const model = new ChatAnthropic({
  model: 'claude-sonnet-4-20250514',
  temperature: 1,
  maxTokens: 4096,
});

console.log('✅ LangChain ChatAnthropic model initialized');

/**
 * LangChain Tool: Material Search using MIVAA API
 */
const createSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, strategy = 'multi_vector', limit = 10 }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        const response = await fetch(`${MIVAA_GATEWAY_URL}/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            workspace_id: workspaceId,
            search_type: strategy,
            limit,
          }),
        });

        if (!response.ok) {
          throw new Error(`MIVAA API error: ${response.statusText}`);
        }

        const data = await response.json();
        return JSON.stringify(data);
      } catch (error) {
        console.error('Material search error:', error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Search failed',
        });
      }
    },
    {
      name: 'material_search',
      description: 'Search for materials, products, and technical information using RAG. Use this for any material-related queries. DEFAULT to multi_vector strategy for best accuracy and performance.',
      schema: z.object({
        query: z.string().describe('Search query'),
        strategy: z
          .enum(['semantic', 'visual', 'multi_vector', 'hybrid', 'material', 'keyword', 'color', 'texture', 'style', 'material_type', 'all'])
          .default('multi_vector')
          .describe('Search strategy - multi_vector (RECOMMENDED) combines 6 embedding types for best accuracy; use specialized strategies (color/texture/style/material_type) for specific visual attributes; use all only for comprehensive search'),
        limit: z.number().default(10).describe('Maximum results'),
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
        });

        if (!response.ok) {
          throw new Error(`Image analysis failed: ${response.statusText}`);
        }

        const data = await response.json();

        return JSON.stringify({
          success: true,
          analysis: data.analysis || {},
          materials: data.materials || [],
        });
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
              .from('async_jobs')
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
            .from('async_jobs')
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
      description: 'Check the current status and progress of a PDF processing job',
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
            // Query async_jobs table for existing jobs
            tableName = 'async_jobs';
            let jobQuery = supabase
              .from('async_jobs')
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
            tableName = 'chunks';
            query = supabase
              .from('chunks')
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

**Search Strategies Available:**

1. **multi_vector** (⭐ RECOMMENDED - USE BY DEFAULT)
   - Combines 6 embedding types with intelligent weighting for best accuracy
   - Embeddings: text (20%), visual (20%), color (15%), texture (15%), style (15%), material type (15%)
   - Best for: General queries, product discovery, material matching
   - Performance: Fast (single optimized query)
   - Cost: Low (1 search operation)

2. **Specialized Visual Searches** (use when user asks about specific attributes):
   - **color**: "Find materials with warm tones", "similar color palette", "red materials"
   - **texture**: "Find rough textured materials", "similar texture pattern", "smooth surfaces"
   - **style**: "Find modern style materials", "similar design aesthetic", "minimalist products"
   - **material_type**: "Find similar material types", "materials like this", "wood alternatives"

3. **Other Strategies:**
   - **semantic**: Fast text-only search (use for simple keyword queries when speed critical)
   - **visual**: Image-based similarity (use when user provides image without specific attribute focus)
   - **hybrid**: Text + keyword combined (use for exact term matching)
   - **material**: Property-based filtering (use for technical specifications)
   - **keyword**: Exact match search (use for product codes, SKUs)
   - **all**: Run ALL 10 strategies in parallel (⚠️ SLOW, HIGH COST - use ONLY when user explicitly asks for comprehensive search)

**Guidelines:**
- ⭐ DEFAULT to 'multi_vector' strategy for ALL queries unless user specifies otherwise
- Use specialized strategies (color/texture/style/material_type) when user asks about specific visual attributes
- Use 'visual' strategy when user provides an image without specific attribute focus
- Use 'semantic' for simple text queries when speed is critical
- Use 'all' strategy ONLY when user explicitly asks for comprehensive/exhaustive search
- Always explain which strategy you're using and why
- Include source information, confidence scores, and embedding sources when available
- If no results found, suggest trying a different strategy (e.g., if multi_vector fails, try specialized color or texture search)
- For image analysis, use the image_analysis tool first, then search with appropriate strategy

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
  'pdf-processor': {
    id: 'pdf-processor',
    name: 'PDF Processing Agent',
    description: 'Intelligent PDF processing with monitoring',
    allowedRoles: ['admin', 'owner'],
    tools: ['uploadPDF', 'checkJobStatus', 'queryDatabase', 'checkServerHealth', 'querySentry'],
    // systemPrompt loaded dynamically from database
  },
};

/**
 * Execute agent with tools using LangChain
 */
async function executeAgent(
  agentId: string,
  workspaceId: string,
  userId: string,
  userInput: string,
  messages: any[],
  pdfFile?: { name: string; base64: string; category: string }
) {
  const config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Load system prompt from database (or use hardcoded fallback)
  const systemPrompt = config.systemPrompt || await getAgentSystemPrompt(agentId);

  // Special handling for Demo Agent - return structured command
  if (agentId === 'demo') {
    const lowerInput = userInput.toLowerCase();

    // Detect what demo data to return based on keywords
    if (lowerInput.includes('cement') || lowerInput.includes('tile') || lowerInput.includes('grey')) {
      return "I found 5 cement-based tiles in grey color. These are perfect for modern interiors.\n\nDEMO_DATA: {\"data\":{\"command\":\"cement_tiles\"}}";
    } else if (lowerInput.includes('wood') || lowerInput.includes('green') || lowerInput.includes('egger')) {
      return "Here are 5 Egger wood materials in green tones, ideal for sustainable projects.\n\nDEMO_DATA: {\"data\":{\"command\":\"green_wood\"}}";
    } else if (lowerInput.includes('heat') || lowerInput.includes('pump') || lowerInput.includes('hvac')) {
      return "Here's a comparison of our heat pump models.\n\nDEMO_DATA: {\"data\":{\"command\":\"heat_pumps\"}}";
    } else if (lowerInput.includes('3d') || lowerInput.includes('design') || lowerInput.includes('room')) {
      return "Here's a modern living room 3D design.\n\nDEMO_DATA: {\"data\":{\"command\":\"3d_design\"}}";
    } else {
      return "I can show you demo materials. Try asking for:\n- Cement tiles\n- Green wood materials\n- Heat pumps\n- 3D room designs";
    }
  }

  // Bind tools based on agent configuration
  const tools: any[] = [];

  if (config.tools.includes('material_search')) {
    tools.push(createSearchTool(workspaceId));
  }
  if (config.tools.includes('image_analysis')) {
    tools.push(createImageAnalysisTool(workspaceId));
  }
  if (config.tools.includes('uploadPDF')) {
    // If PDF file is provided, create a wrapper tool that auto-injects the PDF data
    if (pdfFile) {
      const uploadPDFWithData = tool(
        async ({ category }: { category?: 'products' | 'certificates' | 'logos' | 'specifications' }) => {
          // Call the original tool with the PDF data injected
          const originalTool = createUploadPDFTool(userId, workspaceId);
          return await originalTool.invoke({
            fileName: pdfFile.name,
            fileBase64: pdfFile.base64,
            category: category || pdfFile.category,
          });
        },
        {
          name: 'uploadPDF',
          description: `Upload the attached PDF file "${pdfFile.name}" to start processing`,
          schema: z.object({
            category: z
              .enum(['products', 'certificates', 'logos', 'specifications'])
              .optional()
              .describe(`Document category (default: ${pdfFile.category})`),
          }),
        }
      );
      tools.push(uploadPDFWithData);
    } else {
      tools.push(createUploadPDFTool(userId, workspaceId));
    }
  }
  if (config.tools.includes('checkJobStatus')) {
    tools.push(createCheckJobStatusTool());
  }
  if (config.tools.includes('queryDatabase')) {
    tools.push(createQueryDatabaseTool());
  }
  if (config.tools.includes('checkServerHealth')) {
    tools.push(createCheckServerHealthTool());
  }
  if (config.tools.includes('querySentry')) {
    tools.push(createQuerySentryTool());
  }

  // Bind tools to model if any tools are configured
  const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;

  // Agent loop: handle tool calls iteratively
  const maxIterations = 10;
  let iteration = 0;
  let currentMessages = [...messages];

  while (iteration < maxIterations) {
    iteration++;
    console.log(`🔄 Agent iteration ${iteration}/${maxIterations}`);

    // Invoke model with current messages
    const response = await modelWithTools.invoke(currentMessages, {
      system: systemPrompt,
    });

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

      return textContent;
    }

    // Execute tool calls
    console.log(`🔧 Executing ${response.tool_calls.length} tool call(s)`);

    for (const toolCall of response.tool_calls) {
      console.log(`  📞 Calling tool: ${toolCall.name}`);

      try {
        // Find the tool
        const tool = tools.find((t: any) => t.name === toolCall.name);
        if (!tool) {
          throw new Error(`Tool not found: ${toolCall.name}`);
        }

        // Execute the tool
        const toolResult = await tool.invoke(toolCall.args);
        console.log(`  ✅ Tool ${toolCall.name} completed`);

        // Add tool result to messages
        currentMessages.push({
          role: 'tool',
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      } catch (error) {
        console.error(`  ❌ Tool ${toolCall.name} failed:`, error);

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
  return 'I apologize, but I reached the maximum number of processing steps. Please try again or simplify your request.';
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
    const { error } = await supabase.from('agent_chat_conversations').insert({
      user_id: userId,
      agent_id: agentId,
      messages: messages,
      response: response,
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
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get request body
    const { messages, agentId = 'search', model: requestedModel, images, pdfFile } = await req.json();

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

      // Replace the last message with the upload instruction
      anthropicMessages[anthropicMessages.length - 1] = {
        role: 'user',
        content: uploadInstruction,
      };

      userInput = uploadInstruction;
    }

    // Execute agent
    const result = await executeAgent(agentId, workspaceId, user.id, userInput, anthropicMessages, pdfFile);

    // Save conversation
    await saveConversation(user.id, agentId, messages, result);

    // Return response
    return new Response(
      JSON.stringify({
        text: result,
        agentId,
        model: 'claude-sonnet-4-20250514',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
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

