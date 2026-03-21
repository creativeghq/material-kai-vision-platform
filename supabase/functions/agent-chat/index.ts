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

// Polyfill process.env for npm packages
(globalThis as any).process = {
  env: {
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY
  }
};


// NOW import dependencies (after polyfill is set up)
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { getSkillsForAgent, getSkillContent } from '../_shared/skills-loader.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';

// Tool factory imports — extracted from this file for maintainability
import { createSearchTool, createVisualSearchTool, createKnowledgeBaseSearchTool } from '../_shared/tools/search-tools.ts';
import { create3DGenerationTool, createGeminiGenerationTool, createVirtualStagingTool, createGenerationStatusTool } from '../_shared/tools/generation-tools.ts';
import { createCheckServerHealthTool, createQuerySentryTool, createCostEstimationTool } from '../_shared/tools/ops-tools.ts';
import { createQueryDatabaseTool } from '../_shared/tools/database-tools.ts';
import { createResearchAnalysisTool, createAnalyticsAnalysisTool, createBusinessAnalysisTool, createProductAnalysisTool } from '../_shared/tools/sub-agent-tools.ts';
import { createB2BManufacturerSearchTool, createCompanyWebsiteScrapeTool, createCompanyEnrichmentTool, createContactDiscoveryTool, createEmailValidateTool, createSaveToCRMTool } from '../_shared/tools/b2b-tools.ts';
import { createSEOKeywordResearchTool, createSEOArticlePlannerTool, createSEOArticleWriterTool, createSEOContentAnalyzerTool, createSEOPipelineTool } from '../_shared/tools/seo-tools.ts';
import { createDispatchBackgroundTaskTool } from '../_shared/tools/background-tools.ts';

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

    // Send iteration status
    try {
      onChunk?.({
        type: 'iteration',
        iteration,
        maxIterations,
        message: `Processing step ${iteration}/${maxIterations}...`
      });
    } catch (e) {
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


    const toolMessages: any[] = [];
    const newToolResults: any[] = [];
    const newProducts: any[] = [];
    let generationJob = null;

    for (const toolCall of toolCalls) {

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

  // Claude Sonnet 4.5 - Full model for complex tasks
  modelSonnet = new ChatAnthropic({
    model: 'claude-sonnet-4-5-20250929',
    temperature: 1,
    maxTokens: 4096,
  });
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


  // --- Core tools (all users) ---

  // Knowledge Base search - always add first so agent checks KB before answering
  if (config.tools.includes('knowledge_base_search')) {
    tools.push(createKnowledgeBaseSearchTool(workspaceId));
  }

  // Material search (text-based 7-vector fusion)
  if (config.tools.includes('material_search')) {
    // For Interior Designer: Only add tool when user is looking for catalog materials
    // (prevents agent from triggering material search during generation conversations)
    if (agentId === 'interior-designer') {
      const userInputLower = userInput.toLowerCase();
      const materialSearchKeywords = [
        'find materials', 'search for materials', 'show me products', 'what materials',
        'matching materials', 'search materials', 'find me tiles', 'find me flooring',
        'find me marble', 'find me wood', 'find me stone', 'find me fabric',
        'similar products', 'similar materials', 'catalog', 'browse materials',
        'what products', 'find products', 'search products', 'recommend materials',
        'suggest materials', 'what tiles', 'what flooring', 'show tiles', 'show flooring',
        'find catalog', 'material catalog', 'show catalog',
      ];
      // Also match patterns like "find me X" / "show me X" / "what X should I use"
      const materialSearchRegex = /\b(find|search|show|browse|recommend|suggest)\b.{0,20}\b(tile|floor|marble|wood|stone|fabric|wallpaper|carpet|paint|material|product)/i;
      const shouldEnableMaterialSearch =
        materialSearchKeywords.some(keyword => userInputLower.includes(keyword)) ||
        materialSearchRegex.test(userInputLower);
      if (shouldEnableMaterialSearch) {
        tools.push(createSearchTool(workspaceId));
      } else {
        console.log('⏭️ Material search disabled for Interior Designer (user did not ask for catalog materials)');
      }
    } else {
      // For KAI and other agents: Always available (LLM decides when to use)
      tools.push(createSearchTool(workspaceId));
    }
  }

  // Visual search (image similarity via CLIP/SigLIP) — only when images are attached
  if (config.tools.includes('visual_search') && images.length > 0) {
    tools.push(createVisualSearchTool(workspaceId, images));
  }

  // --- Interior Designer tools ---
  if (config.tools.includes('generate_3d')) {
    tools.push(create3DGenerationTool(userId, workspaceId, onChunk, images, conversationImages));
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


  // Select model based on agent type
  const selectedModel = getModelForAgent(agentId);
  const modelName = getModelNameForAgent(agentId);

  // 🔷 LangGraph StateGraph-based execution with checkpointing

  // Generate thread ID for checkpointing (based on conversation context)
  const threadId = `${userId}-${agentId}-${Date.now()}`;

  // Try to restore from checkpoint if available
  const existingCheckpoint = await checkpointer.get(threadId);
  if (existingCheckpoint) {
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
          if (img.startsWith('data:')) {
            // data URL: "data:image/jpeg;base64,/9j/4AAQ..."
            // Convert to Anthropic native base64 block (required for @langchain/anthropic v1.x)
            const commaIdx = img.indexOf(',');
            const header = img.slice(0, commaIdx); // "data:image/jpeg;base64"
            const data = img.slice(commaIdx + 1);  // raw base64 string
            const mediaType = header.slice(5, header.indexOf(';')); // "image/jpeg"
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data },
            });
          } else {
            // HTTP URL — pass as url source
            content.push({
              type: 'image',
              source: { type: 'url', url: img },
            });
          }
        }
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
    const result = await agentGraph.invoke(initialState);

    // Save checkpoint for future resume
    await checkpointer.put(threadId, {
      messages: result.messages,
      toolResults: result.toolResults,
      timestamp: new Date().toISOString(),
    });

    // Log final usage stats

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

    // Get request body
    const { messages = [], agentId = 'kai', images = [], conversation_id = null, pinned_material_images = [] } = await req.json();
    // images: string[] — user-attached images as data URLs (data:image/jpeg;base64,...)
    // conversation_id: string | null — Supabase conversation ID, used to post background task results back
    // pinned_material_images: string[] — catalog product image URLs pinned by user for Gemini multi-reference generation



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

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
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
        if (!safeEnqueue({ type: 'status', message: 'Initializing agent...' })) {
          console.error('❌ Failed to send initial chunk, aborting');
          controller.close();
          return;
        }

        // Send immediate heartbeat to keep connection alive
        safeEnqueue({ type: 'heartbeat', timestamp: Date.now() });

        // Now run the async agent execution
        (async () => {
          let finalResult: any = null;

          try {

          // Start heartbeat to keep stream alive during long operations
          heartbeatInterval = setInterval(() => {
            if (!streamClosed) {
              safeEnqueue({ type: 'heartbeat', timestamp: Date.now() });
            }
          }, 1000); // Send heartbeat every 1 second (reduced from 5s)

          try {
            // Execute agent with streaming callback

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
            if (finalResult) {
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
            }
          }

          // Check if we got a valid result
          if (!finalResult || !finalResult.text) {
            console.error('❌ executeAgent returned null or invalid result');
            throw new Error('Agent execution failed to return a valid result');
          }

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

          const finalSent = safeEnqueue(finalChunk);
          if (finalSent) {
            if (finalResult.generationJob) {
            }
          } else {
            console.error('❌ Failed to send final result chunk (stream closed)');
            console.error('   Note: generation_job_created was already sent immediately');
            // Don't throw - generation job was already sent via generation_job_created chunk
          }

          // Send completion
          const doneSent = safeEnqueue({ type: 'done' });
          if (doneSent) {
          } else {
            console.warn('⚠️ Failed to send done chunk (stream closed)');
          }

          streamClosed = true;
          try {
            controller.close();
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

