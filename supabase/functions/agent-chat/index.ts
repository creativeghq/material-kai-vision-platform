/**
 * Agent Chat - MINIMAL DIAGNOSTIC VERSION
 * Testing basic Edge Function without LangChain
 */

// CORS headers inline to avoid any import issues
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

console.log('🚀 Agent-chat minimal version starting...');

// Test environment variables
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');

console.log('📋 Environment check:', {
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
  hasSupabaseUrl: !!SUPABASE_URL,
});

Deno.serve(async (req) => {
  console.log('📥 Request received:', req.method, req.url);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('✅ Returning CORS preflight response');
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Return diagnostic info
  return new Response(JSON.stringify({
    status: 'ok',
    message: 'Minimal agent-chat is working!',
    diagnostics: {
      hasAnthropicKey: !!ANTHROPIC_API_KEY,
      hasSupabaseUrl: !!SUPABASE_URL,
      timestamp: new Date().toISOString(),
    }
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
