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

// ⚠️ Boot-time code kept MINIMAL — Supabase Edge Runtime has a strict ~2s boot limit.
// All heavy npm packages and tool modules are lazy-loaded on first request via initRuntime().

// No process.env polyfill needed — API key passed directly to ChatAnthropic constructor.

import { corsHeaders } from '../_shared/cors.ts';

// Runtime singletons — initialized once on first request
let _initialized = false;
let ANTHROPIC_API_KEY: string;
let SUPABASE_URL: string;
let SUPABASE_SERVICE_ROLE_KEY: string;
let MIVAA_GATEWAY_URL: string;
let MIVAA_API_KEY: string;
let supabase: any;
let ChatAnthropic: any;
let tool: any;
let z: any;
let StateGraph: any, Annotation: any, END: any, START: any;
let BaseMessage: any, HumanMessage: any, AIMessage: any, SystemMessage: any;
let createClient: any;
let debitExternalServiceCredits: any, checkCreditBalance: any;
let getToolPrompt: any;
let extractTextContent: any;
let authenticate: any, isAdminAccess: any;
let getSkillsForAgent: any, getSkillContent: any, formatSkillsForSystemPrompt: any;
let emitFlowEvent: any;
let aiCallLogger: any;

async function initRuntime() {
  if (_initialized) return;

  ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
  SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
  MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || '';

  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY must be set');

  // Load all shared modules + npm packages in parallel
  const [creditMod, promptMod, lgCoreMod, authMod, skillsMod, flowMod, sbMod, anthropicMod, toolsMod, zodMod, lgMod, msgMod, aiLoggerMod] = await Promise.all([
    import('../_shared/credit-utils.ts'),
    import('../_shared/prompt-utils.ts'),
    import('../_shared/langgraph-core.ts'),
    import('../_shared/auth.ts'),
    import('../_shared/skills-loader.ts'),
    import('../_shared/flow-events.ts'),
    import('@supabase/supabase-js'),
    import('@langchain/anthropic'),
    import('@langchain/core/tools'),
    import('zod'),
    import('@langchain/langgraph'),
    import('@langchain/core/messages'),
    import('../_shared/ai-logger.ts'),
  ]);

  debitExternalServiceCredits = creditMod.debitExternalServiceCredits;
  checkCreditBalance = creditMod.checkCreditBalance;
  getToolPrompt = promptMod.getToolPrompt;
  getAgentSystemPrompt = promptMod.getAgentSystemPrompt;
  extractTextContent = lgCoreMod.extractTextContent;
  authenticate = authMod.authenticate;
  isAdminAccess = authMod.isAdminAccess;
  getSkillsForAgent = skillsMod.getSkillsForAgent;
  getSkillContent = skillsMod.getSkillContent;
  formatSkillsForSystemPrompt = skillsMod.formatSkillsForSystemPrompt;
  emitFlowEvent = flowMod.emitFlowEvent;
  createClient = sbMod.createClient;
  ChatAnthropic = anthropicMod.ChatAnthropic;
  tool = toolsMod.tool;
  z = zodMod.z;
  StateGraph = lgMod.StateGraph;
  Annotation = lgMod.Annotation;
  END = lgMod.END;
  START = lgMod.START;
  BaseMessage = msgMod.BaseMessage;
  HumanMessage = msgMod.HumanMessage;
  AIMessage = msgMod.AIMessage;
  SystemMessage = msgMod.SystemMessage;

  supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  aiCallLogger = new aiLoggerMod.AICallLogger(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Initialize singletons that depend on loaded modules
  checkpointer = new SupabaseCheckpointer();
  longTermMemory = new LongTermMemory();
  buildAgentStateAnnotation();

  modelHaiku = new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 4096,
    apiKey: ANTHROPIC_API_KEY,
  });
  modelSonnet = new ChatAnthropic({
    model: 'claude-sonnet-4-6',
    temperature: 1,
    maxTokens: 4096,
    apiKey: ANTHROPIC_API_KEY,
  });

  _initialized = true;
}

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

