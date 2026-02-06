/**
 * Agent Chat - DIAGNOSTIC VERSION 4
 * Testing LangGraph import
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

console.log('🚀 Agent-chat v4 starting...');

// Test environment variables
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

// Set up process.env polyfill for LangChain
(globalThis as any).process = {
  env: {
    ANTHROPIC_API_KEY: ANTHROPIC_API_KEY
  }
};

console.log('📋 Environment check:', {
  hasAnthropicKey: !!ANTHROPIC_API_KEY,
  hasSupabaseUrl: !!SUPABASE_URL,
  hasSupabaseKey: !!SUPABASE_SERVICE_ROLE_KEY,
});

// Test imports
console.log('📦 Importing Supabase client...');
const { createClient } = await import('npm:@supabase/supabase-js@2');
console.log('✅ Supabase client imported');

console.log('📦 Importing LangChain Anthropic...');
const { ChatAnthropic } = await import('npm:@langchain/anthropic@0.3.0');
console.log('✅ LangChain Anthropic imported');

console.log('📦 Importing LangGraph...');
const { StateGraph, Annotation, END, START } = await import('npm:@langchain/langgraph@0.2.0');
console.log('✅ LangGraph imported');

console.log('📦 Importing LangChain core messages...');
const { BaseMessage, HumanMessage, AIMessage } = await import('npm:@langchain/core@0.3.0/messages');
console.log('✅ LangChain core messages imported');

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
console.log('✅ All imports successful');

Deno.serve(async (req) => {
  console.log('📥 Request received:', req.method, req.url);

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  return new Response(JSON.stringify({
    status: 'ok',
    message: 'LangGraph + all imports working!',
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
