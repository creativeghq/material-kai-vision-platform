/**
 * 3D Generation - AI-Powered Interior Design
 *
 * TEMPORARY STUB: This function is currently disabled due to missing Mastra dependencies.
 * The function uses Mastra framework functions (createTool, createAgent, createStep, createWorkflow)
 * that are not available in Deno edge runtime.
 *
 * TODO: Either:
 * 1. Rewrite using pure LangChain.js (no Mastra)
 * 2. Import Mastra package if available for Deno
 * 3. Use the existing crewai-3d-generation function instead
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Main handler - Returns error message indicating function is disabled
 */
serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const request = await req.json();

    console.error('⚠️ mastra-3d-generation called but is currently disabled');
    console.error('Request:', request);

    return new Response(
      JSON.stringify({
        success: false,
        error: 'Function temporarily disabled',
        details: 'This function uses Mastra framework which is not available in Deno edge runtime. Please use crewai-3d-generation instead.',
        alternative: 'Use the crewai-3d-generation edge function for 3D interior generation.',
      }),
      {
        status: 503,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('❌ Error in mastra-3d-generation stub:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