// Singletons — initialized in initRuntime()
let checkpointer: SupabaseCheckpointer;
let longTermMemory: LongTermMemory;

/**
 * LangGraph State Annotation
 * Defines the state schema for the agent graph
 */
let AgentStateAnnotation: any;
function buildAgentStateAnnotation() {
  if (AgentStateAnnotation) return;
  AgentStateAnnotation = Annotation.Root({
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
  generationToolsCalled: Annotation<boolean>({
    reducer: (prev, next) => prev || next,
    default: () => false,
  }),
  });
}

type AgentState = any;

/**
 * Create a LangGraph-based agent with StateGraph
 * Provides checkpointing, resumable conversations, and observable execution
 */
function createAgentGraph(
  model: any,
  tools: any[],
  onChunk?: (chunk: any) => void,
  forceToolCall?: boolean,
  maxIterations = 10,
  // Observability context — passed through to agent_tool_call_logs
  observability?: {
    userId?: string;
    workspaceId?: string;
    conversationId?: string;
    agentId?: string;
    supabase?: any;
  },
) {

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
    // After generation tools have been called, remove them so the agent can only respond
    const GENERATION_TOOLS = ['generate_3d', 'generate_gemini'];
    const availableTools = state.generationToolsCalled
      ? tools.filter((t: any) => !GENERATION_TOOLS.includes(t.name))
      : tools;
    const modelWithTools = availableTools.length > 0
      ? model.bindTools(availableTools, (forceToolCall && state.iteration === 0) ? { tool_choice: 'any' } : undefined)
      : model;
    const invokeStartTime = Date.now();

    const response = await modelWithTools.invoke(state.messages, {
      system: state.systemPrompt,
    });

    const invokeElapsed = Date.now() - invokeStartTime;

    // Track token usage (use ?? not || so a legitimate 0 isn't treated as missing)
    const usage = response.response_metadata?.usage;
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;

    // Send thinking status
    try {
      onChunk?.({
        type: 'assistant_thinking',
        content: extractTextContent(response.content),
        hasToolCalls: !!(response.tool_calls && response.tool_calls.length > 0)
      });
    } catch (e) { console.warn('[agent-chat] onChunk callback threw:', e); }

    // Check if done (no tool calls)
    if (!response.tool_calls || response.tool_calls.length === 0) {
      return {
        messages: [response],
        iteration,
        inputTokens,
        outputTokens,
        turnCount: 1,
        finalResponse: extractTextContent(response.content),
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


    const newToolResults: any[] = [];
    const newProducts: any[] = [];
    let generationJob = null;

    // Execute all tool calls in parallel for lower latency
    const TOOL_TIMEOUT_MS = 90_000;
    const toolTimings: Record<string, number> = {};
    const toolSettled = await Promise.allSettled(
      toolCalls.map(async (toolCall: any) => {
        // Send tool call status
        try {
          onChunk?.({
            type: 'tool_call',
            tool: toolCall.name,
            args: toolCall.args,
            message: `Calling ${toolCall.name}...`
          });
        } catch (e) { console.warn('[agent-chat] onChunk callback threw:', e); }

        const matchedTool = tools.find((t: any) => t.name === toolCall.name);
        if (!matchedTool) {
          throw new Error(`Tool not found: ${toolCall.name}`);
        }

        const _t_start = Date.now();
        const toolResult = await Promise.race([
          matchedTool.invoke(toolCall.args),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Tool '${toolCall.name}' timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS)
          ),
        ]);
        toolTimings[toolCall.id || toolCall.name] = Date.now() - _t_start;

        // Send tool result
        try {
          onChunk?.({
            type: 'tool_result',
            tool: toolCall.name,
            result: toolResult,
            message: `${toolCall.name} completed`
          });
        } catch (e) { console.warn('[agent-chat] onChunk callback threw:', e); }

        return { toolCall, toolResult };
      })
    );

    // Collect results in original order (preserves message ordering for LLM)
    const toolMessages: any[] = [];
    for (let i = 0; i < toolCalls.length; i++) {
      const settled = toolSettled[i];
      const toolCall = toolCalls[i];

      if (settled.status === 'fulfilled') {
        const { toolResult } = settled.value;

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
              // MIVAA returns "product_name" not "name", and images in "related_images"
              const productName = r.product_name || r.name || r.title || 'Unnamed Product';
              const relatedImg = r.related_images?.[0]?.url;
              const imageUrl = r.image_url || r.thumbnail || relatedImg || r.metadata?.image_url;
              return {
                id: r.id || r.product_id || `product-${Date.now()}`,
                sku: r.sku || r.metadata?.sku || '',
                name: productName,
                description: r.description || r.content || '',
                category: r.category || r.metadata?.category || 'materials',
                type: r.type || r.metadata?.material_type || 'general',
                status: 'active',
                images: imageUrl ? [{ url: imageUrl, alt: productName, isPrimary: true }] : [],
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

        toolMessages.push({
          role: 'tool',
          content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });

      } else {
        const error = settled.reason;
        console.error(`❌ Tool ${toolCall.name} failed:`, error);

        try {
          onChunk?.({
            type: 'tool_error',
            tool: toolCall.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        } catch (e) { console.warn('[agent-chat] onChunk callback threw:', e); }

        toolMessages.push({
          role: 'tool',
          content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          tool_call_id: toolCall.id,
          name: toolCall.name,
        });
      }
    }

    const generationToolsCalled = toolCalls.some((tc: any) =>
      ['generate_3d', 'generate_gemini'].includes(tc.name)
    );

    // ── Observability: log every tool call to agent_tool_call_logs ──
    // Fire-and-forget — never block the response on logging
    if (observability?.supabase) {
      try {
        const logRows = toolCalls.map((toolCall: any, i: number) => {
          const settled = toolSettled[i];
          const success = settled.status === 'fulfilled';
          let resultCount: number | null = null;
          let zeroResult = false;
          let resultSummary: any = null;
          let errorMessage: string | null = null;

          if (success) {
            try {
              const tr = (settled as any).value.toolResult;
              const parsed = typeof tr === 'string' ? JSON.parse(tr) : tr;
              // Try to extract a result count from common shapes
              if (Array.isArray(parsed?.results)) {
                resultCount = parsed.results.length;
              } else if (Array.isArray(parsed?.data)) {
                resultCount = parsed.data.length;
              } else if (Array.isArray(parsed?.products)) {
                resultCount = parsed.products.length;
              } else if (Array.isArray(parsed?.matches)) {
                // price_lookup returns { matches: [...] }
                resultCount = parsed.matches.length;
              } else if (Array.isArray(parsed?.articles)) {
                // knowledge_base_search returns { articles: [...] }
                resultCount = parsed.articles.length;
              }
              zeroResult = resultCount === 0;
              // Summarise but don't store full payload
              resultSummary = {
                result_count: resultCount,
                has_results: resultCount !== null && resultCount > 0,
                top_score: parsed?.results?.[0]?.score ?? null,
                processing_time: parsed?.processing_time ?? null,
              };
            } catch { /* ignore parse errors */ }
          } else {
            const err = (settled as any).reason;
            errorMessage = err instanceof Error ? err.message : String(err);
          }

          return {
            conversation_id: observability.conversationId || null,
            user_id: observability.userId || null,
            workspace_id: observability.workspaceId || null,
            agent_id: observability.agentId || null,
            tool_name: toolCall.name,
            tool_args: toolCall.args || null,
            result_summary: resultSummary,
            result_count: resultCount,
            zero_result: zeroResult,
            duration_ms: toolTimings[toolCall.id || toolCall.name] || null,
            success,
            error_message: errorMessage,
          };
        });

        observability.supabase
          .from('agent_tool_call_logs')
          .insert(logRows)
          .select('id')
          .then((res: any) => {
            if (res?.error) {
              console.warn('[agent-chat] tool call log insert error:', res.error.message);
              return;
            }
            const insertedIds: string[] = (res?.data || []).map((r: any) => r.id);
            if (insertedIds.length === toolCalls.length) {
              // Emit a mapping of tool_name → call_id so the frontend can link committed
              // prices (quote_items, product_prices) back to the exact agent_tool_call_logs row.
              const mapping = toolCalls.map((tc: any, i: number) => ({
                tool_name: tc.name,
                tool_call_id: tc.id || null,
                log_id: insertedIds[i],
              }));
              try {
                onChunk?.({ type: 'tool_call_ids', mapping });
              } catch { /* stream may be closed */ }
            }
          })
          .catch((e: any) => console.warn('[agent-chat] tool call log insert threw:', e));
      } catch (logErr) {
        console.warn('[agent-chat] tool call logging failed:', logErr);
      }
    }

    return {
      messages: toolMessages,
      toolResults: newToolResults,
      collectedProducts: newProducts,
      generationJob: generationJob || state.generationJob,
      generationToolsCalled,
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

// getAgentSystemPrompt: Uses shared cached version from _shared/prompt-utils.ts
// Imported as part of initRuntime() → promptMod
let getAgentSystemPrompt: (supabase: any, agentType: string) => Promise<string>;

// Claude models — initialized in initRuntime()
let modelHaiku: any;
let modelSonnet: any;

// Model selection based on agent type
function getModelForAgent(agentId: string): ChatAnthropic {
  // Demo uses Haiku for cost efficiency
  if (agentId === 'demo') {
    return modelHaiku;
  }
  // KAI, Interior, and all other agents use Sonnet for complex reasoning
  return modelSonnet;
}

// Get model name for logging/tracking — must stay in sync with model instances above
function getModelNameForAgent(agentId: string): string {
  if (agentId === 'demo') {
    return 'claude-haiku-4-5-20251001';
  }
  return 'claude-sonnet-4-6';
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
      'knowledge_base_search', 'material_search', 'visual_search', 'analyze_inspiration_url',
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
      // Price lookup from Pricing KB category (admin/owner only)
      'price_lookup',
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
    tools: ['material_search', 'generate_3d', 'analyze_inspiration_url'],
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
  generationMode?: string, // Explicit mode override from UI chip selection
  conversation_id?: string | null, // Supabase conversation ID for background task dispatch
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

  // Extract previously generated image URLs from assistant messages (for edit mode).
  // Sources checked in priority order:
  //   1. geminiImageData.image_url — Gemini single-image result (restored from DB on page revisit)
  //   2. tool_results[].image_url  — inline tool result image URLs (live session only)
  const conversationImages: string[] = messages
    .filter((m: any) => m.role === 'assistant')
    .flatMap((m: any) => {
      const urls: string[] = [];
      // Gemini image result (present in restored messages loaded from DB)
      if (m.geminiImageData?.image_url) {
        urls.push(m.geminiImageData.image_url as string);
      }
      // Tool results (present during live sessions)
      if (Array.isArray(m.tool_results)) {
        for (const tr of m.tool_results) {
          if (tr.image_url) urls.push(tr.image_url as string);
        }
      }
      return urls;
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
    systemPrompt = await getAgentSystemPrompt(supabase, agentId);
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

  // 🧩 Skills: advertise available playbooks (metadata only). The agent calls
  // `load_skill` to pull the full content on demand — progressive disclosure.
  try {
    systemPrompt += formatSkillsForSystemPrompt(agentId);
  } catch (skillErr) {
    console.warn('⚠️ Could not load skills metadata:', skillErr);
  }

  // If there are previously generated images in the conversation, remind the agent to use them for follow-up edits
  if (conversationImages.length > 0) {
    systemPrompt += `\n\n[CONTEXT] There are ${conversationImages.length} previously generated image(s) in this conversation. The most recent is: ${conversationImages[conversationImages.length - 1]}. If the user asks to modify, adjust, change, or refine the design in any way — even without uploading a new image — call generate_gemini with mode=image-edit using this image as the reference. Do not respond with text only when the user is clearly asking for a visual change.`;
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

  // Lazy-load ALL tool modules at request time (not boot time).
  // Each module does top-level await for @langchain/core + zod.
  // Loading them at boot exceeds the 2s Supabase Edge Runtime limit.
  const needsSearch = config.tools.some((t: string) => ['knowledge_base_search', 'material_search', 'visual_search', 'analyze_inspiration_url'].includes(t));
  const needsGen = config.tools.some((t: string) => ['generate_3d'].includes(t));
  const needsOps = config.tools.some((t: string) => ['check_server_health', 'query_sentry', 'cost_estimation'].includes(t));
  const needsDb = config.tools.includes('query_database');
  const needsSub = config.tools.some((t: string) => ['research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis'].includes(t));
  const needsB2b = config.tools.some((t: string) => ['b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment', 'contact_discovery', 'email_validate', 'save_to_crm'].includes(t));
  const needsSeo = config.tools.some((t: string) => ['seo_keyword_research', 'seo_article_planner', 'seo_article_writer', 'seo_content_analyzer', 'seo_pipeline'].includes(t));
  const needsBg = config.tools.includes('dispatch_background_task');
  const needsPrice = config.tools.includes('price_lookup') && isAdmin;

  const [searchMod, generationMod, opsMod, dbMod, subAgentMod, b2bMod, seoMod, bgMod, priceMod]: any[] = await Promise.all([
    needsSearch ? import('../_shared/tools/search-tools.ts') : null,
    needsGen    ? import('../_shared/tools/generation-tools.ts') : null,
    needsOps    ? import('../_shared/tools/ops-tools.ts') : null,
    needsDb     ? import('../_shared/tools/database-tools.ts') : null,
    needsSub    ? import('../_shared/tools/sub-agent-tools.ts') : null,
    needsB2b    ? import('../_shared/tools/b2b-tools.ts') : null,
    needsSeo    ? import('../_shared/tools/seo-tools.ts') : null,
    needsBg     ? import('../_shared/tools/background-tools.ts') : null,
    needsPrice  ? import('../_shared/tools/price-tools.ts') : null,
  ]);

  const createSearchTool = searchMod?.createSearchTool;
  const createVisualSearchTool = searchMod?.createVisualSearchTool;
  const createKnowledgeBaseSearchTool = searchMod?.createKnowledgeBaseSearchTool;
  const createInspirationUrlTool = searchMod?.createInspirationUrlTool;
  const create3DGenerationTool = generationMod?.create3DGenerationTool;
  const createGeminiGenerationTool = generationMod?.createGeminiGenerationTool;
  const createVirtualStagingTool = generationMod?.createVirtualStagingTool;
  const createGenerationStatusTool = generationMod?.createGenerationStatusTool;
  const createCheckServerHealthTool = opsMod?.createCheckServerHealthTool;
  const createQuerySentryTool = opsMod?.createQuerySentryTool;
  const createCostEstimationTool = opsMod?.createCostEstimationTool;
  const createQueryDatabaseTool = dbMod?.createQueryDatabaseTool;
  const createResearchAnalysisTool = subAgentMod?.createResearchAnalysisTool;
  const createAnalyticsAnalysisTool = subAgentMod?.createAnalyticsAnalysisTool;
  const createBusinessAnalysisTool = subAgentMod?.createBusinessAnalysisTool;
  const createProductAnalysisTool = subAgentMod?.createProductAnalysisTool;
  const createB2BManufacturerSearchTool = b2bMod?.createB2BManufacturerSearchTool;
  const createCompanyWebsiteScrapeTool = b2bMod?.createCompanyWebsiteScrapeTool;
  const createCompanyEnrichmentTool = b2bMod?.createCompanyEnrichmentTool;
  const createContactDiscoveryTool = b2bMod?.createContactDiscoveryTool;
  const createEmailValidateTool = b2bMod?.createEmailValidateTool;
  const createSaveToCRMTool = b2bMod?.createSaveToCRMTool;
  const createSEOKeywordResearchTool = seoMod?.createSEOKeywordResearchTool;
  const createSEOArticlePlannerTool = seoMod?.createSEOArticlePlannerTool;
  const createSEOArticleWriterTool = seoMod?.createSEOArticleWriterTool;
  const createSEOContentAnalyzerTool = seoMod?.createSEOContentAnalyzerTool;
  const createSEOPipelineTool = seoMod?.createSEOPipelineTool;
  const createDispatchBackgroundTaskTool = bgMod?.createDispatchBackgroundTaskTool;
  const createPriceLookupTool = priceMod?.createPriceLookupTool;

  // --- Core tools (all users) ---

  // 🧩 load_skill tool — injected whenever the agent has at least one skill
  // advertised in its system prompt. Kept above the other tools so it's the
  // first option the model considers when a task matches a skill.
  try {
    const skillsForAgent = getSkillsForAgent(agentId);
    if (skillsForAgent.length > 0) {
      const { createLoadSkillTool } = await import('../_shared/tools/skills-tools.ts');
      tools.push(createLoadSkillTool(agentId));
    }
  } catch (skillToolErr) {
    console.warn('⚠️ Could not register load_skill tool:', skillToolErr);
  }

  // Knowledge Base search - always add first so agent checks KB before answering
  if (config.tools.includes('knowledge_base_search')) {
    tools.push(createKnowledgeBaseSearchTool(workspaceId, isAdmin));
  }

  // Material search (text-based 7-vector fusion) — now with search_spec support
  if (config.tools.includes('material_search')) {
    // Always make material_search available — let the LLM decide when to use it.
    // Previously gated behind keyword matching for interior-designer, but this caused
    // queries like "Harmony tiles" to have no search tool available, returning no results.
    tools.push(createSearchTool(workspaceId, onChunk));
  }

  // Inspiration URL analysis (all users) — scrape a design URL and find matching materials
  if (config.tools.includes('analyze_inspiration_url')) {
    tools.push(createInspirationUrlTool(userId, workspaceId, onChunk));
  }

  // Visual search (image similarity via CLIP/SigLIP) — only when images are attached
  if (config.tools.includes('visual_search') && images.length > 0) {
    tools.push(createVisualSearchTool(workspaceId, images));
  }

  // --- Interior Designer tools ---
  if (config.tools.includes('generate_3d')) {
    // generate_3d (Replicate grid) is skipped when a chip mode is explicitly set.
    // Chip modes (floor-plan-render, floor-plan-text, image-edit) are precise Gemini-only
    // operations — Replicate models can't preserve furniture positions or follow exact
    // edit instructions, so they'd just produce off-prompt full redesigns.
    const GEMINI_ONLY_MODES = ['floor-plan-render', 'copy-style', 'floor-plan-text', 'image-edit'];
    if (!generationMode || !GEMINI_ONLY_MODES.includes(generationMode)) {
      tools.push(create3DGenerationTool(userId, workspaceId, onChunk, images, conversationImages));
    }
    tools.push(createGeminiGenerationTool(userId, workspaceId, images, conversationImages, onChunk, pinnedMaterialImages, generationMode));
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

    // Price lookup from the Pricing KB category (admin-gated)
    if (config.tools.includes('price_lookup') && createPriceLookupTool) {
      tools.push(createPriceLookupTool(workspaceId, onChunk));
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

  // Use conversation_id for stable thread ID (falls back to user+agent if none provided)
  const threadId = conversation_id
    ? `${userId}-${agentId}-${conversation_id}`
    : `${userId}-${agentId}-${Date.now()}`;

  // Create the agent graph — force tool use for interior-designer (prevents JARVIS text-first responses)
  const forceToolCall = agentId === 'interior-designer' && tools.length > 0;
  const agentGraph = createAgentGraph(selectedModel, tools, onChunk, forceToolCall, 10, {
    userId,
    workspaceId,
    conversationId: conversation_id || undefined,
    agentId,
    supabase, // module-level service-role client
  });

  // Convert messages to LangChain format, with multimodal support for images
  const lastUserMsgIndex = messages.reduce((last: number, msg: any, i: number) =>
    msg.role === 'user' ? i : last, -1);

  const langchainMessages = messages.map((msg: any, idx: number) => {
    if (msg.role === 'user') {
      // For the last user message, attach images as multimodal content blocks
      if (idx === lastUserMsgIndex && images.length > 0) {
        const content: any[] = [];
        if (msg.content?.trim()) content.push({ type: 'text', text: msg.content });
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
      if (msg.content?.trim()) return new HumanMessage(msg.content);
      return null;
    } else if (msg.role === 'assistant') {
      if (msg.content?.trim()) return new AIMessage(msg.content);
      return null;
    } else if (msg.role === 'system') {
      return new SystemMessage(msg.content);
    }
    if (msg.content?.trim()) return new HumanMessage(msg.content);
    return null;
  });

  // Initial state
  const initialState = {
    messages: langchainMessages.filter(Boolean),
    systemPrompt,
    toolResults: [],
    collectedProducts: [],
    iteration: 0,
    inputTokens: 0,
    outputTokens: 0,
    turnCount: 0,
    finalResponse: null,
    generationJob: null,
    generationToolsCalled: false,
  };

  try {
    // Execute the graph
    const result = await agentGraph.invoke(initialState);

    // Save checkpoint for future resume (fire-and-forget — don't block response)
    checkpointer.put(threadId, {
      messages: result.messages,
      toolResults: result.toolResults,
      timestamp: new Date().toISOString(),
    }).catch(e => console.warn('⚠️ Checkpoint save failed:', e));

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
 * Get user workspace membership (role + workspace_id) in a single query.
 * Replaces the previous two-query pattern (checkAgentAccess + getUserWorkspaceId).
 */
async function getUserWorkspaceMembership(userId: string): Promise<{ role: string; workspaceId: string | null }> {
  try {
    const { data, error } = await supabase
      .from('workspace_members')
      .select('role, workspace_id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return { role: 'viewer', workspaceId: null };
    }

    return { role: data.role, workspaceId: data.workspace_id };
  } catch (error) {
    console.error('Error getting workspace membership:', error);
    return { role: 'viewer', workspaceId: null };
  }
}

/**
 * Check user role and agent access
 */
function checkAgentAccess(role: string, agentId: string): { allowed: boolean; role: string } {
  const agentConfig = AGENT_CONFIGS[agentId];
  if (!agentConfig) {
    return { allowed: false, role };
  }
  const allowed = agentConfig.allowedRoles.includes(role);
  return { allowed, role };
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
    // Initialize runtime on first real request (not OPTIONS)
    await initRuntime();

    // Get request body
    const { messages = [], agentId = 'kai', images = [], conversation_id = null, pinned_material_images = [], generation_mode = null } = await req.json();
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

    // Get user workspace membership (single query for role + workspace_id)
    const isAdmin = isAdminAccess(auth);
    const membership = isAdmin
      ? { role: 'admin', workspaceId: null as string | null }
      : await getUserWorkspaceMembership(userId!);

    // For admin key access, still need workspace_id
    if (isAdmin && !membership.workspaceId) {
      const m = await getUserWorkspaceMembership(userId!);
      membership.workspaceId = m.workspaceId;
    }

    // Check agent access
    const { allowed, role } = isAdmin
      ? { allowed: true, role: 'admin' }
      : checkAgentAccess(membership.role, agentId);
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

    const workspaceId = membership.workspaceId;
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

          const executeStartTime = Date.now();
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
              generation_mode || undefined, // Explicit mode override from UI chip
              conversation_id, // Supabase conversation ID for background task dispatch
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

            // Log to unified ai_call_logs table (fire-and-forget)
            aiCallLogger.logAICall({
              job_id: conversation_id || undefined,
              task: `agent_chat_${agentId}`,
              model: finalResult.usage.modelName,
              input_tokens: finalResult.usage.inputTokens,
              output_tokens: finalResult.usage.outputTokens,
              latency_ms: Date.now() - executeStartTime,
              action: 'use_ai_result' as const,
              response_data: {
                agent_id: agentId,
                turn_count: finalResult.usage.turnCount,
                tools_called: toolsCalled.length,
              },
            }).catch((e: any) => console.warn('ai_call_logs write failed:', e));
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

