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
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || '';

import { debitExternalServiceCredits, checkCreditBalance } from '../_shared/credit-utils.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';

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
import { getSkillsForAgent, getSkillContent } from '../_shared/skills-loader.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

// We use dynamic imports for libraries that might access process.env at top-level
// This ensures the polyfill runs BEFORE these modules are loaded
const { createClient } = await import('@supabase/supabase-js');
const { ChatAnthropic } = await import('@langchain/anthropic');
const { tool } = await import('@langchain/core/tools');
const { z } = await import('zod');

// LangGraph imports for StateGraph-based agent orchestration
const { StateGraph, Annotation, END, START } = await import('@langchain/langgraph');
const { BaseMessage, HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
  onChunk?: (chunk: any) => void,
  forceToolCall?: boolean
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

    // Invoke model — force tool use only on the first iteration to avoid infinite tool loops
    const modelWithTools = tools.length > 0
      ? model.bindTools(tools, (forceToolCall && state.iteration === 0) ? { tool_choice: 'any' } : undefined)
      : model;
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

    // Send thinking status — extract plain text from Claude API content (may be string or content-block array)
    try {
      let thinkingText: string;
      if (typeof response.content === 'string') {
        thinkingText = response.content;
      } else if (Array.isArray(response.content)) {
        thinkingText = response.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n');
      } else if (response.content && typeof response.content === 'object' && 'text' in (response.content as any)) {
        thinkingText = (response.content as any).text;
      } else {
        thinkingText = '';
      }
      onChunk?.({
        type: 'assistant_thinking',
        content: thinkingText,
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
  // Demo uses Haiku for cost efficiency
  if (agentId === 'demo') {
    return modelHaiku;
  }
  // KAI, Interior, and all other agents use Sonnet for complex reasoning
  return modelSonnet;
}

// Get model name for logging/tracking
function getModelNameForAgent(agentId: string): string {
  if (agentId === 'demo') {
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
 * LangChain Tool: Visual Search using MIVAA API
 * Sends user-attached images to MIVAA's image similarity endpoint (CLIP/SigLIP embeddings)
 * Only created when images are actually attached to the request
 */
const createVisualSearchTool = (workspaceId: string, images: string[]) => {
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

        console.log(`🖼️ Visual search: query="${query || ''}", workspace="${workspaceId}", image_size=${base64Data.length} chars`);
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
          console.log(`✅ Visual search returned ${data.results?.length || 0} results`);
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
const createKnowledgeBaseSearchTool = (workspaceId: string) => {
  return tool(
    async ({ query, searchTypes = ['chunks', 'products', 'kb_docs'], topK = 5 }) => {
      try {
        const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';

        console.log(`📚 Knowledge Base search: query="${query}", workspace="${workspaceId}"`);
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

          console.log(`✅ Knowledge Base search returned ${results.totalResults} results (${results.articles.length} articles, ${results.products.length} products)`);

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

// Edit intent patterns for multi-turn conversational editing
const EDIT_INTENT_PATTERNS = [
  /change\s+the\s+(floor|wall|ceiling|furniture|tile|color|material|rug|sofa|door|window)/i,
  /replace\s+the\s+/i,
  /make\s+it\s+(more|less)\s+/i,
  /swap\s+(the|this)\s+/i,
  /now\s+(use|apply|add|make)\s+/i,
  /update\s+the\s+(floor|wall|ceiling|style|color)/i,
  /can\s+you\s+(change|update|replace|modify)/i,
  /different\s+(color|material|style|floor|wall)/i,
  /instead\s+of\s+/i,
  /keep\s+everything\s+but\s+/i,
];

function detectEditIntent(message: string): boolean {
  return EDIT_INTENT_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * LangChain Tool: Gemini Interior Design Generation
 *
 * Uses Gemini 3.1 Flash Image / Pro for:
 * - Fast text-to-image generation
 * - Multi-turn conversational image editing
 * - Floor plan → photorealistic render
 * - Two-step floor plan from text
 * - Multi-reference material generation
 */
const createGeminiGenerationTool = (
  userId: string,
  workspaceId: string,
  images: string[],
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
  pinnedMaterialImages: string[] = [],
) => {
  return tool(
    async ({ prompt, roomType, style, mode, referenceImageUrl, editInstruction, modelTier, materialImages, sqm }) => {
      try {
        console.log('✨ Starting Gemini interior design generation, mode:', mode);

        // Auto-detect edit intent if mode not specified
        let resolvedMode = mode;
        if (!resolvedMode) {
          const hasRecentGeneration = conversationImages.length > 0;
          if (detectEditIntent(prompt) && hasRecentGeneration) {
            resolvedMode = 'image-edit';
          } else if (referenceImageUrl && !editInstruction) {
            resolvedMode = 'floor-plan-render';
          } else if (prompt?.toLowerCase().includes('floor plan') || sqm) {
            resolvedMode = 'floor-plan-text';
          } else {
            resolvedMode = 'text-to-image';
          }
        }

        // For image-edit: use most recent generated image if no explicit reference
        const resolvedReferenceUrl =
          referenceImageUrl ||
          (resolvedMode === 'image-edit' ? conversationImages[conversationImages.length - 1] : undefined);

        // For floor-plan-render: use attached image if available
        const floorPlanImageUrl =
          resolvedMode === 'floor-plan-render'
            ? (resolvedReferenceUrl || (images.length > 0 ? images[0] : undefined))
            : resolvedReferenceUrl;

        const body: Record<string, unknown> = {
          mode: resolvedMode,
          prompt,
          room_type: roomType,
          style,
          sqm,
          model_tier: modelTier ?? 'fast',
          user_id: userId,
          workspace_id: workspaceId,
          ...(floorPlanImageUrl ? { reference_image_url: floorPlanImageUrl } : {}),
          ...(editInstruction ? { edit_instruction: editInstruction } : {}),
          ...((() => {
            const merged = [...(materialImages || []), ...pinnedMaterialImages].slice(0, 14);
            return merged.length > 0 ? { material_images: merged } : {};
          })()),
        };

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-interior-gemini`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          throw new Error(`Gemini generation error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Gemini generation failed');
        }

        console.log('✅ Gemini generation complete:', result.image_url);

        // Emit image result via streaming
        onChunk?.({
          type: 'gemini_image_ready',
          job_id: result.job_id,
          image_url: result.image_url,
          diagram_url: result.diagram_url,
          mode: resolvedMode,
          model: result.model,
          credits_used: result.credits_used,
        });

        const modeLabels: Record<string, string> = {
          'text-to-image': 'generated a new design',
          'image-edit': 'applied your edit',
          'floor-plan-render': 'rendered your floor plan',
          'floor-plan-text': 'created your floor plan',
        };

        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          image_url: result.image_url,
          model: result.model,
          credits_used: result.credits_used,
          message: `I've ${modeLabels[resolvedMode] || 'generated the image'}! ${modelTier === 'pro' ? 'Using Gemini Pro for maximum quality.' : 'You can ask me to refine it — e.g., "change the floor to marble" or "make it warmer".'}`,
        });
      } catch (error) {
        console.error('Gemini generation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Generation failed',
        });
      }
    },
    {
      name: 'generate_gemini',
      description: `Generate or edit interior design images using Gemini AI. Use this for:
- Fast single image generation (text-to-image)
- Editing an existing generated image ("change the floor", "make it darker", "swap the tiles")
- Converting a 2D floor plan image to a photorealistic top-down render
- Generating a floor plan from a text description (two-step)
- Generating a design using specific catalog materials as references
Prefer this over generate_3d for single fast results and iterative editing.`,
      schema: z.object({
        prompt: z.string().describe('Design description or edit instruction'),
        roomType: z.string().optional().describe('Room type (bedroom, living_room, kitchen, bathroom, etc.)'),
        style: z.string().optional().describe('Design style (modern, scandinavian, industrial, cabin, japandi, etc.)'),
        mode: z.enum(['text-to-image', 'image-edit', 'floor-plan-render', 'floor-plan-text']).optional().describe('Generation mode. Omit to auto-detect.'),
        referenceImageUrl: z.string().optional().describe('URL of image to edit or floor plan to render'),
        editInstruction: z.string().optional().describe('Specific edit instruction when mode=image-edit'),
        modelTier: z.enum(['fast', 'pro']).optional().describe('fast=Gemini 3.1 Flash (6 credits), pro=Gemini 3 Pro 4K (15 credits)'),
        materialImages: z.array(z.string()).optional().describe('URLs of catalog material images to incorporate into the design (up to 14)'),
        sqm: z.number().optional().describe('Floor area in sqm for floor plan generation'),
      }),
    }
  );
};

/**
 * LangChain Tool: Virtual Staging
 *
 * Stages an empty room with AI-generated furniture using proplabs/virtual-staging.
 * Use when the user wants to see how an empty room would look furnished.
 */
const createVirtualStagingTool = (
  userId: string,
  workspaceId: string,
  conversationImages: string[],
  onChunk?: (chunk: any) => void,
) => {
  return tool(
    async ({ sourceImageUrl, room, furnitureStyle, furnitureItems }) => {
      try {
        console.log('🏠 Starting virtual staging, room:', room, 'style:', furnitureStyle);

        // Fall back to most recent conversation image if no explicit URL given
        const resolvedImageUrl =
          sourceImageUrl || conversationImages[conversationImages.length - 1];

        if (!resolvedImageUrl) {
          return JSON.stringify({
            success: false,
            error: 'No image available to stage. Please provide a room photo or generate a design first.',
          });
        }

        const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-virtual-staging`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            source_image_url: resolvedImageUrl,
            room,
            furniture_style: furnitureStyle || 'Default (AI decides)',
            furniture_items: furnitureItems,
            workspace_id: workspaceId,
            user_id: userId,
          }),
        });

        if (!response.ok) {
          throw new Error(`Virtual staging error: ${response.statusText}`);
        }

        const result = await response.json();

        if (!result.success) {
          throw new Error(result.error || 'Virtual staging failed');
        }

        console.log('✅ Virtual staging complete:', result.image_url);

        onChunk?.({
          type: 'virtual_staging_ready',
          job_id: result.job_id,
          image_url: result.image_url,
          room: result.room,
          furniture_style: result.furniture_style,
          credits_used: result.credits_used,
        });

        return JSON.stringify({
          success: true,
          job_id: result.job_id,
          image_url: result.image_url,
          room: result.room,
          furniture_style: result.furniture_style,
          credits_used: result.credits_used,
          message: `Virtual staging complete! The ${result.room} has been staged in ${result.furniture_style} style. ${result.credits_used} credits used.`,
        });
      } catch (error) {
        console.error('Virtual staging error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Virtual staging failed',
        });
      }
    },
    {
      name: 'virtual_staging',
      description: `Stage an empty room with AI-generated furniture. Use this when the user wants to:
- See how an empty room would look with furniture
- Stage a property for real estate
- Visualize a room layout before buying furniture
Requires a room photo URL (from a previous generation or uploaded image). Ask the user for the room type and style preference if not specified.`,
      schema: z.object({
        sourceImageUrl: z.string().optional().describe('Public URL of the empty room image. If omitted, uses the most recently generated image.'),
        room: z.enum(['Living Room', 'Bedroom', 'Balcony', 'Dining Room', 'Office', 'Kitchen', 'Bathroom', 'Garden', 'Swimming Pool']).describe('Room type to stage'),
        furnitureStyle: z.enum(['Default (AI decides)', 'Modern', 'Scandinavian', 'Transitional', 'Rustic', 'Mid-Century Modern', 'Urban Industrial', 'Farmhouse', 'Coastal', 'Traditional', 'Modern Organic', 'Scandinavian Oasis', 'Transitional Luxury', 'B&W Modern', 'Farmhouse Hacienda', 'Metro Industrial', 'NYC Modern']).optional().describe('Furniture style'),
        furnitureItems: z.string().optional().describe('Specific furniture items to include, comma-separated'),
      }),
    },
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
 * Uses Claude's built-in web_search to find B2B manufacturers.
 * No extra API key required — uses ANTHROPIC_API_KEY.
 */
const createB2BManufacturerSearchTool = (_userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ country, region, category, limit = 30 }) => {
      try {
        const scope = country
          ? `in ${country}`
          : region
          ? `in the ${region} region (Central/Eastern Europe, Balkans & Turkey, Baltic & Nordic, Western & Southern Europe, or Global Manufacturing Hubs)`
          : 'across Europe and major global manufacturing hubs (Poland, Turkey, Germany, Italy, Czech Republic, Romania, Bulgaria, Greece, Baltic states, Morocco, India, China)';

        const query = `Find B2B manufacturers of ${category} ${scope}. I need actual production companies (not distributors or retailers) with their own manufacturing facilities. For each company provide: company name, website URL, city/country, main products, and any manufacturing indicators. Return up to ${limit} results.`;

        console.log(`🔍 B2B Web Search: ${category}${country ? ` in ${country}` : region ? ` (${region})` : ' (global)'}`);
        onProgress?.(`Searching for ${category} manufacturers${country ? ` in ${country}` : ''}...`);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'web-search-2025-03-05',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 4096,
            tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }],
            messages: [{ role: 'user', content: query }],
          }),
        });

        if (!response.ok) {
          const errText = await response.text();
          console.error(`❌ Web search API error ${response.status}: ${errText}`);
          return JSON.stringify({ success: false, error: `Web search failed: ${response.status}` });
        }

        const data = await response.json();
        const textContent = (data.content as any[])
          ?.filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n') || '';

        onProgress?.(`Search complete.`);

        return JSON.stringify({
          success: !!textContent,
          search_results: textContent || 'No results found.',
          query_params: { country, region, category, limit },
          source: 'claude_web_search',
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
      description: 'Search for B2B manufacturers using web search. Finds actual production companies with their websites, locations, and product info. Specify a country for focused results, a region (cee/balkans/baltic_nordic/western_southern/global) for regional search, or omit both for a broad global search.',
      schema: z.object({
        country: z.string().optional().describe('Specific country to search (e.g., "Poland", "Turkey"). Omit for broader search.'),
        region: z.string().optional().describe('Region hint: "cee", "balkans", "baltic_nordic", "western_southern", "global". Ignored if country is provided.'),
        category: z.string().describe('Product category (e.g., "ceramic tiles", "bathroom furniture", "flexible panels")'),
        limit: z.number().optional().default(30).describe('Max manufacturers to find. Default: 30'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Company Website Scrape
 * Uses Firecrawl API to extract structured information from company websites
 */
const createCompanyWebsiteScrapeTool = (userId: string, onProgress?: (status: string) => void) => {
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

        // Debit credits for Firecrawl scrape
        await debitExternalServiceCredits(supabase, userId, 'firecrawl-scrape', 'company_website_scrape', 1, { url });

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

          // Load prompt from database (editable via /admin/ai-configs)
          const scraperPrompt = await getToolPrompt(supabase, 'company_website_scraper');

          const analysisPrompt = `${scraperPrompt}

Sections to extract: ${extractSections.join(', ')}

Website content:
${markdown.substring(0, 15000)}`;

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
const createCompanyEnrichmentTool = (userId: string, onProgress?: (status: string) => void) => {
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

        // Debit credits for Apollo enrichment (charged even if no results)
        await debitExternalServiceCredits(supabase, userId, 'apollo-enrich', 'company_enrichment', 1, { company_name, domain });

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
 * ZeroBounce Email Validation Helper
 * Validates a single email address and returns detailed status
 */
async function validateEmailWithZeroBounce(
  email: string,
  onProgress?: (status: string) => void
): Promise<{
  validated: boolean;
  status?: string;
  sub_status?: string;
  free_email?: boolean;
  mx_found?: string;
  firstname?: string;
  lastname?: string;
  domain?: string;
  error?: string;
}> {
  const ZEROBOUNCE_API_KEY = Deno.env.get('ZEROBOUNCE_API_KEY');
  if (!ZEROBOUNCE_API_KEY) {
    return { validated: false, error: 'ZEROBOUNCE_API_KEY not configured' };
  }

  try {
    onProgress?.(`Validating ${email}...`);

    const validateUrl = new URL('https://api.zerobounce.net/v2/validate');
    validateUrl.searchParams.set('api_key', ZEROBOUNCE_API_KEY);
    validateUrl.searchParams.set('email', email);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(validateUrl.toString(), {
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      return { validated: false, error: `ZeroBounce API error: ${response.status}` };
    }

    const data = await response.json();
    return {
      validated: true,
      status: data.status,
      sub_status: data.sub_status,
      free_email: data.free_email,
      mx_found: data.mx_found,
      firstname: data.firstname,
      lastname: data.lastname,
      domain: data.domain,
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return { validated: false, error: 'ZeroBounce validation timeout' };
    }
    return { validated: false, error: error instanceof Error ? error.message : 'Validation failed' };
  }
}

/**
 * B2B Research Tool: Contact Discovery
 * Uses Hunter.io Email Finder + domain search, Apollo.io fallback, and ZeroBounce validation
 */
const createContactDiscoveryTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ domain, roles, first_name, last_name, full_name, company_name }) => {
      try {
        const startTime = Date.now();
        const isPersonSearch = !!(first_name || last_name || full_name);

        // ── Person-specific email finding ──────────────────────────────
        if (isPersonSearch) {
          const personLabel = full_name || `${first_name || ''} ${last_name || ''}`.trim();
          console.log(`📧 Finding email for person: ${personLabel} at ${domain || company_name}`);
          onProgress?.(`Finding email for ${personLabel}...`);

          let foundEmail: string | null = null;
          let confidence = 0;
          let position = '';
          let source = '';
          let fallbackUsed = false;

          // Step 1: Try Hunter.io Email Finder
          const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
          if (HUNTER_API_KEY) {
            onProgress?.(`Searching Hunter.io for ${personLabel}...`);
            const finderUrl = new URL('https://api.hunter.io/v2/email-finder');
            finderUrl.searchParams.set('api_key', HUNTER_API_KEY);
            if (domain) finderUrl.searchParams.set('domain', domain);
            if (company_name && !domain) finderUrl.searchParams.set('company', company_name);
            if (first_name) finderUrl.searchParams.set('first_name', first_name);
            if (last_name) finderUrl.searchParams.set('last_name', last_name);
            if (full_name && !first_name && !last_name) finderUrl.searchParams.set('full_name', full_name);

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 20000);

            try {
              const response = await fetch(finderUrl.toString(), { signal: controller.signal });
              clearTimeout(timeoutId);

              if (response.ok) {
                const data = await response.json();
                const result = data.data;
                if (result?.email) {
                  foundEmail = result.email;
                  confidence = result.score || 0;
                  position = result.position || '';
                  source = 'hunter.io';
                  console.log(`✅ Hunter Email Finder: ${foundEmail} (confidence: ${confidence})`);
                  // Debit credits for Hunter email-finder
                  await debitExternalServiceCredits(supabase, userId, 'hunter-email-finder', 'contact_discovery', 1, { domain, person: personLabel });
                }
              } else {
                console.warn(`⚠️ Hunter Email Finder error: ${response.status}`);
              }
            } catch (fetchError) {
              clearTimeout(timeoutId);
              console.warn(`⚠️ Hunter Email Finder failed:`, fetchError instanceof Error ? fetchError.message : fetchError);
            }
          }

          // Step 2: Fallback to Apollo.io People Match if Hunter failed or low confidence
          if (!foundEmail || confidence < 50) {
            const APOLLO_API_KEY = Deno.env.get('APOLLO_API_KEY');
            if (APOLLO_API_KEY) {
              onProgress?.(`Trying Apollo.io for ${personLabel}...`);
              fallbackUsed = true;

              const apolloBody: Record<string, string> = {};
              if (first_name) apolloBody.first_name = first_name;
              if (last_name) apolloBody.last_name = last_name;
              if (full_name && !first_name && !last_name) apolloBody.name = full_name;
              if (domain) apolloBody.domain = domain;
              if (company_name) apolloBody.organization_name = company_name;

              const controller = new AbortController();
              const timeoutId = setTimeout(() => controller.abort(), 20000);

              try {
                const response = await fetch('https://api.apollo.io/api/v1/people/match', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Api-Key': APOLLO_API_KEY,
                  },
                  body: JSON.stringify(apolloBody),
                  signal: controller.signal,
                });
                clearTimeout(timeoutId);

                if (response.ok) {
                  const data = await response.json();
                  const person = data.person;
                  if (person?.email) {
                    foundEmail = person.email;
                    confidence = person.email_status === 'verified' ? 95 : 60;
                    position = person.title || position;
                    source = 'apollo.io';
                    console.log(`✅ Apollo People Match: ${foundEmail} (status: ${person.email_status})`);
                    // Debit credits for Apollo people-match fallback
                    await debitExternalServiceCredits(supabase, userId, 'apollo-people-match', 'contact_discovery', 1, { domain, person: personLabel });
                  }
                } else {
                  console.warn(`⚠️ Apollo People Match error: ${response.status}`);
                }
              } catch (fetchError) {
                clearTimeout(timeoutId);
                console.warn(`⚠️ Apollo People Match failed:`, fetchError instanceof Error ? fetchError.message : fetchError);
              }
            }
          }

          if (!foundEmail) {
            const elapsed = Date.now() - startTime;
            return JSON.stringify({
              success: true,
              found: false,
              message: `No email found for ${personLabel}`,
              fallback_used: fallbackUsed,
              elapsed_ms: elapsed,
            });
          }

          // Step 3: Validate with ZeroBounce
          onProgress?.(`Validating ${foundEmail} with ZeroBounce...`);
          const validation = await validateEmailWithZeroBounce(foundEmail, onProgress);
          // Debit credits for ZeroBounce validation
          if (validation.validated) {
            await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'contact_discovery', 1, { email: foundEmail });
          }

          const elapsed = Date.now() - startTime;
          console.log(`✅ Person email discovery completed in ${elapsed}ms`);

          return JSON.stringify({
            success: true,
            found: true,
            email: foundEmail,
            first_name: first_name || full_name?.split(' ')[0] || '',
            last_name: last_name || full_name?.split(' ').slice(1).join(' ') || '',
            position,
            confidence,
            source,
            fallback_used: fallbackUsed,
            validation: validation.validated ? {
              status: validation.status,
              sub_status: validation.sub_status,
              free_email: validation.free_email,
              mx_found: validation.mx_found,
            } : { status: 'unverified', error: validation.error },
            elapsed_ms: elapsed,
          });
        }

        // ── Domain search (existing behavior, enhanced with validation) ──
        console.log(`📧 Discovering contacts for domain: ${domain}`);
        onProgress?.(`Finding contacts for ${domain}...`);

        const HUNTER_API_KEY = Deno.env.get('HUNTER_API_KEY');
        if (!HUNTER_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'HUNTER_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

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
        const emails = data.data?.emails || [];
        const organization = data.data?.organization || '';
        const pattern = data.data?.pattern || '';

        // Debit credits for Hunter domain-search
        await debitExternalServiceCredits(supabase, userId, 'hunter-domain-search', 'contact_discovery', 1, { domain });

        const priorityRoles = roles || ['export', 'sales', 'director', 'manager', 'owner', 'ceo', 'founder'];

        const scoredContacts = emails.map((email: any) => {
          const position = (email.position || '').toLowerCase();
          let roleScore = 0;

          for (let i = 0; i < priorityRoles.length; i++) {
            if (position.includes(priorityRoles[i].toLowerCase())) {
              roleScore = priorityRoles.length - i;
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

        scoredContacts.sort((a: any, b: any) => {
          if (b.role_score !== a.role_score) return b.role_score - a.role_score;
          return b.confidence - a.confidence;
        });

        // Validate top 5 contacts with ZeroBounce
        const topContacts = scoredContacts.slice(0, 10);
        const MAX_VALIDATIONS = 5;
        onProgress?.(`Validating top ${Math.min(MAX_VALIDATIONS, topContacts.length)} emails with ZeroBounce...`);

        let validatedCount = 0;
        for (let i = 0; i < topContacts.length && validatedCount < MAX_VALIDATIONS; i++) {
          if (topContacts[i].email) {
            const validation = await validateEmailWithZeroBounce(topContacts[i].email);
            topContacts[i].validation = validation.validated ? {
              status: validation.status,
              sub_status: validation.sub_status,
              free_email: validation.free_email,
              mx_found: validation.mx_found,
            } : { status: 'unverified', error: validation.error };
            validatedCount++;
          }
        }
        // Debit credits for all ZeroBounce validations in batch
        if (validatedCount > 0) {
          await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'contact_discovery', validatedCount, { domain });
        }

        const elapsed = Date.now() - startTime;
        console.log(`✅ Contact discovery completed in ${elapsed}ms`);

        return JSON.stringify({
          success: true,
          domain,
          organization,
          email_pattern: pattern,
          contacts: topContacts,
          total_found: emails.length,
          validated_count: validatedCount,
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
      description: 'Find email addresses for a company domain or a specific person. Can search all contacts at a domain, or find a specific person\'s email by name. Falls back to Apollo.io if Hunter.io has low confidence. Validates all discovered emails with ZeroBounce.',
      schema: z.object({
        domain: z.string().optional().describe('Company website domain (e.g., "paradyz.com")'),
        roles: z.array(z.string()).optional().describe('Priority roles to find in domain search (e.g., ["export", "sales", "director"])'),
        first_name: z.string().optional().describe('First name of the specific person to find'),
        last_name: z.string().optional().describe('Last name of the specific person to find'),
        full_name: z.string().optional().describe('Full name of the person (alternative to first_name + last_name)'),
        company_name: z.string().optional().describe('Company name (used when domain is not available)'),
      }),
    }
  );
};

/**
 * B2B Research Tool: Email Validation
 * Uses ZeroBounce API to validate email addresses on demand
 */
const createEmailValidateTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ email, emails }) => {
      try {
        const emailsToValidate = emails || (email ? [email] : []);
        if (emailsToValidate.length === 0) {
          return JSON.stringify({ success: false, error: 'No email(s) provided' });
        }

        // Cap at 10 to avoid excessive API usage
        const capped = emailsToValidate.slice(0, 10);
        console.log(`✉️ Validating ${capped.length} email(s) with ZeroBounce`);
        const startTime = Date.now();

        const ZEROBOUNCE_API_KEY = Deno.env.get('ZEROBOUNCE_API_KEY');
        if (!ZEROBOUNCE_API_KEY) {
          return JSON.stringify({
            success: false,
            error: 'ZEROBOUNCE_API_KEY not configured. Please add it to Supabase secrets.',
          });
        }

        onProgress?.(`Validating ${capped.length} email(s)...`);

        const results = [];
        for (const addr of capped) {
          const validation = await validateEmailWithZeroBounce(addr);
          results.push({
            email: addr,
            ...validation,
          });
        }

        const elapsed = Date.now() - startTime;
        const validCount = results.filter((r) => r.status === 'valid').length;
        const invalidCount = results.filter((r) => r.status === 'invalid').length;
        console.log(`✅ Email validation completed in ${elapsed}ms: ${validCount} valid, ${invalidCount} invalid`);

        // Debit credits for all ZeroBounce validations
        if (results.length > 0) {
          await debitExternalServiceCredits(supabase, userId, 'zerobounce-validate', 'email_validate', results.length, { email_count: results.length });
        }

        return JSON.stringify({
          success: true,
          results,
          total: results.length,
          valid_count: validCount,
          invalid_count: invalidCount,
          elapsed_ms: elapsed,
        });
      } catch (error) {
        console.error('Email validation error:', error);
        return JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Email validation failed',
        });
      }
    },
    {
      name: 'email_validate',
      description: 'Validate email addresses using ZeroBounce. Returns detailed status: valid, invalid, catch-all, spamtrap, abuse, do_not_mail, or unknown. Use this to verify emails before outreach.',
      schema: z.object({
        email: z.string().optional().describe('Single email address to validate'),
        emails: z.array(z.string()).optional().describe('Array of email addresses to validate (max 10)'),
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

// ═══════════════════════════════════════════════════════════════
// SEO Article Pipeline Tools
// ═══════════════════════════════════════════════════════════════

/** Helper to call SEO edge functions from agent tools */
async function callSEOFunction(functionName: string, body: any, timeoutMs = 120_000): Promise<any> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return await response.json();
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      return { success: false, error: `${functionName} timed out after ${timeoutMs / 1000}s` };
    }
    return { success: false, error: error.message };
  }
}

/**
 * SEO Tool: Keyword Research
 * Calls seo-research edge function → DataForSEO API
 */
const createSEOKeywordResearchTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, target_keyword, language_code, location_code }) => {
      try {
        console.log(`🔍 SEO keyword research: "${target_keyword}" (topic: ${topic})`);
        onProgress?.(`Researching keywords for "${target_keyword}"...`);

        const result = await callSEOFunction('seo-research', {
          topic,
          target_keyword,
          language_code: language_code || 'en',
          location_code: location_code || 2840,
          user_id: userId,
        }, 60_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Keyword research failed' });
        }

        onProgress?.(`Found ${result.data?.research?.totalKeywords || 0} keywords for "${target_keyword}"`);

        return JSON.stringify({
          success: true,
          research_id: result.data?.research_id,
          summary: {
            total_keywords: result.data?.research?.totalKeywords || 0,
            total_volume: result.data?.research?.totalAddressableVolume || 0,
            clusters: result.data?.research?.clusters?.length || 0,
            top_keywords: result.data?.research?.keywords?.slice(0, 10)?.map((k: any) => ({
              keyword: k.keyword,
              volume: k.searchVolume,
              difficulty: k.difficulty,
              opportunity: k.opportunityScore,
            })),
            paa_questions: result.data?.research?.paaQuestions?.slice(0, 5),
            competitors: result.data?.research?.competitors?.slice(0, 5)?.map((c: any) => ({
              url: c.url,
              title: c.title,
              position: c.position,
            })),
          },
        });
      } catch (error: any) {
        console.error('SEO keyword research error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_keyword_research',
      description: 'Research keywords for SEO article writing. Uses DataForSEO to find keyword volumes, difficulty, related keywords, People Also Ask questions, and SERP competitors. Always run this first before planning or writing an article.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable building materials")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        language_code: z.string().optional().describe('Language code, defaults to "en"'),
        location_code: z.number().optional().describe('DataForSEO location code, defaults to 2840 (US)'),
      }),
    }
  );
};

/**
 * SEO Tool: Article Planner
 * Calls seo-plan edge function → Gemini structured output
 */
const createSEOArticlePlannerTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ topic, target_keyword, keyword_research, content_brief }) => {
      try {
        console.log(`📋 SEO article planning: "${target_keyword}"`);
        onProgress?.(`Planning article structure for "${target_keyword}"...`);

        const result = await callSEOFunction('seo-plan', {
          topic,
          target_keyword,
          keyword_research,
          content_brief,
          user_id: userId,
        }, 60_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Article planning failed' });
        }

        onProgress?.(`Article plan created: "${result.data?.plan?.metaTitle || target_keyword}"`);

        return JSON.stringify({
          success: true,
          plan: result.data?.plan,
        });
      } catch (error: any) {
        console.error('SEO article planning error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_article_planner',
      description: 'Create a detailed article plan/outline from keyword research data. Uses Gemini to generate structured article plan with headings, sections, meta tags, and keyword targets. Requires keyword research data from seo_keyword_research tool.',
      schema: z.object({
        topic: z.string().describe('The article topic'),
        target_keyword: z.string().describe('Primary target keyword'),
        keyword_research: z.any().describe('Full keyword research result from seo_keyword_research tool'),
        content_brief: z.any().optional().describe('Optional content brief with brand voice, audience, and business context'),
      }),
    }
  );
};

/**
 * SEO Tool: Article Writer
 * Calls seo-write edge function → Claude Sonnet
 */
const createSEOArticleWriterTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ article_plan, content_brief }) => {
      try {
        console.log(`✍️ SEO article writing: "${article_plan?.metaTitle || 'article'}"`);
        onProgress?.('Writing article with Claude Sonnet...');

        const result = await callSEOFunction('seo-write', {
          article_plan,
          content_brief,
          user_id: userId,
        }, 120_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Article writing failed' });
        }

        onProgress?.(`Article written: ${result.data?.word_count || 0} words`);

        return JSON.stringify({
          success: true,
          markdown_content: result.data?.markdown_content,
          word_count: result.data?.word_count,
        });
      } catch (error: any) {
        console.error('SEO article writing error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_article_writer',
      description: 'Write a full SEO article from an article plan. Uses Claude Sonnet to generate high-quality long-form content following the plan structure. Requires an article plan from seo_article_planner tool.',
      schema: z.object({
        article_plan: z.any().describe('Full article plan from seo_article_planner tool'),
        content_brief: z.any().optional().describe('Optional content brief with brand voice and audience details'),
      }),
    }
  );
};

/**
 * SEO Tool: Content Analyzer
 * Calls seo-analyze edge function → scoring + optional auto-fix
 */
const createSEOContentAnalyzerTool = (userId: string, onProgress?: (status: string) => void) => {
  return tool(
    async ({ content_markdown, article_plan, content_brief, auto_fix, max_iterations }) => {
      try {
        console.log('📊 SEO content analysis starting...');
        onProgress?.('Analyzing article content for SEO quality...');

        const result = await callSEOFunction('seo-analyze', {
          content_markdown,
          article_plan,
          content_brief,
          auto_fix: auto_fix ?? false,
          max_iterations: max_iterations ?? 2,
          user_id: userId,
        }, 180_000);

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Content analysis failed' });
        }

        const analysis = result.data?.analysis;
        onProgress?.(`Analysis complete: score ${analysis?.overallScore || 0}/100`);

        return JSON.stringify({
          success: true,
          overall_score: analysis?.overallScore,
          seo_score: analysis?.seoScore,
          readability_score: analysis?.readabilityScore,
          issues_count: analysis?.fixes?.length || 0,
          critical_issues: analysis?.fixes?.filter((f: any) => f.severity === 'critical')?.length || 0,
          fixes: analysis?.fixes?.slice(0, 10),
          improved_content: result.data?.improved_content,
          iterations: result.data?.iterations || 0,
        });
      } catch (error: any) {
        console.error('SEO content analysis error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'seo_content_analyzer',
      description: 'Analyze SEO article content for quality, keyword optimization, readability, and SEO best practices. Scores content 0-100 and identifies issues. Can auto-fix content if score is below 70. Requires article content and plan.',
      schema: z.object({
        content_markdown: z.string().describe('The article content in markdown format'),
        article_plan: z.any().describe('The article plan used to write the content'),
        content_brief: z.any().optional().describe('Optional content brief'),
        auto_fix: z.boolean().optional().describe('Auto-fix content if score is below 70 (default: false)'),
        max_iterations: z.number().optional().describe('Max fix iterations (default: 2, max: 3)'),
      }),
    }
  );
};

/**
 * SEO Tool: Full Pipeline (Async)
 * Calls seo-pipeline edge function → runs all stages, returns article_id immediately
 * Emits article_generation_started chunk for frontend polling
 */
const createSEOPipelineTool = (userId: string, onChunk?: (chunk: any) => void) => {
  return tool(
    async ({ topic, target_keyword, content_brief, auto_fix, max_fix_iterations, content_type }) => {
      try {
        console.log(`🚀 SEO pipeline starting: "${target_keyword}"`);

        const result = await callSEOFunction('seo-pipeline', {
          topic,
          target_keyword,
          content_brief,
          auto_fix: auto_fix ?? true,
          max_fix_iterations: max_fix_iterations ?? 2,
          content_type: content_type || 'guide',
          user_id: userId,
        }, 300_000); // 5 min timeout for full pipeline

        if (!result.success) {
          return JSON.stringify({ success: false, error: result.error || 'Pipeline failed' });
        }

        const articleId = result.data?.article_id;

        // Emit chunk for frontend to start polling
        try {
          onChunk?.({
            type: 'article_generation_started',
            article_id: articleId,
            topic: topic,
            target_keyword: target_keyword,
            estimated_time_seconds: 120,
          });
        } catch (e) {
          console.error('Failed to send article_generation_started chunk:', e);
        }

        return JSON.stringify({
          success: true,
          article_id: articleId,
          message: `SEO article pipeline started for "${target_keyword}". The article is being generated in the background — you can track progress in the viewer above.`,
        });
      } catch (error: any) {
        console.error('SEO pipeline error:', error);
        return JSON.stringify({ success: false, error: error.message });
      }
    },
    {
      name: 'create_seo_article',
      description: 'Run the full SEO article pipeline: keyword research → planning → writing → analysis with auto-fix. This is an async operation — it creates an article record and processes in the background. Use this when the user wants a complete SEO article generated end-to-end. For individual steps, use the specific tools instead.',
      schema: z.object({
        topic: z.string().describe('The broad topic or niche (e.g. "sustainable architecture")'),
        target_keyword: z.string().describe('The primary keyword to target (e.g. "recycled concrete aggregates")'),
        content_brief: z.any().optional().describe('Optional content brief with audience, brand voice, business context'),
        auto_fix: z.boolean().optional().describe('Auto-fix content if quality score is below 70 (default: true)'),
        max_fix_iterations: z.number().optional().describe('Max auto-fix iterations (default: 2)'),
        content_type: z.string().optional().describe('Article type: guide, listicle, comparison, how-to, case-study (default: guide)'),
      }),
    }
  );
};

/**
 * Agent Configurations with RBAC
 */
/**
 * LangChain Tool: Dispatch Background Task
 *
 * Admin-only. Called by KAI when a task is too large or time-consuming
 * to complete inline. Creates an agent_runs row and fires the
 * background-agent-runner edge function asynchronously.
 *
 * The user receives an immediate acknowledgement with the run_id
 * so they can track progress on the admin monitoring page.
 */
const KAI_SYSTEM_AGENT_ID = '00000000-0000-0000-0000-000000000001';

const createDispatchBackgroundTaskTool = (userId: string, workspaceId: string, conversationId: string | null) => {
  return tool(
    async ({ task_prompt, model_override, context_snippet, reason }) => {
      try {
        console.log(`🤖 Dispatching background task: "${task_prompt.slice(0, 80)}…"`);

        // 1. Create an agent_runs row in pending state
        const { data: run, error: runError } = await supabase
          .from('agent_runs')
          .insert({
            agent_id:     KAI_SYSTEM_AGENT_ID,
            status:       'pending',
            triggered_by: 'chat',
            input_data:   {
              task_prompt,
              context_snippet: context_snippet ?? '',
              model_override:  model_override ?? null,
              dispatched_by:   userId,
              conversation_id: conversationId,   // used to post result back to chat
            },
            workspace_id: workspaceId,
          })
          .select('id')
          .single();

        if (runError || !run) {
          throw new Error(`Failed to create run: ${runError?.message}`);
        }

        const runId = run.id as string;

        // 2. Fire-and-forget to background-agent-runner
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        fetch(`${supabaseUrl}/functions/v1/background-agent-runner`, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            agent_id:     KAI_SYSTEM_AGENT_ID,
            run_id:       runId,
            triggered_by: 'chat',
            input_data:   { task_prompt, context_snippet, model_override },
          }),
        }).catch(err => console.error('[dispatch_background_task] Fire-and-forget error:', err));

        console.log(`✅ Background task dispatched. run_id=${runId}`);

        return JSON.stringify({
          success:    true,
          run_id:     runId,
          message:    `Background task started. I'll post the results back here in this conversation once complete${conversationId ? '' : ' (check Admin → Background Tasks to monitor progress)'}.`,
          task_preview: task_prompt.slice(0, 120),
          reason,
        });
      } catch (error) {
        console.error('[dispatch_background_task] Error:', error);
        return JSON.stringify({
          success: false,
          error:   error instanceof Error ? error.message : String(error),
        });
      }
    },
    {
      name: 'dispatch_background_task',
      description: [
        'Dispatch a complex or long-running task to run asynchronously in the background.',
        'Use this when: (1) the task would take more than ~30 seconds, (2) it requires many iterations or large batch processing,',
        '(3) the user explicitly asks to run something in the background, or (4) it is a repeatable scheduled operation.',
        'The task will be executed by the KAI background agent using the full tool suite.',
        'Returns immediately with a run_id the user can use to track progress.',
      ].join(' '),
      schema: z.object({
        task_prompt:      z.string().describe('The complete task description — be detailed, include all context the background agent will need.'),
        reason:           z.string().describe('One sentence explaining WHY you are dispatching this to the background (e.g., "requires processing 500 products which would exceed the response time limit").'),
        model_override:   z.string().optional().describe('Specific model to use, e.g. claude-sonnet-4-6, gpt-4o, gemini-1.5-pro. Omit to use default.'),
        context_snippet:  z.string().optional().describe('Relevant excerpt from the current conversation for context (max 500 chars).'),
      }),
    }
  );
};

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
// Search + Insights + SEO merged into unified KAI agent
const AGENT_CONFIGS: Record<string, AgentConfig> = {
  kai: {
    id: 'kai',
    name: 'KAI Agent',
    description: 'Material intelligence — search, insights, research, analytics, SEO, and B2B',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: [
      // Core tools (all users)
      'knowledge_base_search', 'material_search', 'visual_search',
      // Sub-agent orchestration (admin/owner only — gated at injection time)
      'research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis',
      // B2B Research (admin/owner only)
      'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment',
      'contact_discovery', 'email_validate', 'save_to_crm',
      // SEO (admin/owner only)
      'create_seo_article', 'seo_keyword_research', 'seo_article_planner',
      'seo_article_writer', 'seo_content_analyzer',
      // Background task dispatch (admin/owner only)
      'dispatch_background_task',
    ],
    // systemPrompt loaded from database (key: 'kai')
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
    tools: ['material_search', 'generate_3d'],
    // systemPrompt loaded from database
    // NOTE: generate_3d triggers async generation and returns job ID immediately
    // NOTE: material_search is only injected when user message contains keywords like "find materials"
  },
  // Legacy aliases — old frontends sending 'search', 'insights', or 'seo' route to KAI
  search: {
    id: 'kai',
    name: 'KAI Agent',
    description: 'Legacy alias → KAI',
    allowedRoles: ['viewer', 'member', 'admin', 'owner'],
    tools: [],
  },
  insights: {
    id: 'kai',
    name: 'KAI Agent',
    description: 'Legacy alias → KAI',
    allowedRoles: ['admin', 'owner'],
    tools: [],
  },
  seo: {
    id: 'kai',
    name: 'KAI Agent',
    description: 'Legacy alias → KAI',
    allowedRoles: ['admin', 'owner'],
    tools: [],
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
  images: string[], // User-attached images as data URLs
  userRole: string, // User's workspace role for RBAC tool gating
  onChunk?: (chunk: any) => void,
  pinnedMaterialImages: string[] = [], // Catalog product images pinned by user for Gemini multi-reference
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
  let config = AGENT_CONFIGS[agentId];
  if (!config) {
    throw new Error(`Unknown agent: ${agentId}`);
  }

  // Resolve legacy aliases (search/insights/seo → kai)
  if (config.id !== agentId) {
    console.log(`🔄 Legacy alias: ${agentId} → ${config.id}`);
    agentId = config.id;
    config = AGENT_CONFIGS[agentId];
  }

  // Extract previously generated image URLs from assistant messages (for edit mode)
  const conversationImages: string[] = messages
    .filter((m: any) => m.role === 'assistant')
    .flatMap((m: any) => {
      // Check tool_calls / tool_results for gemini_image_ready or generation_job image URLs
      if (Array.isArray(m.tool_results)) {
        return m.tool_results
          .filter((tr: any) => tr.image_url)
          .map((tr: any) => tr.image_url as string);
      }
      return [];
    });

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
    // B2B check FIRST — must precede generic product keywords (e.g. 'tile' appears in "Tiles companies")
    if (lowerInput.includes('compan') || lowerInput.includes('manufactur') || lowerInput.includes('spain') || lowerInput.includes('find me')) {
      return { text: "Searching for B2B manufacturers using web search...\n\nFound **8 verified manufacturers** matching your criteria with full contact details, revenue data, certifications, and lead times.\n\nDEMO_DATA: {\"data\":{\"command\":\"b2b_results\"}}" };
    } else if (lowerInput.includes('article') || lowerInput.includes('marketing') || lowerInput.includes('seo') || lowerInput.includes('content')) {
      return { text: "I'm creating a comprehensive SEO article for you. Our AI pipeline analyzed 12 high-value keywords (45,200 combined monthly searches), structured content for featured snippets, and optimized for top-3 ranking potential.\n\n**Article: The Ultimate Guide to Accessories Marketing**\n\nKeyword targeting, content structure, meta tags, and readability score all optimized.\n\nDEMO_DATA: {\"data\":{\"command\":\"seo_article\"}}" };
    } else if (lowerInput.includes('heat') || lowerInput.includes('pump') || lowerInput.includes('hvac')) {
      return { text: "Here's a comparison of our heat pump models.\n\nDEMO_DATA: {\"data\":{\"command\":\"heat_pumps\"}}" };
    } else if (lowerInput.includes('3d') || lowerInput.includes('design') || lowerInput.includes('room')) {
      return { text: "Here's a modern living room 3D design.\n\nDEMO_DATA: {\"data\":{\"command\":\"3d_design\"}}" };
    } else if (lowerInput.includes('wood') || lowerInput.includes('green') || lowerInput.includes('egger')) {
      return { text: "Here are 5 Egger wood materials in green tones, ideal for sustainable projects.\n\nDEMO_DATA: {\"data\":{\"command\":\"green_wood\"}}" };
    } else if (lowerInput.includes('cement') || lowerInput.includes('tile') || lowerInput.includes('grey')) {
      return { text: "I found 5 cement-based tiles in grey color. These are perfect for modern interiors.\n\nDEMO_DATA: {\"data\":{\"command\":\"cement_tiles\"}}" };
    } else {
      return { text: "I can show you demo content. Try asking for:\n- Cement tiles\n- Green wood materials\n- Heat pumps\n- 3D room designs\n- SEO article (e.g. 'I want an article for Accessories Marketing')\n- B2B research (e.g. 'Find me Tiles companies in Spain')" };
    }
  }

  // Bind tools based on agent configuration with RBAC gating
  const tools: any[] = [];
  const isAdmin = userRole === 'admin' || userRole === 'owner';

  console.log(`🔧 Tool injection starting for agent: ${agentId}, role: ${userRole}, isAdmin: ${isAdmin}`);
  console.log(`📝 User input: "${userInput}"`);
  console.log(`🛠️ Agent tools config: ${JSON.stringify(config.tools)}`);
  console.log(`🖼️ Attached images: ${images.length}`);

  // --- Core tools (all users) ---

  // Knowledge Base search - always add first so agent checks KB before answering
  if (config.tools.includes('knowledge_base_search')) {
    console.log(`📚 Knowledge Base search enabled for ${agentId}`);
    tools.push(createKnowledgeBaseSearchTool(workspaceId));
  }

  // Material search (text-based 7-vector fusion)
  if (config.tools.includes('material_search')) {
    // For Interior Designer: Only add tool if user explicitly asks for materials
    if (agentId === 'interior-designer') {
      const userInputLower = userInput.toLowerCase();
      const materialSearchKeywords = ['find materials', 'search for materials', 'show me products', 'what materials', 'matching materials', 'search materials'];
      const shouldEnableMaterialSearch = materialSearchKeywords.some(keyword => userInputLower.includes(keyword));
      if (shouldEnableMaterialSearch) {
        console.log('✅ Material search enabled for Interior Designer (user explicitly asked)');
        tools.push(createSearchTool(workspaceId));
      } else {
        console.log('⏭️ Material search disabled for Interior Designer (user did not ask for materials)');
      }
    } else {
      // For KAI and other agents: Always available (LLM decides when to use)
      console.log(`✅ Material search enabled for ${agentId}`);
      tools.push(createSearchTool(workspaceId));
    }
  }

  // Visual search (image similarity via CLIP/SigLIP) — only when images are attached
  if (config.tools.includes('visual_search') && images.length > 0) {
    console.log(`🖼️ Visual search enabled for ${agentId} (${images.length} image(s) attached)`);
    tools.push(createVisualSearchTool(workspaceId, images));
  }

  // --- Interior Designer tools ---
  if (config.tools.includes('generate_3d')) {
    tools.push(create3DGenerationTool(userId, workspaceId, onChunk));
    tools.push(createGeminiGenerationTool(userId, workspaceId, images, conversationImages, onChunk, pinnedMaterialImages));
    tools.push(createVirtualStagingTool(userId, workspaceId, conversationImages, onChunk));
    tools.push(createGenerationStatusTool());
  }

  // --- Admin-only tools (gated by RBAC) ---

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

  if (isAdmin) {
    // Sub-agent orchestration tools
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

    // B2B Research tools
    if (config.tools.includes('b2b_manufacturer_search')) {
      tools.push(createB2BManufacturerSearchTool(userId, sendProgress));
    }
    if (config.tools.includes('company_website_scrape')) {
      tools.push(createCompanyWebsiteScrapeTool(userId, sendProgress));
    }
    if (config.tools.includes('company_enrichment')) {
      tools.push(createCompanyEnrichmentTool(userId, sendProgress));
    }
    if (config.tools.includes('contact_discovery')) {
      tools.push(createContactDiscoveryTool(userId, sendProgress));
    }
    if (config.tools.includes('email_validate')) {
      tools.push(createEmailValidateTool(userId, sendProgress));
    }
    if (config.tools.includes('save_to_crm')) {
      tools.push(createSaveToCRMTool(userId, sendProgress));
    }

    // SEO Article Pipeline tools
    if (config.tools.includes('seo_keyword_research')) {
      tools.push(createSEOKeywordResearchTool(userId, sendProgress));
    }
    if (config.tools.includes('seo_article_planner')) {
      tools.push(createSEOArticlePlannerTool(userId, sendProgress));
    }
    if (config.tools.includes('seo_article_writer')) {
      tools.push(createSEOArticleWriterTool(userId, sendProgress));
    }
    if (config.tools.includes('seo_content_analyzer')) {
      tools.push(createSEOContentAnalyzerTool(userId, sendProgress));
    }
    if (config.tools.includes('create_seo_article')) {
      tools.push(createSEOPipelineTool(userId, onChunk));
    }

    // Background task dispatch
    if (config.tools.includes('dispatch_background_task')) {
      tools.push(createDispatchBackgroundTaskTool(userId, workspaceId, conversation_id));
    }
  }

  // --- Legacy/utility tools ---
  if (config.tools.includes('queryDatabase')) {
    tools.push(createQueryDatabaseTool());
  }
  if (config.tools.includes('checkServerHealth')) {
    tools.push(createCheckServerHealthTool());
  }
  if (config.tools.includes('querySentry')) {
    tools.push(createQuerySentryTool());
  }
  if (config.tools.includes('estimate_cost')) {
    tools.push(createCostEstimationTool(workspaceId));
  }

  console.log(`🔧 Total tools injected: ${tools.length} (${tools.map(t => t.name).join(', ')})`);

  // Select model based on agent type
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

  // Create the agent graph — force tool use for interior-designer (prevents JARVIS text-first responses)
  const forceToolCall = agentId === 'interior-designer' && tools.length > 0;
  const agentGraph = createAgentGraph(selectedModel, tools, onChunk, forceToolCall);

  // Convert messages to LangChain format, with multimodal support for images
  const lastUserMsgIndex = messages.reduce((last: number, msg: any, i: number) =>
    msg.role === 'user' ? i : last, -1);

  const langchainMessages = messages.map((msg: any, idx: number) => {
    if (msg.role === 'user') {
      // For the last user message, attach images as multimodal content blocks
      if (idx === lastUserMsgIndex && images.length > 0) {
        const content: any[] = [{ type: 'text', text: msg.content || '' }];
        for (const img of images) {
          // img is a data URL like "data:image/jpeg;base64,/9j/4AAQ..."
          content.push({
            type: 'image_url',
            image_url: { url: img },
          });
        }
        console.log(`🖼️ Multimodal message: ${content.length - 1} image(s) attached to last user message`);
        return new HumanMessage({ content });
      }
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
 * Log agent usage and debit credits with retry
 * Uses the log_agent_usage RPC function for atomic logging + credit debit
 * Retries up to 3 times on failure to prevent free usage from RPC errors
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
  const MAX_RETRIES = 3;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(`💰 Logging agent usage (attempt ${attempt}/${MAX_RETRIES}): ${usage.inputTokens} input, ${usage.outputTokens} output tokens`);

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
        console.error(`❌ Error logging agent usage (attempt ${attempt}):`, error);
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
          continue;
        }
        console.error('❌ All retry attempts exhausted for agent usage logging');
        return;
      }

      if (data) {
        console.log(`✅ Agent usage logged: $${data.billed_cost_usd?.toFixed(6) || 0} USD, ${data.credits_debited?.toFixed(4) || 0} credits (model: ${data.model_matched || usage.modelName})`);
      }
      return; // Success - exit retry loop
    } catch (error) {
      console.error(`❌ Failed to log agent usage (attempt ${attempt}):`, error);
      if (attempt < MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt));
        continue;
      }
      console.error('❌ All retry attempts exhausted for agent usage logging');
    }
  }
}

/**
 * Main handler
 */
Deno.serve(async (req) => {
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
    const { messages = [], agentId = 'kai', images = [], conversation_id = null, pinned_material_images = [] } = await req.json();
    // images: string[] — user-attached images as data URLs (data:image/jpeg;base64,...)
    // conversation_id: string | null — Supabase conversation ID, used to post background task results back
    // pinned_material_images: string[] — catalog product image URLs pinned by user for Gemini multi-reference generation

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
              images, // User-attached images as data URLs
              role as string, // User's workspace role for RBAC tool gating
              // Streaming callback with safe enqueue
              (chunk: any) => {
                if (!streamClosed) {
                  safeEnqueue(chunk);
                }
              },
              pinned_material_images, // Catalog product images pinned by user
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

          // 🔄 Emit flow events based on tool results (fire-and-forget)
          if (finalResult.toolResults?.length) {
            for (const tr of finalResult.toolResults) {
              if (tr.tool === 'material_search' && tr.result?.results?.length) {
                emitFlowEvent('agent_search_completed', {
                  query: tr.args?.query || userInput,
                  result_count: tr.result.results.length,
                  agent_id: agentId,
                  user_id: userId,
                }).catch(() => {});
                emitFlowEvent('search_executed', {
                  query: tr.args?.query || userInput,
                  result_count: tr.result.results.length,
                  search_type: 'agent',
                  agent_id: agentId,
                  user_id: userId,
                }).catch(() => {});
              }
              if (tr.tool === 'generate_3d' && tr.result?.success) {
                emitFlowEvent('model_3d_created', {
                  job_id: tr.result.job_id,
                  model_count: tr.result.model_count,
                  prompt: tr.args?.prompt,
                  agent_id: agentId,
                  user_id: userId,
                }).catch(() => {});
              }
            }
          }

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

