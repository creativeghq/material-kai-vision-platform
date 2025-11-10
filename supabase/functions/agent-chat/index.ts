/**
 * Agent Chat - Mastra Multi-Agent System
 * Supabase Edge Function for AI agent orchestration
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// Mastra imports - using npm: specifier for Deno
import { Agent } from 'npm:@mastra/core/agent';
import { createTool } from 'npm:@mastra/core/tools';
import { z } from 'npm:zod';

// Environment variables
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const mivaaGatewayUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

// Set environment variables for Mastra (it expects process.env format)
// Deno doesn't have process.env by default, but Mastra needs it
try {
  if (typeof (globalThis as any).process === 'undefined') {
    (globalThis as any).process = {};
  }
  if (typeof (globalThis as any).process.env === 'undefined') {
    (globalThis as any).process.env = {};
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  const openaiKey = Deno.env.get('OPENAI_API_KEY');

  console.log('🔑 Environment check:', {
    anthropicKeyExists: !!anthropicKey,
    anthropicKeyLength: anthropicKey?.length,
    openaiKeyExists: !!openaiKey,
    openaiKeyLength: openaiKey?.length,
  });

  (globalThis as any).process.env.ANTHROPIC_API_KEY = anthropicKey;
  (globalThis as any).process.env.OPENAI_API_KEY = openaiKey;

  console.log('✅ process.env setup complete:', {
    processEnvAnthropicExists: !!(globalThis as any).process.env.ANTHROPIC_API_KEY,
    processEnvOpenaiExists: !!(globalThis as any).process.env.OPENAI_API_KEY,
  });
} catch (e) {
  console.error('❌ Error setting up process.env:', e);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

/**
 * Search Tool - Material Search using MIVAA API
 */
