/**
 * Agent Chat - LangChain.js + LangGraph.js Multi-Agent System
 * 
 * Replaces Mastra framework with LangChain.js for Deno Edge Runtime compatibility
 * 
 * Features:
 * - 8 specialized agents with RBAC
 * - LangGraph for agent orchestration
 * - Direct Anthropic API integration
 * - MIVAA Python API integration for search
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

// Use Anthropic SDK directly (avoids LangChain's LangSmith dependency issues in Deno)
import Anthropic from 'npm:@anthropic-ai/sdk@0.32.1';
import { z } from 'https://esm.sh/zod@3.24.1';

// Get API keys from Deno environment
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

console.log('🔑 API Keys loaded:', {
  anthropicExists: !!ANTHROPIC_API_KEY,
  openaiExists: !!OPENAI_API_KEY,
});

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Anthropic client will be initialized lazily on first request
let anthropic: Anthropic | null = null;

function getAnthropicClient(): Anthropic {
  if (!anthropic) {
    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY environment variable is not set in Supabase Edge Functions. Please add it in Supabase Dashboard > Edge Functions > Secrets.');
    }

    anthropic = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    console.log('✅ Anthropic SDK client initialized');
  }
  return anthropic;
}

/**
 * Anthropic Tool: Material Search using MIVAA API
 */
const createSearchTool = (workspaceId: string): Anthropic.Tool => {
  return {
    name: 'material_search',
    description: 'Search for materials, products, and technical information using RAG. Use this for any material-related queries.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        strategy: {
          type: 'string',
          enum: ['semantic', 'visual', 'multi_vector', 'hybrid', 'material', 'keyword', 'all'],
          default: 'all',
          description: 'Search strategy',
        },
        limit: {
          type: 'number',
          default: 10,
          description: 'Maximum results',
        },
      },
      required: ['query'],
    },
  };
};

/**
 * Execute material search tool
 */
const executeSearchTool = async (workspaceId: string, input: any) => {
  const { query, strategy = 'all', limit = 10 } = input;
  try {
    const response = await fetch(`${MIVAA_GATEWAY_URL}/api/rag/search?strategy=${strategy}`, {
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

    return JSON.stringify({
      success: true,
      results: data.results || [],
      total: data.total_results || 0,
      strategy: data.search_type || strategy,
    });
  } catch (error) {
    console.error('Search tool error:', error);
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
};

/**
 * Anthropic Tool: Image Analysis using MIVAA API
 */
const createImageAnalysisTool = (workspaceId: string): Anthropic.Tool => {
  return {
    name: 'image_analysis',
    description: 'Analyze material images to identify products, materials, and properties',
    input_schema: {
      type: 'object',
      properties: {
        imageUrl: {
          type: 'string',
          description: 'Image URL or base64 data',
        },
        analysisType: {
          type: 'string',
          enum: ['material_recognition', 'visual_search', 'product_identification'],
          default: 'material_recognition',
          description: 'Type of image analysis',
        },
      },
      required: ['imageUrl'],
    },
  };
};

/**
 * Execute image analysis tool
 */
const executeImageAnalysisTool = async (workspaceId: string, input: any) => {
  const { imageUrl, analysisType = 'material_recognition' } = input;
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
};

/**
 * Agent Configurations with RBAC
 */
interface AgentConfig {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
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

**Capabilities:**
- Semantic search using RAG (Retrieval Augmented Generation)
- Material property-based search
- Visual similarity search using images
- Hybrid search combining multiple strategies
- Image analysis for material recognition and product identification

**Guidelines:**
- Always use the material_search tool for text-based queries
- Use image_analysis tool when users provide images or ask about visual identification
- Provide clear, concise answers with relevant material details
- Include source information when available
- If no results found, suggest alternative search strategies`,
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
    tools: ['material_search'],
    systemPrompt: `You are the Demo Agent for the Material Kai Vision Platform.

Your role is to showcase platform capabilities with realistic examples.

**Capabilities:**
- Platform feature demonstrations
- Use case examples
- Interactive tutorials
- Sample data generation

**Guidelines:**
- Use engaging, realistic examples
- Highlight key platform features
- Provide step-by-step guidance
- Make demonstrations interactive`,
  },
};

/**
 * Execute agent with tools using Anthropic SDK
 */
async function executeAgent(
  agentId: string,
  workspaceId: string,
  userInput: string,
  chatHistory: Anthropic.MessageParam[]
) {
  const config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Create tools based on agent configuration
  const tools: Anthropic.Tool[] = [];
  if (config.tools.includes('material_search')) {
    tools.push(createSearchTool(workspaceId));
  }
  if (config.tools.includes('image_analysis')) {
    tools.push(createImageAnalysisTool(workspaceId));
  }

  // Get Anthropic client
  const client = getAnthropicClient();

  // Build messages (Anthropic format)
  const messages: Anthropic.MessageParam[] = [
    ...chatHistory,
    {
      role: 'user',
      content: userInput,
    },
  ];

  // Create message with tools
  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    temperature: 1,
    system: config.systemPrompt,
    messages,
    tools: tools.length > 0 ? tools : undefined,
  });

  // Check if model wants to use tools
  if (response.stop_reason === 'tool_use') {
    const toolUseBlocks = response.content.filter((block) => block.type === 'tool_use');

    if (toolUseBlocks.length > 0) {
      // Execute tool calls
      const toolResults: Anthropic.MessageParam[] = [];

      for (const block of toolUseBlocks) {
        if (block.type === 'tool_use') {
          try {
            let result: string;

            // Execute the appropriate tool
            if (block.name === 'material_search') {
              result = await executeSearchTool(workspaceId, block.input);
            } else if (block.name === 'image_analysis') {
              result = await executeImageAnalysisTool(workspaceId, block.input);
            } else {
              result = JSON.stringify({ error: 'Unknown tool' });
            }

            toolResults.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: result,
                },
              ],
            });
          } catch (error) {
            console.error(`Tool ${block.name} error:`, error);
            toolResults.push({
              role: 'user',
              content: [
                {
                  type: 'tool_result',
                  tool_use_id: block.id,
                  content: JSON.stringify({
                    error: error instanceof Error ? error.message : 'Tool execution failed',
                  }),
                  is_error: true,
                },
              ],
            });
          }
        }
      }

      // Get final response with tool results
      const finalResponse = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 1,
        system: config.systemPrompt,
        messages: [
          ...messages,
          {
            role: 'assistant',
            content: response.content,
          },
          ...toolResults,
        ],
      });

      // Extract text content from response
      const textContent = finalResponse.content
        .filter((block) => block.type === 'text')
        .map((block) => block.type === 'text' ? block.text : '')
        .join('\n');

      return textContent;
    }
  }

  // No tools needed, return direct response
  const textContent = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.type === 'text' ? block.text : '')
    .join('\n');

  return textContent;
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
    const { messages, agentId = 'search', model: requestedModel, images } = await req.json();

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
    const userInput = lastMessage?.content || '';

    // Convert messages to Anthropic format (chat history without last message)
    const chatHistory: Anthropic.MessageParam[] = messages.slice(0, -1).map((msg: any) => ({
      role: msg.role === 'user' ? 'user' : 'assistant',
      content: msg.content,
    }));

    // Execute agent
    const result = await executeAgent(agentId, workspaceId, userInput, chatHistory);

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
    console.error('Agent chat error:', error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Internal server error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});

