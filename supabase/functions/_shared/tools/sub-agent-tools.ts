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
export const createResearchAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, context }) => {
      try {
        const startTime = Date.now();

        // Load research agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('research');

        // Create a mini-agent execution with research context
        const researchModel = new ChatAnthropic({
          model: 'claude-sonnet-4-6',
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
export const createAnalyticsAnalysisTool = () => {
  return tool(
    async ({ query, dataType, timeRange }) => {
      try {
        const startTime = Date.now();

        // Load analytics agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('analytics');

        const analyticsModel = new ChatAnthropic({
          model: 'claude-sonnet-4-6',
          temperature: 0.5,
          maxTokens: 2048,
        });

        // Analytics agent doesn't have tools - pure reasoning
        const response = await analyticsModel.invoke([
          { role: 'user', content: `Data type: ${dataType || 'general'}\nTime range: ${timeRange || 'all'}\nAnalysis request: ${query}` }
        ], { system: systemPrompt });

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
export const createBusinessAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, focus }) => {
      try {
        const startTime = Date.now();

        // Load business agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('business');

        const businessModel = new ChatAnthropic({
          model: 'claude-sonnet-4-6',
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
export const createProductAnalysisTool = (workspaceId: string) => {
  return tool(
    async ({ query, productCategory }) => {
      try {
        const startTime = Date.now();

        // Load product agent's system prompt from database
        const systemPrompt = await getAgentSystemPrompt('product');

        const productModel = new ChatAnthropic({
          model: 'claude-sonnet-4-6',
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
