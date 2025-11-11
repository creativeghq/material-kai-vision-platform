import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');

  return new Response(
    JSON.stringify({
      hasKey: !!anthropicKey,
      keyLength: anthropicKey?.length || 0,
      keyPrefix: anthropicKey?.substring(0, 15) || 'MISSING',
      allEnvKeys: Object.keys(Deno.env.toObject()),
    }),
    {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  );
});

