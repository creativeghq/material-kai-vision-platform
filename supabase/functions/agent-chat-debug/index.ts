/**
 * agent-chat-debug v2: Replicate agent-chat's exact import pattern
 * Uses STATIC imports (like agent-chat) not dynamic ones
 */

// Phase 1: env vars (same as agent-chat)
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

if (!ANTHROPIC_API_KEY) {
  throw new Error('ANTHROPIC_API_KEY must be set');
}

if (!(globalThis as any).process) {
  (globalThis as any).process = { env: {} };
}
(globalThis as any).process.env.ANTHROPIC_API_KEY = ANTHROPIC_API_KEY;

// Phase 2: STATIC imports — exactly like agent-chat
import { debitExternalServiceCredits, checkCreditBalance } from '../_shared/credit-utils.ts';
import { getToolPrompt } from '../_shared/prompt-utils.ts';
import { extractTextContent } from '../_shared/langgraph-core.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { getSkillsForAgent, getSkillContent } from '../_shared/skills-loader.ts';
import { emitFlowEvent } from '../_shared/flow-events.ts';
import { createSearchTool, createVisualSearchTool, createKnowledgeBaseSearchTool, createInspirationUrlTool } from '../_shared/tools/search-tools.ts';
import { create3DGenerationTool, createGeminiGenerationTool, createVirtualStagingTool, createGenerationStatusTool } from '../_shared/tools/generation-tools.ts';
import { createCheckServerHealthTool, createQuerySentryTool, createCostEstimationTool } from '../_shared/tools/ops-tools.ts';
import { createQueryDatabaseTool } from '../_shared/tools/database-tools.ts';
import { createResearchAnalysisTool, createAnalyticsAnalysisTool, createBusinessAnalysisTool, createProductAnalysisTool } from '../_shared/tools/sub-agent-tools.ts';
import { createB2BManufacturerSearchTool, createCompanyWebsiteScrapeTool, createCompanyEnrichmentTool, createContactDiscoveryTool, createEmailValidateTool, createSaveToCRMTool } from '../_shared/tools/b2b-tools.ts';
import { createSEOKeywordResearchTool, createSEOArticlePlannerTool, createSEOArticleWriterTool, createSEOContentAnalyzerTool, createSEOPipelineTool } from '../_shared/tools/seo-tools.ts';
import { createDispatchBackgroundTaskTool } from '../_shared/tools/background-tools.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

// Phase 3: Dynamic imports — exactly like agent-chat
const { createClient } = await import('@supabase/supabase-js');
const { ChatAnthropic } = await import('@langchain/anthropic');
const { tool } = await import('@langchain/core/tools');
const { z } = await import('zod');
const { StateGraph, Annotation, END, START } = await import('@langchain/langgraph');
const { BaseMessage, HumanMessage, AIMessage, SystemMessage } = await import('@langchain/core/messages');

// Phase 4: Top-level code — exactly like agent-chat
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

let modelHaiku: ChatAnthropic;
let modelSonnet: ChatAnthropic;
try {
  modelHaiku = new ChatAnthropic({
    model: 'claude-haiku-4-5-20251001',
    temperature: 0.7,
    maxTokens: 4096,
  });
  modelSonnet = new ChatAnthropic({
    model: 'claude-sonnet-4-6-20260217',
    temperature: 1,
    maxTokens: 4096,
  });
} catch (error) {
  console.error('Model init failed:', error);
  throw error;
}

console.log('✅ agent-chat-debug booted successfully');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(JSON.stringify({
    status: 'ok',
    message: 'All imports + top-level code executed successfully',
    hasSearchTool: typeof createSearchTool === 'function',
    hasInspirationTool: typeof createInspirationUrlTool === 'function',
    hasWithApiLogging: typeof withApiLogging === 'function',
    models: { haiku: !!modelHaiku, sonnet: !!modelSonnet },
  }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
