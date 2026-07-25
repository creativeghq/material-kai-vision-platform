/**
 * Sub-Agent Tools: createResearchAnalysisTool, createAnalyticsAnalysisTool,
 * createBusinessAnalysisTool, createProductAnalysisTool
 */

const { tool } = await import('npm:@langchain/core@1.1.15/tools');
const { z } = await import('npm:zod@3.24.0');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@1.3.10');
const { createClient } = await import('npm:@supabase/supabase-js@2');

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Import createSearchTool from search-tools (needed by research/business/product sub-agents)
import { createSearchTool } from './search-tools.ts';
import { reserveCredits, refundCredits, settleCredits } from '../credit-reserve.ts';

// Reserve ceiling for one Opus 4.8 sub-agent pass (~$0.40; credits = billed_usd * 100).
// The exact usage is settled back after the call.
const SUB_AGENT_CEILING = 40;

/**
 * Log Anthropic Opus 4.7 usage to ai_usage_logs for cost attribution + debit credits.
 * Sub-agent tools (research/analytics/business/product) all run an Opus 4.7
 * inference; without this each call silently absorbs $0.05-0.30 of platform cost.
 */
async function logSubAgentUsage(opName: string, response: any, userId: string | undefined, workspaceId: string | undefined, reservedCredits: number, extra: Record<string, unknown> = {}): Promise<void> {
  try {
    const usage = response?.usage_metadata
      ?? response?.response_metadata?.usage
      ?? {};
    const inputTokens = usage.input_tokens ?? usage.inputTokens ?? 0;
    const outputTokens = usage.output_tokens ?? usage.outputTokens ?? 0;
    if (inputTokens === 0 && outputTokens === 0) {
      // No usage reported — release the whole reservation rather than keep it.
      await refundCredits(supabase, userId, workspaceId, reservedCredits, opName, { reason: 'no_usage' });
      return;
    }

    const inputCost = (inputTokens / 1_000_000) * 15.00; // Opus 4.8 input
    const outputCost = (outputTokens / 1_000_000) * 75.00; // Opus 4.8 output
    const rawCost = inputCost + outputCost;
    const billedCost = rawCost * 1.50;
    const creditsToDebit = Math.round(billedCost * 100 * 100) / 100;

    // Settle the reservation against the real cost (refund surplus, or debit overage).
    await settleCredits(supabase, userId, workspaceId, reservedCredits, creditsToDebit, opName, { ...extra, workspace_id: workspaceId });
    await supabase.from('ai_usage_logs').insert({
      user_id: userId ?? null,
      operation_type: opName,
      model_name: 'claude-opus-4-8',
      api_provider: 'anthropic',
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      input_cost_usd: inputCost,
      output_cost_usd: outputCost,
      raw_cost_usd: rawCost,
      markup_multiplier: 1.5,
      billed_cost_usd: billedCost,
      credits_debited: userId ? creditsToDebit : 0,
      metadata: { feature: 'sub_agent', sub_feature: opName, workspace_id: workspaceId, ...extra },
      created_at: new Date().toISOString(),
    });
  } catch (logErr) {
    console.warn(`[${opName}] cost log failed:`, logErr);
  }
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

// ============================================================================
// SUB-AGENT TOOLS FOR INSIGHTS AGENT
// These tools allow the Insights Agent to delegate to specialized analysis
// ============================================================================

/**
 * Sub-Agent Tool: Research Analysis
 * Performs deep research and analysis on materials and industry trends
 */
export const createResearchAnalysisTool = (workspaceId: string, userId?: string) => {
  return tool(
    async ({ query, context }) => {
      try {
        const startTime = Date.now();

        // Load research agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('research');

        // Create a mini-agent execution with research context
        const researchModel = new ChatAnthropic({
          model: 'claude-opus-4-8',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Research agent has access to material_search
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = researchModel.bindTools([searchTool]);

        // Gate BEFORE the Opus call: reserve a ceiling, block a 0-credit user, settle actual after.
        const reserve = await reserveCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'research_analysis');
        if (!reserve.ok) return reserve.message;
        let response;
        try {
          response = await modelWithTools.invoke([
            { role: 'user', content: `${context ? `Context: ${context}\n\n` : ''}Research query: ${query}` }
          ], { system: systemPrompt });
        } catch (e) {
          await refundCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'research_analysis', { reason: 'ai_call_failed' });
          throw e;
        }

        await logSubAgentUsage('research_analysis', response, userId, workspaceId, SUB_AGENT_CEILING, { query: query.slice(0, 200) });

        const elapsed = Date.now() - startTime;

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
export const createAnalyticsAnalysisTool = (userId?: string, workspaceId?: string) => {
  return tool(
    async ({ query, dataType, timeRange }) => {
      try {
        const startTime = Date.now();

        // Load analytics agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('analytics');

        const analyticsModel = new ChatAnthropic({
          model: 'claude-opus-4-8',
          temperature: 0.5,
          maxTokens: 2048,
        });

        // Gate BEFORE the Opus call: reserve a ceiling, block a 0-credit user, settle actual after.
        const reserve = await reserveCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'analytics_analysis');
        if (!reserve.ok) return reserve.message;
        // Analytics agent doesn't have tools - pure reasoning
        let response;
        try {
          response = await analyticsModel.invoke([
            { role: 'user', content: `Data type: ${dataType || 'general'}\nTime range: ${timeRange || 'all'}\nAnalysis request: ${query}` }
          ], { system: systemPrompt });
        } catch (e) {
          await refundCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'analytics_analysis', { reason: 'ai_call_failed' });
          throw e;
        }

        await logSubAgentUsage('analytics_analysis', response, userId, workspaceId, SUB_AGENT_CEILING, { data_type: dataType, time_range: timeRange });

        const elapsed = Date.now() - startTime;

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
export const createBusinessAnalysisTool = (workspaceId: string, userId?: string) => {
  return tool(
    async ({ query, focus }) => {
      try {
        const startTime = Date.now();

        // Load business agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('business');

        const businessModel = new ChatAnthropic({
          model: 'claude-opus-4-8',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Business agent has access to material_search for market data
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = businessModel.bindTools([searchTool]);

        // Gate BEFORE the Opus call: reserve a ceiling, block a 0-credit user, settle actual after.
        const reserve = await reserveCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'business_analysis');
        if (!reserve.ok) return reserve.message;
        let response;
        try {
          response = await modelWithTools.invoke([
            { role: 'user', content: `Focus area: ${focus || 'general'}\nBusiness question: ${query}` }
          ], { system: systemPrompt });
        } catch (e) {
          await refundCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'business_analysis', { reason: 'ai_call_failed' });
          throw e;
        }

        await logSubAgentUsage('business_analysis', response, userId, workspaceId, SUB_AGENT_CEILING, { focus });

        const elapsed = Date.now() - startTime;

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
export const createProductAnalysisTool = (workspaceId: string, userId?: string) => {
  return tool(
    async ({ query, productCategory }) => {
      try {
        const startTime = Date.now();

        // Load product agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('product');

        const productModel = new ChatAnthropic({
          model: 'claude-opus-4-8',
          temperature: 0.7,
          maxTokens: 2048,
        });

        // Product agent has access to material_search for catalog queries
        const searchTool = createSearchTool(workspaceId);
        const modelWithTools = productModel.bindTools([searchTool]);

        // Gate BEFORE the Opus call: reserve a ceiling, block a 0-credit user, settle actual after.
        const reserve = await reserveCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'product_analysis');
        if (!reserve.ok) return reserve.message;
        let response;
        try {
          response = await modelWithTools.invoke([
            { role: 'user', content: `Product category: ${productCategory || 'all'}\nProduct question: ${query}` }
          ], { system: systemPrompt });
        } catch (e) {
          await refundCredits(supabase, userId, workspaceId, SUB_AGENT_CEILING, 'product_analysis', { reason: 'ai_call_failed' });
          throw e;
        }

        await logSubAgentUsage('product_analysis', response, userId, workspaceId, SUB_AGENT_CEILING, { product_category: productCategory });

        const elapsed = Date.now() - startTime;

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
