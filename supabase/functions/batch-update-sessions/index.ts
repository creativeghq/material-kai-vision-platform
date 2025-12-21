import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BatchUpdateRequest {
  sessionIds: string[];
  fieldMappings: any;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('authorization');
    if (!authHeader) throw new Error('No authorization header');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Authentication failed');

    const { sessionIds, fieldMappings }: BatchUpdateRequest = await req.json();

    if (!sessionIds || sessionIds.length === 0) {
      throw new Error('No session IDs provided');
    }

    if (!fieldMappings) {
      throw new Error('Field mappings are required');
    }

    // Update all sessions with the new field mappings
    const { data, error } = await supabase
      .from('scraping_sessions')
      .update({ field_mappings: fieldMappings })
      .in('id', sessionIds)
      .select('id');

    if (error) throw error;

    return new Response(
      JSON.stringify({
        success: true,
        updated: data?.length || 0,
        sessionIds: data?.map((s) => s.id) || [],
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error batch updating sessions:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to update sessions',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

