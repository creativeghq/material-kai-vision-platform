import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

serve(async (req) => {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  
  return new Response(
    JSON.stringify({
      hasKey: !!anthropicKey,
      keyLength: anthropicKey?.length || 0,
      keyPrefix: anthropicKey?.substring(0, 15) || 'MISSING',
      allEnvKeys: Object.keys(Deno.env.toObject()),
    }),
    {
      headers: { 'Content-Type': 'application/json' },
    }
  );
});

