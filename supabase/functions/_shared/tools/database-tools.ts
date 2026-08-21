/**
 * Database Tools: createQueryDatabaseTool
 *
 * This file also held five PDF-pipeline diagnostics (checkJobStatus, getStageDetails,
 * getRelationshipCounts, getDocumentEntities, getMetadataExtraction). They were
 * exported and never instantiated — unreachable by any agent since the day they were
 * written — so they were deleted rather than wired up (issue #266). Two reasons not to
 * revive them as-is: each takes a caller-supplied document/job id and queries with the
 * SERVICE-ROLE client with no workspace check (security invariant 1), and
 * getRelationshipCounts filtered chunk_product_relationships.chunk_id by a DOCUMENT id
 * while leaving its other three counts unfiltered — one permanent zero next to three
 * workspace-wide totals, reported as "counts for this document".
 */

// `tool` is typed non-generically ON PURPOSE. Inferring it pulls @langchain/core's generic
// graph into every module that defines a tool, and that instantiation — not file size — is what
// makes agent-chat exceed 12 GB and drop out of the edge typecheck gate entirely (inbox-api is a
// comparable 2.8k lines and checks fine). Erasing it here costs the `tool()` config shape, which
// `npm run tools:manifest` + tests/unit/toolkitCoverage.test.ts already enforce from the AST, and
// buys a compiler over the tool bodies, which nothing had before.
const { tool } = await import('npm:@langchain/core@1.2.9/tools') as {
  tool: <S extends { _output: unknown }>(
    fn: (input: S['_output']) => unknown,
    cfg: { name: string; description: string; schema: S; [k: string]: unknown },
  // Return stays `any`: consumers pass these to bindTools()/registerTools(), and narrowing it
  // to `unknown` would break them. The INPUT is what we want typed, and S gives us that.
  ) => any;
};
const { z } = await import('npm:zod@3.25.76');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
            // `images` does not exist; extracted images live in `document_images`, and the column
            // is `image_url`. The sibling 'embeddings' case below already reads that table — this
            // one was simply missed. (audit #270)
            tableName = 'document_images';
            query = supabase
              .from('document_images')
              .select('id, image_url, metadata, created_at')
              .eq('document_id', documentId)
              .limit(5);
            break;

          case 'embeddings':
            // VECS collections are the source of truth for the vectors themselves;
            // presence-only metadata lives on the source rows. Surface a sample of
            // document_images with embedding flags as "embeddings overview".
            tableName = 'document_images';
            query = supabase
              .from('document_images')
              .select('id, has_slig_embedding, has_understanding_embedding, understanding_embedding_model, created_at')
              .eq('document_id', documentId)
              .or('has_slig_embedding.eq.true,has_understanding_embedding.eq.true')
              .limit(5);
            break;

          default:
            throw new Error(`Unknown query type: ${queryType}`);
        }

        // The 'jobs' case returns inside the switch above, so everything reaching here is a
        // document query. This used to be wrapped in `if (queryType !== 'jobs')`, a condition
        // TypeScript narrows to always-true — dead code the compiler could not see until
        // _shared/tools came under the gate.
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




