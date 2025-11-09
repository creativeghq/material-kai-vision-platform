/**
 * Agent Chat - Mastra Multi-Agent System
 * Supabase Edge Function for AI agent orchestration
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// Mastra imports (ESM compatible)
import { Agent } from 'https://esm.sh/@mastra/core@0.24.0';
import { z } from 'https://esm.sh/zod@3.22.4';

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!;
const mivaaGatewayUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Search Agent Tool - Material Search
 */
const searchTool = {
  id: 'material-search',
  description: 'Search for materials, products, and technical information using RAG',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    strategy: z
      .enum(['semantic', 'visual', 'multi_vector', 'hybrid', 'material', 'keyword', 'all'])
      .default('hybrid')
      .describe('Search strategy'),
    limit: z.number().default(10).describe('Maximum results'),
  }),
  execute: async ({ context }: { context: any }) => {
    const { query, strategy, limit } = context;

    try {
      // Call MIVAA API for search
      const response = await fetch(`${mivaaGatewayUrl}/api/rag/search?strategy=${strategy}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          top_k: limit,
          workspace_id: context.workspace_id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();

      return {
        success: true,
        results: data.results || [],
        total: data.total_results || 0,
        strategy: data.search_type || strategy,
      };
    } catch (error) {
      console.error('Search tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Search failed',
      };
    }
  },
};

/**
 * Search Agent - Public agent for material search
 */
const searchAgent = new Agent({
  name: 'search-agent',
  description: 'Material search and discovery agent',
  instructions: `You are the Search Agent for the Material Kai Vision Platform.

Your role is to help users find materials, products, and technical information from our knowledge base.

**Capabilities:**
- Semantic search using RAG (Retrieval Augmented Generation)
- Material property-based search
- Visual similarity search using images
- Hybrid search combining multiple strategies

**Guidelines:**
- Always provide relevant, accurate information from the knowledge base
- If you're unsure, use the 'hybrid' search strategy for comprehensive results
- Explain material properties and specifications clearly
- Suggest related materials when appropriate

**Response Format:**
- Start with a brief summary of findings
- List materials with key properties
- Provide technical specifications when available
- Suggest next steps or related searches`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Routing Agent - Routes queries to appropriate specialized agent
 */
const routingAgent = new Agent({
  name: 'routing-agent',
  description: 'Routes user queries to the appropriate specialized agent',
  instructions: `You are the Routing Agent for the Material Kai Vision Platform.

Your role is to analyze user queries and route them to the appropriate specialized agent.

**Available Agents:**
1. **Search Agent** - Material search and discovery (ALWAYS AVAILABLE)
2. **Research Agent** - Deep research and analysis (ADMIN ONLY - NOT YET IMPLEMENTED)
3. **Analytics Agent** - Data analysis and insights (ADMIN ONLY - NOT YET IMPLEMENTED)
4. **Business Agent** - Business intelligence (ADMIN ONLY - NOT YET IMPLEMENTED)
5. **Product Agent** - Product management (ADMIN ONLY - NOT YET IMPLEMENTED)
6. **Admin Agent** - System administration (OWNER ONLY - NOT YET IMPLEMENTED)

**Routing Rules:**
- For material search queries → Use Search Agent
- For all other queries → Inform user that only Search Agent is currently available

**Response Format:**
- Clearly indicate which agent is handling the query
- Provide helpful responses using the Search Agent
- For unavailable agents, politely inform the user they're coming soon`,

  model: 'anthropic/claude-sonnet-4-20250514',
  agents: {
    searchAgent,
  },
});

/**
 * Get user's workspace ID
 */
async function getUserWorkspace(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching workspace:', error);
    return null;
  }

  return data.workspace_id;
}

/**
 * Main handler
 */
serve(async (req) => {
  // Handle CORS preflight - MUST be first!
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get workspace ID
    const workspaceId = await getUserWorkspace(user.id);
    if (!workspaceId) {
      return new Response(JSON.stringify({ error: 'No workspace found for user' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    const { messages, agentId = 'search', model = 'claude-sonnet-4' } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'Invalid messages format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the last user message
    const userMessage = messages[messages.length - 1]?.content || '';

    // Try to use Mastra routing agent, fallback to simple response
    let responseText = '';
    try {
      const result = await routingAgent.generate(userMessage, {
        context: {
          userId: user.id,
          workspaceId,
          agentId,
          model,
        },
      });
      responseText = result.text;
    } catch (mastraError) {
      console.error('Mastra agent error, using fallback:', mastraError);
      // Fallback: Simple response
      responseText = `I received your message: "${userMessage}". The agent system is currently being configured. Please try again shortly.`;
    }

    // Return response
    return new Response(
      JSON.stringify({
        success: true,
        text: responseText,
        agentId: 'routing',
        model,
        timestamp: new Date().toISOString(),
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('Agent chat error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

