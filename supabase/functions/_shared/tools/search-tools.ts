/**
 * Search Tools: material_search, visual_search, knowledge_base_search
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * LangChain Tool: Material Search using MIVAA API
 */
export const createSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, limit = 10 }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        // Correct endpoint: /api/rag/search with strategy as query param
        // ALWAYS use multi_vector strategy for best accuracy
        const strategy = 'multi_vector';
        const url = new URL(`${MIVAA_GATEWAY_URL}/api/rag/search`);
        url.searchParams.set('strategy', strategy);

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
 * LangChain Tool: Visual Search using MIVAA API
 * Sends user-attached images to MIVAA's image similarity endpoint (CLIP/SigLIP embeddings)
 * Only created when images are actually attached to the request
 */
export const createVisualSearchTool = (workspaceId: string, images: string[]) => {
  return tool(
    async ({ query }) => {
      try {
        // Use the first attached image
        const imageDataUrl = images[0];
        if (!imageDataUrl) {
          return JSON.stringify({ error: 'No image provided by user' });
        }

        // Strip data URL prefix to get raw base64
        const base64Data = imageDataUrl.split(',')[1];
        if (!base64Data) {
          return JSON.stringify({ error: 'Invalid image data format' });
        }

        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
        const url = new URL(`${MIVAA_GATEWAY_URL}/api/rag/search`);
        url.searchParams.set('strategy', 'image');

        const startTime = Date.now();

        const TIMEOUT_MS = 300000; // 5 minutes
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(url.toString(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: query || '',
              workspace_id: workspaceId,
              image_base64: base64Data,
              top_k: 10,
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ Visual search API responded in ${elapsed}ms`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Visual search API error: ${response.status} - ${errorText}`);
            throw new Error(`Visual search API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();
          return JSON.stringify(data);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({ error: 'Visual search timeout', timeout: true });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('Visual search error:', error);
        return JSON.stringify({
          error: error instanceof Error ? error.message : 'Visual search failed',
        });
      }
    },
    {
      name: 'visual_search',
      description: 'Search for visually similar materials using the user\'s uploaded image. Uses CLIP/SigLIP embeddings to find products matching the visual appearance, color, texture, and style of the image. Use this when the user attaches an image and wants to find similar materials, match colors, or identify products.',
      schema: z.object({
        query: z.string().default('').describe('Optional text description to refine visual search results'),
      }),
    }
  );
};

/**
 * LangChain Tool: Knowledge Base Search
 * Searches Knowledge Base for articles, guides, and documentation
 * Returns relevant articles if found, helping the agent answer user questions
 */
export const createKnowledgeBaseSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, searchTypes = ['chunks', 'products', 'kb_docs'], topK = 5 }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

        const startTime = Date.now();

        // Add timeout to prevent edge function from hanging
        const TIMEOUT_MS = 60000; // 1 minute for KB search

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        try {
          const response = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search/knowledge-base`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              workspace_id: workspaceId,
              search_types: searchTypes,
              top_k: topK,
              similarity_threshold: 0.6, // Lower threshold to catch more relevant articles
              caller: 'agent',
            }),
            signal: controller.signal,
          });

          clearTimeout(timeoutId);
          const elapsed = Date.now() - startTime;
          console.log(`⏱️ Knowledge Base API responded in ${elapsed}ms`);

          if (!response.ok) {
            const errorText = await response.text();
            console.error(`❌ Knowledge Base API error: ${response.status} - ${errorText}`);
            throw new Error(`Knowledge Base API error: ${response.status} ${response.statusText}`);
          }

          const data = await response.json();

          // Format results for the agent
          const results = {
            found: false,
            totalResults: data.total_results || 0,
            articles: [] as any[],
            products: [] as any[],
          };

          // Process chunks as articles/documentation
          if (data.chunks && data.chunks.length > 0) {
            results.found = true;
            results.articles = data.chunks.map((chunk: any) => ({
              content: chunk.content || chunk.text,
              documentTitle: chunk.document_title || chunk.metadata?.title || 'Knowledge Base Article',
              category: chunk.category || chunk.metadata?.category || 'general',
              relevanceScore: chunk.relevance_score || chunk.similarity_score || 0,
            }));
          }

          // Include product information if relevant
          if (data.products && data.products.length > 0) {
            results.found = true;
            results.products = data.products.map((product: any) => ({
              name: product.name,
              description: product.description,
              metadata: product.metadata,
              relevanceScore: product.relevance_score || 0,
            }));
          }


          // Track agent mentions for returned KB docs (fire-and-forget)
          if (results.articles.length > 0) {
            const titles = [...new Set(results.articles.map((a: any) => a.documentTitle).filter(Boolean))];
            if (titles.length > 0) {
              supabase
                .from('kb_docs')
                .select('id')
                .in('title', titles)
                .eq('workspace_id', workspaceId)
                .then(({ data: matchedDocs }) => {
                  if (matchedDocs && matchedDocs.length > 0) {
                    matchedDocs.forEach(({ id }: { id: string }) => {
                      supabase.rpc('increment_kb_doc_agent_mention', { doc_id: id }).catch(() => {});
                    });
                  }
                })
                .catch(() => {});
            }
          }

          return JSON.stringify(results);
        } catch (fetchError) {
          clearTimeout(timeoutId);

          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            const elapsed = Date.now() - startTime;
            console.error(`⏱️ Knowledge Base API timeout after ${elapsed}ms`);
            return JSON.stringify({
              found: false,
              error: 'Knowledge Base search timeout. Proceeding with general knowledge.',
              timeout: true,
            });
          }
          throw fetchError;
        }
      } catch (error) {
        console.error('Knowledge Base search error:', error);
        return JSON.stringify({
          found: false,
          error: error instanceof Error ? error.message : 'Knowledge Base search failed',
        });
      }
    },
    {
      name: 'knowledge_base_search',
      description: 'Search the Knowledge Base for articles, guides, installation instructions, and documentation. Use this FIRST when users ask how-to questions, troubleshooting, or general information queries. If articles are found, use them to provide accurate answers. If no articles are found, proceed to answer using your general knowledge.',
      schema: z.object({
        query: z.string().describe('Search query - describe what information the user is looking for'),
        searchTypes: z.array(z.string()).default(['chunks', 'products']).describe('Types to search: chunks (articles/text), products'),
        topK: z.number().default(5).describe('Maximum number of results to return'),
      }),
    }
  );
};
