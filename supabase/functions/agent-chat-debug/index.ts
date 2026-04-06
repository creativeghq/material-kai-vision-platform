/**
 * agent-chat-debug: Minimal function that does the same imports as agent-chat
 * Deploy, then: curl https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat-debug
 * The response body will show exactly which import crashes.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const steps: string[] = [];

try {
  steps.push('1. env vars OK');

  // --- Static imports that agent-chat uses (replicated as dynamic for diagnosis) ---
  await import('../_shared/credit-utils.ts');
  steps.push('2. credit-utils OK');

  await import('../_shared/prompt-utils.ts');
  steps.push('3. prompt-utils OK');

  await import('../_shared/langgraph-core.ts');
  steps.push('4. langgraph-core OK');

  await import('../_shared/cors.ts');
  steps.push('5. cors OK');

  await import('../_shared/auth.ts');
  steps.push('6. auth OK');

  await import('../_shared/skills-loader.ts');
  steps.push('7. skills-loader OK');

  await import('../_shared/flow-events.ts');
  steps.push('8. flow-events OK');

  await import('../_shared/tools/search-tools.ts');
  steps.push('9. search-tools OK');

  await import('../_shared/tools/generation-tools.ts');
  steps.push('10. generation-tools OK');

  await import('../_shared/tools/ops-tools.ts');
  steps.push('11. ops-tools OK');

  await import('../_shared/tools/database-tools.ts');
  steps.push('12. database-tools OK');

  await import('../_shared/tools/sub-agent-tools.ts');
  steps.push('13. sub-agent-tools OK');

  await import('../_shared/tools/b2b-tools.ts');
  steps.push('14. b2b-tools OK');

  await import('../_shared/tools/seo-tools.ts');
  steps.push('15. seo-tools OK');

  await import('../_shared/tools/background-tools.ts');
  steps.push('16. background-tools OK');

  await import('../_shared/api-logger.ts');
  steps.push('17. api-logger OK');

  // npm packages
  await import('npm:@supabase/supabase-js@2');
  steps.push('18. supabase-js OK');

  await import('npm:@langchain/anthropic@1.3.10');
  steps.push('19. langchain-anthropic OK');

  await import('npm:@langchain/core@1.1.15/tools');
  steps.push('20. langchain-core/tools OK');

  await import('npm:zod@3.24.0');
  steps.push('21. zod OK');

  await import('npm:@langchain/langgraph@1.1.3');
  steps.push('22. langchain-langgraph OK');

  await import('npm:@langchain/core@1.1.15/messages');
  steps.push('23. langchain-core/messages OK');

  steps.push('ALL IMPORTS OK');
} catch (err) {
  steps.push(`CRASH: ${err instanceof Error ? err.message : String(err)}`);
  steps.push(`Stack: ${err instanceof Error ? err.stack : 'N/A'}`);
}

const bootResult = steps.join('\n');
console.log('Boot result:\n' + bootResult);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  return new Response(JSON.stringify({ steps, bootResult }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
