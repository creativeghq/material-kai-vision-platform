// Redeploy 2026-06-02: pick up the area_breakdown presentation-sheet tool
// (prior CI run no-op'd this function under parallel deploy).
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
import { withApiLogging } from '../_shared/api-logger.ts';

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
let debitAgentChatTurn: any, refundAgentChatTurn: any, getAgentTurnCost: any;
let isPartnerApiKeyAccess: any, isEndpointAllowed: any;
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
  debitAgentChatTurn = creditMod.debitAgentChatTurn;
  refundAgentChatTurn = creditMod.refundAgentChatTurn;
  getAgentTurnCost = creditMod.getAgentTurnCost;
  getToolPrompt = promptMod.getToolPrompt;
  getAgentSystemPrompt = promptMod.getAgentSystemPrompt;
  extractTextContent = lgCoreMod.extractTextContent;
  authenticate = authMod.authenticate;
  isAdminAccess = authMod.isAdminAccess;
  isPartnerApiKeyAccess = authMod.isPartnerApiKeyAccess;
  isEndpointAllowed = authMod.isEndpointAllowed;
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
    model: 'claude-haiku-4-5',
    temperature: 0.7,
    maxTokens: 4096,
    apiKey: ANTHROPIC_API_KEY,
  });
  modelOpus = new ChatAnthropic({
    model: 'claude-opus-4-8',
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

    // Prompt caching: ephemeral cache marker enables Anthropic prompt caching
    // for the system prompt AND the bound tool definitions. Anthropic returns
    // the cached blocks at 10% of input cost (90% discount) for cached hits
    // within the 5-minute TTL. System + ~15 tools is ~10K tokens of stable
    // preamble that previously re-billed every turn — biggest single win.
    const response = await modelWithTools.invoke(state.messages, {
      system: state.systemPrompt,
      cache_control: { type: 'ephemeral' },
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
                  wholesale: r.cost ?? 0,
                  currency: r.cost_currency || r.currency || 'EUR',
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
let modelOpus: any;

// Two-tier router: route simple queries to Haiku (~15× cheaper than Opus),
// reserve Opus for complex reasoning. Heuristic gate — no extra LLM call,
// no added latency. Errs toward Opus when uncertain (recall over precision).
//
// Routes to Haiku when ALL of:
//   - last user message ≤ 80 chars
//   - no images attached on this turn
//   - no @-mentions or quoted strings
//   - history < 4 turns (early-conversation triage)
//   - agent isn't `interior-designer` (always needs Opus for design tasks)
//   - agent isn't admin-tier (B2B / SEO sub-agents need Opus)
function shouldRouteToHaiku(
  agentId: string,
  messages: any[],
  images: string[],
): boolean {
  if (agentId === 'demo') return true;
  if (agentId === 'interior-designer') return false;

  if (images && images.length > 0) return false;

  const lastUserMsg = [...messages]
    .reverse()
    .find((m: any) => m.role === 'user');
  const text: string = (typeof lastUserMsg?.content === 'string' ? lastUserMsg.content : '') || '';

  if (text.length > 80) return false;
  if (text.includes('@') || text.includes('"') || text.includes("'")) return false;

  const turnCount = messages.filter((m: any) => m.role === 'user').length;
  if (turnCount >= 4) return false;

  return true;
}

// Model selection — agent type + per-turn complexity heuristic
function getModelForAgent(
  agentId: string,
  messages: any[] = [],
  images: string[] = [],
): ChatAnthropic {
  return shouldRouteToHaiku(agentId, messages, images) ? modelHaiku : modelOpus;
}

// Get model name for logging/tracking — must stay in sync with router above
function getModelNameForAgent(
  agentId: string,
  messages: any[] = [],
  images: string[] = [],
): string {
  return shouldRouteToHaiku(agentId, messages, images)
    ? 'claude-haiku-4-5'
    : 'claude-opus-4-8';
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
      // Calculators (all users; deterministic, free, no upstream API)
      'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
      // Sub-agent orchestration (admin/owner only — gated at injection time)
      'research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis',
      // B2B Research (admin/owner only)
      'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment',
      'contact_discovery', 'email_validate', 'save_to_crm',
      // SEO research card (all users — 0 user credits, internal cron-secret call)
      'seo_research_keyword',
      // SEO toolkit — Wave 1B+ (all users; 0 user credits, internal DataForSEO routing)
      'seo_keyword_difficulty', 'seo_keyword_suggestions', 'seo_search_intent',
      'seo_keyword_overview', 'seo_ai_keyword_volume',
      'seo_serp_audit', 'seo_historical_serps', 'seo_audit_url',
      // Domain intel
      'seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors',
      'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains',
      'seo_relevant_pages', 'seo_categories_for_domain',
      // Backlinks
      'seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains',
      // OnPage / site crawl
      'seo_site_crawl_start', 'seo_site_crawl_status',
      // Content + domain analytics
      'seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois',
      // AI optimization (LLM mentions native to DataForSEO)
      'seo_llm_mentions_search',
      // Multi-engine SERP
      'seo_youtube_search', 'seo_local_pack',
      // Keywords data — trends
      'seo_google_trends',
      // Niche
      'seo_amazon_asin', 'seo_app_keywords',
      'seo_trustpilot_search', 'seo_pinterest_search', 'seo_reddit_search',
      // Composite audits
      'seo_site_review', 'seo_brand_search_audit',
      // Escape hatch — admin only
      'seo_dataforseo_call',
      // SEO article pipeline (admin/owner only)
      'create_seo_article', 'seo_keyword_research', 'seo_article_planner',
      'seo_article_writer', 'seo_content_analyzer',
      // Background task dispatch (admin/owner only)
      'dispatch_background_task',
      // Price lookup from Pricing KB category (admin/owner only)
      'price_lookup',
      // Mention monitoring (all users; per-tool credit cost gated inside the tool)
      'track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions',
      // Job research (all users; per-tool credit cost gated inside each tool — currently 0 cr)
      'track_job_search', 'list_my_job_searches', 'find_jobs', 'get_job_digest_preview',
      // Admin-gated at the DB level (RLS) — agent tool exposed to all, writes 401 for non-admin
      'manage_job_sites',
      // Presentation catalogs (admin/owner only — gated at injection time)
      'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
      'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
      'generate_catalog_pdf', 'publish_catalog',
      // Project Workspace (all users; 0 cr — DB-only)
      'create_project', 'list_my_projects', 'find_project', 'add_task',
      // Trip cards / sales expenses (all users; 0 cr — DB-only)
      'create_trip_card', 'add_trip_expense', 'list_trip_cards', 'submit_trip_card',
      // Tech Radar (Pepper's background brain — research-scored improvement ideas; internal = 0 cr)
      'review_solution', 'track_tech_radar', 'list_tech_radar', 'update_finding',
      // Knowledge-graph traversal (all users; 0 cr — DB-only RPC reads over existing relational edges).
      // supplier_overview carries finance data and is admin/owner-gated at injection time.
      'product_provenance', 'product_price_history', 'projects_using_product',
      'products_in_project', 'customer_overview', 'supplier_overview',
      'products_by_brand', 'brand_overview', 'related_products', 'find_products_by_spec',
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
    tools: [
      'material_search', 'generate_3d', 'analyze_inspiration_url',
      // Calculators (all users; deterministic, free, no upstream API)
      'calculate_heat_pump_sizing', 'calculate_heating_cost_comparison',
      // Image-driven post-processing tools (require an existing room image in the conversation)
      'apply_lighting_preset', 'generate_vr_world',
      // Presentation sheets (all users; per-sheet credit cost gated inside the tool)
      'generate_presentation_sheet',
      // Project Workspace — interior designers benefit most from the container
      'create_project', 'list_my_projects', 'find_project', 'add_task',
    ],
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
  selectedToolkits?: string[] | null, // Per-turn user-selected toolkit IDs (resolved server-side to tool IDs)
  directTool?: { name: string; input: Record<string, any> } | null, // Deterministic single-tool run — skips the LLM entirely
  userJwt?: string, // Caller's Supabase user JWT — threaded to user-scoped MIVAA/edge tools (mentions, job-research, seo-article) so they authenticate AS the user, not the opaque service key
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

  // ─── Per-turn tool gating ────────────────────────────────────────────────
  //
  // The frontend sends `selected_toolkits` — the user's currently-active
  // toolkit IDs from the visual ToolkitPickerModal (always includes the Core
  // toolkit). We resolve those to a set of tool IDs server-side using the
  // SERVER_TOOLKITS map below (mirrored from agentToolsCatalog.ts).
  //
  // Default behavior (selected_toolkits empty or missing): bind only the Core
  // toolkit's tools (lean ~1.5k tokens) PLUS the `load_toolkit` meta-tool, so
  // the agent can request more capabilities mid-conversation if the user's
  // request needs them.
  //
  // RBAC gating still applies AFTER this filter — admin-only tools won't
  // bind for viewers/members even if they're in an active toolkit.
  //
  // The legacy per-tool restriction picker (selectedTools) was removed
  // 2026-05-09. Toolkits + load_toolkit are now the single source of truth
  // for tool-binding.

  const SERVER_TOOLKITS: Record<string, { alwaysOn?: boolean; tool_ids: string[] }> = {
    'core': {
      alwaysOn: true,
      tool_ids: ['knowledge_base_search', 'material_search', 'visual_search', 'analyze_inspiration_url'],
    },
    'catalogs': {
      tool_ids: [
        'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
        'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
        'generate_catalog_pdf', 'publish_catalog',
      ],
    },
    'mentions': {
      tool_ids: ['track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions'],
    },
    'job-research': {
      tool_ids: ['track_job_search', 'list_my_job_searches', 'find_jobs', 'get_job_digest_preview', 'manage_job_sites'],
    },
    'projects': {
      tool_ids: ['create_project', 'list_my_projects', 'find_project', 'add_task'],
    },
    'tech-radar': {
      tool_ids: ['review_solution', 'track_tech_radar', 'list_tech_radar', 'update_finding'],
    },
    'knowledge-graph': {
      tool_ids: [
        'product_provenance', 'product_price_history', 'projects_using_product',
        'products_in_project', 'customer_overview', 'supplier_overview',
        'products_by_brand', 'brand_overview', 'related_products', 'find_products_by_spec',
      ],
    },
    'presentation-sheets': {
      tool_ids: ['generate_presentation_sheet'],
    },
    'generation': {
      tool_ids: ['generate_3d', 'apply_lighting_preset', 'generate_vr_world'],
    },
    'seo-research': {
      tool_ids: [
        'seo_research_keyword', 'seo_keyword_difficulty', 'seo_keyword_suggestions',
        'seo_search_intent', 'seo_keyword_overview', 'seo_ai_keyword_volume',
        'seo_serp_audit', 'seo_audit_url', 'seo_historical_serps',
      ],
    },
    'seo-domain': {
      tool_ids: [
        'seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors',
        'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains',
        'seo_relevant_pages', 'seo_categories_for_domain',
      ],
    },
    'seo-backlinks': {
      tool_ids: ['seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains'],
    },
    'seo-content': {
      tool_ids: [
        'seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois',
        'seo_site_crawl_start', 'seo_site_crawl_status', 'seo_llm_mentions_search',
      ],
    },
    'seo-multi-engine': {
      tool_ids: [
        'seo_youtube_search', 'seo_local_pack', 'seo_google_trends',
        'seo_amazon_asin', 'seo_app_keywords', 'seo_trustpilot_search',
        'seo_pinterest_search', 'seo_reddit_search',
      ],
    },
    'seo-composite': {
      tool_ids: ['seo_site_review', 'seo_brand_search_audit'],
    },
    'seo-article': {
      tool_ids: [
        'create_seo_article', 'seo_keyword_research', 'seo_article_planner',
        'seo_article_writer', 'seo_content_analyzer',
      ],
    },
    'b2b': {
      tool_ids: [
        'b2b_manufacturer_search', 'company_website_scrape', 'company_enrichment',
        'contact_discovery', 'email_validate', 'save_to_crm',
      ],
    },
    'sub-agents': {
      tool_ids: ['research_analysis', 'analytics_analysis', 'business_analysis', 'product_analysis'],
    },
    'admin-misc': {
      tool_ids: ['dispatch_background_task', 'price_lookup', 'seo_dataforseo_call'],
    },
  };

  const META_TOOLS = ['load_toolkit'];

  // Resolve toolkits → tool IDs. Core is always included.
  const toolkitToolIds = new Set<string>();
  for (const [id, def] of Object.entries(SERVER_TOOLKITS)) {
    if (def.alwaysOn || (selectedToolkits || []).includes(id)) {
      for (const t of def.tool_ids) toolkitToolIds.add(t);
    }
  }
  // Always make load_toolkit available so the agent can request more clusters
  // if the user's request needs them. Exposed via a meta-tool registered alongside
  // the regular tools.
  for (const m of META_TOOLS) toolkitToolIds.add(m);

  // Filter the agent's allowed tool list to the toolkit-resolved set, then
  // ensure META_TOOLS are present even if the agent config didn't list them.
  const baseTools = config.tools.filter((t) => toolkitToolIds.has(t));
  for (const m of META_TOOLS) if (!baseTools.includes(m)) baseTools.push(m);
  config = { ...config, tools: baseTools };

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
  // Full set of tool IDs THIS agent is permitted to use (pre-toolkit-filter).
  // Used to clamp in-run toolkit loads to the agent's own capabilities so the
  // agent can't pull a cluster it doesn't own (e.g. catalogs on interior-designer).
  const agentFullToolIds = new Set<string>(AGENT_CONFIGS[agentId]?.tools || []);

  // Idempotent merge into the LIVE `tools` array — skips a tool whose name is
  // already bound, so registerTools can be re-run for in-run toolkit loads
  // without duplicating instances.
  const mergeTools = (incoming: any[]) => {
    for (const t of incoming) {
      if (t && !tools.some((x: any) => x?.name === t.name)) tools.push(t);
    }
  };

  // Build tool instances for a given set of tool IDs. Called at startup with
  // the full resolved set, and again by the in-run loader (load_toolkit) when
  // the agent pulls a new toolkit mid-conversation. The body shadows
  // `config`/`tools` so the entire existing registration logic below is reused
  // verbatim; the returned array is merged into the live `tools` by the caller.
  async function registerTools(requestedIds: Set<string>): Promise<any[]> {
    const config = { tools: [...requestedIds] };
    const tools: any[] = [];

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
  // SEO agent toolkit (conversational research surface — separate from the article pipeline)
  const SEO_AGENT_TOOL_NAMES = [
    'seo_research_keyword',
    'seo_keyword_difficulty', 'seo_keyword_suggestions', 'seo_search_intent',
    'seo_keyword_overview', 'seo_ai_keyword_volume',
    'seo_serp_audit', 'seo_historical_serps', 'seo_audit_url',
    'seo_domain_snapshot', 'seo_ranked_keywords', 'seo_domain_competitors',
    'seo_keyword_gap', 'seo_traffic_estimation', 'seo_subdomains',
    'seo_relevant_pages', 'seo_categories_for_domain',
    'seo_backlinks_summary', 'seo_backlinks_anchors', 'seo_referring_domains',
    'seo_site_crawl_start', 'seo_site_crawl_status',
    'seo_content_sentiment', 'seo_domain_technologies', 'seo_domain_whois',
    'seo_llm_mentions_search', 'seo_youtube_search', 'seo_local_pack',
    'seo_google_trends',
    'seo_amazon_asin', 'seo_app_keywords',
    'seo_trustpilot_search', 'seo_pinterest_search', 'seo_reddit_search',
    'seo_site_review', 'seo_brand_search_audit',
    'seo_dataforseo_call',
  ];
  const needsSeoAgent = config.tools.some((t: string) => SEO_AGENT_TOOL_NAMES.includes(t));
  const needsBg = config.tools.includes('dispatch_background_task');
  const needsPrice = config.tools.includes('price_lookup') && isAdmin;
  const needsPresentation = config.tools.includes('generate_presentation_sheet');
  const needsMention = config.tools.some((t: string) => ['track_product_mentions', 'get_mention_summary', 'check_llm_visibility', 'find_negative_mentions'].includes(t));
  const needsJobResearch = config.tools.some((t: string) => ['track_job_search', 'list_my_job_searches', 'find_jobs', 'get_job_digest_preview', 'manage_job_sites'].includes(t));
  const needsProjects = config.tools.some((t: string) => ['create_project', 'list_my_projects', 'find_project', 'add_task'].includes(t));
  // Tech Radar spends real Anthropic + web-search $ per call with no credit debit
  // (internal ops capability) — gate to admin/owner like price_lookup.
  const needsTechRadar = isAdmin && config.tools.some((t: string) => ['review_solution', 'track_tech_radar', 'list_tech_radar', 'update_finding'].includes(t));
  const CATALOG_TOOL_NAMES = [
    'create_catalog', 'attach_catalog_pdfs', 'extract_from_catalog_pdfs',
    'translate_pdf_to_catalog', 'add_material_to_catalog', 'find_image_for_material',
    'generate_catalog_pdf', 'publish_catalog',
  ];
  const needsCatalog = isAdmin && config.tools.some((t: string) => CATALOG_TOOL_NAMES.includes(t));

  const [searchMod, generationMod, opsMod, dbMod, subAgentMod, b2bMod, seoMod, seoAgentMod, bgMod, priceMod, presentationMod, mentionMod, catalogMod, jobResearchMod, projectsMod, techRadarMod]: any[] = await Promise.all([
    needsSearch       ? import('../_shared/tools/search-tools.ts') : null,
    needsGen          ? import('../_shared/tools/generation-tools.ts') : null,
    needsOps          ? import('../_shared/tools/ops-tools.ts') : null,
    needsDb           ? import('../_shared/tools/database-tools.ts') : null,
    needsSub          ? import('../_shared/tools/sub-agent-tools.ts') : null,
    needsB2b          ? import('../_shared/tools/b2b-tools.ts') : null,
    needsSeo          ? import('../_shared/tools/seo-tools.ts') : null,
    needsSeoAgent     ? import('../_shared/tools/seo-agent-tools.ts') : null,
    needsBg           ? import('../_shared/tools/background-tools.ts') : null,
    needsPrice        ? import('../_shared/tools/price-tools.ts') : null,
    needsPresentation ? import('../_shared/tools/presentation-sheet-tool.ts') : null,
    needsMention      ? import('../_shared/tools/mention-tools.ts') : null,
    needsCatalog      ? import('../_shared/tools/catalog-tools.ts') : null,
    needsJobResearch  ? import('../_shared/tools/job-research-tools.ts') : null,
    needsProjects     ? import('../_shared/tools/project-tools.ts') : null,
    needsTechRadar    ? import('../_shared/tools/tech-radar-tools.ts') : null,
  ]);

  const createSearchTool = searchMod?.createSearchTool;
  const createVisualSearchTool = searchMod?.createVisualSearchTool;
  const createKnowledgeBaseSearchTool = searchMod?.createKnowledgeBaseSearchTool;
  const createInspirationUrlTool = searchMod?.createInspirationUrlTool;
  const create3DGenerationTool = generationMod?.create3DGenerationTool;
  const createGeminiGenerationTool = generationMod?.createGeminiGenerationTool;
  const createVirtualStagingTool = generationMod?.createVirtualStagingTool;
  const createGenerationStatusTool = generationMod?.createGenerationStatusTool;
  const createApplyLightingPresetTool = generationMod?.createApplyLightingPresetTool;
  const createGenerateVRWorldTool = generationMod?.createGenerateVRWorldTool;
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
  const createSEOResearchKeywordTool = seoAgentMod?.createSEOResearchKeywordTool;
  // Wave 1B+ SEO agent toolkit
  const createSEOKeywordDifficultyTool = seoAgentMod?.createSEOKeywordDifficultyTool;
  const createSEOKeywordSuggestionsTool = seoAgentMod?.createSEOKeywordSuggestionsTool;
  const createSEOSearchIntentTool = seoAgentMod?.createSEOSearchIntentTool;
  const createSEOSerpAuditTool = seoAgentMod?.createSEOSerpAuditTool;
  const createSEOAuditUrlTool = seoAgentMod?.createSEOAuditUrlTool;
  const createSEODomainSnapshotTool = seoAgentMod?.createSEODomainSnapshotTool;
  const createSEORankedKeywordsTool = seoAgentMod?.createSEORankedKeywordsTool;
  const createSEODomainCompetitorsTool = seoAgentMod?.createSEODomainCompetitorsTool;
  const createSEOKeywordGapTool = seoAgentMod?.createSEOKeywordGapTool;
  const createSEOTrafficEstimationTool = seoAgentMod?.createSEOTrafficEstimationTool;
  const createSEOBacklinksSummaryTool = seoAgentMod?.createSEOBacklinksSummaryTool;
  const createSEOBacklinksAnchorsTool = seoAgentMod?.createSEOBacklinksAnchorsTool;
  const createSEOReferringDomainsTool = seoAgentMod?.createSEOReferringDomainsTool;
  const createSEOSiteCrawlStartTool = seoAgentMod?.createSEOSiteCrawlStartTool;
  const createSEOSiteCrawlStatusTool = seoAgentMod?.createSEOSiteCrawlStatusTool;
  const createSEOContentSentimentTool = seoAgentMod?.createSEOContentSentimentTool;
  const createSEODomainTechnologiesTool = seoAgentMod?.createSEODomainTechnologiesTool;
  const createSEOLlmMentionsSearchTool = seoAgentMod?.createSEOLlmMentionsSearchTool;
  const createSEOYouTubeSearchTool = seoAgentMod?.createSEOYouTubeSearchTool;
  const createSEOLocalPackTool = seoAgentMod?.createSEOLocalPackTool;
  const createSEOGoogleTrendsTool = seoAgentMod?.createSEOGoogleTrendsTool;
  const createSEOSiteReviewTool = seoAgentMod?.createSEOSiteReviewTool;
  const createSEOBrandSearchAuditTool = seoAgentMod?.createSEOBrandSearchAuditTool;
  // Phase 12+ niche tools
  const createSEOAmazonAsinTool = seoAgentMod?.createSEOAmazonAsinTool;
  const createSEOAppKeywordsTool = seoAgentMod?.createSEOAppKeywordsTool;
  const createSEOTrustpilotSearchTool = seoAgentMod?.createSEOTrustpilotSearchTool;
  const createSEOPinterestSearchTool = seoAgentMod?.createSEOPinterestSearchTool;
  const createSEORedditSearchTool = seoAgentMod?.createSEORedditSearchTool;
  const createSEODomainWhoisTool = seoAgentMod?.createSEODomainWhoisTool;
  const createSEOSubdomainsTool = seoAgentMod?.createSEOSubdomainsTool;
  const createSEORelevantPagesTool = seoAgentMod?.createSEORelevantPagesTool;
  const createSEOHistoricalSerpsTool = seoAgentMod?.createSEOHistoricalSerpsTool;
  const createSEOKeywordOverviewTool = seoAgentMod?.createSEOKeywordOverviewTool;
  const createSEOAIKeywordVolumeTool = seoAgentMod?.createSEOAIKeywordVolumeTool;
  const createSEOCategoriesForDomainTool = seoAgentMod?.createSEOCategoriesForDomainTool;
  const createSEODataForSEOCallTool = seoAgentMod?.createSEODataForSEOCallTool;
  const createDispatchBackgroundTaskTool = bgMod?.createDispatchBackgroundTaskTool;
  const createPriceLookupTool = priceMod?.createPriceLookupTool;
  const createPresentationSheetTool = presentationMod?.createPresentationSheetTool;
  const createTrackProductMentionsTool = mentionMod?.createTrackProductMentionsTool;
  const createGetMentionSummaryTool = mentionMod?.createGetMentionSummaryTool;
  const createCheckLlmVisibilityTool = mentionMod?.createCheckLlmVisibilityTool;
  const createFindNegativeMentionsTool = mentionMod?.createFindNegativeMentionsTool;
  const createTrackJobSearchTool = jobResearchMod?.createTrackJobSearchTool;
  const createListMyJobSearchesTool = jobResearchMod?.createListMyJobSearchesTool;
  const createFindJobsTool = jobResearchMod?.createFindJobsTool;
  const createGetJobDigestPreviewTool = jobResearchMod?.createGetJobDigestPreviewTool;
  const createManageJobSitesTool = jobResearchMod?.createManageJobSitesTool;
  const createCreateProjectTool = projectsMod?.createCreateProjectTool;
  const createListMyProjectsTool = projectsMod?.createListMyProjectsTool;
  const createFindProjectTool = projectsMod?.createFindProjectTool;
  const createAddTaskTool = projectsMod?.createAddTaskTool;
  const createReviewSolutionTool = techRadarMod?.createReviewSolutionTool;
  const createTrackTechRadarTool = techRadarMod?.createTrackTechRadarTool;
  const createListTechRadarTool = techRadarMod?.createListTechRadarTool;
  const createUpdateFindingTool = techRadarMod?.createUpdateFindingTool;
  const createCreateCatalogTool = catalogMod?.createCreateCatalogTool;
  const createAttachCatalogPdfsTool = catalogMod?.createAttachCatalogPdfsTool;
  const createExtractFromCatalogPdfsTool = catalogMod?.createExtractFromCatalogPdfsTool;
  const createTranslatePdfToCatalogTool = catalogMod?.createTranslatePdfToCatalogTool;
  const createAddMaterialToCatalogTool = catalogMod?.createAddMaterialToCatalogTool;
  const createFindImageForMaterialTool = catalogMod?.createFindImageForMaterialTool;
  const createGenerateCatalogPdfTool = catalogMod?.createGenerateCatalogPdfTool;
  const createPublishCatalogTool = catalogMod?.createPublishCatalogTool;

  // --- Toolkit meta-tool: load_toolkit ---
  // Registered ONCE on the LIVE tool list (outside registerTools) so its in-run
  // loader appends to the real array, which agentNode re-binds every iteration.
  // See the applyToolkitInRun + createLoadToolkitTool wiring after registerTools.

  // --- Core tools (all users) ---

  // 🌡️ Heat-pump sizer — deterministic, free, no upstream API. Self-contained
  // import (no shared module batch needed).
  if (config.tools.includes('calculate_heat_pump_sizing') || config.tools.includes('calculate_heating_cost_comparison')) {
    try {
      const calcMod = await import('../_shared/tools/calculator-tools.ts');
      if (config.tools.includes('calculate_heat_pump_sizing')) tools.push(calcMod.createHeatPumpSizingTool(onChunk));
      if (config.tools.includes('calculate_heating_cost_comparison')) tools.push(calcMod.createHeatingCostComparisonTool(onChunk));
    } catch (calcErr) {
      console.warn('⚠️ Could not register calculator tools:', calcErr);
    }
  }

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
    // agentId is passed so MIVAA can enforce per-doc allowed_agents allow-lists.
    tools.push(createKnowledgeBaseSearchTool(workspaceId, isAdmin, agentId));
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

  // Presentation sheet generator (all users; per-sheet credit cost handled inside the tool)
  if (config.tools.includes('generate_presentation_sheet') && createPresentationSheetTool) {
    tools.push(createPresentationSheetTool(userId, onChunk));
  }

  // SEO toolkit (admin-only — each call spends real DataForSEO credits on the platform's tab).
  // 25 tools across keyword research, SERP audit, URL audit, domain intel,
  // backlinks, OnPage crawl, content + domain analytics, LLM-mention native
  // search, multi-engine SERP, Google Trends, composite audits, escape hatch.
  if (isAdmin) {
  if (config.tools.includes('seo_research_keyword') && createSEOResearchKeywordTool) {
    tools.push(createSEOResearchKeywordTool(userId, onChunk));
  }
  if (config.tools.includes('seo_keyword_difficulty') && createSEOKeywordDifficultyTool) {
    tools.push(createSEOKeywordDifficultyTool(userId, onChunk));
  }
  if (config.tools.includes('seo_keyword_suggestions') && createSEOKeywordSuggestionsTool) {
    tools.push(createSEOKeywordSuggestionsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_search_intent') && createSEOSearchIntentTool) {
    tools.push(createSEOSearchIntentTool(userId, onChunk));
  }
  if (config.tools.includes('seo_serp_audit') && createSEOSerpAuditTool) {
    tools.push(createSEOSerpAuditTool(userId, onChunk));
  }
  if (config.tools.includes('seo_audit_url') && createSEOAuditUrlTool) {
    tools.push(createSEOAuditUrlTool(userId, onChunk));
  }
  if (config.tools.includes('seo_domain_snapshot') && createSEODomainSnapshotTool) {
    tools.push(createSEODomainSnapshotTool(userId, onChunk));
  }
  if (config.tools.includes('seo_ranked_keywords') && createSEORankedKeywordsTool) {
    tools.push(createSEORankedKeywordsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_domain_competitors') && createSEODomainCompetitorsTool) {
    tools.push(createSEODomainCompetitorsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_keyword_gap') && createSEOKeywordGapTool) {
    tools.push(createSEOKeywordGapTool(userId, onChunk));
  }
  if (config.tools.includes('seo_traffic_estimation') && createSEOTrafficEstimationTool) {
    tools.push(createSEOTrafficEstimationTool(userId, onChunk));
  }
  if (config.tools.includes('seo_backlinks_summary') && createSEOBacklinksSummaryTool) {
    tools.push(createSEOBacklinksSummaryTool(userId, onChunk));
  }
  if (config.tools.includes('seo_backlinks_anchors') && createSEOBacklinksAnchorsTool) {
    tools.push(createSEOBacklinksAnchorsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_referring_domains') && createSEOReferringDomainsTool) {
    tools.push(createSEOReferringDomainsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_site_crawl_start') && createSEOSiteCrawlStartTool) {
    tools.push(createSEOSiteCrawlStartTool(userId, onChunk));
  }
  if (config.tools.includes('seo_site_crawl_status') && createSEOSiteCrawlStatusTool) {
    tools.push(createSEOSiteCrawlStatusTool(userId, onChunk));
  }
  if (config.tools.includes('seo_content_sentiment') && createSEOContentSentimentTool) {
    tools.push(createSEOContentSentimentTool(userId, onChunk));
  }
  if (config.tools.includes('seo_domain_technologies') && createSEODomainTechnologiesTool) {
    tools.push(createSEODomainTechnologiesTool(userId, onChunk));
  }
  if (config.tools.includes('seo_llm_mentions_search') && createSEOLlmMentionsSearchTool) {
    tools.push(createSEOLlmMentionsSearchTool(userId, onChunk));
  }
  if (config.tools.includes('seo_youtube_search') && createSEOYouTubeSearchTool) {
    tools.push(createSEOYouTubeSearchTool(userId, onChunk));
  }
  if (config.tools.includes('seo_local_pack') && createSEOLocalPackTool) {
    tools.push(createSEOLocalPackTool(userId, onChunk));
  }
  if (config.tools.includes('seo_google_trends') && createSEOGoogleTrendsTool) {
    tools.push(createSEOGoogleTrendsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_site_review') && createSEOSiteReviewTool) {
    tools.push(createSEOSiteReviewTool(userId, onChunk));
  }
  if (config.tools.includes('seo_brand_search_audit') && createSEOBrandSearchAuditTool) {
    tools.push(createSEOBrandSearchAuditTool(userId, onChunk));
  }
  // Phase 12+ niche tools
  if (config.tools.includes('seo_amazon_asin') && createSEOAmazonAsinTool) {
    tools.push(createSEOAmazonAsinTool(userId, onChunk));
  }
  if (config.tools.includes('seo_app_keywords') && createSEOAppKeywordsTool) {
    tools.push(createSEOAppKeywordsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_trustpilot_search') && createSEOTrustpilotSearchTool) {
    tools.push(createSEOTrustpilotSearchTool(userId, onChunk));
  }
  if (config.tools.includes('seo_pinterest_search') && createSEOPinterestSearchTool) {
    tools.push(createSEOPinterestSearchTool(userId, onChunk));
  }
  if (config.tools.includes('seo_reddit_search') && createSEORedditSearchTool) {
    tools.push(createSEORedditSearchTool(userId, onChunk));
  }
  if (config.tools.includes('seo_domain_whois') && createSEODomainWhoisTool) {
    tools.push(createSEODomainWhoisTool(userId, onChunk));
  }
  if (config.tools.includes('seo_subdomains') && createSEOSubdomainsTool) {
    tools.push(createSEOSubdomainsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_relevant_pages') && createSEORelevantPagesTool) {
    tools.push(createSEORelevantPagesTool(userId, onChunk));
  }
  if (config.tools.includes('seo_historical_serps') && createSEOHistoricalSerpsTool) {
    tools.push(createSEOHistoricalSerpsTool(userId, onChunk));
  }
  if (config.tools.includes('seo_keyword_overview') && createSEOKeywordOverviewTool) {
    tools.push(createSEOKeywordOverviewTool(userId, onChunk));
  }
  if (config.tools.includes('seo_ai_keyword_volume') && createSEOAIKeywordVolumeTool) {
    tools.push(createSEOAIKeywordVolumeTool(userId, onChunk));
  }
  if (config.tools.includes('seo_categories_for_domain') && createSEOCategoriesForDomainTool) {
    tools.push(createSEOCategoriesForDomainTool(userId, onChunk));
  }
  if (config.tools.includes('seo_dataforseo_call') && createSEODataForSEOCallTool) {
    tools.push(createSEODataForSEOCallTool(userId, onChunk));
  }
  } // end isAdmin SEO gate

  // Mention monitoring tools (all users; module-gated + per-tool credit cost inside each tool)
  if (config.tools.includes('track_product_mentions') && createTrackProductMentionsTool) {
    tools.push(createTrackProductMentionsTool(userId, workspaceId, userJwt, onChunk));
  }
  if (config.tools.includes('get_mention_summary') && createGetMentionSummaryTool) {
    tools.push(createGetMentionSummaryTool(userId, userJwt, onChunk));
  }
  if (config.tools.includes('check_llm_visibility') && createCheckLlmVisibilityTool) {
    tools.push(createCheckLlmVisibilityTool(userId, userJwt, onChunk));
  }
  if (config.tools.includes('find_negative_mentions') && createFindNegativeMentionsTool) {
    tools.push(createFindNegativeMentionsTool(userId, userJwt, onChunk));
  }

  // Job research tools (all users; module-gated; refresh runs on cron, not on demand → 0 cr per tool)
  if (config.tools.includes('track_job_search') && createTrackJobSearchTool) {
    // Thread the current conversation id through so the daily digest can chat-post
    // back into THIS thread when matches are found.
    tools.push(createTrackJobSearchTool(userId, workspaceId, userJwt, onChunk, conversation_id));
  }
  if (config.tools.includes('list_my_job_searches') && createListMyJobSearchesTool) {
    tools.push(createListMyJobSearchesTool(userId, userJwt, onChunk));
  }
  if (config.tools.includes('find_jobs') && createFindJobsTool) {
    tools.push(createFindJobsTool(userId, userJwt, onChunk));
  }
  if (config.tools.includes('get_job_digest_preview') && createGetJobDigestPreviewTool) {
    tools.push(createGetJobDigestPreviewTool(userId, userJwt, onChunk));
  }
  if (config.tools.includes('manage_job_sites') && createManageJobSitesTool) {
    tools.push(createManageJobSitesTool(userId, userJwt, onChunk));
  }

  // Project Workspace tools (all users; module-gated inside each tool; 0 cr — DB-only)
  if (config.tools.includes('create_project') && createCreateProjectTool) {
    tools.push(createCreateProjectTool(userId, onChunk));
  }
  if (config.tools.includes('list_my_projects') && createListMyProjectsTool) {
    tools.push(createListMyProjectsTool(userId, onChunk));
  }
  if (config.tools.includes('find_project') && createFindProjectTool) {
    tools.push(createFindProjectTool(userId, onChunk));
  }
  if (config.tools.includes('add_task') && createAddTaskTool) {
    tools.push(createAddTaskTool(userId, onChunk));
  }

  // Knowledge-graph traversal (all users; 0 cr — DB-only RPC reads over existing relational edges).
  // Self-contained import. supplier_overview is finance data → admin/owner only.
  if (config.tools.some((t: string) => ['product_provenance', 'product_price_history', 'projects_using_product', 'products_in_project', 'customer_overview', 'supplier_overview'].includes(t))) {
    try {
      const graphMod = await import('../_shared/tools/graph-tools.ts');
      if (config.tools.includes('product_provenance')) tools.push(graphMod.createProductProvenanceTool(workspaceId, onChunk));
      if (config.tools.includes('product_price_history')) tools.push(graphMod.createProductPriceHistoryTool(workspaceId, onChunk));
      if (config.tools.includes('projects_using_product')) tools.push(graphMod.createProjectsUsingProductTool(workspaceId, onChunk));
      if (config.tools.includes('products_in_project')) tools.push(graphMod.createProductsInProjectTool(workspaceId, onChunk));
      if (config.tools.includes('customer_overview')) tools.push(graphMod.createCustomerOverviewTool(workspaceId, onChunk));
      if (isAdmin && config.tools.includes('supplier_overview')) tools.push(graphMod.createSupplierOverviewTool(workspaceId, onChunk));
      if (config.tools.includes('products_by_brand')) tools.push(graphMod.createProductsByBrandTool(workspaceId, onChunk));
      if (config.tools.includes('brand_overview')) tools.push(graphMod.createBrandOverviewTool(workspaceId, onChunk));
      if (config.tools.includes('related_products')) tools.push(graphMod.createRelatedProductsTool(workspaceId, onChunk));
      if (config.tools.includes('find_products_by_spec')) tools.push(graphMod.createFindProductsBySpecTool(workspaceId, onChunk));
    } catch (graphErr) {
      console.warn('⚠️ Could not register knowledge-graph tools:', graphErr);
    }
  }

  // Trip cards / sales expenses (all users; 0 cr — DB-only). Self-contained import.
  if (config.tools.some((t: string) => ['create_trip_card', 'add_trip_expense', 'list_trip_cards', 'submit_trip_card'].includes(t))) {
    try {
      const tripMod = await import('../_shared/tools/trip-expense-tools.ts');
      if (config.tools.includes('create_trip_card')) tools.push(tripMod.createCreateTripCardTool(userId, workspaceId, onChunk));
      if (config.tools.includes('add_trip_expense')) tools.push(tripMod.createAddTripExpenseTool(userId, workspaceId, onChunk));
      if (config.tools.includes('list_trip_cards')) tools.push(tripMod.createListTripCardsTool(userId, workspaceId, onChunk));
      if (config.tools.includes('submit_trip_card')) tools.push(tripMod.createSubmitTripCardTool(userId, workspaceId, onChunk));
    } catch (tripErr) {
      console.warn('⚠️ Could not register trip-expense tools:', tripErr);
    }
  }

  // --- Tech Radar (Pepper's background brain) ---
  if (config.tools.includes('review_solution') && createReviewSolutionTool) {
    tools.push(createReviewSolutionTool(userId, workspaceId, onChunk));
  }
  if (config.tools.includes('track_tech_radar') && createTrackTechRadarTool) {
    tools.push(createTrackTechRadarTool(userId, workspaceId, onChunk));
  }
  if (config.tools.includes('list_tech_radar') && createListTechRadarTool) {
    tools.push(createListTechRadarTool(userId, workspaceId, onChunk));
  }
  if (config.tools.includes('update_finding') && createUpdateFindingTool) {
    tools.push(createUpdateFindingTool(userId, workspaceId, onChunk));
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
    tools.push(createGeminiGenerationTool(userId, workspaceId, images, conversationImages, onChunk, pinnedMaterialImages, generationMode, conversation_id ?? undefined));
    tools.push(createVirtualStagingTool(userId, workspaceId, conversationImages, onChunk, conversation_id ?? undefined));
    tools.push(createGenerationStatusTool());
  }

  // Lighting variants — re-render an existing room under a different lighting preset
  if (config.tools.includes('apply_lighting_preset') && createApplyLightingPresetTool) {
    tools.push(createApplyLightingPresetTool(userId, workspaceId, conversationImages, onChunk, conversation_id ?? undefined));
  }

  // VR world generation — turn a room image into an explorable 3D Gaussian Splat
  if (config.tools.includes('generate_vr_world') && createGenerateVRWorldTool) {
    tools.push(createGenerateVRWorldTool(userId, workspaceId, conversationImages, onChunk));
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

    // B2B Research tools — onChunk wired so the search + save_to_crm tools
    // emit workflow_plan / workflow_step_progress / workflow_finished chunks
    // for the b2b-research wizard.
    if (config.tools.includes('b2b_manufacturer_search')) {
      tools.push(createB2BManufacturerSearchTool(userId, sendProgress, onChunk));
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
      tools.push(createSaveToCRMTool(userId, sendProgress, onChunk));
    }

    // SEO Article Pipeline tools — onChunk wired across all 4 stages so the
    // seo-article wizard advances on each step's emit.
    if (config.tools.includes('seo_keyword_research')) {
      tools.push(createSEOKeywordResearchTool(userId, sendProgress, onChunk));
    }
    if (config.tools.includes('seo_article_planner')) {
      tools.push(createSEOArticlePlannerTool(userId, sendProgress, onChunk));
    }
    if (config.tools.includes('seo_article_writer')) {
      tools.push(createSEOArticleWriterTool(userId, sendProgress, onChunk));
    }
    if (config.tools.includes('seo_content_analyzer')) {
      tools.push(createSEOContentAnalyzerTool(userId, sendProgress, onChunk));
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

    // Presentation catalogs (admin-only) — 8 tools driving the catalog builder
    if (config.tools.includes('create_catalog') && createCreateCatalogTool) {
      tools.push(createCreateCatalogTool(userId, workspaceId, onChunk));
    }
    if (config.tools.includes('attach_catalog_pdfs') && createAttachCatalogPdfsTool) {
      tools.push(createAttachCatalogPdfsTool(userId, onChunk));
    }
    if (config.tools.includes('extract_from_catalog_pdfs') && createExtractFromCatalogPdfsTool) {
      tools.push(createExtractFromCatalogPdfsTool(userId, onChunk));
    }
    if (config.tools.includes('translate_pdf_to_catalog') && createTranslatePdfToCatalogTool) {
      tools.push(createTranslatePdfToCatalogTool(userId, workspaceId, onChunk));
    }
    if (config.tools.includes('add_material_to_catalog') && createAddMaterialToCatalogTool) {
      tools.push(createAddMaterialToCatalogTool(userId, onChunk));
    }
    if (config.tools.includes('find_image_for_material') && createFindImageForMaterialTool) {
      tools.push(createFindImageForMaterialTool(userId, onChunk));
    }
    if (config.tools.includes('generate_catalog_pdf') && createGenerateCatalogPdfTool) {
      tools.push(createGenerateCatalogPdfTool(userId, onChunk));
    }
    if (config.tools.includes('publish_catalog') && createPublishCatalogTool) {
      tools.push(createPublishCatalogTool(userId, onChunk));
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

    return tools;
  } // ── end registerTools ──────────────────────────────────────────────────

  // In-run toolkit loader. Invoked by the load_toolkit meta-tool when the agent
  // needs a cluster that isn't bound yet. Clamps to (toolkit ∩ this agent's
  // permitted tools), re-runs registerTools, and merges the new instances into
  // the LIVE `tools` array — which agentNode re-binds every iteration, so the
  // agent can call the freshly-loaded tool in the SAME turn (no re-send).
  const applyToolkitInRun = async (
    toolkitId: string,
  ): Promise<{ success: boolean; tool_ids?: string[]; toolkit_name?: string; error?: string }> => {
    const def = (SERVER_TOOLKITS as Record<string, { tool_ids: string[] }>)[toolkitId];
    if (!def) return { success: false, error: `Unknown toolkit "${toolkitId}".` };
    // Only bind tools this agent is actually allowed to use.
    const allowedIds = def.tool_ids.filter((t) => agentFullToolIds.has(t));
    if (allowedIds.length === 0) {
      return {
        success: false,
        error: `The "${toolkitId}" toolkit isn't available to this agent. Tell the user to switch to the KAI agent to use it.`,
      };
    }
    mergeTools(await registerTools(new Set(allowedIds)));
    // RBAC (admin-only) gating happens inside registerTools, so a tool may be
    // requested-but-not-bound for a non-admin — report only what's actually live.
    const present = allowedIds.filter((id) => tools.some((t: any) => t?.name === id));
    if (present.length === 0) {
      return { success: false, error: `Could not load "${toolkitId}" (admin-only or unavailable for your role).` };
    }
    return { success: true, tool_ids: present, toolkit_name: toolkitId };
  };

  // Register load_toolkit ONCE on the live tool list, wired to the in-run loader.
  try {
    const { createLoadToolkitTool } = await import('../_shared/tools/toolkit-tools.ts');
    const loadableToolkitIds = Object.keys(SERVER_TOOLKITS).filter((id) => id !== 'core');
    tools.push(createLoadToolkitTool(isAdmin, onChunk, applyToolkitInRun, loadableToolkitIds));
  } catch (loadToolkitErr) {
    console.warn('⚠️ Could not register load_toolkit tool:', loadToolkitErr);
  }

  // Startup registration — build the initially-selected toolset on the live list.
  mergeTools(await registerTools(new Set(config.tools)));

  // ─── Direct tool execution (deterministic run — no LLM) ──────────────────
  // When the frontend fires a toolkit quick-start that carries a `run`
  // descriptor, it posts mode:'direct_tool' with structured args instead of a
  // chat message. We reuse the EXACT tool list built above — same toolkit
  // gating, same RBAC (admin-only tools never got pushed for non-admins), same
  // onChunk wiring — then find the requested tool and invoke it directly. The
  // 403/404 guard is simply "tool not in the built list", so authorization is
  // enforced by reuse, never re-implemented. The tool emits its own display
  // chunk during invoke(), so the same result card renders with zero model
  // latency or cost. zod (inside .invoke) is the input-validation boundary.
  if (directTool) {
    const matched = tools.find((t: any) => t.name === directTool.name);
    if (!matched) {
      try {
        onChunk?.({
          type: 'error',
          error: 'tool_not_available',
          message: `Tool "${directTool.name}" is not available for this agent or your role.`,
        });
      } catch { /* stream may be closed */ }
      return {
        text: `That action isn't available for your role or current agent.`,
        toolResults: [],
      };
    }

    try {
      onChunk?.({ type: 'tool_call', tool: directTool.name, args: directTool.input, message: `Running ${directTool.name}...` });
    } catch { /* stream may be closed */ }

    let toolResult: string;
    try {
      toolResult = await matched.invoke(directTool.input);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Tool execution failed';
      try {
        onChunk?.({ type: 'error', error: 'tool_execution_failed', tool: directTool.name, message: msg });
      } catch { /* stream may be closed */ }
      return { text: `The "${directTool.name}" run failed: ${msg}`, toolResults: [] };
    }

    let parsed: any = null;
    try { parsed = JSON.parse(toolResult); } catch { /* non-JSON tool result */ }

    try {
      onChunk?.({ type: 'tool_result', tool: directTool.name, result: toolResult, message: `${directTool.name} completed` });
    } catch { /* stream may be closed */ }

    // Prefer the tool's own human-readable message for the transcript line;
    // fall back to a generic confirmation. The visual result comes from the
    // tool's mid-stream display chunk, not from this text.
    const summary = (parsed && typeof parsed.message === 'string' && parsed.message.trim())
      ? parsed.message.trim()
      : `Done — ran ${directTool.name}.`;

    return {
      text: summary,
      toolResults: [{ tool: directTool.name, args: directTool.input, result: parsed ?? toolResult }],
    };
  }

  // Select model based on agent + per-turn complexity heuristic
  const selectedModel = getModelForAgent(agentId, messages, images);
  const modelName = getModelNameForAgent(agentId, messages, images);

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

  // ── Conversation compaction ─────────────────────────────────────────────────
  // For long conversations (> 12 messages), summarize the older turns via Haiku
  // into a single SystemMessage, keeping the last 6 messages intact. The
  // summary call is ~$0.001 against Haiku rates; the savings on subsequent
  // Opus turns (where each old turn re-bills 200-2000 input tokens) pay for it
  // many times over. Skipped when the user attaches images on this turn —
  // we don't want to paraphrase image-anchored context.
  const COMPACT_THRESHOLD = 12;
  const KEEP_RECENT = 6;
  if (
    messages.length > COMPACT_THRESHOLD &&
    images.length === 0 &&
    modelHaiku
  ) {
    try {
      const olderMessages = messages.slice(0, messages.length - KEEP_RECENT);
      const recentMessages = messages.slice(messages.length - KEEP_RECENT);

      const transcript = olderMessages
        .map((m: any) => {
          const text =
            typeof m.content === 'string'
              ? m.content
              : Array.isArray(m.content)
                ? m.content.filter((c: any) => c.type === 'text').map((c: any) => c.text).join(' ')
                : '';
          return `${m.role === 'user' ? 'User' : 'Assistant'}: ${text}`;
        })
        .filter((line: string) => line.length > line.indexOf(': ') + 2)
        .join('\n');

      const summaryPrompt = `Summarize the conversation below in <=200 tokens. Preserve: named entities (products, people, companies, materials), explicit user constraints, decisions made, and unresolved questions. Drop pleasantries and reasoning chains.\n\n---\n${transcript}\n---\nSummary:`;

      const summaryResp = await modelHaiku.invoke([
        new HumanMessage(summaryPrompt),
      ]);
      const summary =
        typeof summaryResp.content === 'string'
          ? summaryResp.content
          : extractTextContent(summaryResp.content);

      messages = [
        { role: 'system', content: `Earlier conversation summary:\n${summary}` },
        ...recentMessages,
      ];
    } catch (e) {
      // Compaction is best-effort; on failure, fall through with full history
      console.warn('[agent-chat] compaction failed, using full history:', e);
    }
  }

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
        modelName,
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
        modelName,
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
Deno.serve(withApiLogging('agent-chat', async (req) => {
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
    const { messages = [], agentId = 'kai', images = [], conversation_id = null, pinned_material_images = [], generation_mode = null, selected_toolkits = null, user_id: bodyUserId = null, mode = 'chat', direct_tool = null } = await req.json();
    // mode: 'chat' (default, LLM-driven) | 'direct_tool' (deterministic single-tool run).
    // direct_tool: { name: string, input: object } — required when mode==='direct_tool'.
    //   Fired by toolkit quick-starts that carry a `run` descriptor. The tool is
    //   executed directly (no model call); RBAC + toolkit gating still apply via
    //   selected_toolkits — the frontend includes the owning toolkit id there.
    const isDirectTool = mode === 'direct_tool';
    if (isDirectTool) {
      if (!direct_tool || typeof direct_tool.name !== 'string' || typeof direct_tool.input !== 'object' || direct_tool.input === null) {
        return new Response(
          JSON.stringify({ error: "mode 'direct_tool' requires direct_tool: { name: string, input: object }" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }
    // user_id: string | null — only honored when the caller authenticates with
    // the platform sb_secret_* admin key (server-to-server "act on behalf of"
    // pattern, same as generate-interior-gemini / generate-region-edit /
    // generate-vr-world / crm-*-api). Ignored for user-JWT and kai_* partner
    // calls — those already carry the effective user identity.
    // selected_toolkits: string[] | null — IDs of currently-active toolkit
    // clusters (catalogs / mentions / seo-research / etc.). Core is always
    // included server-side. When null/empty the agent gets just Core tools +
    // the load_toolkit meta-tool so it can request more on demand.
    // images: string[] — user-attached images as data URLs (data:image/jpeg;base64,...)
    // conversation_id: string | null — Supabase conversation ID, used to post background task results back
    // pinned_material_images: string[] — catalog product image URLs pinned by user for Gemini multi-reference generation



    // Authenticate request
    const auth = await authenticate(req);

    if (!auth.success) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const user = auth.user;
    // userId is mutable so the sb_secret_* admin-secret "act on behalf of"
    // branch below can reassign it from body.user_id — same pattern used by
    // generate-interior-gemini / generate-region-edit / generate-vr-world.
    let userId = auth.userId;

    // ── Partner kai_* API key path ────────────────────────────────────────
    // Locked role = 'member' so admin-only tools (B2B, SEO article pipeline,
    // catalogs, dispatch_background_task, price_lookup, sub-agents) are
    // gated out via the existing role-based tool injection guards. Partners
    // pay per turn on top of underlying tool/AI credits.
    const isPartner = isPartnerApiKeyAccess(auth);
    if (isPartner) {
      // Endpoint allow-list check against the partner's api_keys row
      if (!isEndpointAllowed(auth.apiKey?.allowed_endpoints ?? null, '/functions/v1/agent-chat')) {
        return new Response(
          JSON.stringify({ error: 'This API key does not permit access to agent-chat' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Partner-mode agent allow-list. demo is internal-only; legacy aliases
      // (search/insights/seo) collapse to kai inside AGENT_CONFIGS anyway,
      // but we reject them explicitly here so partners get a predictable
      // surface to integrate against.
      const PARTNER_ALLOWED_AGENTS = ['kai', 'interior-designer'];
      if (!PARTNER_ALLOWED_AGENTS.includes(agentId)) {
        return new Response(
          JSON.stringify({
            error: `Partner API keys may only call agents: ${PARTNER_ALLOWED_AGENTS.join(', ')}. Got: ${agentId}`,
          }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }

      // Pre-check balance before any expensive setup
      const turnCost = getAgentTurnCost(agentId);
      const { data: balRow } = await auth.supabase
        .from('user_credits')
        .select('balance')
        .eq('user_id', userId!)
        .maybeSingle();
      const balance = balRow?.balance ?? 0;
      if (balance < turnCost) {
        return new Response(
          JSON.stringify({
            error: 'insufficient_credits',
            required_credits: turnCost,
            current_balance: balance,
          }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // ── Admin-secret "act on behalf of user_id" (platform-wide convention) ──
    // Same shape as generate-interior-gemini / generate-region-edit /
    // generate-vr-world / crm-*-api: the sb_secret_* admin key is accepted
    // for trusted server-to-server callers, and the request body carries
    // `user_id` to identify which user the operation runs as. Workspace,
    // role/RBAC, credits, and conversation persistence are all anchored to
    // that resolved user — admin-secret never grants extra capabilities,
    // it just lets a trusted backend caller stand in for a real user.
    const isAdmin = isAdminAccess(auth);
    if (isAdmin) {
      if (!bodyUserId || typeof bodyUserId !== 'string') {
        return new Response(
          JSON.stringify({
            error:
              'When calling agent-chat with the platform admin secret key, ' +
              'include `user_id` in the request body to identify which user ' +
              'the conversation runs as. Workspace, role, credits, and ' +
              'conversation persistence all anchor to that user.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      userId = bodyUserId;
    }

    // Get user workspace membership (single query for role + workspace_id).
    let membership: { role: string; workspaceId: string | null };
    if (isPartner) {
      // Partner mode: force role to 'member' regardless of the underlying
      // user's platform role. Partner keys never get admin tool access.
      membership = { role: 'member', workspaceId: auth.apiKey?.workspace_id ?? null };
    } else {
      // Both user-JWT and admin-secret-on-behalf-of paths land here with a
      // concrete userId — look up that user's real workspace + role.
      membership = await getUserWorkspaceMembership(userId!);
    }

    // Check agent access (skipped for partner mode — already allow-listed above).
    let role = membership.role;
    if (!isPartner) {
      const { allowed, role: resolvedRole } = checkAgentAccess(membership.role, agentId);
      role = resolvedRole;
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
    }

    const workspaceId = membership.workspaceId;
    if (!workspaceId) {
      throw new Error('No workspace found for user');
    }

    // ── Partner per-turn debit (charges BEFORE invoking the agent) ────────
    // Refund on hard pre-stream crash. Once streaming starts, no refund:
    // Anthropic + tool spend has already happened on our side.
    let partnerTurnDebitedCredits = 0;
    if (isPartner) {
      const debit = await debitAgentChatTurn(
        auth.supabase,
        userId!,
        agentId,
        { api_key_id: auth.apiKey?.api_key_id, conversation_id },
      );
      if (!debit.success) {
        const status = debit.error === 'insufficient_credits' ? 402 : 500;
        return new Response(
          JSON.stringify({ error: debit.error || 'debit_failed' }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      partnerTurnDebitedCredits = debit.credits_debited;
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
    // Tracks whether the agent has produced any real output beyond status/heartbeat.
    // Used for partner-mode refunds: if executeAgent crashes before the first
    // tool_call / text_chunk / final_result, the underlying Anthropic + tool spend
    // hasn't started yet, so we can safely return the per-turn credit.
    let hasStreamedRealContent = false;
    const refundIfNotConsumed = async (reason: string) => {
      if (!isPartner || hasStreamedRealContent || partnerTurnDebitedCredits <= 0) return;
      try {
        await refundAgentChatTurn(auth.supabase, userId!, agentId, reason, {
          api_key_id: auth.apiKey?.api_key_id,
          conversation_id,
        });
      } catch (e) {
        console.warn('Partner turn refund failed:', e);
      }
    };
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
            // Mark partner-refund eligibility off once the agent has produced
            // anything spendworthy. status/heartbeat are pre-execution noise.
            if (data?.type && data.type !== 'status' && data.type !== 'heartbeat') {
              hasStreamedRealContent = true;
            }
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
              selected_toolkits, // Per-turn user-selected toolkit IDs (primary toolkit-level gating)
              isDirectTool ? { name: direct_tool.name, input: direct_tool.input } : null, // Deterministic single-tool run
              auth.level === 'user' ? (req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || undefined) : undefined, // user JWT for user-scoped tools
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

          const modelUsed = finalResult.usage?.modelName || 'claude-opus-4-8';
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

          // Refund partner per-turn credit if the agent crashed before
          // producing any real content. (No-op for internal users.)
          await refundIfNotConsumed(error instanceof Error ? error.message : 'agent_crash_pre_stream');

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
              model: 'claude-opus-4-8',
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
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
}));

