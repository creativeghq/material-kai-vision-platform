// Unified SEO API — single function, action routing.
// Body: { action: 'research' | 'plan' | 'write' | 'analyze' | 'pipeline'
//                | 'toolkit_audit' | 'toolkit_research', ...params }

import { corsHeaders } from '../_shared/cors.ts';
import { withApiLogging } from '../_shared/api-logger.ts';
import { handleAnalyze } from './handlers/analyze.ts';
import { handlePlan } from './handlers/plan.ts';
import { handleResearch } from './handlers/research.ts';
import { handleWrite } from './handlers/write.ts';
import { handlePipeline } from './handlers/pipeline.ts';
import { handleToolkitAudit } from './handlers/toolkit-audit.ts';
import { handleToolkitResearch } from './handlers/toolkit-research.ts';
import { handleApplyFix, handleRevertFix } from './handlers/apply-fix.ts';
import { handleReanalyze } from './handlers/reanalyze.ts';
import { handleAddFaq } from './handlers/faq.ts';
import { handlePageIdeas } from './handlers/page-ideas.ts';

const ROUTES: Record<string, (req: Request, body: any) => Promise<Response>> = {
  research: handleResearch,
  plan: handlePlan,
  write: handleWrite,
  analyze: handleAnalyze,
  pipeline: handlePipeline,
  toolkit_audit: handleToolkitAudit,
  toolkit_research: handleToolkitResearch,
  page_ideas: handlePageIdeas,
  apply_fix: handleApplyFix,
  revert_fix: handleRevertFix,
  reanalyze: handleReanalyze,
  add_faq: handleAddFaq,
};

Deno.serve(withApiLogging('seo-api', async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const handler = ROUTES[body?.action];
  if (!handler) {
    return new Response(JSON.stringify({
      success: false,
      error: `Unknown action '${body?.action}'. Available: ${Object.keys(ROUTES).join(', ')}`,
    }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return handler(req, body);
}));
