// Test Edge Function to check environment variables
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  try {
    // Get all environment variables
    const allEnvKeys = Object.keys(Deno.env.toObject());
    
    // Get ANTHROPIC_API_KEY specifically
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    
    // Detailed analysis
    const result = {
      timestamp: new Date().toISOString(),
      allEnvKeys: allEnvKeys.sort(),
      anthropicKey: {
        exists: anthropicKey !== undefined && anthropicKey !== null,
        isEmptyString: anthropicKey === '',
        length: anthropicKey?.length || 0,
        type: typeof anthropicKey,
        value: anthropicKey, // Show actual value for debugging
        prefix: anthropicKey?.substring(0, 15) || 'none',
      },
      // Check other API keys for comparison
      otherKeys: {
        OPENAI_API_KEY: {
          exists: !!Deno.env.get('OPENAI_API_KEY'),
          length: Deno.env.get('OPENAI_API_KEY')?.length || 0,
        },
        SUPABASE_URL: {
          exists: !!Deno.env.get('SUPABASE_URL'),
          length: Deno.env.get('SUPABASE_URL')?.length || 0,
        },
        MIVAA_GATEWAY_URL: {
          exists: !!Deno.env.get('MIVAA_GATEWAY_URL'),
          length: Deno.env.get('MIVAA_GATEWAY_URL')?.length || 0,
        },
      },
    };

    return new Response(JSON.stringify(result, null, 2), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      }),
      {
        headers: { 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

