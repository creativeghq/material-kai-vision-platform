/**
 * Database Tools: createCheckJobStatusTool, createQueryDatabaseTool,
 * createGetStageDetailsTool, createGetRelationshipCountsTool,
 * createGetDocumentEntitiesTool, createGetMetadataExtractionTool
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * LangChain Tool: Check Job Status
 */
export const createCheckJobStatusTool = () => {
  return tool(
    async ({ jobId }) => {
      try {

        const MIVAA_API_URL = Deno.env.get('MIVAA_GATEWAY_URL') || Deno.env.get('MIVAA_SERVICE_URL') || 'https://v1api.materialshub.gr';
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

        try {
          const { data: job, error: dbError } = await supabase
            .from('background_jobs')
            .select('*')
            .eq('id', jobId)
            .single();

          if (dbError || !job) {
            throw new Error('Job not found in database');
          }


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
export const createQueryDatabaseTool = () => {
  return tool(
    async ({ documentId, queryType, documentName }) => {
      try {

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
            tableName = 'document_vectors';
            query = supabase
              .from('document_vectors')
              .select('id, embedding_type, metadata, created_at')
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
 * LangChain Tool: Get Stage Details
 * Get detailed metrics for current processing stage
 */
export const createGetStageDetailsTool = () => {
  return tool(
    async ({ jobId }) => {
      try {

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
export const createGetRelationshipCountsTool = () => {
  return tool(
    async ({ documentId }) => {
      try {

        // Query all relationship tables
        // ✅ UPDATED: Use image_product_associations table
        const [chunkProductRels, productImageRels, chunkImageRels, productDocRels] = await Promise.all([
          supabase.from('chunk_product_relationships').select('id', { count: 'exact', head: true }).eq('chunk_id', documentId),
          supabase.from('image_product_associations').select('id', { count: 'exact', head: true }),
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
export const createGetDocumentEntitiesTool = () => {
  return tool(
    async ({ documentId }) => {
      try {

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
export const createGetMetadataExtractionTool = () => {
  return tool(
    async ({ documentId }) => {
      try {

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