const searchTool = createTool({
  id: 'material-search',
  description: 'Search for materials, products, and technical information using RAG',
  inputSchema: z.object({
    query: z.string().describe('Search query'),
    strategy: z
      .enum(['semantic', 'visual', 'multi_vector', 'hybrid', 'material', 'keyword', 'all'])
      .default('all')
      .describe('Search strategy'),
    limit: z.number().default(10).describe('Maximum results'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    results: z.array(z.any()).optional(),
    total: z.number().optional(),
    strategy: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { query, strategy, limit } = context;
    const workspaceId = runtimeContext?.get('workspaceId');

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
          workspace_id: workspaceId,
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
});

/**
 * Image Analysis Tool - Analyze images using MIVAA API
 */
const imageAnalysisTool = createTool({
  id: 'image-analysis',
  description: 'Analyze material images to identify products, materials, and properties',
  inputSchema: z.object({
    imageUrl: z.string().describe('Image URL or base64 data'),
    analysisType: z
      .enum(['material_recognition', 'visual_search', 'product_identification'])
      .default('material_recognition')
      .describe('Type of image analysis'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    analysis: z.any().optional(),
    materials: z.array(z.any()).optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context, runtimeContext }) => {
    const { imageUrl, analysisType } = context;
    const workspaceId = runtimeContext?.get('workspaceId');

    try {
      // Call MIVAA API for image analysis
      const response = await fetch(`${mivaaGatewayUrl}/api/together-ai/analyze-image`, {
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

      return {
        success: true,
        analysis: data.analysis || {},
        materials: data.materials || [],
      };
    } catch (error) {
      console.error('Image analysis tool error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Image analysis failed',
      };
    }
  },
});

/**
 * Search Agent - Public agent for material search
 */
const searchAgent = new Agent({
  name: 'search-agent',
  description: 'Material search and discovery agent with multimodal capabilities',
  instructions: `You are the Search Agent for the Material Kai Vision Platform.

Your role is to help users find materials, products, and technical information from our knowledge base.

**Capabilities:**
- Semantic search using RAG (Retrieval Augmented Generation)
- Material property-based search
- Visual similarity search using images
- Hybrid search combining multiple strategies
- Image analysis for material recognition and product identification

**Multimodal Routing:**
- For TEXT queries → Use material-search tool with appropriate strategy
- For IMAGE queries → Use image-analysis tool first, then material-search for related items
- For VOICE queries (transcribed to text) → Treat as text queries

**Guidelines:**
- Always provide relevant, accurate information from the knowledge base
- If you're unsure, use the 'hybrid' search strategy for comprehensive results
- Explain material properties and specifications clearly
- Suggest related materials when appropriate
- When analyzing images, describe what you see and identify materials

**Response Format:**
- Start with a brief summary of findings
- List materials with key properties
- Provide technical specifications when available
- Suggest next steps or related searches`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
    imageAnalysis: imageAnalysisTool,
  },
});

/**
 * Research Agent - Deep research and analysis (ADMIN ONLY)
 */
const researchAgent = new Agent({
  name: 'research-agent',
  description: 'Deep research and competitive analysis agent',
  instructions: `You are the Research Agent for the Material Kai Vision Platform.

Your role is to conduct deep research, competitive analysis, and market intelligence.

**Capabilities:**
- Deep dive into material properties and applications
- Competitive product analysis
- Market trends and insights
- Technical specification comparisons
- Research report generation

**Guidelines:**
- Provide comprehensive, well-researched responses
- Cite sources and data when available
- Compare multiple options objectively
- Identify trends and patterns
- Suggest areas for further investigation`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Analytics Agent - Data analysis and insights (ADMIN ONLY)
 */
const analyticsAgent = new Agent({
  name: 'analytics-agent',
  description: 'Data analysis and business intelligence agent',
  instructions: `You are the Analytics Agent for the Material Kai Vision Platform.

Your role is to analyze data, generate insights, and provide business intelligence.

**Capabilities:**
- Usage pattern analysis
- Performance metrics tracking
- Trend identification
- Data visualization recommendations
- Predictive insights

**Guidelines:**
- Focus on actionable insights
- Identify key metrics and KPIs
- Highlight trends and anomalies
- Provide data-driven recommendations
- Explain complex data in simple terms`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Business Agent - Business intelligence (ADMIN ONLY)
 */
const businessAgent = new Agent({
  name: 'business-agent',
  description: 'Business strategy and intelligence agent',
  instructions: `You are the Business Agent for the Material Kai Vision Platform.

Your role is to provide business intelligence, strategy insights, and market analysis.

**Capabilities:**
- Business strategy recommendations
- Market opportunity analysis
- ROI and cost-benefit analysis
- Competitive positioning
- Growth strategy insights

**Guidelines:**
- Focus on business value and ROI
- Provide strategic recommendations
- Consider market dynamics
- Identify opportunities and risks
- Support decision-making with data`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Product Agent - Product management (ADMIN ONLY)
 */
const productAgent = new Agent({
  name: 'product-agent',
  description: 'Product management and development agent',
  instructions: `You are the Product Agent for the Material Kai Vision Platform.

Your role is to support product management, feature planning, and user experience optimization.

**Capabilities:**
- Feature prioritization recommendations
- User feedback analysis
- Product roadmap insights
- UX/UI improvement suggestions
- Product-market fit analysis

**Guidelines:**
- Focus on user value and experience
- Balance features with usability
- Consider technical feasibility
- Prioritize based on impact
- Support data-driven product decisions`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Admin Agent - System administration (OWNER ONLY)
 */
const adminAgent = new Agent({
  name: 'admin-agent',
  description: 'System administration and platform management agent',
  instructions: `You are the Admin Agent for the Material Kai Vision Platform.

Your role is to support system administration, platform management, and technical operations.

**Capabilities:**
- System health monitoring
- Performance optimization recommendations
- Security and compliance guidance
- User management insights
- Platform configuration support

**Guidelines:**
- Prioritize system stability and security
- Provide clear technical guidance
- Consider scalability and performance
- Support operational excellence
- Ensure compliance and best practices`,

  model: 'anthropic/claude-sonnet-4-20250514',
  tools: {
    materialSearch: searchTool,
  },
});

/**
 * Demo Tool - Returns demo data based on query
 */
const demoTool = createTool({
  id: 'demo-showcase',
  description: 'Return demo data for platform showcase',
  inputSchema: z.object({
    query: z.string().describe('The demo query or command'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    type: z.string().optional(),
    data: z.any().optional(),
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const query = context.query.toLowerCase();

    // Detect demo command and return appropriate response
    if (query.includes('cement') || query.includes('tile') || query.includes('grey')) {
      return {
        success: true,
        type: 'demo_command',
        data: { command: 'cement_tiles' },
        message: 'Showing 5 cement-based tiles in grey color. These are realistic demo products showcasing the platform\'s product display capabilities.',
      };
    }

    if (query.includes('green') && query.includes('egger')) {
      return {
        success: true,
        type: 'demo_command',
        data: { command: 'green_wood' },
        message: 'Showing 5 Egger wood materials in green color. These demonstrate various wood types including veneer, laminate, solid wood, plywood, and MDF.',
      };
    }

    if (query.includes('heatpump') || query.includes('heat pump')) {
      return {
        success: true,
        type: 'demo_command',
        data: { command: 'heat_pumps' },
        message: 'Showing heat pump comparison table with 4 EcoHeat models. This demonstrates the platform\'s ability to display technical specifications in table format.',
      };
    }

    if (query.includes('design') && query.includes('interior')) {
      return {
        success: true,
        type: 'demo_command',
        data: { command: '3d_design' },
        message: 'Showing a modern living room 3D design with 6 materials. This showcases how the platform can display complete interior designs with material specifications.',
      };
    }

    return {
      success: false,
      message: 'Available demo commands:\n1. "Return for me Cement Based tiles color grey"\n2. "I want Green Egger"\n3. "I want heatpumps"\n4. "Design the interior of a home"',
    };
  },
});

/**
 * Demo Agent - Platform showcase with realistic demo data (ADMIN ONLY)
 */
const demoAgent = new Agent({
  name: 'demo-agent',
  description: 'Showcase platform capabilities with realistic demo data',
  instructions: `You are the Demo Agent for the Material Kai Vision Platform.

When a user asks for demo data, analyze their request and respond with this EXACT format:

DEMO_DATA: {type: 'demo_command', data: {command: 'COMMAND_HERE'}}

Then add your explanation.

**Command Detection Rules:**
- If message contains "cement" OR "tile" OR "grey" → command: 'cement_tiles'
- If message contains "green" AND "egger" → command: 'green_wood'
- If message contains "heatpump" OR "heat pump" → command: 'heat_pumps'
- If message contains "design" AND "interior" → command: '3d_design'

**Example:**
User: "Return for me Cement Based tiles color grey"
You: "DEMO_DATA: {type: 'demo_command', data: {command: 'cement_tiles'}}

I'm showing you 5 cement-based tiles in grey color with full specifications and pricing."`,

  model: {
    id: 'anthropic/claude-sonnet-4-20250514',
    apiKey: Deno.env.get('ANTHROPIC_API_KEY')!,
  },
});

/**
 * Routing Agent - Routes queries to appropriate specialized agent with multimodal support
 */
const routingAgent = new Agent({
  name: 'routing-agent',
  description: 'Routes user queries to the appropriate specialized agent with multimodal input support',
  instructions: `You are the Routing Agent for the Material Kai Vision Platform.

Your role is to analyze user queries and route them to the appropriate specialized agent based on input type and content.

**Available Agents:**
1. **Search Agent** - Material search and discovery with multimodal capabilities (ALWAYS AVAILABLE)
2. **Research Agent** - Deep research and competitive analysis (ADMIN ONLY)
3. **Analytics Agent** - Data analysis and business intelligence (ADMIN ONLY)
4. **Business Agent** - Business strategy and market intelligence (ADMIN ONLY)
5. **Product Agent** - Product management and UX optimization (ADMIN ONLY)
6. **Admin Agent** - System administration and platform management (OWNER ONLY)
7. **Demo Agent** - Platform showcase with realistic demo data (ADMIN ONLY)

**Multimodal Routing Strategy:**
- **TEXT-ONLY queries** → Route to Search Agent with semantic/hybrid search
- **IMAGE queries** → Route to Search Agent with image analysis + visual search
- **VOICE queries** (transcribed to text) → Route to Search Agent with semantic search
- **TEXT + IMAGE queries** → Route to Search Agent with multimodal analysis

**Input Type Detection:**
- Check if images are attached → Use image analysis
- Check if query mentions visual properties → Consider visual search
- Check if query is transcribed from voice → Use semantic search
- Default → Use hybrid search for comprehensive results

**Routing Rules:**
- **Material search queries** → Search Agent
- **Research/analysis queries** → Research Agent (admin only)
- **Data/metrics queries** → Analytics Agent (admin only)
- **Business/strategy queries** → Business Agent (admin only)
- **Product/feature queries** → Product Agent (admin only)
- **System/admin queries** → Admin Agent (owner only)
- **Demo/showcase queries** → Demo Agent (admin only)

**RBAC Enforcement:**
- Check user role before routing to admin-only agents
- If user lacks permission, politely inform them and offer Search Agent alternative
- Always allow access to Search Agent

**Response Format:**
- Clearly indicate which agent is handling the query
- Provide helpful, contextual responses
- For permission-denied cases, explain role requirements`,

  model: 'anthropic/claude-sonnet-4-20250514',
  agents: {
    searchAgent,
    researchAgent,
    analyticsAgent,
    businessAgent,
    productAgent,
    adminAgent,
    demoAgent,
  },
});

/**
 * Get user's workspace ID and role
 */
async function getUserWorkspaceAndRole(
  userId: string,
): Promise<{ workspaceId: string; role: string } | null> {
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    console.error('Error fetching workspace:', error);
    return null;
  }

  return {
    workspaceId: data.workspace_id,
    role: data.role,
  };
}

/**
 * Check if user has permission to use agent
 */
function hasAgentPermission(agentId: string, userRole: string): boolean {
  // Role hierarchy: viewer < member < admin < owner
  const roleHierarchy: Record<string, number> = {
    viewer: 0,
    member: 1,
    admin: 2,
    owner: 3,
  };

  const userRoleLevel = roleHierarchy[userRole] || 0;

  // Agent permission requirements
  const agentPermissions: Record<string, number> = {
    search: 1, // member and above
    research: 2, // admin and above
    analytics: 2, // admin and above
    business: 2, // admin and above
    product: 2, // admin and above
    admin: 3, // owner only
    demo: 2, // admin and above
  };

  const requiredLevel = agentPermissions[agentId] || 1;
  return userRoleLevel >= requiredLevel;
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

    // Get workspace ID and user role
    const workspaceData = await getUserWorkspaceAndRole(user.id);
    if (!workspaceData) {
      return new Response(JSON.stringify({ error: 'No workspace found for user' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { workspaceId, role: userRole } = workspaceData;

    // Parse request body
    const body = await req.json();
    console.log('Request body:', JSON.stringify(body, null, 2));

    const { messages, agentId = 'search', model = 'claude-sonnet-4', images = [] } = body;

    if (!messages || !Array.isArray(messages)) {
      console.error('Invalid messages:', { messages, type: typeof messages, isArray: Array.isArray(messages) });
      return new Response(JSON.stringify({
        error: 'Invalid messages format',
        received: { messages: messages ? 'exists' : 'missing', type: typeof messages }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check RBAC permissions
    if (!hasAgentPermission(agentId, userRole)) {
      return new Response(
        JSON.stringify({
          error: 'Permission denied',
          message: `You need ${agentId === 'admin' ? 'owner' : 'admin'} role to use the ${agentId} agent.`,
          requiredRole: agentId === 'admin' ? 'owner' : 'admin',
          currentRole: userRole,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // Get the last user message
    const userMessage = messages[messages.length - 1]?.content || '';

    // Detect input type for multimodal routing
    const hasImages = images && images.length > 0;
    const inputType = hasImages ? 'multimodal' : 'text';

    // Create runtime context for Mastra
    const { RuntimeContext } = await import('npm:@mastra/core/runtime-context');
    const runtimeContext = new RuntimeContext();
    runtimeContext.set('userId', user.id);
    runtimeContext.set('workspaceId', workspaceId);
    runtimeContext.set('userRole', userRole);
    runtimeContext.set('agentId', agentId);
    runtimeContext.set('model', model);
    runtimeContext.set('inputType', inputType);
    runtimeContext.set('images', images);

    // Select the appropriate agent based on agentId
    let responseText = '';
    let selectedAgentInstance = routingAgent;

    // Map agentId to agent instance
    const agentMap: Record<string, typeof routingAgent> = {
      search: searchAgent,
      research: researchAgent,
      analytics: analyticsAgent,
      business: businessAgent,
      product: productAgent,
      admin: adminAgent,
      demo: demoAgent,
    };

    // Use specific agent if requested, otherwise use routing agent
    if (agentId && agentMap[agentId]) {
      selectedAgentInstance = agentMap[agentId];
      console.log(`Using specific agent: ${agentId}`);
    } else {
      console.log('Using routing agent');
    }

    try {
      console.log(`Calling ${agentId || 'routing'} agent with message:`, userMessage);
      console.log('Selected agent instance:', selectedAgentInstance.name);
      console.log('Agent tools:', Object.keys(selectedAgentInstance.tools || {}));

      const result = await selectedAgentInstance.generate(userMessage, {
        runtimeContext,
        maxSteps: 3,
      });

      console.log('Mastra agent result:', {
        text: result.text,
        steps: result.steps?.length,
        toolResults: result.toolResults?.length,
      });
      responseText = result.text;
    } catch (mastraError) {
      console.error('MASTRA ERROR:', mastraError);
      console.error('Error message:', mastraError instanceof Error ? mastraError.message : String(mastraError));
      console.error('Error stack:', mastraError instanceof Error ? mastraError.stack : 'No stack');

      // Return detailed error to frontend
      return new Response(
        JSON.stringify({
          error: {
            message: mastraError instanceof Error ? mastraError.message : String(mastraError),
            stack: mastraError instanceof Error ? mastraError.stack : undefined,
            agentId,
            agentName: selectedAgentInstance.name,
          },
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
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

