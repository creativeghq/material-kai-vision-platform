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
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
// Skills loaded dynamically to avoid boot-time import issues
const { getSkillsForAgent, getSkillContent } = await import('../_shared/skills-loader.ts');

// Import types only to avoid side effects
import type { ChatAnthropic } from '@langchain/anthropic';

// We use dynamic imports for libraries that might access process.env at top-level
// This ensures the polyfill runs BEFORE these modules are loaded
const { createClient } = await import('@supabase/supabase-js');
const { ChatAnthropic } = await import('@langchain/anthropic');
const { tool } = await import('@langchain/core/tools');
const { z } = await import('zod');

// LangGraph imports for StateGraph-based agent orchestration
const { StateGraph, Annotation, END, START } = await import('@langchain/langgraph');
const { ToolNode } = await import('@langchain/langgraph/prebuilt');
const { BaseMessage, HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/**
 * Supported countries for B2B research
 * These are the primary markets for manufacturer discovery
 */
const SUPPORTED_COUNTRIES = [
  // Baltic & Nordic
  { code: 'LT', name: 'Lithuania', language: 'lt' },
  { code: 'LV', name: 'Latvia', language: 'lv' },
  { code: 'EE', name: 'Estonia', language: 'et' },
  { code: 'FI', name: 'Finland', language: 'fi' },
  { code: 'DK', name: 'Denmark', language: 'da' },
  // Central & Eastern Europe
  { code: 'PL', name: 'Poland', language: 'pl' },
  { code: 'CZ', name: 'Czech Republic', language: 'cs' },
  { code: 'SK', name: 'Slovakia', language: 'sk' },
  { code: 'HU', name: 'Hungary', language: 'hu' },
  { code: 'RO', name: 'Romania', language: 'ro' },
  { code: 'BG', name: 'Bulgaria', language: 'bg' },
  { code: 'UA', name: 'Ukraine', language: 'uk' },
  // Balkans
  { code: 'TR', name: 'Turkey', language: 'tr' },
  { code: 'RS', name: 'Serbia', language: 'sr' },
  { code: 'HR', name: 'Croatia', language: 'hr' },
  { code: 'SI', name: 'Slovenia', language: 'sl' },
  { code: 'BA', name: 'Bosnia and Herzegovina', language: 'bs' },
  { code: 'MK', name: 'North Macedonia', language: 'mk' },
  { code: 'AL', name: 'Albania', language: 'sq' },
  // Western & Southern Europe
  { code: 'DE', name: 'Germany', language: 'de' },
  { code: 'NL', name: 'Netherlands', language: 'nl' },
  { code: 'GB', name: 'United Kingdom', language: 'en' },
  { code: 'ES', name: 'Spain', language: 'es' },
  { code: 'IT', name: 'Italy', language: 'it' },
  { code: 'GR', name: 'Greece', language: 'el' },
] as const;

const SUPPORTED_COUNTRY_NAMES = SUPPORTED_COUNTRIES.map(c => c.name);
const SUPPORTED_LANGUAGE_CODES = SUPPORTED_COUNTRIES.map(c => c.language);

/**
 * Supabase-based Checkpointer for LangGraph
 * Persists agent state for resumable conversations
 */
class SupabaseCheckpointer {
  private tableName = 'agent_checkpoints';

  async get(threadId: string): Promise<any | null> {
    try {
      const { data, error } = await supabase
        .from(this.tableName)
        .select('checkpoint_data, created_at')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (error || !data) return null;
      return data.checkpoint_data;
    } catch (error) {
      console.error('Checkpointer get error:', error);
      return null;
    }
  }

  async put(threadId: string, checkpoint: any): Promise<void> {
    try {
      await supabase
        .from(this.tableName)
        .upsert({
          thread_id: threadId,
          checkpoint_data: checkpoint,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'thread_id' });
    } catch (error) {
      console.error('Checkpointer put error:', error);
    }
  }

  async delete(threadId: string): Promise<void> {
    try {
      await supabase
        .from(this.tableName)
        .delete()
        .eq('thread_id', threadId);
    } catch (error) {
      console.error('Checkpointer delete error:', error);
    }
  }
}

/**
 * Long-term Memory System
 * Stores and retrieves important facts from previous conversations
 */
class LongTermMemory {
  private tableName = 'agent_memories';

  /**
   * Store a memory/fact from conversation
   */
  async store(userId: string, workspaceId: string, memory: {
    content: string;
    type: 'preference' | 'fact' | 'context' | 'relationship';
    agentId: string;
    conversationId?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    try {
      await supabase
        .from(this.tableName)
        .insert({
          user_id: userId,
          workspace_id: workspaceId,
          memory_type: memory.type,
          content: memory.content,
          agent_id: memory.agentId,
          conversation_id: memory.conversationId,
          metadata: memory.metadata || {},
          created_at: new Date().toISOString(),
        });
      console.log(`📝 Stored long-term memory: ${memory.type} - ${memory.content.substring(0, 50)}...`);
    } catch (error) {
      console.error('Memory store error:', error);
    }
  }

  /**
   * Retrieve relevant memories for context
   */
  async retrieve(userId: string, workspaceId: string, options?: {
    limit?: number;
    types?: string[];
    agentId?: string;
  }): Promise<any[]> {
    try {
      let query = supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .limit(options?.limit || 20);

      if (options?.types && options.types.length > 0) {
        query = query.in('memory_type', options.types);
      }

      if (options?.agentId) {
        query = query.eq('agent_id', options.agentId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Memory retrieve error:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Memory retrieve error:', error);
      return [];
    }
  }

  /**
   * Format memories as context string for agent
   */
  formatForContext(memories: any[]): string {
    if (!memories || memories.length === 0) return '';

    const grouped = memories.reduce((acc: any, mem: any) => {
      const type = mem.memory_type || 'general';
      if (!acc[type]) acc[type] = [];
      acc[type].push(mem.content);
      return acc;
    }, {});

    let context = '\n## Long-Term Memory Context\n';

    if (grouped.preference && grouped.preference.length > 0) {
      context += '\n### User Preferences:\n';
      grouped.preference.forEach((p: string) => context += `- ${p}\n`);
    }

    if (grouped.fact && grouped.fact.length > 0) {
      context += '\n### Known Facts:\n';
      grouped.fact.forEach((f: string) => context += `- ${f}\n`);
    }

    if (grouped.context && grouped.context.length > 0) {
      context += '\n### Previous Context:\n';
      grouped.context.forEach((c: string) => context += `- ${c}\n`);
    }

    return context;
  }
}

// Initialize memory and checkpointer singletons
const checkpointer = new SupabaseCheckpointer();
const longTermMemory = new LongTermMemory();

/**
 * LangGraph State Annotation
 * Defines the state schema for the agent graph
 */
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<BaseMessage[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  systemPrompt: Annotation<string>({
    reducer: (_, next) => next,
    default: () => '',
  }),
  toolResults: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  collectedProducts: Annotation<any[]>({
    reducer: (prev, next) => [...prev, ...next],
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  inputTokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  outputTokens: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  turnCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),
  finalResponse: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  generationJob: Annotation<any | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
});

type AgentState = typeof AgentStateAnnotation.State;

/**
 * Create a LangGraph-based agent with StateGraph
 * Provides checkpointing, resumable conversations, and observable execution
 */
function createAgentGraph(
  model: any,
  tools: any[],
  onChunk?: (chunk: any) => void
) {
  const maxIterations = 10;

  // Agent node: calls the model
  async function agentNode(state: AgentState): Promise<Partial<AgentState>> {
    const iteration = state.iteration + 1;
    console.log(`🔄 Agent node - iteration ${iteration}/${maxIterations}`);

    // Send iteration status
    try {
      onChunk?.({
        type: 'iteration',
        iteration,
        maxIterations,
        message: `Processing step ${iteration}/${maxIterations}...`
      });
    } catch (e) {
      console.log('⚠️ Stream closed, continuing without streaming');
    }

    // Invoke model
    const modelWithTools = tools.length > 0 ? model.bindTools(tools) : model;
    const invokeStartTime = Date.now();

    const response = await modelWithTools.invoke(state.messages, {
      system: state.systemPrompt,
    });

    const invokeElapsed = Date.now() - invokeStartTime;
    console.log(`✅ Claude API responded in ${invokeElapsed}ms`);

    // Track token usage
    const usage = response.response_metadata?.usage;
    const inputTokens = usage?.input_tokens || 0;
    const outputTokens = usage?.output_tokens || 0;

    // Send thinking status
    try {
      onChunk?.({
        type: 'assistant_thinking',
        content: response.content,
        hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0)
      });
    } catch (e) {}

    // Check if done (no tool calls)
    if (!response.tool_calls || response.tool_calls.length === 0) {
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

      return {
        messages: [response],
        iteration,
        inputTokens,
        outputTokens,
        turnCount: 1,
        finalResponse: textContent,
      };
    }

    return {
      messages: [response],
      iteration,
      inputTokens,
      outputTokens,
      turnCount: 1,
    };
  }

  // Tools node: executes tool calls
  async function toolsNode(state: AgentState): Promise<Partial<AgentState>> {
    const lastMessage = state.messages[state.messages.length - 1] as any;
    const toolCalls = lastMessage.tool_calls || [];

    if (toolCalls.length === 0) {
      return {};
    }

    console.log(`🔧 Executing ${toolCalls.length} tool call(s)`);

    const toolMessages: any[] = [];
    const newToolResults: any[] = [];
    const newProducts: any[] = [];
    let generationJob = null;

    for (const toolCall of toolCalls) {
      console.log(`  📞 Tool: ${toolCall.name}`);

      // Send tool call status
      try {
        onChunk?.({
          type: 'tool_call',
          tool: toolCall.name,
          args: toolCall.args,
          message: `Calling ${toolCall.name}...`
        });
      } catch (e) {}

      try {
        const tool = tools.find((t: any) => t.name === toolCall.name);
        if (!tool) {
          throw new Error(`Tool not found: ${toolCall.name}`);
        }

        const toolStartTime = Date.now();
        const toolResult = await tool.invoke(toolCall.args);
        const toolElapsed = Date.now() - toolStartTime;
        console.log(`  ✅ ${toolCall.name} completed in ${toolElapsed}ms`);

        // Send tool result
        try {
          onChunk?.({
            type: 'tool_result',
            tool: toolCall.name,
            result: toolResult,
            message: `${toolCall.name} completed`
          });
        } catch (e) {}

        // Parse and collect results
        try {
          const resultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
          const parsedResult = JSON.parse(resultStr);

          newToolResults.push({
            tool: toolCall.name,
            result: parsedResult,
            args: toolCall.args,
          });

          // Collect products from search
          if (toolCall.name === 'material_search' && parsedResult.results) {
            const products = parsedResult.results.map((r: any) => {
              const imageUrl = r.image_url || r.thumbnail || r.metadata?.image_url;
              return {
                id: r.id || r.product_id || `product-${Date.now()}`,
                sku: r.sku || r.metadata?.sku || '',
                name: r.name || r.title || 'Unnamed Product',
                description: r.description || r.content || '',
                category: r.category || r.metadata?.category || 'materials',
                type: r.type || r.metadata?.material_type || 'general',
                status: 'active',
                images: imageUrl ? [{ url: imageUrl, alt: r.name || 'Product', isPrimary: true }] : [],
                metadata: {
                  ...r.metadata,
                  factory_name: r.factory || r.metadata?.factory || r.manufacturer,
                  score: r.score || r.similarity_score,
                },
                pricing: {
                  retail: r.price || r.metadata?.price || 0,
                  wholesale: r.wholesale_price || 0,
                  currency: r.currency || 'EUR',
                },
                stock: { quantity: r.stock || 0, status: 'available', unit: r.unit || 'piece' },
                tags: r.tags || [],
              };
            });
            newProducts.push(...products);
          }

          // Detect 3D generation job
          if (toolCall.name === 'generate_3d' && parsedResult.success && parsedResult.async_job) {
            generationJob = {
              job_id: parsedResult.job_id,
              model_count: parsedResult.model_count,
              models: parsedResult.models,
              prompt: toolCall.args?.prompt || '',
              room_type: toolCall.args?.roomType,
              style: toolCall.args?.style
            };
          }
        } catch (parseError) {
          console.warn('Could not parse tool result:', parseError);
        }

        // Create tool message for model
        toolMessages.push({
          role: 'tool',
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });

      } catch (error) {
        console.error(`❌ Tool ${toolCall.name} failed:`, error);

        try {
          onChunk?.({
            type: 'tool_error',
            tool: toolCall.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } catch (e) {}

        toolMessages.push({
          role: 'tool',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    return {
      messages: toolMessages,
      toolResults: newToolResults,
      collectedProducts: newProducts,
      generationJob: generationJob || state.generationJob,
    };
  }

  // Routing function: decide next node
  function shouldContinue(state: AgentState): string {
    // Check if we have a final response
    if (state.finalResponse !== null) {
      console.log('✅ Agent finished - final response ready');
      return END;
    }

    // Check max iterations
    if (state.iteration >= maxIterations) {
      console.warn(`⚠️ Agent reached max iterations (${maxIterations})`);
      return END;
    }

    // Check if last message has tool calls
    const lastMessage = state.messages[state.messages.length - 1] as any;
    if (lastMessage?.tool_calls && lastMessage.tool_calls.length > 0) {
      return 'tools';
    }

    return END;
  }

  // Build the graph
  const graph = new StateGraph(AgentStateAnnotation)
    .addNode('agent', agentNode)
    .addNode('tools', toolsNode)
    .addEdge(START, 'agent')
    .addConditionalEdges('agent', shouldContinue, {
      tools: 'tools',
      [END]: END,
    })
    .addEdge('tools', 'agent');

  return graph.compile();
}

/**
 * Load agent system prompt from database (prompts table)
 * NO FALLBACK - All prompts must exist in the database
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
      console.error(`❌ CRITICAL: No prompt found in database for agent '${agentType}'. Error:`, error);
      throw new Error(`Agent prompt not found in database: ${agentType}. Please add it via /admin/ai-configs.`);
    }

    if (!data?.system_prompt) {
      console.error(`❌ CRITICAL: Prompt for agent '${agentType}' exists but has empty system_prompt`);
      throw new Error(`Agent prompt is empty in database: ${agentType}. Please update it via /admin/ai-configs.`);
    }

    console.log(`✅ Loaded system prompt for agent '${agentType}' from database`);
    return data.system_prompt;
  } catch (error) {
    console.error(`❌ Failed to load prompt for ${agentType}:`, error);
    throw error;
  }
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

        // Add timeout to prevent edge function from hanging
        const TIMEOUT_MS = 60000; // 60 seconds (creating a job should be fast)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch(interiorApiUrl, {
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
            signal: controller.signal,
          });
        } catch (fetchError) {
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error(`Request timed out after ${TIMEOUT_MS}ms`);
          }
          throw fetchError;
        } finally {
          clearTimeout(timeoutId);
        }

        if (!response.ok) {
          throw new Error(`MIVAA API error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Generation failed');
        }

        console.log('✅ Generation job created:', result);

        // IMMEDIATELY send generation job info via streaming callback
        try {
          onChunk?.({
            type: 'generation_job_created',
            job_id: result.job_id,
            model_count: result.model_count,
            models: result.models,
            prompt: prompt,
            room_type: roomType,
            style: style,
          });
        } catch (e) {
          console.error('Failed to send generation_job_created chunk:', e);
        }

        // Return a conversational response - agent can continue talking
        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          model_count: result.model_count,
          models: result.models,
          message: `I've started generating ${result.model_count} interior design variations for your ${roomType || 'space'}${style ? ` in ${style} style` : ''}. The generation is running in the background - you can see the progress in the generation panel below. Feel free to continue our conversation or ask me anything else while it processes!`,
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

// ============================================================================
// SUB-AGENT TOOLS FOR INSIGHTS AGENT
// These tools allow the Insights Agent to delegate to specialized analysis
// ============================================================================

/**
 * Sub-Agent Tool: Research Analysis
 * Performs deep research and analysis on materials and industry trends
 */
const createResearchAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, context }) => {
      try {
        console.log(`🔬 Research sub-agent: "${query}"`);
        const startTime = Date.now();

        // Load research agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('research');

        // Create a mini-agent execution with research context
        const researchModel = new ChatAnthropic({
          model: 'claude-sonnet-4-5-20250929',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Research agent has access to material_search
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = researchModel.bindTools([searchTool]);

        const response = await modelWithTools.invoke([
          { role: 'user', content: `${context ? `Context: ${context}\n\n` : ''}Research query: ${query}` }
        ], { system: systemPrompt });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Research sub-agent completed in ${elapsed}ms`);

        // Extract text content from response
        const textContent = typeof response.content === 'string'
          ? response.content
          : response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');

        return JSON.stringify({
          success: true,
          analysis_type: 'research',
          findings: textContent,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Research sub-agent error:', error);
        return JSON.stringify({
          success: false,
          analysis_type: 'research',
          error: error instanceof Error ? error.message : 'Research analysis failed',
        });
      }
    },
    {
      name: 'research_analysis',
      description: 'Perform deep research and analysis on materials, sustainability, industry trends, and technical specifications. Use for questions requiring in-depth investigation, scientific analysis, or trend research.',
      schema: z.object({
        query: z.string().describe('The research question or topic to investigate'),
        context: z.string().optional().describe('Additional context for the research'),
      }),
    }
  );
};

/**
 * Sub-Agent Tool: Analytics Analysis
 * Data analysis, performance metrics, and usage analytics
 */
const createAnalyticsAnalysisTool = () => {
  return tool(
    async ({ query, dataType, timeRange }) => {
      try {
        console.log(`📊 Analytics sub-agent: "${query}", type="${dataType}"`);
        const startTime = Date.now();

        // Load analytics agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('analytics');

        const analyticsModel = new ChatAnthropic({
          model: 'claude-sonnet-4-5-20250929',
          temperature: 0.5,
          maxTokens: 2048,
        });

        // Analytics agent doesn't have tools - pure reasoning
        const response = await analyticsModel.invoke([
          { role: 'user', content: `Data type: ${dataType || 'general'}\nTime range: ${timeRange || 'all'}\nAnalysis request: ${query}` }
        ], { system: systemPrompt });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Analytics sub-agent completed in ${elapsed}ms`);

        const textContent = typeof response.content === 'string'
          ? response.content
          : response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');

        return JSON.stringify({
          success: true,
          analysis_type: 'analytics',
          insights: textContent,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Analytics sub-agent error:', error);
        return JSON.stringify({
          success: false,
          analysis_type: 'analytics',
          error: error instanceof Error ? error.message : 'Analytics analysis failed',
        });
      }
    },
    {
      name: 'analytics_analysis',
      description: 'Analyze data, performance metrics, usage patterns, and generate statistical insights. Use for quantitative analysis questions, KPIs, metrics interpretation, and data-driven recommendations.',
      schema: z.object({
        query: z.string().describe('The analytics question to answer'),
        dataType: z.string().optional().describe('Type of data to analyze (usage, performance, sales, inventory, etc.)'),
        timeRange: z.string().optional().describe('Time range for analysis (e.g., "last 7 days", "Q1 2025", "year-over-year")'),
      }),
    }
  );
};

/**
 * Sub-Agent Tool: Business Analysis
 * Business intelligence, market analysis, and trend identification
 */
const createBusinessAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, focus }) => {
      try {
        console.log(`💼 Business sub-agent: "${query}", focus="${focus}"`);
        const startTime = Date.now();

        // Load business agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('business');

        const businessModel = new ChatAnthropic({
          model: 'claude-sonnet-4-5-20250929',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Business agent has access to material_search for market data
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = businessModel.bindTools([searchTool]);

        const response = await modelWithTools.invoke([
          { role: 'user', content: `Focus area: ${focus || 'general'}\nBusiness question: ${query}` }
        ], { system: systemPrompt });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Business sub-agent completed in ${elapsed}ms`);

        const textContent = typeof response.content === 'string'
          ? response.content
          : response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');

        return JSON.stringify({
          success: true,
          analysis_type: 'business',
          recommendations: textContent,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Business sub-agent error:', error);
        return JSON.stringify({
          success: false,
          analysis_type: 'business',
          error: error instanceof Error ? error.message : 'Business analysis failed',
        });
      }
    },
    {
      name: 'business_analysis',
      description: 'Provide business intelligence, market analysis, competitive insights, and strategic recommendations. Use for business strategy questions, market trends, pricing, and competitive analysis.',
      schema: z.object({
        query: z.string().describe('The business question to analyze'),
        focus: z.string().optional().describe('Focus area (market, competitors, strategy, pricing, operations, etc.)'),
      }),
    }
  );
};

/**
 * Sub-Agent Tool: Product Analysis
 * Product management, catalog operations, and recommendations
 */
const createProductAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, productCategory }) => {
      try {
        console.log(`📦 Product sub-agent: "${query}", category="${productCategory}"`);
        const startTime = Date.now();

        // Load product agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('product');

        const productModel = new ChatAnthropic({
          model: 'claude-sonnet-4-5-20250929',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Product agent has access to material_search for catalog queries
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = productModel.bindTools([searchTool]);

        const response = await modelWithTools.invoke([
          { role: 'user', content: `Product category: ${productCategory || 'all'}\nProduct question: ${query}` }
        ], { system: systemPrompt });

        const elapsed = Date.now() - startTime;
        console.log(`✅ Product sub-agent completed in ${elapsed}ms`);

        const textContent = typeof response.content === 'string'
          ? response.content
          : response.content
              .filter((b: any) => b.type === 'text')
              .map((b: any) => b.text)
              .join('\n');

        return JSON.stringify({
          success: true,
          analysis_type: 'product',
          analysis: textContent,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Product sub-agent error:', error);
        return JSON.stringify({
          success: false,
          analysis_type: 'product',
          error: error instanceof Error ? error.message : 'Product analysis failed',
        });
      }
    },
    {
      name: 'product_analysis',
      description: 'Analyze products, catalog data, recommendations, and product lifecycle. Use for product-related questions, comparisons, specifications, and recommendations.',
      schema: z.object({
        query: z.string().describe('The product question to analyze'),
        productCategory: z.string().optional().describe('Product category to focus on (tiles, flooring, surfaces, etc.)'),
      }),
    }
  );
};

// ============================================================================
// B2B RESEARCH TOOLS FOR INSIGHTS AGENT
// These tools enable manufacturer discovery, verification, and CRM integration
// ============================================================================

/**
 * B2B Research Tool: Manufacturer Search
 * Uses Perplexity API for AI-powered web research to find B2B manufacturers
 */
const createB2BManufacturerSearchTool = (onProgress?: (status: string) => void) => {
  return tool(
    async ({ country, category, language, limit = 10 }) => {
      try {
        console.log(`🔍 B2B Manufacturer Search: country="${country}", category="${category}", language="${language}"`);
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Searching for ${category} manufacturers in ${country}...`);

        const PERPLEXITY_API_KEY = Deno.env.get('PERPLEXITY_API_KEY');
        if (!PERPLEXITY_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'PERPLEXITY_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        // Build a research query optimized for B2B manufacturer discovery
        const languageMap: Record<string, string> = {
          // Baltic & Nordic
          lt: 'Lithuanian',
          lv: 'Latvian',
          et: 'Estonian',
          fi: 'Finnish',
          da: 'Danish',
          // Central & Eastern Europe
          pl: 'Polish',
          cs: 'Czech',
          sk: 'Slovak',
          hu: 'Hungarian',
          ro: 'Romanian',
          bg: 'Bulgarian',
          uk: 'Ukrainian',
          // Balkans
          tr: 'Turkish',
          sr: 'Serbian',
          hr: 'Croatian',
          sl: 'Slovenian',
          bs: 'Bosnian',
          mk: 'Macedonian',
          sq: 'Albanian',
          // Western & Southern Europe
          de: 'German',
          nl: 'Dutch',
          en: 'English',
          es: 'Spanish',
          it: 'Italian',
          el: 'Greek',
        };

        const languageName = language ? languageMap[language] || language : 'English';

        const query = `Find B2B manufacturers of ${category} in ${country}.

IMPORTANT: Perform searches in BOTH English AND ${languageName} to get comprehensive coverage:

1. ENGLISH SEARCH:
   - Search "${category} manufacturer ${country}"
   - Search "${category} producer ${country}"
   - Search "${category} factory ${country}"

2. NATIVE ${languageName.toUpperCase()} SEARCH:
   - Translate "${category}" to ${languageName} and search with those terms
   - Use local industry terminology (e.g., "producent", "výrobce", "üretici", "производител", "gamintojas", etc.)
   - Search ${languageName}-language websites, directories, and B2B portals
   - Many local manufacturers only have websites in ${languageName}

Combine results from BOTH searches to maximize coverage.

I need actual manufacturing companies (not distributors or retailers) that:
- Have their own production facilities
- Offer wholesale/B2B sales
- Preferably offer OEM/private label services
- Export capabilities preferred

For each manufacturer found, provide:
- Company name
- Website URL
- City/location
- Main products they manufacture
- Any indicators they are actual manufacturers (factory, production facility, etc.)

Return up to ${limit} manufacturers, combining results from both English and ${languageName} searches.`;

        // Add timeout to prevent hanging (60 seconds for AI search)
        const TIMEOUT_MS = 60000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'sonar',
              messages: [
                {
                  role: 'system',
                  content: 'You are a B2B research assistant specialized in finding manufacturing companies in Central/Eastern Europe and the Balkans. CRITICAL: Always search in BOTH English AND the native language of the target country to maximize coverage. First search in English, then translate product categories and search in the local language. Many local manufacturers only have websites in their native language, while others target international markets with English sites. Combine results from both searches. Always verify companies are actual manufacturers, not distributors or retailers. Provide structured data with company names, websites, locations, and products.',
                },
                {
                  role: 'user',
                  content: query,
                },
              ],
              temperature: 0.2,
              max_tokens: 4096,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Perplexity API timeout after ${TIMEOUT_MS / 1000} seconds. Try a simpler query.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Perplexity API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Perplexity API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`✅ B2B search completed in ${elapsed}ms`);

        // Extract the response content
        const content = data.choices?.[0]?.message?.content || '';
        const citations = data.citations || [];

        return JSON.stringify({
          success: true,
          search_results: content,
          citations: citations,
          query_params: { country, category, language, limit },
          elapsed_ms: elapsed,
          source: 'perplexity',
        });
      } catch (error) {
        console.error('B2B manufacturer search error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'B2B manufacturer search failed',
        });
      }
    },
    {
      name: 'b2b_manufacturer_search',
      description: `Search for B2B manufacturers in a specific country and product category. Uses AI-powered web research to find actual manufacturing companies (not distributors). Supports native language searches for better coverage. Supported countries: ${SUPPORTED_COUNTRY_NAMES.join(', ')}.`,
      schema: z.object({
        country: z.enum(SUPPORTED_COUNTRY_NAMES as unknown as [string, ...string[]]).describe(`Country to search in. Supported: ${SUPPORTED_COUNTRY_NAMES.join(', ')}`),
        category: z.string().describe('Product category (e.g., "ceramic tiles", "bathroom furniture", "LED mirrors")'),
        language: z.enum(SUPPORTED_LANGUAGE_CODES as unknown as [string, ...string[]]).optional().describe(`Language code for native searches. Supported: ${SUPPORTED_LANGUAGE_CODES.join(', ')}`),
        limit: z.number().optional().default(10).describe('Maximum number of manufacturers to find'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Website Scrape
 * Uses Firecrawl API to extract structured information from company websites
 */
const createCompanyWebsiteScrapeTool = (onProgress?: (status: string) => void) => {
  return tool(
    async ({ url, extract }) => {
      try {
        console.log(`🌐 Scraping company website: ${url}`);
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Scraping website: ${url}...`);

        const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
        if (!FIRECRAWL_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'FIRECRAWL_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        // Scrape the website using Firecrawl with timeout (30 seconds)
        const TIMEOUT_MS = 30000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${FIRECRAWL_API_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url: url,
              formats: ['markdown'],
              onlyMainContent: true,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Website scrape timeout after ${TIMEOUT_MS / 1000} seconds. The site may be slow or blocking scrapers.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Firecrawl API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Firecrawl API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const scrapeElapsed = Date.now() - startTime;
        console.log(`✅ Website scrape completed in ${scrapeElapsed}ms`);

        const markdown = data.data?.markdown || '';
        const metadata = data.data?.metadata || {};

        // If no content was scraped, return early with metadata only
        if (!markdown || markdown.length < 100) {
          return JSON.stringify({
            success: true,
            url: url,
            company_data: { error: 'Could not extract meaningful content from website' },
            page_title: metadata.title || '',
            page_description: metadata.description || '',
            elapsed_ms: scrapeElapsed,
          });
        }

        // Use Claude to extract structured company information from the scraped content
        const extractSections = extract || ['about', 'products', 'contact', 'certifications'];

        // Send progress update for analysis phase
        onProgress?.(`Analyzing website content...`);

        let companyData;
        try {
          const analysisModel = new ChatAnthropic({
            model: 'claude-sonnet-4-5-20250929',
            temperature: 0.3,
            maxTokens: 2048,
          });

          const analysisPrompt = `Analyze this company website content and extract the following information:

Sections to extract: ${extractSections.join(', ')}

Website content:
${markdown.substring(0, 15000)}

Please extract and structure the information as JSON with these fields:
- company_name: string
- about: string (company description, history, founding year if found)
- products: array of strings (specific products they manufacture)
- contact: object with address, phone, email if found
- certifications: array of strings (ISO, quality certifications)
- is_manufacturer: boolean (true if they clearly manufacture products, false if just distributor/retailer)
- is_b2b: boolean (true if they offer wholesale/B2B services)
- manufacturing_indicators: array of strings (words/phrases that indicate manufacturing capability)
- confidence: number 0-1 (how confident are you this is a B2B manufacturer)

Return ONLY valid JSON, no markdown formatting.`;

          const analysisResponse = await analysisModel.invoke([
            { role: 'user', content: analysisPrompt }
          ]);

          const analysisText = typeof analysisResponse.content === 'string'
            ? analysisResponse.content
            : analysisResponse.content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n');

          // Try to parse the JSON response
          try {
            // Remove any markdown code blocks if present
            const jsonStr = analysisText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            companyData = JSON.parse(jsonStr);
          } catch {
            companyData = { raw_analysis: analysisText };
          }
        } catch (analysisError) {
          console.error('Claude analysis error:', analysisError);
          // Return scraped data even if analysis fails
          companyData = {
            error: 'Analysis failed but website was scraped',
            raw_markdown_preview: markdown.substring(0, 2000)
          };
        }

        const totalElapsed = Date.now() - startTime;
        return JSON.stringify({
          success: true,
          url: url,
          company_data: companyData,
          page_title: metadata.title || '',
          page_description: metadata.description || '',
          elapsed_ms: totalElapsed,
        });
      } catch (error) {
        console.error('Company website scrape error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Website scrape failed',
        });
      }
    },
    {
      name: 'company_website_scrape',
      description: 'Scrape a company website to extract structured information about the company, products, contact details, and verify if they are a B2B manufacturer.',
      schema: z.object({
        url: z.string().describe('Company website URL to scrape'),
        extract: z.array(z.string()).optional().describe('Sections to extract: about, products, contact, certifications'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Enrichment
 * Uses Apollo.io API to get structured company data from B2B databases
 */
const createCompanyEnrichmentTool = (onProgress?: (status: string) => void) => {
  return tool(
    async ({ company_name, domain, country }) => {
      try {
        console.log(`🏢 Enriching company: ${company_name}, domain=${domain}`);
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Enriching company data for ${company_name}...`);

        const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
        if (!APOLLO_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'APOLLO_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        // Search for the company in Apollo.io with timeout (20 seconds)
        const TIMEOUT_MS = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response;
        try {
          response = await fetch('https://api.apollo.io/api/v1/mixed_companies/search', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
              'X-Api-Key': APOLLO_API_KEY,
            },
            body: JSON.stringify({
              q_organization_name: company_name,
              organization_locations: country ? [country] : undefined,
              organization_domains: domain ? [domain] : undefined,
              page: 1,
              per_page: 5,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Apollo API timeout after ${TIMEOUT_MS / 1000} seconds.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Apollo API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Apollo API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`✅ Company enrichment completed in ${elapsed}ms`);

        const companies = data.organizations || [];

        if (companies.length === 0) {
          return JSON.stringify({
            success: true,
            found: false,
            message: 'No matching company found in Apollo database',
            query: { company_name, domain, country },
          });
        }

        // Return the best match
        const company = companies[0];

        return JSON.stringify({
          success: true,
          found: true,
          company: {
            name: company.name,
            domain: company.primary_domain,
            industry: company.industry,
            employee_count: company.estimated_num_employees,
            employee_range: company.organization_estimated_num_employees,
            founded_year: company.founded_year,
            linkedin_url: company.linkedin_url,
            headquarters: {
              city: company.city,
              state: company.state,
              country: company.country,
            },
            phone: company.phone,
            technologies: company.technologies || [],
            keywords: company.keywords || [],
            annual_revenue: company.annual_revenue,
            total_funding: company.total_funding,
          },
          total_matches: companies.length,
          elapsed_ms: elapsed,
          source: 'apollo.io',
        });
      } catch (error) {
        console.error('Company enrichment error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Company enrichment failed',
        });
      }
    },
    {
      name: 'company_enrichment',
      description: 'Get structured company data from B2B databases including employee count, founding year, industry, LinkedIn URL, and headquarters location.',
      schema: z.object({
        company_name: z.string().describe('Company name to search for'),
        domain: z.string().optional().describe('Company website domain (e.g., "paradyz.com")'),
        country: z.string().optional().describe('Country to filter results'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Contact Discovery
 * Uses Hunter.io API to find decision-maker email addresses
 */
const createContactDiscoveryTool = (onProgress?: (status: string) => void) => {
  return tool(
    async ({ domain, roles }) => {
      try {
        console.log(`📧 Discovering contacts for domain: ${domain}`);
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Finding contacts for ${domain}...`);

        const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
        if (!HUNTER_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'HUNTER_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        // Search for contacts using Hunter.io domain search with timeout (20 seconds)
        const TIMEOUT_MS = 20000;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const searchUrl = new URL('https://api.hunter.io/v2/domain-search');
        searchUrl.searchParams.set('domain', domain);
        searchUrl.searchParams.set('api_key', HUNTER_API_KEY);
        searchUrl.searchParams.set('limit', '10');

        let response;
        try {
          response = await fetch(searchUrl.toString(), {
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            return JSON.stringify({
              success: false,
              error: `Hunter API timeout after ${TIMEOUT_MS / 1000} seconds.`,
            });
          }
          throw fetchError;
        }

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Hunter API error: ${response.status} - ${errorText}`);
          return JSON.stringify({
            success: false,
            error: `Hunter API error: ${response.status}`,
          });
        }

        const data = await response.json();
        const elapsed = Date.now() - startTime;
        console.log(`✅ Contact discovery completed in ${elapsed}ms`);

        const emails = data.data?.emails || [];
        const organization = data.data?.organization || '';
        const pattern = data.data?.pattern || '';

        // Filter and prioritize contacts based on requested roles
        const priorityRoles = roles || ['export', 'sales', 'director', 'manager', 'owner', 'ceo', 'founder'];

        const scoredContacts = emails.map((email: any) => {
          const position = (email.position || '').toLowerCase();
          let roleScore = 0;

          for (let i = 0; i < priorityRoles.length; i++) {
            if (position.includes(priorityRoles[i].toLowerCase())) {
              roleScore = priorityRoles.length - i; // Higher score for earlier roles in priority list
              break;
            }
          }

          return {
            name: `${email.first_name || ''} ${email.last_name || ''}`.trim(),
            email: email.value,
            position: email.position || '',
            department: email.department || '',
            linkedin: email.linkedin || '',
            confidence: email.confidence || 0,
            email_verified: email.verification?.status === 'valid',
            role_score: roleScore,
            source: 'hunter.io',
          };
        });

        // Sort by role score (descending), then by confidence (descending)
        scoredContacts.sort((a: any, b: any) => {
          if (b.role_score !== a.role_score) return b.role_score - a.role_score;
          return b.confidence - a.confidence;
        });

        return JSON.stringify({
          success: true,
          domain: domain,
          organization: organization,
          email_pattern: pattern,
          contacts: scoredContacts.slice(0, 10),
          total_found: emails.length,
          elapsed_ms: elapsed,
          source: 'hunter.io',
        });
      } catch (error) {
        console.error('Contact discovery error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Contact discovery failed',
        });
      }
    },
    {
      name: 'contact_discovery',
      description: 'Find decision-maker email addresses for a company domain. Prioritizes contacts based on specified roles like export managers, sales directors, owners.',
      schema: z.object({
        domain: z.string().describe('Company website domain (e.g., "paradyz.com")'),
        roles: z.array(z.string()).optional().describe('Priority roles to find (e.g., ["export", "sales", "director"])'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Save to CRM
 * Saves researched company and contacts to the CRM database
 */
const createSaveToCRMTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ company, contacts }) => {
      try {
        console.log(`💾 Saving to CRM: ${company.name}`);
        const startTime = Date.now();

        // Send progress update
        onProgress?.(`Saving ${company.name} to CRM...`);

        // First, create or update the company
        const { data: companyData, error: companyError } = await supabase
          .from('crm_companies')
          .insert({
            name: company.name,
            website: company.website,
            email: company.email,
            phone: company.phone,
            industry: company.industry,
            employee_count: company.employee_count,
            address: company.address,
            city: company.city,
            country: company.country,
            linkedin: company.linkedin,
            description: company.description,
            notes: company.notes,
            created_by: userId,
          })
          .select('id')
          .single();

        if (companyError) {
          console.error('Error creating company:', companyError);
          return JSON.stringify({
            success: false,
            error: `Failed to create company: ${companyError.message}`,
          });
        }

        const companyId = companyData.id;
        const contactIds: string[] = [];

        // Create contacts and link them to the company
        if (contacts && contacts.length > 0) {
          for (const contact of contacts) {
            // Create the contact
            const { data: contactData, error: contactError } = await supabase
              .from('crm_contacts')
              .insert({
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
                mobile: contact.mobile,
                position: contact.position,
                department: contact.department,
                linkedin: contact.linkedin,
                company: company.name,
                country: company.country,
                city: company.city,
                lead_source: 'B2B Research Agent',
                status: 'new',  // Using correct column name
                notes: contact.notes,
                created_by: userId,
              })
              .select('id')
              .single();

            if (contactError) {
              console.error('Error creating contact:', contactError);
              continue;
            }

            contactIds.push(contactData.id);

            // Link contact to company
            await supabase
              .from('crm_company_contacts')
              .insert({
                company_id: companyId,
                contact_id: contactData.id,
                role: contact.position,
                is_primary: contact.is_primary || false,
                notes: `Added via B2B Research Agent`,
              });
          }
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Saved to CRM in ${elapsed}ms: company=${companyId}, contacts=${contactIds.length}`);

        return JSON.stringify({
          success: true,
          company_id: companyId,
          contact_ids: contactIds,
          company_name: company.name,
          contacts_created: contactIds.length,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Save to CRM error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save to CRM',
        });
      }
    },
    {
      name: 'save_to_crm',
      description: 'Save a researched company and its contacts to the CRM database. Use this after the user confirms they want to save a manufacturer.',
      schema: z.object({
        company: z.object({
          name: z.string().describe('Company name'),
          website: z.string().optional().describe('Company website URL'),
          email: z.string().optional().describe('Company email'),
          phone: z.string().optional().describe('Company phone'),
          industry: z.string().optional().describe('Industry'),
          employee_count: z.string().optional().describe('Employee count range'),
          address: z.string().optional().describe('Street address'),
          city: z.string().optional().describe('City'),
          country: z.string().optional().describe('Country'),
          linkedin: z.string().optional().describe('LinkedIn URL'),
          description: z.string().optional().describe('Company description'),
          notes: z.string().optional().describe('Additional notes'),
        }).describe('Company information to save'),
        contacts: z.array(z.object({
          name: z.string().describe('Contact full name'),
          email: z.string().optional().describe('Contact email'),
          phone: z.string().optional().describe('Contact phone'),
          mobile: z.string().optional().describe('Contact mobile'),
          position: z.string().optional().describe('Job position/title'),
          department: z.string().optional().describe('Department'),
          linkedin: z.string().optional().describe('LinkedIn profile URL'),
          notes: z.string().optional().describe('Notes about the contact'),
          is_primary: z.boolean().optional().describe('Is this the primary contact'),
        })).optional().describe('Contacts to save and link to the company'),
      }),
    }
  );
};

/**
 * Create Load Skill Tool - Progressive disclosure pattern
 * Loads specialized knowledge from skills directory on demand
 */
const createLoadSkillTool = (agentId: string) => {
  const availableSkills = getSkillsForAgent(agentId);
  const skillList = availableSkills
    .map(s => `- ${s.slug}: ${s.description}`)
    .join('\n');

  // If no skills available for this agent, return null
  if (availableSkills.length === 0) {
    return null;
  }

  return tool(
    async ({ skillSlug }: { skillSlug: string }) => {
      console.log(`🎯 Loading skill: ${skillSlug} for agent: ${agentId}`);
      const content = getSkillContent(skillSlug);
      if (!content) {
        const availableSlugs = availableSkills.map(s => s.slug).join(', ');
        return `Skill "${skillSlug}" not found. Available skills: ${availableSlugs}`;
      }
      console.log(`✅ Skill loaded: ${skillSlug} (${content.length} chars)`);
      return content;
    },
    {
      name: 'load_skill',
      description: `Load specialized knowledge for a specific domain. Use this when you need expert guidance on a topic.\n\nAvailable skills:\n${skillList}`,
      schema: z.object({
        skillSlug: z.string().describe('The skill slug to load (e.g., "material-sourcing")'),
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

// AGENT_CONFIGS: All systemPrompts are loaded from the database via getAgentSystemPrompt()
// No hardcoded prompts - managed via /admin/ai-configs
const AGENT_CONFIGS: Record<string, AgentConfig> = {
  search: {
    id: 'search',
    name: 'Search Agent',
    description: 'Material search and discovery',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: ['material_search', 'image_analysis'],
    // systemPrompt loaded from database
  },
  insights: {
    id: 'insights',
    name: 'Insights Agent',
    description: 'Unified intelligence combining research, analytics, business, and product analysis with B2B research capabilities',
    allowedRoles: ['admin', 'owner'],
    tools: [
      // Sub-agent orchestration tools
      'research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis', 'material_search',
      // B2B Research tools
      'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment', 'contact_discovery', 'save_to_crm'
    ],
    // systemPrompt loaded from database
    // NOTE: This agent orchestrates sub-agents for specialized analysis tasks
    // NOTE: B2B research tools enable manufacturer discovery and CRM integration
  },
  demo: {
    id: 'demo',
    name: 'Demo Agent',
    description: 'Platform showcase',
    allowedRoles: ['admin', 'owner'],
    tools: [],
    // systemPrompt loaded from database
  },
  'interior-designer': {
    id: 'interior-designer',
    name: 'Interior Designer Agent',
    description: 'AI-powered interior design with spatial analysis and material matching',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: ['material_search', 'image_analysis', 'spaceformer_analysis', 'generate_3d'],
    // systemPrompt loaded from database
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
  // REMOVED: pdfFile parameter - pdf-processor agent removed
  onChunk?: (chunk: any) => void
): Promise<{
  text: string;
  materialResults?: { products: any[]; images?: Record<string, string>; title?: string };
  toolResults?: any[];
  generationJob?: {
    job_id: string;
    model_count: number;
    models: Array<{ id: string; name: string; provider: string }>;
    prompt: string;
    room_type?: string;
    style?: string;
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName: string;
    turnCount: number;
  };
}> {
  const config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Collect material results from search tool calls
  let collectedProducts: any[] = [];
  // Collect all tool results for frontend
  let collectedToolResults: any[] = [];

  // Track token usage across all turns
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turnCount = 0;

  // Load system prompt from database - NO FALLBACK
  // All prompts must exist in the database (managed via /admin/ai-configs)
  let systemPrompt: string;
  try {
    systemPrompt = await getAgentSystemPrompt(agentId);
    console.log(`✅ System prompt loaded for ${agentId} from database, length: ${systemPrompt.length}`);
  } catch (error) {
    console.error(`❌ Failed to load system prompt for ${agentId}:`, error);
    throw new Error(`Failed to load agent configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  // 🧠 Long-term Memory: Retrieve relevant memories for context
  try {
    const memories = await longTermMemory.retrieve(userId, workspaceId, {
      limit: 10,
      agentId: agentId,
    });

    if (memories.length > 0) {
      const memoryContext = longTermMemory.formatForContext(memories);
      systemPrompt = systemPrompt + memoryContext;
      console.log(`🧠 Added ${memories.length} long-term memories to context`);
    }
  } catch (memError) {
    console.warn('⚠️ Could not load long-term memories:', memError);
    // Continue without memories - not critical
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

  // Sub-agent tools for Insights Agent orchestration
  if (config.tools.includes('research_analysis')) {
    tools.push(createResearchAnalysisTool(workspaceId));
  }
  if (config.tools.includes('analytics_analysis')) {
    tools.push(createAnalyticsAnalysisTool());
  }
  if (config.tools.includes('business_analysis')) {
    tools.push(createBusinessAnalysisTool(workspaceId));
  }
  if (config.tools.includes('product_analysis')) {
    tools.push(createProductAnalysisTool(workspaceId));
  }

  // B2B Research tools for Insights Agent
  // Create progress callback wrapper for streaming updates during long operations
  const sendProgress = (status: string) => {
    try {
      onChunk?.({
        type: 'tool_progress',
        status,
        timestamp: Date.now(),
      });
    } catch {
      // Stream may be closed, ignore
    }
  };

  if (config.tools.includes('b2b_manufacturer_search')) {
    tools.push(createB2BManufacturerSearchTool(sendProgress));
  }
  if (config.tools.includes('company_website_scrape')) {
    tools.push(createCompanyWebsiteScrapeTool(sendProgress));
  }
  if (config.tools.includes('company_enrichment')) {
    tools.push(createCompanyEnrichmentTool(sendProgress));
  }
  if (config.tools.includes('contact_discovery')) {
    tools.push(createContactDiscoveryTool(sendProgress));
  }
  if (config.tools.includes('save_to_crm')) {
    tools.push(createSaveToCRMTool(userId, sendProgress));
  }

  // Skills tool - available for all agents that have skills configured
  const loadSkillTool = createLoadSkillTool(agentId);
  if (loadSkillTool) {
    console.log(`🎯 Skills tool enabled for ${agentId}`);
    tools.push(loadSkillTool);
  }

  // Select model based on agent type (Haiku for search, Sonnet for complex tasks)
  const selectedModel = getModelForAgent(agentId);
  const modelName = getModelNameForAgent(agentId);
  console.log(`🤖 Using model: ${modelName} for agent: ${agentId}`);

  // 🔷 LangGraph StateGraph-based execution with checkpointing
  console.log('🔷 Creating LangGraph StateGraph agent...');

  // Generate thread ID for checkpointing (based on conversation context)
  const threadId = `${userId}-${agentId}-${Date.now()}`;
  console.log(`🔷 Thread ID: ${threadId}`);

  // Try to restore from checkpoint if available
  const existingCheckpoint = await checkpointer.get(threadId);
  if (existingCheckpoint) {
    console.log('🔄 Restoring from checkpoint...');
  }

  // Create the agent graph
  const agentGraph = createAgentGraph(selectedModel, tools, onChunk);

  // Convert messages to LangChain format
  const langchainMessages = messages.map((msg: any) => {
    if (msg.role === 'user') {
      return new HumanMessage(msg.content);
    } else if (msg.role === 'assistant') {
      return new AIMessage(msg.content);
    } else if (msg.role === 'system') {
      return new SystemMessage(msg.content);
    }
    return new HumanMessage(msg.content);
  });

  // Initial state
  const initialState = {
    messages: langchainMessages,
    systemPrompt,
    toolResults: [],
    collectedProducts: [],
    iteration: 0,
    inputTokens: 0,
    outputTokens: 0,
    turnCount: 0,
    finalResponse: null,
    generationJob: null,
  };

  try {
    // Execute the graph
    console.log('🚀 Executing LangGraph agent...');
    const result = await agentGraph.invoke(initialState);

    // Save checkpoint for future resume
    await checkpointer.put(threadId, {
      messages: result.messages,
      toolResults: result.toolResults,
      timestamp: new Date().toISOString(),
    });
    console.log('💾 Checkpoint saved');

    // Log final usage stats
    console.log(`📊 Total usage: ${result.inputTokens} input, ${result.outputTokens} output tokens across ${result.turnCount} turns`);

    // Return results
    const finalText = result.finalResponse ||
      (result.iteration >= 10 ? 'I apologize, but I reached the maximum number of processing steps. Please try again or simplify your request.' : '');

    return {
      text: finalText,
      materialResults: result.collectedProducts.length > 0 ? { products: result.collectedProducts } : undefined,
      toolResults: result.toolResults.length > 0 ? result.toolResults : undefined,
      generationJob: result.generationJob,
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
        modelName: getModelNameForAgent(agentId),
        turnCount: result.turnCount
      }
    };
  } catch (graphError) {
    console.error('❌ LangGraph execution error:', graphError);

    // Fallback to error response
    return {
      text: `Error during agent execution: ${graphError instanceof Error ? graphError.message : 'Unknown error'}`,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        modelName: getModelNameForAgent(agentId),
        turnCount: 0
      }
    };
  }
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
 * Extract and store important memories from conversation
 * Identifies preferences, facts, and context for long-term memory
 */
async function extractAndStoreMemories(
  userId: string,
  workspaceId: string,
  agentId: string,
  userInput: string,
  agentResponse: string,
  toolResults?: any[]
) {
  try {
    // Extract preferences from user input
    const preferencePatterns = [
      /i (?:prefer|like|want|love|enjoy|need) (.+?)(?:\.|,|$)/gi,
      /my (?:favorite|preferred|usual) (?:is|are) (.+?)(?:\.|,|$)/gi,
      /i'm (?:looking for|interested in) (.+?)(?:\.|,|$)/gi,
    ];

    for (const pattern of preferencePatterns) {
      const matches = userInput.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 5 && match[1].length < 200) {
          await longTermMemory.store(userId, workspaceId, {
            content: `User prefers: ${match[1].trim()}`,
            type: 'preference',
            agentId,
            metadata: { source: 'user_input', extractedFrom: match[0] },
          });
        }
      }
    }

    // Extract facts from successful tool results
    if (toolResults && toolResults.length > 0) {
      for (const toolResult of toolResults) {
        // Store material search context
        if (toolResult.tool === 'material_search' && toolResult.result?.success) {
          const searchQuery = toolResult.result?.query || '';
          const resultCount = toolResult.result?.results?.length || 0;
          if (searchQuery && resultCount > 0) {
            await longTermMemory.store(userId, workspaceId, {
              content: `User searched for "${searchQuery}" and found ${resultCount} materials`,
              type: 'context',
              agentId,
              metadata: { tool: 'material_search', resultCount },
            });
          }
        }

        // Store 3D generation context
        if (toolResult.tool === 'generate_3d' && toolResult.result?.success) {
          const roomType = toolResult.result?.room_type || 'room';
          const style = toolResult.result?.style || '';
          await longTermMemory.store(userId, workspaceId, {
            content: `User generated 3D design for ${roomType}${style ? ` in ${style} style` : ''}`,
            type: 'context',
            agentId,
            metadata: { tool: 'generate_3d', roomType, style },
          });
        }

        // Store company/contact research context
        if (toolResult.tool === 'company_enrichment' && toolResult.result?.found) {
          const companyName = toolResult.result?.company?.name || '';
          if (companyName) {
            await longTermMemory.store(userId, workspaceId, {
              content: `User researched company: ${companyName}`,
              type: 'relationship',
              agentId,
              metadata: { tool: 'company_enrichment', companyName },
            });
          }
        }

        // Store CRM saves
        if (toolResult.tool === 'save_to_crm' && toolResult.result?.success) {
          const companyName = toolResult.result?.company_name || '';
          const contactCount = toolResult.result?.contacts_created || 0;
          if (companyName) {
            await longTermMemory.store(userId, workspaceId, {
              content: `User saved ${companyName} to CRM with ${contactCount} contacts`,
              type: 'relationship',
              agentId,
              metadata: { tool: 'save_to_crm', companyName, contactCount },
            });
          }
        }
      }
    }

    console.log('🧠 Memory extraction completed');
  } catch (error) {
    console.error('Memory extraction error:', error);
    // Non-critical - don't throw
  }
}

/**
 * Log agent usage and debit credits
 * Uses the log_agent_usage RPC function for atomic logging + credit debit
 */
async function logAgentUsage(
  userId: string,
  workspaceId: string,
  agentType: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    modelName: string;
    turnCount: number;
  },
  toolsCalled: Array<{ name: string; duration_ms?: number }> = []
) {
  try {
    console.log(`💰 Logging agent usage: ${usage.inputTokens} input, ${usage.outputTokens} output tokens`);

    // Call the log_agent_usage RPC function which handles pricing lookup and credit debit
    const { data, error } = await supabase.rpc('log_agent_usage', {
      p_user_id: userId,
      p_workspace_id: workspaceId,
      p_agent_type: agentType,
      p_turn_number: usage.turnCount,
      p_model_name: usage.modelName,
      p_input_tokens: usage.inputTokens,
      p_output_tokens: usage.outputTokens,
      p_tools_called: toolsCalled
    });

    if (error) {
      console.error('❌ Error logging agent usage:', error);
      // Don't throw - logging failures shouldn't break the agent response
    } else if (data) {
      console.log(`✅ Agent usage logged: $${data.billed_cost_usd?.toFixed(6) || 0} USD, ${data.credits_debited?.toFixed(4) || 0} credits`);
    }
  } catch (error) {
    console.error('❌ Failed to log agent usage:', error);
    // Don't throw - logging failures shouldn't break the agent response
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
    const { messages = [], agentId = 'search' } = await req.json();
    // REMOVED: pdfFile - pdf-processor agent removed, use /admin/data-import instead

    console.log('✅ Request body parsed successfully');

    console.log(`📨 Received request for agent: ${agentId}, messages: ${messages.length}`);

    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      throw new Error(auth.error || 'Unauthorized');
    }

    const user = auth.user;
    const userId = auth.userId;

    // Check agent access (skip for secret key access)
    const { allowed, role } = isAdminAccess(auth)
      ? { allowed: true, role: 'admin' }
      : await checkAgentAccess(userId!, agentId);
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
    const workspaceId = await getUserWorkspaceId(userId!);
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

    // REMOVED: PDF file handling - pdf-processor agent removed, use /admin/data-import instead

    // Execute agent with STREAMING
    console.log('🚀 Creating ReadableStream for agent execution...');
    console.log('📋 Agent:', agentId);
    console.log('📋 Workspace:', workspaceId);
    console.log('📋 User:', userId);
    console.log('📋 Message count:', messages.length);
    console.log('📋 User input:', userInput.substring(0, 100) + (userInput.length > 100 ? '...' : ''));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        console.log('🎬 Stream start() called');
        let streamClosed = false;
        let heartbeatInterval: any = null;
        let cancelRequested = false;

        // Safe enqueue helper that checks if stream is still open
        const safeEnqueue = (data: any): boolean => {
          if (streamClosed) {
            // Stream already closed, silently skip
            console.log(`⏭️ Skipping chunk (stream closed): ${data.type}`);
            return false;
          }
          try {
            const chunk = encoder.encode(JSON.stringify(data) + '\n');
            controller.enqueue(chunk);
            console.log(`✅ Enqueued chunk: ${data.type}`);
            return true;
          } catch (error) {
            // Stream closed by client or network
            console.error('❌ Enqueue failed:', error);
            console.error('   Chunk type:', data.type);
            console.error('   Error message:', error instanceof Error ? error.message : 'Unknown');

            // DON'T set streamClosed = true here!
            // The stream might still be open, just had a transient error
            // Let the heartbeat and final result sending continue

            // Only stop heartbeat if it's a "cannot enqueue" error (stream truly closed)
            if (error instanceof Error && error.message.includes('cannot close or enqueue')) {
              console.warn('⚠️ Stream truly closed, stopping heartbeat');
              streamClosed = true;
              if (heartbeatInterval) {
                clearInterval(heartbeatInterval);
                heartbeatInterval = null;
              }
            }
            return false;
          }
        };

        // Send initial status IMMEDIATELY (synchronously) to keep stream alive
        console.log('📤 Sending initial status chunk...');
        if (!safeEnqueue({ type: 'status', message: 'Initializing agent...' })) {
          console.error('❌ Failed to send initial chunk, aborting');
          controller.close();
          return;
        }
        console.log('✅ Initial status chunk sent');

        // Send immediate heartbeat to keep connection alive
        safeEnqueue({ type: 'heartbeat', timestamp: Date.now() });
        console.log('💓 Sent immediate heartbeat');

        // Now run the async agent execution
        (async () => {
          let finalResult: any = null;

          try {

          // Start heartbeat to keep stream alive during long operations
          heartbeatInterval = setInterval(() => {
            if (!streamClosed) {
              console.log('💓 Sending heartbeat...');
              safeEnqueue({ type: 'heartbeat', timestamp: Date.now() });
            }
          }, 1000); // Send heartbeat every 1 second (reduced from 5s)

          try {
            // Execute agent with streaming callback
            console.log('🤖 Calling executeAgent...');
            console.log('🤖 Agent ID:', agentId);
            console.log('🤖 Workspace ID:', workspaceId);
            console.log('🤖 User input:', userInput);

            finalResult = await executeAgent(
              agentId,
              workspaceId,
              userId,
              userInput,
              anthropicMessages,
              // Streaming callback with safe enqueue
              (chunk: any) => {
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

          // Check if we got a valid result
          if (!finalResult || !finalResult.text) {
            console.error('❌ executeAgent returned null or invalid result');
            throw new Error('Agent execution failed to return a valid result');
          }

          // Save conversation
          console.log('💾 Saving conversation...');
          await saveConversation(userId, agentId, messages, finalResult.text);
          console.log('✅ Conversation saved');

          // 🧠 Extract and store memories from conversation (non-blocking)
          extractAndStoreMemories(userId, workspaceId, agentId, userInput, finalResult.text, finalResult.toolResults)
            .catch(err => console.warn('⚠️ Memory extraction failed:', err));

          // Log usage and debit credits (non-blocking)
          if (finalResult.usage && finalResult.usage.totalTokens > 0) {
            const toolsCalled = finalResult.toolResults?.map(tr => ({
              name: tr.tool,
              duration_ms: 0 // Could track tool execution time if needed
            })) || [];

            logAgentUsage(
              userId,
              workspaceId,
              agentId,
              finalResult.usage,
              toolsCalled
            ).catch(err => console.error('❌ Background usage logging failed:', err));
          }

          const modelUsed = getModelNameForAgent(agentId);
          const finalChunk = {
            type: 'final_result',
            text: finalResult.text,
            agentId,
            model: modelUsed,
            materialResults: finalResult.materialResults,
            tool_results: finalResult.toolResults,
            generation_job: finalResult.generationJob,
          };

          // Send final result - use safeEnqueue to check if stream is still open
          console.log('📤 Attempting to send final result chunk...');
          console.log('📤 Stream closed flag:', streamClosed);

          const finalSent = safeEnqueue(finalChunk);
          if (finalSent) {
            console.log('✅ Final result chunk sent successfully via stream');
            if (finalResult.generationJob) {
              console.log('🎨 Generation job included in response:', finalResult.generationJob.job_id);
            }
          } else {
            console.error('❌ Failed to send final result chunk (stream closed)');
            console.error('   Note: generation_job_created was already sent immediately');
            // Don't throw - generation job was already sent via generation_job_created chunk
          }

          // Send completion
          console.log('📤 Sending done chunk...');
          const doneSent = safeEnqueue({ type: 'done' });
          if (doneSent) {
            console.log('✅ Done chunk sent');
          } else {
            console.warn('⚠️ Failed to send done chunk (stream closed)');
          }

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
        } finally {
          // Stop heartbeat on cleanup
          if (heartbeatInterval) {
            clearInterval(heartbeatInterval);
            heartbeatInterval = null;
          }
        }
        })(); // End of async IIFE
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

